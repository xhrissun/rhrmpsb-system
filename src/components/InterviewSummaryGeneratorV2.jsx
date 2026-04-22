import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { vacanciesAPI, candidatesAPI, competenciesAPI, ratingsAPI, usersAPI, publicationRangesAPI, ratingLogsAPI } from '../utils/api';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// ─── Score colour helpers ──────────────────────────────────────────────────────
const scoreColor = (score) => {
  if (!score || score === 0) return { bg: '#f1f5f9', text: '#94a3b8', border: '#e2e8f0' };
  if (score >= 4.0) return { bg: '#dcfce7', text: '#15803d', border: '#86efac' };
  if (score >= 3.5) return { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' };
  if (score >= 3.0) return { bg: '#fef9c3', text: '#854d0e', border: '#fde047' };
  if (score >= 2.5) return { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' };
  return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' };
};

const scoreLabel = (score) => {
  if (!score || score === 0) return 'No Ratings';
  if (score >= 4.5) return 'Outstanding';
  if (score >= 4.0) return 'Very Satisfactory';
  if (score >= 3.5) return 'Satisfactory';
  if (score >= 3.0) return 'Unsatisfactory';
  return 'Poor';
};


// ─── CER score helpers (0–10 scale: psychoSocial + potential each max 10, avg = 0–10) ──
const cerScoreColor = (score) => {
  if (!score || score === 0) return { bg: '#f1f5f9', text: '#94a3b8', border: '#e2e8f0' };
  if (score >= 9.0) return { bg: '#dcfce7', text: '#15803d', border: '#86efac' };
  if (score >= 8.0) return { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' };
  if (score >= 7.0) return { bg: '#fef9c3', text: '#854d0e', border: '#fde047' };
  if (score >= 6.0) return { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' };
  return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' };
};

const cerScoreLabel = (score) => {
  if (!score || score === 0) return 'No Ratings';
  if (score >= 9.0) return 'Outstanding';
  if (score >= 8.0) return 'Very Satisfactory';
  if (score >= 7.0) return 'Satisfactory';
  if (score >= 6.0) return 'Unsatisfactory';
  return 'Poor';
};

const formatTimeSince = (date) => {
  if (!date) return 'No ratings yet';
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

// ─── Skeleton loader ───────────────────────────────────────────────────────────
const SkeletonCard = () => (
  <div className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
    <div className="flex items-start justify-between mb-3">
      <div className="h-4 bg-gray-200 rounded w-3/5"></div>
      <div className="h-10 w-16 bg-gray-200 rounded-lg"></div>
    </div>
    <div className="h-3 bg-gray-100 rounded w-2/5 mb-3"></div>
    <div className="h-2 bg-gray-100 rounded-full w-full mb-2"></div>
    <div className="h-3 bg-gray-100 rounded w-1/3"></div>
  </div>
);


// ─── Metric Card ──────────────────────────────────────────────────────────────
const MetricCard = ({ icon, label, value, sub, color = 'blue' }) => {
  const colorMap = {
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',   text: 'text-blue-700',   icon: 'text-blue-400'   },
    green:  { bg: 'bg-green-50',  border: 'border-green-100',  text: 'text-green-700',  icon: 'text-green-400'  },
    amber:  { bg: 'bg-amber-50',  border: 'border-amber-100',  text: 'text-amber-700',  icon: 'text-amber-400'  },
    purple: { bg: 'bg-purple-50', border: 'border-purple-100', text: 'text-purple-700', icon: 'text-purple-400' },
    rose:   { bg: 'bg-rose-50',   border: 'border-rose-100',   text: 'text-rose-700',   icon: 'text-rose-400'   },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-4 flex items-start gap-3`}>
      <div className={`${c.icon} mt-0.5 flex-shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium truncate">{label}</p>
        <p className={`text-xl font-bold ${c.text} leading-tight`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────
const InterviewSummaryGeneratorV2 = ({ user }) => {
  // Filter state
  const [publicationRanges, setPublicationRanges] = useState([]);
  const [selectedPublicationRange, setSelectedPublicationRange] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState('');
  const [positions, setPositions] = useState([]);
  const [selectedPosition, setSelectedPosition] = useState('');
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [vacancies, setVacancies] = useState([]);

  // Candidate board state
  const [candidateBoard, setCandidateBoard] = useState([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardLoadTime, setBoardLoadTime] = useState(null);
  const [boardSalaryGrade, setBoardSalaryGrade] = useState(null); // from batch endpoint
  const [boardRequiredRaters, setBoardRequiredRaters] = useState(null); // null until server confirms: 2 for SG≤14, 6 for SG≥15

  // Board search/filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRated, setFilterRated] = useState('all'); // 'all'|'rated'|'unrated'

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [candidateDetails, setCandidateDetails] = useState(null);
  const [vacancyDetails, setVacancyDetails] = useState(null);
  const [salaryGrade, setSalaryGrade] = useState(null);
  const [ratings, setRatings] = useState([]);
  // The item number actually being shown in the modal — may differ from selectedItem
  // when the modal was opened via a notification while a different item was selected.
  const [modalItemNumber, setModalItemNumber] = useState('');
  const [modalAllItemNumbers, setModalAllItemNumbers] = useState([]);
  const [groupedCompetencies, setGroupedCompetencies] = useState({ basic: [], organizational: [], leadership: [], minimum: [] });
  const [raters, setRaters] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [testMode, setTestMode] = useState(false);
  const [testScores, setTestScores] = useState({}); // { "RATERTYPE:COMP_CODE": score }
  const autoRefreshRef = useRef(null);

  // ─── Notification state — persisted in DB via ratingLogsAPI ──────────────────
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const lastNotifPollRef = useRef(null); // null until we know the latest timestamp from DB
  const notifPanelRef = useRef(null);

  // ─── Stable refs so the notification poll can access current state without re-subscribing ──
  const selectedItemRef = useRef(selectedItem);
  const selectedCandidateRef = useRef(selectedCandidate);
  const modalOpenRef = useRef(modalOpen);
  // FIX: track the item the modal is ACTUALLY showing (not the dropdown selectedItem)
  const modalItemNumberRef = useRef(modalItemNumber);

  // ── Load persisted notifications on mount ───────────────────────────────────
  useEffect(() => {
    const loadPersistedNotifications = async () => {
      // Only summary_viewer and admin have access to GET /rating-logs/recent for hydration.
      const canViewNotifs = user?.userType === 'summary_viewer' || user?.userType === 'admin';

      if (!canViewNotifs) {
        lastNotifPollRef.current = new Date().toISOString();
        return;
      }

      try {
        // Hydrate the notification panel from stored logs (last 30, all time).
        // getNotifications() calls /rating-logs/recent with no `since` param,
        // which the backend interprets as a hydration load and returns last 30.
        const stored = await ratingLogsAPI.getNotifications();
        if (Array.isArray(stored) && stored.length > 0) {
          setNotifications(stored.slice(0, 30));

          // Restore unread count using the last-read timestamp in localStorage.
          const lastReadAt = localStorage.getItem('notif_lastReadAt') || '';
          const unread = stored.filter(n => (n.createdAt ?? '') > lastReadAt).length;
          setUnreadCount(Math.min(unread, 30));

          // Use the actual max createdAt as the poll cursor (don't assume sort order).
          const latest = stored.reduce((max, n) => {
            const t = n.createdAt ?? '';
            return t > max ? t : max;
          }, '');
          lastNotifPollRef.current = latest || new Date().toISOString();
        } else {
          lastNotifPollRef.current = new Date().toISOString();
        }
      } catch (err) {
        // If the server returns 403 fall through gracefully so polling can still start.
        if (err?.response?.status !== 403) {
          console.warn('Failed to load persisted notifications:', err);
        }
        lastNotifPollRef.current = new Date().toISOString();
      }
    };
    loadPersistedNotifications();
  }, [user?.userType]);

  useEffect(() => { selectedItemRef.current = selectedItem; }, [selectedItem]);
  useEffect(() => { selectedCandidateRef.current = selectedCandidate; }, [selectedCandidate]);
  useEffect(() => { modalOpenRef.current = modalOpen; }, [modalOpen]);
  useEffect(() => { modalItemNumberRef.current = modalItemNumber; }, [modalItemNumber]);

  // ─── System-wide notification polling (every 30s, admin + summary_viewer) ───
  useEffect(() => {
    // Only admins and summary_viewers have access to rating-logs endpoints.
    if (user?.userType !== 'admin' && user?.userType !== 'summary_viewer') return;

    const poll = async () => {
      // Don't poll until the initial load has set the cursor
      if (!lastNotifPollRef.current) return;
      try {
        const recent = await ratingLogsAPI.getRecent(lastNotifPollRef.current);
        lastNotifPollRef.current = new Date().toISOString();
        if (recent.length > 0) {
          setNotifications(prev => [...recent, ...prev].slice(0, 30));
          setUnreadCount(prev => prev + recent.length);

          // ── Auto-refresh live view when new activity is detected ──────────────
          // 1. If a board is currently shown, silently refresh the candidate cards
          const currentItem = selectedItemRef.current;
          if (currentItem) {
            try {
              const { board, salaryGrade: sg, requiredRaters: rr } = await candidatesAPI.getBoardByItem(currentItem);
              setBoardSalaryGrade(sg);
              setBoardRequiredRaters(rr ?? (sg && sg <= 14 ? 2 : 6));
              setCandidateBoard(prev => {
                const sorted = [...board].sort((a, b) => {
                  if (a.lastRatedAt && b.lastRatedAt) return new Date(b.lastRatedAt) - new Date(a.lastRatedAt);
                  if (a.lastRatedAt) return -1;
                  if (b.lastRatedAt) return 1;
                  return a.name.localeCompare(b.name);
                });
                return sorted;
              });
            } catch { /* silent — board refresh is non-critical */ }
          }

          // 2. If a candidate modal is open, silently refresh it too
          if (modalOpenRef.current && selectedCandidateRef.current) {
            try {
              // FIX: use modalItemNumberRef (the item the modal is actually showing),
              // NOT selectedItemRef (the dropdown). They differ when the modal was
              // opened via a notification while a different item was selected in
              // the dropdown — using selectedItemRef caused a blank modal.
              await loadModalData(selectedCandidateRef.current.id, modalItemNumberRef.current);
            } catch { /* silent */ }
          }
        }
      } catch (err) {
        // Silence expected 403s; surface unexpected errors for debugging
        if (err?.response?.status !== 403) {
          console.warn('Notification poll error:', err);
        }
      }
    };
    // Initial poll after 10s so it doesn't fire on first load
    const initialTimer = setTimeout(poll, 10000);
    const interval = setInterval(poll, 30000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [user?.userType]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Close notification panel when clicking outside ───────────────────────────
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setInitLoading(true);
        const [vacanciesRes, ratersData, pubRangesRes] = await Promise.all([
          vacanciesAPI.getAll(),
          usersAPI.getRaters(),
          publicationRangesAPI.getActive()
        ]);
        const activeVacancies = vacanciesRes.filter(v => !v.isArchived);
        setVacancies(activeVacancies);
        const uniqueAssignments = [...new Set(
          activeVacancies.map(v => v.assignment).filter(a => a && a.trim())
        )].sort();
        setAssignments(uniqueAssignments);
        setRaters(ratersData);
        setPublicationRanges(pubRangesRes);
      } catch (err) {
        console.error('Failed to load initial data:', err);
      } finally {
        setInitLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  // ─── Position loader ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAssignment) {
      setPositions([]);
      setSelectedPosition('');
      setItems([]);
      setSelectedItem('');
      setCandidateBoard([]);
      return;
    }
    const filtered = vacancies.filter(v =>
      v.assignment === selectedAssignment &&
      (!selectedPublicationRange || v.publicationRangeId === selectedPublicationRange)
    );
    const uniquePositions = [...new Set(filtered.map(v => v.position).filter(Boolean))].sort();
    setPositions(uniquePositions);
    setSelectedPosition('');
    setItems([]);
    setSelectedItem('');
    setCandidateBoard([]);
  }, [selectedAssignment, selectedPublicationRange, vacancies]);

  // ─── Item loader ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPosition) {
      setItems([]);
      setSelectedItem('');
      setCandidateBoard([]);
      return;
    }
    const filtered = vacancies.filter(v =>
      v.assignment === selectedAssignment &&
      v.position === selectedPosition &&
      (!selectedPublicationRange || v.publicationRangeId === selectedPublicationRange)
    );
    const uniqueItems = [...new Set(filtered.map(v => v.itemNumber).filter(Boolean))].sort();
    setItems(uniqueItems);
    setSelectedItem('');
    setCandidateBoard([]);
  }, [selectedPosition, selectedAssignment, selectedPublicationRange, vacancies]);

  // ─── Candidate board loader ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedItem) {
      setCandidateBoard([]);
      return;
    }
    loadCandidateBoard();
  }, [selectedItem]);

  const loadCandidateBoard = useCallback(async () => {
    if (!selectedItem) return;
    const t0 = performance.now();
    setBoardLoading(true);
    setSearchQuery('');
    setFilterRated('all');
    try {
      // Fast path: single batch request (2 DB queries instead of 1+N)
      const { board, salaryGrade: sg, requiredRaters: rr } = await candidatesAPI.getBoardByItem(selectedItem);
      setBoardSalaryGrade(sg);
      setBoardRequiredRaters(rr ?? (sg && sg <= 14 ? 2 : 6));
      const sorted = [...board].sort((a, b) => {
        if (a.lastRatedAt && b.lastRatedAt) return new Date(b.lastRatedAt) - new Date(a.lastRatedAt);
        if (a.lastRatedAt) return -1;
        if (b.lastRatedAt) return 1;
        return a.name.localeCompare(b.name);
      });
      setCandidateBoard(sorted);
      setBoardLoadTime(Math.round(performance.now() - t0));
    } catch (batchErr) {
      console.warn('Batch board endpoint unavailable, falling back to legacy load:', batchErr.message);
      // Fallback: original N+1 approach so board still loads even if backend not yet deployed
      try {
        const allCandidates = await candidatesAPI.getAll();
        const itemCandidates = allCandidates.filter(
          c => !c.isArchived && c.itemNumber === selectedItem && c.status === 'long_list'
        );
        const enriched = await Promise.all(
          itemCandidates.map(async (c) => {
            try {
              const candidateRatings = await ratingsAPI.getByCandidate(c._id);
              const itemRatings = candidateRatings.filter(r => r.itemNumber === selectedItem);
              const uniqueRaterIds = [...new Set(itemRatings.map(r => String(r.raterId?._id || r.raterId)))];
              // Compute CER score (0-10) matching the modal formula
              const byType = { basic: [], organizational: [], leadership: [], minimum: [] };
              itemRatings.forEach(r => { if (r.score > 0 && byType[r.competencyType]) byType[r.competencyType].push(r.score); });
              const typeAvg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
              const basicAvg = typeAvg(byType.basic);
              const orgAvg   = typeAvg(byType.organizational);
              const leadAvg  = typeAvg(byType.leadership);
              const minAvg   = typeAvg(byType.minimum);
              const psychoSocial = basicAvg * 2;
              const potential = boardSalaryGrade && boardSalaryGrade >= 18
                ? ((orgAvg + leadAvg + minAvg) / 3) * 2
                : ((orgAvg + minAvg) / 2) * 2;
              const cerScore = (psychoSocial === 0 && potential === 0)
                ? 0
                : Math.round(((psychoSocial + potential) / 2) * 100) / 100;
              const lastRatedAt = itemRatings.length > 0
                ? itemRatings.reduce((latest, r) => {
                    const d = new Date(r.interviewDate || r.createdAt || 0);
                    return d > latest ? d : latest;
                  }, new Date(0))
                : null;
              return { id: c._id, name: c.fullName, cerScore, raterCount: uniqueRaterIds.length, lastRatedAt };
            } catch {
              return { id: c._id, name: c.fullName, cerScore: 0, raterCount: 0, lastRatedAt: null };
            }
          })
        );
        const sorted = enriched.sort((a, b) => {
          if (a.lastRatedAt && b.lastRatedAt) return new Date(b.lastRatedAt) - new Date(a.lastRatedAt);
          if (a.lastRatedAt) return -1;
          if (b.lastRatedAt) return 1;
          return a.name.localeCompare(b.name);
        });
        setCandidateBoard(sorted);
        setBoardLoadTime(Math.round(performance.now() - t0));
      } catch (fallbackErr) {
        console.error('Failed to load candidate board (fallback also failed):', fallbackErr);
      }
    } finally {
      setBoardLoading(false);
    }
  }, [selectedItem]);

  // ─── Live metrics — derived from board, zero extra requests ─────────────────
  const metrics = useMemo(() => {
    if (!candidateBoard.length) return null;
    const total = candidateBoard.length;
    const rated = candidateBoard.filter(c => c.raterCount > 0).length;
    const fullyRated = boardRequiredRaters
      ? candidateBoard.filter(c => c.raterCount >= boardRequiredRaters).length
      : 0;
    const scores = candidateBoard.filter(c => c.cerScore > 0).map(c => c.cerScore);
    const avgScore = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0;
    const topScorer = candidateBoard.reduce((top, c) => c.cerScore > (top?.cerScore || 0) ? c : top, null);
    const recentActivity = [...candidateBoard]
      .filter(c => c.lastRatedAt)
      .sort((a, b) => new Date(b.lastRatedAt) - new Date(a.lastRatedAt))[0];
    return {
      total, rated, fullyRated, avgScore, topScorer, recentActivity,
      ratedPct: Math.round((rated / total) * 100),
      fullyRatedPct: Math.round((fullyRated / total) * 100),
    };
  }, [candidateBoard, boardRequiredRaters]);

  // ─── Filtered board ───────────────────────────────────────────────────────────
  const filteredBoard = useMemo(() => {
    let list = candidateBoard;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    if (filterRated === 'rated')   list = list.filter(c => c.raterCount > 0);
    if (filterRated === 'unrated') list = list.filter(c => c.raterCount === 0);
    return list;
  }, [candidateBoard, searchQuery, filterRated]);

  // ─── Open modal for a candidate ───────────────────────────────────────────────
  const openCandidateModal = async (candidate) => {
    setSelectedCandidate(candidate);
    setModalOpen(true);
    setModalLoading(true);
    setModalItemNumber(selectedItem);
    try {
      await loadModalData(candidate.id, selectedItem);
    } finally {
      setModalLoading(false);
    }
  };

  const loadModalData = async (candidateId, overrideItemNumber) => {
    // overrideItemNumber is used when the notification's item differs from current selectedItem
    // (React state hasn't flushed yet when this is called from handleNotifClick)
    const effectiveItem = overrideItemNumber ?? selectedItem;

    // ── FIX: Do NOT touch any state until ALL data is fetched. ──────────────────
    // The old code spread state updates across multiple await boundaries. When the
    // background poll triggered a silent refresh, React would re-render between
    // awaits with partially-reset state — e.g. ratings already cleared but
    // groupedCompetencies still from the previous load — causing scores to flash
    // blank until the full load completed.
    // Solution: fetch everything first, then commit all state in one synchronous
    // block so React batches it into a single render with no blank intermediate frame.

    const [candidateData, ratingsData, allVacancies] = await Promise.all([
      candidatesAPI.getById(candidateId),
      ratingsAPI.getByCandidate(candidateId),
      vacanciesAPI.getAll()
    ]);

    const filteredRatings = ratingsData.filter(r => r.itemNumber === effectiveItem);

    const vacancy = allVacancies.find(v =>
      !v.isArchived &&
      v.itemNumber === effectiveItem &&
      (!selectedPublicationRange || String(v.publicationRangeId) === String(selectedPublicationRange))
    );

    // All item numbers sharing the same position + assignment (for merged display in PDF)
    const siblingItemNumbers = vacancy
      ? allVacancies
          .filter(v => !v.isArchived && v.position === vacancy.position && v.assignment === vacancy.assignment)
          .map(v => v.itemNumber).filter(Boolean).sort()
      : [effectiveItem];

    const resolvedSalaryGrade = vacancy?.salaryGrade || boardSalaryGrade || null;

    // Re-fetch raters if missing (e.g. non-admin got stripped _id)
    let resolvedRaters = raters;
    if (raters.length === 0 || !raters[0]?._id) {
      try {
        resolvedRaters = await usersAPI.getRaters();
      } catch (e) {
        console.warn('Could not re-fetch raters:', e.message);
      }
    }

    let newGroupedCompetencies = { basic: [], organizational: [], leadership: [], minimum: [] };
    if (vacancy) {
      const competencyData = await competenciesAPI.getByVacancy(vacancy._id);
      const sorted = competencyData
        .map(c => ({ id: c._id, name: c.name, type: c.type, code: c.name.toUpperCase().replace(/ /g, '_') }))
        .sort((a, b) => {
          const order = { basic: 1, organizational: 2, leadership: 3, minimum: 4 };
          return order[a.type] !== order[b.type]
            ? order[a.type] - order[b.type]
            : a.name.localeCompare(b.name);
        });
      newGroupedCompetencies = {
        basic: sorted.filter(c => c.type === 'basic').map((c, i) => ({ ...c, ordinal: i + 1 })),
        organizational: sorted.filter(c => c.type === 'organizational').map((c, i) => ({ ...c, ordinal: i + 1 })),
        leadership: sorted.filter(c => c.type === 'leadership').map((c, i) => ({ ...c, ordinal: i + 1 })),
        minimum: sorted.filter(c => c.type === 'minimum').map((c, i) => ({ ...c, ordinal: i + 1 })),
      };
    }

    // ── Commit everything in one synchronous block → single React render ────────
    setModalItemNumber(effectiveItem);
    setModalAllItemNumbers(siblingItemNumbers);
    setCandidateDetails(candidateData);
    setRatings(filteredRatings);
    setVacancyDetails(vacancy);
    setSalaryGrade(resolvedSalaryGrade);
    if (resolvedRaters !== raters) setRaters(resolvedRaters);
    setGroupedCompetencies(newGroupedCompetencies);
    setLastRefresh(new Date());
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedCandidate(null);
    setCandidateDetails(null);
    setRatings([]);
    setModalItemNumber('');
    setModalAllItemNumbers([]);
    setGroupedCompetencies({ basic: [], organizational: [], leadership: [], minimum: [] });
    setAutoRefresh(false);
    setTestMode(false);
    setTestScores({});
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
  };

  // ─── Auto-refresh inside modal ────────────────────────────────────────────────
  useEffect(() => {
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    if (!autoRefresh || !selectedCandidate || !modalOpen) return;
    autoRefreshRef.current = setInterval(async () => {
      try {
        // FIX: pass modalItemNumber explicitly — never let loadModalData fall back
        // to selectedItem (the dropdown), which may differ when the modal was
        // opened via a notification click while a different item was selected.
        await loadModalData(selectedCandidate.id, modalItemNumber || undefined);
      } catch (err) {
        console.error('Auto-refresh failed:', err);
      }
    }, 30000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh, selectedCandidate, modalOpen, modalItemNumber]);

  // ─── Score calculation helpers ────────────────────────────────────────────────
  const getRaterTypeCode = (raterType) => {
    switch (raterType) {
      case 'Chairperson': return 'CHAIR';
      case 'Vice-Chairperson': return 'VICE';
      case 'Regular Member': return 'REGMEM';
      case 'DENREU': return 'DENREU';
      case 'Gender and Development': return 'GAD';
      case 'End-User': return 'END-USER';
      default: return raterType || 'UNKNOWN';
    }
  };

  const isRaterRequired = (raterType) => {
    if (!salaryGrade) return false;
    const requiredSG14 = ['REGMEM', 'END-USER'];
    const all = ['CHAIR', 'VICE', 'GAD', 'DENREU', 'REGMEM', 'END-USER'];
    return salaryGrade <= 14 ? requiredSG14.includes(raterType) : all.includes(raterType);
  };

  const getRatingDisplay = (competencyCode, raterType) => {
    if (!isRaterRequired(raterType)) return 'NA';
    if (testMode) {
      const key = `${raterType}:${competencyCode}`;
      const v = testScores[key];
      return (v !== undefined && v !== '') ? parseFloat(v).toFixed(2) : '-';
    }
    const rating = ratings.find(r =>
      r.competencyId?.name?.toUpperCase().replace(/ /g, '_') === competencyCode &&
      getRaterTypeCode(r.raterId?.raterType) === raterType &&
      r.itemNumber === modalItemNumber
    );
    return rating ? rating.score.toFixed(2) : '-';
  };

  const calculateRowAverage = (competencyCode, competencyType) => {
    const raterTypes = ['CHAIR', 'VICE', 'GAD', 'DENREU', 'REGMEM', 'END-USER'];
    const validScores = raterTypes
      .filter(rt => isRaterRequired(rt))
      .map(rt => {
        if (testMode) {
          const key = `${rt}:${competencyCode}`;
          const v = testScores[key];
          return (v !== undefined && v !== '' && parseFloat(v) > 0) ? parseFloat(v) : null;
        }
        const rating = ratings.find(r =>
          r.competencyId?.name?.toUpperCase().replace(/ /g, '_') === competencyCode &&
          getRaterTypeCode(r.raterId?.raterType) === rt &&
          r.competencyType === competencyType &&
          r.itemNumber === modalItemNumber
        );
        return rating ? rating.score : null;
      })
      .filter(s => s !== null && s > 0);
    return validScores.length > 0
      ? validScores.reduce((a, b) => a + b, 0) / validScores.length
      : 0;
  };

  const calculateCompetencyTypeAverage = (competencyType) => {
    const comps = groupedCompetencies[competencyType] || [];
    if (!comps.length) return 0;
    let total = 0, rated = 0;
    comps.forEach(comp => {
      const avg = calculateRowAverage(comp.code, competencyType);
      if (avg > 0) { total += avg; rated++; }
    });
    if (!rated) return 0;
    return competencyType === 'minimum' ? total / comps.length : total / 5;
  };

  const calculateFinalScores = () => {
    if (!ratings.length || !salaryGrade) {
      return { psychoSocial: 0, potential: 0, breakdown: { basic: 0, organizational: 0, leadership: 0, minimum: 0 } };
    }
    const basicAvg = calculateCompetencyTypeAverage('basic');
    const orgAvg = calculateCompetencyTypeAverage('organizational');
    const leadershipAvg = calculateCompetencyTypeAverage('leadership');
    const minimumAvg = calculateCompetencyTypeAverage('minimum');
    const psychoSocial = basicAvg * 2;
    const potential = salaryGrade >= 18
      ? ((orgAvg + leadershipAvg + minimumAvg) / 3) * 2
      : ((orgAvg + minimumAvg) / 2) * 2;
    return {
      psychoSocial: Math.round(psychoSocial * 100) / 100,
      potential: Math.round(potential * 100) / 100,
      breakdown: {
        basic: Math.round(basicAvg * 100) / 100,
        organizational: Math.round(orgAvg * 100) / 100,
        leadership: Math.round(leadershipAvg * 100) / 100,
        minimum: Math.round(minimumAvg * 100) / 100,
      }
    };
  };

  const shouldShowLeadership = () => salaryGrade >= 18 && groupedCompetencies.leadership.length > 0;

  // ─── PDF Export ───────────────────────────────────────────────────────────────
  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const scores = calculateFinalScores();

    // ── Page geometry ────────────────────────────────────────────────────────────
    const PAGE_WIDTH = 210;
    const PAGE_HEIGHT = 297;
    const MARGIN_LEFT = 10;
    const MARGIN_RIGHT = 14;
    const MARGIN_BOTTOM = 14; // space reserved for footer
    const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN_BOTTOM; // last usable Y before footer

    // ── Footer metadata (set once, used by the footer writer) ───────────────────
    const footerCandidateName = candidateDetails?.fullName || '';
    const footerItemNumber = (modalAllItemNumbers.length > 0 ? modalAllItemNumbers : [modalItemNumber]).join(', ') || '';

// ── Draw footer on a given page ──────────────────────────────────────────────
    const drawFooter = (pageNum, totalPages) => {
      const footerY = PAGE_HEIGHT - 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(80, 80, 80);
      // Left: candidate name and item number
      doc.text(`${footerCandidateName}  |  Item No.: ${footerItemNumber}`, MARGIN_LEFT, footerY);
      // Right: page number
      doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_WIDTH - MARGIN_RIGHT, footerY, { align: 'right' });
      // Thin rule above footer
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.2);
      doc.line(MARGIN_LEFT, footerY - 4, PAGE_WIDTH - MARGIN_RIGHT, footerY - 4);
      doc.setTextColor(0, 0, 0);
    };

    // ── Header block ─────────────────────────────────────────────────────────────
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Department of Environment and Natural Resources', 105, 10, { align: 'center' });
    doc.text('Regional Office (CALABARZON)', 105, 13, { align: 'center' });
    doc.text('Human Resource Merit Promotion and Selection Board (HRMPSB)', 105, 16, { align: 'center' });
    doc.setFontSize(12);
    doc.text('SUMMARY OF INTERVIEW SCORES', 105, 22, { align: 'center' });

    doc.setFontSize(8);
    let y = 28;
    const xLeft = 20;
    const xTab = 70;

    const details = [
      ['Name of Candidate:', candidateDetails?.fullName || ''],
      ['Office:', vacancyDetails?.assignment || ''],
      ['Vacancy:', vacancyDetails?.position || ''],
      ['Item Number:', footerItemNumber],
      ['Date of Interview:', new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })]
    ];

    details.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, xLeft, y);
      doc.setFont('helvetica', 'normal');
      doc.text(value, xTab, y);
      y += 3.5;
    });

    // ── Column layout ────────────────────────────────────────────────────────────
    const colCompetency = 116;
    const colRating = 10.5;
    const columnWidths = {
      0: { cellWidth: colCompetency, halign: 'left' },
      1: { cellWidth: colRating, halign: 'center' },
      2: { cellWidth: colRating, halign: 'center' },
      3: { cellWidth: colRating, halign: 'center' },
      4: { cellWidth: colRating, halign: 'center' },
      5: { cellWidth: colRating, halign: 'center' },
      6: { cellWidth: colRating, halign: 'center' },
      7: { cellWidth: colRating, halign: 'center' }
    };

    // ── Table rendering constants ─────────────────────────────────────────────────
    const FONT_SIZE_TABLE = 5.2;
    const CELL_PADDING = 0.8; // top/bottom — kept compact
    const CELL_PADDING_H = 2; // left/right — prevents text from touching border
    // pt → mm conversion: 1pt = 0.3528mm; line-height multiplier ~1.15
    const PT_TO_MM = 0.3528;
    const LINE_HEIGHT_MM = FONT_SIZE_TABLE * PT_TO_MM * 1.15;

    // ── Helpers to compute prefix width and wrapped lines (used in both hooks) ────
    // We must set the font on doc before calling getTextWidth / splitTextToSize
    // because jsPDF uses the current font state for measurement.
    const measurePrefix = (prefix) => {
      doc.setFontSize(FONT_SIZE_TABLE);
      doc.setFont('helvetica', 'normal');
      return doc.getTextWidth(prefix);
    };

    const wrapBodyText = (bodyText, availableWidth) => {
      doc.setFontSize(FONT_SIZE_TABLE);
      doc.setFont('helvetica', 'normal');
      return doc.splitTextToSize(bodyText, availableWidth);
    };

    // ── Parse "N. competency name" into { prefix, bodyText } ─────────────────────
    const parseCompetencyText = (raw) => {
      const dotIdx = raw.indexOf('. ');
      if (dotIdx === -1) return { prefix: '', bodyText: raw };

      const prefix = raw.slice(0, dotIdx + 2);     // e.g. "42. "
      let body = raw.slice(dotIdx + 2).trim();

      // Normalize any variant of "(SUP)-", "(SUP) -", "(SUP)- " → "(SUP) - "
      body = body.replace(/\)\s*-\s*/g, ') - ');

      return { prefix, bodyText: body };
    };

    // ── Build body rows — column 0 carries the full text; hooks handle rendering ──
    const buildBody = (competencies, type) =>
      competencies.map(comp => [
        `${comp.ordinal}. ${comp.name}`,
        getRatingDisplay(comp.code, 'CHAIR'),
        getRatingDisplay(comp.code, 'VICE'),
        getRatingDisplay(comp.code, 'GAD'),
        getRatingDisplay(comp.code, 'DENREU'),
        getRatingDisplay(comp.code, 'REGMEM'),
        getRatingDisplay(comp.code, 'END-USER'),
        { content: calculateRowAverage(comp.code, type).toFixed(2), styles: { fontStyle: 'bold' } }
      ]);

    const buildFoot = (competencies, type) => [[
      { content: 'TOTAL', styles: { halign: 'center', fontStyle: 'bold' } },
      ...['CHAIR', 'VICE', 'GAD', 'DENREU', 'REGMEM', 'END-USER'].map(rt => ({
        content: (competencies.reduce((sum, comp) => {
          const r = ratings.find(r =>
            r.competencyId?.name?.toUpperCase().replace(/ /g, '_') === comp.code &&
            getRaterTypeCode(r.raterId?.raterType) === rt &&
            r.itemNumber === modalItemNumber
          );
          return sum + (r ? r.score : 0);
        }, 0) / Math.max(1, competencies.length)).toFixed(2),
        styles: { halign: 'center' }
      })),
      { content: calculateFinalScores().breakdown[type].toFixed(2), styles: { fontStyle: 'bold', halign: 'center' } }
    ]];

    const didParseCell = (data) => {
      if (data.section !== 'body' || data.column.index !== 0) return;

      const raw = typeof data.cell.raw === 'string' ? data.cell.raw : (data.cell.raw?.content ?? '');
      const { prefix, bodyText } = parseCompetencyText(raw);

      const innerWidth = colCompetency - CELL_PADDING_H * 2;
      const prefixWidth = measurePrefix(prefix);
      const lines = wrapBodyText(bodyText, innerWidth - prefixWidth);

      const neededHeight = CELL_PADDING * 2 + lines.length * LINE_HEIGHT_MM;

      data.cell._hangingRaw = raw;
      data.cell.text = [];
      data.cell.styles.minCellHeight = Math.max(neededHeight, CELL_PADDING * 2 + LINE_HEIGHT_MM);
      data.cell.styles.valign = 'middle';
    };

    // ── didDrawCell: manually render column-0 body cells with hanging indent ──────
    const didDrawCell = (data) => {
      if (data.section !== 'body' || data.column.index !== 0) return;

      const cell = data.cell;
      const raw = cell._hangingRaw ?? (typeof cell.raw === 'string' ? cell.raw : (cell.raw?.content ?? ''));
      const { prefix, bodyText } = parseCompetencyText(raw);

      const cellX = cell.x + CELL_PADDING_H;
      const cellWidth = cell.width - CELL_PADDING_H * 2;

      doc.setFontSize(FONT_SIZE_TABLE);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);

      const prefixWidth = measurePrefix(prefix);
      const lines = wrapBodyText(bodyText, cellWidth - prefixWidth);

      // Vertically center the text block in the cell.
      // (cell.height - totalTextHeight) / 2 gives the top margin of the text block.
      // Add FONT_SIZE_TABLE * PT_TO_MM to shift from top-of-line to baseline (where jsPDF draws).
      const totalTextHeight = lines.length * LINE_HEIGHT_MM;
      const topMargin = (cell.height - totalTextHeight) / 2;
      const startY = cell.y + topMargin + FONT_SIZE_TABLE * PT_TO_MM;

      if (prefix) doc.text(prefix, cellX, startY);
      lines.forEach((line, i) => {
        doc.text(line, cellX + prefixWidth, startY + i * LINE_HEIGHT_MM);
      });
    };

    const sharedOptions = {
      styles: { fontSize: FONT_SIZE_TABLE, cellPadding: { top: CELL_PADDING, bottom: CELL_PADDING, left: CELL_PADDING_H, right: CELL_PADDING_H }, valign: 'middle', overflow: 'linebreak' },
      headStyles: { halign: 'center', fontStyle: 'bold', valign: 'middle' },
      footStyles: { halign: 'center', fontStyle: 'bold', valign: 'middle' },
      columnStyles: columnWidths,
      theme: 'grid',
      margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT, bottom: MARGIN_BOTTOM },
      showFoot: 'lastPage',
      didParseCell,
      didDrawCell,
    };

    // ── Helper: draw a section heading, checking for page overflow ───────────────
    const drawSectionHeading = (text, currentY) => {
      // If heading + at least one table row won't fit, add a page first
      const minHeadingSpace = 14;
      if (currentY + minHeadingSpace > CONTENT_BOTTOM) {
        doc.addPage();
        currentY = 18;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(text, xLeft, currentY);
      return currentY;
    };

    // ── Helper: draw score box to the right of a heading ─────────────────────────
    const drawScoreBox = (cerScore, headingY) => {
      const scoreBoxWidth = 40, scoreBoxHeight = 6;
      const scoreBoxX = PAGE_WIDTH - MARGIN_RIGHT - scoreBoxWidth;
      const scoreBoxY = headingY - 4;
      doc.setLineWidth(0.3);
      doc.rect(scoreBoxX, scoreBoxY, scoreBoxWidth, scoreBoxHeight);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`CER SCORE: ${cerScore}`, scoreBoxX + scoreBoxWidth / 2, headingY + 0.3, { align: 'center' });
    };

    // ── Generic makeCompTable ─────────────────────────────────────────────────────
    const makeCompTable = (groupTitle, competencies, type) => {
      const startY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 4 : y + 4;
      doc.autoTable({
        startY,
        head: [[groupTitle, 'CHAIR', 'VICE', 'GAD', 'DENREU', 'REGMEM', 'END-U', 'AVE']],
        body: buildBody(competencies, type),
        foot: buildFoot(competencies, type),
        ...sharedOptions,
      });
      y = doc.lastAutoTable.finalY;
    };

    // ── Section I: Psycho-Social ──────────────────────────────────────────────────
    y += 4;
    y = drawSectionHeading('I. PSYCHO-SOCIAL ATTRIBUTES AND PERSONALITY TRAITS', y);
    drawScoreBox(scores.psychoSocial.toFixed(2), y);
    makeCompTable('CORE COMPETENCIES', groupedCompetencies.basic, 'basic');

    // ── Section II: Potential ─────────────────────────────────────────────────────
    let potentialSectionY = doc.lastAutoTable.finalY + 8;
    potentialSectionY = drawSectionHeading('II. POTENTIAL', potentialSectionY);
    drawScoreBox(scores.potential.toFixed(2), potentialSectionY);

    // Organizational table (inline, not via makeCompTable so we control startY)
    doc.autoTable({
      startY: potentialSectionY + 4,
      head: [['ORGANIZATIONAL COMPETENCIES', 'CHAIR', 'VICE', 'GAD', 'DENREU', 'REGMEM', 'END-U', 'AVE']],
      body: buildBody(groupedCompetencies.organizational, 'organizational'),
      foot: buildFoot(groupedCompetencies.organizational, 'organizational'),
      ...sharedOptions,
    });

    if (shouldShowLeadership()) makeCompTable('LEADERSHIP COMPETENCIES', groupedCompetencies.leadership, 'leadership');
    makeCompTable('MINIMUM COMPETENCIES', groupedCompetencies.minimum, 'minimum');

    // ── Signatories ───────────────────────────────────────────────────────────────
    const raterIdsWhoRated = [...new Set(ratings.map(r => r.raterId?._id?.toString()))];
    const ratersWhoRated = raters.filter(r => r && r.name && r.raterType && raterIdsWhoRated.includes(r._id?.toString()));
    const raterTypeOrder = ['Chairperson', 'Vice-Chairperson', 'End-User', 'Regular Member', 'DENREU', 'Gender and Development'];
    const sortedRaters = ratersWhoRated.sort((a, b) => {
      const ia = raterTypeOrder.indexOf(a.raterType);
      const ib = raterTypeOrder.indexOf(b.raterType);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    const signatories = sortedRaters.map(r => [r.name.toUpperCase(), r.position, r.designation]);

    // Estimate total height needed for the signatory block so we can keep it together.
    // Each pair of signatories occupies one row (16 mm); add header line (10 mm).
    const sigRowCount = Math.ceil(signatories.length / 2);
    const sigBlockHeight = 10 + sigRowCount * 16 + 4; // label + rows + buffer

    y = doc.lastAutoTable.finalY + 6;

    // If the block won't fit on the current page, push to a new page.
    if (y + sigBlockHeight > CONTENT_BOTTOM) {
      doc.addPage();
      y = 18;
    }

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.text('Certified True and Correct:', xLeft, y);
    y += 22; // increased from 10 → 22 to reserve space for e-signature image above names

    const colWidth = 90;

    // ── Temporary e-signature image for Rhoda P. Cantos ──────────────────────────
    // TODO: Remove or replace with a proper signature management system.
// ── E-signature image for Rhoda P. Cantos ────────────────────────────────────
    // NOTE: The uploaded file is actually JPEG data despite the .png extension.
    // It has been converted to a true PNG here to ensure jsPDF renders it correctly.
    const RHODA_ESIG_B64 = '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';
    // ─────────────────────────────────────────────────────────────────────────────

    let col = 0, rowY = y;
    signatories.forEach(([name, position, designation]) => {
      const x = xLeft + col * colWidth;

      // ── Embed Rhoda P. Cantos e-signature above her name ─────────────────────
      if (name === 'RHODA P. CANTOS') {
        const sigW = 30, sigH = 12;
        const sigX = x + (colWidth - sigW) / 2;
        const sigY = rowY - sigH - 2; // 2 mm gap above the name line
        try {
          doc.addImage('data:image/png;base64,' + RHODA_ESIG_B64, 'PNG', sigX, sigY, sigW, sigH);
        } catch (e) {
          console.warn('E-sig render failed:', e);
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(name, x + colWidth / 2, rowY, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      if (position) doc.text(position, x + colWidth / 2, rowY + 3, { align: 'center' });
      if (designation) doc.text(designation, x + colWidth / 2, rowY + 6, { align: 'center' });
      col++;
      if (col === 2) { col = 0; rowY += 16; }
    });

    // ── Add footers to every page now that page count is known ───────────────────
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      drawFooter(p, totalPages);
    }

    doc.save(`Interview_Summary_${candidateDetails?.fullName || 'Report'}.pdf`);
  };

  // ─── Competency score table renderer ─────────────────────────────────────────
  const renderCompetencyTable = (title, comps, type) => {
    if (!comps.length) return null;
    const raterCols = ['CHAIR', 'VICE', 'GAD', 'DENREU', 'REGMEM', 'END-USER'];
    return (
      <div className="mb-6">
        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
          {title}
        </h4>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-xs table-fixed">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2 text-left font-semibold text-gray-600">Competency</th>
                {raterCols.map(rt => (
                  <th key={rt} className={`px-2 py-2 text-center font-semibold w-14 ${!isRaterRequired(rt) ? 'text-gray-300' : 'text-gray-600'}`}>{rt}</th>
                ))}
                <th className="px-2 py-2 text-center font-bold text-blue-700 w-16">AVG</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {comps.map((comp) => (
                <tr key={comp.code} className="hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-2 text-gray-800 whitespace-normal break-words">{comp.ordinal}. {comp.name}</td>
                  {raterCols.map(rt => {
                    const required = isRaterRequired(rt);
                    if (!required) return <td key={rt} className="px-2 py-2 text-center text-gray-300">NA</td>;
                    if (testMode) {
                      const key = `${rt}:${comp.code}`;
                      return (
                        <td key={rt} className="px-1 py-1 text-center">
                          <input
                            type="number" min="1" max="5" step="0.01"
                            placeholder="-"
                            value={testScores[key] ?? ''}
                            onChange={e => setTestScores(prev => ({ ...prev, [key]: e.target.value }))}
                            className="w-12 text-center text-xs border border-amber-300 rounded bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400 py-0.5"
                          />
                        </td>
                      );
                    }
                    const val = getRatingDisplay(comp.code, rt);
                    return (
                      <td key={rt} className={`px-2 py-2 text-center ${val === '-' ? 'text-gray-400' : 'text-gray-800 font-medium'}`}>{val}</td>
                    );
                  })}
                  <td className="px-2 py-2 text-center font-bold text-blue-700">{calculateRowAverage(comp.code, type).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                <td className="px-4 py-2 text-gray-700">TOTAL</td>
                {raterCols.map(rt => {
                  if (!isRaterRequired(rt)) return <td key={rt} className="px-2 py-2 text-center text-gray-300 text-xs">NA</td>;
                  const total = (comps.reduce((sum, comp) => {
                    if (testMode) {
                      const key = `${rt}:${comp.code}`;
                      const v = testScores[key];
                      return sum + ((v !== undefined && v !== '') ? parseFloat(v) || 0 : 0);
                    }
                    const r = ratings.find(r =>
                      r.competencyId?.name?.toUpperCase().replace(/ /g, '_') === comp.code &&
                      getRaterTypeCode(r.raterId?.raterType) === rt &&
                      r.itemNumber === modalItemNumber
                    );
                    return sum + (r ? r.score : 0);
                  }, 0) / Math.max(1, comps.length)).toFixed(2);
                  return <td key={rt} className="px-2 py-2 text-center text-gray-700">{total}</td>;
                })}
                <td className="px-2 py-2 text-center text-blue-700">{calculateFinalScores().breakdown[type].toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  // ─── Reset filters ────────────────────────────────────────────────────────────
  const resetFilters = () => {
    setSelectedPublicationRange('');
    setSelectedAssignment('');
    setSelectedPosition('');
    setSelectedItem('');
    setCandidateBoard([]);
    setBoardLoadTime(null);
    setBoardSalaryGrade(null);
    setBoardRequiredRaters(null);
    setSearchQuery('');
    setFilterRated('all');
  };

  const hasFilters = selectedPublicationRange || selectedAssignment || selectedPosition || selectedItem;

  // ─── Notification helpers ─────────────────────────────────────────────────────
  const markAllNotificationsRead = () => {
    localStorage.setItem('notif_lastReadAt', new Date().toISOString());
    setUnreadCount(0);
  };

  const handleNotifClick = async (notif) => {
    setNotifOpen(false);
    markAllNotificationsRead();

    // Open the modal directly using the notification's data.
    // loadModalData accepts explicit candidateId + itemNumber so it never
    // reads from the dropdown filter state — the dropdowns are left untouched.
    setSelectedCandidate({ id: notif.candidateId, name: notif.candidateName });
    setModalOpen(true);
    setModalLoading(true);
    try {
      await loadModalData(notif.candidateId, notif.itemNumber);
    } finally {
      setModalLoading(false);
    }
  };

  const formatNotifTime = (isoString) => {
    const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(isoString).toLocaleDateString();
  };

  const actionLabel = (action) => {
    if (action === 'created' || action === 'batch_created') return 'Rated';
    if (action === 'updated' || action === 'batch_updated') return 'Updated';
    if (action === 'deleted' || action === 'batch_deleted') return 'Deleted rating';
    return 'Changed';
  };

  const isDeleteAction = (action) =>
    action === 'deleted' || action === 'batch_deleted';

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Top Header Bar ───────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">Interview Summary</h1>
              <p className="text-xs text-gray-500 leading-tight">HRMPSB · DENR Region IV-A</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <button onClick={resetFilters} className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1 transition-colors px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-300 hover:bg-red-50">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear filters
              </button>
            )}

            {/* ── Notification Bell ─────────────────────────────────────── */}
            <div className="relative" ref={notifPanelRef}>
              <button
                onClick={() => { setNotifOpen(o => !o); if (!notifOpen) markAllNotificationsRead(); }}
                className="relative w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-blue-300 transition-all"
                title="Rating Notifications"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* ── Notification Dropdown Panel ───────────────────────── */}
              {notifOpen && (
                <div className="absolute right-0 top-11 w-96 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-800">Rating Activity</span>
                    {notifications.length > 0 && (
                      <button
                        onClick={() => markAllNotificationsRead()}
                        className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                      <svg className="w-8 h-8 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      <p className="text-xs text-gray-400">No recent rating activity</p>
                      <p className="text-xs text-gray-300 mt-1">Polls every 30 seconds</p>
                    </div>
                  ) : (
                    <ul className="max-h-[480px] overflow-y-auto divide-y divide-gray-50">
                      {(() => {
                        const lastReadAt = localStorage.getItem('notif_lastReadAt') || '';
                        return notifications.map((notif, idx) => {
                          const isUnread = (notif.createdAt ?? '') > lastReadAt;
                          return (
                            <li key={`${notif._id || idx}`}>
                              <button
                                onClick={() => handleNotifClick(notif)}
                                className={`w-full text-left px-4 py-3 transition-colors ${
                                  isUnread ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white hover:bg-gray-50'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  {/* Unread dot */}
                                  {isUnread && (
                                    <div className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs truncate ${ isUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-500' }`}>
                                      {notif.candidateName}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate mt-0.5">
                                      {notif.position} · {notif.assignment}
                                    </p>
                                    <p className={`text-xs mt-0.5 ${isDeleteAction(notif.action) ? 'text-red-500' : notif.action === 'updated' || notif.action === 'batch_updated' ? 'text-amber-600' : 'text-blue-600'}`}>
                                      {actionLabel(notif.action)} by {notif.raterName}
                                      {notif.raterType ? ` (${notif.raterType})` : ''}
                                    </p>
                                  </div>
                                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                    <span className="text-[10px] text-gray-400 whitespace-nowrap mt-0.5">
                                      {formatNotifTime(notif.createdAt)}
                                    </span>
                                    {isDeleteAction(notif.action) && (
                                      <span className="text-[9px] font-bold uppercase tracking-wide text-red-400 bg-red-50 border border-red-100 rounded px-1 py-0.5">
                                        Deleted
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        });
                      })()}
                    </ul>
                  )}
                  <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
                    <p className="text-[10px] text-gray-400 text-center">Click a notification to open the summary</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* ── Filter Panel ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-sm font-semibold text-gray-700">Selection Filters</span>
          </div>

          {initLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse"></div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Publication Range */}
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Publication Range</label>
                <select
                  value={selectedPublicationRange}
                  onChange={(e) => {
                    setSelectedPublicationRange(e.target.value);
                    setSelectedAssignment('');
                    setSelectedPosition('');
                    setSelectedItem('');
                    setCandidateBoard([]);
                  }}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                >
                  <option value="">All Publication Ranges</option>
                  {publicationRanges.map(pr => (
                    <option key={pr._id} value={pr._id}>{pr.name}</option>
                  ))}
                </select>
              </div>

              {/* Assignment */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Assignment</label>
                <select
                  value={selectedAssignment}
                  onChange={(e) => setSelectedAssignment(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">Select Assignment</option>
                  {assignments.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              {/* Position */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Position</label>
                <select
                  value={selectedPosition}
                  onChange={(e) => setSelectedPosition(e.target.value)}
                  disabled={!selectedAssignment}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  <option value="">Select Position</option>
                  {positions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Item Number */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Item Number</label>
                <select
                  value={selectedItem}
                  onChange={(e) => setSelectedItem(e.target.value)}
                  disabled={!selectedPosition}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  <option value="">Select Item No.</option>
                  {items.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ── Candidate Board ───────────────────────────────────────────────────── */}
        {!selectedItem && !boardLoading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm font-medium">Select an item number to view candidates</p>
            <p className="text-gray-400 text-xs mt-1">Use the filters above to narrow down your selection</p>
          </div>
        )}

        {selectedItem && (
          <>
            {/* ── Live Metrics Panel ──────────────────────────────────────── */}
            {!boardLoading && metrics && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Live Monitoring — Item {selectedItem}
                  </span>
                  {boardLoadTime !== null && (
                    <span className="ml-auto text-xs text-gray-400 bg-gray-100 rounded px-2 py-0.5">
                      ⚡ Loaded in {boardLoadTime < 1000 ? `${boardLoadTime}ms` : `${(boardLoadTime / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
                  <MetricCard color="blue" label="Total Candidates" value={metrics.total} sub={`Item ${selectedItem}`}
                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                  />
                  <MetricCard
                    color={metrics.ratedPct === 100 ? 'green' : metrics.ratedPct >= 50 ? 'blue' : 'amber'}
                    label="At Least 1 Rater" value={`${metrics.rated} / ${metrics.total}`} sub={`${metrics.ratedPct}% have been rated`}
                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                  />
                  <MetricCard
                    color={metrics.fullyRatedPct === 100 ? 'green' : 'purple'}
                    label={`Fully Rated (${boardRequiredRaters ?? '…'} Rater${boardRequiredRaters !== 1 ? 's' : ''})`} value={`${metrics.fullyRated} / ${metrics.total}`} sub={`${metrics.fullyRatedPct}% complete`}
                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                  />
                  <MetricCard
                    color={metrics.avgScore >= 8.0 ? 'green' : metrics.avgScore >= 6.0 ? 'amber' : 'rose'}
                    label="Pool Avg CER Score" value={metrics.avgScore > 0 ? metrics.avgScore.toFixed(2) : '—'} sub={metrics.avgScore > 0 ? cerScoreLabel(metrics.avgScore) : 'No scores yet'}
                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>}
                  />
                  <MetricCard color="green" label="Top Scorer"
                    value={metrics.topScorer?.cerScore > 0 ? metrics.topScorer.cerScore.toFixed(2) : '—'}
                    sub={metrics.topScorer?.cerScore > 0 ? metrics.topScorer.name : 'No scores yet'}
                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
                  />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center gap-4">
                  <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Rating Progress</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 relative overflow-hidden">
                    <div className="h-2.5 rounded-full transition-all duration-700"
                      style={{ width: `${metrics.fullyRatedPct}%`, background: metrics.fullyRatedPct === 100 ? '#22c55e' : metrics.fullyRatedPct >= 50 ? '#3b82f6' : '#f59e0b' }} />
                    {metrics.ratedPct > metrics.fullyRatedPct && (
                      <div className="absolute top-0 left-0 h-2.5 rounded-full opacity-30"
                        style={{ width: `${metrics.ratedPct}%`, background: '#3b82f6' }} />
                    )}
                  </div>
                  <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">{metrics.fullyRated} of {metrics.total} fully rated</span>
                  {metrics.recentActivity && (
                    <span className="text-xs text-gray-400 hidden lg:block whitespace-nowrap">
                      Last activity: {formatTimeSince(metrics.recentActivity.lastRatedAt)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Board header with search */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">Candidates — Item {selectedItem}</h2>
                {!boardLoading && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {filteredBoard.length !== candidateBoard.length
                      ? `${filteredBoard.length} of ${candidateBoard.length} shown`
                      : `${candidateBoard.length} candidate${candidateBoard.length !== 1 ? 's' : ''}`
                    } · Sorted by latest rating activity
                  </p>
                )}
              </div>
              {!boardLoading && candidateBoard.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input type="text" placeholder="Search candidates…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-44 transition-all" />
                  </div>
                  <select value={filterRated} onChange={e => setFilterRated(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all">
                    <option value="all">All</option>
                    <option value="rated">Rated only</option>
                    <option value="unrated">Unrated only</option>
                  </select>
                  <button onClick={loadCandidateBoard} disabled={boardLoading}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-all disabled:opacity-50">
                    <svg className={`w-3.5 h-3.5 ${boardLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </button>
                </div>
              )}
            </div>

            {/* Candidate cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {boardLoading
                ? [...Array(8)].map((_, i) => <SkeletonCard key={i} />)
                : filteredBoard.length === 0
                  ? (
                    <div className="col-span-full flex flex-col items-center py-16 text-center">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                      </div>
                      <p className="text-gray-500 text-sm">No candidates match your filters</p>
                      {(searchQuery || filterRated !== 'all') && (
                        <button onClick={() => { setSearchQuery(''); setFilterRated('all'); }} className="text-xs text-blue-500 mt-2 hover:underline">Clear filters</button>
                      )}
                    </div>
                  )
                  : filteredBoard.map((candidate) => {
                    const colors = cerScoreColor(candidate.cerScore);
                    const totalRatersExpected = boardRequiredRaters || 1;
                    const pct = boardRequiredRaters
                      ? Math.round((candidate.raterCount / totalRatersExpected) * 100)
                      : 0;
                    return (
                      <div
                        key={candidate.id}
                        className="bg-white rounded-xl border border-gray-100 p-5 hover:border-blue-300 hover:shadow-md transition-all duration-200 cursor-pointer group"
                        onClick={() => openCandidateModal(candidate)}
                      >
                        {/* Name + score badge */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <h3 className="text-sm font-semibold text-gray-900 leading-snug group-hover:text-blue-700 transition-colors line-clamp-2">
                            {candidate.name}
                          </h3>
                          <div
                            className="flex-shrink-0 rounded-lg px-2 py-1.5 text-center min-w-[52px]"
                            style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                          >
                            <div className="text-lg font-bold leading-none" style={{ color: colors.text }}>
                              {candidate.cerScore > 0 ? candidate.cerScore.toFixed(2) : '—'}
                            </div>
                            <div className="text-xs mt-0.5 font-medium" style={{ color: colors.text, opacity: 0.8 }}>
                              {candidate.cerScore > 0 ? cerScoreLabel(candidate.cerScore) : 'No data'}
                            </div>
                          </div>
                        </div>

                        {/* Rater progress */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span>{candidate.raterCount} rater{candidate.raterCount !== 1 ? 's' : ''} rated</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(pct, 100)}%`,
                                background: pct === 100 ? '#22c55e' : pct >= 50 ? '#3b82f6' : '#f59e0b'
                              }}
                            ></div>
                          </div>
                        </div>

                        {/* Last activity */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatTimeSince(candidate.lastRatedAt)}
                          </span>
                          <span className="text-xs text-blue-600 font-medium group-hover:underline">
                            View summary →
                          </span>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SUMMARY MODAL
      ══════════════════════════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[95vh] flex flex-col overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-700 to-blue-600 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white bg-opacity-20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white leading-tight">{selectedCandidate?.name}</h2>
                  <p className="text-blue-200 text-xs leading-tight">Item {selectedItem} · {vacancyDetails?.position || '...'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Auto-refresh toggle */}
                <div className="flex items-center gap-2 bg-white bg-opacity-10 rounded-lg px-3 py-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                      />
                      <div className="w-8 h-4 bg-white bg-opacity-30 rounded-full peer peer-checked:bg-green-400 transition-colors"></div>
                      <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>
                    </div>
                    <span className="text-xs text-white">
                      Auto-refresh {autoRefresh && <span className="text-green-300">· {formatTimeSince(lastRefresh)}</span>}
                    </span>
                  </label>
                </div>

                {/* Test Mode toggle */}
                {!modalLoading && candidateDetails && (
                  <button
                    onClick={() => { setTestMode(m => !m); setTestScores({}); }}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm ${testMode ? 'bg-amber-400 text-amber-900 hover:bg-amber-300' : 'bg-white bg-opacity-20 text-white hover:bg-opacity-30'}`}
                    title="Test Mode: enter hypothetical scores to verify computation formulas"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10H9m3-5h.01M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                    </svg>
                    {testMode ? 'Exit Test Mode' : 'Test Mode'}
                  </button>
                )}

                {/* PDF button */}
                {!modalLoading && candidateDetails && (
                  <button
                    onClick={exportToPDF}
                    className="flex items-center gap-1.5 bg-white text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export PDF
                  </button>
                )}

                {/* Close */}
                <button onClick={closeModal} className="w-8 h-8 rounded-lg bg-white bg-opacity-20 hover:bg-opacity-30 flex items-center justify-center text-white transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal body (scrollable) */}
            <div className="flex-1 overflow-y-auto px-6 py-5 bg-slate-50">
              {modalLoading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" style={{ borderWidth: 3 }}></div>
                  <p className="text-sm text-gray-500">Loading summary data...</p>
                </div>
              ) : candidateDetails ? (
                <>
                  {/* Candidate info card */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Candidate Information
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        ['Full Name', candidateDetails.fullName],
                        ['Office / Assignment', vacancyDetails?.assignment || 'REGIONAL OFFICE'],
                        ['Position Applied', vacancyDetails?.position || '—'],
                        ['Item Number', modalItemNumber],
                        ['Salary Grade', salaryGrade ? `SG-${salaryGrade}` : '—'],
                        ['Interview Date', new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })],
                      ].map(([label, value]) => (
                        <div key={label} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                          <p className="text-sm font-semibold text-gray-900 leading-snug">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {testMode && (
                    <div className="mb-5 bg-amber-50 border border-amber-300 rounded-xl px-5 py-3 flex items-start gap-3">
                      <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-semibold text-amber-800">Test Mode active</p>
                        <p className="text-xs text-amber-700 mt-0.5">Enter scores (1–5) in any cell. Averages and CER scores update in real time. Real ratings are not affected. Click <strong>Exit Test Mode</strong> to restore live data.</p>
                      </div>
                    </div>
                  )}

                  {/* Final Score Summary */}
                  {(ratings.length > 0 || testMode) && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
                      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Final Score Summary
                      </h3>
                      {(() => {
                        const scores = calculateFinalScores();
                        const cerTotal = Math.round(((scores.psychoSocial + scores.potential) / 2) * 100) / 100;
                        const cerColors = cerScoreColor(cerTotal);
                        return (
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                              <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">Psycho-Social</p>
                              <p className="text-3xl font-bold text-blue-700">{scores.psychoSocial.toFixed(2)}</p>
                              <p className="text-xs text-blue-500 mt-1">CER Score</p>
                            </div>
                            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
                              <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wide mb-1">Potential</p>
                              <p className="text-3xl font-bold text-indigo-700">{scores.potential.toFixed(2)}</p>
                              <p className="text-xs text-indigo-500 mt-1">CER Score</p>
                            </div>
                            <div
                              className="rounded-xl p-4 text-center border"
                              style={{ background: cerColors.bg, borderColor: cerColors.border }}
                            >
                              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: cerColors.text }}>Overall</p>
                              <p className="text-3xl font-bold" style={{ color: cerColors.text }}>{cerTotal.toFixed(2)}</p>
                              <p className="text-xs mt-1 font-medium" style={{ color: cerColors.text }}>{cerScoreLabel(cerTotal)}</p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Competency tables */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                      </svg>
                      Competency Scores
                    </h3>

                    {ratings.length === 0 && (
                      <div className="flex flex-col items-center py-10 text-center">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="text-gray-500 text-sm">No ratings submitted yet for this candidate</p>
                      </div>
                    )}

                    {groupedCompetencies.basic.length > 0 && (
                      <div className="mb-5">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 border-b border-gray-100 pb-2">
                          I. Psycho-Social Attributes
                        </p>
                        {renderCompetencyTable('Core Competencies', groupedCompetencies.basic, 'basic')}
                      </div>
                    )}

                    {groupedCompetencies.organizational.length > 0 && (
                      <div className="mb-5">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 border-b border-gray-100 pb-2">
                          II. Potential
                        </p>
                        {renderCompetencyTable('Organizational Competencies', groupedCompetencies.organizational, 'organizational')}
                        {shouldShowLeadership() && renderCompetencyTable('Leadership Competencies', groupedCompetencies.leadership, 'leadership')}
                        {renderCompetencyTable('Minimum Competencies', groupedCompetencies.minimum, 'minimum')}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center py-20">
                  <p className="text-gray-400 text-sm">No data available</p>
                </div>
              )}
            </div>

            {/* Modal footer */}
            {!modalLoading && candidateDetails && (
              <div className="px-6 py-4 border-t border-gray-200 bg-white flex items-center justify-between rounded-b-2xl">
                <p className="text-xs text-gray-400">
                  Last updated: {formatTimeSince(lastRefresh)}
                </p>
                <button
                  onClick={exportToPDF}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Generate PDF
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InterviewSummaryGeneratorV2;