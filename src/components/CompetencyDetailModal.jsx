import React, { useState, useEffect, useCallback, useRef } from 'react';
import { findCompetenciesByName, findCompetencyByCode, getAllCompetencies, ensureParsed, isPDFAvailable } from '../lib/pdfParser';

const LEVELS = ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'SUPERIOR'];

const LEVEL_CFG = {
  BASIC: {
    icon: '🌱', label: 'Basic',
    sub: 'Entry-level understanding and application',
    tab:    'bg-emerald-600 text-white shadow-sm shadow-emerald-200',
    tabOff: 'text-emerald-700 hover:bg-emerald-50 border border-emerald-200',
    card:   'border-l-4 border-emerald-500 bg-gradient-to-r from-emerald-50 to-white',
    badge:  'bg-emerald-100 text-emerald-700',
    num:    'bg-emerald-100 text-emerald-700',
    title:  'text-emerald-800',
    dot:    'bg-emerald-500',
  },
  INTERMEDIATE: {
    icon: '🌿', label: 'Intermediate',
    sub: 'Applies concepts independently',
    tab:    'bg-teal-600 text-white shadow-sm shadow-teal-200',
    tabOff: 'text-teal-700 hover:bg-teal-50 border border-teal-200',
    card:   'border-l-4 border-teal-500 bg-gradient-to-r from-teal-50 to-white',
    badge:  'bg-teal-100 text-teal-700',
    num:    'bg-teal-100 text-teal-700',
    title:  'text-teal-800',
    dot:    'bg-teal-500',
  },
  ADVANCED: {
    icon: '🌳', label: 'Advanced',
    sub: 'Leads implementation and coaches others',
    tab:    'bg-blue-600 text-white shadow-sm shadow-blue-200',
    tabOff: 'text-blue-700 hover:bg-blue-50 border border-blue-200',
    card:   'border-l-4 border-blue-500 bg-gradient-to-r from-blue-50 to-white',
    badge:  'bg-blue-100 text-blue-700',
    num:    'bg-blue-100 text-blue-700',
    title:  'text-blue-800',
    dot:    'bg-blue-500',
  },
  SUPERIOR: {
    icon: '🏔️', label: 'Superior',
    sub: 'Formulates policy and drives strategic direction',
    tab:    'bg-violet-600 text-white shadow-sm shadow-violet-200',
    tabOff: 'text-violet-700 hover:bg-violet-50 border border-violet-200',
    card:   'border-l-4 border-violet-500 bg-gradient-to-r from-violet-50 to-white',
    badge:  'bg-violet-100 text-violet-700',
    num:    'bg-violet-100 text-violet-700',
    title:  'text-violet-800',
    dot:    'bg-violet-500',
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

// Category color mapping for visual distinction
const CATEGORY_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-400', badge: 'bg-blue-100 text-blue-700' },
  { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', dot: 'bg-violet-400', badge: 'bg-violet-100 text-violet-700' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-400', badge: 'bg-amber-100 text-amber-700' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-400', badge: 'bg-rose-100 text-rose-700' },
  { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', dot: 'bg-teal-400', badge: 'bg-teal-100 text-teal-700' },
  { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-400', badge: 'bg-indigo-100 text-indigo-700' },
  { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-400', badge: 'bg-orange-100 text-orange-700' },
];

// ─────────────────────────────────────────────────────────────────────────────
// LevelPanel — renders one proficiency level's content
// ─────────────────────────────────────────────────────────────────────────────

function LevelPanel({ level, data }) {
  const cfg = LEVEL_CFG[level];
  if (!data) return null;
  const empty = !data.behavioralIndicator && !data.items.length;

  if (empty) return (
    <div className={`rounded-xl p-10 text-center border border-dashed border-gray-200`}>
      <p className="text-4xl mb-3">{cfg.icon}</p>
      <p className="text-sm font-medium text-gray-400">No content defined for this level.</p>
    </div>
  );

  return (
    <div style={{ animation: 'cdmSlide .22s cubic-bezier(.4,0,.2,1)' }}>
      {data.behavioralIndicator && (
        <div className={`rounded-2xl p-6 mb-6 ${cfg.card}`}>
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-white shadow-sm flex items-center justify-center text-2xl border border-gray-100">
              {cfg.icon}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className={`text-base font-bold ${cfg.title}`}>{cfg.label} Proficiency</h3>
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.badge}`}>
                  {cfg.sub}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-gray-600">
                {data.behavioralIndicator}
              </p>
            </div>
          </div>
        </div>
      )}

      {data.items.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Knowledge, Skills &amp; Abilities
            </h4>
            <div className="flex-1 h-px bg-gray-100"/>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
              {data.items.length} {data.items.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <div className="space-y-2">
            {data.items.map((item, idx) => {
              const m = item.match(/^(\d+)\.\s*/);
              const num  = m ? m[1] : String(idx + 1);
              const text = m ? item.slice(m[0].length) : item;
              return (
                <div
                  key={idx}
                  className="group flex gap-3 p-4 rounded-xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-150"
                >
                  <div className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold font-mono mt-0.5 ${cfg.num}`}>
                    {num}
                  </div>
                  <p className="text-gray-700 text-sm leading-relaxed">{text}</p>
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
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            i === activeIdx
              ? 'bg-amber-500 text-white shadow-sm'
              : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <span className="font-mono">{v.code}</span>
          <span className="opacity-60">·</span>
          <span>{v.category}</span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CompetencyCard — individual card in the browser list
// ─────────────────────────────────────────────────────────────────────────────

function CompetencyCard({ comp, categoryColor, onClick }) {
  const ksaCount = comp.levels
    ? Object.values(comp.levels).reduce((sum, l) => sum + (l?.items?.length || 0), 0)
    : 0;

  const levelsWithContent = comp.levels
    ? LEVELS.filter(l => comp.levels[l]?.behavioralIndicator || comp.levels[l]?.items?.length > 0)
    : [];

  return (
    <button
      onClick={onClick}
      className="w-full text-left group"
    >
      <div className="p-4 bg-white border border-gray-100 rounded-xl hover:border-blue-200 hover:shadow-lg transition-all duration-200 relative overflow-hidden">
        {/* Subtle left accent */}
        <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${categoryColor.dot} opacity-0 group-hover:opacity-100 transition-opacity`}/>

        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 px-2 py-1 rounded-md text-xs font-mono font-bold ${categoryColor.badge} mt-0.5`}>
            {comp.code}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 leading-snug group-hover:text-blue-700 transition-colors">
              {comp.name}
            </p>
            {levelsWithContent.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex gap-1">
                  {levelsWithContent.map(l => (
                    <span
                      key={l}
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${LEVEL_CFG[l].badge}`}
                    >
                      {LEVEL_CFG[l].label.slice(0, 3)}
                    </span>
                  ))}
                </div>
                {ksaCount > 0 && (
                  <span className="text-[11px] text-gray-400">{ksaCount} KSAs</span>
                )}
              </div>
            )}
          </div>
          <svg
            className="w-4 h-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BrowserMode - Redesigned CBS Manual Browser
// ─────────────────────────────────────────────────────────────────────────────

function BrowserMode({ onSelectCompetency, onClose }) {
  const [allCompetencies, setAllCompetencies] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const searchRef = useRef(null);

  useEffect(() => {
    const loadAll = async () => {
      try {
        const comps = await getAllCompetencies();
        setAllCompetencies(comps);
        // Expand first category by default
        if (comps.length > 0) {
          const firstCat = comps[0].category;
          setExpandedCategories(new Set([firstCat]));
        }
      } catch (error) {
        console.error('Failed to load all competencies:', error);
      } finally {
        setLoading(false);
        setTimeout(() => searchRef.current?.focus(), 100);
      }
    };
    loadAll();
  }, []);

  const categories = [...new Set(allCompetencies.map(c => c.category))].sort();

  // Build category→color map
  const categoryColorMap = {};
  categories.forEach((cat, i) => {
    categoryColorMap[cat] = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
  });

  // Deduplicate
  const deduped = [];
  const seenKeys = new Set();
  for (const comp of allCompetencies) {
    const key = `${comp.code}::${comp.name}::${comp.category}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      deduped.push(comp);
    }
  }

  const isSearching = searchTerm.trim().length > 0 || filterCategory !== '';

  const filtered = deduped.filter(comp => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = !q ||
      comp.name.toLowerCase().includes(q) ||
      comp.code.toLowerCase().includes(q);
    const matchesCategory = !filterCategory || comp.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedByCategory = filtered.reduce((acc, comp) => {
    if (!acc[comp.category]) acc[comp.category] = [];
    acc[comp.category].push(comp);
    return acc;
  }, {});

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Auto-expand all when searching
  useEffect(() => {
    if (isSearching) {
      setExpandedCategories(new Set(categories));
    }
  }, [isSearching]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="relative w-16 h-16 mb-5">
          <div className="absolute inset-0 rounded-full border-4 border-blue-100"/>
          <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"/>
          <div className="absolute inset-0 flex items-center justify-center text-2xl">📚</div>
        </div>
        <p className="text-base font-semibold text-gray-700">Loading CBS Manual</p>
        <p className="text-sm text-gray-400 mt-1">Parsing competency data…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Search & Filter Bar ──────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
        {/* Search input */}
        <div className="relative mb-3">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z"/>
            </svg>
          </div>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search by competency name or code…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm placeholder-gray-400 shadow-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>

        {/* Category pills */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterCategory('')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              filterCategory === ''
                ? 'bg-gray-800 text-white'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            All ({deduped.length})
          </button>
          {categories.map((cat, i) => {
            const cc = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
            const count = deduped.filter(c => c.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  filterCategory === cat
                    ? `${cc.bg} ${cc.text} border ${cc.border} shadow-sm`
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Results ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-3xl mb-4">🔍</div>
            <p className="font-semibold text-gray-700 mb-1">No competencies found</p>
            <p className="text-sm text-gray-400">Try a different search term or category</p>
            <button
              onClick={() => { setSearchTerm(''); setFilterCategory(''); }}
              className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupedByCategory).map(([category, comps]) => {
              const cc = categoryColorMap[category];
              const isExpanded = isSearching || expandedCategories.has(category);

              return (
                <div key={category} className="rounded-xl overflow-hidden border border-gray-100">
                  {/* Category Header */}
                  <button
                    onClick={() => !isSearching && toggleCategory(category)}
                    className={`w-full flex items-center justify-between px-4 py-3 ${cc.bg} ${!isSearching ? 'hover:opacity-90 transition-opacity' : ''} cursor-${isSearching ? 'default' : 'pointer'}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2 h-2 rounded-full ${cc.dot}`}/>
                      <span className={`text-sm font-bold ${cc.text}`}>{category}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cc.badge}`}>
                        {comps.length}
                      </span>
                    </div>
                    {!isSearching && (
                      <svg
                        className={`w-4 h-4 ${cc.text} transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                      </svg>
                    )}
                  </button>

                  {/* Competency List */}
                  {isExpanded && (
                    <div className="divide-y divide-gray-50 bg-white">
                      {comps.map((comp, idx) => (
                        <div key={`${comp.code}-${idx}`} className="px-3 py-2">
                          <CompetencyCard
                            comp={comp}
                            categoryColor={cc}
                            onClick={() => onSelectCompetency(comp)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Browser Footer ───────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {filtered.length} of {deduped.length} competencies
          {searchTerm && <span className="ml-1">matching "<span className="text-gray-600 font-medium">{searchTerm}</span>"</span>}
        </p>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 rounded-lg text-xs font-medium transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Back to competency
        </button>
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
  directComp = null,
}) {
  const [status,       setStatus]       = useState('loading');
  const resolvedRef                     = useRef(false);
  const fromBrowserRef                  = useRef(false);
  const [progress,     setProgress]     = useState(0);
  const [msg,          setMsg]          = useState('Checking…');
  const [variants,     setVariants]     = useState([]);
  const [variantIdx,   setVariantIdx]   = useState(0);
  const [activeLevel,  setActiveLevel]  = useState(suggestedLevel || 'BASIC');
  const [isBrowsing,   setIsBrowsing]   = useState(browseMode);
  const overlayRef                      = useRef(null);

  const data = variants[variantIdx] ?? null;

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

  useEffect(() => {
    if (isBrowsing) { setStatus('browsing'); return; }
    if (directComp) {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setVariants([directComp]);
      setVariantIdx(0);
      setActiveLevel(resolveActiveLevel(directComp, suggestedLevel));
      setStatus('found');
      return;
    }
    if (fromBrowserRef.current) return;
    if (resolvedRef.current) return;

    let cancelled = false;
    (async () => {
      const ok = await isPDFAvailable();
      if (!ok) { if (!cancelled) setStatus('no_pdf'); return; }
      try {
        await ensureParsed((pct, m) => { if (!cancelled) { setProgress(pct); setMsg(m); } });
        const cleanName = competencyName?.replace(/^\([A-Z]+\)\s*[-–]\s*/i, '').trim() ?? competencyName;
        const results = await findCompetenciesByName(cleanName);
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

  const handleSelectCompetency = useCallback(async (comp) => {
    resolvedRef.current = false;
    fromBrowserRef.current = true;
    setStatus('loading');
    setVariants([]);
    setIsBrowsing(false);
    try {
      const allParsed = await ensureParsed();
      const sameCode  = allParsed.filter(c => c.code.toUpperCase() === comp.code.toUpperCase());
      const resolved  = sameCode.length > 0 ? sameCode : [comp];
      resolvedRef.current = true;
      setVariants(resolved);
      setVariantIdx(0);
      setActiveLevel(resolveActiveLevel(resolved[0], null));
      setStatus('found');
    } catch {
      resolvedRef.current = true;
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
  const displayName = data?.name
    ?? (competencyName?.replace(/^\([A-Z]+\)\s*-\s*/i, '') || 'CBS Manual Browser');

  return (
    <>
      <style>{`
        @keyframes cdmSlide  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes cdmIn     { from{opacity:0;transform:scale(.96) translateY(12px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes cdmFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes shimmer   { from{background-position:-200% 0} to{background-position:200% 0} }
      `}</style>

      <div
        ref={overlayRef}
        onClick={e => { if (e.target === overlayRef.current) onClose(); }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
        style={{ animation: 'cdmFadeIn .15s ease-out' }}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden"
          style={{ animation: 'cdmIn .22s cubic-bezier(.4,0,.2,1)' }}
        >
          {/* ── Header ──────────────────────────────────────────────── */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex-1 min-w-0 mr-3">
              {isBrowsing ? (
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-lg">📚</span>
                    <h2 className="text-lg font-bold text-gray-900">CBS Manual Browser</h2>
                  </div>
                  <p className="text-xs text-gray-400 ml-7">Browse and search all competencies in the manual</p>
                </div>
              ) : (
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {competencyType && (
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${TYPE_COLOR[competencyType] ?? 'bg-gray-100 text-gray-700'}`}>
                        {TYPE_LABEL[competencyType] ?? competencyType}
                      </span>
                    )}
                    {data?.code && (
                      <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {data.code}
                      </span>
                    )}
                    {data?.category && (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                        {data.category}
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 leading-snug">
                    {displayName}
                  </h2>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {!isBrowsing && status === 'found' && (
                <button
                  onClick={() => setIsBrowsing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 rounded-lg text-xs font-medium transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h8"/>
                  </svg>
                  Browse Manual
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ── Body ────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* Browse Mode */}
            {isBrowsing && (
              <BrowserMode
                onSelectCompetency={handleSelectCompetency}
                onClose={() => {
                  if (variants.length > 0 && status === 'found') setIsBrowsing(false);
                  else onClose();
                }}
              />
            )}

            {/* Loading */}
            {status === 'loading' && !isBrowsing && (
              <div className="p-6">
                <div className="flex items-center gap-4 mb-5 p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <div className="relative w-10 h-10 flex-shrink-0">
                    <div className="absolute inset-0 rounded-full border-3 border-blue-200"/>
                    <div className="absolute inset-0 rounded-full border-3 border-blue-500 border-t-transparent animate-spin" style={{ borderWidth: 3 }}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-blue-800">Parsing CBS Manual</p>
                    <p className="text-xs text-blue-500 truncate">{msg}</p>
                  </div>
                  <span className="text-sm font-bold font-mono text-blue-600">{progress}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 text-center mb-6">
                  First load parses all pages once — subsequent lookups are instant.
                </p>
                <div className="space-y-3 animate-pulse">
                  <div className="flex gap-2">
                    {[1,2,3,4].map(i => <div key={i} className="h-9 bg-gray-100 rounded-lg flex-1"/>)}
                  </div>
                  <div className="h-20 bg-gray-50 rounded-xl border border-gray-100"/>
                  {[1,2,3].map(i => <div key={i} className="h-14 bg-gray-50 rounded-xl border border-gray-100"/>)}
                </div>
              </div>
            )}

            {/* Not found */}
            {status === 'not_found' && !isBrowsing && (
              <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-3xl mb-4">🔍</div>
                <h3 className="text-base font-bold text-gray-800 mb-2">Competency Not Found</h3>
                <p className="text-sm text-gray-500 max-w-sm leading-relaxed mb-6">
                  Could not match{' '}
                  <strong className="text-gray-700">
                    "{competencyName?.replace(/^\([A-Z]+\)\s*-\s*/i, '')}"
                  </strong>{' '}
                  in the CBS Manual. The database name may differ slightly from the manual's wording.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsBrowsing(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
                  >
                    Browse Full Manual
                  </button>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* No PDF */}
            {status === 'no_pdf' && !isBrowsing && (
              <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-3xl mb-4">📄</div>
                <h3 className="text-base font-bold text-gray-800 mb-2">PDF Not Loaded</h3>
                <p className="text-sm text-gray-500 max-w-xs leading-relaxed mb-2">
                  Place <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">2025_CBS.pdf</code> in the{' '}
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">/public/rhrmpsb-system</code>{' '}
                  folder and redeploy.
                </p>
                <button onClick={onClose} className="mt-5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">
                  Close
                </button>
              </div>
            )}

            {/* Found */}
            {status === 'found' && !isBrowsing && data && (
              <>
                {/* Multi-variant warning */}
                {isMultiVariant && (
                  <div className="mx-5 mt-4 flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <span className="text-xl flex-shrink-0">⚠️</span>
                    <div>
                      <p className="text-sm font-bold text-amber-800 mb-0.5">
                        {variants.length} variants found in the CBS Manual
                      </p>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        The manual contains multiple versions of <em>"{displayName}"</em> under different office
                        contexts ({variants.map(v => v.category).join(', ')}). Each variant may have different
                        behavioral indicators and KSAs.
                      </p>
                    </div>
                  </div>
                )}

                {isMultiVariant && (
                  <VariantTabs variants={variants} activeIdx={variantIdx} onChange={handleVariantChange} />
                )}

                {/* Level tabs */}
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-5 pt-4 pb-3">
                  <div className="flex flex-wrap gap-2">
                    {LEVELS.map(level => {
                      const cfg = LEVEL_CFG[level];
                      const ld  = data.levels[level];
                      const has = ld?.behavioralIndicator || ld?.items?.length > 0;
                      const isActive = activeLevel === level;
                      return (
                        <button
                          key={level}
                          onClick={() => setActiveLevel(level)}
                          disabled={!has}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150
                            ${isActive ? cfg.tab : cfg.tabOff}
                            ${!has ? 'opacity-25 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <span className="text-base">{cfg.icon}</span>
                          <span>{cfg.label}</span>
                          {has && ld.items?.length > 0 && (
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${isActive ? 'bg-white/25 text-white' : cfg.badge}`}>
                              {ld.items.length}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-5">
                  <LevelPanel level={activeLevel} data={data.levels[activeLevel]} />
                </div>
              </>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────────── */}
          {status === 'found' && !isBrowsing && data && (
            <div className="flex-shrink-0 border-t border-gray-100 px-5 py-3 bg-gray-50/60 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Source: CBS Manual
                {data.code && <span className="ml-1 font-mono font-semibold text-gray-500">{data.code}</span>}
                {isMultiVariant && (
                  <span className="ml-2 text-amber-600 font-medium">
                    · Variant {variantIdx + 1}/{variants.length} — {data.category}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsBrowsing(true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h8"/>
                  </svg>
                  Browse Manual
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
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
