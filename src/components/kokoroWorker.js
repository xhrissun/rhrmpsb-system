// Runs the natural-voice model (Kokoro) off the main thread. Speech synthesis is heavy; on the main
// thread it froze the whole Live Stats screen for a few seconds every time a warning was due.
import { KokoroTTS } from 'kokoro-js';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let ttsPromise = null;
const load = () => {
  if (!ttsPromise) ttsPromise = KokoroTTS.from_pretrained(MODEL, { dtype: 'q8', device: 'wasm' });
  return ttsPromise;
};

let chain = Promise.resolve();   // one job at a time
self.onmessage = (e) => {
  const { id, type, text, voice, speed } = e.data || {};
  chain = chain.then(async () => {
    try {
      const tts = await load();
      if (type === 'load') { self.postMessage({ id, ok: true }); return; }
      const a = await tts.generate(text, { voice, speed });
      const data = a.audio;
      self.postMessage({ id, ok: true, data, sr: a.sampling_rate }, [data.buffer]);
    } catch (err) {
      ttsPromise = null;
      self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
    }
  });
};