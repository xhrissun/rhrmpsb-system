// server/lib/textExtraction.js
//
// Extracts plain text from a candidate document LOCALLY — i.e. entirely on
// this Render instance, before anything is sent to any third-party API.
// This is the step that makes redaction possible: you can't reliably scrub
// a name/address out of a raw PDF/image, but you can scrub it out of the
// text pulled from it.
//
// This runs on Render as a Docker service (see server/Dockerfile) rather
// than Render's default Node buildpack, specifically so `pdftoppm` (from
// the poppler-utils system package) is available for the scanned-PDF
// fallback below:
//   - PDFs with a real text layer -> pdf-parse (pure JS, no native deps)
//   - Images (jpg/png/webp/etc.)  -> tesseract.js (WASM OCR, no native deps;
//                                    downloads its language data from a CDN
//                                    on first use, cached afterward — needs
//                                    outbound internet, which Render allows)
//   - .docx (Word)                -> mammoth (pure JS, reads the underlying
//                                    XML directly — no native deps)
//   - .xlsx / .xls (Excel)        -> xlsx / SheetJS (pure JS). Every sheet is
//                                    flattened to CSV-style text and
//                                    concatenated, labeled by sheet name, so
//                                    Gemini sees tabular data as plain text.
//   - Legacy .doc (old binary Word format, not .docx) is NOT supported —
//     mammoth only reads the newer XML-based .docx format. Flagged
//     "insufficient" (see below).
//   - Scanned PDFs with NO text layer (a photo of a document saved as PDF,
//     no OCR'd text underneath) ARE now handled: each page is rasterized to
//     a PNG with `pdftoppm` (poppler-utils, installed via the Dockerfile),
//     then run through the same tesseract.js OCR used for image uploads.
//     This only runs a system binary on bytes already fetched from Drive —
//     nothing is sent anywhere external for this step. Capped at
//     MAX_RASTERIZE_PAGES pages so a pathologically long scanned PDF can't
//     block a request indefinitely; if OCR still comes up empty (blank
//     pages, unreadable scan), the document is flagged "insufficient" same
//     as any other unrecoverable case.

// NOTE: import the inner lib file, NOT the 'pdf-parse' package root.
// pdf-parse's own index.js has a debug-mode block that self-executes a
// bundled test PDF whenever `module.parent` is falsy — which is exactly
// what happens under ESM/dynamic import (there's no CJS `module.parent`).
// That crashes on Render with an ENOENT for its own test fixture. Importing
// lib/pdf-parse.js directly skips that block entirely.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { createWorker } from 'tesseract.js';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

const MIN_USABLE_CHARS = 40; // below this, treat as "nothing usable extracted"

// Safety cap on scanned-PDF rasterization: OCR-ing page-by-page is slow, and
// a request handling several candidates' documents at once needs a bound so
// one pathologically long scanned PDF can't stall the whole batch. 15 pages
// covers essentially every real credential/certificate document; anything
// beyond that still gets whatever the first 15 pages yielded rather than
// nothing.
const MAX_RASTERIZE_PAGES = 15;

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp', 'image/tiff'
]);

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel' // legacy .xls — SheetJS reads this too
]);

let ocrWorkerPromise = null;
function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('eng');
  }
  return ocrWorkerPromise;
}

// Call this once at server shutdown if you want a clean exit; harmless to
// skip since Render just kills the process on redeploy anyway.
export async function terminateOcrWorker() {
  if (ocrWorkerPromise) {
    const worker = await ocrWorkerPromise;
    await worker.terminate();
    ocrWorkerPromise = null;
  }
}

async function extractFromPdf(buffer) {
  const { text } = await pdfParse(buffer);
  return (text || '').trim();
}

async function extractFromImage(buffer) {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(buffer);
  return (data?.text || '').trim();
}

async function extractFromDocx(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return (value || '').trim();
}

function extractFromXlsx(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts = workbook.SheetNames.map(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet).trim();
    if (!csv) return '';
    return `--- Sheet: ${sheetName} ---\n${csv}`;
  }).filter(Boolean);
  return parts.join('\n\n').trim();
}

