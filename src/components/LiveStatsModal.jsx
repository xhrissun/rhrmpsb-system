import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { liveStatsAPI, queueAPI } from '../utils/api';

// ─── Live Stats — broadcast screen ───────────────────────────────────────────
// One fixed, non-scrolling screen meant to be put on a TV / projector / screen
// share. Everything is sized in `em` off a root font-size that follows the
// viewport, and every list is a <FitBox>: it shows as many rows as physically
// fit and turns the rest into a "+N more" row — so nothing ever scrolls or clips.
// Shows names, rater types and status only — never scores.
//
// Still an overlay (not a route) so a rater who opens it mid-rating keeps their
// in-progress form exactly as it was.
//
// Interviews are grouped by ROOM: every room gets its own panel with what is
// happening now and its own queue. A candidate's room is the room whose queue
// they were lined up in. Admin / secretariat get a "Manage queue" button (hidden
// on the broadcast until the mouse moves) to create rooms and line candidates up.
// Rooms and queues are part of the same /live-stats snapshot — no extra requests.

const POLL_MS = 15000;
const IDLE_HIDE_MS = 3000;
const THEMES = [['dark', 'Dark'], ['contrast', 'High contrast'], ['light', 'Light']];
const ZOOMS = [0.9, 1, 1.15, 1.3, 1.5];
const readPref = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const savePref = (key, val) => { try { localStorage.setItem(key, String(val)); } catch { /* private mode — ignore */ } };

const TYPE_LABEL = {
  'Chairperson': 'CHAIR',
  'Vice-Chairperson': 'VICE',
  'Regular Member': 'REG',
  'DENREU': 'DENREU',
  'Gender and Development': 'GAD',
  'End-User': 'END-USER',
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

// ─── Sound effects: tiny synthesized chimes (no audio files). Browsers only let a page make sound
// after the user has clicked or pressed a key once, so the AudioContext is woken on every gesture.
const SOUNDS = {
  start:    { type: 'sine',     notes: [[659.25, 0, 0.18], [880, 0.14, 0.3]] },                                   // interview begins
  submit:   { type: 'triangle', notes: [[987.77, 0, 0.4]] },                                                     // a rating came in
  complete: { type: 'sine',     notes: [[523.25, 0, 0.16], [659.25, 0.13, 0.16], [783.99, 0.26, 0.16], [1046.5, 0.39, 0.5]] }, // candidate fully rated
};
const useSound = () => {
  const ctxRef = useRef(null);
  const ensure = useCallback(() => {
    try {
      if (!ctxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctxRef.current = new AC();
      }
      if (ctxRef.current.state === 'suspended') ctxRef.current.resume().catch(() => {});
      return ctxRef.current;
    } catch { return null; }
  }, []);
  useEffect(() => () => { try { ctxRef.current?.close?.(); } catch { /* ignore */ } ctxRef.current = null; }, []);
  const play = useCallback((kind) => {
    const spec = SOUNDS[kind];
    const ctx = ensure();
    if (!spec || !ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + 0.02;
    spec.notes.forEach(([freq, at, dur]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = spec.type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.linearRampToValueAtTime(0.18, t0 + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t0 + at); osc.stop(t0 + at + dur + 0.05);
    });
  }, [ensure]);
  return { ensure, play };
};

// Same person / same room name = same text ignoring case and spacing.
const sameKey = (n) => String(n || '').replace(/\s+/g, ' ').trim().toLowerCase();

// Small self-ticking pieces so the whole screen doesn't re-render every second.
const useTick = () => {
  const [, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN(n => n + 1), 1000); return () => clearInterval(t); }, []);
};
const LiveClock = ({ baseSeconds, fetchedAt }) => {
  useTick();
  return <>{fmtClock(baseSeconds + (Date.now() - fetchedAt) / 1000)}</>;
};
const WallClock = () => {
  useTick();
  return <b>{new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</b>;
};
const LiveAgo = ({ at }) => {
  useTick();
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000));
  return <>{s < 5 ? 'just now' : `${s}s ago`}</>;
};

// Renders `items`, then measures and keeps only the ones that fully fit the box.
// The overflow becomes one "+N more" cell. Rows/cards must have a fixed height.
const FitBox = ({ items, renderItem, moreLabel, className }) => {
  const ref = useRef(null);
  const [cap, setCap] = useState(null);   // null = "render everything and measure"
  const [chip, setChip] = useState(true); // false when even one entry leaves no room for "+N more"
  const [box, setBox] = useState('');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setBox(`${el.clientWidth}x${el.clientHeight}`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => { setCap(null); }, [items, box]);

  useLayoutEffect(() => {
    if (cap !== null) return;
    const el = ref.current;
    if (!el) return;
    const kids = Array.from(el.children).filter(k => !k.dataset.more);
    const bottomOf = (k) => k.offsetTop + k.offsetHeight;
    const limit = el.clientHeight + 1;
    if (kids.every(k => bottomOf(k) <= limit)) { setChip(true); setCap(kids.length); return; }
    // Not everything fits: keep what fits above a "+N more" line (2em tall + the grid gap).
    const cs = getComputedStyle(el);
    const reserve = parseFloat(cs.fontSize) * 2 + (parseFloat(cs.rowGap) || 0);
    // Everything in the FIRST row always stays (it may clip a little, but never drops a card that sits
    // beside another); later rows are kept only while they fully fit above the "+N more" line.
    const firstTop = kids[0] ? kids[0].offsetTop : 0;
    let n = 0;
    for (const k of kids) { if (k.offsetTop === firstTop || bottomOf(k) + reserve <= limit) n += 1; else break; }
    n = Math.max(1, n);
    setChip(kids.slice(0, n).every(k => bottomOf(k) + reserve <= limit));
    setCap(n);
  }, [cap, items]);

  const shown = cap === null ? items : items.slice(0, cap);
  const hidden = items.length - shown.length;
  return (
    <div ref={ref} className={`ls-fit ${className || ''}`}>
      {shown.map(renderItem)}
      {cap !== null && hidden > 0 && chip && <div data-more="1" className="ls-more">+{hidden} {moreLabel}</div>}
    </div>
  );
};

