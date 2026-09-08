// server/lib/textExtraction.js
//
// Extracts plain text from a candidate document LOCALLY — i.e. entirely on
// this Render instance, before anything is sent to any third-party API.
// This is the step that makes redaction possible: you can't reliably scrub
// a name/address out of a raw PDF/image, but you can scrub it out of the
// text pulled from it.
//
// Runs entirely on Render's standard Node runtime — no Dockerfile, no apt
// packages, no system binaries. Every extraction path uses a pure-JS or
// prebuilt-native-binary npm package:
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
//     no OCR'd text underneath) ARE handled: pdfjs-dist (Mozilla's PDF
//     engine, pure JS) renders each page onto an in-memory canvas provided
//     by @napi-rs/canvas, then the resulting PNG is run through the same
//     tesseract.js OCR used for image uploads. @napi-rs/canvas ships a
//     prebuilt native binary per platform (installed as a normal npm
//     dependency, same mechanism as e.g. `sharp`) — no system libraries,
//     no apt-get, no Dockerfile required. Capped at MAX_RASTERIZE_PAGES
//     pages so a pathologically long scanned PDF can't block a request
//     indefinitely; if OCR still comes up empty (blank pages, unreadable
//     scan), the document is flagged "insufficient" same as any other
//     unrecoverable case.

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
import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchDriveFile } from './googleDrive.js';

// pdfjs-dist needs a filesystem path to its bundled standard font data to
// render pages correctly when a PDF's fonts aren't fully embedded. Resolved
// once at startup via the installed package location — no network fetch.
const require = createRequire(import.meta.url);
const STANDARD_FONT_DATA_URL =
  path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;

// Vendored Tesseract language data (server/tessdata/eng.traineddata.gz).
// By default tesseract.js has NO local copy of this — it fetches it from
// the jsdelivr CDN on every worker init. That's harmless on a stable
// long-running server (fetched once, kept in memory for the process
// lifetime), but on Render it becomes a runaway cost driver: every OOM
// restart wipes the ephemeral filesystem and spins up a fresh process,
// which re-downloads this file from scratch before it can OCR anything.
// A crash-retry loop can redownload it a dozen times in an hour. Pointing
// langPath at a local directory makes tesseract.js read the file straight
// off disk instead — no network call, ever, regardless of restarts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_TESSDATA_PATH = path.join(__dirname, '..', 'tessdata');

const MIN_USABLE_CHARS = 40; // below this, treat as "nothing usable extracted"

// Safety cap on scanned-PDF rasterization: OCR-ing page-by-page is slow, and
// a request handling several candidates' documents at once needs a bound so
// one pathologically long scanned PDF can't stall the whole batch. 15 pages
// covers essentially every real credential/certificate document; anything
// beyond that still gets whatever the first 15 pages yielded rather than
// nothing.
const MAX_RASTERIZE_PAGES = 15;

// Render scale relative to a PDF's native 72dpi page unit. Previously
// 200/72 ≈ 2.78, matching the old poppler-based (-r 200) approach — but at
// that scale a single letter-size page renders to roughly 2340x3030px,
// and each in-flight page (canvas + PNG buffer + OCR working memory) can
// approach 100MB+. Combined with processing multiple documents at once,
// that's what was pushing a 512MB instance over the edge. 150/72 ≈ 2.08
// cuts pixel count by roughly 44% versus the old value while staying well
// above the ~150-200dpi floor Tesseract needs for reliable OCR.
const RASTER_SCALE = 150 / 72;

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp', 'image/tiff'
]);

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel' // legacy .xls — SheetJS reads this too
]);

