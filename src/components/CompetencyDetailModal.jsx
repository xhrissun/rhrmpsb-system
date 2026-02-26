import React, { useState, useEffect, useCallback, useRef } from 'react';
import { findCompetenciesByName, findCompetencyByCode, getAllCompetencies, ensureParsed, isPDFAvailable } from '../lib/pdfParser';

const LEVELS = ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'SUPERIOR'];

const LEVEL_CFG = {
  BASIC: {
    icon: '🌱', label: 'Basic',
    sub: 'Entry-level understanding and application',
    tab:    'bg-emerald-600 text-white',
    tabOff: 'text-emerald-700 hover:bg-emerald-50 border border-emerald-200',
    card:   'border-l-4 border-emerald-500 bg-emerald-50',
    badge:  'bg-emerald-100 text-emerald-800',
    num:    'bg-emerald-100 text-emerald-700',
    title:  'text-emerald-800',
  },
  INTERMEDIATE: {
    icon: '🌿', label: 'Intermediate',
    sub: 'Applies concepts independently',
    tab:    'bg-teal-600 text-white',
    tabOff: 'text-teal-700 hover:bg-teal-50 border border-teal-200',
    card:   'border-l-4 border-teal-500 bg-teal-50',
    badge:  'bg-teal-100 text-teal-800',
    num:    'bg-teal-100 text-teal-700',
    title:  'text-teal-800',
  },
  ADVANCED: {
    icon: '🌳', label: 'Advanced',
    sub: 'Leads implementation and coaches others',
    tab:    'bg-blue-600 text-white',
    tabOff: 'text-blue-700 hover:bg-blue-50 border border-blue-200',
    card:   'border-l-4 border-blue-500 bg-blue-50',
    badge:  'bg-blue-100 text-blue-800',
    num:    'bg-blue-100 text-blue-700',
    title:  'text-blue-800',
  },
  SUPERIOR: {
    icon: '🏔️', label: 'Superior',
    sub: 'Formulates policy and drives strategic direction',
    tab:    'bg-violet-600 text-white',
    tabOff: 'text-violet-700 hover:bg-violet-50 border border-violet-200',
    card:   'border-l-4 border-violet-500 bg-violet-50',
    badge:  'bg-violet-100 text-violet-800',
    num:    'bg-violet-100 text-violet-700',
    title:  'text-violet-800',
  },
};

const TYPE_COLOR = {
  basic:          'bg-blue-100 text-blue-800',
  organizational: 'bg-purple-100 text-purple-800',
  leadership:     'bg-indigo-100 text-indigo-800',
  minimum:        'bg-orange-100 text-orange-800',
};

const TYPE_LABEL = {
  basic:          'Core (Psycho-Social)',
  organizational: 'Organizational',
  leadership:     'Leadership',
  minimum:        'Minimum',
};

// ─────────────────────────────────────────────────────────────────────────────
// LevelPanel — renders one proficiency level's content
// ─────────────────────────────────────────────────────────────────────────────