// Rasterizes a scanned (text-layer-less) PDF page-by-page with `pdftoppm`
// (poppler-utils, installed system-wide via the Dockerfile) and OCRs each
// resulting page image with the same tesseract.js worker used for direct
// image uploads. Everything happens in a per-call temp dir that's always
// cleaned up, even on failure.
async function rasterizeAndOcrPdf(buffer) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-rasterize-'));
  const pdfPath = path.join(tmpDir, 'input.pdf');
  const outPrefix = path.join(tmpDir, 'page');

  try {
    await fs.writeFile(pdfPath, buffer);

    // -png: PNG page images. -r 200: 200dpi — legible for OCR without being
    // needlessly huge. -f 1 -l MAX_RASTERIZE_PAGES: bound the page range.
    await execFileAsync('pdftoppm', [
      '-png', '-r', '200', '-f', '1', '-l', String(MAX_RASTERIZE_PAGES),
      pdfPath, outPrefix
    ]);

    const pageFiles = (await fs.readdir(tmpDir))
      .filter(f => f.startsWith('page') && f.endsWith('.png'))
      .sort(); // pdftoppm zero-pads page numbers, so lexical sort == page order

    const worker = await getOcrWorker();
    const pageTexts = [];
    for (const pageFile of pageFiles) {
      const imgBuffer = await fs.readFile(path.join(tmpDir, pageFile));
      const { data } = await worker.recognize(imgBuffer);
      const pageText = (data?.text || '').trim();
      if (pageText) pageTexts.push(pageText);
    }

    return pageTexts.join('\n\n').trim();
  } finally {
    // Best-effort cleanup — never let a temp-dir removal failure mask the
    // real OCR result or a real OCR error.
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Takes one fetched Drive file ({ name, mimeType, base64, ...doc }) and
// returns { key, label, name, text, insufficient, method }.
// Never throws for a bad/unsupported single document — a failure here
// should degrade that one document to "unavailable", not kill the whole
// evaluation.
export async function extractTextFromFile(file) {
  const buffer = Buffer.from(file.base64, 'base64');
  let text = '';
  let method = 'none';

  try {
    if (file.mimeType === 'application/pdf') {
      text = await extractFromPdf(buffer);
      method = 'pdf-text-layer';

      if (text.length < MIN_USABLE_CHARS) {
        // No/negligible text layer — likely a scanned image saved as PDF.
        // Fall back to rasterizing each page and OCR-ing it (see
        // rasterizeAndOcrPdf above). Only if that also comes up empty
        // (blank pages, unreadable scan) do we give up on this document.
        try {
          const ocrText = await rasterizeAndOcrPdf(buffer);
          if (ocrText.length >= MIN_USABLE_CHARS) {
            text = ocrText;
            method = 'pdf-rasterized-ocr';
          } else {
            return {
              key: file.key,
              label: file.label,
              name: file.name,
              text: '',
              method: 'pdf-no-text-layer',
              insufficient: true
            };
          }
        } catch (err) {
          return {
            key: file.key,
            label: file.label,
            name: file.name,
            text: '',
            method: 'pdf-rasterize-error',
            insufficient: true,
            error: err.message
          };
        }
      }
    } else if (IMAGE_MIME_TYPES.has(file.mimeType)) {
      text = await extractFromImage(buffer);
      method = 'ocr';
    } else if (file.mimeType === DOCX_MIME_TYPE) {
      text = await extractFromDocx(buffer);
      method = 'docx';
    } else if (XLSX_MIME_TYPES.has(file.mimeType)) {
      text = extractFromXlsx(buffer);
      method = 'xlsx';
    } else if (file.mimeType === 'application/msword') {
      // Legacy binary .doc — mammoth only reads the newer XML-based .docx.
      return {
        key: file.key,
        label: file.label,
        name: file.name,
        text: '',
        method: 'legacy-doc-unsupported',
        insufficient: true
      };
    } else {
      return {
        key: file.key,
        label: file.label,
        name: file.name,
        text: '',
        method: 'unsupported-mime-type',
        insufficient: true
      };
    }
  } catch (err) {
    return {
      key: file.key,
      label: file.label,
      name: file.name,
      text: '',
      method: 'extraction-error',
      insufficient: true,
      error: err.message
    };
  }

  const trimmed = text.trim();
  return {
    key: file.key,
    label: file.label,
    name: file.name,
    text: trimmed,
    method,
    insufficient: trimmed.length < MIN_USABLE_CHARS
  };
}

// Runs extraction over every fetched file in parallel, tolerating individual
// failures the same way fetchDriveFiles does.
export async function extractTextFromFiles(files) {
  const results = await Promise.all(files.map(extractTextFromFile));
  const usable = results.filter(r => !r.insufficient);
  const insufficient = results.filter(r => r.insufficient);
  return { usable, insufficient };
}