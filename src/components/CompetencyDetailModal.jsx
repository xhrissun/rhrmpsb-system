import React, { useState, useEffect, useCallback, useRef } from 'react';
import { findCompetencyByName, ensureParsed, isPDFAvailable } from '../lib/pdfParser';

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

  // Check if behavioral indicator appears truncated
  const bi = data.behavioralIndicator;
  const appearsTruncated = bi && bi.length > 50 && !bi.endsWith('.') && !bi.endsWith(';') && 
                          !bi.match(/\b(and|or|to|for|with|in|of|across|through)\s*$/i);

  return (
    <div style={{ animation: 'cdmSlide .2s ease-out' }}>
      {/* Behavioral Indicator Section */}
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
            <p className={`text-base leading-relaxed ${cfg.title.replace('text-', 'text-gray-')}800`}>
              {data.behavioralIndicator}
              {appearsTruncated && (
                <span className="text-gray-400 italic"> [text continues in KSAs below]</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* KSAs Section */}
      {data.items.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span>Knowledge, Skills &amp; Abilities</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${cfg.badge}`}>{data.items.length}</span>
          </h4>
          <div className="space-y-2.5">
            {data.items.map((item, idx) => {
              const m = item.match(/^(\d+)\.\s*/);
              const num = m ? m[1] : String(idx + 1);
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

export default function CompetencyDetailModal({ competencyName, competencyType, suggestedLevel, onClose }) {
  const [status, setStatus] = useState('loading');
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState('Checking…');
  const [data, setData] = useState(null);
  const [activeLevel, setActiveLevel] = useState(suggestedLevel || 'BASIC');
  const overlayRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await isPDFAvailable();
      if (!ok) { if (!cancelled) setStatus('no_pdf'); return; }
      try {
        await ensureParsed((pct, m) => { if (!cancelled) { setProgress(pct); setMsg(m); } });
        const result = await findCompetencyByName(competencyName);
        if (cancelled) return;
        if (result) {
          setData(result);
          // Use suggested level if available and has content, otherwise find first available
          if (suggestedLevel && (result.levels[suggestedLevel]?.behavioralIndicator || result.levels[suggestedLevel]?.items.length > 0)) {
            setActiveLevel(suggestedLevel);
          } else {
            const first = LEVELS.find(l => result.levels[l]?.behavioralIndicator || result.levels[l]?.items.length > 0);
            setActiveLevel(first ?? 'BASIC');
          }
          setStatus('found');
        } else {
          setStatus('not_found');
        }
      } catch { if (!cancelled) setStatus('not_found'); }
    })();
    return () => { cancelled = true; };
  }, [competencyName, suggestedLevel]);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

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
          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex-1 min-w-0 mr-4">
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
                {competencyName.replace(/^\([A-Z]+\)\s*-\s*/i, '')}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >✕</button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">

            {status === 'loading' && (
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

            {status === 'not_found' && (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="text-5xl mb-4">🔍</div>
                <h3 className="text-base font-semibold text-gray-700 mb-2">Not Found in CBS Manual</h3>
                <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
                  Could not match <strong>"{competencyName.replace(/^\([A-Z]+\)\s*-\s*/i, '')}"</strong> in the PDF. The database name may differ slightly from the manual's wording.
                </p>
                <button onClick={onClose} className="mt-6 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm">Close</button>
              </div>
            )}

            {status === 'no_pdf' && (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="text-5xl mb-4">📄</div>
                <h3 className="text-base font-semibold text-gray-700 mb-2">PDF Not Found</h3>
                <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
                  Place <code className="bg-gray-100 px-1 rounded text-xs">CBS_REGION_PENRO_CENRO.pdf</code> in the{' '}
                  <code className="bg-gray-100 px-1 rounded text-xs">/public</code> folder and redeploy.
                </p>
                <button onClick={onClose} className="mt-6 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm">Close</button>
              </div>
            )}

            {status === 'found' && data && (
              <>
                {/* Level Tabs */}
                <div className="sticky top-0 bg-white border-b border-gray-100 px-6 pt-4 pb-3 z-10">
                  <div className="flex flex-wrap gap-2">
                    {LEVELS.map(level => {
                      const cfg = LEVEL_CFG[level];
                      const ld = data.levels[level];
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

                {/* Content Area */}
                <div className="p-6">
                  <LevelPanel level={activeLevel} data={data.levels[activeLevel]} />
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          {status === 'found' && data && (
            <div className="flex-shrink-0 border-t border-gray-100 px-6 py-3 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">Source: CBS Manual · {data.code}</p>
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
