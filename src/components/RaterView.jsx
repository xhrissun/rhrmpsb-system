import React, { useState, useEffect, useRef } from 'react';
import usePersistedState from '../utils/usePersistedState';
import { vacanciesAPI, candidatesAPI, ratingsAPI, competenciesAPI, authAPI } from '../utils/api';
import { calculateRatingScores, formatDate } from '../utils/helpers';
import { RATING_SCALE, COMPETENCY_TYPES, CANDIDATE_STATUS } from '../utils/constants';
import { useToast } from '../utils/ToastContext';
import CompetencyDetailModal from './CompetencyDetailModal';
// ✅ Pre-load PDF parser on mount
import { ensureParsed, isPDFAvailable } from '../lib/pdfParserCache.js';

// ─── Skeleton / Loading Components ───────────────────────────────────────────

const shimmerKeyframes = `
  @keyframes rater-shimmer {
    0%   { background-position: -600px 0; }
    100% { background-position:  600px 0; }
  }
  @keyframes rater-fade-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0);   }
  }
  @keyframes rater-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes rater-pulse-ring {
    0%   { transform: scale(0.85); opacity: 0.7; }
    50%  { transform: scale(1.05); opacity: 0.3; }
    100% { transform: scale(0.85); opacity: 0.7; }
  }
  @keyframes rater-progress {
    0%   { width: 0%; }
    100% { width: 100%; }
  }
  @keyframes rater-bounce {
    0%, 80%, 100% { transform: translateY(0);   }
    40%           { transform: translateY(-8px); }
  }
`;

const shimmerStyle = {
  background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
  backgroundSize: '600px 100%',
  animation: 'rater-shimmer 1.4s ease-in-out infinite',
};

function SkeletonBlock({ width = '100%', height = 16, radius = 8, style = {} }) {
  return (
    <div style={{
      ...shimmerStyle,
      width, height, borderRadius: radius,
      ...style,
    }} />
  );
}

