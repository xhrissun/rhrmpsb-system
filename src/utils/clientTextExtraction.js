// src/utils/clientTextExtraction.js
//
// Extracts text from a candidate document ENTIRELY IN THE BROWSER — the
// server never rasterizes a PDF page, never runs OCR, and never parses a
// docx/xlsx file for this feature anymore.
//
// This replaced a server-side pipeline (pdf-parse + pdfjs-dist +
// @napi-rs/canvas + tesseract.js) that kept crashing with out-of-memory
// errors on Render's 512MB instances, no matter how carefully that work
// was sequenced, chunked, or pooled — rendering a scanned page to a
// full-resolution canvas and running an OCR pass over it is just
// inherently memory-hungry, and there's a hard ceiling on how small you
// can make that on a shared 512MB box. The Secretariat user's own browser
// doesn't have that ceiling, and they're already authorized to view these
// documents directly (that's the whole point of the feature), so doing
// the same work there instead removes the risk at the source rather than
// trying to out-engineer it under a fixed memory budget.
//
// The server's only remaining role is proxying the raw bytes from Google
// Drive (only the service account can authenticate there) — see
// GET /candidates/:id/ai-evaluate/document/:jobId/:docKey in
// server/routes.js. Everything downstream of that happens here.

import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// Below this many characters, a "successful" extraction is treated as
// insufficient — usually means a scanned page with no real text layer, or
// an OCR pass that came back mostly blank.
const MIN_USABLE_CHARS = 40;
// A scanned PDF with more pages than this only gets its first N OCR'd —
// keeps a single huge document from making the whole evaluation crawl.
const MAX_RASTERIZE_PAGES = 15;
const RASTER_SCALE = 2;

// One persistent worker, reused across every document in a candidate's
// evaluation (and across candidates, for the lifetime of the tab) so the
// ~1-2s Tesseract init cost is only paid once per session, not once per
// document. Runs in the browser tab's own memory — nothing here is shared
// with or constrained by the server.
let ocrWorkerPromise = null;
function getOcrWorker() {
  if (!ocrWorkerPromise) {
    // No explicit workerPath/corePath/langPath override: tesseract.js's
    // browser build fetches its worker script, WASM core, and language
    // data from its default CDN (jsdelivr) automatically, the same way
    // pdfjs-dist's worker is loaded from cdnjs elsewhere in this app (see
    // src/lib/pdfParser.js) — this is the browser's own network request,
    // not the server's.
    ocrWorkerPromise = createWorker('eng');
  }
  return ocrWorkerPromise;
}

// Call this if you want to free the OCR worker's memory (e.g. when
// closing the evaluation modal) — harmless to skip, it's just a tab-local
// WASM instance that goes away when the page is closed anyway.
export async function terminateClientOcrWorker() {
  if (ocrWorkerPromise) {
    const worker = await ocrWorkerPromise;
    await worker.terminate();
    ocrWorkerPromise = null;
  }
}

async function extractPdfTextLayer(arrayBuffer) {
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  try {
    const pageTexts = [];
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      // eslint-disable-next-line no-await-in-loop
      const page = await pdfDoc.getPage(pageNum);
      // eslint-disable-next-line no-await-in-loop
      const content = await page.getTextContent();
      const pageText = reconstructLines(content.items);
      if (pageText) pageTexts.push(pageText);
      page.cleanup();
    }
    return pageTexts.join('\n\n').trim();
  } finally {
    await pdfDoc.destroy();
  }
}

// getTextContent() returns a flat list of text fragments with NO line-break
// information attached — the previous version joined every fragment on a
// page with a plain space, which silently flattened an entire page (e.g. a
// whole Letter of Intent, address block and body text alike) into a single
// line. That single collapsed "line" is what let redact.js's old per-line
// address filter wipe out an entire document's substance whenever an
// address appeared anywhere on the page — the redaction wasn't wrong given
// what it was handed, but what it was handed had already lost all
// structure. Reconstructing real lines here fixes the actual root cause
// (structure loss) rather than only patching the symptom in redact.js.
//
// Each text item carries a `transform` matrix; transform[5] is the
// fragment's baseline Y position in PDF space (origin bottom-left, Y
// increases upward). Fragments whose baselines land within Y_TOLERANCE of
// each other are treated as the same visual line, then lines are ordered
// top-to-bottom and fragments within a line left-to-right by X position.
const LINE_Y_TOLERANCE = 2;

