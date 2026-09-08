// server/lib/textExtraction.js
//
// Extracts plain text from a candidate document LOCALLY — i.e. entirely on
// this Render instance, before anything is sent to any third-party API.
// This is the step that makes redaction possible: you can't reliably scrub
// a name/address out of a raw PDF/image, but you can scrub it out of the
// text pulled from it.
//
// Deliberately dependency-light so it works on Render's standard Node build
// (no Dockerfile, no apt packages, no system binaries like poppler/tesseract-cli):
//   - PDFs with a real text layer -> pdf-parse (pure JS, no native deps)
//   - Images (jpg/png/webp/etc.)  -> tesseract.js (WASM OCR, no native deps;
//                                    downloads its language data from a CDN
//                                    on first use, cached afterward — needs
//                                    outbound internet, which Render allows)
//   - Scanned PDFs with NO text layer (a photo of a document saved as PDF,
//     no OCR'd text underneath) are NOT rendered/OCR'd here. Doing that
//     reliably needs a PDF rasterizer (e.g. pdf-poppler / node-canvas),
//     which needs native system libraries that aren't guaranteed to be
//     present on Render's default Node runtime without a custom Dockerfile.
//     Rather than silently skip redaction on those, we flag them as
//     "insufficient" so the route can treat them as unavailable evidence —
//     same pattern already used for missing/unshared Drive files.

// NOTE: import the inner lib file, NOT the 'pdf-parse' package root.
// pdf-parse's own index.js has a debug-mode block that self-executes a
// bundled test PDF whenever `module.parent` is falsy — which is exactly
// what happens under ESM/dynamic import (there's no CJS `module.parent`).
// That crashes on Render with an ENOENT for its own test fixture. Importing
// lib/pdf-parse.js directly skips that block entirely.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { createWorker } from 'tesseract.js';

const MIN_USABLE_CHARS = 40; // below this, treat as "nothing usable extracted"

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp', 'image/tiff'
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
        // We deliberately do NOT attempt OCR here (see file header).
        return {
          key: file.key,
          label: file.label,
          name: file.name,
          text: '',
          method: 'pdf-no-text-layer',
          insufficient: true
        };
      }
    } else if (IMAGE_MIME_TYPES.has(file.mimeType)) {
      text = await extractFromImage(buffer);
      method = 'ocr';
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