// Small, FIXED-size pool of persistent OCR workers. A single worker means
// every page/image OCR job queues up behind the one before it — safe, but
// slow, and "safe but slow" is what turned a 90s client timeout into a
// real problem once documents started being processed one at a time
// instead of all at once. Two workers let two pages (within the SAME
// document) OCR concurrently, which is a bounded, predictable memory cost
// (each worker keeps its own ~5MB language model + WASM heap resident for
// the life of the process) — very different from the unbounded "N whole
// documents in flight at once" pattern that caused the original OOM.
// Different DOCUMENTS are still always processed strictly one at a time
// (see fetchAndExtractDriveDocs) — this pool only parallelizes pages
// *inside* whichever single document is currently being OCR'd.
const OCR_POOL_SIZE = 2;
let ocrWorkerPoolPromise = null;
function getOcrWorkerPool() {
  if (!ocrWorkerPoolPromise) {
    ocrWorkerPoolPromise = Promise.all(
      Array.from({ length: OCR_POOL_SIZE }, () => createWorker('eng', undefined, {
        langPath: LOCAL_TESSDATA_PATH,
        // Nothing was downloaded, so there's nothing worth writing back to a
        // (nonexistent, ephemeral) cache — skip the cache-write attempt.
        cacheMethod: 'none',
        gzip: true
      }))
    );
  }
  return ocrWorkerPoolPromise;
}

// Call this once at server shutdown if you want a clean exit; harmless to
// skip since Render just kills the process on redeploy anyway.
export async function terminateOcrWorker() {
  if (ocrWorkerPoolPromise) {
    const workers = await ocrWorkerPoolPromise;
    await Promise.all(workers.map(w => w.terminate()));
    ocrWorkerPoolPromise = null;
  }
}