function LevelPanel({ level, data }) {
  const cfg = LEVEL_CFG[level];
  if (!data) return null;
  const empty = !data.behavioralIndicator && !data.items.length;

  if (empty) return (
    <div className={`rounded-xl p-8 text-center ${cfg.card}`}>
      <p className="text-3xl mb-2">{cfg.icon}</p>
      <p className={`text-sm ${cfg.title}`}>No content for this level.</p>
    </div>
  );

  return (
    <div style={{ animation: 'cdmSlide .2s ease-out' }}>
      {data.behavioralIndicator && (
        <div className={`rounded-xl p-6 mb-6 ${cfg.card}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">{cfg.icon}</span>
            <div>
              <h3 className={`text-lg font-bold ${cfg.title}`}>{cfg.label} Level</h3>
              <p className="text-xs text-gray-500">{cfg.sub}</p>
            </div>
          </div>
          <div className="pl-9">
            <p className="text-base leading-relaxed text-gray-700">
              {data.behavioralIndicator}
            </p>
          </div>
        </div>
      )}

      {data.items.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span>Knowledge, Skills &amp; Abilities</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${cfg.badge}`}>{data.items.length}</span>
          </h4>
          <div className="space-y-2.5">
            {data.items.map((item, idx) => {
              const m = item.match(/^(\d+)\.\s*/);
              const num  = m ? m[1] : String(idx + 1);
              const text = m ? item.slice(m[0].length) : item;
              return (
                <div key={idx} className="flex gap-3 p-4 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-mono ${cfg.num}`}>
                    {num}
                  </div>
                  <p className="text-gray-700 text-sm leading-relaxed pt-0.5">{text}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VariantTabs — when multiple CBS variants exist
// ─────────────────────────────────────────────────────────────────────────────

function VariantTabs({ variants, activeIdx, onChange }) {
  if (variants.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-2 px-6 pt-4">
      {variants.map((v, i) => (
        <button
          key={`${v.code}-${i}`}
          onClick={() => onChange(i)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            i === activeIdx
              ? 'bg-amber-500 text-white border-amber-500 shadow'
              : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
          }`}
        >
          <span className="font-mono">{v.code}</span>
          <span className="opacity-75">·</span>
          <span>{v.category}</span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser Mode - Full CBS Manual Browser
// ─────────────────────────────────────────────────────────────────────────────

function BrowserMode({ onSelectCompetency, onClose }) {
  const [allCompetencies, setAllCompetencies] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAll = async () => {
      try {
        const comps = await getAllCompetencies();
        setAllCompetencies(comps);
      } catch (error) {
        console.error('Failed to load all competencies:', error);
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, []);

  const categories = [...new Set(allCompetencies.map(c => c.category))].sort();

  const filtered = allCompetencies.filter(comp => {
    const matchesSearch = searchTerm === '' || 
      comp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      comp.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === '' || comp.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Deduplicate for display: group by code+name, show unique entries
  // but keep all variants accessible via the comp object
  const dedupedFiltered = [];
  const seenKeys = new Set();
  for (const comp of filtered) {
    const key = `${comp.code}::${comp.name}::${comp.category}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      dedupedFiltered.push(comp);
    }
  }

  const groupedByCategory = dedupedFiltered.reduce((acc, comp) => {
    if (!acc[comp.category]) acc[comp.category] = [];
    acc[comp.category].push(comp);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <svg className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          <p className="text-gray-600">Loading CBS Manual...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search and Filter */}
      <div className="px-6 py-4 border-b border-gray-200 space-y-3">
        <input
          type="text"
          placeholder="🔍 Search by competency name or code..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <div className="flex gap-2">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">All Categories ({allCompetencies.length} total)</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat} ({allCompetencies.filter(c => c.category === cat).length})
              </option>
            ))}
          </select>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
          >
            Exit Browser
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Showing {dedupedFiltered.length} of {allCompetencies.length} competencies
        </p>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {dedupedFiltered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-5xl mb-3">🔍</div>
            <p className="font-medium">No competencies found</p>
            <p className="text-sm mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedByCategory).map(([category, comps]) => (
              <div key={category}>
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 pb-2 border-b border-gray-200">
                  {category} ({comps.length})
                </h3>
                <div className="space-y-2">
                  {comps.map((comp, idx) => (
                    <button
                      key={`${comp.code}-${idx}`}
                      onClick={() => onSelectCompetency(comp)}
                      className="w-full text-left p-3 bg-white border border-gray-200 rounded-lg hover:shadow-md hover:border-blue-300 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-mono font-semibold">
                              {comp.code}
                            </span>
                            {comp.levels && (
                              <span className="text-xs text-gray-500">
                                {Object.values(comp.levels).reduce((sum, level) => sum + (level.items?.length || 0), 0)} KSAs
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-900 leading-snug">
                            {comp.name}
                          </p>
                        </div>
                        <span className="text-blue-600 text-xl flex-shrink-0">→</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main modal
// ─────────────────────────────────────────────────────────────────────────────

export default function CompetencyDetailModal({
  competencyName,
  competencyType,
  suggestedLevel,
  onClose,
  browseMode = false,
  // NEW: pass a pre-resolved comp object to skip the search entirely
  directComp = null,
}) {
  const [status,       setStatus]       = useState('loading');
  const [progress,     setProgress]     = useState(0);
  const [msg,          setMsg]          = useState('Checking…');
  const [variants,     setVariants]     = useState([]);
  const [variantIdx,   setVariantIdx]   = useState(0);
  const [activeLevel,  setActiveLevel]  = useState(suggestedLevel || 'BASIC');
  const [isBrowsing,   setIsBrowsing]   = useState(browseMode);
  const overlayRef = useRef(null);

  const data = variants[variantIdx] ?? null;

  // ── Resolve which level to show first given a comp ────────────────────────
  const resolveActiveLevel = useCallback((comp, preferred) => {
    if (
      preferred &&
      (comp.levels[preferred]?.behavioralIndicator ||
       comp.levels[preferred]?.items.length > 0)
    ) {
      return preferred;
    }
    return LEVELS.find(l =>
      comp.levels[l]?.behavioralIndicator || comp.levels[l]?.items.length > 0
    ) ?? 'BASIC';
  }, []);

  // Initial load
  useEffect(() => {
    if (isBrowsing) {
      setStatus('browsing');
      return;
    }

    // ── FAST PATH: comp object was passed directly (from browser click) ──
    if (directComp) {
      setVariants([directComp]);
      setVariantIdx(0);
      setActiveLevel(resolveActiveLevel(directComp, suggestedLevel));
      setStatus('found');
      return;
    }

    // ── NORMAL PATH: look up by name ──────────────────────────────────────
    let cancelled = false;
    (async () => {
      const ok = await isPDFAvailable();
      if (!ok) { if (!cancelled) setStatus('no_pdf'); return; }
      try {
        await ensureParsed((pct, m) => { if (!cancelled) { setProgress(pct); setMsg(m); } });
        const results = await findCompetenciesByName(competencyName);
        if (cancelled) return;

        if (results.length > 0) {
          setVariants(results);
          setVariantIdx(0);
          setActiveLevel(resolveActiveLevel(results[0], suggestedLevel));
          setStatus('found');
        } else {
          setStatus('not_found');
        }
      } catch { if (!cancelled) setStatus('not_found'); }
    })();
    return () => { cancelled = true; };
  }, [competencyName, suggestedLevel, isBrowsing, directComp, resolveActiveLevel]);

  const handleVariantChange = useCallback((idx) => {
    setVariantIdx(idx);
    setActiveLevel(resolveActiveLevel(variants[idx], null));
  }, [variants, resolveActiveLevel]);

  // ── When user clicks a comp in the browser ────────────────────────────────
  // We now need to find ALL variants for that code so VariantTabs works.
  const handleSelectCompetency = useCallback(async (comp) => {
    setStatus('loading');
    setMsg('Loading competency…');
    setIsBrowsing(false);

    try {
      // Fetch all CBS entries with the same code to support variant tabs
      const allParsed = await ensureParsed();
      const sameCode  = allParsed.filter(c => c.code.toUpperCase() === comp.code.toUpperCase());
      const resolved  = sameCode.length > 0 ? sameCode : [comp];

      setVariants(resolved);
      setVariantIdx(0);
      setActiveLevel(resolveActiveLevel(resolved[0], null));
      setStatus('found');
    } catch {
      // Fallback: just show the clicked comp directly
      setVariants([comp]);
      setVariantIdx(0);
      setActiveLevel(resolveActiveLevel(comp, null));
      setStatus('found');
    }
  }, [resolveActiveLevel]);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const isMultiVariant = variants.length > 1;

  // Derive display name: prefer the current variant's name, else prop
  const displayName = data?.name
    ?? (competencyName?.replace(/^\([A-Z]+\)\s*-\s*/i, '') || 'CBS Manual Browser');

  return (
    <>
      <style>{`
        @keyframes cdmSlide  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes cdmIn     { from{opacity:0;transform:scale(.97) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes cdmFadeIn { from{opacity:0} to{opacity:1} }
      `}</style>

      <div
        ref={overlayRef}
        onClick={e => { if (e.target === overlayRef.current) onClose(); }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
        style={{ animation: 'cdmFadeIn .15s ease-out' }}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden"
          style={{ animation: 'cdmIn .2s ease-out' }}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex-1 min-w-0 mr-4">
              {!isBrowsing && (
                <>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {competencyType && (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${TYPE_COLOR[competencyType] ?? 'bg-gray-100 text-gray-700'}`}>
                        {TYPE_LABEL[competencyType] ?? competencyType}
                      </span>
                    )}
                    {data?.code && (
                      <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{data.code}</span>
                    )}
                    {data?.category && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">{data.category}</span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 leading-snug">
                    {displayName}
                  </h2>
                </>
              )}
              {isBrowsing && (
                <h2 className="text-xl font-bold text-gray-900 leading-snug flex items-center gap-2">
                  <span>📚</span> Browse CBS Manual
                </h2>
              )}
            </div>
            <div className="flex items-center gap-2">
              {status === 'found' && !isBrowsing && (
                <button
                  onClick={() => setIsBrowsing(true)}
                  className="px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-xs font-medium transition-colors"
                  title="Browse all competencies in the CBS manual"
                >
                  Browse Manual
                </button>
              )}
              <button
                onClick={onClose}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >✕</button>
            </div>
          </div>

          {/* ── Body ───────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto">
            {/* Browse Mode */}
            {isBrowsing && (
              <BrowserMode
                onSelectCompetency={handleSelectCompetency}
                onClose={() => {
                  if (variants.length > 0 && status === 'found') {
                    setIsBrowsing(false);
                  } else {
                    onClose();
                  }
                }}
              />
            )}

            {/* Loading */}
            {status === 'loading' && !isBrowsing && (
              <div className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <svg className="w-5 h-5 animate-spin text-blue-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">Parsing CBS manual…</p>
                    <p className="text-xs text-gray-400">{msg}</p>
                  </div>
                  <span className="text-xs font-mono text-gray-400">{progress}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-5">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}/>
                </div>
                <p className="text-xs text-gray-400 text-center mb-5">First load parses all pages once — subsequent clicks are instant.</p>
                <div className="animate-pulse space-y-3">
                  <div className="flex gap-2">{[1,2,3,4].map(i=><div key={i} className="h-9 bg-gray-200 rounded-lg flex-1"/>)}</div>
                  <div className="h-16 bg-gray-100 rounded-xl"/>
                  {[1,2,3].map(i=><div key={i} className="h-12 bg-gray-100 rounded-lg"/>)}
                </div>
              </div>
            )}

            {/* Not found */}
            {status === 'not_found' && !isBrowsing && (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="text-5xl mb-4">🔍</div>
                <h3 className="text-base font-semibold text-gray-700 mb-2">Not Found in CBS Manual</h3>
                <p className="text-sm text-gray-400 max-w-xs leading-relaxed mb-6">
                  Could not match <strong>"{competencyName?.replace(/^\([A-Z]+\)\s*-\s*/i, '')}"</strong> in the PDF. The database name may differ slightly from the manual's wording.
                </p>
                <button
                  onClick={() => setIsBrowsing(true)}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm mb-2"
                >
                  Browse Full CBS Manual
                </button>
                <button onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm">Close</button>
              </div>
            )}

            {/* No PDF */}
            {status === 'no_pdf' && !isBrowsing && (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="text-5xl mb-4">📄</div>
                <h3 className="text-base font-semibold text-gray-700 mb-2">PDF Not Found</h3>
                <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
                  Place <code className="bg-gray-100 px-1 rounded text-xs">2025_CBS.pdf</code> in the{' '}
                  <code className="bg-gray-100 px-1 rounded text-xs">/public/rhrmpsb-system</code> folder and redeploy.
                </p>
                <button onClick={onClose} className="mt-6 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm">Close</button>
              </div>
            )}

            {/* Found */}
            {status === 'found' && !isBrowsing && data && (
              <>
                {isMultiVariant && (
                  <div className="mx-6 mt-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-300">
                    <span className="text-xl flex-shrink-0">⚠️</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-amber-800">
                        Multiple CBS entries found for this competency code
                      </p>
                      <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                        The CBS manual contains <strong>{variants.length} different versions</strong> of{' '}
                        <em>"{displayName}"</em> under different office contexts
                        ({variants.map(v => v.category).join(', ')}). Each version may have different
                        behavioral indicators and KSAs. Use the tabs below to review all variants.
                      </p>
                    </div>
                  </div>
                )}

                {isMultiVariant && (
                  <VariantTabs
                    variants={variants}
                    activeIdx={variantIdx}
                    onChange={handleVariantChange}
                  />
                )}

                <div className="sticky top-0 bg-white border-b border-gray-100 px-6 pt-4 pb-3 z-10">
                  <div className="flex flex-wrap gap-2">
                    {LEVELS.map(level => {
                      const cfg = LEVEL_CFG[level];
                      const ld  = data.levels[level];
                      const has = ld?.behavioralIndicator || ld?.items.length > 0;
                      return (
                        <button
                          key={level}
                          onClick={() => setActiveLevel(level)}
                          disabled={!has}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all
                            ${activeLevel === level ? cfg.tab : cfg.tabOff}
                            ${!has ? 'opacity-30 cursor-not-allowed' : ''}`}
                        >
                          <span>{cfg.icon}</span>
                          <span>{cfg.label}</span>
                          {has && ld.items.length > 0 && (
                            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${activeLevel === level ? 'bg-white/25' : cfg.badge}`}>
                              {ld.items.length}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-6">
                  <LevelPanel level={activeLevel} data={data.levels[activeLevel]} />
                </div>
              </>
            )}
          </div>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          {status === 'found' && !isBrowsing && data && (
            <div className="flex-shrink-0 border-t border-gray-100 px-6 py-3 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Source: CBS Manual · {data.code}
                  {isMultiVariant && (
                    <span className="ml-2 text-amber-600 font-medium">
                      · Showing variant {variantIdx + 1} of {variants.length} ({data.category})
                    </span>
                  )}
                </p>
                <button onClick={onClose} className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm transition-colors">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
