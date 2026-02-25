import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const COLUMN_BOUNDARIES = [192, 384, 589];
const LEVEL_NAMES = ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'SUPERIOR'];
const PDF_PATH = '/rhrmpsb-system/2025_CBS.pdf';
const CODE_RE = /^([A-Z]+\d+[A-Z]?)\s*[-–]\s*(.+)/;

let _cache = null;
let _promise = null;

function getColumn(x) {
  for (let i = 0; i < COLUMN_BOUNDARIES.length; i++) {
    if (x < COLUMN_BOUNDARIES[i]) return i;
  }
  return 3;
}

function groupByRow(items, tol = 3) {
  const rows = new Map();
  for (const item of items) {
    let key = null;
    for (const k of rows.keys()) {
      if (Math.abs(k - item.y) <= tol) { key = k; break; }
    }
    key = key ?? item.y;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(item);
  }
  const sorted = new Map([...rows.entries()].sort((a, b) => a[0] - b[0]));
  sorted.forEach(row => row.sort((a, b) => a.x - b.x));
  return sorted;
}

async function getPageItems(page) {
  const vp = page.getViewport({ scale: 1.0 });
  const content = await page.getTextContent();
  return content.items
    .filter(i => i.str && i.str.trim())
    .map(i => ({
      str: i.str,
      x: Math.round(i.transform[4] * 10) / 10,
      y: Math.round((vp.height - i.transform[5]) * 10) / 10,
    }));
}

function findHeaderRow(rows) {
  for (const [y, items] of rows) {
    const texts = items.map(i => i.str.trim().toUpperCase());
    if (texts.includes('BASIC') && texts.includes('INTERMEDIATE')) return y;
  }
  return null;
}

function cleanText(text) {
  if (!text) return text;
  
  // Fix broken words with spaces (e.g., "Deve lops" -> "Develops", "st rategies" -> "strategies")
  // Pattern: word ending + space + lowercase letters starting next word
  text = text.replace(/([a-z]+)\s+([a-z]{1,4})\b/g, (match, part1, part2) => {
    // Only merge if the second part is very short (likely a broken suffix)
    return part1 + part2;
  });
  
  // Fix specific common breaks
  text = text.replace(/\bst rategies\b/gi, 'strategies');
  text = text.replace(/\bDeve lops\b/gi, 'Develops');
  text = text.replace(/\bcon cepts\b/gi, 'concepts');
  text = text.replace(/\bpro cedures\b/gi, 'procedures');
  text = text.replace(/\bimple ments\b/gi, 'implements');
  text = text.replace(/\bpro grams\b/gi, 'programs');
  text = text.replace(/\bpro jects\b/gi, 'projects');
  text = text.replace(/\binte grates\b/gi, 'integrates');
  text = text.replace(/\binter ventions\b/gi, 'interventions');
  text = text.replace(/\bpoli cies\b/gi, 'policies');
  text = text.replace(/\bguide lines\b/gi, 'guidelines');
  text = text.replace(/\bcri teria\b/gi, 'criteria');
  text = text.replace(/\bstra tegic\b/gi, 'strategic');
  text = text.replace(/\bopera tions\b/gi, 'operations');
  text = text.replace(/\bsolu tions\b/gi, 'solutions');
  text = text.replace(/\bana lyzes\b/gi, 'analyzes');
  text = text.replace(/\beva luates\b/gi, 'evaluates');
  text = text.replace(/\bcom munication\b/gi, 'communication');
  
  // Remove excessive spaces
  text = text.replace(/\s{2,}/g, ' ');
  
  // Trim
  text = text.trim();
  
  // Check if text ends abruptly (ends with lowercase letter followed by nothing, suggesting truncation)
  // If so, add ellipsis to indicate incomplete text
  if (text.length > 50 && /[a-z]$/.test(text) && !text.endsWith('.') && !text.endsWith('s') && !text.endsWith('d')) {
    // Looks truncated - but only mark as such if it doesn't end naturally
    const lastWords = text.split(/\s+/).slice(-3).join(' ');
    if (!lastWords.match(/\b(and|or|the|of|in|on|at|to|for|with|across|through)$/)) {
      // Doesn't end with common prepositions/conjunctions, likely truncated
      // Don't add ellipsis, as it might continue in next item
    }
  }
  
  return text;
}

function parseColumn(lines) {
  const biLines = [], items = [], cur = [];
  let inItems = false;
  
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    
    // Check if this line starts a numbered item
    if (/^\d+\./.test(t)) {
      // Save previous item if exists
      if (cur.length) { 
        items.push(cleanText(cur.join(' '))); 
        cur.length = 0; 
      }
      cur.push(t); 
      inItems = true;
    } else if (inItems) {
      // Continue building current item
      cur.push(t);
    } else if (t.length > 3 && !LEVEL_NAMES.includes(t)) {
      // This is part of behavioral indicator
      biLines.push(t);
    }
  }
  
  // Don't forget the last item
  if (cur.length) {
    items.push(cleanText(cur.join(' ')));
  }
  
  // Clean and join behavioral indicator
  const behavioralIndicator = cleanText(biLines.join(' '));
  
  return { behavioralIndicator, items };
}

