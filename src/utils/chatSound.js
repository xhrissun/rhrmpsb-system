// A short two-note "ping" for new chat messages, synthesized on the fly
// rather than shipped as an audio file — one less asset to bundle, host,
// and keep in sync with this feature, for a sound this simple.
//
// Mute preference persists across sessions in localStorage, same as any
// real messenger's notification-sound toggle.

const MUTE_KEY = 'chat_sound_muted';

export function isChatSoundMuted() {
  return localStorage.getItem(MUTE_KEY) === 'true';
}

export function setChatSoundMuted(muted) {
  localStorage.setItem(MUTE_KEY, muted ? 'true' : 'false');
}

let audioCtx = null;
function getAudioContext() {
  // Created lazily, on first actual use — browsers block audio contexts
  // from starting until a real user gesture has happened somewhere on the
  // page (a click, a keypress), so creating this eagerly on module load
  // would just create it in a suspended state for no benefit.
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

function playTone(ctx, frequency, startTime, duration, peakGain) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

export function playChatNotificationSound() {
  if (isChatSoundMuted()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    // A quick rising two-note chime (E6 then A6) — reads as "notification",
    // not an alarm; kept short and quiet so it doesn't compound
    // unpleasantly if several messages arrive close together.
    playTone(ctx, 1318.5, now, 0.14, 0.12);
    playTone(ctx, 1760.0, now + 0.09, 0.18, 0.12);
  } catch {
    // Audio is a nice-to-have here — never let it break message delivery.
  }
}