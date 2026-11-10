// src/components/StillNeedToRatePanel.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ratingsAPI } from '../utils/api';

// ─── "Still need to rate" — everybody's pending ratings (admin / secretariat) ──
// Same idea as the rater's own "You still need to rate" panel, but across the whole board:
//   • Candidate view — one card per incomplete candidate: who has rated, who still owes a rating.
//   • Rater view     — one block per rater: every candidate they still owe a rating on.
//   • Position view  — one block per item/position: which raters owe ratings (and how many
//                      candidates each), then the candidates under it.
// Names, rater types and status only — never scores.

const POLL_MS = 30000;

// Partner seats that may adopt ("adapt") each other's ratings — mirrors PEER_PARTNER on the server.
const PEER_PARTNER = {
  'Chairperson': 'Vice-Chairperson', 'Vice-Chairperson': 'Chairperson',
  'Regular Member': 'End-User', 'End-User': 'Regular Member',
};

// For one candidate: every still-owing seat whose partner seat has already rated, i.e. who could adopt whose ratings.
const adoptOptions = (c) => c.awaiting.flatMap(seat => {
  const partner = PEER_PARTNER[seat.raterType];
  if (!partner) return [];
  const source = c.ratedBy.find(r => r.raterType === partner);
  return source ? [{ seat: seat.raterType, owing: seat.raters, source }] : [];
});

const DoneIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
);
const ClockIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);

const DonePill = ({ r }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 text-[11px] sm:text-xs font-medium px-2 py-0.5" title={`${r.name} (${r.raterType}) has rated`}>
    <DoneIcon />{r.name} · {r.raterType}
  </span>
);

// One pill per rater who still owes this seat; a dashed pill when nobody is assigned to the seat.
const AwaitingPills = ({ awaiting }) => awaiting.flatMap(seat => (
  seat.raters.length === 0
    ? [(
      <span key={`none-${seat.raterType}`} className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-400 bg-gray-50 text-gray-600 text-[11px] sm:text-xs font-medium px-2 py-0.5" title={`No rater is assigned to the ${seat.raterType} seat for this item`}>
        <ClockIcon />No assigned rater · {seat.raterType}
      </span>
    )]
    : seat.raters.map(r => (
      <span key={`${seat.raterType}-${r.id}`} className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 text-[11px] sm:text-xs font-semibold px-2 py-0.5" title={`${r.name} (${seat.raterType}) still needs to rate`}>
        <ClockIcon />{r.name} · {seat.raterType}
      </span>
    ))
));

const CandidateCard = ({ c, showPosition }) => {
  const done = c.ratedBy.length;
  const pct = Math.round((done / c.requiredRaters) * 100);
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-bold text-gray-900">{c.candidateName}</div>
          {showPosition && (
            <div className="text-xs text-gray-500">
              Item # {c.itemNumber} · {c.position} · {c.assignment}
            </div>
          )}
          <div className="text-xs text-gray-500">
            {done} of {c.requiredRaters} raters done
            <span className={`ml-2 font-semibold ${c.status === 'not_started' ? 'text-red-600' : 'text-amber-600'}`}>
              {c.status === 'not_started' ? '• Not started' : '• In progress'}
            </span>
          </div>
        </div>
        <span className="flex-shrink-0 rounded-full bg-gray-100 text-gray-600 text-[11px] font-semibold px-2 py-0.5">
          {c.panelType === 'two_rater' ? '2-rater' : 'Panel'}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
        <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {c.ratedBy.map(r => <DonePill key={r.raterType + r.name} r={r} />)}
        <AwaitingPills awaiting={c.awaiting} />
      </div>
      {adoptOptions(c).map(o => (
        <div key={o.seat} className="mt-2 flex items-start gap-1.5 rounded-md bg-indigo-50 border border-indigo-100 px-2 py-1 text-[11px] sm:text-xs text-indigo-800">
          <span aria-hidden="true">💡</span>
          <span>
            {o.owing.length ? o.owing.map(r => r.name).join(', ') : `The ${o.seat}`} can adopt <b>{o.source.name}</b>&apos;s ({o.source.raterType}) ratings as a starting point.
          </span>
        </div>
      ))}
    </div>
  );
};

