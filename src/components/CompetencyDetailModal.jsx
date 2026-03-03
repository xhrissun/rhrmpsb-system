import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { findCompetenciesByName, getAllCompetencies, ensureParsed, isPDFAvailable } from '../lib/pdfParserCache';

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVELS = ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'SUPERIOR'];

const LEVEL_CFG = {
  BASIC: {
    icon: '🌱', label: 'Basic', short: 'BAS',
    sub: 'Entry-level understanding and application',
    accent: '#10b981', accentLight: '#d1fae5', accentDark: '#065f46',
    gradient: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
    border: '#a7f3d0',
  },
  INTERMEDIATE: {
    icon: '⚡', label: 'Intermediate', short: 'INT',
    sub: 'Applies concepts independently with minimal guidance',
    accent: '#0ea5e9', accentLight: '#e0f2fe', accentDark: '#0c4a6e',
    gradient: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
    border: '#7dd3fc',
  },
  ADVANCED: {
    icon: '🔥', label: 'Advanced', short: 'ADV',
    sub: 'Leads implementation, mentors and coaches others',
    accent: '#f59e0b', accentLight: '#fef3c7', accentDark: '#78350f',
    gradient: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
    border: '#fcd34d',
  },
  SUPERIOR: {
    icon: '🏆', label: 'Superior', short: 'SUP',
    sub: 'Formulates policy, drives organization-wide strategy',
    accent: '#8b5cf6', accentLight: '#ede9fe', accentDark: '#3b0764',
    gradient: 'linear-gradient(135deg, #faf5ff 0%, #ede9fe 100%)',
    border: '#c4b5fd',
  },
};

const TYPE_STYLES = {
  basic:          { bg: '#eff6ff', color: '#1d4ed8', label: 'Core · Psycho-Social' },
  organizational: { bg: '#faf5ff', color: '#7c3aed', label: 'Organizational' },
  leadership:     { bg: '#eef2ff', color: '#4338ca', label: 'Leadership' },
  minimum:        { bg: '#fff7ed', color: '#c2410c', label: 'Minimum' },
};

const CAT_PALETTES = [
  { accent: '#3b82f6', bg: '#eff6ff', muted: '#bfdbfe', text: '#1e40af' },
  { accent: '#8b5cf6', bg: '#f5f3ff', muted: '#ddd6fe', text: '#5b21b6' },
  { accent: '#10b981', bg: '#ecfdf5', muted: '#a7f3d0', text: '#065f46' },
  { accent: '#f59e0b', bg: '#fffbeb', muted: '#fde68a', text: '#78350f' },
  { accent: '#ef4444', bg: '#fef2f2', muted: '#fecaca', text: '#991b1b' },
  { accent: '#06b6d4', bg: '#ecfeff', muted: '#a5f3fc', text: '#0e7490' },
  { accent: '#f97316', bg: '#fff7ed', muted: '#fed7aa', text: '#9a3412' },
  { accent: '#84cc16', bg: '#f7fee7', muted: '#d9f99d', text: '#3f6212' },
];

// ─── Level detection from competency name prefix ──────────────────────────────

/**
 * Detects a suggested proficiency level from a competency name that may contain
 * a parenthetical prefix like "(BASIC)", "(INT)", "(ADV)", "(SUP)", or a
 * CBS code like "(OC1)", "(LC3)".
 *
 * Also handles explicit suffixes and description hints.
 *
 * Returns one of LEVELS or null if nothing detected.
 */