function extractLevels(rows, headerY) {
  const cols = [[], [], [], []];
  let past = false;
  for (const [y, items] of rows) {
    if (!past) { if (y >= headerY) past = true; else continue; }
    if (y === headerY) continue;
    if (/^\d+$/.test(items.map(i => i.str).join('').trim())) continue;
    for (const item of items) cols[getColumn(item.x)].push(item.str);
  }
  const levels = {};
  LEVEL_NAMES.forEach((name, i) => { levels[name] = parseColumn(cols[i]); });
  return levels;
}

const CATEGORY_MAP = {
  RSCI: 'Strategic Communication & Information',
  RP:   'Planning & Programming',
  RADM: 'Administrative',
  RFM:  'Financial Management',
  RHR:  'Human Resource Management',
  RO:   'Operations & Resource Management',
  PCO:  'PENRO/CENRO Operations',
  LC:   'Legal & Compliance',
  ICT:  'Information & Communication Technology',
};

function getCategory(code) {
  for (const [k, v] of Object.entries(CATEGORY_MAP)) {
    if (code.startsWith(k)) return v;
  }
  return 'General Competencies';
}

async function _parse(onProgress = () => {}) {
  onProgress(0, 'Loading PDF…');
  const pdf = await pdfjsLib.getDocument({ url: PDF_PATH }).promise;
  const total = pdf.numPages;
  onProgress(5, `${total} pages found…`);

  const allRows = [];
  for (let p = 1; p <= total; p++) {
    const page = await pdf.getPage(p);
    allRows.push(groupByRow(await getPageItems(page)));
    if (p % 20 === 0 || p === total)
      onProgress(Math.round(5 + (p / total) * 55), `Page ${p}/${total}…`);
  }

  onProgress(62, 'Indexing…');

  const locs = [];
  for (let pi = 0; pi < allRows.length; pi++) {
    for (const [y, items] of allRows[pi]) {
      const line = items.map(i => i.str).join(' ').trim();
      const m = CODE_RE.exec(line);
      if (m) locs.push({ pi, y, code: m[1].trim(), name: m[2].trim() });
    }
  }

  onProgress(70, `Found ${locs.length} competencies. Extracting…`);

  const result = [];
  for (let ci = 0; ci < locs.length; ci++) {
    const loc = locs[ci];
    const next = locs[ci + 1] ?? null;
    const section = new Map();
    let yOff = 0;

    for (let pi = loc.pi; pi < allRows.length; pi++) {
      if (next && pi > next.pi) break;
      let maxY = 0;
      for (const [y, items] of allRows[pi]) {
        if (pi === loc.pi && y < loc.y) continue;
        if (pi === next?.pi && y >= next.y) continue;
        section.set(y + yOff, items);
        maxY = Math.max(maxY, y);
      }
      yOff += maxY + 50;
    }

    const headerY = findHeaderRow(section);
    if (!headerY) continue;
    const levels = extractLevels(section, headerY);
    const hasContent = LEVEL_NAMES.some(l => levels[l].behavioralIndicator || levels[l].items.length > 0);
    if (!hasContent) continue;

    result.push({ code: loc.code, name: loc.name, category: getCategory(loc.code), levels });
    if (ci % 15 === 0) onProgress(Math.round(70 + (ci / locs.length) * 28), `Extracted ${ci + 1}…`);
  }

  onProgress(100, 'Done');
  return result;
}

function normalize(name) {
  return name.toUpperCase().replace(/\s+/g, ' ').replace(/[^A-Z0-9\s()\/\-]/g, '').trim();
}

function score(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return 1.0;
  const aw = new Set(na.split(' ').filter(w => w.length > 2));
  const bw = new Set(nb.split(' ').filter(w => w.length > 2));
  const inter = [...aw].filter(w => bw.has(w)).length;
  const union = new Set([...aw, ...bw]).size;
  const jaccard = union === 0 ? 0 : inter / union;
  const sub = na.includes(nb) || nb.includes(na) ? 0.3 : 0;
  return Math.min(1.0, jaccard + sub);
}

export async function ensureParsed(onProgress) {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = _parse(onProgress).then(r => { _cache = r; _promise = null; return r; });
  return _promise;
}

export async function findCompetencyByName(name, threshold = 0.30) {
  const comps = await ensureParsed();
  
  // Strip common level prefixes from the search name
  // Patterns: (ADV) -, (BAS) -, (INT) -, (SUP) -, etc.
  const cleanName = name.replace(/^\([A-Z]+\)\s*-\s*/i, '').trim();
  
  // First attempt: search with full cleaned name
  let best = null, bestScore = 0;
  for (const c of comps) {
    const s = score(cleanName, c.name);
    if (s > bestScore) { bestScore = s; best = c; }
  }
  
  // If found with good confidence, return it
  if (bestScore >= threshold) return best;
  
  // Fallback: Strip everything after the first opening parenthesis
  // Example: "CREATING AND NURTURING... (BUILDS A SHARED..." -> "CREATING AND NURTURING..."
  const fallbackName = cleanName.split('(')[0].trim();
  
  // Only try fallback if it's actually different and not too short
  if (fallbackName !== cleanName && fallbackName.length > 10) {
    best = null;
    bestScore = 0;
    for (const c of comps) {
      const s = score(fallbackName, c.name);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (bestScore >= threshold) return best;
  }
  
  return null;
}

export async function isPDFAvailable() {
  try {
    const r = await fetch(PDF_PATH, { method: 'HEAD' });
    console.log('PDF fetch status:', r.status, r.statusText);
    return r.ok;
  } catch (e) { 
    console.error('PDF fetch error:', e);
    return false; 
  }
}