const StillNeedToRatePanel = ({ isOpen, onClose }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('candidate');     // 'candidate' | 'position'
  const [panelFilter, setPanelFilter] = useState('all'); // 'all' | 'panel' | 'two_rater'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'in_progress' | 'not_started'
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await ratingsAPI.getStillNeedToRate());
      setError(false);
    } catch (e) {
      console.error('Still-need-to-rate load error:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    load();
    const t = setInterval(load, POLL_MS);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearInterval(t); window.removeEventListener('keydown', onKey); };
  }, [isOpen, load, onClose]);

  // Panel + status filters only (the Rater view applies the search its own way, below).
  const scoped = useMemo(() => (data?.candidates || []).filter(c =>
    (panelFilter === 'all' || c.panelType === panelFilter) &&
    (statusFilter === 'all' || c.status === statusFilter)
  ), [data, panelFilter, statusFilter]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter(c => [
      c.candidateName, c.itemNumber, c.position, c.assignment,
      ...c.ratedBy.map(r => r.name),
      ...c.awaiting.flatMap(s => [s.raterType, ...s.raters.map(r => r.name)]),
    ].join(' ').toLowerCase().includes(q));
  }, [scoped, search]);

  // Rater view: who still owes what. A seat nobody is assigned to is grouped as "No assigned rater · <seat>".
  // Searching a rater's name/seat shows all of that rater's candidates; any other search narrows the candidates.
  const raterBlocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map();
    scoped.forEach(c => {
      c.awaiting.forEach(seat => {
        const list = seat.raters.length ? seat.raters : [{ id: `none-${seat.raterType}`, name: 'No assigned rater', unassigned: true }];
        list.forEach(r => {
          const key = `${seat.raterType}|${r.id}`;
          if (!map.has(key)) map.set(key, { key, name: r.name, raterType: seat.raterType, unassigned: !!r.unassigned, rows: [] });
          map.get(key).rows.push(c);
        });
      });
    });
    const blocks = [];
    map.forEach(b => {
      const raterMatch = !q || `${b.name} ${b.raterType}`.toLowerCase().includes(q);
      const rows = raterMatch ? b.rows : b.rows.filter(c => `${c.candidateName} ${c.itemNumber} ${c.position} ${c.assignment}`.toLowerCase().includes(q));
      if (rows.length) blocks.push({ ...b, rows });
    });
    return blocks.sort((a, b) => (a.unassigned - b.unassigned) || (b.rows.length - a.rows.length) || a.name.localeCompare(b.name));
  }, [scoped, search]);

  // Position view: group by item; tally how many candidates each rater still owes.
  const positions = useMemo(() => {
    const map = new Map();
    candidates.forEach(c => {
      if (!map.has(c.itemNumber)) {
        map.set(c.itemNumber, { itemNumber: c.itemNumber, position: c.position, assignment: c.assignment, panelType: c.panelType, rows: [], owed: new Map() });
      }
      const g = map.get(c.itemNumber);
      g.rows.push(c);
      c.awaiting.forEach(seat => {
        const list = seat.raters.length ? seat.raters : [{ id: `none-${seat.raterType}`, name: 'No assigned rater' }];
        list.forEach(r => {
          const key = `${seat.raterType}|${r.id}`;
          const cur = g.owed.get(key) || { name: r.name, raterType: seat.raterType, unassigned: seat.raters.length === 0, count: 0 };
          cur.count += 1;
          g.owed.set(key, cur);
        });
      });
    });
    return [...map.values()];
  }, [candidates]);

  if (!isOpen) return null;

  const total = data?.candidates?.length ?? 0;
  const statusCounts = {
    in_progress: (data?.candidates || []).filter(c => c.status === 'in_progress').length,
    not_started: (data?.candidates || []).filter(c => c.status === 'not_started').length,
  };
  const counts = {
    panel: (data?.candidates || []).filter(c => c.panelType !== 'two_rater').length,
    two_rater: (data?.candidates || []).filter(c => c.panelType === 'two_rater').length,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Still need to rate" onClick={onClose}>
      <div className="w-full max-w-5xl max-h-screen sm:max-h-[90vh] flex flex-col rounded-none sm:rounded-xl border-2 border-amber-300 bg-amber-50 shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-100 border-b border-amber-200">
          <span className="flex h-9 min-w-[36px] px-2 items-center justify-center rounded-full bg-red-600 text-white text-sm font-bold flex-shrink-0">{total}</span>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-amber-900">Still need to rate</div>
            <div className="text-xs sm:text-sm text-amber-800">
              {data ? `${total} candidate${total === 1 ? '' : 's'} with incomplete ratings` : 'Loading…'}
              {loading && data ? ' · refreshing…' : ''}
              {error && data ? ' · connection problem, showing last data' : ''}
            </div>
          </div>
          <button type="button" onClick={load} disabled={loading} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-50 disabled:opacity-60">Refresh</button>
          <button type="button" onClick={onClose} aria-label="Close" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700">Close</button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-amber-200 bg-white">
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden" role="tablist" aria-label="View">
            {[['candidate', 'Candidate view'], ['position', 'Position view'], ['rater', 'Rater view']].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-semibold ${view === id ? 'bg-amber-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>{label}</button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden" role="group" aria-label="Interview type">
            {[['all', `All (${total})`], ['panel', `Panel (${counts.panel})`], ['two_rater', `2-rater (${counts.two_rater})`]].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={panelFilter === id} onClick={() => setPanelFilter(id)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium ${panelFilter === id ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>{label}</button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden" role="group" aria-label="Status">
            {[['all', 'Any status'], ['in_progress', `In progress (${statusCounts.in_progress})`], ['not_started', `Not started (${statusCounts.not_started})`]].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={statusFilter === id} onClick={() => setStatusFilter(id)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium ${statusFilter === id ? (id === 'not_started' ? 'bg-red-600 text-white' : id === 'in_progress' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-white') : 'bg-white text-gray-700 hover:bg-gray-50'}`}>{label}</button>
            ))}
          </div>
          <input
            type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search rater, candidate or position…"
            className="flex-1 min-w-[180px] px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        <div className="flex items-start gap-2 px-4 py-2 border-b border-indigo-100 bg-indigo-50 text-xs sm:text-sm text-indigo-900">
          <span aria-hidden="true">💡</span>
          <span>
            <b>Raters can adopt a colleague&apos;s ratings.</b> Once a Chairperson or Vice-Chairperson, or a Regular Member or End-User,
            has rated a candidate, their partner can use <b>Adapt … ratings</b> in the rating form to copy those scores,
            review and change them, then submit. Candidates where this is possible are marked 💡 below.
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {!data ? (
            <div className="py-12 text-center text-gray-600">
              {error ? <>Couldn&apos;t load. <button type="button" className="underline" onClick={load}>Try again</button></> : 'Loading…'}
            </div>
          ) : (view === 'rater' ? raterBlocks.length === 0 : candidates.length === 0) ? (
            <div className="py-12 text-center text-gray-600">
              {total === 0 ? '🎉 Every long-listed candidate has complete ratings.' : 'No matches for your filters.'}
            </div>
          ) : view === 'rater' ? (
            raterBlocks.map(b => {
              // group this rater's candidates by item so it is clear which position each belongs to
              const byItem = new Map();
              b.rows.forEach(c => {
                if (!byItem.has(c.itemNumber)) byItem.set(c.itemNumber, { itemNumber: c.itemNumber, position: c.position, assignment: c.assignment, rows: [] });
                byItem.get(c.itemNumber).rows.push(c);
              });
              return (
                <div key={b.key} className="rounded-xl border border-amber-200 bg-white overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200">
                    <span className={b.unassigned
                      ? 'inline-flex items-center gap-1 rounded-full border border-dashed border-gray-400 bg-gray-50 text-gray-600 text-sm font-semibold px-2.5 py-0.5'
                      : 'inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 text-sm font-bold px-2.5 py-0.5'}>
                      <ClockIcon />{b.name}
                    </span>
                    <span className="text-xs font-semibold text-gray-600">{b.raterType}</span>
                    <span className="ml-auto text-xs font-semibold text-gray-700">
                      owes {b.rows.length} candidate{b.rows.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="p-2 sm:p-3 space-y-3">
                    {[...byItem.values()].map(g => (
                      <div key={g.itemNumber}>
                        <div className="flex flex-wrap items-baseline gap-x-2 px-1 mb-1">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-amber-900">Item # {g.itemNumber}</span>
                          <span className="text-sm font-semibold text-gray-800">{g.position}</span>
                          <span className="text-xs text-gray-500">{g.assignment}</span>
                        </div>
                        <div className="space-y-1">
                          {g.rows.map(c => (
                            <div key={c.candidateId} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-1.5">
                              <span className="text-sm font-semibold text-gray-900 truncate">{c.candidateName}</span>
                              <span className="flex items-center gap-2 flex-shrink-0 text-xs text-gray-500">
                                {(() => {
                                  const src = !b.unassigned && c.ratedBy.find(r => r.raterType === PEER_PARTNER[b.raterType]);
                                  return src ? <span className="rounded-full bg-indigo-100 text-indigo-800 font-semibold px-2 py-0.5" title={`${src.name} (${src.raterType}) has rated — ${b.name} can adopt those ratings`}>💡 can adopt {src.name}</span> : null;
                                })()}
                                {c.ratedBy.length} of {c.requiredRaters} done
                                <span className={`font-semibold ${c.status === 'not_started' ? 'text-red-600' : 'text-amber-600'}`}>
                                  {c.status === 'not_started' ? 'Not started' : 'In progress'}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : view === 'candidate' ? (
            <div className="space-y-2">
              {candidates.map(c => <CandidateCard key={`${c.itemNumber}-${c.candidateId}`} c={c} showPosition />)}
            </div>
          ) : (
            positions.map(g => (
              <div key={g.itemNumber} className="rounded-xl border border-amber-200 bg-white overflow-hidden">
                <div className="px-3 py-2 bg-amber-50 border-b border-amber-200">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-amber-900">Item # {g.itemNumber}</span>
                    <span className="text-sm font-semibold text-gray-800">{g.position}</span>
                    <span className="text-xs text-gray-500">{g.assignment}</span>
                    <span className="ml-auto text-xs font-semibold text-gray-600">
                      {g.rows.length} candidate{g.rows.length === 1 ? '' : 's'} incomplete · {g.panelType === 'two_rater' ? '2-rater' : 'Panel'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="text-[11px] font-semibold text-gray-500 self-center mr-1">Still owe ratings:</span>
                    {[...g.owed.values()].map(o => (
                      <span key={`${o.raterType}-${o.name}`}
                        className={o.unassigned
                          ? 'inline-flex items-center gap-1 rounded-full border border-dashed border-gray-400 bg-gray-50 text-gray-600 text-[11px] sm:text-xs font-medium px-2 py-0.5'
                          : 'inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 text-[11px] sm:text-xs font-semibold px-2 py-0.5'}>
                        <ClockIcon />{o.name} · {o.raterType} · {o.count} candidate{o.count === 1 ? '' : 's'}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-2 sm:p-3 space-y-2">
                  {g.rows.map(c => <CandidateCard key={c.candidateId} c={c} showPosition={false} />)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default StillNeedToRatePanel;