function RaterLoadingScreen({ pdfStatus, pdfProgress = 0, pdfMsg = '' }) {
  const steps = [
    { id: 'vacancies', label: 'Loading vacancies',   icon: '📋' },
    { id: 'pdf',       label: 'Parsing CBS Manual',  icon: '📖' },
    { id: 'ready',     label: 'Preparing interface', icon: '✨' },
  ];

  // Derive step completion from pdfStatus
  const vacanciesDone = pdfStatus !== 'idle';
  const pdfDone       = pdfStatus === 'done' || pdfStatus === 'error' || pdfStatus === 'unavailable';
  const readyDone     = false;

  const statuses = [vacanciesDone, pdfDone, readyDone];
  const showPdfProgress = pdfStatus === 'parsing' && pdfProgress > 0;

  return (
    <>
      <style>{shimmerKeyframes}</style>
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(145deg, #f8fafc 0%, #eef2f7 100%)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}>
        {/* Top header skeleton */}
        <div style={{
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '18px 24px',
          textAlign: 'center',
          animation: 'rater-fade-in 0.4s ease both',
        }}>
          <SkeletonBlock width={320} height={14} radius={7} style={{ margin: '0 auto 10px' }} />
          <SkeletonBlock width={440} height={22} radius={8} style={{ margin: '0 auto 8px' }} />
          <SkeletonBlock width={200} height={13} radius={6} style={{ margin: '0 auto' }} />
        </div>

        <div style={{
          maxWidth: 720,
          width: '100%',
          margin: '40px auto',
          padding: '0 20px',
        }}>
          {/* Central loading card */}
          <div style={{
            background: '#fff',
            borderRadius: 20,
            boxShadow: '0 4px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
            overflow: 'hidden',
            animation: 'rater-fade-in 0.5s ease 0.1s both',
          }}>
            {/* Card header with logo area */}
            <div style={{
              background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 60%, #1a4a7a 100%)',
              padding: '32px 40px',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Decorative rings */}
              <div style={{
                position: 'absolute', top: -40, right: -40,
                width: 160, height: 160, borderRadius: '50%',
                background: 'rgba(255,255,255,0.04)',
                animation: 'rater-pulse-ring 3s ease-in-out infinite',
              }} />
              <div style={{
                position: 'absolute', bottom: -30, left: -30,
                width: 120, height: 120, borderRadius: '50%',
                background: 'rgba(255,255,255,0.03)',
                animation: 'rater-pulse-ring 3.5s ease-in-out 0.5s infinite',
              }} />

              {/* Spinner */}
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
                <div style={{
                  width: 56, height: 56,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26,
                }}>
                  🏛️
                </div>
                <svg
                  width={72} height={72}
                  viewBox="0 0 72 72"
                  style={{
                    position: 'absolute',
                    top: -8, left: -8,
                    animation: 'rater-spin 1.2s linear infinite',
                  }}
                >
                  <circle cx="36" cy="36" r="32"
                    fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3"/>
                  <path
                    d="M 36 4 A 32 32 0 0 1 68 36"
                    fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </div>

              <h2 style={{ margin: '0 0 6px', color: '#fff', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
                RHRMPSB Rating System
              </h2>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
                Initializing your workspace…
              </p>
            </div>

            {/* Steps */}
            <div style={{ padding: '28px 40px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 32 }}>
                {steps.map((step, idx) => {
                  const done    = statuses[idx];
                  const active  = !done && (idx === 0 || statuses[idx - 1]);
                  return (
                    <div
                      key={step.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '12px 16px', borderRadius: 12,
                        background: done ? '#f0fdf4' : active ? '#eff6ff' : '#fafafa',
                        border: `1.5px solid ${done ? '#bbf7d0' : active ? '#bfdbfe' : '#f0f0f0'}`,
                        transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)',
                        animation: `rater-fade-in 0.4s ease ${idx * 120}ms both`,
                      }}
                    >
                      {/* Status icon */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: done ? '#22c55e' : active ? '#3b82f6' : '#e5e7eb',
                        transition: 'background 0.3s',
                        fontSize: done ? 16 : 17,
                      }}>
                        {done ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        ) : active ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'rater-spin 0.8s linear infinite' }}>
                            <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5"/>
                            <path d="M12 3a9 9 0 0 1 9 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
                          </svg>
                        ) : (
                          <span style={{ fontSize: 16 }}>{step.icon}</span>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          margin: 0, fontSize: 14, fontWeight: 600,
                          color: done ? '#15803d' : active ? '#1d4ed8' : '#9ca3af',
                          transition: 'color 0.3s',
                        }}>
                          {step.label}
                          {active && step.id === 'pdf' && showPdfProgress && (
                            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace' }}>
                              {pdfProgress}%
                            </span>
                          )}
                        </p>
                        {active && step.id === 'pdf' && (
                          <>
                            {showPdfProgress ? (
                              <>
                                {/* Real progress bar */}
                                <div style={{
                                  marginTop: 7, height: 5, background: '#dbeafe',
                                  borderRadius: 99, overflow: 'hidden',
                                }}>
                                  <div style={{
                                    height: '100%', borderRadius: 99,
                                    width: `${pdfProgress}%`,
                                    background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
                                    transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1)',
                                  }} />
                                </div>
                                {pdfMsg && (
                                  <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#60a5fa', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {pdfMsg}
                                  </p>
                                )}
                              </>
                            ) : (
                              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#60a5fa' }}>
                                First-time parse — will be instant next time
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      {done && (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#16a34a', flexShrink: 0 }}>
                          Done
                        </span>
                      )}
                      {active && (
                        <div style={{ flexShrink: 0, display: 'flex', gap: 4 }}>
                          {[0, 1, 2].map(i => (
                            <div key={i} style={{
                              width: 6, height: 6, borderRadius: '50%',
                              background: '#3b82f6',
                              animation: `rater-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                            }} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Skeleton preview of the form */}
              <div style={{ borderTop: '1.5px solid #f3f4f6', paddingTop: 24 }}>
                <p style={{ margin: '0 0 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#d1d5db' }}>
                  Preview
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {['Assignment', 'Position', 'Item Number', 'Candidate'].map((label, i) => (
                    <div key={label} style={{ animation: `rater-fade-in 0.4s ease ${0.3 + i * 0.1}s both`, opacity: 0 }}>
                      <SkeletonBlock width={100} height={12} radius={6} style={{ marginBottom: 8 }} />
                      <div style={{
                        height: 52, borderRadius: 10,
                        border: '1.5px solid #f0f0f0',
                        ...shimmerStyle,
                      }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom hint */}
          <p style={{
            textAlign: 'center', marginTop: 20,
            fontSize: 12, color: '#9ca3af',
            animation: 'rater-fade-in 0.5s ease 0.6s both', opacity: 0,
          }}>
            DENR CALABARZON · RHRMPSB Competency-Based Rating System
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Main RaterView ───────────────────────────────────────────────────────────

const RaterView = ({ user }) => {
  const [vacancies, setVacancies] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [itemNumbers, setItemNumbers] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = usePersistedState(`rater_${user._id}_selectedAssignment`, '');
  const [selectedPosition, setSelectedPosition] = usePersistedState(`rater_${user._id}_selectedPosition`, '');
  const [selectedItemNumber, setSelectedItemNumber] = usePersistedState(`rater_${user._id}_selectedItemNumber`, '');
  const [selectedCandidate, setSelectedCandidate] = usePersistedState(`rater_${user._id}_selectedCandidate`, '');
  const [candidateDetails, setCandidateDetails] = useState(null);
  const [vacancyDetails, setVacancyDetails] = useState(null);
  const [competencies, setCompetencies] = useState([]);
  const [groupedCompetencies, setGroupedCompetencies] = useState({
    basic: [],
    organizational: [],
    leadership: [],
    minimum: [],
  });
  const [ratings, setRatings] = useState({});
  const [loading, setLoading] = useState(true);
  // ✅ Track PDF pre-parse progress for the loading screen
  const [pdfStatus, setPdfStatus] = useState('idle'); // idle | parsing | done | error | unavailable
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfMsg, setPdfMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isModalMinimized, setIsModalMinimized] = useState(true);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalType, setSuccessModalType] = useState('submit');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false);
  const [isClearConfirmModalOpen, setIsClearConfirmModalOpen] = useState(false);
  const [isExitConfirmModalOpen, setIsExitConfirmModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isUpdateSubmission, setIsUpdateSubmission] = useState(false);
  const [isRaterTypeConflictModalOpen, setIsRaterTypeConflictModalOpen] = useState(false);
  const [conflictingRater, setConflictingRater] = useState(null);
  const [isCheckingRaterType, setIsCheckingRaterType] = useState(false);
  const [isPositionRequirementsModalOpen, setIsPositionRequirementsModalOpen] = useState(false);
  const [isCompetencyModalOpen, setIsCompetencyModalOpen] = useState(false);
  const [selectedCompetencyForModal, setSelectedCompetencyForModal] = useState(null);

  // ── Copy Ratings from Another Item ───────────────────────────────────────
  const [isCopyRatingsModalOpen, setIsCopyRatingsModalOpen] = useState(false);
  const [copyRatingsSources, setCopyRatingsSources] = useState([]);  // [{itemNumber, position, assignment, matchCount, ratingsMap}]
  const [copyRatingsLoading, setCopyRatingsLoading] = useState(false);

  const activeRatingRef = useRef(null);
  const scrollPositionRef = useRef(0);

  const { showToast } = useToast();

  // Handle page refresh/back warning
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (Object.keys(ratings).length > 0) {
        event.preventDefault();
        setIsExitConfirmModalOpen(true);
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [ratings]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!loading && vacancies.length > 0) {
      const uniqueAssignments = [...new Set(vacancies.map(v => v.assignment))].filter(a => a).sort();
      setAssignments(uniqueAssignments);

      if (selectedAssignment && uniqueAssignments.includes(selectedAssignment)) {
        const filteredVacancies = vacancies.filter(v => v.assignment === selectedAssignment);
        const uniquePositions = [...new Set(filteredVacancies.map(v => v.position))].filter(p => p).sort();
        setPositions(uniquePositions);

        if (selectedPosition && uniquePositions.includes(selectedPosition)) {
          const positionVacancies = filteredVacancies.filter(v => v.position === selectedPosition);
          const uniqueItemNumbers = [...new Set(positionVacancies.map(v => v.itemNumber))].filter(i => i).sort();
          setItemNumbers(uniqueItemNumbers);

          if (selectedItemNumber && uniqueItemNumbers.includes(selectedItemNumber)) {
            loadCandidatesByItemNumber();
            loadCompetenciesByItemNumber();
            loadVacancyDetails();
          } else {
            setSelectedItemNumber('');
            setSelectedCandidate('');
            setCandidates([]);
            setCandidateDetails(null);
            setVacancyDetails(null);
            setCompetencies([]);
            setGroupedCompetencies({ basic: [], organizational: [], leadership: [], minimum: [] });
          }
        } else {
          setSelectedPosition('');
          setSelectedItemNumber('');
          setSelectedCandidate('');
          setCandidates([]);
          setCandidateDetails(null);
          setVacancyDetails(null);
          setCompetencies([]);
          setGroupedCompetencies({ basic: [], organizational: [], leadership: [], minimum: [] });
        }
      } else {
        setSelectedAssignment('');
        setSelectedPosition('');
        setSelectedItemNumber('');
        setSelectedCandidate('');
        setPositions([]);
        setItemNumbers([]);
        setCandidates([]);
        setCandidateDetails(null);
        setVacancyDetails(null);
        setCompetencies([]);
        setGroupedCompetencies({ basic: [], organizational: [], leadership: [], minimum: [] });
      }
    } else if (!loading && vacancies.length === 0) {
      setAssignments([]);
      setPositions([]);
      setItemNumbers([]);
      setCandidates([]);
      setSelectedAssignment('');
      setSelectedPosition('');
      setSelectedItemNumber('');
      setSelectedCandidate('');
      setCandidateDetails(null);
      setVacancyDetails(null);
      setCompetencies([]);
      setGroupedCompetencies({ basic: [], organizational: [], leadership: [], minimum: [] });
    }
  }, [vacancies, loading, selectedAssignment, selectedPosition, selectedItemNumber]);

  useEffect(() => {
    if (candidates.length > 0 && selectedCandidate) {
      if (!candidates.find(c => c._id === selectedCandidate)) {
        setSelectedCandidate('');
        setCandidateDetails(null);
        setRatings({});
      } else {
        loadCandidateDetails();
        checkRaterTypeConflict();
      }
    }
  }, [candidates, selectedCandidate]);

  useEffect(() => {
    if (Object.keys(ratings).length > 0) {
      sessionStorage.setItem(`rater_${user._id}_hasUnsavedRatings`, 'true');
    } else {
      sessionStorage.removeItem(`rater_${user._id}_hasUnsavedRatings`);
    }
  }, [ratings, user._id]);

  const filterVacanciesByAssignment = (allVacancies, user) => {
    switch (user.assignedVacancies) {
      case 'none':
        return [];
      case 'all':
        return allVacancies;
      case 'assignment':
        if (!user.assignedAssignment) return [];
        return allVacancies.filter(vacancy => vacancy.assignment === user.assignedAssignment);
      case 'specific':
        if (!user.assignedItemNumbers || user.assignedItemNumbers.length === 0) return [];
        return allVacancies.filter(vacancy => user.assignedItemNumbers.includes(vacancy.itemNumber));
      default:
        return [];
    }
  };

  // ✅ CHANGED: loadInitialData now pre-parses the CBS PDF and WAITS for it to finish
  // before releasing the loading screen. This guarantees the modal opens instantly
  // on all devices, including tablets where background parsing was racing the UI.
  const loadInitialData = async () => {
    try {
      setLoading(true);
      setPdfStatus('idle');
      setPdfProgress(0);
      setPdfMsg('');

      // ── Fire vacancies fetch immediately (critical path) ────────────────
      const vacanciesPromise = vacanciesAPI.getAll();

      // ── Start PDF preload and build a awaitable promise ─────────────────
      let pdfPreloadPromise = Promise.resolve();

      const available = await isPDFAvailable();
      if (!available) {
        setPdfStatus('unavailable');
      } else {
        setPdfStatus('parsing');
        pdfPreloadPromise = ensureParsed((pct, msg) => {
          // Real progress callback — drives the loading screen bar
          setPdfProgress(pct);
          if (msg) setPdfMsg(msg);
        })
          .then(() => { setPdfStatus('done'); setPdfProgress(100); })
          .catch((err) => {
            console.warn('[RaterView] PDF pre-parse failed (non-critical):', err);
            setPdfStatus('error');
          });
      }

      // ── Wait for BOTH: vacancies (required) + PDF (required for instant modal) ──
      // We race them in parallel — vacancies typically finish first.
      // The loading screen stays up until the slower one (PDF) completes.
      const [vacanciesRes] = await Promise.all([
        vacanciesPromise,
        pdfPreloadPromise,
      ]);

      const activeVacancies = vacanciesRes.filter(v => !v.isArchived);
      const filteredVacancies = filterVacanciesByAssignment(activeVacancies, user);
      setVacancies(filteredVacancies);

    } catch (error) {
      console.error('Failed to load initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCandidatesByItemNumber = async () => {
    try {
      const candidatesRes = await candidatesAPI.getByItemNumber(selectedItemNumber);
      const longListCandidates = candidatesRes.filter(candidate =>
        candidate.status === CANDIDATE_STATUS.LONG_LIST &&
        !candidate.isArchived
      );
      setCandidates(longListCandidates);
    } catch (error) {
      console.error('Failed to load candidates:', error);
      setCandidates([]);
    }
  };

  const loadCompetenciesByItemNumber = async () => {
    try {
      const vacancy = vacancies.find(v => v.itemNumber === selectedItemNumber);
      if (vacancy) {
        const competenciesRes = await competenciesAPI.getByVacancy(vacancy._id);
        setCompetencies(competenciesRes);
        const grouped = {
          basic: competenciesRes.filter(c => c.type === COMPETENCY_TYPES.BASIC),
          organizational: competenciesRes.filter(c => c.type === COMPETENCY_TYPES.ORGANIZATIONAL),
          leadership: competenciesRes.filter(c => c.type === COMPETENCY_TYPES.LEADERSHIP),
          minimum: competenciesRes.filter(c => c.type === COMPETENCY_TYPES.MINIMUM)
        };
        setGroupedCompetencies(grouped);
      }
    } catch (error) {
      console.error('Failed to load competencies:', error);
      setCompetencies([]);
      setGroupedCompetencies({ basic: [], organizational: [], leadership: [], minimum: [] });
    }
  };

  const loadVacancyDetails = () => {
    const vacancy = vacancies.find(v => v.itemNumber === selectedItemNumber);
    setVacancyDetails(vacancy || null);
  };

  const loadCandidateDetails = async () => {
    try {
      const candidate = await candidatesAPI.getById(selectedCandidate);
      setCandidateDetails(candidate);
    } catch (error) {
      console.error('Failed to load candidate details:', error);
      setCandidateDetails(null);
    }
  };

  const loadExistingRatings = async () => {
    try {
      const existingRatings = await ratingsAPI.getByCandidate(selectedCandidate);
      const raterRatings = existingRatings.filter(rating =>
        rating.raterId &&
        (rating.raterId._id ?? rating.raterId).toString() === user._id.toString() &&
        rating.itemNumber === selectedItemNumber
      );
      const ratingsMap = {};
      raterRatings.forEach(rating => {
        if (rating.competencyId && rating.competencyId._id) {
          const key = `${rating.competencyType}_${rating.competencyId._id}`;
          ratingsMap[key] = rating.score;
        }
      });
      setRatings(ratingsMap);
    } catch (error) {
      console.error('Failed to load existing ratings:', error);
      setRatings({});
    }
  };

  const checkRaterTypeConflict = async () => {
    if (!selectedCandidate || !selectedItemNumber || !user.raterType) return;
    setIsCheckingRaterType(true);
    try {
      const result = await ratingsAPI.checkExistingByRaterType(
        selectedCandidate, selectedItemNumber, user.raterType
      );
      if (result.hasExisting && result.existingRater.id !== user._id) {
        setConflictingRater(result.existingRater);
        setIsRaterTypeConflictModalOpen(true);
        setRatings({});
      } else {
        loadExistingRatings();
      }
    } catch (error) {
      console.error('Failed to check rater type conflict:', error);
      showToast('Failed to verify rating permissions. Please try again.', 'error');
    } finally {
      setIsCheckingRaterType(false);
    }
  };

  const handleRatingChange = (competencyType, competencyId, score) => {
    scrollPositionRef.current = window.scrollY;
    const key = `${competencyType}_${competencyId}`;
    setRatings(prev => ({ ...prev, [key]: parseInt(score) }));
    requestAnimationFrame(() => { window.scrollTo(0, scrollPositionRef.current); });
  };

  // ── Copy Ratings from Another Item ───────────────────────────────────────
  const handleOpenCopyRatings = async () => {
    setCopyRatingsLoading(true);
    setIsCopyRatingsModalOpen(true);
    try {
      // ── ROOT CAUSE FIX ────────────────────────────────────────────────────
      // Each candidate document is scoped to ONE itemNumber. "Juan dela Cruz"
      // under Item A and Item B are TWO separate candidateId values.
      // getByCandidate(selectedCandidate) only returns ratings for THIS item's
      // candidate doc — ratings from other items are stored under different
      // candidateIds and are invisible to that query.
      //
      // Solution: query by RATER to get ALL ratings this rater has ever
      // submitted, then match by candidateId.fullName to find the same person
      // rated under a different item number.
      // ─────────────────────────────────────────────────────────────────────

      // Step 1: get the current candidate's name
      const currentName = candidateDetails?.fullName?.trim().toUpperCase();
      if (!currentName) { setCopyRatingsSources([]); return; }

      // Step 2: get ALL ratings this rater has ever submitted (across all candidates)
      const allMyRatings = await ratingsAPI.getByRater(user._id);

      // Step 3: keep only ratings where:
      //   - candidateId.fullName matches (same person)
      //   - itemNumber is different from the currently selected item
      const myRatings = allMyRatings.filter(r => {
        const rName = (r.candidateId?.fullName ?? '').trim().toUpperCase();
        return rName === currentName && r.itemNumber !== selectedItemNumber;
      });

      if (myRatings.length === 0) { setCopyRatingsSources([]); return; }

      // Group by item number
      const byItem = {};
      myRatings.forEach(r => {
        if (!byItem[r.itemNumber]) byItem[r.itemNumber] = [];
        byItem[r.itemNumber].push(r);
      });

      // For each source item, build a name→score map and count how many
      // competencies match the current item's competencies
      const normalize = (name) => name.trim().toUpperCase()
        .replace(/^\([A-Z]+\)\s*-\s*/i, '')   // strip level prefix e.g. (ADV) -
        .replace(/\s+/g, ' ');

      const currentCompNames = new Set([
        ...groupedCompetencies.basic,
        ...groupedCompetencies.organizational,
        ...groupedCompetencies.leadership,
        ...groupedCompetencies.minimum,
      ].map(c => normalize(c.name)));

      const sources = await Promise.all(
        Object.entries(byItem).map(async ([itemNumber, itemRatings]) => {
          // Build competencyId → score map from source ratings
          const idToScore = {};
          itemRatings.forEach(r => {
            const cid = r.competencyId?._id || r.competencyId;
            if (cid) idToScore[cid.toString()] = r.score;
          });

          // Build name→score map using competencyId name
          const nameToScore = {};
          itemRatings.forEach(r => {
            const cname = r.competencyId?.name;
            if (cname) nameToScore[normalize(cname)] = r.score;
          });

          // Count matching competencies
          const matchCount = [...currentCompNames].filter(n => nameToScore[n] !== undefined).length;

          // Lookup vacancy info for display
          const vacancy = vacancies.find(v => v.itemNumber === itemNumber);

          return {
            itemNumber,
            position: vacancy?.position || itemNumber,
            assignment: vacancy?.assignment || '',
            matchCount,
            totalSource: itemRatings.length,
            nameToScore,
          };
        })
      );

      // Only show items that have at least 1 matching competency
      setCopyRatingsSources(sources.filter(s => s.matchCount > 0 && s.position.trim().toUpperCase() === currentPosition)        .sort((a, b) => b.matchCount - a.matchCount));
    } catch (err) {
      console.error('Failed to load copy sources:', err);
      showToast('Failed to load ratings from other items.', 'error');
    } finally {
      setCopyRatingsLoading(false);
    }
  };

  const handleApplyCopyRatings = (source) => {
    const normalize = (name) => name.trim().toUpperCase()
      .replace(/^\([A-Z]+\)\s*-\s*/i, '')
      .replace(/\s+/g, ' ');

    const allCurrentComps = [
      ...groupedCompetencies.basic,
      ...groupedCompetencies.organizational,
      ...groupedCompetencies.leadership,
      ...groupedCompetencies.minimum,
    ];

    const newRatings = { ...ratings };
    let copied = 0;

    allCurrentComps.forEach(comp => {
      const normName = normalize(comp.name);
      const score = source.nameToScore[normName];
      if (score !== undefined) {
        newRatings[`${comp.type}_${comp._id}`] = score;
        copied++;
      }
    });

    setRatings(newRatings);
    setIsCopyRatingsModalOpen(false);
    showToast(`Copied ${copied} matching rating${copied !== 1 ? 's' : ''} from ${source.itemNumber}. Review and adjust before submitting.`, 'success');
  };

  const areAllCompetenciesRated = () => {
    const allCompetencies = [
      ...groupedCompetencies.basic,
      ...groupedCompetencies.organizational,
      ...(vacancyDetails?.salaryGrade >= 18 ? groupedCompetencies.leadership : []),
      ...groupedCompetencies.minimum
    ];
    return allCompetencies.every(competency => {
      const key = `${competency.type}_${competency._id}`;
      return ratings[key] !== undefined;
    });
  };

  const handleSubmitRatings = async () => {
    if (!areAllCompetenciesRated()) {
      showToast('Please rate all competencies before submitting.', 'error');
      return;
    }
    try {
      const existingRatings = await ratingsAPI.checkExistingRatings(
        selectedCandidate, user._id, selectedItemNumber
      );
      if (existingRatings.hasExisting) {
        setIsUpdateSubmission(true);
        setIsPasswordModalOpen(true);
      } else {
        setIsUpdateSubmission(false);
        setIsConfirmModalOpen(true);
      }
    } catch (error) {
      console.error('Failed to check existing ratings:', error);
      showToast('Failed to verify existing ratings. Please try again.', 'error');
    }
  };

  const handlePasswordSubmitForUpdate = async () => {
    try {
      const isValid = await authAPI.verifyPassword(user._id, password);
      if (isValid) {
        setIsPasswordModalOpen(false);
        setPassword('');
        setPasswordError('');
        setIsConfirmModalOpen(true);
      } else {
        setPasswordError('Incorrect password. Please try again.');
      }
    } catch (error) {
      console.error('Password verification failed:', error);
      setPasswordError('Password verification failed. Please try again.');
    }
  };

  const confirmSubmitRatings = async () => {
    setSubmitting(true);
    try {
      const ratingsData = Object.entries(ratings).map(([key, score]) => {
        const [competencyType, competencyId] = key.split('_');
        return {
          candidateId: selectedCandidate,
          raterId: user._id,
          competencyId,
          competencyType,
          score: parseInt(score),
          itemNumber: selectedItemNumber
        };
      });
      await ratingsAPI.submitRatings({ ratings: ratingsData }, isUpdateSubmission);
      setIsConfirmModalOpen(false);
      setSuccessModalType(isUpdateSubmission ? 'update' : 'submit');
      setIsSuccessModalOpen(true);
    } catch (error) {
      console.error('Failed to submit ratings:', error);
      showToast('Failed to submit ratings. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRatings = () => {
    setIsUpdateSubmission(false);
    setIsDeleteConfirmModalOpen(true);
  };

  const handlePasswordSubmit = async () => {
    try {
      const isValid = await authAPI.verifyPassword(user._id, password);
      if (isValid) {
        try {
          await ratingsAPI.resetRatings(selectedCandidate, user._id, selectedItemNumber);
          setRatings({});
          setIsPasswordModalOpen(false);
          setPassword('');
          setPasswordError('');
          setSuccessModalType('delete');
          setIsSuccessModalOpen(true);
        } catch (error) {
          console.error('Failed to delete ratings:', error);
          setPasswordError('Failed to delete ratings. Please try again.');
        }
      } else {
        setPasswordError('Incorrect password. Please try again.');
      }
    } catch (error) {
      console.error('Password verification failed:', error);
      setPasswordError('Password verification failed. Please try again.');
    }
  };

  const handleClearRatings = () => setIsClearConfirmModalOpen(true);

  const confirmClearRatings = () => {
    setRatings({});
    setIsClearConfirmModalOpen(false);
    setSuccessModalType('clear');
    setIsSuccessModalOpen(true);
  };

  const handleExitConfirm = () => {
    setIsExitConfirmModalOpen(false);
    window.location.reload();
  };

  const calculateCurrentScores = () => {
    if (Object.keys(ratings).length === 0) return { psychoSocial: 0, potential: 0, breakdown: {} };
    const mockRatings = Object.entries(ratings).map(([key, score]) => {
      const [competencyType, competencyId] = key.split('_');
      return { raterId: user._id, competencyId, competencyType, score: parseInt(score) };
    });
    return calculateRatingScores(mockRatings, groupedCompetencies, vacancyDetails?.salaryGrade || 1);
  };

  const getCompetencyAverage = (competencyType) => {
    const competencyList = groupedCompetencies[competencyType] || [];
    if (competencyList.length === 0) return '0.000';
    let totalScore = 0;
    let ratedCount = 0;
    competencyList.forEach(competency => {
      const key = `${competencyType}_${competency._id}`;
      if (ratings[key]) { totalScore += ratings[key]; ratedCount++; }
    });
    if (competencyType === 'minimum') {
      return competencyList.length > 0 ? (totalScore / competencyList.length).toFixed(3) : '0.000';
    } else {
      return ratedCount > 0 ? (totalScore / 5).toFixed(3) : '0.000';
    }
  };

  const openDocumentLink = (url) => { if (url) window.open(url, '_blank'); };

  const shouldShowLeadership = () =>
    vacancyDetails?.salaryGrade >= 18 && groupedCompetencies.leadership.length > 0;

  const handleOpenCompetencyModal = (competency, competencyType) => {
    setSelectedCompetencyForModal({ ...competency, competencyType });
    setIsCompetencyModalOpen(true);
  };

  const totalCompetencies = groupedCompetencies.basic.length +
    groupedCompetencies.organizational.length +
    (shouldShowLeadership() ? groupedCompetencies.leadership.length : 0) +
    groupedCompetencies.minimum.length;

  const RadioRating = ({ competency, competencyType, currentRating, onChange, onInfoClick }) => {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 md:p-8 mb-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <h4 className="text-lg md:text-xl lg:text-2xl font-semibold text-gray-900">
              {competency.name}
            </h4>
            <button
              onClick={() => onInfoClick(competency, competencyType)}
              title="View CBS proficiency levels"
              className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-600 hover:text-blue-800 flex items-center justify-center transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <div className={`flex justify-center items-center px-4 py-2 md:px-6 md:py-3 text-sm md:text-base lg:text-lg font-medium rounded-full text-center w-full max-w-xs mx-auto ${
            currentRating ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-gray-100 text-gray-600 border border-gray-200'
          }`}>
            {currentRating ? (
              <>
                <svg className="w-5 h-5 md:w-6 md:h-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                </svg>
                Rated: {currentRating}/5
              </>
            ) : (
              <>
                <svg className="w-5 h-5 md:w-6 md:h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Not Rated
              </>
            )}
          </div>
        </div>

        <div className="flex justify-center">
          <div className="flex space-x-4 md:space-x-8">
            {RATING_SCALE.map(({ value, label }) => (
              <label key={value} className="flex flex-col items-center cursor-pointer group">
                <div className={`relative w-16 h-16 md:w-24 md:h-24 lg:w-28 lg:h-28 rounded-full border-2 transition-all duration-200 ${
                  currentRating === value
                    ? 'border-blue-600 bg-blue-600 shadow-lg scale-105'
                    : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50 hover:scale-102'
                }`}>
                  <input
                    type="radio"
                    name={`rating_${competencyType}_${competency._id}`}
                    value={value}
                    checked={currentRating === value}
                    onChange={() => onChange(competencyType, competency._id, value)}
                    className="sr-only"
                  />
                  <div className={`absolute inset-0 flex items-center justify-center text-xl md:text-3xl lg:text-4xl font-bold ${
                    currentRating === value ? 'text-white' : 'text-gray-700'
                  }`}>
                    {value}
                  </div>
                </div>
                <span className={`text-sm md:text-lg lg:text-xl font-medium mt-3 text-center w-16 md:w-24 lg:w-28 ${
                  currentRating === value ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}>
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ✅ CHANGED: Show the rich loading screen while loading
  if (loading) {
    return <RaterLoadingScreen pdfStatus={pdfStatus} pdfProgress={pdfProgress} pdfMsg={pdfMsg} />;
  }

  const currentScores = calculateCurrentScores();
  const allRated = areAllCompetenciesRated();

  return (
    <div className="min-h-screen bg-gray-50">
      <style>{shimmerKeyframes}</style>

      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="text-center">
            <h1 className="text-1xl font-bold text-gray-900">Department of Environment and Natural Resources (CALABARZON)</h1>
            <h1 className="text-2xl font-bold text-gray-900">RHRMPSB Competency-Based Rating System</h1>
            <p className="text-gray-600">Welcome, {user.name} ({user.raterType})</p>
            <p className="text-xs text-blue-600 mt-1">Only long-listed candidates are available for rating</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="w-full">
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 text-center">PLEASE SELECT A POSITION AND CANDIDATE</h2>
            
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-lg font-semibold text-gray-700 mb-2">Assignment</label>
                <select
                  value={selectedAssignment}
                  onChange={(e) => setSelectedAssignment(e.target.value)}
                  className="w-full px-4 py-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-lg"
                >
                  <option value="">Select Assignment</option>
                  {assignments.map(assignment => (
                    <option key={assignment} value={assignment}>{assignment}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-lg font-semibold text-gray-700 mb-2">Position</label>
                <select
                  value={selectedPosition}
                  onChange={(e) => setSelectedPosition(e.target.value)}
                  className="w-full px-4 py-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 text-lg"
                  disabled={!selectedAssignment}
                >
                  <option value="">Select Position</option>
                  {positions.map(position => (
                    <option key={position} value={position}>{position}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-lg font-semibold text-gray-700 mb-2">Item Number</label>
                <select
                  value={selectedItemNumber}
                  onChange={(e) => setSelectedItemNumber(e.target.value)}
                  className="w-full px-4 py-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 text-lg"
                  disabled={!selectedPosition}
                >
                  <option value="">Select Item Number</option>
                  {itemNumbers.map(itemNumber => (
                    <option key={itemNumber} value={itemNumber}>{itemNumber}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-lg font-semibold text-gray-700 mb-2">Candidate</label>
                <select
                  value={selectedCandidate}
                  onChange={(e) => setSelectedCandidate(e.target.value)}
                  className="w-full px-4 py-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 text-lg"
                  disabled={!selectedItemNumber}
                >
                  <option value="">Select Candidate</option>
                  {candidates.map(candidate => (
                    <option key={candidate._id} value={candidate._id}>
                      {candidate.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedItemNumber && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                <p className="text-base text-blue-800">
                  <span className="font-medium">{candidates.length}</span> long-listed candidate{candidates.length !== 1 ? 's' : ''} available
                  {candidates.length === 0 && " - No candidates have been long-listed yet."}
                </p>
              </div>
            )}
          </div>

          {isCheckingRaterType && selectedCandidate && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6 shadow-sm">
              <div className="flex items-center justify-center space-y-4 flex-col">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <p className="text-gray-600">Verifying rating permissions...</p>
              </div>
            </div>
          )}

          {!isCheckingRaterType && candidateDetails && vacancyDetails && (
            <div className={`sticky top-12 z-30 bg-gray-100 rounded-xl border border-green-200 overflow-hidden mb-6 shadow-lg transition-all duration-300 ${isModalMinimized ? 'max-h-84' : 'max-h-full'}`}>
              <div className="bg-gradient-to-r from-green-800 to-green-600 px-4 py-3 flex justify-between items-center">
                <div className="text-center flex-1">
                  <h3 className="text-2xl md:text-3xl font-bold text-white">{candidateDetails.fullName}</h3>
                  <p className="text-lg md:text-xl text-white">{vacancyDetails.position}</p>
                  <p className="text-base md:text-lg text-white">{vacancyDetails.assignment} • Item # {vacancyDetails.itemNumber} • Salary Grade {vacancyDetails.salaryGrade}</p>
                  {vacancyDetails.salaryGrade < 18 && (
                    <p className="text-sm md:text-base text-white font-medium mt-1">
                      ⚠ Leadership competencies not required (SG {vacancyDetails.salaryGrade})
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setIsModalMinimized(!isModalMinimized)}
                  className="text-white hover:text-green-200 focus:outline-none relative"
                >
                  {isModalMinimized && (
                    <>
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                      </span>
                    </>
                  )}
                  {isModalMinimized ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </button>
              </div>

              {isModalMinimized && (
                <div className="p-4 bg-blue-50 border-t border-blue-100">
                  <div className="flex items-center justify-center space-x-2 text-blue-700">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium">Click the arrow above to view candidate details and documents</span>
                  </div>
                </div>
              )}

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg text-white">
                    <p className="text-base md:text-lg font-medium opacity-90">Psycho-Social</p>
                    <p className="text-3xl md:text-4xl font-bold">{currentScores.psychoSocial.toFixed(3)}</p>
                  </div>
                  <div className="text-center p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg text-white">
                    <p className="text-base md:text-lg font-medium opacity-90">Potential</p>
                    <p className="text-3xl md:text-4xl font-bold">{currentScores.potential.toFixed(3)}</p>
                  </div>
                </div>

                {!isModalMinimized && (
                  <>
                    <div className={`grid gap-3 ${shouldShowLeadership() ? 'grid-cols-4' : 'grid-cols-3'}`}>
                      <div className="text-center p-3 bg-blue-50 rounded">
                        <p className="text-sm md:text-base font-medium text-blue-600">Basic</p>
                        <p className="text-base md:text-lg font-bold text-blue-900">{getCompetencyAverage('basic')}</p>
                      </div>
                      <div className="text-center p-3 bg-purple-50 rounded">
                        <p className="text-sm md:text-base font-medium text-purple-600">Org</p>
                        <p className="text-base md:text-lg font-bold text-purple-900">{getCompetencyAverage('organizational')}</p>
                      </div>
                      {shouldShowLeadership() && (
                        <div className="text-center p-3 bg-indigo-50 rounded">
                          <p className="text-sm md:text-base font-medium text-indigo-600">Lead</p>
                          <p className="text-base md:text-lg font-bold text-indigo-900">{getCompetencyAverage('leadership')}</p>
                        </div>
                      )}
                      <div className="text-center p-3 bg-orange-50 rounded">
                        <p className="text-sm md:text-base font-medium text-orange-600">Min</p>
                        <p className="text-base md:text-lg font-bold text-orange-900">{getCompetencyAverage('minimum')}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setIsPositionRequirementsModalOpen(true)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-sm md:text-base font-semibold text-blue-800">View Position Requirements</span>
                      </div>
                      <svg className="w-4 h-4 text-blue-500 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m9 18 6-6-6-6" />
                      </svg>
                    </button>

                    <div className="bg-gray-50 rounded-lg p-3">
                      <h5 className="text-base md:text-lg font-semibold text-gray-700 mb-1">Candidate Details</h5>
                      <div className="grid grid-cols-2 gap-0 text-sm md:text-base">
                        <div><span className="font-medium text-gray-600">Gender:</span> {candidateDetails.gender}</div>
                        <div><span className="font-medium text-gray-600">Age:</span> {candidateDetails.age || 'N/A'}</div>
                        <div><span className="font-medium text-gray-600">Date of Birth:</span> {formatDate(candidateDetails.dateOfBirth)}</div>
                        <div><span className="font-medium text-gray-600">Eligibility:</span> {candidateDetails.eligibility || 'N/A'}</div>
                      </div>
                    </div>

                    <div>
                      <h5 className="text-base md:text-lg font-semibold text-gray-700 mb-1">Link to submitted documents</h5>
                      <div className="grid grid-cols-5 gap-2">
                        {[
                          { key: 'professionalLicense', label: 'Professional License', short: 'PL', color: 'bg-red-100 text-red-800 hover:bg-red-200' },
                          { key: 'letterOfIntent', label: 'Letter of Intent', short: 'LOI', color: 'bg-blue-100 text-blue-800 hover:bg-blue-200' },
                          { key: 'personalDataSheet', label: 'Personal Data Sheet', short: 'PDS', color: 'bg-green-100 text-green-800 hover:bg-green-200' },
                          { key: 'workExperienceSheet', label: 'Work Experience Sheet', short: 'WES', color: 'bg-purple-100 text-purple-800 hover:bg-purple-200' },
                          { key: 'proofOfEligibility', label: 'Proof of Eligibility', short: 'POE', color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' },
                          { key: 'certificates', label: 'Certificates', short: 'CERT', color: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200' },
                          { key: 'ipcr', label: 'IPCR', short: 'IPCR', color: 'bg-orange-100 text-orange-800 hover:bg-orange-200' },
                          { key: 'certificateOfEmployment', label: 'Certificate of Employment', short: 'COE', color: 'bg-teal-100 text-teal-800 hover:bg-teal-200' },
                          { key: 'diploma', label: 'Diploma', short: 'DIP', color: 'bg-pink-100 text-pink-800 hover:bg-pink-200' },
                          { key: 'transcriptOfRecords', label: 'Transcript of Records', short: 'TOR', color: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-200' }
                        ].map(doc => (
                          <button
                            key={doc.key}
                            onClick={() => openDocumentLink(candidateDetails[doc.key])}
                            disabled={!candidateDetails[doc.key]}
                            title={doc.label}
                            className={`px-2 py-1 rounded text-sm md:text-base font-medium text-center transition-all ${
                              candidateDetails[doc.key]
                                ? `${doc.color} cursor-pointer hover:scale-105`
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            {doc.short}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="text-center">
                      <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm md:text-base font-medium ${
                        allRated ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {allRated ? (
                          <>
                            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Complete ({Object.keys(ratings).length}/{totalCompetencies})
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Progress: {Object.keys(ratings).length}/{totalCompetencies}
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Modals (unchanged) ─────────────────────────────────── */}

          {isConfirmModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-8 max-w-3xl w-full mx-4">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">{isUpdateSubmission ? 'Confirm Update Ratings' : 'Confirm Submission'}</h3>
                <p className="text-lg text-gray-600 mb-6 font-medium">
                  {isUpdateSubmission
                    ? `Are you sure you want to update the existing ratings for ${candidateDetails?.fullName}? This will overwrite all previous ratings.`
                    : `Are you sure you want to submit the following ratings for ${candidateDetails?.fullName}?`}
                </p>
                <div className="bg-gray-50 rounded-lg p-6 mb-6">
                  <div className="text-center mb-4">
                    <h4 className="text-xl font-semibold text-gray-800">{candidateDetails.fullName}</h4>
                    <p className="text-lg text-gray-600">{vacancyDetails.position}</p>
                    <p className="text-base text-gray-500">{vacancyDetails.assignment} • Item # {vacancyDetails.itemNumber} • Salary Grade {vacancyDetails.salaryGrade}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center p-4 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg text-white">
                      <p className="text-lg font-medium opacity-90">Psycho-Social</p>
                      <p className="text-3xl font-bold">{currentScores.psychoSocial.toFixed(3)}</p>
                      <p className="text-sm opacity-80 mt-2">Basic × 2</p>
                    </div>
                    <div className="text-center p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg text-white">
                      <p className="text-lg font-medium opacity-90">Potential</p>
                      <p className="text-3xl font-bold">{currentScores.potential.toFixed(3)}</p>
                      <p className="text-sm opacity-80 mt-2">Org + {shouldShowLeadership() ? 'Lead + ' : ''}Min</p>
                    </div>
                  </div>
                  <div className={`grid gap-3 ${shouldShowLeadership() ? 'grid-cols-4' : 'grid-cols-3'} mb-4`}>
                    <div className="text-center p-3 bg-blue-50 rounded">
                      <p className="text-base font-medium text-blue-600">Basic</p>
                      <p className="text-lg font-bold text-blue-900">{getCompetencyAverage('basic')}</p>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded">
                      <p className="text-base font-medium text-purple-600">Org</p>
                      <p className="text-lg font-bold text-purple-900">{getCompetencyAverage('organizational')}</p>
                    </div>
                    {shouldShowLeadership() && (
                      <div className="text-center p-3 bg-indigo-50 rounded">
                        <p className="text-base font-medium text-indigo-600">Lead</p>
                        <p className="text-lg font-bold text-indigo-900">{getCompetencyAverage('leadership')}</p>
                      </div>
                    )}
                    <div className="text-center p-3 bg-orange-50 rounded">
                      <p className="text-base font-medium text-orange-600">Min</p>
                      <p className="text-lg font-bold text-orange-900">{getCompetencyAverage('minimum')}</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="inline-flex items-center px-4 py-2 rounded-full text-base font-medium bg-green-100 text-green-800">
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Complete ({Object.keys(ratings).length}/{totalCompetencies})
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-4">
                  <button onClick={() => setIsConfirmModalOpen(false)} className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 text-lg font-semibold">Cancel</button>
                  <button onClick={confirmSubmitRatings} disabled={submitting} className={`px-6 py-3 rounded-lg font-semibold flex items-center justify-center space-x-2 text-lg ${submitting ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 focus:ring-2 focus:ring-green-500'}`}>
                    {submitting ? (
                      <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>{isUpdateSubmission ? 'Updating...' : 'Submitting...'}</span></>
                    ) : (
                      <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span>{isUpdateSubmission ? 'Update Ratings' : 'Submit Ratings'}</span></>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {isDeleteConfirmModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-8 max-w-3xl w-full mx-4">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">Confirm Delete Ratings</h3>
                <p className="text-lg text-gray-600 mb-6 font-medium">Are you sure you want to delete all ratings for {candidateDetails?.fullName}? This action requires password confirmation.</p>
                <div className="flex justify-end gap-4">
                  <button onClick={() => setIsDeleteConfirmModalOpen(false)} className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 text-lg font-semibold">Cancel</button>
                  <button onClick={() => { setIsDeleteConfirmModalOpen(false); setIsUpdateSubmission(false); setIsPasswordModalOpen(true); setPassword(''); setPasswordError(''); }} className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 text-lg font-semibold">Proceed to Password</button>
                </div>
              </div>
            </div>
          )}

          {isClearConfirmModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-8 max-w-3xl w-full mx-4">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">Confirm Clear Ratings</h3>
                <p className="text-lg text-gray-600 mb-6 font-medium">Are you sure you want to clear all ratings for {candidateDetails?.fullName}? This will reset the ratings on this page without affecting the database.</p>
                <div className="flex justify-end gap-4">
                  <button onClick={() => setIsClearConfirmModalOpen(false)} className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 text-lg font-semibold">Cancel</button>
                  <button onClick={confirmClearRatings} className="px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg hover:from-gray-700 hover:to-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 text-lg font-semibold">Clear Ratings</button>
                </div>
              </div>
            </div>
          )}

          {isPasswordModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                <h3 className="text-xl font-bold text-gray-900 mb-4">{isUpdateSubmission ? 'Enter Password to Update' : 'Enter Password to Delete'}</h3>
                <p className="text-gray-600 mb-4">Please enter your password to confirm {isUpdateSubmission ? 'updating' : 'deletion of'} all ratings for {candidateDetails?.fullName} {isUpdateSubmission ? '' : 'from the database'}.</p>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter your password" />
                  {passwordError && <p className="mt-2 text-sm text-red-600">{passwordError}</p>}
                </div>
                <div className="flex justify-end gap-4">
                  <button onClick={() => { setIsPasswordModalOpen(false); setPassword(''); setPasswordError(''); }} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500">Cancel</button>
                  <button onClick={isUpdateSubmission ? handlePasswordSubmitForUpdate : handlePasswordSubmit} disabled={!password} className={`px-4 py-2 rounded-lg font-medium flex items-center justify-center space-x-2 ${password ? 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800 focus:ring-2 focus:ring-red-500' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    <span>{isUpdateSubmission ? 'Verify and Update' : 'Delete Ratings'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {isSuccessModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-8 max-w-lg w-full mx-4">
                <div className="text-center">
                  <div className="w-20 h-20 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800 mb-4">
                    {successModalType === 'submit' ? 'Ratings Submitted Successfully!' : successModalType === 'update' ? 'Ratings Updated Successfully!' : successModalType === 'delete' ? 'Ratings Deleted Successfully!' : 'Ratings Cleared Successfully!'}
                  </h3>
                  <p className="text-lg text-gray-600 mb-6 font-medium">
                    {successModalType === 'submit' ? `The ratings for ${candidateDetails?.fullName} have been submitted.` : successModalType === 'update' ? `The ratings for ${candidateDetails?.fullName} have been updated.` : successModalType === 'delete' ? `All ratings for ${candidateDetails?.fullName} have been deleted from the database.` : `All ratings for ${candidateDetails?.fullName} have been cleared on this page.`}
                  </p>
                  <button onClick={() => { setIsSuccessModalOpen(false); setSuccessModalType('submit'); if (successModalType === 'submit' || successModalType === 'update' || successModalType === 'delete') { setSelectedCandidate(''); setCandidateDetails(null); setRatings({}); } }} className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold">Close</button>
                </div>
              </div>
            </div>
          )}

          {isExitConfirmModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-8 max-w-3xl w-full mx-4">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">Warning: Unsubmitted Ratings</h3>
                <p className="text-lg text-gray-600 mb-6 font-medium">You have unsubmitted ratings for {candidateDetails?.fullName}. If you refresh or leave the page, these ratings will be lost. Do you want to proceed?</p>
                <div className="flex justify-end gap-4">
                  <button onClick={() => setIsExitConfirmModalOpen(false)} className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 text-lg font-semibold">Cancel</button>
                  <button onClick={handleExitConfirm} className="px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-500 text-lg font-semibold">Refresh</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Copy Ratings from Another Item Modal ── */}
          {isCopyRatingsModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl w-full max-w-lg mx-auto shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="bg-gray-800 px-6 py-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white">Copy Ratings from Another Item</h3>
                      <p className="text-gray-300 text-xs mt-1">
                        Candidate: <span className="font-medium text-white">{candidateDetails?.fullName}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => setIsCopyRatingsModalOpen(false)}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="p-6">
                  {copyRatingsLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <p className="text-gray-500 text-sm">Looking for your ratings on other items…</p>
                    </div>
                  ) : copyRatingsSources.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                      <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-gray-600 font-medium">No matching ratings found</p>
                      <p className="text-gray-400 text-sm">You haven't submitted ratings for this candidate under any other item number with matching competencies.</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500 mb-4">
                        Select an item number to copy scores from. Only competencies with matching names will be copied — you can still adjust before submitting.
                      </p>
                      <div className="space-y-3 max-h-72 overflow-y-auto">
                        {copyRatingsSources.map(source => (
                          <button
                            key={source.itemNumber}
                            onClick={() => handleApplyCopyRatings(source)}
                            className="w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all group"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-800 text-sm truncate">{source.position}</p>
                                <p className="text-gray-500 text-xs mt-0.5 truncate">{source.assignment}</p>
                                <p className="text-gray-400 text-xs mt-0.5 font-mono">{source.itemNumber}</p>
                              </div>
                              <div className="flex-shrink-0 text-right">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                                  {source.matchCount} / {source.totalSource} match
                                </span>
                                <p className="text-blue-500 text-xs mt-1 group-hover:text-blue-700 font-medium">
                                  Click to apply →
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Footer */}
                {!copyRatingsLoading && copyRatingsSources.length > 0 && (
                  <div className="px-6 pb-5">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-amber-700 text-xs">
                        ⚠️ Copying will overwrite any scores you've already entered for matching competencies. Unmatched competencies will remain unchanged.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {isRaterTypeConflictModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-8 max-w-2xl w-full mx-4">
                <div className="text-center mb-6">
                  <div className="w-20 h-20 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800 mb-4">Rating Already Submitted</h3>
                  <p className="text-lg text-gray-700 mb-4 font-medium">This candidate has already been rated for this position by another <span className="font-bold text-red-600">{user.raterType}</span> rater.</p>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                    <p className="text-gray-800"><span className="font-semibold">Existing Rater:</span> {conflictingRater?.name}</p>
                    <p className="text-gray-800"><span className="font-semibold">Rater Type:</span> {conflictingRater?.raterType}</p>
                    <p className="text-gray-800"><span className="font-semibold">Candidate:</span> {candidateDetails?.fullName}</p>
                    <p className="text-gray-800"><span className="font-semibold">Position:</span> {vacancyDetails?.position}</p>
                    <p className="text-gray-800"><span className="font-semibold">Item Number:</span> {selectedItemNumber}</p>
                  </div>
                  <p className="text-sm text-gray-600 mb-6">Only one rater per rater type can submit ratings for each candidate-position combination. Please select a different candidate or contact the administrator if this is an error.</p>
                </div>
                <div className="flex justify-center">
                  <button onClick={() => { setIsRaterTypeConflictModalOpen(false); setConflictingRater(null); setSelectedCandidate(''); setCandidateDetails(null); setRatings({}); }} className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold">Select Different Candidate</button>
                </div>
              </div>
            </div>
          )}

          {isPositionRequirementsModalOpen && vacancyDetails && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" style={{ backdropFilter: 'blur(6px)' }}>
              <div className="bg-white rounded-2xl w-full max-w-lg mx-auto shadow-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-blue-700 to-blue-500 px-6 py-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white bg-opacity-20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white leading-tight">Position Requirements</h3>
                      <p className="text-blue-100 text-sm mt-0.5">{vacancyDetails.position} · SG {vacancyDetails.salaryGrade}</p>
                    </div>
                  </div>
                  <button onClick={() => setIsPositionRequirementsModalOpen(false)} className="w-8 h-8 rounded-lg bg-white bg-opacity-20 hover:bg-opacity-30 flex items-center justify-center transition-all">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  {[
                    { label: 'Education',   value: vacancyDetails.qualifications?.education,   icon: '🎓', color: 'bg-purple-50 border-purple-200', labelColor: 'text-purple-700' },
                    { label: 'Training',    value: vacancyDetails.qualifications?.training,    icon: '📋', color: 'bg-blue-50 border-blue-200',   labelColor: 'text-blue-700'   },
                    { label: 'Experience',  value: vacancyDetails.qualifications?.experience,  icon: '💼', color: 'bg-green-50 border-green-200', labelColor: 'text-green-700' },
                    { label: 'Eligibility', value: vacancyDetails.qualifications?.eligibility, icon: '✅', color: 'bg-orange-50 border-orange-200',labelColor: 'text-orange-700'},
                  ].map(({ label, value, icon, color, labelColor }) => (
                    <div key={label} className={`rounded-xl border p-4 ${color}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{icon}</span>
                        <span className={`text-xs font-bold uppercase tracking-widest ${labelColor}`}>{label}</span>
                      </div>
                      <p className="text-gray-800 text-sm md:text-base leading-relaxed">
                        {value || <span className="text-gray-400 italic">Not specified</span>}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="px-6 pb-6">
                  <button onClick={() => setIsPositionRequirementsModalOpen(false)} className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-semibold text-base hover:from-blue-700 hover:to-blue-600 transition-all shadow-md">Close</button>
                </div>
              </div>
            </div>
          )}

          {isCompetencyModalOpen && selectedCompetencyForModal && (
            <CompetencyDetailModal
              competencyName={selectedCompetencyForModal.name}
              competencyType={selectedCompetencyForModal.competencyType}
              suggestedLevel="BASIC"
              onClose={() => { setIsCompetencyModalOpen(false); setSelectedCompetencyForModal(null); }}
            />
          )}

          {selectedCandidate && !isRaterTypeConflictModalOpen && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6 shadow-sm">
              <div className="bg-gray-800 px-6 py-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-white">COMPETENCY RATINGS (BEI-BASED)</h2>
                  <p className="text-gray-300 mt-1 text-xs sm:text-sm px-2 text-center leading-relaxed">
                    Tap the ⓘ icon on any competency to view CBS proficiency levels
                  </p>
                  <div className="flex justify-center items-center space-x-4 mt-4">
                    <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${allRated ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-yellow-100 text-yellow-800 border border-yellow-200'}`}>
                      {allRated ? (
                        <><svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>All Competencies Rated</>
                      ) : (
                        <><svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Progress: {Object.keys(ratings).length} / {totalCompetencies}</>
                      )}
                    </div>
                    <button
                      onClick={handleOpenCopyRatings}
                      className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200 transition-colors"
                      title="Copy your ratings from another item number where you rated this same candidate"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy from Another Item
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {groupedCompetencies.basic.length > 0 && (
                  <div className="mb-10">
                    <div className="text-center mb-0">
                      <h3 className="text-2xl font-bold mb-2 text-gray-900">PSYCHO-SOCIAL ATTRIBUTES AND PERSONALITY TRAITS</h3>
                      <h3 className="text-2xl font-bold mb-2 text-gray-900">Core Competencies</h3>
                      <span className="text-sm text-gray-500 bg-blue-50 px-4 py-0 rounded-full border border-blue-200">Average Score: {getCompetencyAverage('basic')}</span>
                    </div>
                    <div className="space-y-4 mt-4">
                      {groupedCompetencies.basic.map(competency => (
                        <RadioRating key={competency._id} competency={competency} competencyType="basic" currentRating={ratings[`basic_${competency._id}`]} onChange={handleRatingChange} onInfoClick={handleOpenCompetencyModal} />
                      ))}
                    </div>
                  </div>
                )}

                {groupedCompetencies.organizational.length > 0 && (
                  <div className="mb-10">
                    <div className="text-center mb-0">
                      <h3 className="text-2xl font-bold mb-2 text-gray-900">POTENTIAL</h3>
                      <h3 className="text-2xl font-bold mb-2 text-gray-900">Organizational Competencies</h3>
                      <span className="text-sm text-gray-500 bg-purple-50 px-4 py-0 rounded-full border border-purple-200">Average Score: {getCompetencyAverage('organizational')}</span>
                    </div>
                    <div className="space-y-4 mt-4">
                      {groupedCompetencies.organizational.map(competency => (
                        <RadioRating key={competency._id} competency={competency} competencyType="organizational" currentRating={ratings[`organizational_${competency._id}`]} onChange={handleRatingChange} onInfoClick={handleOpenCompetencyModal} />
                      ))}
                    </div>
                  </div>
                )}

                {shouldShowLeadership() && (
                  <div className="mb-10">
                    <div className="text-center mb-0">
                      <h3 className="text-2xl font-bold mb-2 text-gray-900">Leadership Competencies</h3>
                      <span className="text-sm text-gray-500 bg-indigo-50 px-4 py-0 rounded-full border border-indigo-200">Average Score: {getCompetencyAverage('leadership')}</span>
                      <p className="text-xs text-gray-600 mt-2">Required for Salary Grade {vacancyDetails.salaryGrade}</p>
                    </div>
                    <div className="space-y-4 mt-4">
                      {groupedCompetencies.leadership.map(competency => (
                        <RadioRating key={competency._id} competency={competency} competencyType="leadership" currentRating={ratings[`leadership_${competency._id}`]} onChange={handleRatingChange} onInfoClick={handleOpenCompetencyModal} />
                      ))}
                    </div>
                  </div>
                )}

                {!shouldShowLeadership() && groupedCompetencies.leadership.length === 0 && vacancyDetails?.salaryGrade < 18 && (
                  <div className="mb-8 text-center">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 inline-block">
                      <div className="flex items-center justify-center space-x-2 text-yellow-800">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span className="text-sm font-medium">Leadership competencies not required for Salary Grade {vacancyDetails.salaryGrade}</span>
                      </div>
                    </div>
                  </div>
                )}

                {groupedCompetencies.minimum.length > 0 && (
                  <div className="mb-10">
                    <div className="text-center mb-0">
                      <h3 className="text-2xl font-bold mb-2 text-gray-900">Minimum Competencies</h3>
                      <span className="text-sm text-gray-500 bg-orange-50 px-4 py-0 rounded-full border border-orange-200">Average Score: {getCompetencyAverage('minimum')}</span>
                    </div>
                    <div className="space-y-4 mt-4">
                      {groupedCompetencies.minimum.map(competency => (
                        <RadioRating key={competency._id} competency={competency} competencyType="minimum" currentRating={ratings[`minimum_${competency._id}`]} onChange={handleRatingChange} onInfoClick={handleOpenCompetencyModal} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t pt-6">
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button onClick={handleClearRatings} className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-all font-medium flex items-center justify-center space-x-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      <span>Clear Ratings</span>
                    </button>
                    <button onClick={handleDeleteRatings} className="px-6 py-3 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all font-medium flex items-center justify-center space-x-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      <span>Delete Ratings</span>
                    </button>
                    <button onClick={handleSubmitRatings} disabled={!allRated || submitting || isCheckingRaterType} className={`px-8 py-3 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all flex items-center justify-center space-x-2 ${allRated && !submitting ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 focus:ring-green-500 shadow-lg' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                      {submitting ? (
                        <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>Submitting...</span></>
                      ) : allRated ? (
                        <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span>Submit All Ratings</span></>
                      ) : (
                        <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><span>Complete All Ratings First</span></>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!selectedCandidate && (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="w-32 h-32 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
                <svg className="w-16 h-16 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Ready to Begin Rating</h3>
              <p className="text-gray-600 max-w-md mx-auto">Select an assignment, position, item number, and candidate from the dropdowns above to start the rating process.</p>
              <div className="mt-6 text-sm text-gray-500 bg-gray-50 rounded-lg p-4 inline-block">
                <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Only candidates who have been long-listed are available for rating
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RaterView;