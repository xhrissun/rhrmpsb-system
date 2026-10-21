import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { liveStatsAPI } from '../utils/api';

// ─── Live Stats ──────────────────────────────────────────────────────────────
// Full-screen overlay opened from the navbar, visible to every user type.
// It is an overlay (not a route) on purpose: a rater who opens it mid-rating
// keeps their in-progress form exactly as it was when they close it.
// Shows names, rater types and status only — never scores.

const POLL_MS = 15000;

const TYPE_LABEL = {
  'Chairperson': 'CHAIR',
  'Vice-Chairperson': 'VICE',
  'Regular Member': 'REG',
  'DENREU': 'DENREU',
  'Gender and Development': 'GAD',
  'End-User': 'END-USER',
};

const STATUS = {
  complete:    { label: 'Complete',    pill: 'bg-green-100 text-green-800 border-green-200',   dot: 'bg-green-500' },
  being_rated: { label: 'Being rated', pill: 'bg-blue-100 text-blue-800 border-blue-200',      dot: 'bg-blue-500 animate-pulse' },
  in_progress: { label: 'In progress', pill: 'bg-amber-100 text-amber-800 border-amber-200',   dot: 'bg-amber-500' },
  not_started: { label: 'Not started', pill: 'bg-gray-100 text-gray-600 border-gray-200',      dot: 'bg-gray-400' },
};

const fmtClock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const timeAgo = (iso) => {
  if (!iso) return '—';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

// Ticks once a second on its own so the whole list doesn't re-render.
const LiveClock = ({ baseSeconds, fetchedAt }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{fmtClock(baseSeconds + (Date.now() - fetchedAt) / 1000)}</span>;
};

const Bone = ({ className = '' }) => <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;

const StatsSkeleton = () => (
  <div className="space-y-6" role="status" aria-label="Loading live stats">
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-4"><Bone className="h-3 w-20 mb-3" /><Bone className="h-8 w-14" /></div>
      ))}
    </div>
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <Bone className="h-4 w-40" />
      {[0, 1, 2].map(i => <Bone key={i} className="h-12 w-full" />)}
    </div>
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      {[0, 1, 2, 3].map(i => <Bone key={i} className="h-10 w-full" />)}
    </div>
  </div>
);

