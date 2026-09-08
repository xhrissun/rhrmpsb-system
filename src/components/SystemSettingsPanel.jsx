// src/components/SystemSettingsPanel.jsx
import React, { useState, useEffect } from 'react';
import { settingsAPI } from '../utils/api';
import { useToast } from '../utils/ToastContext';

const SystemSettingsPanel = () => {
  const [aiEnabled, setAiEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const [expandedLogId, setExpandedLogId] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadStatus();
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      setLogsLoading(true);
      setLogsError('');
      const data = await settingsAPI.getAiEvaluationLogs(25);
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load AI evaluation logs:', err);
      setLogsError(err.response?.data?.message || 'Failed to load AI evaluation audit log.');
    } finally {
      setLogsLoading(false);
    }
  };

  const loadStatus = async () => {
    try {
      setLoading(true);
      const data = await settingsAPI.getAiEvaluationStatus();
      setAiEnabled(!!data.enabled);
    } catch (err) {
      console.error('Failed to load AI evaluation setting:', err);
      showToast('Failed to load system settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    const next = !aiEnabled;
    setSaving(true);
    try {
      const data = await settingsAPI.setAiEvaluationStatus(next);
      setAiEnabled(!!data.enabled);
      showToast(
        data.enabled ? 'AI-assisted evaluation is now ON' : 'AI-assisted evaluation is now OFF',
        'success'
      );
    } catch (err) {
      console.error('Failed to update AI evaluation setting:', err);
      showToast(err.response?.data?.message || 'Failed to update setting', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">AI-Assisted Evaluation</h3>
        <p className="text-sm text-gray-500 mb-4">
          Controls whether Secretariat users can generate an AI-drafted evaluation
          (education/training/experience/eligibility comments) for a candidate. The AI
          never finalizes anything — a human always reviews and saves the actual comments.
        </p>

        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 leading-relaxed">
          Candidate documents are read and their text redacted (name, birthdate, address,
          ID numbers) entirely on this server before anything is sent to Google's Gemini
          API. Turning this off disables the feature server-side, not just in the UI.
        </div>

        {loading ? (
          <div className="text-sm text-gray-400">Loading current setting…</div>
        ) : (
          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <div>
              <div className="text-sm font-medium text-gray-800">
                AI Evaluation is currently {aiEnabled ? 'ON' : 'OFF'}
              </div>
              <div className="text-xs text-gray-400">
                {aiEnabled
                  ? 'Secretariat users can generate AI drafts.'
                  : 'The "AI Evaluate" action is blocked for all users.'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggle}
              disabled={saving}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                aiEnabled ? 'bg-green-500' : 'bg-gray-300'
              }`}
              aria-pressed={aiEnabled}
              aria-label="Toggle AI-assisted evaluation"
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                  aiEnabled ? 'translate-x-8' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-gray-800">AI Data Sent to Gemini (Audit Log)</h3>
          <button
            type="button"
            onClick={loadLogs}
            disabled={logsLoading}
            className="text-xs font-semibold text-purple-600 hover:text-purple-800 disabled:opacity-50"
          >
            {logsLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Every AI evaluation run is logged here with the literal, already-redacted request text
          that left this server for Gemini — use this to spot-check that redaction is working
          as expected, without spending another Gemini call to re-check.
        </p>

        {logsError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{logsError}</p>
        )}

        {!logsLoading && !logsError && logs.length === 0 && (
          <p className="text-sm text-gray-400 border-t border-gray-100 pt-4">No AI evaluations have been run yet.</p>
        )}

        {logs.length > 0 && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            {logs.map(log => {
              const isOpen = expandedLogId === log._id;
              return (
                <div key={log._id} className="border border-gray-200 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setExpandedLogId(isOpen ? null : log._id)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 rounded-lg"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {log.itemNumber || '(no item number)'} · {log.suggestedStatus || '—'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(log.createdAt).toLocaleString()} · by {log.triggeredByName || 'unknown'} · model: {log.modelUsed || '—'} · {log.documentsSent?.length || 0} doc(s) sent, {log.documentsSkipped?.length || 0} skipped
                      </p>
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-2">
                      {log.documentsSkipped?.length > 0 && (
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                          <span className="font-bold uppercase tracking-wide text-[10px]">Skipped:</span>{' '}
                          {log.documentsSkipped.map(d => `${d.label} (${d.reason || 'no reason logged'})`).join('; ')}
                        </div>
                      )}
                      <pre className="text-[10px] text-gray-700 bg-gray-50 border border-gray-100 rounded-md p-2 max-h-72 overflow-auto whitespace-pre-wrap font-mono">
                        {log.promptText || '(no prompt text logged for this entry)'}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemSettingsPanel;