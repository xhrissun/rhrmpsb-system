// src/components/TrustedDevicesModal.jsx
//
// Self-service "Manage Devices" screen for the "remember this device" login
// feature (see POST /auth/login, POST /auth/verify-otp). Lists every browser
// currently allowed to skip OTP for this account, lets the user revoke one
// or all of them, and highlights which entry is the browser they're using
// right now. Mounted once in Dashboard.jsx's navbar so every user type
// (Rater, Secretariat, Admin, Summary Viewer) gets the same screen.
import React, { useState, useEffect, useCallback } from 'react';
import { authAPI } from '../utils/api';

const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return '—';
  }
};

const TrustedDevicesModal = ({ isOpen, onClose }) => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revokingId, setRevokingId] = useState(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await authAPI.getTrustedDevices();
      setDevices(result.devices || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load trusted devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setNotice('');
      setError('');
      setConfirmRevokeAll(false);
      load();
    }
  }, [isOpen, load]);

  const handleRevoke = async (device) => {
    setRevokingId(device.id);
    setError('');
    try {
      await authAPI.revokeTrustedDevice(device.id);
      setDevices(prev => prev.filter(d => d.id !== device.id));
      if (device.isCurrent) {
        localStorage.removeItem('deviceToken');
      }
      setNotice(`"${device.label}" was removed. It will need a verification code next time it signs in.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove device');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    setError('');
    try {
      await authAPI.revokeAllTrustedDevices();
      localStorage.removeItem('deviceToken');
      setDevices([]);
      setConfirmRevokeAll(false);
      setNotice('All trusted devices were removed. Every device, including this one, will need a verification code next time it signs in.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove devices');
    } finally {
      setRevokingAll(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="trusted-devices-title">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-gray-100 shrink-0 flex items-start justify-between gap-4">
          <div>
            <h2 id="trusted-devices-title" className="text-lg font-bold text-gray-900">Manage Devices</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Devices you've marked "remember this device" skip the email verification code for 30 days after each sign-in.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-3">
          {notice && (
            <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{notice}</div>
          )}
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400 text-sm">Loading devices…</div>
          ) : devices.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              No trusted devices. Check "Remember this device" the next time you sign in to add one.
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map(device => (
                <div
                  key={device.id}
                  className={`rounded-lg border px-4 py-3 ${device.isCurrent ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-bold text-gray-900 truncate">{device.label}</p>
                        {device.isCurrent && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-600 text-white">This device</span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">Last used {formatDate(device.lastUsedAt)}</p>
                      <p className="text-[11px] text-gray-400">Trusted since {formatDate(device.createdAt)} · Expires {formatDate(device.expiresAt)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevoke(device)}
                      disabled={revokingId === device.id}
                      className="text-xs font-semibold text-red-600 hover:text-red-800 hover:bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200 transition-colors shrink-0 disabled:opacity-50"
                    >
                      {revokingId === device.id ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {devices.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 shrink-0">
            {!confirmRevokeAll ? (
              <button
                type="button"
                onClick={() => setConfirmRevokeAll(true)}
                className="text-xs font-semibold text-red-600 hover:text-red-800 underline"
              >
                Remove all devices
              </button>
            ) : (
              <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-xs text-red-800">Remove all — every device, including this one, will need a code next time.</p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setConfirmRevokeAll(false)}
                    className="text-xs font-semibold text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleRevokeAll}
                    disabled={revokingAll}
                    className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {revokingAll ? 'Removing…' : 'Confirm'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrustedDevicesModal;