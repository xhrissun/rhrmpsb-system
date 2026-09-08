// src/components/SystemSettingsPanel.jsx
import React, { useState, useEffect } from 'react';
import { settingsAPI } from '../utils/api';
import { useToast } from '../utils/ToastContext';

const SystemSettingsPanel = () => {
  const [aiEnabled, setAiEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    loadStatus();
  }, []);

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
    </div>
  );
};

export default SystemSettingsPanel;