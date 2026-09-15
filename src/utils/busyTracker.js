import { useState, useEffect } from 'react';

// Tracks operations that would be left broken — not just interrupted, but
// genuinely stuck — if the browser tab went away mid-operation. The
// motivating case: AI evaluation fetches, OCRs, and submits each document
// from THIS browser tab (see clientTextExtraction.js) one at a time; the
// server-side job just waits for whatever hasn't arrived yet. If the tab
// closes, refreshes, or the session logs out before every document is
// submitted, that job never completes — there's no "resume" path, it's
// just permanently stuck at "processing".
//
// This is a plain module-level store, deliberately NOT React Context: the
// component that needs to SET this (SecretariatView, deep in the tree)
// and the components that need to READ it (IdleTimeoutMonitor and the
// beforeunload handler, both near the App.jsx root) are siblings with no
// natural shared ancestor for this one cross-cutting concern — wrapping
// the whole app in a new Provider just for this would be a bigger, riskier
// change than the feature itself.
//
// Multiple independent operations can be in flight at once (an AI
// evaluation for one candidate, a CSV import, etc.), so this tracks a SET
// of reasons rather than one boolean — "busy" means the set is non-empty.
const busyReasons = new Set();
const listeners = new Set();

function notify() {
  listeners.forEach(fn => fn());
}

// `reason` should be a stable, unique string per in-flight operation, e.g.
// `ai-evaluation:${candidateId}` — using the candidate id (rather than a
// generic "ai-evaluation" key) means the tracker won't get confused if two
// operations somehow overlap, and clearing one operation's reason can
// never accidentally clear another's.
export function markBusy(reason) {
  busyReasons.add(reason);
  notify();
}

export function clearBusy(reason) {
  busyReasons.delete(reason);
  notify();
}

export function isBusy() {
  return busyReasons.size > 0;
}

export function getBusyReasons() {
  return Array.from(busyReasons);
}

// For components that need to re-render when busy state changes (e.g. to
// show/hide a warning). Plain useState+subscribe rather than
// useSyncExternalStore purely for broader compatibility with whatever
// React version this project is pinned to.
export function useIsBusy() {
  const [busy, setBusy] = useState(isBusy());
  useEffect(() => {
    const listener = () => setBusy(isBusy());
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  return busy;
}