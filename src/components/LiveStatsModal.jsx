import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, useContext, createContext } from 'react';
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
const ZOOMS = [0.85, 1, 1.15];   // 1 = largest text that still fits every room (3 queued names always visible)
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
// Every ALERT_EVERY_SEC of interview time a card gets a warning: alarm tone + spoken name and minutes elapsed.
const ALERT_EVERY_SEC = 300;
// ─── Voice ───────────────────────────────────────────────────────────────────
// Natural voice: Kokoro-82M (open source neural TTS) running inside the browser via kokoro-js. The model
// (~90 MB) downloads once from Hugging Face, is cached by the browser, and then works offline. Until it is
// ready (or if it can't load) the browser's built-in voice is used, so a warning is never lost.
const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_VOICE = 'af_heart';
let kokoro = { state: 'idle', promise: null, failedAt: 0 };   // idle | loading | ready | failed
const loadKokoro = () => {
  if (kokoro.state === 'ready' || kokoro.state === 'loading') return kokoro.promise;
  if (kokoro.state === 'failed' && Date.now() - kokoro.failedAt < 60000) return kokoro.promise;
  kokoro.state = 'loading';
  kokoro.promise = (async () => {
    const { KokoroTTS } = await import('kokoro-js');
    return KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: 'q8', device: 'wasm' });
  })()
    .then(t => { kokoro.state = 'ready'; return t; })
    .catch(err => { console.warn('[LiveStats] natural voice unavailable, using browser voice:', err?.message); kokoro.state = 'failed'; kokoro.failedAt = Date.now(); return null; });
  return kokoro.promise;
};

// Make names easier to pronounce: "Ma." → Maria, "Jr." → Junior, hyphens → spaces, drop stray periods.
const sayable = (t) => String(t || '')
  .replace(/\bMa\.\s*/g, 'Maria ').replace(/\bJr\.?/gi, 'Junior').replace(/\bSr\.?/gi, 'Senior')
  .replace(/[-_/]+/g, ' ').replace(/\.(?=\s|$)/g, '').replace(/\s+/g, ' ').trim();