// "Also applied: # 123, # 456" — other item numbers this same person applied for.
const otherText = (list) => (list && list.length ? `Also applied: ${list.map(o => `# ${o.itemNumber}`).join(', ')}` : '');

// One chip per required rater seat: done / interviewing / waiting
const SeatChips = ({ cand, requiredTypes }) => (
  <div className="ls-seats">
    {requiredTypes.map(t => {
      const done = cand.ratedBy.find(r => r.raterType === t);
      const live = cand.interviewing.find(r => r.raterType === t);
      return (
        <span key={t} className={`ls-seat ${done ? 'done' : live ? 'live' : ''}`}>
          {done && '✓ '}{TYPE_LABEL[t] || t}
        </span>
      );
    })}
  </div>
);

const CSS = `
.ls-root{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;gap:1.1em;padding:1.3em 1.8em 1.5em;overflow:hidden;
  --bg:#0d1a16;--panel:#142620;--card:#0f201a;--edge:#24403a;--text:#eef4ef;--muted:#8aa597;--live:#f4c04e;--done:#62d394;
  --pos:#9fe3bd;--seat-off:#6f8a7c;--on-accent:#0d1a16;--btn:#1d3a30;--btn-h:#27493d;
  background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,-apple-system,"Helvetica Neue",sans-serif;
  font-size:calc(clamp(11px,min(1.12vw,2.05vh),30px) * var(--zoom,1));line-height:1.25}
.ls-root[data-theme="contrast"]{--bg:#000;--panel:#050807;--card:#000;--edge:#6b7d73;--text:#fff;--muted:#d3dfd8;--live:#ffd43b;--done:#4ade80;--pos:#7dffb0;--seat-off:#c3d2c9;--on-accent:#000;--btn:#1f2a25;--btn-h:#2e3d36}
.ls-root[data-theme="light"]{--bg:#f3f6f4;--panel:#fff;--card:#edf2ee;--edge:#b9c8bf;--text:#0e1f17;--muted:#46604f;--live:#b45309;--done:#15803d;--pos:#14532d;--seat-off:#5b7366;--on-accent:#fff;--btn:#dfe9e3;--btn-h:#cddbd2}
.ls-root *{box-sizing:border-box}
.ls-root.idle{cursor:none}
.ls-head{display:flex;align-items:center;gap:1.1em;flex:none}
.ls-title{margin:0;font-size:1.9em;font-weight:700;letter-spacing:-.01em}
.ls-dot{width:.8em;height:.8em;border-radius:50%;background:var(--done);animation:ls-ping 2s infinite}
.ls-dot.err{background:#ef6a6a;animation:none}
@keyframes ls-ping{0%{box-shadow:0 0 0 0 rgba(98,211,148,.6)}70%,100%{box-shadow:0 0 0 .7em rgba(98,211,148,0)}}
@keyframes ls-blink{50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.ls-root *{animation:none!important}}
.ls-stats{display:flex;gap:2.2em;margin-left:auto}
.ls-stat b{display:block;font-size:2em;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.ls-stat span{font-size:.8em;color:var(--muted)}
.ls-clock{flex:none;text-align:right;margin-left:1.2em}
.ls-clock b{display:block;font-size:1.6em;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.ls-clock span{font-size:.8em;color:var(--muted)}
.ls-clock.err span{color:#ef9a9a}
.ls-main{flex:1;min-height:0;display:grid;grid-template-rows:minmax(0,1fr) 10.5em;gap:1.2em}
.ls-rooms{min-height:0;display:grid;gap:1.2em;grid-template-columns:repeat(var(--cols),minmax(0,1fr));grid-template-rows:repeat(var(--rows),minmax(0,1fr))}
.ls-room{display:grid;grid-template-rows:auto minmax(0,1.25fr) minmax(0,1fr);gap:.7em;min-height:0;min-width:0;background:var(--panel);border:1px solid var(--edge);border-radius:.8em;padding:1em 1.1em}
.ls-room.busy{border-color:rgba(244,192,78,.45)}
.ls-room.big{font-size:1.2em;border-color:var(--live)}
.ls-rooms.spot{grid-template-columns:minmax(0,3fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr)}
.ls-side{min-height:0;display:grid;gap:1.2em;grid-template-rows:repeat(var(--srows),minmax(0,1fr))}
.ls-rh.click{cursor:pointer}
.ls-badge{flex:none;display:inline-grid;place-items:center;min-width:1.5em;height:1.5em;border-radius:.4em;background:var(--edge);color:var(--text);font-size:.85em;font-weight:700;align-self:center}
.ls-pos{color:var(--pos);font-size:1.1em;font-weight:650;line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ls-room.noq:not(.dense){grid-template-rows:auto minmax(0,1fr) auto}
.ls-rh{display:flex;align-items:baseline;gap:.7em;min-width:0}
.ls-rh h3{margin:0;font-size:1.45em;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ls-rh .st{margin-left:auto;flex:none;font-size:.9em;color:var(--muted)}
.ls-rh .st.live{color:var(--live);font-weight:600}
.ls-room.dense{grid-template-rows:auto minmax(0,1fr) minmax(0,1fr);gap:.5em;padding:.8em .9em}
.ls-room.dense .ls-card{height:5.4em;padding:.35em .8em;gap:.1em}
.ls-room.dense .ls-pos{display:block;white-space:nowrap;text-overflow:ellipsis;font-size:.95em}
.ls-room.dense .ls-sub,.ls-room.dense .ls-seats,.ls-room.dense .ls-sh,.ls-room.dense .ls-sum{display:none}
.ls-room.dense .ls-with{font-size:.8em;white-space:nowrap;text-overflow:ellipsis}
.ls-room.dense .ls-timer{font-size:1.5em}
.ls-room.dense .ls-row{height:3.5em}
.ls-room.dense .ls-also{display:none}
.ls-room.dense .ls-sec+.ls-sec{padding-top:.5em}
.ls-sec{display:flex;flex-direction:column;min-height:0}
.ls-sec+.ls-sec{border-top:1px solid var(--edge);padding-top:.7em}
.ls-sh{flex:none;margin:0 0 .5em;font-size:.95em;font-weight:600;color:var(--muted)}
.ls-sh span{font-variant-numeric:tabular-nums;margin-left:.4em}
.ls-panel{display:flex;flex-direction:column;min-height:0;min-width:0;background:var(--panel);border:1px solid var(--edge);border-radius:.8em;padding:1em 1.1em}
.ls-ph{display:flex;align-items:baseline;gap:.6em;margin-bottom:.8em;flex:none}
.ls-ph h3{margin:0;font-size:1.25em;font-weight:650}
.ls-ph span{color:var(--muted);font-variant-numeric:tabular-nums}
.ls-fit{position:relative;flex:1;min-height:0;overflow:hidden;display:grid;align-content:start;gap:.7em}
.ls-fit.cards{grid-template-columns:repeat(auto-fill,minmax(19em,1fr))}
.ls-fit.cols{grid-template-columns:repeat(auto-fill,minmax(30em,1fr));gap:.45em 1.6em}
.ls-fit.rows{grid-template-columns:minmax(0,1fr);gap:.45em}
.ls-more{grid-column:1/-1;display:flex;align-items:center;justify-content:center;height:2em;color:var(--muted)}
.ls-empty{margin:auto;text-align:center;color:var(--muted);max-width:28em}
.ls-card{height:16.5em;overflow:hidden;display:flex;flex-direction:column;gap:.35em;background:var(--card);border:1px solid var(--edge);border-radius:.7em;padding:.8em .9em}
.ls-top{display:flex;align-items:flex-start;justify-content:space-between;gap:.8em}
.ls-name{font-size:1.2em;font-weight:650;line-height:1.15;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ls-timer{flex:none;font-size:1.9em;font-weight:700;line-height:1;color:var(--live);font-variant-numeric:tabular-nums}
.ls-sub{color:var(--muted);font-size:.9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ls-seats{display:flex;flex-wrap:wrap;gap:.3em}
.ls-seat{display:inline-flex;align-items:center;gap:.3em;border:1px solid var(--edge);border-radius:99em;padding:.05em .6em;font-size:.8em;font-weight:600;color:var(--seat-off)}
.ls-seat.done{background:var(--done);border-color:var(--done);color:var(--on-accent)}
.ls-seat.live{color:var(--live);border-color:var(--live)}
.ls-seat.live::before{content:"";width:.5em;height:.5em;border-radius:50%;background:var(--live);animation:ls-blink 1.2s infinite}
.ls-with{color:var(--muted);font-size:.85em;line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
.ls-also{color:var(--live);font-size:.82em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ls-row{display:grid;grid-template-columns:2em minmax(0,1fr) auto;align-items:center;gap:.6em;height:5.6em;padding:0 .8em 0 .4em;border-radius:.5em;background:var(--card)}
.ls-row.first{outline:1px solid var(--live)}
.ls-num{text-align:center;font-size:1.15em;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums}
.ls-row.first .ls-num{color:var(--live)}
.ls-row .ls-pos{display:block;white-space:nowrap;text-overflow:ellipsis;font-size:.98em}
.ls-rname{font-size:1.1em;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ls-tag{font-size:.85em;color:var(--muted);white-space:nowrap}
.ls-row.first .ls-tag{color:var(--live);font-weight:600}
.ls-rec{display:flex;align-items:center;gap:.5em;height:2.1em;white-space:nowrap;overflow:hidden}
.ls-rec i{font-style:normal;color:var(--done)}
.ls-rec em{font-style:normal;color:var(--muted);font-size:.85em}
.ls-rec .who{font-weight:600}
.ls-rec .cand{overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
.ls-rec .ago{margin-left:auto;color:var(--muted);font-size:.85em}
.ls-controls{position:fixed;right:1.2em;bottom:1.2em;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.5em;max-width:calc(100vw - 2.4em);opacity:0;pointer-events:none;transition:opacity .25s}
.ls-controls.show,.ls-controls:focus-within{opacity:1;pointer-events:auto}
.ls-controls button{font:inherit;font-size:.9em;color:var(--text);background:var(--btn);border:1px solid var(--edge);border-radius:.5em;padding:.5em .9em;cursor:pointer}
.ls-controls button:hover{background:var(--btn-h)}
.ls-ctl-group{display:flex;gap:.25em;align-items:center}
.ls-ctl-group>span{color:var(--muted);font-size:.85em;margin-right:.2em}
.ls-controls button.on{background:var(--live);color:var(--on-accent);border-color:var(--live)}
.ls-hint{align-self:center;color:var(--muted);font-size:.8em;background:var(--bg);padding:.3em .6em;border-radius:.4em;white-space:nowrap}
.ls-controls button:focus-visible{outline:2px solid var(--live);outline-offset:2px}
.ls-auto{flex:none;align-self:center;font-size:.7em;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);border:1px solid var(--edge);border-radius:99em;padding:.05em .6em}
.ls-guide{position:absolute;inset:0;z-index:5;display:grid;place-items:center;background:rgba(0,0,0,.72);padding:2em}
.ls-guide-box{width:min(46em,100%);max-height:100%;overflow:auto;background:var(--panel);border:1px solid var(--edge);border-radius:.9em;padding:1.4em 1.7em;box-shadow:0 1em 3em rgba(0,0,0,.5)}
.ls-guide-box h2{margin:0 0 .2em;font-size:1.5em}
.ls-guide-box p{margin:0 0 1em;color:var(--muted);font-size:.9em}
.ls-guide-box h3{margin:1.1em 0 .4em;font-size:.85em;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.ls-keys{display:grid;grid-template-columns:auto 1fr;gap:.5em 1.2em;align-items:center}
.ls-keys kbd{justify-self:start;min-width:2.2em;text-align:center;font:inherit;font-weight:700;font-size:.9em;padding:.15em .55em;border:1px solid var(--edge);border-bottom-width:.2em;border-radius:.4em;background:var(--card)}
.ls-keys span{font-size:.95em}
.ls-snd{display:flex;flex-wrap:wrap;gap:.5em}
.ls-snd button,.ls-guide-box>button{font:inherit;font-size:.9em;color:var(--text);background:var(--btn);border:1px solid var(--edge);border-radius:.5em;padding:.4em .8em;cursor:pointer}
.ls-snd button:hover,.ls-guide-box>button:hover{background:var(--btn-h)}
.ls-guide-box>button{margin-top:1.2em}
.ls-done{margin:auto;display:flex;flex-direction:column;align-items:center;text-align:center;gap:.2em;max-width:100%;padding:0 .5em}
.ls-done-t{color:var(--done);font-size:1.15em;font-weight:700;letter-spacing:.02em}
.ls-done-n{font-size:1.5em;font-weight:700;line-height:1.15;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ls-done-p{color:var(--pos);font-weight:600;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ls-done-s{color:var(--muted);font-size:.85em}
.ls-room.dense .ls-done-s{display:none}
.ls-room.dense .ls-done-n{font-size:1.2em}
.ls-center{margin:auto;text-align:center;color:var(--muted);font-size:1.2em}
.ls-center button{font:inherit;color:var(--text);text-decoration:underline;background:none;border:0;cursor:pointer}
@media (max-aspect-ratio:1/1){
  .ls-rooms{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:repeat(var(--n),minmax(0,1fr))!important}
  .ls-stats{gap:1.2em}
}
`;

// ─── Rooms & queue manager (admin / secretariat) — a normal scrolling dialog, not part of the broadcast ───
const QueueManager = ({ data, reload, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [sel, setSel] = useState(null);          // room id, or 'none' for "no room assigned"
  const [newRoom, setNewRoom] = useState('');
  const [item, setItem] = useState('all');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState({});

  const rooms = useMemo(() => data?.rooms || [], [data]);
  const allQueue = useMemo(() => data?.queue || [], [data]);
  const orphans = useMemo(() => allQueue.filter(q => !q.roomId), [allQueue]);
  const tabs = useMemo(() => [...rooms, ...(orphans.length ? [{ id: 'none', name: 'No room assigned' }] : [])], [rooms, orphans]);
  const current = tabs.find(t => t.id === sel) || tabs[0] || null;
  const isRoom = !!current && current.id !== 'none';
  const queue = useMemo(
    () => allQueue.filter(q => (current?.id === 'none' ? !q.roomId : q.roomId === current?.id)),
    [allQueue, current],
  );
  const queued = useMemo(() => new Set(allQueue.map(q => q.candidateId)), [allQueue]);
  const itemOptions = useMemo(() => (data?.items || []).filter(i => i.counts.complete < i.counts.total), [data]);
  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = [];
    (data?.items || []).forEach(it => {
      if (item !== 'all' && it.itemNumber !== item) return;
      it.candidates.forEach(c => {
        if (c.status === 'complete' || queued.has(c.id)) return;
        if (q && !c.name.toLowerCase().includes(q)) return;
        rows.push({ id: c.id, name: c.name, itemNumber: it.itemNumber, position: it.position, assignment: it.assignment, otherItems: c.otherItems });
      });
    });
    return rows;
  }, [data, item, search, queued]);

  const roomKeys = useMemo(() => new Set(rooms.map(r => sameKey(r.name))), [rooms]);
  const pickedIds = Object.keys(picked).filter(k => picked[k]);
  const run = async (fn) => {
    setBusy(true); setErr(''); setNote('');
    try { await fn(); await reload(); }
    catch (e) { setErr(e?.response?.data?.message || e?.message || 'Something went wrong'); }
    finally { setBusy(false); }
  };
  const addRoom = () => {
    const name = newRoom.trim();
    if (!name) return;
    run(async () => { const r = await queueAPI.addRoom(name); setNewRoom(''); setSel(r.id); });
  };
  const renameRoom = () => {
    const name = window.prompt('Rename room', current.name);
    if (name && name.trim() && name.trim() !== current.name) run(() => queueAPI.renameRoom(current.id, name));
  };
  const deleteRoom = () => {
    if (window.confirm(`Delete "${current.name}"? Anyone queued there moves to "No room assigned".`)) {
      run(async () => { await queueAPI.removeRoom(current.id); setSel(null); });
    }
  };
  const addAuto = () => run(async () => {
    const r = await queueAPI.addAuto(pickedIds);
    setPicked({});
    setNote(`Added ${r.added}${r.roomsCreated?.length ? `, created ${r.roomsCreated.length === 1 ? 'room' : 'rooms'}: ${r.roomsCreated.join(', ')}` : ''}`);
  });
  const addPicked = () => run(async () => { await queueAPI.add(current.id, pickedIds); setPicked({}); });
  const move = (i, d) => run(async () => {
    const ids = queue.map(q => q.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await queueAPI.reorder(ids);
  });
  const clearRoom = () => {
    if (isRoom && window.confirm(`Clear the queue for "${current.name}"?`)) run(() => queueAPI.clear(current.id));
  };

  const btn = 'px-2 py-1 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40';
  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Manage rooms and queues" style={{ fontSize: 16 }}>
      <div className="bg-white text-gray-900 rounded-xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3">
          <h2 className="text-lg font-bold flex-1">Rooms and interview queues</h2>
          {err && <span className="text-sm text-red-600">{err}</span>}
          {note && !err && <span className="text-sm text-green-700">{note}</span>}
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900">Done</button>
        </div>

        <div className="px-5 py-2 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setSel(t.id); setPicked({}); }}
              aria-pressed={current?.id === t.id}
              className={`px-3 py-1 rounded-full border text-sm font-semibold ${current?.id === t.id ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'}`}
            >
              {t.name} <span className="opacity-70">{allQueue.filter(q => (t.id === 'none' ? !q.roomId : q.roomId === t.id)).length}</span>
            </button>
          ))}
          <span className="flex items-center gap-1 ml-auto">
            <input value={newRoom} onChange={e => setNewRoom(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRoom()} placeholder="New room name" maxLength={60} className="rounded border border-gray-300 px-2 py-1 text-sm w-40" />
            <button className={btn} disabled={busy || !newRoom.trim()} onClick={addRoom}>Add room</button>
          </span>
        </div>

        {(
          <div className="flex-1 min-h-0 grid md:grid-cols-2 divide-x divide-gray-200">
            <div className="flex flex-col min-h-0">
              <div className="px-5 py-2 flex items-center gap-2 bg-gray-50 border-b border-gray-100">
                <h3 className="font-semibold flex-1 truncate">{current ? `${current.name} queue (${queue.length})` : 'Rooms'}</h3>
                {isRoom && <button className={btn} disabled={busy} onClick={renameRoom}>Rename</button>}
                {isRoom && <button className={btn} disabled={busy} onClick={deleteRoom}>Delete room</button>}
                {isRoom && <button className={btn} disabled={busy || queue.length === 0} onClick={clearRoom}>Clear</button>}
              </div>
              <ol className="flex-1 overflow-y-auto divide-y divide-gray-100">
                {queue.length === 0 && <li className="p-5 text-sm text-gray-500">{!current ? 'No rooms yet. Pick candidates on the right and press “Add by place of assignment”. A room is created for each place automatically. Or add a room by name above.' : isRoom ? 'Nobody is queued in this room. Pick candidates on the right.' : 'Nothing here.'}</li>}
                {queue.map((q, i) => (
                  <li key={q.id} className="px-5 py-2 flex items-center gap-2">
                    <span className="w-6 text-sm font-bold text-gray-400 tabular-nums">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{q.name}</div>
                      <div className="text-xs text-gray-500 truncate">Item # {q.itemNumber}, {q.position}{q.status === 'being_rated' ? ' — being rated now' : ''}</div>
                      {q.otherItems?.length > 0 && <div className="text-xs text-amber-700 truncate">{otherText(q.otherItems)}</div>}
                    </div>
                    {isRoom && <>
                      <button className={btn} disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${q.name} up`}>↑</button>
                      <button className={btn} disabled={busy || i === queue.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${q.name} down`}>↓</button>
                    </>}
                    {rooms.length > (isRoom ? 1 : 0) && (
                      <select
                        value=""
                        disabled={busy}
                        onChange={e => e.target.value && run(() => queueAPI.move(q.id, e.target.value))}
                        aria-label={`Move ${q.name} to another room`}
                        className="rounded border border-gray-300 px-1 py-1 text-sm w-24"
                      >
                        <option value="">Move to…</option>
                        {rooms.filter(r => r.id !== q.roomId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    )}
                    <button className={btn} disabled={busy} onClick={() => run(() => queueAPI.remove(q.id))} aria-label={`Remove ${q.name}`}>Remove</button>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col min-h-0">
              <div className="px-5 py-2 flex flex-wrap items-center gap-2 bg-gray-50 border-b border-gray-100">
                <h3 className="font-semibold">Pick candidates</h3>
                <select value={item} onChange={e => setItem(e.target.value)} className="flex-1 min-w-[10rem] rounded border border-gray-300 px-2 py-1 text-sm">
                  <option value="all">All items</option>
                  {itemOptions.map(i => <option key={i.itemNumber} value={i.itemNumber}>Item # {i.itemNumber}, {i.position}</option>)}
                </select>
                <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name…" className="flex-1 min-w-[8rem] rounded border border-gray-300 px-2 py-1 text-sm" />
              </div>
              {(
                <>
                  <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
                    {available.length === 0 && <li className="p-5 text-sm text-gray-500">No more candidates match. Anyone already in a room&apos;s queue is hidden here.</li>}
                    {available.map(c => (
                      <li key={c.id}>
                        <label className="px-5 py-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50">
                          <input type="checkbox" checked={!!picked[c.id]} onChange={e => setPicked(p => ({ ...p, [c.id]: e.target.checked }))} />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium truncate">{c.name}</span>
                            <span className="block text-xs text-gray-500 truncate">Item # {c.itemNumber}, {c.position}</span>
                            {c.assignment && (
                              <span className="block text-xs text-gray-600 truncate">
                                Place: {c.assignment}
                                {!roomKeys.has(sameKey(c.assignment)) && <span className="ml-1 rounded bg-blue-100 text-blue-800 px-1">new room</span>}
                              </span>
                            )}
                            {c.otherItems?.length > 0 && <span className="block text-xs text-amber-700 truncate">{otherText(c.otherItems)}</span>}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="px-5 py-3 border-t border-gray-200 flex items-center gap-3">
                    <button className={btn} disabled={available.length === 0} onClick={() => setPicked(Object.fromEntries(available.map(c => [c.id, true])))}>Select all shown</button>
                    <button onClick={addAuto} disabled={busy || pickedIds.length === 0} title="Each candidate goes to the room named after their place of assignment. Missing rooms are created."
                      className={`ml-auto px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40 ${isRoom ? 'border border-green-600 text-green-700 hover:bg-green-50' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                      Add {pickedIds.length || ''} by place of assignment
                    </button>
                    {isRoom && (
                      <button onClick={addPicked} disabled={busy || pickedIds.length === 0} className="px-4 py-1.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-40">
                        Add {pickedIds.length || ''} to {current.name}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Keyboard / mouse cheat sheet. Opens with ? (or H) and from the control bar.
const ShortcutGuide = ({ onClose, onTest, soundOn, canManageQueue, hasRooms }) => (
  <div className="ls-guide" role="dialog" aria-modal="true" aria-label="Shortcuts" onClick={onClose}>
    <div className="ls-guide-box" onClick={e => e.stopPropagation()}>
      <h2>Shortcuts</h2>
      <p>Move the mouse to show the buttons at the bottom-right. Press <b>?</b> again, <b>Esc</b>, or click outside to close this.</p>

      <h3>Display</h3>
      <div className="ls-keys">
        <kbd>F</kbd><span>Full screen on / off</span>
        <kbd>T</kbd><span>Switch theme: Dark, High contrast, Light</span>
        <kbd>+</kbd><span>Bigger text (5 sizes)</span>
        <kbd>−</kbd><span>Smaller text</span>
      </div>

      <h3>Rooms</h3>
      <div className="ls-keys">
        <kbd>1 – 9</kbd><span>Spotlight that room (press again to go back). Number badges are shown beside each room name.</span>
        <kbd>0</kbd><span>Show all rooms</span>
        <kbd>Click</kbd><span>Click a room&apos;s name to spotlight it</span>
      </div>

      <h3>Sound</h3>
      <div className="ls-keys">
        <kbd>M</kbd><span>Sound {soundOn ? 'on, press to mute' : 'is off, press to turn on'}</span>
      </div>
      <div className="ls-snd" style={{ marginTop: '.6em' }}>
        <button onClick={() => onTest('start')}>▶ Interview starts</button>
        <button onClick={() => onTest('submit')}>▶ Rating submitted</button>
        <button onClick={() => onTest('complete')}>▶ Candidate fully rated</button>
      </div>
      <p style={{ marginTop: '.6em', marginBottom: 0 }}>If you hear nothing, click anywhere on the screen once. Browsers block sound until then.</p>

      <h3>Other</h3>
      <div className="ls-keys">
        <kbd>?</kbd><span>Open / close this guide</span>
        <kbd>Esc</kbd><span>Closes, in order: this guide, the spotlight, then Live Stats</span>
        {canManageQueue && <><kbd>Manage queue</kbd><span>{hasRooms ? 'Line candidates up per room. “Add by place of assignment” creates missing rooms for you.' : 'Pick candidates and use “Add by place of assignment”. Rooms are created for you.'}</span></>}
      </div>
      <button onClick={onClose}>Close</button>
    </div>
  </div>
);

// One room on the broadcast: what is happening now, and who is lined up next.
const RoomPanel = ({ view, fetchedAt, canManageQueue, hasRooms, dense, big, index, numbered, onSpot }) => {
  const { name, cards, waiting } = view;
  return (
    <section className={`ls-room ${cards.length ? 'busy' : ''} ${dense ? 'dense' : ''} ${big ? 'big' : ''} ${waiting.length === 0 ? 'noq' : ''}`}>
      <div className={`ls-rh ${numbered ? 'click' : ''}`} onClick={numbered ? onSpot : undefined} title={numbered ? (big ? 'Click to show all rooms' : `Click (or press ${index + 1}) to spotlight this room`) : undefined}>
        {numbered && <span className="ls-badge">{index + 1}</span>}
        <h3>{name}</h3>
        {view.auto && <span className="ls-auto" title="Created automatically from the place of assignment">auto</span>}
        <span className={`st ${cards.length ? 'live' : ''}`}>{cards.length ? 'Live' : 'Free'}{dense && waiting.length > 0 && `, ${waiting.length} waiting`}</span>
      </div>

      <div className="ls-sec">
        <h4 className="ls-sh">Now interviewing</h4>
        {cards.length === 0 ? (
          <div className="ls-empty">
            {view.done ? (
              <div className="ls-done">
                <div className="ls-done-t">✓ Ratings completed</div>
                <div className="ls-done-n">{view.done.name}</div>
                {view.done.position && <div className="ls-done-p">{view.done.position}</div>}
                <div className="ls-done-s">Item # {view.done.itemNumber} · finished {timeAgo(view.done.at)}</div>
              </div>
            ) : waiting[0] ? <>Next up: <strong style={{ color: 'var(--text)' }}>{waiting[0].name}</strong></> : 'No interview is running.'}
          </div>
        ) : (
          <FitBox
            className="cards"
            items={cards}
            moreLabel="more interviews"
            renderItem={({ key, c, item, elapsed }) => (
              <article key={key} className="ls-card">
                <div className="ls-top">
                  <div className="ls-name">{c.name}</div>
                  <div className="ls-timer"><LiveClock baseSeconds={elapsed} fetchedAt={fetchedAt} /></div>
                </div>
                <div className="ls-pos">{item.position}</div>
                <div className="ls-sub">Item # {item.itemNumber}</div>
                {c.otherItems?.length > 0 && <div className="ls-also">{otherText(c.otherItems)}</div>}
                <SeatChips cand={c} requiredTypes={item.requiredTypes} />
                <div className="ls-with">Rating now ({c.interviewing.length}): {c.interviewing.map(r => r.name).join(', ')}</div>
              </article>
            )}
          />
        )}
      </div>

      <div className="ls-sec">
        <h4 className="ls-sh">Up next<span>{waiting.length}</span></h4>
        {waiting.length === 0 ? (
          <div className="ls-empty">
            Queue is empty.{canManageQueue && !hasRooms && ' Add a room in Manage queue to start lining people up.'}
          </div>
        ) : (
          <FitBox
            className="rows"
            items={waiting}
            moreLabel="more in the queue"
            renderItem={(q, i) => (
              <div key={q.id} className={`ls-row ${i === 0 ? 'first' : ''}`}>
                <span className="ls-num">{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="ls-rname">{q.name}</div>
                  <div className="ls-pos">{q.position}</div>
                  <div className="ls-sub">Item # {q.itemNumber}</div>
                  {q.otherItems?.length > 0 && <div className="ls-also">{otherText(q.otherItems)}</div>}
                </div>
                <span className="ls-tag">{i === 0 ? 'Next' : q.rated > 0 ? `${q.rated} of ${q.required} rated` : ''}</span>
              </div>
            )}
          />
        )}
      </div>
    </section>
  );
};

const LiveStatsModal = ({ isOpen, onClose, canManageQueue = false }) => {
  const [data, setData] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [error, setError] = useState(false);
  const [managing, setManaging] = useState(false);
  const [controlsShown, setControlsShown] = useState(true);
  const [isFs, setIsFs] = useState(false);
  const [spotlight, setSpotlight] = useState(null);                       // room id or null
  const [guideOpen, setGuideOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(() => readPref('ls_sound', 'on') !== 'off');
  const { ensure: wakeSound, play } = useSound();
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const prevSnap = useRef(null);
  const [theme, setTheme] = useState(() => readPref('ls_theme', 'dark'));
  const [zoomIdx, setZoomIdx] = useState(() => { const i = Number(readPref('ls_zoom', 1)); return i >= 0 && i < ZOOMS.length ? i : 1; });
  const rootRef = useRef(null);
  const idleTimer = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await liveStatsAPI.get();
      setData(res);
      setFetchedAt(Date.now());
      setError(false);
    } catch (err) {
      console.warn('[LiveStats] refresh failed:', err?.message);
      setError(true);   // keep showing the last good snapshot
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

  // Keep the display awake while it is being broadcast.
  useEffect(() => {
    if (!isOpen || !navigator.wakeLock) return undefined;
    let lock = null;
    const acquire = async () => { try { lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed — ignore */ } };
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release?.().catch(() => {}); };
  }, [isOpen]);

  // Fullscreen
  useEffect(() => {
    if (!isOpen) return undefined;
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [isOpen]);
  const cycleTheme = useCallback(() => setTheme(t => {
    const next = THEMES[(THEMES.findIndex(x => x[0] === t) + 1) % THEMES.length][0];
    savePref('ls_theme', next);
    return next;
  }), []);
  const bumpZoom = useCallback((d) => setZoomIdx(i => {
    const next = Math.min(ZOOMS.length - 1, Math.max(0, i + d));
    savePref('ls_zoom', next);
    return next;
  }), []);
  const toggleSound = useCallback(() => {
    const next = !soundOnRef.current;
    setSoundOn(next);
    savePref('ls_sound', next ? 'on' : 'off');
    if (next) { wakeSound(); setTimeout(() => play('submit'), 60); }
  }, [wakeSound, play]);
  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const roomIdsRef = useRef([]);
  // Keys: Esc closes (manager first, then spotlight), F fullscreen, 1-9 spotlight a room, 0 all rooms,
  // T theme, + / - text size
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (managing) setManaging(false);
        else if (guideOpen) setGuideOpen(false);
        else if (spotlight) setSpotlight(null);
        else onClose();
        return;
      }
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '');
      if (managing || typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'f' || e.key === 'F') toggleFs();
      else if (e.key === 't' || e.key === 'T') cycleTheme();
      else if (e.key === '+' || e.key === '=') bumpZoom(1);
      else if (e.key === '-' || e.key === '_') bumpZoom(-1);
      else if (e.key === '?' || e.key === 'h' || e.key === 'H') setGuideOpen(g => !g);
      else if (e.key === 'm' || e.key === 'M') toggleSound();
      else if (e.key === '0') setSpotlight(null);
      else if (/^[1-9]$/.test(e.key)) {
        const id = roomIdsRef.current[Number(e.key) - 1];
        if (id !== undefined && roomIdsRef.current.length > 1) setSpotlight(cur => (cur === id ? null : id));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, managing, guideOpen, spotlight, toggleFs, cycleTheme, bumpZoom, toggleSound]);

  // Controls and cursor fade away after a few idle seconds so the broadcast stays clean.
  const wake = useCallback(() => {
    setControlsShown(true);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setControlsShown(false), IDLE_HIDE_MS);
  }, []);
  useEffect(() => {
    if (!isOpen) return undefined;
    wake();
    return () => clearTimeout(idleTimer.current);
  }, [isOpen, wake]);

  // Interviews in progress, one card per candidate (a panel of 6 is one card, not six rows).
  const nowCards = useMemo(() => {
    const out = [];
    (data?.items || []).forEach(item => item.candidates.forEach(c => {
      if (!c.interviewing.length) return;
      out.push({ key: c.id, c, item, elapsed: Math.max(...c.interviewing.map(r => r.elapsedSeconds)) });
    }));
    return out.sort((a, b) => b.elapsed - a.elapsed);
  }, [data]);

  const recent = useMemo(() => data?.recent || [], [data]);

  // One view per room: its live interviews and its waiting queue. A live candidate belongs to the
  // room whose queue they were lined up in; anyone live or queued without a room lands in a
  // catch-all panel, which only appears when it has something to show.
  const roomViews = useMemo(() => {
    const rooms = data?.rooms || [];
    const queue = data?.queue || [];
    const map = new Map(rooms.map(r => [r.id, { id: r.id, name: r.name, cards: [], waiting: [] }]));
    const loose = { id: 'none', name: rooms.length ? 'No room assigned' : 'Interviews', cards: [], waiting: [] };
    const roomOf = {};
    queue.forEach(q => { roomOf[q.candidateId] = q.roomId; });
    // A live interview nobody queued goes to the room named after its place of assignment. When no such
    // room exists yet, a panel for that place appears on its own (marked "auto"), so nothing lands in a
    // catch-all. Only items with no place of assignment at all fall back to the catch-all.
    const idByName = new Map(rooms.map(r => [sameKey(r.name), r.id]));
    const autoRooms = new Map();
    nowCards.forEach(n => {
      const queued = map.get(roomOf[n.key]);
      if (queued) { queued.cards.push(n); return; }
      const k = sameKey(n.item.assignment);
      if (!k) { loose.cards.push(n); return; }
      const real = map.get(idByName.get(k));
      if (real) { real.cards.push(n); return; }
      if (!autoRooms.has(k)) autoRooms.set(k, { id: `auto:${k}`, name: n.item.assignment, auto: true, cards: [], waiting: [] });
      autoRooms.get(k).cards.push(n);
    });
    // Latest finished candidate per room ("Ratings completed"). The list is newest first, so the first
    // match wins. It only shows while the room has no live interview, so opening the next candidate
    // replaces it. A finished candidate nobody queued only opens an "auto" panel for 15 minutes, so
    // old, forgotten completions don't pile up panels.
    const done = data?.completed || [];
    const nowMs = data?.generatedAt ? new Date(data.generatedAt).getTime() : 0;
    done.forEach(d => {
      if (d.roomId && map.has(d.roomId)) return;
      const k = sameKey(d.assignment);
      if (!k || idByName.has(k) || autoRooms.has(k)) return;
      if (nowMs - new Date(d.at).getTime() > 15 * 60 * 1000) return;
      autoRooms.set(k, { id: `auto:${k}`, name: d.assignment, auto: true, cards: [], waiting: [] });
    });
    const latestFor = (match) => done.find(match) || null;
    map.forEach((v, id) => { v.done = latestFor(d => d.roomId === id || (!d.roomId && idByName.get(sameKey(d.assignment)) === id)); });
    autoRooms.forEach((v, k) => { v.done = latestFor(d => !d.roomId && sameKey(d.assignment) === k); });
    loose.done = latestFor(d => !d.roomId && !sameKey(d.assignment));
    const views = [...map.values(), ...autoRooms.values()];
    if (loose.cards.length || loose.waiting.length || views.length === 0) views.push(loose);
    return views;
  }, [data, nowCards]);

  const grid = useMemo(() => {
    const n = roomViews.length;
    const rows = n <= 4 ? 1 : n <= 8 ? 2 : 3;
    return { n, rows, cols: Math.ceil(n / rows), dense: rows > 1 };
  }, [roomViews]);

  roomIdsRef.current = roomViews.map(v => v.id);
  const spotView = roomViews.length > 1 && spotlight ? roomViews.find(v => v.id === spotlight) : null;
  const toggleSpot = (id) => setSpotlight(cur => (cur === id ? null : id));

  // Sound cues: compare each fresh snapshot with the one before it (the first one after opening is silent).
  useEffect(() => {
    if (!isOpen) { prevSnap.current = null; return; }
    if (!data) return;
    const live = new Set(nowCards.map(n => n.key));
    const newest = data.recent?.[0]?.at ? new Date(data.recent[0].at).getTime() : 0;
    const complete = data.summary?.complete ?? 0;
    const prev = prevSnap.current;
    prevSnap.current = { live, newest, complete };
    if (!prev || !soundOnRef.current) return;
    const cues = [];
    if (complete > prev.complete) cues.push('complete');
    if ([...live].some(id => !prev.live.has(id))) cues.push('start');
    if (newest > prev.newest && !cues.includes('complete')) cues.push('submit');
    cues.forEach((k, i) => setTimeout(() => play(k), i * 900));
  }, [isOpen, data, nowCards, play]);

  if (!isOpen) return null;
  const sum = data?.summary;

  return (
    <div ref={rootRef} className={`ls-root ${controlsShown ? '' : 'idle'}`} data-theme={theme} style={{ '--zoom': ZOOMS[zoomIdx] }} onMouseMove={wake} onTouchStart={wake} onPointerDown={wakeSound} onKeyDown={wakeSound} role="dialog" aria-modal="true" aria-label="Live stats">
      <style>{CSS}</style>

      <header className="ls-head">
        <span className={`ls-dot ${error ? 'err' : ''}`} />
        <h2 className="ls-title">Live Stats</h2>
        {sum && (
          <div className="ls-stats">
            <div className="ls-stat"><b>{sum.beingRated}</b><span>Being rated</span></div>
            <div className="ls-stat"><b>{sum.complete}</b><span>Complete of {sum.candidates}</span></div>
            <div className="ls-stat"><b>{sum.inProgress}</b><span>In progress</span></div>
            <div className="ls-stat"><b>{sum.notStarted}</b><span>Not started</span></div>
            <div className="ls-stat"><b>{sum.ratersOnline}/{sum.ratersTotal}</b><span>Raters online</span></div>
          </div>
        )}
        <div className={`ls-clock ${error ? 'err' : ''}`} style={sum ? undefined : { marginLeft: 'auto' }}>
          <WallClock />
          <span>{error ? 'Connection lost, showing last update' : data ? <>Updated <LiveAgo at={fetchedAt} /></> : 'Loading…'}</span>
        </div>
      </header>

      {!data ? (
        <div className="ls-center">
          {error ? <>Couldn&apos;t load live stats. <button onClick={load}>Try again</button></> : 'Loading live stats…'}
        </div>
      ) : (
        <main className="ls-main" key={`${zoomIdx}-${theme}`}>
          {spotView ? (
            <div className="ls-rooms spot" style={{ '--srows': roomViews.length - 1 }}>
              <RoomPanel view={spotView} index={roomViews.indexOf(spotView)} numbered big onSpot={() => toggleSpot(spotView.id)}
                fetchedAt={fetchedAt} canManageQueue={canManageQueue} hasRooms={(data.rooms || []).length > 0} dense={false} />
              <div className="ls-side">
                {roomViews.filter(v => v.id !== spotView.id).map(v => (
                  <RoomPanel key={v.id} view={v} index={roomViews.indexOf(v)} numbered onSpot={() => toggleSpot(v.id)}
                    fetchedAt={fetchedAt} canManageQueue={canManageQueue} hasRooms={(data.rooms || []).length > 0} dense />
                ))}
              </div>
            </div>
          ) : (
            <div className="ls-rooms" style={{ '--cols': grid.cols, '--rows': grid.rows, '--n': grid.n }}>
              {roomViews.map((v, i) => (
                <RoomPanel key={v.id} view={v} index={i} numbered={roomViews.length > 1} onSpot={() => toggleSpot(v.id)}
                  fetchedAt={fetchedAt} canManageQueue={canManageQueue} hasRooms={(data.rooms || []).length > 0} dense={grid.dense} />
              ))}
            </div>
          )}

          <section className="ls-panel">
            <div className="ls-ph"><h3>Latest submissions</h3></div>
            {recent.length === 0 ? (
              <div className="ls-empty">No ratings submitted yet.</div>
            ) : (
              <FitBox
                className="cols"
                items={recent}
                moreLabel="earlier"
                renderItem={(r, i) => (
                  <div key={i} className="ls-rec">
                    <i>✓</i>
                    <span className="who">{r.raterName}</span>
                    <em>{TYPE_LABEL[r.raterType] || r.raterType}</em>
                    <span className="cand">rated {r.candidateName}</span>
                    <span className="ago">{timeAgo(r.at)}</span>
                  </div>
                )}
              />
            )}
          </section>
        </main>
      )}

      <div className={`ls-controls ${controlsShown ? 'show' : ''}`}>
        <span className="ls-hint">Press ? for shortcuts</span>
        {roomViews.length > 1 && (
          <div className="ls-ctl-group">
            <span>Spotlight</span>
            <button className={!spotView ? 'on' : ''} onClick={() => setSpotlight(null)}>All</button>
            {roomViews.slice(0, 9).map((v, i) => (
              <button key={v.id} className={spotView?.id === v.id ? 'on' : ''} title={v.name} onClick={() => toggleSpot(v.id)}>{i + 1}</button>
            ))}
          </div>
        )}
        <div className="ls-ctl-group">
          <button onClick={() => bumpZoom(-1)} disabled={zoomIdx === 0} aria-label="Smaller text">A−</button>
          <button onClick={() => bumpZoom(1)} disabled={zoomIdx === ZOOMS.length - 1} aria-label="Larger text">A+</button>
        </div>
        <button onClick={cycleTheme}>Theme: {THEMES.find(t => t[0] === theme)?.[1]}</button>
        <button onClick={toggleSound} aria-pressed={soundOn}>Sound: {soundOn ? 'On' : 'Off'}</button>
        <button onClick={() => setGuideOpen(true)}>Shortcuts (?)</button>
        {canManageQueue && <button onClick={() => setManaging(true)}>Manage queue</button>}
        <button onClick={toggleFs}>{isFs ? 'Exit full screen' : 'Full screen (F)'}</button>
        <button onClick={onClose}>Close</button>
      </div>

      {guideOpen && (
        <ShortcutGuide
          onClose={() => setGuideOpen(false)}
          onTest={(k) => { wakeSound(); setTimeout(() => play(k), 60); }}
          soundOn={soundOn}
          canManageQueue={canManageQueue}
          hasRooms={(data?.rooms || []).length > 0}
        />
      )}

      {managing && <QueueManager data={data} reload={load} onClose={() => setManaging(false)} />}
    </div>
  );
};

export default LiveStatsModal;