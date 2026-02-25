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

function groupByRow(items, tol = 5) { // ✅ INCREASED tolerance from 3 to 5
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

function fixSpacing(text) {
  if (!text) return text;
  
  const fixes = {
    'Deve lops': 'Develops',
    'deve lops': 'develops',
    'st rategies': 'strategies',
    'St rategies': 'Strategies',
    'pro cedures': 'procedures',
    'Pro cedures': 'Procedures',
    'inte grates': 'integrates',
    'Inte grates': 'Integrates',
    'inter ventions': 'interventions',
    'Inter ventions': 'Interventions',
    'poli cies': 'policies',
    'Poli cies': 'Policies',
    'guide lines': 'guidelines',
    'Guide lines': 'Guidelines',
    'recom mends': 'recommends',
    'Recom mends': 'Recommends',
    'th e': 'the',
    'Th e': 'The',
    'an d': 'and',
    'An d': 'And',
  };
  
  for (const [broken, fixed] of Object.entries(fixes)) {
    text = text.replace(new RegExp('\\b' + broken.replace(/\s/g, '\\s') + '\\b', 'g'), fixed);
  }
  
  return text;
}

// ✅ IMPROVED: Better column parsing with continuation handling
function parseColumn(lines) {
  const biLines = [], items = [], cur = [];
  let inItems = false;
  
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    
    // Numbered items (KSAs)
    if (/^\d+\./.test(t)) {
      if (cur.length) { 
        items.push(cur.join(' ').trim()); 
        cur.length = 0; 
      }
      cur.push(t); 
      inItems = true;
    } 
    // Continuation of numbered item
    else if (inItems && cur.length > 0) {
      cur.push(t);
    } 
    // Behavioral indicator text
    else if (t.length > 3 && !LEVEL_NAMES.includes(t) && !inItems) {
      biLines.push(t);
    }
    // ✅ NEW: If we hit a new competency code or header, finalize current item
    else if (CODE_RE.test(t) || LEVEL_NAMES.includes(t)) {
      if (cur.length) {
        items.push(cur.join(' ').trim());
        cur.length = 0;
      }
      inItems = false;
    }
  }
  
  // Finalize any remaining item
  if (cur.length) items.push(cur.join(' ').trim());
  
  const behavioralIndicator = fixSpacing(biLines.join(' ').trim());
  const fixedItems = items.map(item => fixSpacing(item));
  
  return { behavioralIndicator, items: fixedItems };
}

// ✅ FIXED: Properly reconstruct text lines within each column
function extractLevels(rows, headerY) {
  const cols = [[], [], [], []];
  let past = false;
  
  for (const [y, items] of rows) {
    if (!past) { 
      if (y >= headerY) past = true; 
      else continue; 
    }
    
    if (y === headerY) continue;
    
    const rowText = items.map(i => i.str).join(' ').trim();
    if (isSectionBreak(rowText)) break;
    if (/^\d+$/.test(rowText)) continue;
    
    const rowByCol = [[], [], [], []];
    for (const item of items) {
      const colIdx = getColumn(item.x);
      rowByCol[colIdx].push(item.str);
    }
    
    rowByCol.forEach((colItems, colIdx) => {
      if (colItems.length > 0) {
        const line = colItems.join(' ').trim();
        if (line) cols[colIdx].push(line);
      }
    });
  }
  
  // ✅ ADD THIS DEBUG LOG
  const firstComp = Array.from(rows.values())[0];
  if (firstComp) {
    const compName = firstComp.map(i => i.str).join(' ');
    if (compName.includes('RO2')) {
      console.log('RO2 Debug - INTERMEDIATE column lines:', cols[1]);
    }
  }
  
  const levels = {};
  LEVEL_NAMES.forEach((name, i) => { 
    levels[name] = parseColumn(cols[i]); 
  });
  
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

function isSectionBreak(text) {
  const sectionHeaders = [
    'ORGANIZATIONAL COMPETENCIES',
    'CORE COMPETENCIES',
    'LEADERSHIP COMPETENCIES',
    'MINIMUM COMPETENCIES',
    'BASIC COMPETENCIES',
    'TECHNICAL COMPETENCIES'
  ];
  
  const normalized = text.trim().toUpperCase();
  return sectionHeaders.some(header => normalized.includes(header));
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
      let shouldBreak = false; // ✅ NEW: Flag to break outer loop
      
      for (const [y, items] of allRows[pi]) {
        if (pi === loc.pi && y < loc.y) continue;
        if (pi === next?.pi && y >= next.y) continue;
        
        // ✅ NEW: Check for section breaks
        const rowText = items.map(i => i.str).join(' ').trim();
        if (isSectionBreak(rowText)) {
          shouldBreak = true;
          break;
        }
        
        section.set(y + yOff, items);
        maxY = Math.max(maxY, y);
      }
      
      if (shouldBreak) break; // ✅ NEW: Stop collecting if section break found
      
      yOff += maxY + 50;
      
      if (!next || pi < next.pi - 1) continue;
      if (next && pi === next.pi - 1) break;
    }

    const headerY = findHeaderRow(section);
    if (!headerY) continue;
    
    const levels = extractLevels(section, headerY);
    const hasContent = LEVEL_NAMES.some(l => 
      levels[l].behavioralIndicator || levels[l].items.length > 0
    );
    
    if (!hasContent) continue;

    result.push({ 
      code: loc.code, 
      name: loc.name, 
      category: getCategory(loc.code), 
      levels 
    });
    
    if (ci % 15 === 0) 
      onProgress(Math.round(70 + (ci / locs.length) * 28), `Extracted ${ci + 1}…`);
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
  
  const cleanName = name.replace(/^\([A-Z]+\)\s*-\s*/i, '').trim();
  
  let best = null, bestScore = 0;
  for (const c of comps) {
    const s = score(cleanName, c.name);
    if (s > bestScore) { bestScore = s; best = c; }
  }
  
  if (bestScore >= threshold) return best;
  
  const fallbackName = cleanName.split('(')[0].trim();
  
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
    return r.ok;
  } catch (e) { 
    console.error('PDF fetch error:', e);
    return false; 
  }
}