const clipCache = new Map();   // text -> { data, sr }, so a repeat of the same line is instant
const synth = async (text) => {
  if (kokoro.state !== 'ready') return null;
  try {
    if (clipCache.has(text)) return clipCache.get(text);
    const tts = await kokoro.promise;
    const a = await tts.generate(text, { voice: KOKORO_VOICE, speed: 0.95 });
    const clip = { data: a.audio, sr: a.sampling_rate };
    clipCache.set(text, clip);
    return clip;
  } catch (err) { console.warn('[LiveStats] voice synthesis failed:', err?.message); return null; }
};
const playClip = (ctx, clip) => new Promise((resolve) => {
  try {
    const buf = ctx.createBuffer(1, clip.data.length, clip.sr);
    buf.copyToChannel(clip.data, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination);
    src.onended = resolve; src.start();
  } catch { resolve(); }
});
const speakBrowser = (text) => new Promise((resolve) => {
  try {
    const ss = window.speechSynthesis;
    if (!ss || typeof SpeechSynthesisUtterance === 'undefined') { resolve(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; u.volume = 1; u.onend = resolve; u.onerror = resolve;
    ss.speak(u);
    setTimeout(resolve, 15000);
  } catch { resolve(); }
});
let speechChain = Promise.resolve();   // lines are spoken one after another, never over each other
// The sentence that is spoken (and shown as the caption) for a time warning.
const alertLine = (d) => `${d.room ? `${sayable(d.room)}. ` : ''}${sayable(d.name)}. ${d.minutes} minutes elapsed.`;
const fmtAvg = (sec) => (sec == null ? '—' : fmtClock(sec));
const SLEEP = (ms) => new Promise(r => setTimeout(r, ms));
const SOUNDS = {
  start:    { type: 'sine',     notes: [[659.25, 0, 0.18], [880, 0.14, 0.3]] },                                   // interview begins
  submit:   { type: 'triangle', notes: [[987.77, 0, 0.4]] },                                                     // a rating came in
  warn:     { type: 'square',   notes: [[880, 0, 0.16], [660, 0.22, 0.16], [880, 0.44, 0.16], [660, 0.66, 0.16], [880, 0.88, 0.3]] }, // 5-minute warning
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
    const reserve = parseFloat(cs.fontSize) * 1.8 + (parseFloat(cs.rowGap) || 0);
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
const otherText = (list) => (list && list.length ? `Also applied: ${list.map(o => `#\u00a0${o.itemNumber}`).join(', ')}` : '');

// "Also applied" is collapsible: a one-line summary that opens into the full wrapped list.
// Which ones are open is decided by the parent (a global default plus per-person flips).
const AlsoCtx = createContext({ isOpen: () => false, toggle: () => {} });
const AlsoApplied = ({ id, list }) => {
  const { isOpen, toggle } = useContext(AlsoCtx);
  if (!list || !list.length) return null;
  const open = isOpen(id);
  return (
    <button
      type="button"
      className={`ls-also ${open ? 'open' : ''}`}
      aria-expanded={open}
      title={open ? 'Click to collapse' : otherText(list)}
      onClick={(e) => { e.stopPropagation(); toggle(id); }}
    >
      <span className="ls-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      {open ? otherText(list) : `Also applied (${list.length})`}
    </button>
  );
};

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
.ls-root{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;gap:.9em;padding:1em 1.4em 1.1em;overflow:hidden;
  --bg:#0d1a16;--panel:#142620;--card:#0f201a;--edge:#24403a;--text:#eef4ef;--muted:#8aa597;--live:#f4c04e;--done:#62d394;
  --pos:#9fe3bd;--seat-off:#6f8a7c;--on-accent:#0d1a16;--btn:#1d3a30;--btn-h:#27493d;
  background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,-apple-system,"Helvetica Neue",sans-serif;
  font-size:clamp(13px,min(1.25vw,2.2vh),32px);line-height:1.25}
.ls-root[data-theme="contrast"]{--bg:#000;--panel:#050807;--card:#000;--edge:#6b7d73;--text:#fff;--muted:#d3dfd8;--live:#ffd43b;--done:#4ade80;--pos:#7dffb0;--seat-off:#c3d2c9;--on-accent:#000;--btn:#1f2a25;--btn-h:#2e3d36}
.ls-root[data-theme="light"]{--bg:#f3f6f4;--panel:#fff;--card:#edf2ee;--edge:#b9c8bf;--text:#0e1f17;--muted:#46604f;--live:#b45309;--done:#15803d;--pos:#14532d;--seat-off:#5b7366;--on-accent:#fff;--btn:#dfe9e3;--btn-h:#cddbd2}
.ls-root *{box-sizing:border-box}
.ls-root.idle{cursor:none}
.ls-head{display:flex;align-items:center;flex-wrap:wrap;gap:.4em 1.1em;flex:none}
.ls-title{margin:0;font-size:1.7em;font-weight:700;letter-spacing:-.01em}
.ls-dot{width:.8em;height:.8em;border-radius:50%;background:var(--done);animation:ls-ping 2s infinite}
.ls-dot.err{background:#ef6a6a;animation:none}
@keyframes ls-ping{0%{box-shadow:0 0 0 0 rgba(98,211,148,.6)}70%,100%{box-shadow:0 0 0 .7em rgba(98,211,148,0)}}
@keyframes ls-blink{50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.ls-root *{animation:none!important}}
.ls-stats{display:flex;flex-wrap:wrap;gap:.3em 1.5em;margin-left:auto}
.ls-stat b{display:block;font-size:1.75em;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.ls-stat span{font-size:.8em;color:var(--muted);white-space:nowrap}
.ls-stat.avg b{color:var(--live)}
.ls-clock{flex:none;text-align:right;margin-left:1em}
.ls-clock b{display:block;font-size:1.6em;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.ls-clock span{font-size:.8em;color:var(--muted)}
.ls-clock.err span{color:#ef9a9a}
.ls-main{flex:1;min-height:0;display:grid;gap:1em;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(8.5em,24%)}
@media (min-aspect-ratio:4/3){
  .ls-main{grid-template-columns:minmax(0,1fr) clamp(19em,27%,36em);grid-template-rows:minmax(0,1fr)}
}
.ls-main.nosub{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr)!important}
.ls-layouts{display:flex;flex-wrap:wrap;gap:.25em;align-items:center}
.ls-layouts>span{color:var(--muted);font-size:.85em;margin-right:.2em}
.ls-zone{position:relative;min-height:0;min-width:0}
.ls-rooms{position:absolute;inset:0;display:grid}
.ls-room{display:grid;grid-template-rows:auto minmax(0,1fr);gap:.6em;min-height:0;min-width:0;overflow:hidden;background:var(--panel);border:1px solid var(--edge);border-radius:.8em;padding:.9em 1em}
.ls-room.busy{border-color:rgba(244,192,78,.5)}
.ls-room.big{border-color:var(--live)}
.ls-body{display:grid;gap:.6em;min-height:0}
.ls-room.wide .ls-body{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr)!important;gap:1em}
.ls-rh.click{cursor:pointer}
.ls-badge{flex:none;display:inline-grid;place-items:center;min-width:1.5em;height:1.5em;border-radius:.4em;background:var(--edge);color:var(--text);font-size:.85em;font-weight:700;align-self:center}
.ls-item{color:var(--muted);font-size:.9em;font-weight:600;line-height:1.2;overflow-wrap:anywhere}
.ls-room.dense .ls-item{font-size:.8em}
.ls-pos{color:var(--pos);font-size:1em;font-weight:600;overflow-wrap:anywhere}
.ls-rh{display:flex;align-items:baseline;gap:.6em;min-width:0}
.ls-rh h3{margin:0;min-width:0;font-size:1.45em;font-weight:700;line-height:1.2;overflow-wrap:anywhere}
.ls-rh .st{margin-left:auto;flex:none;font-size:.9em;color:var(--muted)}
.ls-rh .st.live{color:var(--live);font-weight:600}
.ls-sec{display:flex;flex-direction:column;min-height:0;min-width:0}
.ls-sec.q{border-top:1px solid var(--edge);padding-top:.6em}
.ls-room.wide .ls-sec.q{border-top:0;padding-top:0;border-left:1px solid var(--edge);padding-left:1em}
.ls-sh{flex:none;margin:0 0 .4em;font-size:.95em;font-weight:600;color:var(--muted)}
.ls-sh span{font-variant-numeric:tabular-nums;margin-left:.4em;color:var(--text)}
.ls-panel{display:flex;flex-direction:column;min-height:0;min-width:0;background:var(--panel);border:1px solid var(--edge);border-radius:.8em;padding:.8em 1em;font-size:calc(1em * var(--zoom,1))}
.ls-ph{display:flex;align-items:baseline;gap:.6em;margin-bottom:.6em;flex:none}
.ls-ph h3{margin:0;font-size:1.25em;font-weight:650}
.ls-fit{position:relative;flex:1;min-height:0;overflow:hidden;display:grid;align-content:start;gap:.4em}
.ls-fit.cards{grid-template-columns:repeat(auto-fill,minmax(17em,1fr));gap:.5em}
.ls-fit.cols{grid-template-columns:repeat(auto-fill,minmax(26em,1fr));gap:.3em 1.6em}
.ls-fit.rows{grid-template-columns:minmax(0,1fr);gap:.4em}
.ls-more{grid-column:1/-1;display:flex;align-items:center;justify-content:center;height:1.8em;color:var(--muted)}
.ls-empty{margin:auto;text-align:center;color:var(--muted);max-width:28em}
.ls-card{min-height:10.4em;display:flex;flex-direction:column;gap:.3em;background:var(--card);border:1px solid var(--edge);border-radius:.7em;padding:.6em .8em}
.ls-top{display:flex;align-items:flex-start;justify-content:space-between;gap:.8em}
.ls-name{flex:1;min-width:0;font-size:1.15em;font-weight:650;line-height:1.2;overflow-wrap:anywhere}
.ls-card.alarm{border-color:#ef6a6a;animation:ls-alarm .7s ease-in-out 12}
.ls-bn-wrap{position:absolute;inset:0;z-index:20;display:grid;place-items:center;pointer-events:none;background:radial-gradient(ellipse at center,rgba(0,0,0,.45),rgba(0,0,0,0) 70%);animation:ls-bnbg var(--bn-ms,6s) both}
.ls-bn{--c:var(--done);width:min(44em,88%);text-align:center;background:var(--panel);border:.2em solid var(--c);border-radius:1.2em;padding:1.1em 1.4em 0;overflow:hidden;font-size:1.35em;box-shadow:0 0 0 0 var(--c),0 1.5em 4em rgba(0,0,0,.55);animation:ls-bnpop var(--bn-ms,6s) both,ls-bnring 1.2s ease-out 4}
.ls-bn.alarm{--c:#ef6a6a}
.ls-bn.done{--c:var(--live)}
.ls-bn-icon{font-size:2.4em;line-height:1;color:var(--c)}
.ls-bn-head{margin-top:.2em;font-size:1em;font-weight:800;letter-spacing:.12em;color:var(--c)}
.ls-bn-main{margin-top:.15em;font-size:2em;font-weight:750;line-height:1.1;overflow-wrap:anywhere}
.ls-bn-sub{margin-top:.25em;color:var(--muted);font-size:.95em;overflow-wrap:anywhere}
.ls-bn-cap{margin:.9em -1.5em 0;padding:.5em 1.2em;background:rgba(0,0,0,.72);color:#fff;font-size:.9em;line-height:1.3}
@keyframes ls-bnpop{0%{opacity:0;transform:scale(.6)}6%{opacity:1;transform:scale(1.06)}10%{transform:scale(1)}92%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.97)}}
@keyframes ls-bnbg{0%{opacity:0}6%{opacity:1}92%{opacity:1}100%{opacity:0}}
@keyframes ls-bnring{0%{box-shadow:0 0 0 0 var(--c),0 1.5em 4em rgba(0,0,0,.55)}100%{box-shadow:0 0 0 1.4em transparent,0 1.5em 4em rgba(0,0,0,.55)}}
.ls-sep{align-self:stretch;width:1px;background:var(--edge);margin:0 -.2em}
.ls-card.alarm .ls-timer{color:#ef6a6a}
@keyframes ls-alarm{50%{background:rgba(239,106,106,.35)}}
.ls-timer{flex:none;font-size:1.7em;font-weight:700;line-height:1;color:var(--live);font-variant-numeric:tabular-nums}
.ls-seats{display:flex;flex-wrap:wrap;gap:.25em}
.ls-seat{display:inline-flex;align-items:center;gap:.3em;border:1px solid var(--edge);border-radius:99em;padding:.02em .5em;font-size:.72em;font-weight:600;color:var(--seat-off);white-space:nowrap}
.ls-seat.done{background:var(--done);border-color:var(--done);color:var(--on-accent)}
.ls-seat.live{color:var(--live);border-color:var(--live)}
.ls-seat.live::before{content:"";width:.5em;height:.5em;border-radius:50%;background:var(--live);animation:ls-blink 1.2s infinite}
.ls-with{color:var(--muted);font-size:.85em;overflow-wrap:anywhere}
.ls-also{display:block;margin:.1em 0 0;padding:0;border:0;background:none;font:inherit;text-align:left;color:var(--live);font-size:.85em;font-weight:500;line-height:1.2;overflow-wrap:anywhere;cursor:pointer}
.ls-also:hover{text-decoration:underline}
.ls-also:focus-visible{outline:2px solid var(--live);outline-offset:2px;border-radius:.2em}
.ls-caret{display:inline-block;width:1em}
.ls-row{display:grid;grid-template-columns:1.8em minmax(0,1fr) auto;align-items:center;gap:.5em;min-height:4.4em;padding:.3em .8em .3em .3em;border-radius:.5em;background:var(--card)}
.ls-row.first{outline:2px solid var(--live)}
.ls-num{text-align:center;font-size:1.3em;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums}
.ls-row.first .ls-num{color:var(--live)}
.ls-rname{font-size:1.2em;font-weight:650;line-height:1.2;overflow-wrap:anywhere}
.ls-row .ls-pos{font-size:.9em;font-weight:500}
.ls-row .ls-item{font-size:.82em}
.ls-tag{font-size:.85em;color:var(--muted);white-space:nowrap}
.ls-row.first .ls-tag{color:var(--live);font-weight:700}
.ls-room.dense{padding:.7em .8em;gap:.5em}
.ls-room.dense .ls-body{gap:.5em}
.ls-room.dense .ls-card{min-height:5.4em;padding:.4em .7em;gap:.15em}
.ls-room.dense .ls-name{-webkit-line-clamp:1;font-size:1.1em}
.ls-room.dense .ls-timer{font-size:1.4em}
.ls-room.dense .ls-seats,.ls-room.dense .ls-with{display:none}
.ls-room.dense .ls-also{font-size:.9em}
.ls-room.dense .ls-row{min-height:3.7em;padding-top:.2em;padding-bottom:.2em}
.ls-room.dense .ls-rname{font-size:1.1em}
.ls-room.dense .ls-row .ls-pos{font-size:.8em}
.ls-room.dense .ls-row .ls-item{font-size:.78em}
.ls-room.dense .ls-sh{margin-bottom:.3em}
.ls-room.dense .ls-sec.q{padding-top:.5em}
.ls-rec{display:flex;align-items:center;gap:.5em;min-height:2.3em}
.ls-rec i{font-style:normal;color:var(--done);flex:none}
.ls-rec .m{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 .5em;min-width:0;flex:1}
.ls-rec .l1{display:flex;flex-wrap:wrap;gap:0 .5em;align-items:baseline;min-width:0;overflow-wrap:anywhere}
.ls-rec .l2{min-width:0;overflow-wrap:anywhere;flex:1}
.ls-rec em{font-style:normal;color:var(--muted);font-size:.85em}
.ls-rec .who{font-weight:650}
.ls-rec .ago{flex:none;color:var(--muted);font-size:.85em}
@media (min-aspect-ratio:4/3){
  .ls-fit.subs{grid-template-columns:minmax(0,1fr)}
  .ls-rec{min-height:3.6em;align-items:center;gap:.6em;padding:.2em 0}
  .ls-rec .m{display:block}
  .ls-rec .l1,.ls-rec .l2{display:block;overflow-wrap:anywhere}
  .ls-rec .l1{display:flex;flex-wrap:wrap;gap:0 .5em;align-items:baseline}
  .ls-rec .l2{color:var(--muted);font-size:.92em}
  .ls-rec{border-bottom:1px solid var(--edge);padding-bottom:.1em}
}
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
.ls-done-n{font-size:1.5em;font-weight:700;line-height:1.15;overflow-wrap:anywhere}
.ls-done-p{color:var(--pos);font-weight:600;overflow-wrap:anywhere}
.ls-done-s{color:var(--muted);font-size:.85em;overflow-wrap:anywhere}
.ls-room.dense .ls-done-s{display:none}
.ls-room.dense .ls-done-n{font-size:1.2em}
.ls-center{margin:auto;text-align:center;color:var(--muted);font-size:1.2em}
.ls-center button{font:inherit;color:var(--text);text-decoration:underline;background:none;border:0;cursor:pointer}
@media (max-aspect-ratio:1/1){ .ls-stats{gap:.3em 1.2em} }
`;

// One candidate in the "pick candidates" list. Memoized so ticking a box re-renders only that row.
const PickRow = React.memo(({ c, checked, onToggle, newRoom }) => (
  <li>
    <label className="px-5 py-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50">
      <input type="checkbox" checked={checked} onChange={e => onToggle(c.id, e.target.checked)} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium break-words">{c.name}</span>
        <span className="block text-xs text-gray-500 break-words">Item # {c.itemNumber}, {c.position}</span>
        {c.assignment && (
          <span className="block text-xs text-gray-600 break-words">
            Place: {c.assignment}
            {newRoom && <span className="ml-1 rounded bg-blue-100 text-blue-800 px-1">new room</span>}
          </span>
        )}
        {c.otherItems?.length > 0 && <span className="block text-xs text-amber-700 break-words">{otherText(c.otherItems)}</span>}
      </span>
    </label>
  </li>
));

const PICK_PAGE = 100;   // rows drawn at once; the rest sit behind "Show more"

// ─── Rooms & queue manager (admin / secretariat) — a normal scrolling dialog, not part of the broadcast ───
const QueueManager = ({ data, reload, patch, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [sel, setSel] = useState(null);          // room id, or 'none' for "no room assigned"
  const [newRoom, setNewRoom] = useState('');
  const [item, setItem] = useState('all');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState({});
  const [limit, setLimit] = useState(PICK_PAGE);

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
  const shown = useMemo(() => available.slice(0, limit), [available, limit]);
  useEffect(() => { setLimit(PICK_PAGE); }, [item, search]);
  const toggle = useCallback((id, v) => setPicked(p => ({ ...p, [id]: v })), []);

  // quick = the screen was already updated locally, so don't make the user wait for a full refresh:
  // reconcile with the server in the background (and also on failure, which undoes the local change).
  const run = async (fn, quick = false) => {
    setBusy(true); setErr(''); setNote('');
    try { await fn(); if (quick) reload(); else await reload(); }
    catch (e) {
      setErr(e?.response?.data?.message || e?.message || 'Something went wrong');
      if (quick) reload();
    }
    finally { setBusy(false); }
  };

  // Show newly queued candidates (and any rooms the server just created) immediately.
  const applyAdded = (r) => {
    const info = new Map();
    (data?.items || []).forEach(it => it.candidates.forEach(c => info.set(c.id, { c, it })));
    const entries = (r.entries || []).map(e => {
      const x = info.get(e.candidateId);
      if (!x) return null;
      return {
        id: e.id, candidateId: e.candidateId, name: x.c.name, roomId: e.roomId,
        itemNumber: x.it.itemNumber, position: x.it.position, assignment: x.it.assignment,
        otherItems: x.c.otherItems || [], status: x.c.status,
        rated: x.c.ratedBy.length, required: x.it.requiredTypes.length,
      };
    }).filter(Boolean);
    const newRooms = (r.roomsCreated || []).filter(n => n && n.id);
    patch(d => ({ ...d, rooms: [...(d.rooms || []), ...newRooms], queue: [...(d.queue || []), ...entries] }));
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
    applyAdded(r);
    const names = (r.roomsCreated || []).map(x => x.name);
    setNote(`Added ${r.added}${names.length ? `, created ${names.length === 1 ? 'room' : 'rooms'}: ${names.join(', ')}` : ''}`);
  }, true);
  const addPicked = () => run(async () => {
    const r = await queueAPI.add(current.id, pickedIds);
    setPicked({});
    applyAdded(r);
  }, true);
  const move = (i, d) => run(async () => {
    const ids = queue.map(q => q.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const roomId = current?.id;
    patch(dt => {   // swap on screen first
      const byId = new Map((dt.queue || []).map(q => [q.id, q]));
      let k = 0;
      return { ...dt, queue: dt.queue.map(q => ((q.roomId || 'none') === roomId ? byId.get(ids[k++]) : q)) };
    });
    await queueAPI.reorder(ids);
  }, true);
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
                <h3 className="font-semibold flex-1 break-words">{current ? `${current.name} queue (${queue.length})` : 'Rooms'}</h3>
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
                      <div className="font-medium break-words">{q.name}</div>
                      <div className="text-xs text-gray-500 break-words">Item # {q.itemNumber}, {q.position}{q.status === 'being_rated' ? ' — being rated now' : ''}</div>
                      {q.otherItems?.length > 0 && <div className="text-xs text-amber-700 break-words">{otherText(q.otherItems)}</div>}
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
                    <button className={btn} disabled={busy} onClick={() => run(async () => { patch(dt => ({ ...dt, queue: dt.queue.filter(x => x.id !== q.id) })); await queueAPI.remove(q.id); }, true)} aria-label={`Remove ${q.name}`}>Remove</button>
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
                    {shown.map(c => (
                      <PickRow key={c.id} c={c} checked={!!picked[c.id]} onToggle={toggle} newRoom={!!c.assignment && !roomKeys.has(sameKey(c.assignment))} />
                    ))}
                    {available.length > shown.length && (
                      <li className="p-3 text-center">
                        <button className={btn} onClick={() => setLimit(l => l + PICK_PAGE)}>Show more ({available.length - shown.length} more — or search by name)</button>
                      </li>
                    )}
                  </ul>
                  <div className="px-5 py-3 border-t border-gray-200 flex items-center gap-3">
                    <button className={btn} disabled={available.length === 0} onClick={() => setPicked(Object.fromEntries(shown.map(c => [c.id, true])))}>Select all shown ({shown.length})</button>
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

// Big centre-screen highlight with a caption: a rating came in, a candidate is fully rated, or an
// interview hit a 5-minute mark. The caption is the same text that is spoken, so it also works muted.
const CenterBanner = ({ b }) => (
  <div className="ls-bn-wrap" role="status" aria-live="assertive">
    <div key={b.id} className={`ls-bn ${b.kind}`}>
      <div className="ls-bn-icon" aria-hidden="true">{b.icon}</div>
      <div className="ls-bn-head">{b.head}</div>
      <div className="ls-bn-main">{b.main}</div>
      {b.sub && <div className="ls-bn-sub">{b.sub}</div>}
      <div className="ls-bn-cap">{b.caption}</div>
    </div>
  </div>
);

// Keyboard / mouse cheat sheet. Opens with ? (or H) and from the control bar.
const ShortcutGuide = ({ onClose, onTest, onTestAlert, alertsOn, voiceState, soundOn, canManageQueue, hasRooms }) => (
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
        <kbd>L</kbd><span>Change the room layout: Auto, Grid, Columns, Rows, Focus (only the ones that make sense for the rooms you have)</span>
        <kbd>Q</kbd><span>Change how each room is arranged: Auto, queue below Now interviewing, or queue beside it</span>
        <kbd>A</kbd><span>Open or collapse every “Also applied” list. Click a person’s “Also applied” line to flip just theirs.</span>
        <kbd>S</kbd><span>Show or hide the Latest submissions panel to give the rooms more space</span>
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
      <h3>Interview time alerts</h3>
      <div className="ls-keys">
        <kbd>V</kbd><span>Spoken warning every 5 minutes of an interview: {alertsOn ? 'on, press to turn off' : 'off, press to turn on'}. Voice: {voiceState === 'ready' ? 'natural (Kokoro)' : voiceState === 'loading' ? 'natural voice is downloading, browser voice until then' : 'browser voice'}</span>
      </div>
      <div className="ls-snd" style={{ marginTop: '.6em' }}>
        <button onClick={onTestAlert}>▶ Test 5-minute warning</button>
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

// ─── Auto layout ─────────────────────────────────────────────────────────────
// Each room is given a text size (px) that makes ITS content just fit the space it gets, so:
//   • one room fills the screen with big text; many rooms shrink evenly, never clip;
//   • a room always has space for the live interview card AND the next 3 in the queue;
//   • wide cells put "Now" and "Up next" side by side, tall cells stack them;
//   • cells too small for the full card switch to a compact card (names + position + timer only).
// NEED = the room's content size in em (padding included): h = height, w = width.
const NEED = {
  full:  { stack: { h: 35.5, w: 26 }, wide: { h: 23.5, w: 48 } },
  dense: { stack: { h: 27.5, w: 21 }, wide: { h: 20.5, w: 43 } },
};
const QUEUE_SHOWN = 3;

// Text is never cut off: long names, positions and "Also applied" lists wrap onto more lines.
// These helpers estimate how many extra lines that costs, so the text size is chosen to leave room for them.
const CH = 0.52;   // average character width in em (a little generous on purpose)
const nLines = (len, fontEm, widthEm) => (len > 0 ? Math.max(1, Math.ceil((len * CH * fontEm) / Math.max(4, widthEm))) : 0);
const alsoLines = (list, open, fz, w) => (!list || !list.length ? 0 : open ? nLines(otherText(list).length, fz, w) : 1);
const cardExtra = (n, colW, dense, isOpen) => {
  const c = n.c; const item = n.item;
  const nameFz = dense ? 1.1 : 1.15;
  const top = Math.max(nLines(String(c.name || '').length, nameFz, colW - (dense ? 5.2 : 6.2)) * nameFz * 1.2, dense ? 1.4 : 1.7);
  const itemFz = dense ? 0.8 : 0.9;
  const also = alsoLines(c.otherItems, isOpen(c.id), itemFz * 0.9, colW) * itemFz * 0.9 * 1.2;
  const pos = nLines(String(item.position || '').length, 1, colW) * 1.25;
  let seats = 0; let withH = 0;
  if (!dense) {
    const chips = (item.requiredTypes || []).reduce((a, t) => a + (String(TYPE_LABEL[t] || t).length * CH + 1.8) * 0.72 + 0.25, 0);
    seats = Math.max(1, Math.ceil(chips / colW)) * 1.1;
    withH = nLines(`Rating now (${c.interviewing.length}): ${c.interviewing.map(r => r.name).join(', ')}`.length, 0.85, colW) * 0.85 * 1.25;
  }
  const content = top + itemFz * 1.2 + also + pos + seats + withH + 1.5 + 1.3;
  return Math.max(0, content - (dense ? 5.4 : 10.4));
};
const rowExtra = (q, colW, dense, isOpen) => {
  const txtW = colW - 10;
  const nameFz = dense ? 1.1 : 1.2;
  const itemFz = dense ? 0.78 : 0.82;
  const posFz = dense ? 0.8 : 0.9;
  const content = nLines(String(q.name || '').length, nameFz, txtW) * nameFz * 1.2
    + itemFz * 1.2
    + alsoLines(q.otherItems, isOpen(q.id), itemFz * 0.9, txtW) * itemFz * 0.9 * 1.2
    + nLines(String(q.position || '').length, posFz, txtW) * posFz * 1.25
    + 0.6;
  return Math.max(0, content - (dense ? 3.7 : 4.4));
};
// Extra height (em) a room needs for wrapped text. wEm = the room's width in em.
const roomExtras = (view, wEm, dense, wide, isOpen = () => false) => {
  const colW = wide ? (wEm - 5) / 2 : wEm - 2;
  const head = Math.max(0, nLines(String(view.name || '').length, 1.45, wEm - 12) - 1) * 1.45 * 1.2;
  const card = view.cards.length ? cardExtra(view.cards[0], colW, dense, isOpen) : 0;
  const rows = view.waiting.slice(0, QUEUE_SHOWN).reduce((a, q) => a + rowExtra(q, colW, dense, isOpen), 0);
  return { head, card, rows, total: head + (wide ? Math.max(Math.max(0, card - 4), rows) : card + rows) };
};

const fitCell = (w, h, rootPx, views, inner = 'auto', isOpen = () => false) => {
  const solve = (t, m) => {
    const nd = NEED[t][m];
    let font = Math.min(w / nd.w, h / nd.h);
    for (let i = 0; i < 3; i += 1) {
      const ex = views.reduce((a, v) => Math.max(a, roomExtras(v, w / font, t === 'dense', m === 'wide', isOpen).total), 0);
      font = Math.min(w / nd.w, h / (nd.h + ex));
    }
    return font;
  };
  const pick = (t) => {
    if (inner === 'stack') return { font: solve(t, 'stack'), wide: false };   // queue below "Now interviewing"
    if (inner === 'wide') return { font: solve(t, 'wide'), wide: true };      // queue beside it
    const st = solve(t, 'stack'); const wd = solve(t, 'wide');
    return wd > st ? { font: wd, wide: true } : { font: st, wide: false };
  };
  const full = { ...pick('full'), dense: false, cellW: w };
  if (full.font >= Math.max(13, rootPx * 0.7)) return full;
  const dense = { ...pick('dense'), dense: true, cellW: w };
  return dense.font > full.font ? dense : full;
};
const finishLay = (lay, rootPx, zoom) => ({ ...lay, font: Math.max(9, Math.min(lay.font * (lay.dense ? 1 : zoom), rootPx * 1.5)) });

// Layouts the viewer can pick from. They adapt to how many rooms exist right now.
const LAYOUTS = [
  ['auto', 'Auto', 'Picks whatever gives the biggest text'],
  ['grid', 'Grid', 'Rooms in an even grid'],
  ['columns', 'Columns', 'Rooms side by side'],
  ['rows', 'Rows', 'Rooms stacked top to bottom'],
  ['focus', 'Focus', 'The busiest room big, the others beside it'],
];
// How each room arranges "Now interviewing" and "Up next".
const INNER = [
  ['auto', 'Auto', 'Chooses what fits best'],
  ['stack', 'Queue below', 'Up next sits under Now interviewing'],
  ['wide', 'Queue beside', 'Up next sits to the right of Now interviewing'],
];
const layoutsFor = (n) => (n < 2 ? [] : n === 2 ? LAYOUTS.filter(l => l[0] !== 'grid') : LAYOUTS);

// Measures the room area (and the root text size) whenever the window or zoom changes.
const RoomsArea = ({ views, spotId, zoom, layout, inner, alsoOpen, render }) => {
  const zoneRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0, root: 16 });
  useLayoutEffect(() => {
    const el = zoneRef.current;
    if (!el) return undefined;
    const upd = () => {
      const root = parseFloat(getComputedStyle(el).fontSize) || 16;
      setBox(b => (b.w === el.clientWidth && b.h === el.clientHeight && b.root === root ? b : { w: el.clientWidth, h: el.clientHeight, root }));
    };
    upd();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(upd) : null;
    ro?.observe(el);
    window.addEventListener('resize', upd);
    return () => { ro?.disconnect(); window.removeEventListener('resize', upd); };
  }, []);

  const n = views.length;
  const gap = box.root * 0.9;
  // A spotlight picked by the viewer always wins; the Focus layout spotlights the busiest room by itself.
  let spot = n > 1 && spotId ? views.find(v => v.id === spotId) : null;
  if (!spot && n > 1 && layout === 'focus') {
    spot = views.reduce((best, v) => ((v.cards.length * 1000 + v.waiting.length) > (best.cards.length * 1000 + best.waiting.length) ? v : best), views[0]);
  }
  let style; let items;

  if (box.w > 0 && n > 0) {
    if (spot) {
      const others = views.filter(v => v !== spot);
      const k = others.length;
      const land = box.w >= box.h;
      // Many other rooms: the side strip gets a second column (or row) so they don't become slivers.
      let sc; let sr; let bigW; let bigH; let sideW; let sideH;
      if (land) {
        sc = k > 4 ? 2 : 1; sr = Math.ceil(k / sc);
        const availW = box.w - gap * sc;
        bigW = availW * 0.7; bigH = box.h;
        sideW = (availW * 0.3) / sc; sideH = (box.h - gap * (sr - 1)) / sr;
        style = { gridTemplateColumns: `minmax(0,7fr) repeat(${sc}, minmax(0,${3 / sc}fr))`, gridTemplateRows: `repeat(${sr}, minmax(0,1fr))`, gap };
      } else {
        sr = k > 4 ? 2 : 1; sc = Math.ceil(k / sr);
        const availH = box.h - gap * sr;
        bigW = box.w; bigH = availH * 0.62;
        sideW = (box.w - gap * (sc - 1)) / sc; sideH = (availH * 0.38) / sr;
        style = { gridTemplateColumns: `repeat(${sc}, minmax(0,1fr))`, gridTemplateRows: `minmax(0,62fr) repeat(${sr}, minmax(0,${38 / sr}fr))`, gap };
      }
      const bigLay = finishLay(fitCell(bigW, bigH, box.root, [spot], inner, alsoOpen), box.root, zoom);
      const sideLay = finishLay(fitCell(sideW, sideH, box.root, others, inner, alsoOpen), box.root, zoom);
      items = [
        { v: spot, lay: bigLay, big: true, style: land ? { gridRow: `1 / span ${sr}` } : { gridColumn: `1 / span ${sc}` } },
        ...others.map(v => ({ v, lay: sideLay, style: undefined })),
      ];
    } else {
      const cellLay = (c) => {
        const r = Math.ceil(n / c);
        return fitCell((box.w - gap * (c - 1)) / c, (box.h - gap * (r - 1)) / r, box.root, views, inner, alsoOpen);
      };
      let best = null;
      if (layout === 'columns' || layout === 'rows' || layout === 'grid') {
        // Fixed shapes that still follow the room count: up to 4 in one line, more wrap onto extra lines.
        let c;
        if (layout === 'columns') { const r = Math.ceil(n / 4); c = Math.ceil(n / r); }
        else if (layout === 'rows') c = Math.ceil(n / 4);
        else c = Math.min(n, Math.max(1, Math.round(Math.sqrt((n * box.w) / box.h))));
        best = { c, r: Math.ceil(n / c), lay: cellLay(c) };
      } else {
        // Auto: try every column count and keep the one that gives the biggest text.
        for (let c = 1; c <= n; c += 1) {
          const lay = cellLay(c);
          if (!best || lay.font > best.lay.font * 1.02) best = { c, r: Math.ceil(n / c), lay };
        }
      }
      const lay = finishLay(best.lay, box.root, zoom);
      style = { gridTemplateColumns: `repeat(${best.c}, minmax(0,1fr))`, gridTemplateRows: `repeat(${best.r}, minmax(0,1fr))`, gap };
      const spare = best.c * best.r - n;   // empty cells in the last row: the last room stretches over them
      items = views.map((v, i) => ({ v, lay, style: i === n - 1 && spare > 0 ? { gridColumn: `span ${spare + 1}` } : undefined }));
    }
  }
  return (
    <div className="ls-zone" ref={zoneRef}>
      <div className="ls-rooms" style={style}>{items && items.map(it => render(it))}</div>
    </div>
  );
};

// One room on the broadcast: what is happening now, and who is lined up next.
const RoomPanel = ({ view, fetchedAt, flash, canManageQueue, hasRooms, lay, big, extraStyle, index, numbered, onSpot }) => {
  const { name, cards, waiting } = view;
  const dense = lay.dense;
  // Rows of the stacked layout: the live card gets what it needs, the queue always keeps room for 3 names.
  const qn = Math.min(QUEUE_SHOWN, waiting.length);
  const rowH = dense ? 3.7 : 4.4;
  const { isOpen: alsoIsOpen } = useContext(AlsoCtx);
  const ex = roomExtras(view, lay.cellW / lay.font, dense, lay.wide, alsoIsOpen);   // extra height for text that wraps
  const qMin = (dense ? 1.5 : 1.8) + qn * rowH + ex.rows + Math.max(0, qn - 1) * 0.4 + 1 + (waiting.length > qn ? 2.3 : 0);   // + the "+N more" line
  const nMin = (dense ? 1.5 : 1.8) + (dense ? 5.4 : 10.4) + ex.card;
  const rows = cards.length === 0
    ? (waiting.length === 0 ? 'auto auto' : 'auto minmax(0,1fr)')
    : waiting.length === 0 ? 'minmax(0,1fr) auto'
      : `minmax(${nMin}em,${Math.min(cards.length, 3)}fr) minmax(${qMin}em,${dense ? 1 : 1.1}fr)`;
  return (
    <section
      className={`ls-room ${cards.length ? 'busy' : ''} ${dense ? 'dense' : ''} ${lay.wide ? 'wide' : ''} ${big ? 'big' : ''}`}
      style={{ fontSize: `${lay.font}px`, ...extraStyle }}
    >
      <div className={`ls-rh ${numbered ? 'click' : ''}`} onClick={numbered ? onSpot : undefined} title={numbered ? (big ? 'Click to show all rooms' : `Click (or press ${index + 1}) to spotlight this room`) : undefined}>
        {numbered && <span className="ls-badge">{index + 1}</span>}
        <h3>{name}</h3>
        {view.auto && <span className="ls-auto" title="Created automatically from the place of assignment">auto</span>}
        <span className={`st ${cards.length ? 'live' : ''}`}>{cards.length ? 'Live' : 'Free'}{waiting.length > 0 && `, ${waiting.length} waiting`}</span>
      </div>

      <div className="ls-body" style={lay.wide ? undefined : { gridTemplateRows: rows }}>
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
                <article key={key} className={`ls-card ${flash && flash.has(key) ? 'alarm' : ''}`}>
                  <div className="ls-top">
                    <div className="ls-name">{c.name}</div>
                    <div className="ls-timer"><LiveClock baseSeconds={elapsed} fetchedAt={fetchedAt} /></div>
                  </div>
                  <div className="ls-item">Item # {item.itemNumber}<AlsoApplied id={c.id} list={c.otherItems} /></div>
                  <div className="ls-pos">{item.position}</div>
                  <SeatChips cand={c} requiredTypes={item.requiredTypes} />
                  <div className="ls-with">Rating now ({c.interviewing.length}): {c.interviewing.map(r => r.name).join(', ')}</div>
                </article>
              )}
            />
          )}
        </div>

        <div className="ls-sec q">
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
                    <div className="ls-item">Item # {q.itemNumber}<AlsoApplied id={q.id} list={q.otherItems} /></div>
                    <div className="ls-pos">{q.position}</div>
                  </div>
                  <span className="ls-tag">{i === 0 ? 'Next' : q.rated > 0 ? `${q.rated} of ${q.required} rated` : ''}</span>
                </div>
              )}
            />
          )}
        </div>
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
  const [layout, setLayout] = useState(() => readPref('ls_layout', 'auto'));
  const [inner, setInner] = useState(() => (INNER.some(i => i[0] === readPref('ls_inner', 'auto')) ? readPref('ls_inner', 'auto') : 'auto'));
  const [alsoAll, setAlsoAll] = useState(() => readPref('ls_also', 'collapsed') === 'expanded');   // default for everyone
  const [alsoFlip, setAlsoFlip] = useState(() => new Set());                                          // people flipped away from that default
  const [showSubs, setShowSubs] = useState(() => readPref('ls_subs', 'on') !== 'off');
  const [guideOpen, setGuideOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(() => readPref('ls_sound', 'on') !== 'off');
  const { ensure: wakeSound, play } = useSound();
  const [alertsOn, setAlertsOn] = useState(() => readPref('ls_alerts', 'on') !== 'off');
  const alertsOnRef = useRef(alertsOn);
  alertsOnRef.current = alertsOn;
  const [voiceState, setVoiceState] = useState(kokoro.state);
  const [banners, setBanners] = useState([]);
  const bannerId = useRef(0);
  const addBanner = useCallback((b) => setBanners(q => [...q, { ...b, id: ++bannerId.current }].slice(-6)), []);
  const curBanner = banners[0];
  const bannerMs = banners.length > 2 ? 3500 : 6000;
  useEffect(() => {
    if (!curBanner) return undefined;
    const t = setTimeout(() => setBanners(q => q.slice(1)), bannerMs);
    return () => clearTimeout(t);
  }, [curBanner?.id, bannerMs]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!isOpen) setBanners([]); }, [isOpen]);
  const [flash, setFlash] = useState(() => new Set());
  const alertState = useRef(new Map());   // candidate id -> last 5-minute mark already announced
  const liveRef = useRef({ views: [], fetchedAt: 0 });
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const prevSnap = useRef(null);
  const [theme, setTheme] = useState(() => readPref('ls_theme', 'dark'));
  const [zoomIdx, setZoomIdx] = useState(() => { const i = Number(readPref('ls_zoom', 1)); return i >= 0 && i < ZOOMS.length ? i : 1; });
  const rootRef = useRef(null);
  const idleTimer = useRef(null);

  const patch = useCallback((fn) => setData(d => (d ? fn(d) : d)), []);

  // Only the most recently STARTED request may update the screen, so a slow poll that began before a
  // queue change can't land afterwards and wipe it out.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const res = await liveStatsAPI.get();
      if (seq !== loadSeq.current) return;
      setData(res);
      setFetchedAt(Date.now());
      setError(false);
    } catch (err) {
      if (seq !== loadSeq.current) return;
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
  // Alarm tone, then each name and how long they have been in: "Room A. Juan Reyes. 10 minutes elapsed."
  // Synthesis starts right away, while the alarm is still sounding, so the voice follows without a gap.
  const announce = useCallback((list) => {
    const ctx = wakeSound();
    const real = list.filter(d => !d.test);
    if (real.length) play('warn');
    const lines = list.map(d => {
      const text = d.test ? 'Interview time alerts are on.' : alertLine(d);
      return { text, clip: synth(text) };
    });
    speechChain = speechChain.then(async () => {
      if (real.length) await SLEEP(1300);
      for (const l of lines) {
        const clip = await l.clip;
        if (clip && ctx) await playClip(ctx, clip); else await speakBrowser(l.text);
      }
    }).catch(() => {});
  }, [wakeSound, play]);
  const toggleSound = useCallback(() => {
    const next = !soundOnRef.current;
    setSoundOn(next);
    savePref('ls_sound', next ? 'on' : 'off');
    if (next) { wakeSound(); setTimeout(() => play('submit'), 60); }
  }, [wakeSound, play]);
  const toggleAlerts = useCallback(() => {
    const next = !alertsOnRef.current;
    setAlertsOn(next);
    savePref('ls_alerts', next ? 'on' : 'off');
    if (next) { wakeSound(); setTimeout(() => announce([{ name: 'Alerts are on', minutes: 0, test: true }]), 60); }
  }, [wakeSound, announce]);
  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const roomIdsRef = useRef([]);
  const cycleLayout = useCallback(() => {
    const avail = layoutsFor(roomIdsRef.current.length);
    if (!avail.length) return;
    setLayout(cur => {
      const i = avail.findIndex(l => l[0] === cur);
      const next = avail[(i + 1) % avail.length][0];
      savePref('ls_layout', next);
      return next;
    });
    setSpotlight(null);
  }, []);
  const pickLayout = useCallback((id) => { setLayout(id); savePref('ls_layout', id); setSpotlight(null); }, []);
  const cycleInner = useCallback(() => setInner(cur => {
    const next = INNER[(INNER.findIndex(i => i[0] === cur) + 1) % INNER.length][0];
    savePref('ls_inner', next);
    return next;
  }), []);
  const pickInner = useCallback((id) => { setInner(id); savePref('ls_inner', id); }, []);
  const alsoOpen = useCallback((id) => alsoAll !== alsoFlip.has(id), [alsoAll, alsoFlip]);
  const toggleAlso = useCallback((id) => setAlsoFlip(f => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const alsoCtx = useMemo(() => ({ isOpen: alsoOpen, toggle: toggleAlso }), [alsoOpen, toggleAlso]);
  const toggleAlsoAll = useCallback(() => { setAlsoAll(v => { savePref('ls_also', v ? 'collapsed' : 'expanded'); return !v; }); setAlsoFlip(new Set()); }, []);
  const toggleSubs = useCallback(() => setShowSubs(v => { savePref('ls_subs', v ? 'off' : 'on'); return !v; }), []);
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
      else if (e.key === 'v' || e.key === 'V') toggleAlerts();
      else if (e.key === 'l' || e.key === 'L') cycleLayout();
      else if (e.key === 's' || e.key === 'S') toggleSubs();
      else if (e.key === 'q' || e.key === 'Q') cycleInner();
      else if (e.key === 'a' || e.key === 'A') toggleAlsoAll();
      else if (e.key === '0') setSpotlight(null);
      else if (/^[1-9]$/.test(e.key)) {
        const id = roomIdsRef.current[Number(e.key) - 1];
        if (id !== undefined && roomIdsRef.current.length > 1) setSpotlight(cur => (cur === id ? null : id));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, managing, guideOpen, spotlight, toggleFs, cycleTheme, bumpZoom, toggleSound, toggleAlerts, cycleLayout, cycleInner, toggleSubs, toggleAlsoAll]);

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
    queue.filter(q => q.status !== 'being_rated').forEach(q => { (map.get(q.roomId) || loose).waiting.push(q); });

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

  roomIdsRef.current = roomViews.map(v => v.id);
  const spotView = roomViews.length > 1 && spotlight ? roomViews.find(v => v.id === spotlight) : null;
  const toggleSpot = (id) => setSpotlight(cur => (cur === id ? null : id));
  const availLayouts = layoutsFor(roomViews.length);
  const effLayout = availLayouts.some(l => l[0] === layout) ? layout : 'auto';

  // Sound cues + centre banners: compare each fresh snapshot with the one before it (the first one after opening is silent).
  useEffect(() => {
    if (!isOpen) { prevSnap.current = null; return; }
    if (!data) return;
    const live = new Set(nowCards.map(n => n.key));
    const newest = data.recent?.[0]?.at ? new Date(data.recent[0].at).getTime() : 0;
    const doneAt = data.completed?.[0]?.at ? new Date(data.completed[0].at).getTime() : 0;
    const complete = data.summary?.complete ?? 0;
    const prev = prevSnap.current;
    prevSnap.current = { live, newest, complete, doneAt };
    if (!prev) return;
    (data.recent || []).filter(r => new Date(r.at).getTime() > prev.newest).slice(0, 4).reverse().forEach(r => {
      const t = TYPE_LABEL[r.raterType] || r.raterType;
      addBanner({ kind: 'submit', icon: '✓', head: 'RATING SUBMITTED', main: r.candidateName, sub: r.position ? `Item # ${r.itemNumber}: ${r.position}` : '', caption: `${r.raterName} (${t}) submitted a rating for ${r.candidateName}.` });
    });
    (data.completed || []).filter(d => new Date(d.at).getTime() > prev.doneAt).slice(0, 2).reverse().forEach(d => {
      addBanner({ kind: 'done', icon: '★', head: 'ALL RATINGS COMPLETE', main: d.name, sub: d.position ? `Item # ${d.itemNumber}: ${d.position}` : '', caption: `All required raters have submitted for ${d.name}.` });
    });
    if (!soundOnRef.current) return;
    const cues = [];
    if (complete > prev.complete) cues.push('complete');
    if ([...live].some(id => !prev.live.has(id))) cues.push('start');
    if (newest > prev.newest && !cues.includes('complete')) cues.push('submit');
    cues.forEach((k, i) => setTimeout(() => play(k), i * 900));
  }, [isOpen, data, nowCards, play, addBanner]);

  // Download / warm up the natural voice as soon as the screen opens (only when alerts are on).
  useEffect(() => {
    if (!isOpen || !alertsOn) return;
    setVoiceState(kokoro.state);
    const p = loadKokoro();
    setVoiceState(kokoro.state);
    p.then(() => setVoiceState(kokoro.state));
  }, [isOpen, alertsOn]);

  // 5-minute interview warnings: checked every second against the live clock shown on each card.
  liveRef.current = { views: roomViews, fetchedAt };
  useEffect(() => {
    if (!isOpen) { alertState.current.clear(); return undefined; }
    const t = setInterval(() => {
      const { views, fetchedAt: at } = liveRef.current;
      if (!at) return;
      const seen = new Set(); const due = [];
      views.forEach(v => v.cards.forEach(n => {
        const sec = n.elapsed + (Date.now() - at) / 1000;
        const m = Math.floor(sec / ALERT_EVERY_SEC);
        seen.add(n.key);
        let last = alertState.current.get(n.key);
        // Already past a mark when first seen (screen opened mid-interview): stay quiet, unless it just passed.
        if (last === undefined) last = (m >= 1 && sec - m * ALERT_EVERY_SEC < 20) ? m - 1 : m;
        if (m > last) due.push({ key: n.key, name: n.c.name, room: views.length > 1 ? v.name : '', minutes: Math.round((m * ALERT_EVERY_SEC) / 60) });
        alertState.current.set(n.key, Math.max(m, last));
      }));
      [...alertState.current.keys()].forEach(k => { if (!seen.has(k)) alertState.current.delete(k); });
      if (!due.length || !alertsOnRef.current) return;
      setFlash(f => new Set([...f, ...due.map(d => d.key)]));
      setTimeout(() => setFlash(f => { const n = new Set(f); due.forEach(d => n.delete(d.key)); return n; }), 9000);
      due.forEach(d => addBanner({ kind: 'alarm', icon: '⏰', head: `${d.minutes} MINUTES ELAPSED`, main: d.name, sub: d.room, caption: alertLine(d) }));
      announce(due);
    }, 1000);
    return () => clearInterval(t);
  }, [isOpen, announce, addBanner]);

  if (!isOpen) return null;
  const sum = data?.summary;
  // "In progress" = interviews happening right now; "Not started" = candidates waiting in a room's queue.
  const liveNow = nowCards.length;
  const inQueue = roomViews.reduce((a, v) => a + v.waiting.length, 0);

  return (
    <div ref={rootRef} className={`ls-root ${controlsShown ? '' : 'idle'}`} data-theme={theme} onMouseMove={wake} onTouchStart={wake} onPointerDown={wakeSound} onKeyDown={wakeSound} role="dialog" aria-modal="true" aria-label="Live stats">
      <style>{CSS}</style>

      <header className="ls-head">
        <span className={`ls-dot ${error ? 'err' : ''}`} />
        <h2 className="ls-title">Live Stats</h2>
        {sum && (
          <div className="ls-stats">
            <div className="ls-stat"><b>{sum.beingRated}</b><span>Being rated</span></div>
            <div className="ls-stat"><b>{sum.complete}</b><span>Complete of {sum.candidates}</span></div>
            <div className="ls-stat"><b>{liveNow}</b><span>In progress</span></div>
            <div className="ls-stat"><b>{inQueue}</b><span>Not started</span></div>
            <div className="ls-stat"><b>{sum.ratersOnline}/{sum.ratersTotal}</b><span>Raters online</span></div>
            {data.avgTimes && <>
              <span className="ls-sep" />
              {[['lastHour', 'Avg · last hour'], ['last8Hours', 'Avg · last 8 hours'], ['allTime', 'Avg · all time']].map(([k, label]) => (
                <div key={k} className="ls-stat avg" title={`Average interview time per rater, ${data.avgTimes[k].count} sitting${data.avgTimes[k].count === 1 ? '' : 's'}`}>
                  <b>{fmtAvg(data.avgTimes[k].avgSeconds)}</b><span>{label}{data.avgTimes[k].count ? ` (${data.avgTimes[k].count})` : ''}</span>
                </div>
              ))}
            </>}
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
        <main className={`ls-main ${showSubs ? '' : 'nosub'}`} key={`${zoomIdx}-${theme}`}>
          <AlsoCtx.Provider value={alsoCtx}>
          <RoomsArea
            views={roomViews}
            spotId={spotView ? spotView.id : null}
            zoom={ZOOMS[zoomIdx]}
            layout={effLayout}
            inner={inner}
            alsoOpen={alsoOpen}
            render={({ v, lay, big, style }) => (
              <RoomPanel key={v.id} view={v} lay={lay} big={big} extraStyle={style} index={roomViews.indexOf(v)} numbered={roomViews.length > 1}
                onSpot={() => toggleSpot(v.id)} fetchedAt={fetchedAt} flash={flash} canManageQueue={canManageQueue} hasRooms={(data.rooms || []).length > 0} />
            )}
          />
          </AlsoCtx.Provider>

          {showSubs && <section className="ls-panel" style={{ '--zoom': ZOOMS[zoomIdx] }}>
            <div className="ls-ph"><h3>Latest submissions</h3></div>
            {recent.length === 0 ? (
              <div className="ls-empty">No ratings submitted yet.</div>
            ) : (
              <FitBox
                className="cols subs"
                items={recent}
                moreLabel="earlier"
                renderItem={(r, i) => (
                  <div key={i} className="ls-rec">
                    <i>✓</i>
                    <div className="m">
                      <div className="l1"><span className="who">{r.raterName}</span><em>{TYPE_LABEL[r.raterType] || r.raterType}</em></div>
                      <div className="l2">rated {r.candidateName}</div>
                    </div>
                    <span className="ago">{timeAgo(r.at)}</span>
                  </div>
                )}
              />
            )}
          </section>}
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
        {availLayouts.length > 0 && (
          <div className="ls-ctl-group ls-layouts">
            <span>Layout</span>
            {availLayouts.map(([id, label, tip]) => (
              <button key={id} className={effLayout === id ? 'on' : ''} title={tip} aria-pressed={effLayout === id} onClick={() => pickLayout(id)}>{label}</button>
            ))}
          </div>
        )}
        <div className="ls-ctl-group ls-layouts">
          <span>Inside rooms</span>
          {INNER.map(([id, label, tip]) => (
            <button key={id} className={inner === id ? 'on' : ''} title={tip} aria-pressed={inner === id} onClick={() => pickInner(id)}>{label}</button>
          ))}
        </div>
        <button onClick={toggleAlsoAll} aria-pressed={alsoAll} title="Open or collapse every “Also applied” list. Click one to flip just that person.">Also applied: {alsoAll ? 'Expanded' : 'Collapsed'}</button>
        <button onClick={toggleSubs} aria-pressed={showSubs}>Submissions: {showSubs ? 'Shown' : 'Hidden'}</button>
        <div className="ls-ctl-group">
          <button onClick={() => bumpZoom(-1)} disabled={zoomIdx === 0} aria-label="Smaller text">A−</button>
          <button onClick={() => bumpZoom(1)} disabled={zoomIdx === ZOOMS.length - 1} aria-label="Larger text">A+</button>
        </div>
        <button onClick={cycleTheme}>Theme: {THEMES.find(t => t[0] === theme)?.[1]}</button>
        <button onClick={toggleSound} aria-pressed={soundOn}>Sound: {soundOn ? 'On' : 'Off'}</button>
        <button onClick={toggleAlerts} aria-pressed={alertsOn}>5-min alerts: {alertsOn ? 'On' : 'Off'}{alertsOn && voiceState === 'loading' ? ' (voice loading…)' : ''}</button>
        <button onClick={() => setGuideOpen(true)}>Shortcuts (?)</button>
        {canManageQueue && <button onClick={() => setManaging(true)}>Manage queue</button>}
        <button onClick={toggleFs}>{isFs ? 'Exit full screen' : 'Full screen (F)'}</button>
        <button onClick={onClose}>Close</button>
      </div>

      {curBanner && <div style={{ display: 'contents', '--bn-ms': `${bannerMs}ms` }}><CenterBanner b={curBanner} /></div>}

      {guideOpen && (
        <ShortcutGuide
          onClose={() => setGuideOpen(false)}
          onTest={(k) => { wakeSound(); setTimeout(() => play(k), 60); }}
          soundOn={soundOn}
          alertsOn={alertsOn}
          voiceState={voiceState}
          onTestAlert={() => { const c = roomViews.flatMap(v => v.cards)[0]; const d = { name: c ? c.c.name : 'Sample Candidate', room: roomViews.length > 1 ? 'Room A' : '', minutes: 5 }; addBanner({ kind: 'alarm', icon: '⏰', head: '5 MINUTES ELAPSED', main: d.name, sub: d.room, caption: alertLine(d) }); announce([d]); }}
          canManageQueue={canManageQueue}
          hasRooms={(data?.rooms || []).length > 0}
        />
      )}

      {managing && <QueueManager data={data} reload={load} patch={patch} onClose={() => setManaging(false)} />}
    </div>
  );
};

export default LiveStatsModal;