const SummaryCard = ({ label, value, tone, sub }) => (
  <div className={`rounded-xl border bg-white p-4 shadow-sm ${tone}`}>
    <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
    <div className="mt-1 text-3xl font-bold text-gray-900 tabular-nums">{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
  </div>
);

// One chip per required rater seat: done / interviewing / waiting
const SeatChips = ({ cand, requiredTypes }) => (
  <div className="flex flex-wrap gap-1">
    {requiredTypes.map(t => {
      const done = cand.ratedBy.find(r => r.raterType === t);
      const live = cand.interviewing.find(r => r.raterType === t);
      const cls = done ? 'bg-green-100 text-green-800 border-green-200'
        : live ? 'bg-blue-100 text-blue-800 border-blue-300'
        : 'bg-gray-50 text-gray-400 border-gray-200';
      const title = done ? `${done.name} — submitted ${timeAgo(done.at)}`
        : live ? `${live.name} — interviewing now`
        : `${t} — waiting`;
      return (
        <span key={t} title={title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold ${cls}`}>
          {done && <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          {live && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />}
          {TYPE_LABEL[t] || t}
        </span>
      );
    })}
  </div>
);

const LiveStatsModal = ({ isOpen, onClose }) => {
  const [data, setData] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState('candidates');   // 'candidates' | 'raters'
  const [tab, setTab] = useState('panel');          // 'panel' | 'two_rater'
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await liveStatsAPI.get();
      setData(res);
      setFetchedAt(Date.now());
      setError(false);
    } catch (err) {
      console.warn('[LiveStats] refresh failed:', err?.message);
      setError(true);   // keep showing the last good snapshot
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Poll while open and visible; refresh immediately when the tab comes back.
  useEffect(() => {
    if (!isOpen) return undefined;
    load();
    const interval = setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const tabCounts = useMemo(() => {
    const c = { panel: 0, two_rater: 0 };
    (data?.items || []).forEach(i => { c[i.panelType] += i.counts.total; });
    return c;
  }, [data]);

  // Interviews happening right now (flattened from the item list)
  const liveNow = useMemo(() => {
    const rows = [];
    (data?.items || []).forEach(item => item.candidates.forEach(c => c.interviewing.forEach(iv => {
      rows.push({ key: `${c.id}-${iv.name}`, candidate: c.name, item, rater: iv });
    })));
    return rows;
  }, [data]);

  const q = search.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    return (data?.items || [])
      .filter(i => i.panelType === tab)
      .map(i => ({
        ...i,
        visible: i.candidates.filter(c =>
          (statusFilter === 'all' || c.status === statusFilter) &&
          (!q || c.name.toLowerCase().includes(q) || i.itemNumber.toLowerCase().includes(q) || i.position.toLowerCase().includes(q))),
      }))
      .filter(i => i.visible.length > 0);
  }, [data, tab, statusFilter, q]);

  if (!isOpen) return null;

  const sum = data?.summary;
  const forceOpen = !!q || statusFilter !== 'all';

  return (
    <div className="fixed inset-0 z-[70] bg-gray-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Live stats">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <span className="relative flex h-3 w-3 flex-shrink-0">
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${error ? 'bg-red-400' : 'bg-emerald-400 animate-ping'}`} />
            <span className={`relative inline-flex h-3 w-3 rounded-full ${error ? 'bg-red-500' : 'bg-emerald-500'}`} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">Live Stats</h2>
            <p className="text-xs text-gray-500 truncate">
              {error ? 'Connection problem — showing the last update' : 'Refreshes automatically every 15 seconds'}
              {data && <> · updated <LiveAgo at={fetchedAt} /></>}
            </p>
          </div>
          <button
            onClick={load}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500">
            Close
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-6">
        {!data ? (
          error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
              Couldn&apos;t load live stats. <button onClick={load} className="underline font-semibold">Try again</button>
            </div>
          ) : <StatsSkeleton />
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryCard label="Being rated now" value={sum.beingRated} tone="border-blue-200" sub="interviews in progress" />
              <SummaryCard label="Complete" value={sum.complete} tone="border-green-200" sub={`of ${sum.candidates} candidates`} />
              <SummaryCard label="In progress" value={sum.inProgress} tone="border-amber-200" sub="some raters done" />
              <SummaryCard label="Not started" value={sum.notStarted} tone="border-gray-200" sub="no ratings yet" />
              <SummaryCard label="Raters online" value={`${sum.ratersOnline}/${sum.ratersTotal}`} tone="border-teal-200" sub="logged in now" />
            </div>

            {/* Being rated right now */}
            <section className="rounded-xl border border-blue-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                <h3 className="font-bold text-blue-900">Being rated right now</h3>
                <span className="text-xs text-blue-700">({liveNow.length})</span>
              </div>
              {liveNow.length === 0 ? (
                <p className="px-4 py-5 text-sm text-gray-500">No interviews are running at the moment.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {liveNow.map(r => (
                    <li key={r.key} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-900 truncate">{r.candidate}</div>
                        <div className="text-xs text-gray-500 truncate">Item # {r.item.itemNumber} · {r.item.position}</div>
                      </div>
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">{r.rater.name}</span>
                        <span className="ml-1 text-xs text-gray-500">({TYPE_LABEL[r.rater.raterType] || r.rater.raterType})</span>
                      </div>
                      <div className="rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-sm font-bold">
                        ⏱ <LiveClock baseSeconds={r.rater.elapsedSeconds} fetchedAt={fetchedAt} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Latest submissions */}
            {data.recent.length > 0 && (
              <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100"><h3 className="font-bold text-gray-800">Latest submissions</h3></div>
                <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {data.recent.map((r, i) => (
                    <li key={i} className="px-4 py-2 flex flex-wrap items-center gap-x-3 text-sm">
                      <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      <span className="font-medium text-gray-900">{r.raterName}</span>
                      <span className="text-xs text-gray-500">({TYPE_LABEL[r.raterType] || r.raterType})</span>
                      <span className="text-gray-600">rated <strong className="text-gray-900">{r.candidateName}</strong></span>
                      <span className="text-xs text-gray-400 truncate">Item # {r.itemNumber}</span>
                      <span className="ml-auto text-xs text-gray-500">{timeAgo(r.at)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* View switch */}
            <div className="flex gap-2 border-b border-gray-200">
              {[['candidates', 'By candidate'], ['raters', 'By rater']].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={`px-4 py-2 -mb-px text-sm font-semibold border-b-2 focus:outline-none ${view === id ? 'border-green-600 text-green-800' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {view === 'candidates' ? (
              <>
                {/* Interview type tabs */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex gap-2" role="tablist" aria-label="Interview type">
                    {[['panel', 'Panel interview', '6 raters'], ['two_rater', '2-rater interview', 'Regular Member + End-User']].map(([id, label, hint]) => (
                      <button
                        key={id}
                        role="tab"
                        aria-selected={tab === id}
                        onClick={() => setTab(id)}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-400 ${tab === id ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        <span className="block">{label} <span className={`ml-1 text-xs ${tab === id ? 'text-green-100' : 'text-gray-400'}`}>{tabCounts[id]}</span></span>
                        <span className={`block text-[11px] font-normal ${tab === id ? 'text-green-100' : 'text-gray-500'}`}>{hint}</span>
                      </button>
                    ))}
                  </div>
                  <input
                    type="search"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search candidate, item or position…"
                    className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {[['all', 'All'], ['being_rated', 'Being rated'], ['in_progress', 'In progress'], ['not_started', 'Not started'], ['complete', 'Complete']].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setStatusFilter(id)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold focus:outline-none ${statusFilter === id ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {filteredItems.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">Nothing matches the current filters.</div>
                ) : (
                  <div className="space-y-3">
                    {filteredItems.map(item => {
                      const open = forceOpen || !!expanded[item.itemNumber];
                      const pct = item.counts.total ? Math.round((item.counts.complete / item.counts.total) * 100) : 0;
                      return (
                        <section key={item.itemNumber} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpanded(e => ({ ...e, [item.itemNumber]: !e[item.itemNumber] }))}
                            aria-expanded={open}
                            className="w-full text-left px-4 py-3 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-400"
                          >
                            <div className="flex items-center gap-3">
                              <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-gray-900 truncate">Item # {item.itemNumber} · {item.position}</div>
                                <div className="text-xs text-gray-500 truncate">{item.assignment} · SG {item.salaryGrade}</div>
                              </div>
                              <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold">
                                {item.counts.beingRated > 0 && <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5">{item.counts.beingRated} live</span>}
                                {item.counts.inProgress > 0 && <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">{item.counts.inProgress} in progress</span>}
                                {item.counts.notStarted > 0 && <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">{item.counts.notStarted} not started</span>}
                              </div>
                              <div className="text-sm font-bold text-gray-800 tabular-nums">{item.counts.complete}/{item.counts.total}</div>
                            </div>
                            <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                              <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </button>

                          {open && (
                            <ul className="divide-y divide-gray-100 border-t border-gray-100">
                              {item.visible.map(c => {
                                const st = STATUS[c.status];
                                return (
                                  <li key={c.id} className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                                    <div className="min-w-0 w-full sm:w-64 flex items-center gap-2">
                                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${st.dot}`} />
                                      <span className="font-medium text-gray-900 truncate">{c.name}</span>
                                    </div>
                                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.pill}`}>{st.label}</span>
                                    <div className="flex-1 min-w-[200px]"><SeatChips cand={c} requiredTypes={item.requiredTypes} /></div>
                                    <span className="text-xs text-gray-500 tabular-nums">{c.ratedBy.length}/{item.requiredTypes.length}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Rater</th>
                      <th className="px-4 py-3 text-left">Role</th>
                      <th className="px-4 py-3 text-left">Now</th>
                      <th className="px-4 py-3 text-left w-56">Submitted</th>
                      <th className="px-4 py-3 text-left">Last submission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.raters.map(r => {
                      const pct = r.assigned ? Math.min(100, Math.round((r.submitted / r.assigned) * 100)) : 0;
                      return (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`h-2.5 w-2.5 rounded-full ${r.online ? 'bg-emerald-500' : 'bg-gray-300'}`} title={r.online ? 'Online' : 'Offline'} />
                              <span className="font-medium text-gray-900">{r.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{r.raterType || '—'}</td>
                          <td className="px-4 py-3">
                            {r.current ? (
                              <div>
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-semibold">
                                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                                  Interviewing · <LiveClock baseSeconds={r.current.elapsedSeconds} fetchedAt={fetchedAt} />
                                </span>
                                <div className="text-xs text-gray-600 mt-0.5">{r.current.candidateName} · Item # {r.current.itemNumber}</div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">{r.online ? 'Idle' : 'Offline'}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 rounded-full bg-gray-200 overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${pct}%` }} /></div>
                              <span className="text-xs font-semibold text-gray-700 tabular-nums w-14 text-right">{r.submitted}/{r.assigned}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{timeAgo(r.lastSubmittedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-center text-xs text-gray-400 pb-4">
              Shows who has rated and who is interviewing — never scores. &quot;Being rated&quot; means a rater&apos;s interview timer is running.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

// "12s ago" that updates itself without re-rendering the whole modal
const LiveAgo = ({ at }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000));
  return <>{s < 5 ? 'just now' : `${s}s ago`}</>;
};

export default LiveStatsModal;