function reconstructLines(items) {
  if (!items.length) return '';
  const lines = [];
  for (const item of items) {
    const y = item.transform[5];
    const x = item.transform[4];
    let line = lines.find(l => Math.abs(l.y - y) <= LINE_Y_TOLERANCE);
    if (!line) {
      line = { y, fragments: [] };
      lines.push(line);
    }
    line.fragments.push({ x, str: item.str });
  }
  lines.sort((a, b) => b.y - a.y); // PDF Y increases upward -> descending = top to bottom
  return lines
    .map(line =>
      line.fragments
        .sort((a, b) => a.x - b.x)
        .map(f => f.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join('\n');
}

// Rasterizes a scanned (text-layer-less) PDF page-by-page onto a plain
// HTML5 <canvas> (native browser API — no server-side canvas library
// needed) and OCRs each page image with the shared Tesseract worker.
async function rasterizeAndOcrPdf(arrayBuffer) {
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  try {
    const worker = await getOcrWorker();
    const pageCount = Math.min(pdfDoc.numPages, MAX_RASTERIZE_PAGES);
    const pageTexts = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      // eslint-disable-next-line no-await-in-loop
      const page = await pdfDoc.getPage(pageNum);
      try {
        const viewport = page.getViewport({ scale: RASTER_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        // eslint-disable-next-line no-await-in-loop
        await page.render({ canvasContext: ctx, viewport }).promise;
        // eslint-disable-next-line no-await-in-loop
        const { data } = await worker.recognize(canvas);
        const pageText = (data?.text || '').trim();
        if (pageText) pageTexts.push(pageText);
        // Explicitly drop the backing bitmap rather than waiting for GC —
        // matters on lower-memory devices (tablets/older laptops) when a
        // document has many pages.
        canvas.width = 0;
        canvas.height = 0;
      } finally {
        page.cleanup();
      }
    }

    return pageTexts.join('\n\n').trim();
  } finally {
    await pdfDoc.destroy();
  }
}

async function extractFromImageBlob(blob) {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(blob);
  return (data?.text || '').trim();
}

async function extractFromDocx(arrayBuffer) {
  const mammoth = await import('mammoth/mammoth.browser');
  let result;
  try {
    result = await mammoth.extractRawText({ arrayBuffer });
  } catch (err) {
    // Same reasoning as extractFromXlsx's catch below — docx is a ZIP
    // archive too, and mammoth's internal ZIP-parsing errors are just as
    // meaningless to a non-technical reader as XLSX's are.
    throw new Error(
      `This document could not be read — it may have been corrupted or only partially downloaded from Google Drive. ` +
      `Try running the AI evaluation again; if it keeps failing, verify the file opens correctly in Google Drive directly.`
    );
  }
  return (result.value || '').trim();
}

// Spreadsheet forms (like the CS Form 212 Personal Data Sheet) often carry
// far-right "helper" columns that Excel's data-validation dropdowns read
// from — e.g. a full list of ~195 country names, one per row, used purely
// to populate a country picker. That column has real, non-blank content,
// so a naive cell-by-cell dump (sheet_to_csv) includes it in full — on a
// form with hundreds of rows that alone can add tens of thousands of
// characters of pure noise, which then gets sent to Gemini (cost) and
// stored in the audit log (database bloat) for zero benefit, since it's
// never actually the candidate's own data.
//
// There's no fully general way to detect "this column is dropdown
// scaffolding" from the cell values alone without hardcoding assumptions,
// so instead of a per-template heuristic, this keeps the extraction
// reasonably clean by working row-by-row (dropping fully-blank rows, which
// eliminates most of the bulk from unused "Continuation" sheets) and then
// relies on the hard MAX_EXTRACTED_CHARS cap below to catch whatever
// noise slips through — so no single document, of any type, can ever blow
// up a prompt or an audit-log record.
// Some fillable spreadsheet forms use a far-right "helper" column that a
// dropdown/data-validation cell reads its option list from — e.g. one
// country per row, ~195 rows deep, used purely to populate a Citizenship
// picker. Since it's real, non-blank cell content, a naive dump includes
// it in full on every row that happens to have a value in that column,
// which is exactly what showed up as a long unrelated country appended to
// otherwise-normal PDS rows. It's a small, closed, always-identical list,
// so it's safe to strip by exact match rather than relying solely on the
// length cap below to hide it after the fact.
const DROPDOWN_NOISE_VALUES = new Set([
  'afghanistan','albania','algeria','andorra','angola','argentina','armenia','australia','austria',
  'azerbaijan','bahamas, the','bahrain','bangladesh','barbados','belarus','belgium','belize','benin',
  'bhutan','bolivia','bosnia and herzegovina','botswana','brazil','brunei','bulgaria','burkina faso',
  'burma','burundi','cambodia','cameroon','canada','cape verde','central african republic','chad',
  'chile','china','colombia','comoros','congo, democratic republic of the','congo, republic of the',
  'costa rica',"cote d'ivoire",'croatia','cuba','curacao','cyprus','czech republic','djibouti',
  'dominica','dominican republic','east timor','ecuador','egypt','el salvador','equatorial guinea',
  'eritrea','estonia','ethiopia','fiji','finland','france','gabon','gambia, the','georgia','germany',
  'ghana','greece','grenada','guatemala','guinea','guinea-bissau','guyana','haiti','holy see',
  'honduras','hong kong','hungary','iceland','india','indonesia','iran','iraq','ireland','israel',
  'italy','jamaica','japan','jordan','kazakhstan','kenya','kiribati','korea, north','korea, south',
  'kosovo','kuwait','kyrgyzstan','laos','latvia','lebanon','lesotho','liberia','libya','liechtenstein',
  'lithuania','luxembourg','macau','macedonia','madagascar','malawi','malaysia','maldives','mali',
  'malta','marshall islands','mauritania','mauritius','mexico','micronesia','moldova','monaco',
  'mongolia','montenegro','morocco','mozambique','namibia','nauru','nepal','netherlands',
  'netherlands antilles','new zealand','nicaragua','niger','nigeria','north korea','norway','oman',
  'pakistan','palau','palestinian territories','panama','papua new guinea','paraguay','peru',
  'philippines','poland','portugal','qatar','romania','russia','rwanda','saint kitts and nevis',
  'saint lucia','saint vincent and the grenadines','samoa','san marino','sao tome and principe',
  'saudi arabia','senegal','serbia','seychelles','sierra leone','singapore','sint maarten','slovakia',
  'slovenia','solomon islands','somalia','south africa','south korea','south sudan','spain',
  'sri lanka','sudan','suriname','swaziland','sweden','switzerland','syria','taiwan','tajikistan',
  'tanzania','thailand','timor-leste','togo','tonga','trinidad and tobago','tunisia','turkey',
  'turkmenistan','tuvalu','uganda','ukraine','united arab emirates','united kingdom','uruguay',
  'uzbekistan','vanuatu','venezuela','vietnam','yemen','zambia','zimbabwe'
]);

// Drops trailing cells that are nothing but a dropdown-helper value (see
// above), so a row's real content survives untouched but the appended
// noise column doesn't. Only trims from the END of the row — a country
// name that's genuinely part of the candidate's own data (e.g. an actual
// answer to a "country" field) stays put, since real answers aren't
// followed by nothing but more noise.
function stripDropdownNoiseCells(cells) {
  const out = [...cells];
  while (out.length > 1 && DROPDOWN_NOISE_VALUES.has(out[out.length - 1].toLowerCase())) {
    out.pop();
  }
  return out;
}

async function extractFromXlsx(arrayBuffer) {
  const XLSX = await import('xlsx');
  let workbook;
  try {
    workbook = XLSX.read(arrayBuffer, { type: 'array' });
  } catch (err) {
    // The server (server/lib/googleDrive.js) already validates ZIP
    // structural integrity before this ever reaches the browser, so this
    // should be rare — but it's still possible via the Cloudflare Worker
    // proxy path, which streams bytes straight from Drive without going
    // through that check. Rather than let a raw library message like "Bad
    // compressed size: X != Y" reach the Secretariat verbatim (meaningless
    // without knowing this is a ZIP-parsing internal), name the likely
    // cause plainly.
    throw new Error(
      `This spreadsheet could not be read — it may have been corrupted or only partially downloaded from Google Drive. ` +
      `Try running the AI evaluation again; if it keeps failing, verify the file opens correctly in Google Drive directly.`
    );
  }
  const sheetTexts = workbook.SheetNames.map(name => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: false, defval: '' });
    const lines = rows
      .map(row => row.map(cell => String(cell ?? '').trim()).filter(Boolean))
      .map(stripDropdownNoiseCells)
      .filter(cells => cells.length > 0)
      .map(cells => cells.join(' | '));
    return lines.join('\n');
  });
  return sheetTexts.filter(Boolean).join('\n\n').trim();
}

