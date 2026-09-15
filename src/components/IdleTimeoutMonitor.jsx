import React, { useState, useEffect, useRef, useCallback } from 'react';
import { isBusy, useIsBusy } from '../utils/busyTracker';

// How long with NO user interaction (mouse, keyboard, scroll, touch)
// before showing the warning. This is deliberately much shorter than the
// backend's 8h sliding-expiry token — that's a hard ceiling for how long
// a session can live at all, while this is a security-motivated idle
// lock, the same kind found in banking or other sensitive government
// systems. 20 minutes is a reasonable default for this kind of tool;
// adjust here if a different policy is wanted.
const IDLE_WARNING_MS = 20 * 60 * 1000;

// Once the warning appears, how many seconds the person has to respond
// before being logged out automatically.
const COUNTDOWN_SECONDS = 60;

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

// Mounted once, near the top of the app, only while a user is logged in.
// Fixes the specific complaint this was built for: previously there was
// no warning at all before a session went stale — the only way to find
// out you'd been logged out was to refresh and get redirected. This
// warns first, with a clear countdown, and only actually logs out if
// nobody responds.
//
// Also respects busyTracker's isBusy(): an idle-triggered logout while
// something like an AI evaluation is running wouldn't just interrupt it —
// it would leave the server-side job permanently stuck, since it's
// waiting on documents only THIS browser tab is fetching/submitting (see
// busyTracker.js and SecretariatView's handleGenerateAiDraft). So the
// warning simply never appears while busy, and re-arms once the operation
// finishes, rather than firing on a timer that has no idea a real
// operation is in flight.
export default function IdleTimeoutMonitor({ onLogout }) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const showWarningRef = useRef(false);
  const warningTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const appIsBusy = useIsBusy();

  useEffect(() => { showWarningRef.current = showWarning; }, [showWarning]);

  const startWarningTimer = useCallback(() => {
    clearTimeout(warningTimerRef.current);
    warningTimerRef.current = setTimeout(() => {
      if (isBusy()) {
        // Re-arm the same timer rather than showing the warning — once
        // whatever's running finishes, idle-then-warn behavior resumes
        // from a full IDLE_WARNING_MS, exactly as if the person had just
        // been active (starting an evaluation IS activity, after all).
        startWarningTimer();
        return;
      }
      setShowWarning(true);
      setSecondsLeft(COUNTDOWN_SECONDS);
    }, IDLE_WARNING_MS);
  }, []);

  useEffect(() => {
    startWarningTimer();

    // Once the warning is showing, ordinary activity no longer silently
    // dismisses it — a stray mouse jiggle shouldn't clear a warning the
    // person hasn't actually engaged with; they have to click one of the
    // two buttons below. Reading showWarningRef (rather than the
    // showWarning state directly) lets these listeners be attached exactly
    // once on mount instead of being torn down and re-bound on every
    // state change, which is what would otherwise be needed to keep this
    // check current.
    const handleActivity = () => {
      if (!showWarningRef.current) startWarningTimer();
    };
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));
    return () => {
      clearTimeout(warningTimerRef.current);
      clearInterval(countdownIntervalRef.current);
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity));
    };
  }, [startWarningTimer]);

  // Rare edge case, but a real one: something becomes busy (e.g. an AI
  // evaluation started from a different browser tab logged in as the same
  // user) WHILE the warning is already showing. Dismiss it immediately
  // rather than letting a countdown that's already running finish and log
  // out over an operation that only just started.
  useEffect(() => {
    if (appIsBusy && showWarning) {
      setShowWarning(false);
      startWarningTimer();
    }
  }, [appIsBusy, showWarning, startWarningTimer]);

  useEffect(() => {
    if (!showWarning) return undefined;
    countdownIntervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          // Final safety check right before actually logging out — belt
          // and suspenders alongside the checks above, for the narrow
          // window where something became busy in the countdown's very
          // last second.
          if (isBusy()) {
            setShowWarning(false);
            startWarningTimer();
            return COUNTDOWN_SECONDS;
          }
          onLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownIntervalRef.current);
  }, [showWarning, onLogout, startWarningTimer]);

  const handleStayLoggedIn = () => {
    setShowWarning(false);
    startWarningTimer();
  };

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="idle-warning-title">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h2 id="idle-warning-title" className="text-lg font-bold text-gray-900">Still there?</h2>
        <p className="text-sm text-gray-600">
          You've been inactive for a while. For security, you'll be signed out automatically in{' '}
          <span className="font-bold text-gray-900">{secondsLeft}</span> second{secondsLeft === 1 ? '' : 's'}.
        </p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onLogout}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Log Out Now
          </button>
          <button
            onClick={handleStayLoggedIn}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors"
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
}