function detectLevelFromName(name, competencyType) {
  if (!name) return null;

  const upper = name.toUpperCase();

  // Parenthetical level prefix: (BASIC), (INTERMEDIATE), (ADVANCED), (SUPERIOR)
  // Abbreviations: (BAS), (INT), (ADV), (SUP)
  const prefixMap = {
    BASIC:        'BASIC',
    BAS:          'BASIC',
    INTERMEDIATE: 'INTERMEDIATE',
    INT:          'INTERMEDIATE',
    INTER:        'INTERMEDIATE',
    ADVANCED:     'ADVANCED',
    ADV:          'ADVANCED',
    SUPERIOR:     'SUPERIOR',
    SUP:          'SUPERIOR',
  };

  // Match: (BASIC), (ADV), (INTERMEDIATE), etc. at the start of the name
  const prefixMatch = upper.match(/^\(([A-Z]+)\)\s*[-–]?/);
  if (prefixMatch) {
    const token = prefixMatch[1];
    if (prefixMap[token]) return prefixMap[token];
  }

  // Match level words anywhere in parentheses: "Competency (Basic)" 
  const parenMatch = upper.match(/\(([A-Z]+)\)/g);
  if (parenMatch) {
    for (const p of parenMatch) {
      const inner = p.replace(/[()]/g, '');
      if (prefixMap[inner]) return prefixMap[inner];
    }
  }

  // Infer from competency type for core/leadership defaults
  // Leadership competencies typically start at ADVANCED
  if (competencyType === 'leadership') return 'ADVANCED';

  return null;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function useCategoryPalette(categories) {
  return useMemo(() => {
    const map = {};
    categories.forEach((c, i) => { map[c] = CAT_PALETTES[i % CAT_PALETTES.length]; });
    return map;
  }, [categories.join('|')]);
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner({ size = 20, color = '#3b82f6' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: 'cdm-spin 0.75s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2.5" strokeOpacity="0.15"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

// ─── LevelBadge ──────────────────────────────────────────────────────────────

function LevelBadge({ level, active, hasContent, count, onClick }) {
  const cfg = LEVEL_CFG[level];
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={!hasContent}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '8px 16px', borderRadius: 12, border: 'none',
        fontSize: 13.5, fontWeight: 700, cursor: hasContent ? 'pointer' : 'not-allowed',
        transition: 'all 0.15s cubic-bezier(0.4,0,0.2,1)', outline: 'none',
        ...(active ? {
          background: cfg.accent, color: '#fff',
          boxShadow: `0 4px 14px ${cfg.accent}45`,
          transform: 'translateY(-1px)',
        } : hovered && hasContent ? {
          background: cfg.accentLight, color: cfg.accentDark,
          boxShadow: `0 2px 8px ${cfg.accent}20`,
        } : {
          background: hasContent ? '#f9fafb' : '#f3f4f6',
          color: hasContent ? '#6b7280' : '#d1d5db',
          boxShadow: 'none',
        }),
      }}
    >
      <span style={{ fontSize: 15 }}>{cfg.icon}</span>
      <span>{cfg.label}</span>
      {hasContent && count > 0 && (
        <span style={{
          fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 20,
          fontFamily: "'Fira Code', monospace",
          background: active ? 'rgba(255,255,255,0.28)' : cfg.accentLight,
          color: active ? '#fff' : cfg.accentDark,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── LevelPanel ──────────────────────────────────────────────────────────────

function LevelPanel({ level, data }) {
  const cfg = LEVEL_CFG[level];
  if (!data) return null;
  const empty = !data.behavioralIndicator && !data.items?.length;

  if (empty) return (
    <div style={{ textAlign: 'center', padding: '64px 32px' }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>{cfg.icon}</div>
      <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>
        No content defined for the <strong style={{ color: '#6b7280' }}>{cfg.label}</strong> level.
      </p>
    </div>
  );

  return (
    <div style={{ animation: 'cdm-slide-up 0.22s cubic-bezier(0.4,0,0.2,1)' }}>
      {/* Behavioral Indicator card */}
      {data.behavioralIndicator && (
        <div style={{
          background: cfg.gradient,
          border: `1.5px solid ${cfg.border}`,
          borderRadius: 16, padding: '20px 22px',
          marginBottom: 24, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
            background: cfg.accent, borderRadius: '16px 0 0 16px',
          }}/>
          <div style={{ paddingLeft: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11,
                background: '#fff', border: `1.5px solid ${cfg.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
                boxShadow: `0 2px 10px ${cfg.accent}20`,
              }}>
                {cfg.icon}
              </div>
              <div>
                <div style={{ fontWeight: 800, color: cfg.accentDark, fontSize: 14, letterSpacing: '-0.02em' }}>
                  {cfg.label} Proficiency Level
                </div>
                <div style={{ fontSize: 11.5, color: cfg.accent, fontWeight: 500, marginTop: 2 }}>
                  {cfg.sub}
                </div>
              </div>
            </div>
            <p style={{
              color: '#374151', fontSize: 14, lineHeight: 1.72, margin: 0,
              letterSpacing: '-0.01em',
            }}>
              {data.behavioralIndicator}
            </p>
          </div>
        </div>
      )}

      {/* KSA Items */}
      {data.items?.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#9ca3af',
            }}>
              Knowledge, Skills &amp; Abilities
            </span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0' }}/>
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: cfg.accentLight, color: cfg.accentDark,
              padding: '3px 10px', borderRadius: 99,
            }}>
              {data.items.length} {data.items.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {data.items.map((item, idx) => {
              const m = item.match(/^(\d+)\.\s*/);
              const num  = m ? m[1] : String(idx + 1);
              const text = m ? item.slice(m[0].length) : item;
              return <KSARow key={idx} num={num} text={text} idx={idx} cfg={cfg}/>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function KSARow({ num, text, idx, cfg }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', gap: 12, padding: '13px 16px',
        background: hovered ? cfg.accentLight + '60' : '#fff',
        border: `1.5px solid ${hovered ? cfg.border : '#f0f0f0'}`,
        borderRadius: 12, transition: 'all 0.15s',
        animation: `cdm-slide-up 0.2s cubic-bezier(0.4,0,0.2,1) ${Math.min(idx * 25, 300)}ms both`,
        boxShadow: hovered ? `0 2px 10px ${cfg.accent}12` : 'none',
      }}
    >
      <div style={{
        flexShrink: 0, width: 26, height: 26, borderRadius: 8,
        background: cfg.accentLight, color: cfg.accentDark,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800, fontFamily: "'Fira Code', monospace",
        marginTop: 1,
      }}>
        {num}
      </div>
      <p style={{
        margin: 0, color: '#374151', fontSize: 13.5,
        lineHeight: 1.68, letterSpacing: '-0.01em',
      }}>
        {text}
      </p>
    </div>
  );
}

// ─── BrowserSidebar ───────────────────────────────────────────────────────────

function BrowserSidebar({ categories, palette, activeCategory, onCategoryChange, counts }) {
  return (
    <div style={{
      width: 210, flexShrink: 0,
      borderRight: '1.5px solid #f3f4f6',
      overflowY: 'auto', padding: '10px 8px',
      background: '#fafafa',
    }}>
      <p style={{
        margin: '0 0 8px', padding: '0 8px',
        fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: '#9ca3af',
      }}>
        Categories
      </p>
      {categories.map(cat => {
        const p = palette[cat];
        const isActive = activeCategory === cat;
        return (
          <SidebarCatBtn
            key={cat} label={cat} count={counts[cat] ?? 0}
            palette={p} active={isActive}
            onClick={() => onCategoryChange(cat)}
          />
        );
      })}
    </div>
  );
}

function SidebarCatBtn({ label, count, palette: p, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', textAlign: 'left',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '7px 10px', borderRadius: 9, border: 'none',
        marginBottom: 2, cursor: 'pointer', transition: 'all 0.12s',
        background: active ? p.bg : hovered ? '#f3f4f6' : 'transparent',
        color: active ? p.text : hovered ? '#374151' : '#6b7280',
        fontWeight: active ? 700 : 500, fontSize: 12.5,
        fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: active ? p.accent : '#d1d5db',
          transition: 'background 0.12s',
        }}/>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      </div>
      <span style={{
        fontSize: 10.5, fontWeight: 700, flexShrink: 0,
        background: active ? p.muted : '#efefef',
        color: active ? p.text : '#9ca3af',
        padding: '1px 6px', borderRadius: 99, transition: 'all 0.12s',
      }}>
        {count}
      </span>
    </button>
  );
}

// ─── BrowserCompCard ─────────────────────────────────────────────────────────

function BrowserCompCard({ comp, palette: p, isFocused, onClick, animDelay }) {
  const [hovered, setHovered] = useState(false);
  const show = hovered || isFocused;

  const ksas = comp.levels
    ? Object.values(comp.levels).reduce((s, l) => s + (l?.items?.length || 0), 0)
    : 0;
  const hasLevels = comp.levels
    ? LEVELS.filter(l => comp.levels[l]?.behavioralIndicator || comp.levels[l]?.items?.length)
    : [];

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 14px', borderRadius: 12, width: '100%',
        border: `1.5px solid ${show ? p.accent : '#f0f0f0'}`,
        background: show ? p.bg : '#fff',
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.15s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: show ? `0 4px 16px ${p.accent}20` : 'none',
        transform: show ? 'translateY(-1px)' : 'none',
        animation: `cdm-slide-up 0.18s ease both`,
        animationDelay: `${animDelay}ms`,
        fontFamily: 'inherit',
      }}
    >
      <div style={{
        flexShrink: 0, padding: '3px 9px', borderRadius: 8,
        background: show ? p.muted : '#f3f4f6',
        color: show ? p.text : '#6b7280',
        fontSize: 11, fontWeight: 800, marginTop: 2,
        fontFamily: "'Fira Code', monospace",
        letterSpacing: '0.04em', transition: 'all 0.15s',
      }}>
        {comp.code}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontWeight: 700, fontSize: 13.5,
          color: show ? p.text : '#111827',
          lineHeight: 1.35, letterSpacing: '-0.02em',
          transition: 'color 0.15s',
        }}>
          {comp.name}
        </p>
        {(hasLevels.length > 0 || ksas > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            {hasLevels.map(l => (
              <span key={l} style={{
                fontSize: 9, fontWeight: 800, padding: '2px 5px',
                borderRadius: 5, letterSpacing: '0.06em',
                background: LEVEL_CFG[l].accentLight,
                color: LEVEL_CFG[l].accentDark,
              }}>
                {LEVEL_CFG[l].short}
              </span>
            ))}
            {ksas > 0 && (
              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>
                {ksas} KSAs
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{
        flexShrink: 0, marginTop: 3, color: show ? p.accent : '#d1d5db',
        transition: 'all 0.15s',
        transform: show ? 'translateX(2px)' : 'none',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6"/>
        </svg>
      </div>
    </button>
  );
}

// ─── BrowserMode ─────────────────────────────────────────────────────────────

function BrowserMode({ onSelectCompetency, onBack }) {
  const [allComps, setAllComps]             = useState([]);
  const [search, setSearch]                 = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [loading, setLoading]               = useState(true);
  const [focusedIdx, setFocusedIdx]         = useState(-1);
  const searchRef                           = useRef(null);
  const listRef                             = useRef(null);

  useEffect(() => {
    getAllCompetencies()
      .then(c => {
        setAllComps(c);
        if (c.length) setActiveCategory(c[0].category);
      })
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        setTimeout(() => searchRef.current?.focus(), 80);
      });
  }, []);

  const categories = useMemo(() => [...new Set(allComps.map(c => c.category))].sort(), [allComps]);
  const palette = useCategoryPalette(categories);
  const categoryCounts = useMemo(() => {
    const m = {};
    allComps.forEach(c => { m[c.category] = (m[c.category] || 0) + 1; });
    return m;
  }, [allComps]);

  const deduped = useMemo(() => {
    const seen = new Set(); const out = [];
    for (const c of allComps) {
      const k = `${c.code}::${c.name}::${c.category}`;
      if (!seen.has(k)) { seen.add(k); out.push(c); }
    }
    return out;
  }, [allComps]);

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;

  const filtered = useMemo(() => deduped.filter(c => {
    const matchQ = !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
    const matchCat = isSearching || !activeCategory || c.category === activeCategory;
    return matchQ && matchCat;
  }), [deduped, q, activeCategory, isSearching]);

  useEffect(() => {
    const handler = e => {
      if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === 'ArrowDown') setFocusedIdx(i => Math.min(i + 1, filtered.length - 1));
      if (e.key === 'ArrowUp')   setFocusedIdx(i => Math.max(i - 1, 0));
      if (e.key === 'Enter' && focusedIdx >= 0) onSelectCompetency(filtered[focusedIdx]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filtered, focusedIdx, onSelectCompetency]);

  useEffect(() => { setFocusedIdx(-1); }, [search, activeCategory]);

  if (loading) return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: 320, gap: 14,
    }}>
      <Spinner size={36} color="#3b82f6"/>
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: 0, fontWeight: 700, color: '#374151', fontSize: 14 }}>Loading CBS Manual</p>
        <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 12 }}>Parsing competency data…</p>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px 12px', borderBottom: '1.5px solid #f3f4f6', flexShrink: 0 }}>
        <SearchInput
          ref={searchRef}
          value={search}
          onChange={setSearch}
          placeholder="Search name or code…   ↑↓ navigate · ↵ open"
        />
        {isSearching && filtered.length > 0 && (
          <p style={{ margin: '8px 2px 0', fontSize: 12, color: '#9ca3af' }}>
            <strong style={{ color: '#374151' }}>{filtered.length}</strong> result{filtered.length !== 1 ? 's' : ''} across all categories
          </p>
        )}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {!isSearching && (
          <BrowserSidebar
            categories={categories}
            palette={palette}
            activeCategory={activeCategory}
            onCategoryChange={cat => { setActiveCategory(cat); listRef.current?.scrollTo(0, 0); setFocusedIdx(-1); }}
            counts={categoryCounts}
          />
        )}

        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
          {filtered.length === 0 ? (
            <EmptyState onClear={() => setSearch('')}/>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {filtered.map((comp, idx) => (
                <BrowserCompCard
                  key={`${comp.code}-${idx}`}
                  comp={comp}
                  palette={palette[comp.category] ?? CAT_PALETTES[0]}
                  isFocused={idx === focusedIdx}
                  onClick={() => onSelectCompetency(comp)}
                  animDelay={Math.min(idx * 12, 180)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{
        flexShrink: 0, padding: '10px 18px',
        borderTop: '1.5px solid #f3f4f6', background: '#fafafa',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11.5, color: '#9ca3af' }}>
          {deduped.length} competencies · CBS Manual 2025
        </span>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 14px', borderRadius: 8,
            border: '1.5px solid #e5e7eb', background: '#fff',
            fontSize: 12, fontWeight: 700, color: '#374151',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back to Competency
        </button>
      </div>
    </div>
  );
}

// ─── SearchInput ─────────────────────────────────────────────────────────────

const SearchInput = React.forwardRef(({ value, onChange, placeholder }, ref) => {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <svg style={{
        position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
        color: focused ? '#3b82f6' : '#9ca3af', transition: 'color 0.15s', pointerEvents: 'none',
      }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{
          width: '100%', paddingLeft: 40, paddingRight: value ? 38 : 14,
          paddingTop: 10, paddingBottom: 10, boxSizing: 'border-box',
          border: `1.5px solid ${focused ? '#3b82f6' : '#e5e7eb'}`,
          borderRadius: 11, fontSize: 13.5, color: '#111827', outline: 'none',
          background: '#fff', fontFamily: 'inherit', letterSpacing: '-0.01em',
          boxShadow: focused ? '0 0 0 3px #3b82f620' : 'none',
          transition: 'all 0.15s',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            width: 20, height: 20, borderRadius: '50%', border: 'none',
            background: '#e5e7eb', color: '#6b7280', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      )}
    </div>
  );
});

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ onClear }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: '#f9fafb', border: '2px dashed #e5e7eb',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, margin: '0 auto 16px',
      }}>
        🔍
      </div>
      <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 14.5, color: '#374151' }}>No results found</p>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9ca3af' }}>Try a different keyword or code</p>
      <button
        onClick={onClear}
        style={{
          padding: '8px 18px', borderRadius: 9,
          border: '1.5px solid #e5e7eb', background: '#fff',
          fontSize: 13, fontWeight: 700, color: '#374151',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Clear search
      </button>
    </div>
  );
}

// ─── VariantTabs (collapsible) ────────────────────────────────────────────────

function VariantTabs({ variants, activeIdx, onChange }) {
  const [collapsed, setCollapsed] = useState(false);
  if (variants.length <= 1) return null;

  return (
    <div style={{
      margin: '12px 20px 0',
      border: '1.5px solid #fde68a',
      borderRadius: 14,
      background: '#fffbeb',
      overflow: 'hidden',
    }}>
      {/* Collapsible header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '10px 14px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#92400e' }}>
            {variants.length} office variants — viewing: <em style={{ fontStyle: 'normal', color: '#b45309' }}>{variants[activeIdx]?.category}</em>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#a16207', fontWeight: 600 }}>
            {collapsed ? 'Show' : 'Hide'} variants
          </span>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="#b45309" strokeWidth="2.5" strokeLinecap="round"
            style={{ transition: 'transform 0.2s', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
          >
            <path d="m18 15-6-6-6 6"/>
          </svg>
        </div>
      </button>

      {/* Variant buttons — hidden when collapsed */}
      {!collapsed && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          padding: '4px 14px 12px',
          borderTop: '1px solid #fde68a',
        }}>
          {variants.map((v, i) => (
            <button key={`${v.code}-${i}`} onClick={() => onChange(i)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 13px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: i === activeIdx ? '#f59e0b' : '#fff',
              color: i === activeIdx ? '#fff' : '#92400e',
              fontWeight: 700, fontSize: 12, transition: 'all 0.15s',
              boxShadow: i === activeIdx ? '0 2px 8px #f59e0b35' : '0 1px 3px rgba(0,0,0,0.08)',
              fontFamily: 'inherit',
              border: `1px solid ${i === activeIdx ? 'transparent' : '#fcd34d'}`,
            }}>
              <span style={{ fontFamily: "'Fira Code', monospace" }}>{v.code}</span>
              <span style={{ opacity: 0.55 }}>·</span>
              <span>{v.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── LoadingState ─────────────────────────────────────────────────────────────

function LoadingState({ progress, msg }) {
  return (
    <div style={{ padding: '24px 24px 28px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: '#eff6ff', border: '1.5px solid #bfdbfe',
        borderRadius: 14, padding: '16px 18px', marginBottom: 18,
      }}>
        <Spinner size={22} color="#3b82f6"/>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, color: '#1e40af', fontSize: 13.5, marginBottom: 3 }}>Parsing CBS Manual</div>
          <div style={{ fontSize: 11.5, color: '#60a5fa', fontFamily: 'monospace' }}>{msg}</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8', fontFamily: "'Fira Code', monospace" }}>
          {progress}%
        </div>
      </div>
      <div style={{ height: 5, background: '#f0f0f0', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{
          height: '100%', width: `${progress}%`,
          background: 'linear-gradient(90deg, #3b82f6, #6366f1 60%, #8b5cf6)',
          borderRadius: 99, transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)',
        }}/>
      </div>
      <p style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginBottom: 24 }}>
        First-time parse only — subsequent lookups are instant.
      </p>
    </div>
  );
}

// ─── IconBtn / TextBtn ────────────────────────────────────────────────────────

function IconBtn({ onClick, children, label, danger = false }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 32, height: 32, borderRadius: 9, border: '1.5px solid',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.14s', padding: 0,
        borderColor: hovered && danger ? '#fca5a5' : hovered ? '#d1d5db' : '#e5e7eb',
        background: hovered && danger ? '#fef2f2' : hovered ? '#f9fafb' : '#fff',
        color: hovered && danger ? '#ef4444' : '#9ca3af',
      }}
    >
      {children}
    </button>
  );
}

function TextBtn({ onClick, children, primary = false }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '6px 14px', borderRadius: 9, border: '1.5px solid',
        cursor: 'pointer', fontSize: 12.5, fontWeight: 700, transition: 'all 0.14s',
        fontFamily: 'inherit',
        ...(primary ? {
          background: hovered ? '#1d4ed8' : '#2563eb',
          color: '#fff', borderColor: 'transparent',
          boxShadow: hovered ? '0 4px 14px #2563eb50' : '0 2px 8px #2563eb30',
        } : {
          background: hovered ? '#f3f4f6' : '#fff',
          color: '#374151', borderColor: hovered ? '#d1d5db' : '#e5e7eb',
        }),
      }}
    >
      {children}
    </button>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────────────

export default function CompetencyDetailModal({
  competencyName,
  competencyType,
  suggestedLevel,
  onClose,
  browseMode = false,
  directComp = null,
}) {
  const [status,      setStatus]      = useState('loading');
  const [progress,    setProgress]    = useState(0);
  const [msg,         setMsg]         = useState('Checking…');
  const [variants,    setVariants]    = useState([]);
  const [variantIdx,  setVariantIdx]  = useState(0);
  const [activeLevel, setActiveLevel] = useState(suggestedLevel || 'BASIC');
  const [isBrowsing,  setIsBrowsing]  = useState(browseMode);
  const resolvedRef                   = useRef(false);
  const fromBrowserRef                = useRef(false);
  const overlayRef                    = useRef(null);

  const data = variants[variantIdx] ?? null;

  /**
   * Resolve the best active level for a competency.
   * Priority: 1) auto-detected from name prefix, 2) suggestedLevel prop,
   *           3) first level that has actual content.
   */
  const resolveActiveLevel = useCallback((comp, preferred) => {
    // 1. Try to detect level from competency name prefix
    const detected = detectLevelFromName(competencyName, competencyType);
    if (detected && (comp.levels?.[detected]?.behavioralIndicator || comp.levels?.[detected]?.items?.length > 0)) {
      return detected;
    }

    // 2. Use the suggested/preferred level if it has content
    const candidate = preferred || suggestedLevel;
    if (candidate && (comp.levels?.[candidate]?.behavioralIndicator || comp.levels?.[candidate]?.items?.length > 0)) {
      return candidate;
    }

    // 3. Fall back to first level with content
    return LEVELS.find(l => comp.levels?.[l]?.behavioralIndicator || comp.levels?.[l]?.items?.length > 0) ?? 'BASIC';
  }, [competencyName, competencyType, suggestedLevel]);

  useEffect(() => {
    if (isBrowsing) { setStatus('browsing'); return; }
    if (directComp) {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setVariants([directComp]);
      setActiveLevel(resolveActiveLevel(directComp, suggestedLevel));
      setStatus('found'); return;
    }
    if (fromBrowserRef.current || resolvedRef.current) return;
    let cancelled = false;
    (async () => {
      const ok = await isPDFAvailable();
      if (!ok) { if (!cancelled) setStatus('no_pdf'); return; }
      try {
        await ensureParsed((pct, m) => { if (!cancelled) { setProgress(pct); setMsg(m); } });
        // Strip level/code prefixes before searching
        const cleanName = (competencyName ?? '')
          .replace(/^\([A-Z]+\d*[A-Z]?\)\s*[-–]\s*/i, '')
          .replace(/^\([A-Z]+\)\s*/i, '')
          .trim();
        const results = await findCompetenciesByName(cleanName);
        if (cancelled) return;
        if (results.length > 0) {
          setVariants(results); setVariantIdx(0);
          setActiveLevel(resolveActiveLevel(results[0], suggestedLevel));
          setStatus('found');
        } else { setStatus('not_found'); }
      } catch { if (!cancelled) setStatus('not_found'); }
    })();
    return () => { cancelled = true; };
  }, [competencyName, suggestedLevel, isBrowsing, directComp, resolveActiveLevel]);

  const handleSelectCompetency = useCallback(async (comp) => {
    resolvedRef.current = false;
    fromBrowserRef.current = true;
    setStatus('loading'); setVariants([]); setIsBrowsing(false);
    try {
      const allParsed = await ensureParsed();
      const same = allParsed.filter(c => c.code.toUpperCase() === comp.code.toUpperCase());
      const resolved = same.length > 0 ? same : [comp];
      resolvedRef.current = true;
      setVariants(resolved); setVariantIdx(0);
      setActiveLevel(resolveActiveLevel(resolved[0], null));
      setStatus('found');
    } catch {
      resolvedRef.current = true;
      setVariants([comp]); setVariantIdx(0);
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
  const displayName = data?.name ?? (competencyName ?? 'CBS Manual')
    .replace(/^\([A-Z]+\d*[A-Z]?\)\s*[-–]\s*/i, '')
    .replace(/^\([A-Z]+\)\s*/i, '')
    .trim();
  const typeStyle = TYPE_STYLES[competencyType];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Fira+Code:wght@500;700&display=swap');
        @keyframes cdm-fade-in  { from{opacity:0} to{opacity:1} }
        @keyframes cdm-modal-in { from{opacity:0;transform:scale(.95) translateY(20px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes cdm-slide-up { from{opacity:0;transform:translateY(9px)} to{opacity:1;transform:translateY(0)} }
        @keyframes cdm-spin      { to { transform: rotate(360deg) } }
        @keyframes cdm-pulse     { 0%,100%{opacity:.45} 50%{opacity:1} }
        .cdm * { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; box-sizing: border-box; }
        .cdm ::-webkit-scrollbar { width: 4px; }
        .cdm ::-webkit-scrollbar-track { background: transparent; }
        .cdm ::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 99px; }
        .cdm ::-webkit-scrollbar-thumb:hover { background: #d1d5db; }
      `}</style>

      {/* Overlay */}
      <div
        ref={overlayRef}
        onClick={e => { if (e.target === overlayRef.current) onClose(); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(10, 18, 36, 0.55)',
          backdropFilter: 'blur(8px) saturate(180%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, animation: 'cdm-fade-in 0.16s ease',
        }}
      >
        {/* Modal shell */}
        <div
          className="cdm"
          style={{
            background: '#fff',
            borderRadius: 22,
            boxShadow: '0 40px 100px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
            width: '100%', maxWidth: 780,
            display: 'flex', flexDirection: 'column',
            maxHeight: '90vh', overflow: 'hidden',
            animation: 'cdm-modal-in 0.26s cubic-bezier(0.34, 1.15, 0.64, 1)',
          }}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: '20px 22px 16px',
            borderBottom: '1.5px solid #f3f4f6',
            flexShrink: 0,
          }}>
            <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
              {isBrowsing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                      border: '1.5px solid #bfdbfe',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
                    }}>📚</div>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#111827', letterSpacing: '-0.03em' }}>
                        Browse CBS Manual
                      </h2>
                      <p style={{ margin: 0, fontSize: 11.5, color: '#9ca3af', marginTop: 1 }}>
                        All competencies · ↑↓ navigate · ↵ open
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  {(status === 'found' || status === 'not_found') && (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {typeStyle && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                            background: typeStyle.bg, color: typeStyle.color, letterSpacing: '0.01em',
                          }}>
                            {typeStyle.label}
                          </span>
                        )}
                        {data?.code && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                            background: '#f3f4f6', color: '#374151',
                            fontFamily: "'Fira Code', monospace", letterSpacing: '0.04em',
                          }}>
                            {data.code}
                          </span>
                        )}
                        {data?.category && (
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                            background: '#fffbeb', color: '#92400e',
                          }}>
                            {data.category}
                          </span>
                        )}
                      </div>
                      <h2 style={{
                        margin: 0, fontSize: 20, fontWeight: 800,
                        color: '#111827', letterSpacing: '-0.035em', lineHeight: 1.24,
                      }}>
                        {displayName}
                      </h2>
                    </>
                  )}
                  {status === 'loading' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ height: 16, width: 80, background: '#f3f4f6', borderRadius: 99, animation: 'cdm-pulse 1.6s ease infinite' }}/>
                      <div style={{ height: 24, width: 260, background: '#f3f4f6', borderRadius: 8, animation: 'cdm-pulse 1.6s ease 150ms infinite' }}/>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
              {!isBrowsing && status === 'found' && (
                <TextBtn onClick={() => setIsBrowsing(true)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M3 6h18M3 12h18M3 18h12"/>
                  </svg>
                  Browse Manual
                </TextBtn>
              )}
              <IconBtn onClick={onClose} label="Close" danger>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </IconBtn>
            </div>
          </div>

          {/* ── Body ───────────────────────────────────────────────── */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {isBrowsing && (
              <BrowserMode
                onSelectCompetency={handleSelectCompetency}
                onBack={() => {
                  if (variants.length > 0 && status === 'found') setIsBrowsing(false);
                  else onClose();
                }}
              />
            )}

            {status === 'loading' && !isBrowsing && (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <LoadingState progress={progress} msg={msg}/>
              </div>
            )}

            {status === 'not_found' && !isBrowsing && (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '64px 40px', textAlign: 'center',
              }}>
                <div style={{
                  width: 68, height: 68, borderRadius: 20,
                  background: '#f9fafb', border: '2px dashed #e5e7eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 32, marginBottom: 22,
                }}>🔍</div>
                <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 800, color: '#111827', letterSpacing: '-0.025em' }}>
                  Not Found in CBS Manual
                </h3>
                <p style={{ margin: '0 0 28px', fontSize: 14, color: '#6b7280', maxWidth: 360, lineHeight: 1.65 }}>
                  Could not match <strong style={{ color: '#374151' }}>
                    "{displayName}"
                  </strong> in the PDF. The database name may differ from the manual's wording.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <TextBtn onClick={() => setIsBrowsing(true)} primary>Browse Full Manual</TextBtn>
                  <TextBtn onClick={onClose}>Close</TextBtn>
                </div>
              </div>
            )}

            {status === 'no_pdf' && !isBrowsing && (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '64px 40px', textAlign: 'center',
              }}>
                <div style={{
                  width: 68, height: 68, borderRadius: 20,
                  background: '#fef2f2', border: '1.5px solid #fecaca',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 32, marginBottom: 22,
                }}>📄</div>
                <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 800, color: '#111827' }}>PDF Not Loaded</h3>
                <p style={{ margin: '0 0 8px', fontSize: 14, color: '#6b7280', maxWidth: 340, lineHeight: 1.65 }}>
                  Place{' '}
                  <code style={{ background: '#f3f4f6', padding: '2px 7px', borderRadius: 6, fontSize: 12.5, fontFamily: "'Fira Code', monospace" }}>
                    2025_CBS.pdf
                  </code>{' '}
                  in{' '}
                  <code style={{ background: '#f3f4f6', padding: '2px 7px', borderRadius: 6, fontSize: 12.5, fontFamily: "'Fira Code', monospace" }}>
                    /public/rhrmpsb-system
                  </code>{' '}
                  and redeploy.
                </p>
                <div style={{ marginTop: 24 }}>
                  <TextBtn onClick={onClose}>Close</TextBtn>
                </div>
              </div>
            )}

            {status === 'found' && !isBrowsing && data && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

                {/* ── Collapsible variant warning + tabs ─────────────── */}
                <VariantTabs
                  variants={variants}
                  activeIdx={variantIdx}
                  onChange={idx => {
                    setVariantIdx(idx);
                    setActiveLevel(resolveActiveLevel(variants[idx], null));
                  }}
                />

                {/* ── Sticky level tabs ───────────────────────────────── */}
                <div style={{
                  flexShrink: 0, padding: '14px 20px 12px',
                  borderBottom: '1.5px solid #f3f4f6',
                  background: 'rgba(255,255,255,0.97)',
                  backdropFilter: 'blur(10px)',
                  position: 'sticky', top: 0, zIndex: 10,
                }}>
                  {/* Level tabs row */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {LEVELS.map(level => {
                      const ld = data.levels?.[level];
                      const has = !!(ld?.behavioralIndicator || ld?.items?.length > 0);
                      return (
                        <LevelBadge
                          key={level} level={level}
                          active={activeLevel === level}
                          hasContent={has}
                          count={ld?.items?.length ?? 0}
                          onClick={() => has && setActiveLevel(level)}
                        />
                      );
                    })}
                  </div>

                  {/* Auto-detected level hint */}
                  {(() => {
                    const detected = detectLevelFromName(competencyName, competencyType);
                    if (!detected) return null;
                    const cfg = LEVEL_CFG[detected];
                    return (
                      <div style={{
                        marginTop: 10, display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 11.5, color: cfg.accentDark,
                        background: cfg.accentLight, borderRadius: 8,
                        padding: '5px 12px', width: 'fit-content',
                      }}>
                        <span>{cfg.icon}</span>
                        <span>
                          Auto-selected <strong>{cfg.label}</strong> level based on competency context
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* ── Scrollable KSA content ──────────────────────────── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '22px 22px 28px' }}>
                  <LevelPanel level={activeLevel} data={data.levels?.[activeLevel]}/>
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ─────────────────────────────────────────────── */}
          {status === 'found' && !isBrowsing && data && (
            <div style={{
              flexShrink: 0, padding: '10px 20px',
              borderTop: '1.5px solid #f3f4f6',
              background: '#fafafa',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11.5, color: '#9ca3af', fontWeight: 500 }}>CBS Manual 2025</span>
                {data.code && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, fontFamily: "'Fira Code', monospace",
                    background: '#f3f4f6', color: '#374151',
                    padding: '2px 8px', borderRadius: 6,
                  }}>
                    {data.code}
                  </span>
                )}
                {isMultiVariant && (
                  <span style={{ fontSize: 11.5, color: '#d97706', fontWeight: 700 }}>
                    {variantIdx + 1}/{variants.length} · {data.category}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <TextBtn onClick={() => setIsBrowsing(true)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M3 6h18M3 12h18M3 18h12"/>
                  </svg>
                  Browse
                </TextBtn>
                <TextBtn onClick={onClose}>Close</TextBtn>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