// Hard ceiling on any single document's extracted text, applied no matter
// how it was extracted (OCR, PDF text layer, docx, xlsx). This exists as a
// safety net independent of any format-specific cleanup above: it's what
// actually guarantees a single pathological document (a spreadsheet with
// unexpected helper columns, a garbled OCR pass on a dense table, etc.)
// can never blow up a Gemini prompt's cost or bloat an audit-log record —
// regardless of what new document types or edge cases show up later.
const MAX_EXTRACTED_CHARS = 6000;

function capExtractedText(text) {
  if (!text || text.length <= MAX_EXTRACTED_CHARS) return text;
  const omitted = text.length - MAX_EXTRACTED_CHARS;
  return text.slice(0, MAX_EXTRACTED_CHARS) +
    `\n\n[... truncated — ${omitted.toLocaleString()} more characters omitted. ` +
    `This usually means the extracted content included non-essential formatting/padding; ` +
    `check the original document directly if detail beyond this point matters. ...]`;
}

// Extracts text from one document's raw bytes, entirely client-side.
// Returns { text, method, insufficient, error? } — same shape the server
// used to produce internally, now built in the browser and POSTed back.
export async function extractTextClientSide(arrayBuffer, mimeType, fileName = '') {
  const result = await extractTextClientSideRaw(arrayBuffer, mimeType, fileName);
  return { ...result, text: capExtractedText(result.text) };
}