// pdfjs-dist v4+ throws when `data` is a Node Buffer instead of a plain
// Uint8Array (Buffer IS a Uint8Array subclass, but pdfjs-dist explicitly
// rejects the subclass) — this was silently breaking every scanned PDF that
// fell through to OCR rasterization, surfacing to the Secretariat as
// "Please provide binary data as `Uint8Array`, rather than `Buffer`."
// Wrapping the same underlying memory in a plain Uint8Array (no copy) fixes
// it without touching the bytes.
function toUint8Array(buffer) {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

async function extractFromPdf(buffer) {
  const { text } = await pdfParse(buffer);
  return (text || '').trim();
}

async function extractFromImage(buffer) {
  const [worker] = await getOcrWorkerPool();
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

// Rasterizes a scanned (text-layer-less) PDF page-by-page using pdfjs-dist
// (renders onto an in-memory @napi-rs/canvas canvas — no temp files, no
// child process) and OCRs each resulting page image with the tesseract.js
// worker pool used for direct image uploads.
//
// Pages are processed in chunks of OCR_POOL_SIZE (currently 2) — each
// chunk renders + OCRs that many pages concurrently, one page per worker,
// then moves to the next chunk. That roughly halves wall-clock time for a
// multi-page scanned document versus doing every page fully sequentially,
// while keeping the number of full-page canvas+PNG buffers in memory at
// once bounded by the pool size rather than by how many pages the PDF has.
async function rasterizeAndOcrPdf(buffer) {
  const loadingTask = getDocument({
    data: toUint8Array(buffer),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    disableFontFace: true,
    verbosity: VerbosityLevel.ERRORS
  });

  let pdfDoc;
  try {
    pdfDoc = await loadingTask.promise;
    const pool = await getOcrWorkerPool();
    const pageCount = Math.min(pdfDoc.numPages, MAX_RASTERIZE_PAGES);
    const pageTexts = new Array(pageCount).fill('');

    const renderAndOcrPage = async (pageNum, worker) => {
      const page = await pdfDoc.getPage(pageNum);
      try {
        const viewport = page.getViewport({ scale: RASTER_SCALE });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        const pngBuffer = canvas.toBuffer('image/png');
        const { data } = await worker.recognize(pngBuffer);
        pageTexts[pageNum - 1] = (data?.text || '').trim();
      } finally {
        page.cleanup();
      }
    };

    for (let start = 1; start <= pageCount; start += pool.length) {
      const chunk = [];
      for (let i = 0; i < pool.length && start + i <= pageCount; i++) {
        chunk.push(renderAndOcrPage(start + i, pool[i]));
      }
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(chunk);
    }

    return pageTexts.filter(Boolean).join('\n\n').trim();
  } finally {
    if (pdfDoc) await pdfDoc.destroy();
    else await loadingTask.destroy();
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

// Runs extraction over every already-fetched file ONE AT A TIME, tolerating
// individual failures the same way fetchAndExtractDriveDocs (below) does.
//
// This used to be Promise.all(files.map(extractTextFromFile)) — running
// every document for a candidate concurrently. That's fine for a plain
// text-layer PDF (cheap, fast), but any scanned document falls through to
// rasterizeAndOcrPdf(), which holds full-page canvas + PNG buffers in
// memory per in-flight document. A candidate with 3-4 scanned documents
// could have 3-4 of those pipelines running at once, which is what was
// pushing the process over Render's 512MB limit and triggering the
// OOM-kill/restart/retry loop.
//
// NOTE: this function alone is no longer enough — see
// fetchAndExtractDriveDocs() below for why. Kept here (unused internally,
// but still exported) in case anything downstream wants to extract text
// from files it already has fully in memory for some other reason.
export async function extractTextFromFiles(files) {
  const results = [];
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await extractTextFromFile(file));
  }
  const usable = results.filter(r => !r.insufficient);
  const insufficient = results.filter(r => r.insufficient);
  return { usable, insufficient };
}

// Fetches each candidate document from Google Drive AND extracts its text,
// one document at a time, before moving on to the next.
//
// The sequential-OCR fix above (extractTextFromFiles processing one file
// at a time) turned out not to be sufficient on its own: the previous
// pipeline still called fetchDriveFiles() first, which downloaded EVERY
// document for a candidate in parallel via Promise.allSettled, holding
// each one in memory as both a raw arraybuffer and a base64 string, all
// at once, before extraction even started. So the OOM was already
// happening at download time — one step before the sequential-extraction
// fix could ever run.
//
// This function interleaves fetch and extract per document instead:
// download doc 1 -> extract doc 1 -> let its bytes/base64 be GC'd ->
// download doc 2 -> extract doc 2 -> ... That way only one document's
// raw bytes + base64 + (if applicable) rasterization/OCR memory is ever
// resident at once, no matter how many documents a candidate has. Pages
// *within* a scanned document still OCR with limited concurrency (see the
// worker pool above) to keep this from being needlessly slow.
//
// `docs` is an array of { key, label, url }.
// `onProgress(current, total, label)`, if given, is called after each
// document finishes (fetch failure or not) — this is what lets the
// ai-evaluate job report real, checkpoint-based progress instead of an
// indefinite spinner.
// Returns:
//   - usable: extraction results with enough text to use
//   - insufficient: extraction results flagged as not usable
//   - driveErrors: [{ key, label, message }] for documents that couldn't
//     even be downloaded (missing/unshared/deleted/etc.)
export async function fetchAndExtractDriveDocs(docs, onProgress) {
  const usable = [];
  const insufficient = [];
  const driveErrors = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    let file;
    try {
      // eslint-disable-next-line no-await-in-loop
      file = await fetchDriveFile(doc.url);
    } catch (err) {
      driveErrors.push({
        key: doc.key,
        label: doc.label,
        message: err.message || 'Failed to fetch document'
      });
      if (onProgress) onProgress(i + 1, docs.length, doc.label);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const result = await extractTextFromFile({ ...doc, ...file });
    // `file` (raw arraybuffer + base64 string) is no longer referenced
    // after this point and its bytes are free to be garbage-collected
    // before the loop moves on to the next document.
    if (result.insufficient) {
      insufficient.push(result);
    } else {
      usable.push(result);
    }
    if (onProgress) onProgress(i + 1, docs.length, doc.label);
  }

  return { usable, insufficient, driveErrors };
}