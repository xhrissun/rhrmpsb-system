import React, { useState, useEffect, useRef } from 'react';
import RaterView from './RaterView';
import SecretariatView from './SecretariatView';
import AdminView from './AdminView';
import { USER_TYPES } from '../utils/constants';
import { usersAPI } from '../utils/api';

// Password Change Modal Component
const PasswordChangeModal = ({ isOpen, onClose, selectedUser, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!newPassword.trim()) {
      setError('New password is required');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const result = await usersAPI.changePassword(selectedUser._id, newPassword);
      onSuccess(result.message);
      handleClose();
    } catch (error) {
      console.error('Password change error:', error);
      setError(error.response?.data?.message || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setShowPasswords(false);
    onClose();
  };

  if (!isOpen || !selectedUser) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">
            Change Password
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4 p-3 bg-gray-100 rounded-lg">
          <p className="text-sm text-gray-600">
            <span className="font-medium">User:</span> {selectedUser.name}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-medium">Email:</span> {selectedUser.email}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-medium">Role:</span> {selectedUser.userType}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <div className="relative">
              <input
                type={showPasswords ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Enter new password"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Confirm new password"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="showPasswords"
              checked={showPasswords}
              onChange={(e) => setShowPasswords(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="showPasswords" className="ml-2 block text-sm text-gray-600">
              Show passwords
            </label>
          </div>

          <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded border border-blue-100">
            <p className="font-medium mb-1">Password Requirements:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>At least 6 characters long</li>
              <li>User will need to log in again with the new password</li>
            </ul>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Changing...
                </>
              ) : (
                'Change Password'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Creator Profile Modal Component
const CreatorProfileModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-800 text-center flex-1">
            About the Developer
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="text-center space-y-4">
          <img
            src="https://github.com/xhrissun/rhrmpsb-system/blob/main/profile.jpg?raw=true"
            alt="Creator Photo"
            className="w-24 h-24 rounded-full mx-auto object-cover border-2 border-gray-200 shadow-sm"
            onError={(e) => {
              e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiBmaWxsPSIjRjNGNEY2Ii8+CjxjaXJjbGUgY3g9IjY0IiBjeT0iNDQiIHI9IjIwIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0zMiA5NkMzMiA4MC41MzYgNDQuNTM2IDY4IDYwIDY4aDhDODMuNDY0IDY4IDk2IDgwLjUzNiA5NiA5NnYzMkgzMlY5NloiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+';
            }}
          />
          
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              Dan Christian Bonacua Sabao, LPT, CHRM
            </h2>
            <p className="text-blue-600 font-medium text-sm">
              Administrative Officer I | DENR IV-A
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-center items-center">
              <span className="mr-2 text-lg">📧</span>
              <a
                href="mailto:dan.c.b.sabao.adm@gmail.com"
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                dan.c.b.sabao.adm@gmail.com
              </a>
            </div>

            <div className="bg-gray-100 border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-800 text-sm mb-2">Support My Work</h4>
              <div className="space-y-1 text-sm">
                <p><strong>PayMaya:</strong> @vlax</p>
                <p>
                  <strong>PayPal:</strong>{' '}
                  <a
                    href="https://paypal.me/tetralax"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    paypal.me/tetralax
                  </a>
                </p>
              </div>
            </div>

            <p className="text-gray-600 text-sm leading-relaxed">
              Developer of the <strong>DENR CALABARZON Competency-Based Rating System</strong>, leveraging expertise in VBA, JavaScript, and systems integration to deliver efficient, user-friendly digital solutions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// User Selection Modal Component
const UserSelectionModal = ({ isOpen, onClose, users, onSelectUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.userType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleClose = () => {
    setSearchTerm('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">
            Select User
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search users by name, email, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
        </div>

        <div className="max-h-64 overflow-y-auto">
          <div className="space-y-2">
            {filteredUsers.map((user) => (
              <div
                key={user._id}
                onClick={() => {
                  onSelectUser(user);
                  handleClose();
                }}
                className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium text-gray-800 text-sm">{user.name}</div>
                    <div className="text-xs text-gray-500">{user.email}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-800">
                      {user.userType}
                    </div>
                    {user.raterType && (
                      <div className="text-xs text-gray-500">
                        {user.raterType}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {filteredUsers.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">No users found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── STAR Method Guide Modal (Raters only) ────────────────────────────────────

const STAR_SECTIONS = [
  {
    letter: 'S',
    word: 'Situation',
    color: '#1d4ed8',
    lightColor: '#eff6ff',
    borderColor: '#bfdbfe',
    icon: '🔍',
    tagline: 'Set the scene',
    description: 'Describe the context and background of the specific situation or challenge the candidate faced.',
    interviewerTips: [
      'Ask about a specific past event, not a hypothetical',
      'Probe for details: When did this happen? What was the environment?',
      'Clarify the candidate\'s role in the situation',
      'Look for situations that are relevant to the competency being assessed',
    ],
    probeQuestions: [
      '"When exactly did this happen?"',
      '"What was your role or position at the time?"',
      '"What were the key constraints or challenges in that environment?"',
      '"What was the broader context — why did this matter to the organization?"',
    ],
    redFlags: [
      'Vague or generic descriptions ("I always do this…")',
      'Hypothetical responses ("If that happened, I would…")',
      'Cannot recall specific details',
    ],
  },
  {
    letter: 'T',
    word: 'Task',
    color: '#065f46',
    lightColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    icon: '🎯',
    tagline: 'Define the responsibility',
    description: 'Clarify what the candidate was specifically responsible for — their goal, obligation, or challenge.',
    interviewerTips: [
      'Distinguish between what the team did and what the candidate personally did',
      'Identify the specific objective they were trying to achieve',
      'Determine if the task was assigned or self-initiated',
      'Assess the scope and complexity of the responsibility',
    ],
    probeQuestions: [
      '"What specifically were YOU responsible for?"',
      '"Was this task assigned to you, or did you take it on yourself?"',
      '"What was the expected outcome or deliverable?"',
      '"What would have happened if this task was not completed?"',
    ],
    redFlags: [
      'Overuse of "we" without clarifying personal contribution',
      'Unclear ownership of the task',
      'Task seems too simple for the competency level being assessed',
    ],
  },
  {
    letter: 'A',
    word: 'Action',
    color: '#92400e',
    lightColor: '#fffbeb',
    borderColor: '#fcd34d',
    icon: '⚡',
    tagline: 'Unpack what they did',
    description: 'The heart of STAR — what specific steps did the candidate personally take to address the situation?',
    interviewerTips: [
      'This is the most important component — dig deep here',
      'Ask for step-by-step breakdown of what they did',
      'Distinguish their actions from those of teammates or supervisors',
      'Look for initiative, judgment calls, and competency indicators',
      'Follow up on each action: "Why did you choose that approach?"',
    ],
    probeQuestions: [
      '"Walk me through exactly what YOU did, step by step."',
      '"Why did you choose that particular approach?"',
      '"What alternatives did you consider?"',
      '"How did you handle any obstacles or resistance?"',
      '"What decisions did you personally make?"',
      '"Did you involve others? What was your role versus theirs?"',
    ],
    redFlags: [
      'Actions are vague ("I managed the situation")',
      'Cannot explain their reasoning or decision-making',
      'Actions seem inconsistent with the outcome described',
      'Difficulty separating their actions from the team\'s',
    ],
  },
  {
    letter: 'R',
    word: 'Result',
    color: '#581c87',
    lightColor: '#faf5ff',
    borderColor: '#d8b4fe',
    icon: '🏆',
    tagline: 'Measure the impact',
    description: 'What was the outcome? Look for concrete, measurable results and evidence of reflection.',
    interviewerTips: [
      'Push for quantifiable outcomes (%, numbers, timelines)',
      'Ask about both immediate and long-term results',
      'Explore what the candidate learned from the experience',
      'Verify that the result was actually caused by their actions',
      'Look for self-awareness — can they reflect on what went well or poorly?',
    ],
    probeQuestions: [
      '"What was the specific outcome of your actions?"',
      '"Can you quantify the result? (numbers, percentages, timelines)"',
      '"How did others — your supervisor, team, or stakeholders — respond?"',
      '"What did you learn from this experience?"',
      '"If you could do it again, what would you do differently?"',
      '"Was the overall outcome positive, and why or why not?"',
    ],
    redFlags: [
      'Results are vague or unmeasured ("it went well")',
      'Cannot connect their actions to the outcome',
      'No reflection or learning from the experience',
      'Results seem implausible or exaggerated',
    ],
  },
];

const SCORING_GUIDE = [
  {
    score: 5,
    label: 'Outstanding',
    color: '#065f46',
    bg: '#ecfdf5',
    border: '#6ee7b7',
    description: 'All STAR components are fully present, specific, and verifiable. Actions demonstrate mastery of the competency at the expected level. Results are measurable and clearly attributed to the candidate\'s actions. Candidate shows strong self-awareness and reflection.',
  },
  {
    score: 4,
    label: 'Very Satisfactory',
    color: '#1d4ed8',
    bg: '#eff6ff',
    border: '#93c5fd',
    description: 'Most STAR components are clear and complete. Actions show solid competency demonstration with minor gaps. Results are present but may lack full quantification. Candidate can reflect on the experience with minimal prompting.',
  },
  {
    score: 3,
    label: 'Satisfactory',
    color: '#92400e',
    bg: '#fffbeb',
    border: '#fcd34d',
    description: 'STAR components are partially present. Some prompting was required. Actions show basic competency but limited depth. Results are mentioned but not well-quantified. Candidate demonstrates some awareness of impact.',
  },
  {
    score: 2,
    label: 'Unsatisfactory',
    color: '#b45309',
    bg: '#fff7ed',
    border: '#fdba74',
    description: 'STAR components are incomplete or unclear. Significant prompting was required. Actions are vague or lack personal ownership. Results are unclear or not connected to actions. Competency demonstration is weak.',
  },
  {
    score: 1,
    label: 'Poor',
    color: '#991b1b',
    bg: '#fef2f2',
    border: '#fca5a5',
    description: 'Response lacks meaningful STAR components even with heavy prompting. Cannot provide specific examples. Actions and results are absent or implausible. No evidence of the competency being assessed.',
  },
];

const DO_DONTS = {
  dos: [
    'Use past-tense follow-up questions ("Tell me about a time when…")',
    'Allow silence — give the candidate time to think',
    'Take brief notes on each STAR component as they speak',
    'Probe with neutral follow-ups ("Tell me more about that")',
    'Ask about ONE specific situation per competency',
    'Listen for "I" statements that show personal ownership',
    'Redirect politely if the candidate gives a hypothetical response',
    'Clarify ambiguous pronouns: "When you say \'we,\' what did YOU specifically do?"',
  ],
  donts: [
    'Do NOT ask leading questions ("Didn\'t you feel that…?")',
    'Do NOT accept hypothetical answers ("If that happened, I would…")',
    'Do NOT ask multiple questions at once',
    'Do NOT interrupt before a complete STAR response is given',
    'Do NOT share your own opinions or experiences',
    'Do NOT let the candidate change to a different, easier story midway',
    'Do NOT rush — behavioral interviews require adequate time per competency',
    'Do NOT make assumptions about missing components without probing first',
  ],
};

const STARGuideModal = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedSection, setExpandedSection] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const tabs = [
    { id: 'overview',    label: 'STAR Overview',      icon: '⭐', group: 'star' },
    { id: 'deep',        label: 'Component Deep Dive', icon: '🔬', group: 'star' },
    { id: 'scoring',     label: 'Scoring Guide',       icon: '📊', group: 'star' },
    { id: 'dodont',      label: "Do's & Don'ts",       icon: '✅', group: 'star' },
    { id: 'samples',     label: 'Sample Questions',    icon: '💬', group: 'star' },
    { id: 'bei_overview',label: 'BEI Overview',        icon: '🎯', group: 'bei' },
    { id: 'bei_process', label: 'BEI Process',         icon: '🗺️', group: 'bei' },
    { id: 'bei_probing', label: 'Probing Techniques',  icon: '🔎', group: 'bei' },
    { id: 'bei_scoring', label: 'BEI Scoring',         icon: '🏅', group: 'bei' },
    { id: 'bei_ethics',  label: 'Ethics & Bias',       icon: '⚖️', group: 'bei' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col"
           style={{ maxHeight: '90vh' }}>

        {/* ── Header ── */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 60%, #312e81 100%)',
          borderRadius: '16px 16px 0 0',
          padding: '20px 24px 16px',
          flexShrink: 0,
        }}>
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span style={{ fontSize: 28 }}>🎯</span>
                <h2 style={{
                  fontSize: 20, fontWeight: 800, color: '#fff',
                  letterSpacing: '-0.3px', margin: 0,
                }}>
                  STAR & BEI Interview Guide
                </h2>
              </div>
              <p style={{ color: '#93c5fd', fontSize: 12.5, margin: 0, fontWeight: 500 }}>
                STAR Method + Behavioral Event Interview (BEI) Framework · DENR CBS Rating System 2025
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.15)', border: 'none',
                borderRadius: 8, cursor: 'pointer', padding: '6px 8px',
                color: '#fff', fontSize: 18, lineHeight: 1,
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.25)'}
              onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.15)'}
            >
              ✕
            </button>
          </div>

          {/* STAR letter pills */}
          <div className="flex gap-2 mt-3">
            {STAR_SECTIONS.map(s => (
              <div key={s.letter} style={{
                background: 'rgba(255,255,255,0.18)',
                borderRadius: 8, padding: '4px 12px',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ fontWeight: 900, fontSize: 15, color: '#fff' }}>{s.letter}</span>
                <span style={{ fontSize: 11, color: '#bfdbfe', fontWeight: 600 }}>{s.word}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div style={{
          background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0',
          flexShrink: 0, overflowX: 'auto',
        }}>
          {/* Group labels */}
          <div style={{ display: 'flex', padding: '6px 16px 0', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 20 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                ⭐ STAR Method
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                🎯 Behavioral Event Interview (BEI)
              </span>
            </div>
          </div>
          {/* Tabs row */}
          <div style={{ display: 'flex', gap: 2, padding: '4px 16px 0' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '7px 11px', borderRadius: '8px 8px 0 0',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 11.5, fontWeight: activeTab === tab.id ? 700 : 500,
                  color: activeTab === tab.id
                    ? (tab.group === 'bei' ? '#7c3aed' : '#1d4ed8')
                    : '#64748b',
                  background: activeTab === tab.id ? '#fff' : 'transparent',
                  borderBottom: activeTab === tab.id
                    ? `2px solid ${tab.group === 'bei' ? '#7c3aed' : '#1d4ed8'}`
                    : tab.group === 'bei' ? '2px solid #ede9fe' : '2px solid #dbeafe',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div ref={scrollRef} style={{ overflowY: 'auto', flex: 1, padding: '20px 24px 28px' }}>

          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{
                background: '#eff6ff', border: '1.5px solid #bfdbfe',
                borderRadius: 12, padding: '14px 18px',
              }}>
                <p style={{ fontSize: 13.5, color: '#1e40af', lineHeight: 1.65, margin: 0 }}>
                  <strong>STAR</strong> is a structured technique for evaluating behavioral competencies. It helps raters collect consistent, evidence-based responses that reveal how a candidate actually behaved in past situations — the best predictor of future performance.
                </p>
              </div>

              {/* Four components summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {STAR_SECTIONS.map(s => (
                  <div key={s.letter} style={{
                    background: s.lightColor,
                    border: `1.5px solid ${s.borderColor}`,
                    borderRadius: 12, padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: s.color, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontWeight: 900, fontSize: 16, color: '#fff',
                        flexShrink: 0,
                      }}>
                        {s.letter}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 13.5, color: s.color }}>{s.word}</div>
                        <div style={{ fontSize: 11, color: s.color, opacity: 0.8 }}>{s.tagline}</div>
                      </div>
                      <span style={{ marginLeft: 'auto', fontSize: 18 }}>{s.icon}</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.55, margin: 0 }}>
                      {s.description}
                    </p>
                  </div>
                ))}
              </div>

              {/* How to use */}
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: '16px 18px' }}>
                <h3 style={{ fontSize: 13.5, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>
                  How to Use STAR During the Interview
                </h3>
                {[
                  { step: '1', text: 'Select a competency to assess based on the position requirements.' },
                  { step: '2', text: 'Ask an open behavioral question: "Tell me about a time when you had to [competency behavior]."' },
                  { step: '3', text: 'Let the candidate respond. Take notes silently.' },
                  { step: '4', text: 'Use probe questions to fill in missing STAR components (S, T, A, or R).' },
                  { step: '5', text: 'Score the response based on completeness, specificity, and competency alignment.' },
                  { step: '6', text: 'Repeat for the next competency with a fresh question.' },
                ].map(item => (
                  <div key={item.step} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: '#1d4ed8', color: '#fff',
                      fontSize: 11, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {item.step}
                    </div>
                    <p style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.55, margin: 0 }}>{item.text}</p>
                  </div>
                ))}
              </div>

              {/* Key principle callout */}
              <div style={{
                background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                border: '1.5px solid #f59e0b', borderRadius: 12, padding: '14px 18px',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>💡</span>
                <div>
                  <p style={{ fontWeight: 800, fontSize: 13, color: '#78350f', marginBottom: 4 }}>
                    The Golden Rule of STAR
                  </p>
                  <p style={{ fontSize: 12.5, color: '#92400e', lineHeight: 1.6, margin: 0 }}>
                    You are evaluating <strong>what the candidate actually did</strong> — not what they would do, could do, or think should be done. Always redirect hypothetical responses back to a real past experience.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── DEEP DIVE TAB ── */}
          {activeTab === 'deep' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 4px', lineHeight: 1.55 }}>
                Click on each component to expand detailed interviewer guidance, probe questions, and red flags to watch for.
              </p>
              {STAR_SECTIONS.map((s, idx) => {
                const isOpen = expandedSection === idx;
                return (
                  <div key={s.letter} style={{
                    border: `1.5px solid ${isOpen ? s.color : s.borderColor}`,
                    borderRadius: 12, overflow: 'hidden',
                    transition: 'border-color 0.2s',
                  }}>
                    {/* Accordion header */}
                    <button
                      onClick={() => setExpandedSection(isOpen ? null : idx)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center',
                        gap: 12, padding: '14px 16px',
                        background: isOpen ? s.lightColor : '#fff',
                        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        textAlign: 'left', transition: 'background 0.2s',
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: s.color, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontWeight: 900, fontSize: 18, color: '#fff',
                      }}>
                        {s.letter}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: s.color }}>{s.word}</div>
                        <div style={{ fontSize: 11.5, color: '#64748b' }}>{s.tagline}</div>
                      </div>
                      <span style={{ fontSize: 18 }}>{s.icon}</span>
                      <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke={s.color} strokeWidth="2.5" strokeLinecap="round"
                        style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
                      >
                        <path d="m6 9 6 6 6-6"/>
                      </svg>
                    </button>

                    {isOpen && (
                      <div style={{ padding: '0 16px 16px', background: s.lightColor }}>
                        <p style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.6, marginBottom: 14, paddingTop: 10 }}>
                          {s.description}
                        </p>

                        {/* Interviewer Tips */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, color: s.color, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span>🎙️</span> Interviewer Tips
                          </div>
                          {s.interviewerTips.map((tip, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
                              <span style={{ color: s.color, fontWeight: 800, fontSize: 13, flexShrink: 0 }}>•</span>
                              <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, margin: 0 }}>{tip}</p>
                            </div>
                          ))}
                        </div>

                        {/* Probe Questions */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, color: s.color, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span>❓</span> Probe Questions
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {s.probeQuestions.map((q, i) => (
                              <div key={i} style={{
                                background: 'rgba(255,255,255,0.7)', border: `1px solid ${s.borderColor}`,
                                borderRadius: 8, padding: '7px 12px',
                                fontSize: 12, color: '#1e293b', fontStyle: 'italic',
                              }}>
                                {q}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Red Flags */}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 12, color: '#dc2626', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span>🚩</span> Red Flags
                          </div>
                          {s.redFlags.map((flag, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
                              <span style={{ color: '#dc2626', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>!</span>
                              <p style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.5, margin: 0 }}>{flag}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── SCORING GUIDE TAB ── */}
          {activeTab === 'scoring' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                background: '#f0f9ff', border: '1.5px solid #bae6fd',
                borderRadius: 12, padding: '12px 16px',
              }}>
                <p style={{ fontSize: 12.5, color: '#0c4a6e', lineHeight: 1.6, margin: 0 }}>
                  Scores are based on the <strong>quality and completeness of the STAR response</strong>, not on how impressive the story sounds. A modest situation with a fully articulated STAR response scores higher than an impressive-sounding but vague answer.
                </p>
              </div>

              {SCORING_GUIDE.map(item => (
                <div key={item.score} style={{
                  background: item.bg,
                  border: `1.5px solid ${item.border}`,
                  borderRadius: 12, padding: '14px 16px',
                  display: 'flex', gap: 14, alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: item.color, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    color: '#fff',
                  }}>
                    <span style={{ fontWeight: 900, fontSize: 18, lineHeight: 1 }}>{item.score}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5, color: item.color, marginBottom: 4 }}>
                      {item.label}
                    </div>
                    <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: 0 }}>
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}

              {/* Scoring matrix */}
              <div style={{
                background: '#f8fafc', border: '1.5px solid #e2e8f0',
                borderRadius: 12, padding: '16px 18px', marginTop: 4,
              }}>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#1e293b', marginBottom: 12 }}>
                  Quick Scoring Checklist
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Situation is specific and real (not hypothetical)', component: 'S' },
                    { label: 'Candidate\'s personal role is clear', component: 'T' },
                    { label: 'Actions described in concrete steps', component: 'A' },
                    { label: 'Results are measurable / quantifiable', component: 'R' },
                    { label: 'Actions match the competency being assessed', component: 'A' },
                    { label: 'Candidate shows reflection / self-awareness', component: 'R' },
                  ].map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 8, alignItems: 'flex-start',
                      background: '#fff', borderRadius: 8, padding: '8px 10px',
                      border: '1px solid #e2e8f0',
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                        background: STAR_SECTIONS.find(s => s.letter === item.component)?.color || '#64748b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 900, fontSize: 10, color: '#fff',
                      }}>
                        {item.component}
                      </div>
                      <p style={{ fontSize: 11.5, color: '#374151', lineHeight: 1.45, margin: 0 }}>{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── DO'S & DON'TS TAB ── */}
          {activeTab === 'dodont' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* DOs */}
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 10,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: '#065f46', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: 14,
                    }}>✅</div>
                    <span style={{ fontWeight: 800, fontSize: 13.5, color: '#065f46' }}>DO</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {DO_DONTS.dos.map((item, i) => (
                      <div key={i} style={{
                        background: '#ecfdf5', border: '1px solid #a7f3d0',
                        borderRadius: 8, padding: '9px 12px',
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                      }}>
                        <span style={{ color: '#065f46', fontSize: 13, flexShrink: 0, fontWeight: 800, lineHeight: 1.5 }}>✓</span>
                        <p style={{ fontSize: 12, color: '#064e3b', lineHeight: 1.5, margin: 0 }}>{item}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* DON'Ts */}
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 10,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: '#991b1b', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: 14,
                    }}>🚫</div>
                    <span style={{ fontWeight: 800, fontSize: 13.5, color: '#991b1b' }}>DON'T</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {DO_DONTS.donts.map((item, i) => (
                      <div key={i} style={{
                        background: '#fef2f2', border: '1px solid #fca5a5',
                        borderRadius: 8, padding: '9px 12px',
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                      }}>
                        <span style={{ color: '#991b1b', fontSize: 13, flexShrink: 0, fontWeight: 800, lineHeight: 1.5 }}>✕</span>
                        <p style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.5, margin: 0 }}>{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Handling difficult responses */}
              <div style={{
                background: '#fffbeb', border: '1.5px solid #fcd34d',
                borderRadius: 12, padding: '14px 18px',
              }}>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#92400e', marginBottom: 10 }}>
                  ⚡ Handling Difficult Situations
                </h3>
                {[
                  { situation: 'Candidate gives a hypothetical answer', response: 'Say: "That\'s helpful context, but could you tell me about a specific time when you actually experienced this?" Then wait.' },
                  { situation: 'Candidate goes off-topic or rambles', response: 'Gently redirect: "That\'s interesting. Let me bring you back — what did YOU specifically do in that situation?"' },
                  { situation: 'Candidate cannot think of an example', response: 'Probe further: "Take your time. Think of any situation in your career — even a small one — where you demonstrated this."' },
                  { situation: 'Candidate describes a group effort only', response: 'Ask: "I understand the team was involved. What was YOUR specific contribution or role in those actions?"' },
                  { situation: 'Response is too brief', response: 'Follow up: "Can you tell me a bit more about [A or R component]? What specifically did you do/what happened after?"' },
                ].map((item, i) => (
                  <div key={i} style={{
                    marginBottom: i < 4 ? 10 : 0,
                    borderBottom: i < 4 ? '1px solid #fde68a' : 'none',
                    paddingBottom: i < 4 ? 10 : 0,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#b45309', marginBottom: 3 }}>
                      If: {item.situation}
                    </div>
                    <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.55 }}>
                      → {item.response}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SAMPLE QUESTIONS TAB ── */}
          {activeTab === 'samples' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                background: '#f0f9ff', border: '1.5px solid #bae6fd',
                borderRadius: 12, padding: '12px 16px',
              }}>
                <p style={{ fontSize: 12.5, color: '#0c4a6e', lineHeight: 1.6, margin: 0 }}>
                  These are <strong>opening behavioral questions</strong> for common competency areas. After the candidate responds, use the probe questions from the <em>Component Deep Dive</em> tab to fill in missing STAR components.
                </p>
              </div>

              {[
                {
                  category: 'Leadership & Management',
                  color: '#312e81', bg: '#eef2ff', border: '#a5b4fc',
                  icon: '👑',
                  questions: [
                    'Tell me about a time when you had to lead a team through a significant challenge or change.',
                    'Describe a situation where you had to motivate a team member who was underperforming.',
                    'Give me an example of when you had to make a difficult decision with limited information.',
                    'Tell me about a time when you successfully built consensus among people with opposing views.',
                  ],
                },
                {
                  category: 'Planning & Organization',
                  color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0',
                  icon: '📋',
                  questions: [
                    'Tell me about a time when you had to manage multiple competing priorities simultaneously.',
                    'Describe a project where you had to create and execute a detailed work plan.',
                    'Give me an example of when your planning helped you anticipate and prevent a problem.',
                    'Tell me about a time when unexpected changes disrupted your plans and how you adapted.',
                  ],
                },
                {
                  category: 'Communication & Stakeholder Relations',
                  color: '#92400e', bg: '#fffbeb', border: '#fcd34d',
                  icon: '🗣️',
                  questions: [
                    'Tell me about a time when you had to communicate complex or technical information to a non-technical audience.',
                    'Describe a situation where you had to deliver unwelcome news or feedback to someone.',
                    'Give me an example of when you successfully managed a difficult stakeholder relationship.',
                    'Tell me about a time when miscommunication caused a problem, and how you resolved it.',
                  ],
                },
                {
                  category: 'Problem Solving & Innovation',
                  color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd',
                  icon: '🔧',
                  questions: [
                    'Tell me about a time when you identified a problem that others had overlooked.',
                    'Describe a situation where you had to find a creative solution with limited resources.',
                    'Give me an example of when you implemented a significant improvement to a process or system.',
                    'Tell me about the most complex problem you have had to solve in your career.',
                  ],
                },
                {
                  category: 'Integrity & Ethics (DENR Core Values)',
                  color: '#581c87', bg: '#faf5ff', border: '#d8b4fe',
                  icon: '⚖️',
                  questions: [
                    'Tell me about a time when you faced pressure to compromise your professional standards.',
                    'Describe a situation where you had to report or address unethical behavior in the workplace.',
                    'Give me an example of when you had to enforce a policy that was unpopular.',
                    'Tell me about a time when you had to balance competing obligations or interests while maintaining integrity.',
                  ],
                },
              ].map((cat, i) => (
                <div key={i} style={{
                  background: cat.bg, border: `1.5px solid ${cat.border}`,
                  borderRadius: 12, padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 18 }}>{cat.icon}</span>
                    <span style={{ fontWeight: 800, fontSize: 13, color: cat.color }}>{cat.category}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {cat.questions.map((q, qi) => (
                      <div key={qi} style={{
                        background: 'rgba(255,255,255,0.75)',
                        border: `1px solid ${cat.border}`,
                        borderRadius: 8, padding: '9px 12px',
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                      }}>
                        <span style={{ color: cat.color, fontWeight: 800, fontSize: 12, flexShrink: 0, lineHeight: 1.6 }}>{qi + 1}.</span>
                        <p style={{ fontSize: 12.5, color: '#1e293b', lineHeight: 1.55, margin: 0, fontStyle: 'italic' }}>
                          "{q}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* ── BEI OVERVIEW TAB ── */}
          {activeTab === 'bei_overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* What is BEI */}
              <div style={{ background: '#f5f3ff', border: '1.5px solid #c4b5fd', borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 22 }}>🎯</span>
                  <span style={{ fontWeight: 800, fontSize: 14, color: '#4c1d95' }}>What is BEI?</span>
                </div>
                <p style={{ fontSize: 13, color: '#3b0764', lineHeight: 1.7, margin: 0 }}>
                  <strong>Behavioral Event Interviewing (BEI)</strong> is a structured interview technique developed by David McClelland (Harvard, 1970s) that identifies competencies by exploring how a candidate actually handled critical events in the past. Unlike traditional interviews that ask "Can you do this?", BEI asks <em>"Tell me about a time when you DID this."</em> It is the gold standard for competency-based assessments in government and the private sector.
                </p>
              </div>

              {/* BEI vs Traditional vs STAR */}
              <div>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#1e293b', marginBottom: 10 }}>
                  BEI vs. Traditional Interview vs. STAR
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#4c1d95' }}>
                        {['Dimension', 'Traditional', 'STAR Method', 'BEI'].map((h, i) => (
                          <th key={i} style={{
                            padding: '9px 12px', color: '#fff', fontWeight: 700,
                            textAlign: 'left', borderRight: '1px solid #6d28d9',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Focus', 'Qualifications & opinions', 'Structured past behavior', 'In-depth competency evidence'],
                        ['Question type', '"What would you do if…?"', '"Tell me about a time…"', '"Tell me about a time… (then deep probing)"'],
                        ['Depth', 'Surface-level', 'Structured narrative', 'Exhaustive event analysis'],
                        ['Bias risk', 'High (gut-feel)', 'Moderate', 'Low (evidence-based)'],
                        ['Time per competency', '2–3 min', '5–8 min', '10–20 min'],
                        ['Predictive validity', 'Low (~0.10)', 'Moderate (~0.35)', 'High (~0.50–0.55)'],
                        ['Best used for', 'Initial screening', 'Panel/structured interviews', 'Key competency deep dives'],
                      ].map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#faf5ff' : '#fff' }}>
                          {row.map((cell, j) => (
                            <td key={j} style={{
                              padding: '8px 12px', color: j === 0 ? '#4c1d95' : '#374151',
                              fontWeight: j === 0 ? 700 : 400,
                              border: '1px solid #e9d5ff',
                            }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Core principles */}
              <div>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#1e293b', marginBottom: 10 }}>
                  5 Core Principles of BEI
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { n: '1', title: 'Past behavior predicts future behavior', body: 'How a person acted in a specific, real past situation is the strongest predictor of how they will act in similar future situations. This is the scientific foundation of BEI.', color: '#7c3aed' },
                    { n: '2', title: 'Specificity over generality', body: 'Generic statements ("I always communicate well") have near-zero predictive value. Only specific, verifiable behavioral events with full context provide reliable evidence.', color: '#1d4ed8' },
                    { n: '3', title: 'The interviewer controls the depth', body: 'BEI is not passive. The interviewer must actively probe until all five critical elements of the event are fully explored: Context, Challenge, Actions, Results, and Learning.', color: '#065f46' },
                    { n: '4', title: 'Emotions and thoughts are evidence', body: 'Unlike STAR which focuses on actions, BEI explicitly captures what the candidate was thinking, feeling, and wanting — revealing underlying motivations and competency drivers.', color: '#92400e' },
                    { n: '5', title: 'Multiple events required per competency', body: 'One story is a data point. Two to three events for the same competency form a pattern. A pattern is the basis for a valid competency rating.', color: '#991b1b' },
                  ].map(p => (
                    <div key={p.n} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '12px 14px',
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: p.color, color: '#fff',
                        fontWeight: 900, fontSize: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{p.n}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 12.5, color: p.color, marginBottom: 3 }}>{p.title}</div>
                        <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: 0 }}>{p.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* BEI vs STAR connection callout */}
              <div style={{ background: 'linear-gradient(135deg, #ede9fe, #dbeafe)', border: '1.5px solid #a5b4fc', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>🔗</span>
                <div>
                  <p style={{ fontWeight: 800, fontSize: 13, color: '#312e81', marginBottom: 4 }}>How STAR and BEI Work Together</p>
                  <p style={{ fontSize: 12.5, color: '#1e1b4b', lineHeight: 1.65, margin: 0 }}>
                    STAR is the <strong>structure</strong> you use to organize what you hear. BEI is the <strong>technique</strong> you use to extract it. In practice: use a BEI opening question to prompt the story, then use STAR as your mental checklist to know what to probe for. When all STAR components are filled in with specific behavioral evidence, you have conducted a successful BEI.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── BEI PROCESS TAB ── */}
          {activeTab === 'bei_process' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div style={{ background: '#f5f3ff', border: '1.5px solid #c4b5fd', borderRadius: 12, padding: '12px 16px' }}>
                <p style={{ fontSize: 12.5, color: '#3b0764', lineHeight: 1.6, margin: 0 }}>
                  A complete BEI follows a disciplined 5-phase structure. Each phase has a specific purpose — skipping phases leads to incomplete evidence and unreliable ratings.
                </p>
              </div>

              {[
                {
                  phase: '01', title: 'Preparation', time: 'Before interview',
                  color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd', icon: '📋',
                  steps: [
                    'Review the competency framework and indicators for the target position',
                    'Select 3–5 competencies to probe (prioritize those most critical to the role)',
                    'Prepare one opening BEI question per competency',
                    'Prepare 3–4 probe questions per competency in case the candidate\'s story is incomplete',
                    'Review the candidate\'s application materials (but do NOT form premature judgments)',
                    'Set up a quiet, private, distraction-free interview space',
                    'Inform the candidate in advance that the interview will use a structured behavioral format',
                  ],
                  tip: 'Never improvise your questions during a BEI. Prepared questions ensure consistency across all candidates and reduce interviewer bias.',
                },
                {
                  phase: '02', title: 'Opening & Rapport', time: '5–10 minutes',
                  color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7', icon: '🤝',
                  steps: [
                    'Welcome the candidate and introduce all panel members',
                    'Explain the interview format: "We will be asking you about specific past situations."',
                    'Normalize the process: "There are no right or wrong answers — we are interested in your real experiences."',
                    'Explain note-taking: "I will be taking notes so I can accurately capture your responses."',
                    'Set expectations on time: "We have about [X] minutes. I may need to redirect us to stay on track."',
                    'Ask a brief warm-up question (current role, how long in government service) to ease tension',
                  ],
                  tip: 'The opening sets psychological safety. A nervous candidate produces shorter, less detailed responses. Take 2 extra minutes here to save 10 minutes of probing later.',
                },
                {
                  phase: '03', title: 'Core BEI Questioning', time: '30–60 minutes',
                  color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', icon: '🔍',
                  steps: [
                    'Ask the opening BEI question for the first competency',
                    'Allow the candidate to respond fully without interruption',
                    'Mentally check which STAR components are present in their response',
                    'Probe for any missing or thin components using BEI probe techniques',
                    'Explicitly capture: What were you thinking? What were you feeling? What did YOU decide to do?',
                    'Confirm the outcome and ask for the candidate\'s reflection/learning',
                    'When the event is fully explored, move to the next competency',
                    'If time allows, ask for a second event per critical competency',
                  ],
                  tip: 'Do not move to the next competency until you have a complete S-T-A-R narrative with the candidate\'s thoughts and feelings included. Incomplete events produce unreliable scores.',
                },
                {
                  phase: '04', title: 'Closing', time: '5 minutes',
                  color: '#92400e', bg: '#fffbeb', border: '#fcd34d', icon: '🎬',
                  steps: [
                    'Summarize what was covered: "We have discussed [X] competencies today."',
                    'Ask if the candidate has anything to add',
                    'Thank the candidate for their time and openness',
                    'Explain next steps in the selection process',
                    'Do NOT give any feedback on their performance at this stage',
                    'Remain neutral and consistent — your expression and tone should not signal approval or concern',
                  ],
                  tip: 'Never hint at how well the candidate performed during the closing. Any verbal or nonverbal signal can affect the candidate\'s behavior in remaining stages of the selection.',
                },
                {
                  phase: '05', title: 'Scoring & Documentation', time: 'Immediately after',
                  color: '#991b1b', bg: '#fef2f2', border: '#fca5a5', icon: '📝',
                  steps: [
                    'Score each competency immediately after the interview (memory fades quickly)',
                    'Use only behavioral evidence from the interview — not impressions, appearance, or credentials',
                    'For each competency, identify: (a) the event used, (b) specific behaviors observed, (c) score assigned, (d) rationale',
                    'If the panel disagrees on a score, discuss the specific behavioral evidence — not general impressions',
                    'Document at least one behavioral anchor per rating level claimed',
                    'Flag any competencies where insufficient evidence was gathered for a reliable score',
                  ],
                  tip: 'Scores without behavioral evidence are indefensible. If challenged (e.g., CSC appeal), you must be able to cite specific things the candidate said or did that justified each rating.',
                },
              ].map((ph, i) => (
                <div key={i} style={{ border: `1.5px solid ${ph.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: ph.bg, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: ph.color, color: '#fff', fontWeight: 900, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {ph.phase}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5, color: ph.color }}>{ph.icon} Phase {ph.phase}: {ph.title}</div>
                      <div style={{ fontSize: 11, color: ph.color, opacity: 0.8, fontWeight: 600 }}>{ph.time}</div>
                    </div>
                  </div>
                  <div style={{ padding: '12px 16px', background: '#fff' }}>
                    {ph.steps.map((s, si) => (
                      <div key={si} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                        <span style={{ color: ph.color, fontWeight: 800, fontSize: 13, flexShrink: 0 }}>✓</span>
                        <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.55, margin: 0 }}>{s}</p>
                      </div>
                    ))}
                    <div style={{ marginTop: 10, background: ph.bg, border: `1px solid ${ph.border}`, borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>💡</span>
                      <p style={{ fontSize: 11.5, color: ph.color, lineHeight: 1.55, margin: 0, fontStyle: 'italic' }}>{ph.tip}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── BEI PROBING TECHNIQUES TAB ── */}
          {activeTab === 'bei_probing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#f5f3ff', border: '1.5px solid #c4b5fd', borderRadius: 12, padding: '12px 16px' }}>
                <p style={{ fontSize: 12.5, color: '#3b0764', lineHeight: 1.6, margin: 0 }}>
                  Probing is what separates a trained BEI interviewer from an untrained one. The goal is to exhaust the behavioral event — not just confirm it. Use these techniques when a candidate's story is incomplete, vague, or shifts toward the hypothetical.
                </p>
              </div>

              {/* The 5 BEI Elements */}
              <div>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#1e293b', marginBottom: 10 }}>
                  The 5 Elements BEI Probes For (Beyond STAR)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Situation / Context', desc: 'What was happening? Who was involved? What were the stakes?', color: '#1d4ed8' },
                    { label: 'Task / Role', desc: 'What was YOUR specific responsibility? What were you expected to deliver?', color: '#065f46' },
                    { label: 'Actions taken', desc: 'Step-by-step, what did YOU specifically do? Why those actions?', color: '#7c3aed' },
                    { label: 'Thoughts & Feelings', desc: 'What were you thinking at the time? What did you want to achieve?', color: '#92400e' },
                    { label: 'Results & Learning', desc: 'What happened? What did you learn? What would you do differently?', color: '#991b1b' },
                  ].map((el, i) => (
                    <div key={i} style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: el.color, marginBottom: 4 }}>{el.label}</div>
                      <p style={{ fontSize: 11.5, color: '#374151', lineHeight: 1.5, margin: 0 }}>{el.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Probing techniques */}
              <div>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#1e293b', marginBottom: 10 }}>
                  Core BEI Probing Techniques
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    {
                      tech: 'The Funnel Probe', icon: '🔽',
                      color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd',
                      desc: 'Start broad, then narrow down to specific behaviors. Used to open an event.',
                      examples: [
                        '"Tell me about a time when you led a significant change in your office."',
                        '"What was the specific change you were leading?"',
                        '"What did YOU personally do to initiate it?"',
                      ],
                    },
                    {
                      tech: 'The Thought/Feeling Probe', icon: '💭',
                      color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd',
                      desc: 'Surfaces the candidate\'s internal state — a unique BEI element not present in basic STAR.',
                      examples: [
                        '"What were you thinking when that happened?"',
                        '"How did you feel when your supervisor pushed back?"',
                        '"What did you most want to achieve in that moment?"',
                        '"What concerned you most at that point?"',
                      ],
                    },
                    {
                      tech: 'The Clarification Probe', icon: '❓',
                      color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7',
                      desc: 'Clears up ambiguous pronouns, vague timeframes, or unclear ownership.',
                      examples: [
                        '"When you say \'we,\' what specifically did YOU do?"',
                        '"You mentioned \'managing the situation\' — what exactly did that involve?"',
                        '"How long ago did this happen? Was this in your current role?"',
                      ],
                    },
                    {
                      tech: 'The Completeness Probe', icon: '🧩',
                      color: '#92400e', bg: '#fffbeb', border: '#fcd34d',
                      desc: 'Used when a STAR component is missing. Fills gaps without leading the candidate.',
                      examples: [
                        '"You\'ve described the situation well — what was YOUR specific task or role in it?"',
                        '"You\'ve told me what happened — what were the actual results or outcomes?"',
                        '"What did you learn from that experience?"',
                      ],
                    },
                    {
                      tech: 'The Redirect Probe', icon: '↩️',
                      color: '#581c87', bg: '#faf5ff', border: '#d8b4fe',
                      desc: 'Brings the candidate back when they give hypothetical, general, or off-topic responses.',
                      examples: [
                        '"That\'s helpful context. Can you give me a specific example of when you actually did that?"',
                        '"I want to make sure I understand — are you describing something that actually happened, or what you would typically do?"',
                        '"Let\'s focus on one specific event. Which situation comes to mind most clearly?"',
                      ],
                    },
                    {
                      tech: 'The Depth Probe', icon: '⛏️',
                      color: '#991b1b', bg: '#fef2f2', border: '#fca5a5',
                      desc: 'Pushes for more detail on a key action or decision. Used when the candidate skips over critical steps.',
                      examples: [
                        '"You mentioned you \'coordinated with stakeholders\' — walk me through exactly how you did that."',
                        '"What was the hardest part of that decision for you?"',
                        '"What specific obstacles did you encounter, and how did you handle each one?"',
                      ],
                    },
                  ].map((t, i) => (
                    <div key={i} style={{ border: `1.5px solid ${t.border}`, borderRadius: 12 }}>
                      <div style={{ background: t.bg, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{t.icon}</span>
                        <div>
                          <span style={{ fontWeight: 800, fontSize: 13, color: t.color }}>{t.tech}</span>
                          <p style={{ fontSize: 11.5, color: t.color, opacity: 0.85, margin: '2px 0 0', lineHeight: 1.4 }}>{t.desc}</p>
                        </div>
                      </div>
                      <div style={{ padding: '10px 14px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {t.examples.map((ex, ei) => (
                          <div key={ei} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 7, padding: '6px 10px', fontSize: 12, color: '#1e293b', fontStyle: 'italic' }}>
                            {ex}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Probing don'ts */}
              <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 12, padding: '14px 18px' }}>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#991b1b', marginBottom: 10 }}>🚫 Probing Pitfalls to Avoid</h3>
                {[
                  { bad: 'Leading probes', example: '"You handled that professionally, didn\'t you?"', fix: 'Keep probes neutral and open-ended.' },
                  { bad: 'Double-barreled probes', example: '"What did you do and what did you learn?"', fix: 'Ask one thing at a time.' },
                  { bad: 'Closed probes', example: '"So you talked to your supervisor about it?"', fix: 'Use open probes: "What did you do next?"' },
                  { bad: 'Sharing your own experiences', example: '"I would have done the same thing in your position."', fix: 'Stay neutral. Never compare.' },
                  { bad: 'Accepting generalities', example: 'Moving on after: "I always make sure to communicate clearly."', fix: 'Always redirect to a specific event.' },
                ].map((p, i) => (
                  <div key={i} style={{ marginBottom: i < 4 ? 10 : 0, paddingBottom: i < 4 ? 10 : 0, borderBottom: i < 4 ? '1px solid #fecaca' : 'none' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#991b1b', marginBottom: 2 }}>❌ {p.bad}</div>
                    <div style={{ fontSize: 11.5, color: '#7f1d1d', fontStyle: 'italic', marginBottom: 3 }}>Example: {p.example}</div>
                    <div style={{ fontSize: 12, color: '#065f46', fontWeight: 600 }}>✓ Fix: {p.fix}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── BEI SCORING TAB ── */}
          {activeTab === 'bei_scoring' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#f5f3ff', border: '1.5px solid #c4b5fd', borderRadius: 12, padding: '12px 16px' }}>
                <p style={{ fontSize: 12.5, color: '#3b0764', lineHeight: 1.6, margin: 0 }}>
                  BEI scoring is evidence-based. Every score must be traceable to specific behavioral evidence from the interview. The table below maps behavioral indicators to rating levels under the CBS competency framework.
                </p>
              </div>

              {/* Evidence standard */}
              <div>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#1e293b', marginBottom: 10 }}>The Evidence Standard</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    { level: 'Strong Evidence', icon: '✅', color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7', desc: 'Specific, detailed event with full STAR components, including thoughts/feelings. Multiple events show a consistent pattern.' },
                    { level: 'Moderate Evidence', icon: '⚠️', color: '#92400e', bg: '#fffbeb', border: '#fcd34d', desc: 'One complete event with most STAR components present. Some probing required. Results not fully quantified.' },
                    { level: 'Weak / No Evidence', icon: '❌', color: '#991b1b', bg: '#fef2f2', border: '#fca5a5', desc: 'No specific event, only generalities. Hypothetical responses only. Missing critical STAR components despite probing.' },
                  ].map((e, i) => (
                    <div key={i} style={{ background: e.bg, border: `1.5px solid ${e.border}`, borderRadius: 10, padding: '12px 12px' }}>
                      <div style={{ fontSize: 20, marginBottom: 5 }}>{e.icon}</div>
                      <div style={{ fontWeight: 800, fontSize: 12, color: e.color, marginBottom: 5 }}>{e.level}</div>
                      <p style={{ fontSize: 11.5, color: '#374151', lineHeight: 1.5, margin: 0 }}>{e.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* BEI-specific rating scale */}
              <div>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#1e293b', marginBottom: 10 }}>
                  BEI Rating Scale with Behavioral Anchors
                </h3>
                {[
                  {
                    score: 5, label: 'Distinguished', color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7',
                    anchors: [
                      'Candidate provided 2+ fully detailed behavioral events without prompting',
                      'All 5 BEI elements present: Context, Task, Actions, Thoughts/Feelings, Results',
                      'Actions demonstrate competency at a level significantly exceeding the target position',
                      'Results are measurable, impactful, and clearly attributed to the candidate',
                      'Candidate showed strong self-awareness and transferable learning',
                    ],
                  },
                  {
                    score: 4, label: 'Exceeds Expectations', color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd',
                    anchors: [
                      'One complete behavioral event provided with minimal probing needed',
                      'Thoughts/feelings element present but may be brief',
                      'Actions clearly demonstrate the competency at the expected level',
                      'Results present and reasonably specific; minor gaps in quantification',
                      'Candidate can reflect and articulate learning from the experience',
                    ],
                  },
                  {
                    score: 3, label: 'Meets Expectations', color: '#92400e', bg: '#fffbeb', border: '#fcd34d',
                    anchors: [
                      'One behavioral event provided but required moderate probing to complete',
                      'Most STAR components present; thoughts/feelings element thin or absent',
                      'Actions demonstrate the competency but at a basic or developing level',
                      'Results are present but vague or not quantified',
                      'Limited reflection or learning expressed',
                    ],
                  },
                  {
                    score: 2, label: 'Below Expectations', color: '#b45309', bg: '#fff7ed', border: '#fdba74',
                    anchors: [
                      'Partial behavioral event only; significant probing required',
                      'Candidate frequently shifted to hypothetical or general responses',
                      'Actions vague, unclear, or not clearly personal (overuse of "we")',
                      'Results absent or entirely unmeasured',
                      'No reflection or learning expressed',
                    ],
                  },
                  {
                    score: 1, label: 'Unsatisfactory', color: '#991b1b', bg: '#fef2f2', border: '#fca5a5',
                    anchors: [
                      'No specific behavioral event provided despite repeated probing',
                      'Candidate responded only with opinions, generalities, or hypotheticals',
                      'No personal actions described — only team or organizational actions',
                      'No results or outcomes mentioned',
                      'No evidence of the competency being demonstrated',
                    ],
                  },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, background: r.bg, border: `1.5px solid ${r.border}`, borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: r.color, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontWeight: 900, fontSize: 17, lineHeight: 1 }}>{r.score}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: r.color, marginBottom: 6 }}>{r.label}</div>
                      {r.anchors.map((a, ai) => (
                        <div key={ai} style={{ display: 'flex', gap: 7, marginBottom: 4 }}>
                          <span style={{ color: r.color, fontSize: 11, flexShrink: 0, fontWeight: 800, lineHeight: 1.7 }}>•</span>
                          <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.55, margin: 0 }}>{a}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Panel consensus */}
              <div style={{ background: '#f0f9ff', border: '1.5px solid #7dd3fc', borderRadius: 12, padding: '14px 18px' }}>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#0c4a6e', marginBottom: 10 }}>👥 Panel Scoring & Consensus</h3>
                {[
                  'Each rater scores independently BEFORE discussing with the panel — prevents anchoring bias.',
                  'Disclose individual scores simultaneously (e.g., using cards or written sheets).',
                  'For scores within 1 point of each other: average the scores.',
                  'For scores 2 or more points apart: each rater must cite specific behavioral evidence for their score, then re-evaluate.',
                  'The final score must be justified by behavioral evidence — not by seniority or social pressure.',
                  'Document the rationale for the final score, especially when panel members disagreed.',
                ].map((rule, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <span style={{ color: '#0369a1', fontWeight: 800, fontSize: 12, flexShrink: 0, lineHeight: 1.7 }}>{i + 1}.</span>
                    <p style={{ fontSize: 12, color: '#0c4a6e', lineHeight: 1.55, margin: 0 }}>{rule}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── BEI ETHICS & BIAS TAB ── */}
          {activeTab === 'bei_ethics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#faf5ff', border: '1.5px solid #d8b4fe', borderRadius: 12, padding: '12px 16px' }}>
                <p style={{ fontSize: 12.5, color: '#3b0764', lineHeight: 1.6, margin: 0 }}>
                  Even structured interviews like BEI are vulnerable to cognitive bias. Understanding and actively managing these biases is part of every rater's professional obligation under the CSC Merit Selection process.
                </p>
              </div>

              {/* Common biases */}
              <div>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#1e293b', marginBottom: 10 }}>
                  Common Interviewer Biases in BEI
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {[
                    { bias: 'Halo Effect', icon: '😇', color: '#7c3aed', desc: 'One strong response causes the rater to inflate scores for all subsequent competencies.', mitigation: 'Score each competency independently, immediately after its response. Do not let early impressions carry over.' },
                    { bias: 'Horns Effect', icon: '😈', color: '#991b1b', desc: 'One weak response causes the rater to deflate all subsequent scores.', mitigation: 'Same as above — score competency by competency, based solely on the evidence for that specific competency.' },
                    { bias: 'Similar-to-Me Bias', icon: '🪞', color: '#1d4ed8', desc: 'Raters unconsciously favor candidates who share their background, style, alma mater, or values.', mitigation: 'Ask: "Is my rating based on what they DID or how much they remind me of myself?" Focus only on behavioral evidence.' },
                    { bias: 'Contrast Effect', icon: '⚖️', color: '#065f46', desc: 'Rating a candidate relative to the previous one rather than against the competency standard.', mitigation: 'Always score against the rubric, not against other candidates. Review the anchors before each interview.' },
                    { bias: 'Attribution Bias', icon: '🎯', color: '#92400e', desc: 'Attributing success to the candidate\'s character but failure to external circumstances (or vice versa).', mitigation: 'Probe consistently for both successes and challenges. Ask what the candidate did — not why things turned out as they did.' },
                    { bias: 'First Impression / Primacy', icon: '⏱️', color: '#581c87', desc: 'The first story shared has a disproportionate impact on the overall assessment.', mitigation: 'Use a structured scoring form. Record evidence for each competency separately. Finalize scores at the end of each section, not the end of the interview.' },
                    { bias: 'Leniency / Strictness Bias', icon: '📏', color: '#0c4a6e', desc: 'Some raters consistently score too high (wanting to avoid conflict) or too low (being overly critical).', mitigation: 'Calibrate with co-raters before the interview. Use behavioral anchors. Justify every score above 3 or below 3 with specific evidence.' },
                  ].map((b, i) => (
                    <div key={i} style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', background: '#f8fafc' }}>
                        <span style={{ fontSize: 20 }}>{b.icon}</span>
                        <span style={{ fontWeight: 800, fontSize: 13, color: b.color }}>{b.bias}</span>
                      </div>
                      <div style={{ padding: '10px 14px', background: '#fff' }}>
                        <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.55, margin: '0 0 6px' }}>{b.desc}</p>
                        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', background: '#f0fdf4', borderRadius: 7, padding: '6px 10px', border: '1px solid #bbf7d0' }}>
                          <span style={{ color: '#065f46', fontSize: 12, fontWeight: 800, flexShrink: 0, lineHeight: 1.6 }}>✓</span>
                          <p style={{ fontSize: 12, color: '#064e3b', lineHeight: 1.55, margin: 0 }}><strong>Mitigation:</strong> {b.mitigation}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Legal & ethical obligations */}
              <div style={{ background: '#fff7ed', border: '1.5px solid #fdba74', borderRadius: 12, padding: '14px 18px' }}>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#92400e', marginBottom: 10 }}>
                  ⚖️ Legal & Ethical Obligations of BEI Raters
                </h3>
                {[
                  { title: 'Confidentiality', body: 'All interview content — questions asked, answers given, scores assigned — is strictly confidential. Disclosure to non-panel members or candidates is a violation of CSC rules and DENR MSPP.' },
                  { title: 'Non-discrimination', body: 'Questions must be competency-relevant. Never ask about age, civil status, pregnancy, religion, political affiliation, or disability unless directly required by the position (with proper CSC authority).' },
                  { title: 'Consistency', body: 'The same competencies must be assessed for all candidates applying for the same position. Varying the questions or competencies assessed across candidates invalidates the process.' },
                  { title: 'Documentation', body: 'All scoring sheets, behavioral notes, and rationales must be preserved as part of the official selection record. These documents are subject to CSC audit and Freedom of Information (FOI) requests.' },
                  { title: 'Conflict of interest', body: 'A rater who has a personal or professional relationship with a candidate that could affect objectivity must declare this and recuse themselves from that candidate\'s interview.' },
                  { title: 'Independence', body: 'Raters must not discuss their scores or assessments with each other BEFORE independent scoring is completed. Premature discussion introduces social bias and undermines the integrity of the panel.' },
                ].map((item, i) => (
                  <div key={i} style={{ marginBottom: i < 5 ? 10 : 0, paddingBottom: i < 5 ? 10 : 0, borderBottom: i < 5 ? '1px solid #fed7aa' : 'none' }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: '#92400e', marginBottom: 3 }}>{item.title}</div>
                    <p style={{ fontSize: 12, color: '#7c2d12', lineHeight: 1.6, margin: 0 }}>{item.body}</p>
                  </div>
                ))}
              </div>

              {/* Self-check before scoring */}
              <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, padding: '14px 18px' }}>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#065f46', marginBottom: 10 }}>
                  ✅ Rater Self-Check Before Submitting Scores
                </h3>
                {[
                  'Is my score based on specific behavioral evidence from THIS interview, not my pre-existing impression of the candidate?',
                  'Can I cite at least one specific thing the candidate SAID OR DID that justifies each score?',
                  'Did I probe sufficiently before concluding that evidence was absent?',
                  'Am I scoring against the competency rubric — not against other candidates I have interviewed?',
                  'Have I checked for halo or horns effect by reviewing each competency score independently?',
                  'Am I confident that my score would withstand a CSC review or formal appeal?',
                ].map((q, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: '2px solid #16a34a', flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 12, color: '#064e3b', lineHeight: 1.55, margin: 0 }}>{q}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
        <div style={{
          flexShrink: 0, padding: '10px 20px',
          borderTop: '1.5px solid #e2e8f0',
          background: '#f8fafc',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderRadius: '0 0 16px 16px',
        }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            STAR & BEI Interview Guide · For Authorized Raters Only · DENR CBS System 2025
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px', borderRadius: 8,
              background: '#1d4ed8', color: '#fff',
              border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const Dashboard = ({ user, onLogout }) => {
  const [users, setUsers] = useState([]);
  const [userSelectionModal, setUserSelectionModal] = useState(false);
  const [passwordChangeModal, setPasswordChangeModal] = useState({
    isOpen: false,
    user: null
  });
  const [successMessage, setSuccessMessage] = useState('');
  const [creatorModalOpen, setCreatorModalOpen] = useState(false);
  const [logoutConfirmModalOpen, setLogoutConfirmModalOpen] = useState(false);
  const [starGuideOpen, setStarGuideOpen] = useState(false);

  useEffect(() => {
    if (user.userType === USER_TYPES.ADMIN) {
      fetchUsers();
    }
  }, [user.userType]);

  const fetchUsers = async () => {
    try {
      const userData = await usersAPI.getAll();
      setUsers(userData);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleLogout = () => {
    const hasUnsavedRatings = user.userType === USER_TYPES.RATER && 
      sessionStorage.getItem(`rater_${user._id}_hasUnsavedRatings`) === 'true';
    
    if (hasUnsavedRatings) {
      setLogoutConfirmModalOpen(true);
    } else {
      performLogout();
    }
  };

  const performLogout = () => {
    localStorage.removeItem(`rater_${user._id}_selectedAssignment`);
    localStorage.removeItem(`rater_${user._id}_selectedPosition`);
    localStorage.removeItem(`rater_${user._id}_selectedItemNumber`);
    localStorage.removeItem(`rater_${user._id}_selectedCandidate`);
    localStorage.removeItem(`secretariat_${user._id}_selectedAssignment`);
    localStorage.removeItem(`secretariat_${user._id}_selectedPosition`);
    localStorage.removeItem(`secretariat_${user._id}_selectedItemNumber`);
    localStorage.removeItem(`secretariat_${user._id}_selectedCandidate`);
    localStorage.removeItem(`admin_${user._id}_activeTab`);
    sessionStorage.removeItem(`rater_${user._id}_hasUnsavedRatings`);
    onLogout();
  };

  const handleOpenUserSelection = () => setUserSelectionModal(true);
  const handleCloseUserSelection = () => setUserSelectionModal(false);

  const handleSelectUser = (selectedUser) => {
    setPasswordChangeModal({ isOpen: true, user: selectedUser });
  };

  const handleClosePasswordModal = () => {
    setPasswordChangeModal({ isOpen: false, user: null });
  };

  const handlePasswordChangeSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 5000);
  };

  const renderContent = () => {
    switch (user.userType) {
      case USER_TYPES.RATER:
        return <RaterView user={user} />;
      case USER_TYPES.SECRETARIAT:
        return <SecretariatView user={user} />;
      case USER_TYPES.ADMIN:
        return <AdminView user={user} />;
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">Access Denied</h2>
              <p className="text-gray-600">Invalid user type</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="navbar sticky top-0 z-50 shadow-md">
        <div className="navbar-title-container">
          <img
            src="https://github.com/xhrissun/rhrmpsb-system/blob/main/denr-logo.png?raw=true"
            alt="DENR Logo"
            className="w-6 h-6 mr-1 object-contain"
            onError={(e) => {
              e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjRjNGNEY2Ii8+Cjwvc3ZnPg==';
            }}
          />
          <h1 className="navbar-title">The DENR CALABARZON Competency-Based Rating System</h1>
          <span className="navbar-user-type">
            {user.userType.charAt(0).toUpperCase() + user.userType.slice(1)}
          </span>
        </div>
        <div className="navbar-buttons">
          <span className="navbar-welcome">
            {user.name}
          </span>
          <button
            onClick={() => setCreatorModalOpen(true)}
            className="navbar-button bg-blue-600 text-white hover:bg-blue-700"
            title="About the Developer"
          >
            About
          </button>
          <GuidesDropdown />
          {/* Interview Guide (STAR + BEI) — raters only */}
          {user.userType === USER_TYPES.RATER && (
            <button
              onClick={() => setStarGuideOpen(true)}
              className="navbar-button text-white"
              style={{ background: '#7c3aed' }}
              title="STAR & BEI Interview Guide"
            >
              🎯 Interview Guide
            </button>
          )}
          {user.userType === USER_TYPES.ADMIN && (
            <button
              onClick={handleOpenUserSelection}
              className="navbar-button bg-orange-600 text-white hover:bg-orange-700"
              title="Change user password"
            >
              Password
            </button>
          )}
          <button
            onClick={handleLogout}
            className="navbar-button btn-secondary"
          >
            Logout
          </button>
        </div>
      </nav>

      {successMessage && (
        <div className="mx-6 mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex">
            <svg className="flex-shrink-0 h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-green-700 font-medium">
                {successMessage}
              </p>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  onClick={() => setSuccessMessage('')}
                  className="inline-flex bg-green-50 rounded-md p-1.5 text-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-green-50 focus:ring-green-600"
                >
                  <span className="sr-only">Dismiss</span>
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="p-6">
        {renderContent()}
      </main>

      <CreatorProfileModal
        isOpen={creatorModalOpen}
        onClose={() => setCreatorModalOpen(false)}
      />

      <UserSelectionModal
        isOpen={userSelectionModal}
        onClose={handleCloseUserSelection}
        users={users}
        onSelectUser={handleSelectUser}
      />

      <PasswordChangeModal
        isOpen={passwordChangeModal.isOpen}
        onClose={handleClosePasswordModal}
        selectedUser={passwordChangeModal.user}
        onSuccess={handlePasswordChangeSuccess}
      />

      {/* STAR Guide Modal — raters only */}
      {user.userType === USER_TYPES.RATER && (
        <STARGuideModal
          isOpen={starGuideOpen}
          onClose={() => setStarGuideOpen(false)}
        />
      )}

      {logoutConfirmModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-orange-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-4">Confirm Logout</h3>
              <p className="text-lg text-gray-600 mb-6">
                You have unsubmitted ratings that will be lost if you logout now. Are you sure you want to continue?
              </p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setLogoutConfirmModalOpen(false)}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 text-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={performLogout}
                  className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 text-lg font-semibold"
                >
                  Logout Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Guides Dropdown Component
const GuidesDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const guides = [
    {
      name: 'MSPP',
      fullName: 'DENR Merit Selection and Promotion Plan',
      url: 'https://drive.google.com/file/d/1YhjcPs2o37592n9-a14YEHbWcx36yMdY/view?usp=sharing'
    },
    {
      name: 'ORAOHRA',
      fullName: '2025 Omnibus Rules on Human Resources and Other Human Resource Actions',
      url: 'https://drive.google.com/file/d/1osaiwsNm5KRBxKYDl7dXcrSITKOi-2JD/view?usp=sharing'
    },
    {
      name: 'SRP',
      fullName: '2025 System of Ranking Positions',
      url: 'https://drive.google.com/file/d/1jwSut541U2V6fRrPPvcMO1wFMj9tK-2T/view?usp=sharing'
    }
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="navbar-button bg-green-600 text-white hover:bg-green-700 flex items-center gap-1"
        title="View Guides"
      >
        Guides
        <svg 
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
          {guides.map((guide, index) => (
            <a
              key={index}
              href={guide.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-3 hover:bg-gray-50 transition-colors border-b last:border-b-0 border-gray-100"
              onClick={() => setIsOpen(false)}
            >
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-sm">{guide.name}</div>
                  <div className="text-xs text-gray-600 mt-0.5 leading-tight">{guide.fullName}</div>
                </div>
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