async function extractTextClientSideRaw(arrayBuffer, mimeType, fileName = '') {
  const lowerName = (fileName || '').toLowerCase();

  try {
    if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
      const textLayer = await extractPdfTextLayer(arrayBuffer);
      if (textLayer.length >= MIN_USABLE_CHARS) {
        return { text: textLayer, method: 'pdf-text-layer', insufficient: false };
      }
      // No usable text layer — this is very likely a scanned document.
      const ocrText = await rasterizeAndOcrPdf(arrayBuffer);
      if (ocrText.length >= MIN_USABLE_CHARS) {
        return { text: ocrText, method: 'pdf-rasterized-ocr', insufficient: false };
      }
      return { text: ocrText, method: 'pdf-no-text-layer', insufficient: true };
    }

    if (mimeType && mimeType.startsWith('image/')) {
      const blob = new Blob([arrayBuffer], { type: mimeType });
      const text = await extractFromImageBlob(blob);
      return { text, method: 'image-ocr', insufficient: text.length < MIN_USABLE_CHARS };
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx')
    ) {
      const text = await extractFromDocx(arrayBuffer);
      return { text, method: 'docx', insufficient: text.length < MIN_USABLE_CHARS };
    }

    if (mimeType === 'application/msword' || lowerName.endsWith('.doc')) {
      return {
        text: '',
        method: 'legacy-doc-unsupported',
        insufficient: true,
        error: 'Older .doc format (not .docx) is not supported for automatic extraction.'
      };
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel' ||
      lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')
    ) {
      const text = await extractFromXlsx(arrayBuffer);
      return { text, method: 'xlsx', insufficient: text.length < MIN_USABLE_CHARS };
    }

    return {
      text: '',
      method: 'unsupported-mime-type',
      insufficient: true,
      error: `Unsupported file type: ${mimeType || 'unknown'}`
    };
  } catch (err) {
    console.error('[clientTextExtraction]', fileName, err);
    return {
      text: '',
      method: 'extraction-error',
      insufficient: true,
      error: err.message || 'Unknown extraction error'
    };
  }
}