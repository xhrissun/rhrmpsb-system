/**
 * pdfParserCache.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in caching layer over pdfParser.
 *
 * HOW IT WORKS
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  First visit   → parse PDF (slow) → store result in IndexedDB      │
 * │  Every refresh → load from IndexedDB (< 50 ms, no parsing at all)  │
 * │  PDF changes   → HEAD fingerprint mismatch → re-parse automatically│
 * └─────────────────────────────────────────────────────────────────────┘
 */

import * as pdfParser from './pdfParser';
import { pdfCacheAPI } from '../utils/api';

// ─── Config ──────────────────────────────────────────────────────────────────

const DB_NAME    = 'rhrmpsb_pdf_cache';
const DB_VER     = 1;
const STORE      = 'cache';
const SCHEMA_VER = 1;

// ─── Comprehensive name aliases / synonyms (auto-built from 2025 CBS TOC PDF) ─
//
// Each pair: [DB fragment or short name, CBS Manual authoritative fragment]
// Matching is bidirectional — if either side is found in the query, the other
// side is also searched.  Add new pairs here when new mismatches are found.
//
// ── LEADERSHIP COMPETENCIES (LC1–LC5) ────────────────────────────────────────
const NAME_ALIASES = [
  // LC1 — Strategic Leadership
  ['strategic leadership',          'thinking strategically and creatively'],
  ['thinking strategically',        'strategic leadership'],
  ['thinking strategically and creatively', 'strategic leadership'],

  // LC2 — Leading Change (same name in DB and CBS — listed for completeness)
  ['leading change',                'leading change'],

  // LC3 — People Development
  ['people development',            'creating and nurturing a high performing organization'],
  ['creating and nurturing',        'people development'],
  ['creating and nurturing a high performing organization', 'people development'],
  ['high performing organization',  'people development'],

  // LC4 — People Performance Management
  ['people performance management', 'managing performance and coaching for results'],
  ['managing performance',          'people performance management'],
  ['coaching for results',          'people performance management'],
  ['managing performance and coaching for results', 'people performance management'],

  // LC5 — Partnership and Networking
  ['partnership and networking',    'building collaborative and inclusive working relationships'],
  ['building collaborative',        'partnership and networking'],
  ['building collaborative and inclusive working relationships', 'partnership and networking'],
  ['collaborative working',         'partnership and networking'],

  // ── ORGANIZATIONAL COMPETENCIES (OC1–OC5) ──────────────────────────────────
  ['writing effectively',           'writing effectively'],
  ['speaking effectively',          'speaking effectively'],
  ['technology literacy',           'technology literacy and managing information'],
  ['technology literacy and managing information', 'technology literacy'],
  ['managing information',          'technology literacy and managing information'],
  ['project management',            'project management'],
  ['completed staff work',          'completed staff work'],
  ['csw',                           'completed staff work'],

  // ── CORE COMPETENCIES (CC1–CC5) ────────────────────────────────────────────
  ['discipline',                    'discipline'],
  ['excellence',                    'excellence'],
  ['nobility',                      'nobility'],
  ['responsibility',                'responsibility'],
  ['caring for the environment',    'caring for the environment and natural resources'],
  ['environment and natural resources', 'caring for the environment and natural resources'],

  // ── HR COMPETENCIES (HR1–HR16) ─────────────────────────────────────────────
  ['competency development',        'competency development and enhancement'],
  ['competency development and enhancement', 'competency development'],
  ['employee counseling',           'employee counseling and coaching'],
  ['counseling and coaching',       'employee counseling and coaching'],
  ['learning needs assessment',     'learning needs assessment'],
  ['lna',                           'learning needs assessment'],
  ['preparation of learning design','preparation of learning design'],
  ['learning design',               'preparation of learning design'],
  ['learning program management',   'learning program management'],
  ['learning event facilitation',   'learning event facilitation'],
  ['learning event management',     'learning event facilitation'],
  ['networking and linkaging',      'networking and linkaging with hr partners'],
  ['network and linkaging',         'networking and linkaging with hr partners'],
  ['linkaging with hr',             'networking and linkaging with hr partners'],
  ['monitoring and evaluation of l&d', 'monitoring and evaluation of l&d programs'],
  ['m&e of l&d',                    'monitoring and evaluation of l&d programs'],
  ['scholarship administration',    'scholarship administration'],
  ['hr planning',                   'hr planning'],
  ['career development',            'career development'],
  ['organization development',      'organization development'],
  ['organisation development',      'organization development'],
  ['grievance handling',            'grievance handling'],
  ['processing of personnel actions','processing of personnel actions'],
  ['compensation benefits',         'compensation, benefits, and welfare administration'],
  ['compensation and benefits',     'compensation, benefits, and welfare administration'],
  ['benefits and welfare',          'compensation, benefits, and welfare administration'],
  ['recruitment selection',         'recruitment, selection, and placement'],
  ['recruitment and selection',     'recruitment, selection, and placement'],
  ['performance management',        'performance management'],

  // ── ADMINISTRATIVE / SUPPORT COMPETENCIES ──────────────────────────────────
  ['procurement management',        'procurement management'],
  ['property management',           'property management'],
  ['property inventory',            'property management'],
  ['records management',            'records management'],
  ['computerized records',          'computerized records management'],
  ['courier postal',                'courier, postal and messengerial services'],
  ['messengerial services',         'courier, postal and messengerial services'],
  ['clerical secretarial',          'clerical/ secretarial/ executive assistance skills'],
  ['executive assistance',          'clerical/ secretarial/ executive assistance skills'],
  ['secretarial executive assistance', 'clerical/ secretarial/ executive assistance skills'],
  ['building maintenance',          'building maintenance system administration'],
  ['repair and fabrication',        'repair and fabrication'],
  ['gardening and landscaping',     'gardening and landscaping'],
  ['radio telecommunications',      'radio telecommunications services'],
  ['motorpool services',            'motorpool services management'],
  ['motor pool services',           'motor pool services management'],
  ['vehicle repair',                'vehicle repair and maintenance'],
  ['cash management',               'cash management'],
  ['hostel administration',         'hostel administration'],
  ['ems wellness',                  'environmental management system'],
  ['environmental management system','ems, wellness, security, safety and emergency preparedness'],
  ['wellness security safety',      'environmental management system'],
  ['customer assistance',           'customer assistance and request handling'],
  ['request handling',              'customer assistance and request handling'],
  ['driving',                       'driving'],

  // ── FINANCIAL / BUDGET ─────────────────────────────────────────────────────
  ['general accounting',            'general accounting'],
  ['budget preparation',            'budget preparation'],
  ['budget preparation and legislation', 'budget preparation'],
  ['budget execution',              'budget execution and accountability'],
  ['budget administration',         'budget administration and control'],
  ['budget accountability',         'budget execution and accountability'],
  ['organization and management systems improvement', 'organization and management systems improvement'],
  ['management systems improvement','organization and management systems improvement'],
  ['organisational management',     'organization and management systems improvement'],
  ['management audit',              'management audit'],
  ['operations audit',              'operations audit'],

  // ── ICT / IS COMPETENCIES ──────────────────────────────────────────────────
  ['application systems development','application systems development'],
  ['systems development',           'application systems development'],
  ['software development',          'software development'],
  ['systems analysis and design',   'systems analysis and design'],
  ['system analysis and design',    'systems analysis and design'],
  ['network infrastructure',        'network infrastructure management'],
  ['network systems management',    'network systems management'],
  ['ict planning',                  'information and communication technologies'],
  ['ict resource management',       'information and communication technologies'],
  ['information and communication technologies', 'ict resource management'],
  ['cyber security',                'cyber security and information security'],
  ['cybersecurity',                 'cyber security and information security'],
  ['information security',          'cyber security and information security'],
  ['data management',               'data management and publication of knowledge products'],
  ['publication of knowledge',      'data management and publication of knowledge products'],
  ['statistical analysis',          'statistical analysis and production of knowledge products'],
  ['production of knowledge products','statistical analysis and production of knowledge products'],
  ['spatial analysis',              'spatial analysis, conversion of statistical data to spatial data'],
  ['conversion to knowledge products','spatial analysis, conversion of statistical data to spatial data'],
  ['web development',               'web development'],
  ['systems management',            'systems management'],

  // ── PLANNING / POLICY ──────────────────────────────────────────────────────
  ['planning and programming',      'planning and programming'],
  ['policy analysis',               'policy analysis'],
  ['policy analysis and development','policy analysis'],
  ['policy review and analysis',    'policy analysis'],
  ['monitoring and evaluation of denr', 'monitoring and evaluation of denr programs and projects'],
  ['m&e of denr programs',          'monitoring and evaluation of denr programs and projects'],
  ['monitoring and evaluation of lands', 'monitoring and evaluation of denr programs and projects'],

  // ── PROJECT / FUND ─────────────────────────────────────────────────────────
  ['project preparation and design','project preparation and design'],
  ['fund sourcing',                 'fund sourcing and resource mobilization'],
  ['resource mobilization',         'fund sourcing and resource mobilization'],
  ['project operations planning',   'project operations planning'],
  ['project coordination',          'project coordination, facilitation, progress monitoring'],
  ['project monitoring and evaluation','project monitoring and evaluation'],
  ['project monitoring',            'project monitoring'],
  ['project financial',             'project financial and administrative management'],

  // ── LEGAL COMPETENCIES ─────────────────────────────────────────────────────
  ['skills in legal research',      'skills in legal research'],
  ['legal research',                'skills in legal research'],
  ['management and disposition of enr','management and disposition of enr appealed cases'],
  ['disposition of enr cases',      'management and disposition of enr appealed cases'],
  ['litigation',                    'litigation'],
  ['legal counseling',              'legal counseling and alternative dispute resolution'],
  ['alternative dispute resolution','legal counseling and alternative dispute resolution'],
  ['adr',                           'legal counseling and alternative dispute resolution'],
  ['investigation and disposition of administrative', 'investigation and disposition of administrative complaints'],
  ['administrative complaints',     'investigation and disposition of administrative complaints'],
  ['legal note taking',             'legal note taking'],
  ['legal records management',      'legal records management'],
  ['adjudication of pollution',     'adjudication of pollution cases'],

  // ── ENVIRONMENTAL / NATURAL RESOURCES ─────────────────────────────────────
  ['enr policy research',           'environment and natural resource (enr) policy research and review'],
  ['environmental planning',        'environmental planning, programming and evaluation'],
  ['environmental research generation','environmental research generation'],
  ['environmental governance',      'environmental governance'],
  ['enr accounting',                'environment and natural resource accounting'],
  ['environmental accounting',      'environment and natural resource accounting'],
  ['climate change information',    'climate change information management and administration'],
  ['climate change mitigation',     'climate change mitigation and adaptation policy formulation'],
  ['capacity building on climate change', 'capacity building on climate change mitigation and adaptation'],
  ['climate change mainstreaming',  'climate change mainstreaming and integration'],
  ['management of international commitments','management of international commitments and agreement related to climate change'],
  ['climate change and environmental management','climate change and environmental management'],

  // ── SOLID WASTE / ECOLOGICAL ───────────────────────────────────────────────
  ['ecological solid waste',        'ecological solid waste management'],
  ['eswm',                          'ecological solid waste management'],
  ['solid waste monitoring',        'solid waste monitoring and assessment'],
  ['policy research and development on eswm', 'ecological solid waste management'],
  ['training and information dissemination on eswm', 'ecological solid waste management'],
  ['implementation of programs on eswm', 'ecological solid waste management'],
  ['linkaging and networking technical cooperation', 'linkaging and networking'],

  // ── WATER / AIR / ENVIRONMENTAL QUALITY ───────────────────────────────────
  ['water quality management',      'water quality management'],
  ['collection of water samples',   'collection of water samples'],
  ['collection of environmental data','collection of environmental data'],
  ['data analysis and interpretation','data analysis and interpretation'],
  ['documentation and dissemination of results','documentation and dissemination of results'],
  ['equipment maintenance and calibration','equipment maintenance and calibration'],
  ['monitoring and evaluation of compliance','monitoring and evaluation of compliance of facilities'],
  ['air quality management',        'air quality management'],
  ['hazardous waste management',    'hazardous waste management'],
  ['chemical management',           'chemical management'],
  ['environmental impact',          'environmental impact assessment'],
  ['eia monitoring',                'eia monitoring and audit'],
  ['environmental quality management system','environmental quality management system'],
  ['multilateral environmental agreements','management of multilateral environmental agreements'],
  ['meas',                          'multilateral environmental agreements'],

  // ── COMMUNICATION / MEDIA / SCI ───────────────────────────────────────────
  ['managing research and evaluation','managing research and evaluation'],
  ['developing and implementing enr communication','developing and implementing enr communication and advocacy plans'],
  ['communication and advocacy',    'developing and implementing enr communication and advocacy plans'],
  ['developing and producing communication materials','developing and producing communication materials'],
  ['managing corporate identity',   'managing corporate identity and brand'],
  ['managing media relations',      'managing media relations'],
  ['media relations management',    'managing media relations'],
  ['managing online and social media','managing online and social media'],
  ['social media',                  'managing online and social media'],
  ['managing library',              'managing library and information resources'],
  ['library management',            'managing library and information resources'],
  ['developing partnerships',       'developing partnerships to support priority projects and programs'],
  ['managing events',               'managing events'],
  ['event management',              'managing events'],
  ['managing issues',               'managing issues'],
  ['managing stakeholder relations','managing stakeholder relations'],
  ['adhering to ethical standards', 'adhering to ethical standards and practices in scis activities'],
  ['development communication',     'development communication management'],
  ['visual communication',          'visual communication'],
  ['video production',              'video production'],
  ['photojournalism',               'photojournalism'],
  ['public information',            'public information management'],

  // ── NATURAL RESOURCES / FIELD ─────────────────────────────────────────────
  ['integrated ecosystems management','concept and application of integrated ecosystems management'],
  ['iem',                           'integrated ecosystems management'],
  ['characterization of ecosystem', 'characterization of ecosystem and use of planning tools'],
  ['planning tools and procedures', 'characterization of ecosystem and use of planning tools'],
  ['resource management and restoration','resource management and restoration'],
  ['degraded ecosystems',           'resource management and restoration'],
  ['natural resources management related plans','preparation of natural resources management'],
  ['flup crmp iswmp',               'natural resources management'],
  ['strategies and schemes for financing', 'strategies and schemes for financing environmental projects'],
  ['financing environmental projects','strategies and schemes for financing environmental projects'],
  ['results-based monitoring',      'results-based monitoring and evaluation systems'],
  ['rbme',                          'results-based monitoring and evaluation systems'],
  ['information education and communication','information, education and communication, social marketing'],
  ['iec social marketing',          'information, education and communication, social marketing'],
  ['impact assessment across ecosystems','impact assessment across ecosystems'],
  ['social negotiation',            'social negotiation'],
  ['enr law enforcement',           'enr law enforcement'],
  ['geographic information system', 'geographic information system'],
  ['gis',                           'geographic information system'],
  ['surveying',                     'surveying'],
  ['survey verification',           'survey verification'],
  ['mapping',                       'mapping'],
  ['land management information system','land management information system administration'],
  ['land records management',       'land records management'],
  ['land disposition and management','land disposition and management'],
  ['land disposition',              'land disposition'],
  ['land management',               'land management'],
  ['forest water wildlife',         'forest, water, and wildlife resource regulation'],
  ['wildlife resource regulation',  'forest, water, and wildlife resource regulation'],
  ['tenure and rights assessment',  'tenure and rights assessment'],
  ['tenurial instruments',          'tenurial instruments and permits for improved resource management'],
  ['protected area management',     'protected area management'],
  ['management of socio-economics', 'management of socio-economics and cultural concerns'],
  ['socio-economics and cultural',  'management of socio-economics and cultural concerns'],
  ['conservation and management of wildlife','conservation and management of wildlife'],
  ['ecotourism development',        'ecotourism development and management'],
  ['natural resources assessment',  'natural resources assessment - biological & physical'],
  ['biological and physical',       'natural resources assessment - biological & physical'],
  ['implementation of protected area policies','implementation of protected area policies'],
  ['protected area law enforcement','protected area, critical habitat, caves and wildlife law enforcement'],
  ['caves wetlands',                'caves, wetlands and other ecosystems resources management'],
  ['coastal and marine biodiversity','coastal and marine biodiversity management'],
  ['coastal hazard management',     'coastal hazard management'],
  ['wildlife resources',            'conservation and management of wildlife resources'],
  ['captive wildlife',              'care and management of captive wildlife'],
  ['biodiversity-based products',   'promotion of biodiversity-based products'],
  ['cepa activities',               'promotion of biodiversity-based products'],

  // ── RESEARCH / LABORATORY ─────────────────────────────────────────────────
  ['technology generation',         'technology generation'],
  ['technology assessment',         'technology assessment and packaging'],
  ['technology promotion',          'technology promotion and extension'],
  ['laboratory management',         'laboratory management'],
  ['laboratory analyses',           'laboratory analyses and services'],
  ['demonstration and experimental forests','demonstration and experimental forests/sites management'],
  ['forest plantation',             'forest plantation establishment, maintenance and protection'],
  ['forest plantation establishments','forest plantation establishments, maintenance and protection'],

  // ── FORESTRY ──────────────────────────────────────────────────────────────
  ['forest land use planning',      'forest land use planning'],
  ['forest resource inventory',     'forest resource inventory and assessment'],
  ['natural forest productivity',   'natural forest productivity improvement'],
  ['forest harvesting',             'forest harvesting and utilization'],
  ['scaling grading assessment',    'scaling, grading, and assessment of forest products'],
  ['forest nurseries',              'establishment and maintenance of forest nurseries'],
  ['rehabilitation of watersheds',  'rehabilitation and management of watersheds'],
  ['grazing lands',                 'sustainable management of grazing lands'],
  ['enforcement of forest laws',    'enforcement of forest laws, rules and regulations'],

  // ── MINES AND GEOSCIENCES ─────────────────────────────────────────────────
  ['mines and geosciences planning','mines and geosciences planning and programming'],
  ['mgb programs',                  'monitoring and evaluation of mgb programs and projects'],
  ['policy review and coordination','policy review and coordination'],
  ['technology management',         'technology management'],
  ['system and technology innovation','system and technology innovation and management'],
  ['mine safety and health',        'mine safety and health management'],
  ['social community development',  'social/community development and management'],
  ['mine environmental',            'mine environmental and rehabilitation management'],
  ['mining project technical evaluation','mining project technical evaluation'],
  ['mining project technical audit','mining project technical audit'],
  ['mining exploration database',   'mining/ exploration database management'],
  ['mineral rights management',     'mineral rights management system'],
  ['geodetic survey management',    'geodetic survey management'],
  ['coastal geohazard',             'coastal geohazard survey'],
  ['coastal and marine mineral',    'coastal and marine mineral resources assessment'],
  ['marine geological',             'marine geological and geophysical survey'],
  ['ship operation',                'ship operation and maintenance management'],
  ['generation of maps',            'generation of maps and reports'],
  ['digital geologic information',  'digital geologic information and data system management'],
  ['mine technology development',   'mine technology development'],
  ['mineral reserves inventory',    'mineral reserves inventory'],
  ['small-scale mining development','small-scale mining development'],
  ['mine evaluation and enforcement','mine evaluation and enforcement'],
  ['metallurgical and fire assay',  'provision of metallurgical and fire assay tests'],
  ['metallurgical research',        'conduct of metallurgical research'],
  ['chemical and physical tests',   'provision of chemical and physical tests'],
  ['mechanical-electrical services','provision of mechanical-electrical services'],
  ['mineral processing permit',     'conduct of mineral processing permit audit'],
  ['mining investigation',          'mining investigation and technical assistance'],
  ['ore reserves inventory',        'ore reserves inventory and validation of mining projects'],
  ['minahang bayan',                'assistance in the operation of p/cmrb and declaration of minahang bayan'],
  ['pssma',                         'assistance in the operation of p/cmrb'],
  ['mineral reservation areas',     'assessment of potential and existing mineral reservation areas'],
  ['quadrangle geologic mapping',   'quadrangle geologic mapping'],
  ['mineral resources assessment',  'mineral resources assessment and characterization'],
  ['geohazard and engineering',     'geohazard and engineering geological assessment'],
  ['hydrogeological assessment',    'hydrogeological assessment'],

  // ── LAND MANAGEMENT BUREAU SPECIFIC ───────────────────────────────────────
  ['information systems and application software','information systems and application software development'],
  ['statistical and spatial analyses','statistical and spatial analyses and data management'],
  ['land records and knowledge',    'land records and knowledge management'],
  ['land administration and management system','land administration and management system'],
  ['investigation and resolution of land claims','investigation and resolution of land claims'],
  ['land claims and conflicts',     'investigation and resolution of land claims and conflicts cases'],

  // ── EMB SPECIFIC ──────────────────────────────────────────────────────────
  ['environmental planning programming and evaluation','environmental planning, programming and evaluation'],
  ['policy review and analysis',    'policy review and analysis'],
  ['statistics and information systems management','statistics and information systems management'],
  ['recognition of denr environmental laboratories','recognition of denr environmental laboratories'],
  ['curriculum review and development','curriculum review and development for environmental education'],
  ['capability building on environmental management','capability building on environmental management'],
  ['iec materials production',      'iec materials production'],
  ['environmental report documentation','environmental report documentation and library management'],
  ['environmental quality database','environmental quality database administration'],
  ['environmental impact evaluation','environmental impact evaluation'],
  ['eia policy and standards',      'eia policy and standards formulation and implementation assessment'],
  ['capacity building on eia',      'capacity building on eia'],
  ['development dissemination of peiss','development/ dissemination of peiss information'],
  ['eia document tracking',         'eia document tracking and information system management'],
  ['toxic chemicals and hazardous waste','toxic chemicals and hazardous waste management'],
  ['analysis of environmental samples','analysis of environmental samples'],
  ['collection of environmental samples','collection of environmental samples'],
  ['environmental information and education','environmental information and education'],

  // ── MGB SPECIFIC ──────────────────────────────────────────────────────────
  ['personnel management',          'personnel management'],
  ['training management',           'training management'],
  ['emergency preparedness and disaster management','emergency preparedness and disaster management'],
  ['disposition management of cases','disposition/management of cases'],
  ['investigation and disposition of enr mining','investigation and disposition of enr (mining-related)'],
  ['statistical coordination and data research','statistical coordination and data research'],
  ['public information and advocacy','public information and advocacy management'],
  ['photography video production',  'photography/ video production'],
  ['web publication social media',  'web publication/ social media skills'],
  ['networking skills',             'networking skills'],
  ['applications development',      'applications development'],
  ['hostel administration',         'hostel administration'],
  ['repair and maintenance',        'repair and maintenance'],
  ['property and supply management','property and supply management'],
  ['basic accounting and cash management','basic accounting and cash management'],
  ['infrastructure maintenance system administration','infrastructure maintenance system administration'],
  ['organizational and management systems improvement','organizational and management systems improvement'],

  // ── P/CENRO SPECIFIC ──────────────────────────────────────────────────────
  ['statistical coordination and data research','statistical coordination and data research'],
  ['pcenro',                        'provincial/community environment and natural resources'],
  ['cenro',                         'community environment and natural resources'],
  ['penro',                         'provincial environment and natural resources'],
];

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess  = e => resolve(e.target.result);
    req.onerror    = e => reject(e.target.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = e => resolve(e.target.result ?? null);
    req.onerror   = e => reject(e.target.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ─── PDF fingerprinting ───────────────────────────────────────────────────────

async function getPDFFingerprint(pdfUrl) {
  try {
    const res = await fetch(pdfUrl, { method: 'HEAD', cache: 'no-cache' });
    if (!res.ok) return 'unavailable';
    const length  = res.headers.get('content-length') ?? '?';
    const etag    = res.headers.get('etag')            ?? '';
    const lastMod = res.headers.get('last-modified')   ?? '';
    return etag
      ? `etag:${etag}`
      : lastMod
        ? `mod:${lastMod}|size:${length}`
        : `size:${length}`;
  } catch {
    return 'unavailable';
  }
}

// ─── Internal state ───────────────────────────────────────────────────────────

let _competencies = null;
let _parsePromise = null;

// ─── Name matching utilities ──────────────────────────────────────────────────

function normalize(str) {
  return (str ?? '')
    .toLowerCase()
    .replace(/[()\/\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

const STOP = new Set([
  'and', 'the', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'or',
  'its', 'with', 'from', 'that', 'this', 'are', 'was', 'has',
  'their', 'they', 'into', 'also', 'an', 'a',
]);

function keywords(str) {
  return normalize(str).split(' ').filter(w => w.length > 2 && !STOP.has(w));
}

/** Character trigram similarity — handles misspellings */
function trigramSim(a, b) {
  const trigrams = s => {
    const t = new Set();
    const c = s.replace(/\s/g, '');
    for (let i = 0; i < c.length - 2; i++) t.add(c.slice(i, i + 3));
    return t;
  };
  const ta = trigrams(a), tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  const inter = [...ta].filter(t => tb.has(t)).length;
  return inter / Math.max(ta.size, tb.size);
}

/** Word-overlap Jaccard similarity */
function jaccardSim(a, b) {
  const wa = new Set(keywords(a));
  const wb = new Set(keywords(b));
  if (!wa.size || !wb.size) return 0;
  const inter = [...wa].filter(w => wb.has(w)).length;
  const union  = new Set([...wa, ...wb]).size;
  let score = inter / union;
  // Bonus: if all words of the shorter set appear in the longer set
  const [shorter, longer] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if (shorter.size >= 3 && [...shorter].every(w => longer.has(w))) {
    score = Math.min(1.0, score + 0.2);
  }
  return score;
}

/**
 * Composite similarity: blend Jaccard + trigrams, weighted by name length.
 * Short/single-word names rely more on trigrams.
 */
function similarity(query, candidate) {
  const q = normalize(query);
  const c = normalize(candidate);
  if (q === c) return 1.0;

  const jac = jaccardSim(q, c);
  const tri = trigramSim(q, c);
  const wordCount = Math.min(keywords(query).length, keywords(candidate).length);
  const triW = wordCount <= 2 ? 0.7 : 0.3;
  return Math.min(1.0, jac * (1 - triW) + tri * triW);
}

/**
 * Expand a query name through known aliases.
 * Returns an array of alternative search strings to try.
 */
function expandAliases(name) {
  const lower = name.toLowerCase();
  const extras = [];
  for (const [fragment, alias] of NAME_ALIASES) {
    if (lower.includes(fragment)) extras.push(alias);
    if (lower.includes(alias))   extras.push(fragment);
  }
  return [name, ...extras];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const isPDFAvailable = pdfParser.isPDFAvailable;

/**
 * Ensures competency data is loaded (memory → IndexedDB → full parse).
 */
export async function ensureParsed(onProgress) {
  if (_competencies) {
    onProgress?.(100, 'Loaded from cache');
    return _competencies;
  }
  if (_parsePromise) return _parsePromise;

  _parsePromise = (async () => {
    try {
      const PDF_URL   = '/rhrmpsb-system/2025_CBS.pdf';
      const fingerprint = await getPDFFingerprint(PDF_URL);

      // STEP 1: Try server-backed cache first (persists across server restarts)
      let serverCached = null;
      try {
        // FIX: Pass fingerprint so server returns 404 on version mismatch rather than stale data
        serverCached = await pdfCacheAPI.get(fingerprint);
      } catch (err) {
        console.info('[pdfParserCache] Server cache unavailable (expected on first load):', err.message);
      }

      const serverCacheValid =
        serverCached &&
        serverCached.schemaVersion === SCHEMA_VER &&
        Array.isArray(serverCached.data) &&
        serverCached.data.length > 0 &&
        (fingerprint === 'unavailable' || serverCached.fingerprint === fingerprint);

      if (serverCacheValid) {
        onProgress?.(100, 'Loaded from server cache');
        _competencies = serverCached.data;
        // Also update IndexedDB for offline access
        idbSet('competencies', {
          schemaVer: SCHEMA_VER,
          fingerprint,
          cachedAt: Date.now(),
          data: _competencies,
        }).catch(err => console.warn('[pdfParserCache] IDB write error:', err));
        return _competencies;
      }

      // STEP 2: Fall back to IndexedDB if server cache is invalid/unavailable
      let cached = null;
      try { cached = await idbGet('competencies'); } catch {}

      const cacheValid =
        cached &&
        cached.schemaVer === SCHEMA_VER &&
        Array.isArray(cached.data) &&
        cached.data.length > 0 &&
        (fingerprint === 'unavailable' || cached.fingerprint === fingerprint);

      if (cacheValid) {
        onProgress?.(100, 'Loaded from local cache');
        _competencies = cached.data;
        return _competencies;
      }

      if ((serverCached || cached) && !serverCacheValid && !cacheValid) {
        console.info('[pdfParserCache] PDF changed — re-parsing.');
      }

      // STEP 3: Parse PDF if no valid cache exists
      onProgress?.(5, 'Parsing PDF...');
      const result = await pdfParser.ensureParsed((pct, msg) => onProgress?.(pct, msg));
      _competencies = result;

      // STEP 4: Store in both IndexedDB and server cache
      idbSet('competencies', {
        schemaVer: SCHEMA_VER,
        fingerprint,
        cachedAt: Date.now(),
        data: result,
      }).catch(err => console.warn('[pdfParserCache] IDB write error:', err));

      // Store in server cache (non-blocking; don't fail if server unavailable)
      try {
        await pdfCacheAPI.save(result, fingerprint);
        console.info('[pdfParserCache] Parsed data saved to server cache');
      } catch (err) {
        console.warn('[pdfParserCache] Failed to save to server cache (non-fatal):', err.message);
      }

      return _competencies;
    } catch (err) {
      console.warn('[pdfParserCache] Cache layer error, falling back to parser:', err);
      _parsePromise = null;
      const result = await pdfParser.ensureParsed(onProgress);
      _competencies = result;
      return _competencies;
    }
  })();

  return _parsePromise;
}

export async function getAllCompetencies() {
  if (!_competencies) await ensureParsed();
  return _competencies ?? [];
}

/**
 * Enhanced findCompetenciesByName:
 *
 * 1. Strip level prefixes like "(BASIC) - " or "(OC1) - "
 * 2. Expand through known aliases (e.g. "People Development" → CBS wording)
 * 3. Exact → startsWith → all-keywords → fuzzy similarity → partial fallback
 * 4. Deduplicate by (code, category) pairs before returning
 *
 * @param {string} name
 * @returns {Promise<Array>}
 */
export async function findCompetenciesByName(name) {
  if (!_competencies) await ensureParsed();
  if (!_competencies?.length) return [];

  // ── 1. Clean the incoming name ───────────────────────────────────────────
  // Strip common prefixes inserted by the UI:
  //   "(BASIC) - Discipline"  →  "Discipline"
  //   "(OC1) - Writing Effectively"  →  "Writing Effectively"
  //   "(LC3) - People Development (Creating...)"  →  "People Development (Creating...)"
  let cleanName = (name ?? '').trim();
  cleanName = cleanName.replace(/^\([A-Z]+\d*[A-Z]?\)\s*[-–]\s*/i, '');  // (CODE) - 
  cleanName = cleanName.replace(/^\([A-Z]+\)\s*/i, '');                    // (LEVEL) prefix
  cleanName = cleanName.trim();

  const needle = cleanName.toLowerCase();

  // ── 2. Exact match ───────────────────────────────────────────────────────
  const exact = _competencies.filter(c => c.name?.toLowerCase().trim() === needle);
  if (exact.length > 0) return dedupe(exact);

  // ── 3. Starts-with ───────────────────────────────────────────────────────
  const startsWith = _competencies.filter(c => c.name?.toLowerCase().trim().startsWith(needle));
  if (startsWith.length > 0) return dedupe(startsWith);

  // ── 4. All-keywords match ─────────────────────────────────────────────────
  const words = keywords(cleanName);
  if (words.length > 0) {
    const allWords = _competencies.filter(c => {
      const h = c.name?.toLowerCase() ?? '';
      return words.every(w => h.includes(w));
    });
    if (allWords.length > 0) return dedupe(allWords);
  }

  // ── 5. Alias expansion + fuzzy similarity ─────────────────────────────────
  const queries = expandAliases(cleanName);
  const THRESHOLD = 0.45;

  const scored = new Map(); // key = `${code}:${category}` → { comp, score }

  for (const q of queries) {
    for (const c of _competencies) {
      const s = similarity(q, c.name ?? '');
      const key = `${c.code}:${c.category}`;
      if (s >= THRESHOLD) {
        const existing = scored.get(key);
        if (!existing || s > existing.score) scored.set(key, { comp: c, score: s });
      }
    }
  }

  if (scored.size > 0) {
    const ranked = [...scored.values()].sort((a, b) => b.score - a.score);
    const best = ranked[0].score;

    // Return best match + any variants within 15% of best score
    const VARIANT_BAND = 0.15;
    const results = ranked
      .filter(r => r.score >= best - VARIANT_BAND)
      .map(r => r.comp);

    if (results.length > 0) return dedupe(results);
  }

  // ── 6. Partial fallback: at least one meaningful word matches ─────────────
  const partial = _competencies.filter(c => {
    const h = c.name?.toLowerCase() ?? '';
    return words.some(w => w.length > 4 && h.includes(w));
  });
  return dedupe(partial);
}

/** Remove duplicate (code + category) pairs, preserving order. */
function dedupe(arr) {
  const seen = new Set();
  return arr.filter(c => {
    const k = `${c.code}:${c.category}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Clears the IndexedDB cache and in-memory state.
 * Use in admin tools after uploading a new PDF.
 */
export async function clearCache() {
  _competencies = null;
  _parsePromise = null;
  try {
    await idbSet('competencies', null);
    console.info('[pdfParserCache] Cache cleared. Next load will re-parse the PDF.');
  } catch (err) {
    console.warn('[pdfParserCache] Failed to clear IndexedDB cache:', err);
  }
}