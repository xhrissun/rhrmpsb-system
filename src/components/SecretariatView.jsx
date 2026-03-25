import React, { useState, useEffect, useRef, useCallback } from 'react';
import usePersistedState from '../utils/usePersistedState';
import { vacanciesAPI, candidatesAPI, usersAPI, publicationRangesAPI } from '../utils/api';
import { getStatusColor, getStatusLabel, CANDIDATE_STATUS } from '../utils/constants';
import PDFReport from './PDFReport';
import { useToast } from '../utils/ToastContext';
import { competenciesAPI } from '../utils/api';
import { COMPETENCY_TYPES } from '../utils/constants';
import CompetencyDetailModal from './CompetencyDetailModal';

// Error Boundary Component
class SecretariatErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('SecretariatView Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-1.963-1.333-2.732 0L3.732 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-red-600 mb-2 text-center">Something went wrong</h2>
            <p className="text-gray-700 text-center mb-4">
              An unexpected error occurred. Please refresh the page or contact support if the problem persists.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors"
              >
                Refresh Page
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const SecretariatView = ({ user }) => {
  const [vacancies, setVacancies] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [itemNumbers, setItemNumbers] = useState([]);
  const [reportRaters, setReportRaters] = useState([]);
  const { showToast } = useToast();
  const [competencies, setCompetencies] = useState([]);
  const [groupedCompetencies, setGroupedCompetencies] = useState({
    basic: [],
    organizational: [],
    leadership: [],
    minimum: [],
  });
  const [showCompetenciesModal, setShowCompetenciesModal] = useState(false);
  const [showCommentHistoryModal, setShowCommentHistoryModal] = useState(false);
  const [commentHistoryData, setCommentHistoryData] = useState(null);
  const [genderFilter, setGenderFilter] = useState(null);

  // Collapsible filter panel
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(true);

  // Publication Range states
  const [publicationRanges, setPublicationRanges] = useState([]);
  const [selectedPublicationRange, setSelectedPublicationRange] = usePersistedState(
    `secretariat_${user._id}_selectedPublicationRange`, 
    ''
  );
  const [showArchivedRanges, setShowArchivedRanges] = useState(false);

  // Use usePersistedState for dropdown selections.
  // Wrap each setter in useCallback so the reference is stable across renders.
  // Without this, usePersistedState's plain setState changes reference on every
  // render, causing the vacancies useEffect to re-fire after every setCandidates call.
  const [selectedAssignment, _setSelectedAssignment] = usePersistedState(`secretariat_${user._id}_selectedAssignment`, '');
  const [selectedPosition, _setSelectedPosition] = usePersistedState(`secretariat_${user._id}_selectedPosition`, '');
  const [selectedItemNumber, _setSelectedItemNumber] = usePersistedState(`secretariat_${user._id}_selectedItemNumber`, '');
  const [selectedCandidate, _setSelectedCandidate] = usePersistedState(`secretariat_${user._id}_selectedCandidate`, '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setSelectedAssignment = useCallback((v) => _setSelectedAssignment(v), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setSelectedPosition = useCallback((v) => _setSelectedPosition(v), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setSelectedItemNumber = useCallback((v) => _setSelectedItemNumber(v), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setSelectedCandidate = useCallback((v) => _setSelectedCandidate(v), []);

  const [candidateDetails, setCandidateDetails] = useState(null);
  const [vacancyDetails, setVacancyDetails] = useState(null);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showViewCommentsModal, setShowViewCommentsModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showVacancyModal, setShowVacancyModal] = useState(false);
  const [reportCandidateId, setReportCandidateId] = useState('');
  const [reportItemNumber, setReportItemNumber] = useState('');
  const [viewCandidateData, setViewCandidateData] = useState(null);
  const [comments, setComments] = useState({
    education: '',
    training: '',
    experience: '',
    eligibility: '',
  });
  const [loading, setLoading] = useState(true);        // page-level (vacancies / pub ranges)
  const [candidatesLoading, setCandidatesLoading] = useState(false); // table-level only
  const [error, setError] = useState('');

  const [commentSuggestions, setCommentSuggestions] = useState({
    education: [],
    training: [],
    experience: [],
    eligibility: []
  });

  // Government Employment modal
  const [showGovtEmpModal, setShowGovtEmpModal] = useState(false);
  const [govtEmpCandidate, setGovtEmpCandidate] = useState(null);
  const [govtEmpForm, setGovtEmpForm] = useState({ agency: '', position: '', status: '', employmentPeriod: '', employmentEndDate: '', preAssessmentExam: '', remarks: '' });
  const [govtEmpLoading, setGovtEmpLoading] = useState(false);
  const [govtEmpCustomPositions, setGovtEmpCustomPositions] = useState([]);
  // Merge built-in positions from POSITIONS.txt with any custom ones added at runtime
  const govtEmpPositions = React.useMemo(
    () => Array.from(new Set([...GOVT_EMP_POSITIONS, ...govtEmpCustomPositions])).sort(),
    [govtEmpCustomPositions]
  );

  // Siblings of the currently-open modal candidate: same fullName, different itemNumber.
  // Fetched from the API on modal open. Shown as suggestion cards in the modal so the
  // secretariat can choose to copy a sibling's data into the form. Save NEVER auto-
  // propagates to siblings -- each must be opened and saved individually.
  const [govtEmpSiblings, setGovtEmpSiblings] = useState([]);

  // Same sibling concept for the Comment modal. Each field has its own individual
  // "Use" button — clicking it copies only that one field, leaving others untouched.
  const [commentSiblings, setCommentSiblings] = useState([]);

  // Loading states for sibling fetch — shows a spinner in the panel while the
  // API call is in flight so the user isn't startled by content appearing abruptly.
  const [govtEmpSiblingsLoading, setGovtEmpSiblingsLoading] = useState(false);
  const [commentSiblingsLoading, setCommentSiblingsLoading] = useState(false);

  // Set of candidate _ids that should show the Review badge in the table.
  // Computed after every candidates load + whenever a save clears data.
  // Stored separately so the badge persists even when siblings are outside
  // the current item-number filter and not present in the candidates list.
  const [reviewBadgeIds, setReviewBadgeIds] = useState(new Set());

  const [statusFilter, setStatusFilter] = useState(null);
  const [showAssignmentSummary, setShowAssignmentSummary] = useState(false);
  const [showCBSManual, setShowCBSManual] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [cpCurrentPwd, setCpCurrentPwd] = useState('');
  const [cpNewPwd, setCpNewPwd] = useState('');
  const [cpConfirmPwd, setCpConfirmPwd] = useState('');
  const [cpError, setCpError] = useState('');
  const [cpSuccess, setCpSuccess] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [cpShow, setCpShow] = useState(false);
  const [cbsCompetency, setCbsCompetency] = useState(null); // { name, competencyType }
  const [summaryData, setSummaryData] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // STEP 1: Add Required Refs
  const isInitialMount = useRef(true);
  const loadingCandidates = useRef(false);
  const previousFilters = useRef({
    assignment: '',
    position: '',
    itemNumber: '',
    publicationRange: ''
  });

  // Utility Functions with useCallback
  const filterVacanciesByAssignment = useCallback((allVacancies, user) => {
    if (user.administrativePrivilege) {
      return allVacancies;
    }
    switch (user.assignedVacancies) {
      case 'all':
        return allVacancies;
      case 'assignment':
        if (!user.assignedAssignment) return [];
        return allVacancies.filter(vacancy => vacancy.assignment === user.assignedAssignment);
      case 'specific':
        if (!user.assignedItemNumbers || user.assignedItemNumbers.length === 0) return [];
        return allVacancies.filter(vacancy => user.assignedItemNumbers.includes(vacancy.itemNumber));
      default:
        return allVacancies;
    }
  }, []);

  const getStatistics = useCallback(() => {
    const total = candidates.length;
    const longListed = candidates.filter(c => c.status === CANDIDATE_STATUS.LONG_LIST).length;
    const forReview = candidates.filter(c => c.status === CANDIDATE_STATUS.FOR_REVIEW).length;
    const disqualified = candidates.filter(c => c.status === CANDIDATE_STATUS.DISQUALIFIED).length;
    
    return { total, longListed, forReview, disqualified };
  }, [candidates]);

  const getGenderStatistics = useCallback(() => {
    let baseFiltered = candidates;
    
    if (statusFilter) {
      baseFiltered = baseFiltered.filter(c => c.status === statusFilter);
    }
    
    const male = baseFiltered.filter(c => 
      c.gender === 'Male' || c.gender === 'MALE/LALAKI'
    ).length;
    const female = baseFiltered.filter(c => 
      c.gender === 'Female' || c.gender === 'FEMALE/BABAE'
    ).length;
    const lgbtqi = baseFiltered.filter(c => 
      c.gender === 'LGBTQI+'
    ).length;
    
    return { male, female, lgbtqi, total: baseFiltered.length };
  }, [candidates, statusFilter]);

  const getFilteredCandidates = useCallback(() => {
    let filtered = candidates;
    
    if (statusFilter) {
      filtered = filtered.filter(c => c.status === statusFilter);
    }
    
    if (genderFilter) {
      if (genderFilter === 'Male') {
        filtered = filtered.filter(c => c.gender === 'Male' || c.gender === 'MALE/LALAKI');
      } else if (genderFilter === 'Female') {
        filtered = filtered.filter(c => c.gender === 'Female' || c.gender === 'FEMALE/BABAE');
      } else if (genderFilter === 'LGBTQI+') {
        filtered = filtered.filter(c => c.gender === 'LGBTQI+');
      }
    }
    
    return filtered;
  }, [candidates, statusFilter, genderFilter]);

  const loadCandidateDetails = useCallback(async (candidateId) => {
    try {
      const candidate = await candidatesAPI.getById(candidateId);
      setCandidateDetails(candidate);
      setComments(candidate.comments || {
        education: '',
        training: '',
        experience: '',
        eligibility: ''
      });
      const vacancy = vacancies.find(v => v.itemNumber === candidate.itemNumber);
      setVacancyDetails(vacancy || null);
    } catch (error) {
      console.error('Failed to load candidate details:', error);
      showToast('Failed to load candidate details.', 'error');
      setCandidateDetails(null);
    }
  }, [vacancies, showToast]);

  const loadCommentSuggestions = useCallback(async () => {
    try {
      const fields = ['education', 'training', 'experience', 'eligibility'];
      const suggestions = {};
      
      for (const field of fields) {
        try {
          suggestions[field] = await candidatesAPI.getCommentSuggestions(field);
        } catch (error) {
          console.error(`Failed to load ${field}:`, error.message);
          suggestions[field] = [];
        }
      }
      
      setCommentSuggestions(suggestions);
    } catch (error) {
      console.error('Failed to load comment suggestions:', error);
      setCommentSuggestions({
        education: [],
        training: [],
        experience: [],
        eligibility: []
      });
    }
  }, []);

  const fetchRatersForVacancy = useCallback(async (itemNumber) => {
    try {
      const allRaters = await usersAPI.getRaters();
      const vacancy = vacancies.find(v => v.itemNumber === itemNumber);
      if (!vacancy) return [];

      const filteredRaters = allRaters.filter(user => {
        if (user.userType !== 'rater') return false;
        switch (user.assignedVacancies) {
          case 'all': return true;
          case 'assignment': return user.assignedAssignment && user.assignedAssignment === vacancy.assignment;
          case 'specific': return user.assignedItemNumbers && user.assignedItemNumbers.includes(itemNumber);
          default: return false;
        }
      });

      const raterTypeOrder = {
        'Chairperson': 1,
        'Vice-Chairperson': 2,
        'End-User': 3,
        'Regular Member': 4,
        'DENREU': 5,
        'Gender and Development': 6
      };
      filteredRaters.sort((a, b) => {
        const aRank = raterTypeOrder[a.raterType] || 999;
        const bRank = raterTypeOrder[b.raterType] || 999;
        return aRank - bRank || a.name.localeCompare(b.name);
      });

      return filteredRaters;
    } catch (error) {
      console.error('Failed to fetch raters:', error);
      showToast('Failed to fetch raters for report.', 'error');
      return [];
    }
  }, [vacancies, showToast]);

  const loadCompetenciesByItemNumber = useCallback(async (itemNumber) => {
    try {
      const vacancy = vacancies.find(v => v.itemNumber === itemNumber);
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
        setShowCompetenciesModal(true);
      }
    } catch (error) {
      console.error('Failed to load competencies:', error);
      showToast('Failed to load competencies.', 'error');
      setCompetencies([]);
      setGroupedCompetencies({
        basic: [],
        organizational: [],
        leadership: [],
        minimum: []
      });
    }
  }, [vacancies, showToast]);

  // ─── Refs for all values accessed inside load callbacks ────────────────────
  // All mutable state that load functions need is stored in refs so the
  // useCallback functions have ZERO state dependencies — their references
  // never change, so no useEffect ever re-fires because a callback recreated.
  const selectedPublicationRangeRef = useRef(selectedPublicationRange);
  const selectedAssignmentRef       = useRef(selectedAssignment);
  const selectedPositionRef         = useRef(selectedPosition);
  const selectedItemNumberRef       = useRef(selectedItemNumber);
  const publicationRangesRef        = useRef([]);
  const vacanciesRef                = useRef([]);
  // Refs for values that change reference on every render (context, props, callbacks)
  const showToastRef                    = useRef(showToast);
  const filterVacanciesByAssignmentRef  = useRef(filterVacanciesByAssignment);
  const userRef                         = useRef(user);
  const showArchivedRangesRef           = useRef(showArchivedRanges);
  const setSelectedPublicationRangeRef  = useRef(setSelectedPublicationRange);

  useEffect(() => { selectedPublicationRangeRef.current       = selectedPublicationRange; }, [selectedPublicationRange]);
  useEffect(() => { selectedAssignmentRef.current             = selectedAssignment; },       [selectedAssignment]);
  useEffect(() => { selectedPositionRef.current               = selectedPosition; },         [selectedPosition]);
  useEffect(() => { selectedItemNumberRef.current             = selectedItemNumber; },       [selectedItemNumber]);
  useEffect(() => { publicationRangesRef.current              = publicationRanges; },        [publicationRanges]);
  useEffect(() => { vacanciesRef.current                      = vacancies; },                [vacancies]);
  useEffect(() => { showToastRef.current                      = showToast; },                [showToast]);
  useEffect(() => { filterVacanciesByAssignmentRef.current    = filterVacanciesByAssignment; }, [filterVacanciesByAssignment]);
  useEffect(() => { userRef.current                           = user; },                     [user]);
  useEffect(() => { showArchivedRangesRef.current             = showArchivedRanges; },       [showArchivedRanges]);
  useEffect(() => { setSelectedPublicationRangeRef.current    = setSelectedPublicationRange; }, [setSelectedPublicationRange]);

  // ─── loadCandidatesByFilters ─────────────────────────────────────────────
  // ZERO state deps — every value read from refs. This function reference
  // NEVER changes, so nothing re-fires because it was recreated.
  const loadCandidatesByFilters = useCallback(async () => {
    if (loadingCandidates.current) return;

    const currentFilters = {
      assignment:       selectedAssignmentRef.current,
      position:         selectedPositionRef.current,
      itemNumber:       selectedItemNumberRef.current,
      publicationRange: selectedPublicationRangeRef.current,
    };

    if (JSON.stringify(currentFilters) === JSON.stringify(previousFilters.current)) return;

    previousFilters.current      = currentFilters;
    loadingCandidates.current    = true;
    setCandidatesLoading(true);

    try {
      const { assignment, position, itemNumber, publicationRange } = currentFilters;
      const currentVacancies = vacanciesRef.current;
      const selectedRange    = publicationRangesRef.current.find(r => r._id === publicationRange);
      const includeArchived  = selectedRange?.isArchived || false;

      let filteredCandidates = [];

      if (itemNumber) {
        filteredCandidates = await candidatesAPI.getByItemNumber(itemNumber, includeArchived);
      } else if (position) {
        const itemNums = currentVacancies
          .filter(v => v.assignment === assignment && v.position === position)
          .map(v => v.itemNumber);
        filteredCandidates = (await Promise.all(
          itemNums.map(n => candidatesAPI.getByItemNumber(n, includeArchived))
        )).flat();
      } else if (assignment) {
        const itemNums = currentVacancies
          .filter(v => v.assignment === assignment)
          .map(v => v.itemNumber);
        filteredCandidates = (await Promise.all(
          itemNums.map(n => candidatesAPI.getByItemNumber(n, includeArchived))
        )).flat();
      } else {
        const itemNums = currentVacancies.map(v => v.itemNumber);
        filteredCandidates = (await Promise.all(
          itemNums.map(n => candidatesAPI.getByItemNumber(n, includeArchived))
        )).flat();
      }

      const unique = Array.from(new Map(filteredCandidates.map(c => [c._id, c])).values());
      unique.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setCandidates(unique);

      // Compute Review badge IDs.
      // When a single itemNumber is filtered, siblings from other items are not in
      // `unique`. Fetch all candidates for the pub range so we can cross-reference.
      try {
        const pubRange = selectedPublicationRangeRef.current;
        let allForBadge = unique;
        if (currentFilters.itemNumber && pubRange) {
          const allInRange = await candidatesAPI.getByPublicationRange(pubRange, includeArchived);
          allForBadge = Array.from(new Map([...unique, ...allInRange].map(c => [c._id, c])).values());
        }
        const byName = {};
        allForBadge.forEach(c => {
          if (!byName[c.fullName]) byName[c.fullName] = [];
          byName[c.fullName].push(c);
        });
        const hasGovtData = c => c.governmentEmployment &&
          (c.governmentEmployment.agency || c.governmentEmployment.position ||
           c.governmentEmployment.status || c.governmentEmployment.preAssessmentExam);
        const badgeIds = new Set();
        Object.values(byName).forEach(group => {
          if (group.length < 2) return;
          if (!group.some(hasGovtData)) return;
          group.forEach(c => { if (!hasGovtData(c)) badgeIds.add(c._id); });
        });
        setReviewBadgeIds(badgeIds);
      } catch {
        setReviewBadgeIds(new Set());
      }
    } catch (err) {
      console.error('Failed to load candidates:', err);
      setError('Failed to load candidates.');
      showToast('Failed to load candidates', 'error');
      setCandidates([]);
    } finally {
      setCandidatesLoading(false);
      loadingCandidates.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── ALL load callbacks have [] deps — every value read from refs ──────────
  // This guarantees these function references NEVER change, so no useEffect
  // ever re-fires simply because a callback was recreated.

  const loadAllActiveVacancies = useCallback(async () => {
    try {
      setLoading(true);
      const vacanciesRes    = await vacanciesAPI.getAll();
      const activeVacancies = vacanciesRes.filter(v => !v.isArchived);
      const filtered        = filterVacanciesByAssignmentRef.current(activeVacancies, userRef.current);
      setVacancies(filtered);
    } catch (err) {
      console.error('Failed to load vacancies:', err);
      setError('Failed to load vacancies. Please refresh the page.');
      showToastRef.current('Failed to load vacancies', 'error');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPublicationRanges = useCallback(async () => {
    try {
      setLoading(true);
      const ranges = await publicationRangesAPI.getAll(showArchivedRangesRef.current);
      setPublicationRanges(ranges);
      const currentRange = selectedPublicationRangeRef.current;
      if (currentRange && !ranges.find(r => r._id === currentRange)) {
        setSelectedPublicationRangeRef.current('');
        showToastRef.current('Selected publication range is no longer available', 'info');
      }
    } catch (err) {
      console.error('Failed to load publication ranges:', err);
      setError('Failed to load publication ranges. Please refresh the page.');
      showToastRef.current('Failed to load publication ranges', 'error');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDataForPublicationRange = useCallback(async () => {
    if (!selectedPublicationRangeRef.current) {
      await loadAllActiveVacancies();
      return;
    }
    try {
      setLoading(true);
      const selectedRange   = publicationRangesRef.current.find(r => r._id === selectedPublicationRangeRef.current);
      const includeArchived = selectedRange?.isArchived || false;
      const vacanciesRes    = await vacanciesAPI.getByPublicationRange(selectedPublicationRangeRef.current, includeArchived);
      const filtered        = filterVacanciesByAssignmentRef.current(vacanciesRes, userRef.current);
      setVacancies(filtered);
    } catch (err) {
      console.error('Failed to load data for publication range:', err);
      showToastRef.current('Failed to load publication range data', 'error');
      setError('Failed to load publication range data.');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Event Handlers with useCallback
  const handleCommentChange = useCallback((field, value) => {
    setComments(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleStatusUpdate = useCallback(async (status) => {
    try {
      const updateData = {
        status,
        comments
      };
      await candidatesAPI.update(selectedCandidate, updateData);
      setCandidateDetails(prev => ({ ...prev, status, comments }));
      setCandidates(prev =>
        prev.map(c => (c._id === selectedCandidate ? { ...c, status, comments } : c))
      );
      setShowCommentModal(false);
      showToast('Candidate status updated successfully!', 'success');
    } catch (error) {
      console.error('Failed to update status:', error);
      showToast('Failed to update status: ' + (error.response?.data?.message || error.message), 'error');
    }
  }, [comments, selectedCandidate, showToast]);

  const handleViewComments = useCallback((candidate) => {
    const vacancy = vacancies.find(v => v.itemNumber === candidate.itemNumber);
    setViewCandidateData({ candidate, vacancy });
    setShowViewCommentsModal(true);
  }, [vacancies]);

  const handleViewCommentHistory = useCallback((candidate) => {
    setCommentHistoryData(candidate);
    setShowCommentHistoryModal(true);
  }, []);

  const handleGenerateReport = useCallback(async () => {
    const filteredRaters = await fetchRatersForVacancy(selectedItemNumber);
    setReportRaters(filteredRaters);
    setReportCandidateId('');
    setReportItemNumber(selectedItemNumber);
    setShowReportModal(true);
  }, [fetchRatersForVacancy, selectedItemNumber]);

  const handleViewVacancy = useCallback((itemNumber) => {
    const vacancy = vacancies.find(v => v.itemNumber === itemNumber);
    setVacancyDetails(vacancy);
    setShowVacancyModal(true);
  }, [vacancies]);

  const handleStatusCardClick = useCallback((status) => {
    if (statusFilter === status) {
      setStatusFilter(null);
    } else {
      setStatusFilter(status);
    }
  }, [statusFilter]);

  const openDocumentLink = useCallback((url) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const closeCommentModal = useCallback(() => {
    setShowCommentModal(false);
    setCommentSiblings([]);
    setCommentSiblingsLoading(false);
    setSelectedCandidate('');
    setCandidateDetails(null);
    setComments({
      education: '',
      training: '',
      experience: '',
      eligibility: ''
    });
  }, [setSelectedCandidate]);

  const closeViewCommentsModal = useCallback(() => {
    setShowViewCommentsModal(false);
    setViewCandidateData(null);
  }, []);

  const closeReportModal = useCallback(() => {
    setShowReportModal(false);
    setReportCandidateId('');
    setReportItemNumber('');
  }, []);

  const closeVacancyModal = useCallback(() => {
    setShowVacancyModal(false);
    setVacancyDetails(null);
  }, []);

  const closeCompetenciesModal = useCallback(() => {
    setShowCompetenciesModal(false);
    setCompetencies([]);
    setGroupedCompetencies({
      basic: [],
      organizational: [],
      leadership: [],
      minimum: []
    });
  }, []);

  const closeCommentHistoryModal = useCallback(() => {
    setShowCommentHistoryModal(false);
    setCommentHistoryData(null);
  }, []);

  const openGovtEmpModal = useCallback(async (candidate) => {
    setGovtEmpCandidate(candidate);
    setGovtEmpSiblings([]); // clear while loading siblings
    // Always init the form from THIS candidate's own saved DB data only.
    // NEVER pre-fill from another candidate's record or pending state.
    setGovtEmpForm({
      agency:            candidate.governmentEmployment?.agency            || '',
      position:          candidate.governmentEmployment?.position          || '',
      status:            candidate.governmentEmployment?.status            || '',
      employmentPeriod:  candidate.governmentEmployment?.employmentPeriod  || '',
      employmentEndDate: candidate.governmentEmployment?.employmentEndDate
                           ? candidate.governmentEmployment.employmentEndDate.toString().slice(0, 10)
                           : '',
      preAssessmentExam: candidate.governmentEmployment?.preAssessmentExam || '',
      remarks:           candidate.governmentEmployment?.remarks           || ''
    });
    setShowGovtEmpModal(true);
    // Use candidatesAPI.getSiblings (shared axios instance — correct baseURL + authToken).
    // Fall back to selectedPublicationRangeRef if candidate.publicationRangeId is absent.
    const pubRangeId = candidate.publicationRangeId || selectedPublicationRangeRef.current;
    if (pubRangeId) {
      setGovtEmpSiblingsLoading(true);
      try {
        const siblings = await candidatesAPI.getSiblings(
          candidate.fullName,
          candidate._id,
          pubRangeId
        );
        setGovtEmpSiblings(siblings);
      } catch {
        // Non-fatal: modal still works, propagation panel just stays empty
      } finally {
        setGovtEmpSiblingsLoading(false);
      }
    }
  }, []);

  const closeGovtEmpModal = useCallback(() => {
    setShowGovtEmpModal(false);
    setGovtEmpCandidate(null);
    setGovtEmpSiblings([]);
    setGovtEmpSiblingsLoading(false);
    setGovtEmpForm({ agency: '', position: '', status: '', employmentPeriod: '', employmentEndDate: '', preAssessmentExam: '', remarks: '' });
  }, []);

  const handleSaveGovtEmp = useCallback(async () => {
    if (!govtEmpCandidate) return;
    // Determine if the form has any employment data at all.
    // A completely empty form is a valid "clear this record" save — no field is required in that case.
    const formIsEmpty = !govtEmpForm.agency && !govtEmpForm.position && !govtEmpForm.status &&
                        !govtEmpForm.employmentPeriod && !govtEmpForm.employmentEndDate &&
                        !govtEmpForm.preAssessmentExam && !govtEmpForm.remarks;
    // Validate: preAssessmentExam required only when actual employment data is being entered
    if (!formIsEmpty && !govtEmpForm.preAssessmentExam) {
      showToast('Please select an option for "In Consideration of Pre-Assessment Examination" before saving.', 'error');
      return;
    }
    // Validate: employmentEndDate required when Within Last 2 Years
    if (govtEmpForm.employmentPeriod === 'within_2_years' && !govtEmpForm.employmentEndDate) {
      showToast('Employment End Date is required when "Within Last 2 Years" is selected.', 'error');
      return;
    }
    setGovtEmpLoading(true);
    try {
      // Save ONLY the current candidate. Siblings must be opened individually.
      const updated = await candidatesAPI.update(govtEmpCandidate._id, {
        governmentEmployment: govtEmpForm
      });
      // Reflect the save in local candidates list immediately
      setCandidates(prev =>
        prev.map(c =>
          c._id === govtEmpCandidate._id
            ? { ...c, governmentEmployment: updated.governmentEmployment }
            : c
        )
      );
      // If data was saved (non-empty), remove this candidate from the Review badge set
      // since they now have their own govt emp record. If cleared (empty save), the
      // badge would re-appear on next load if siblings still have data -- which is correct.
      const savedHasData = updated.governmentEmployment &&
        (updated.governmentEmployment.agency || updated.governmentEmployment.position ||
         updated.governmentEmployment.status || updated.governmentEmployment.preAssessmentExam);
      if (savedHasData) {
        setReviewBadgeIds(prev => {
          const next = new Set(prev);
          next.delete(govtEmpCandidate._id);
          return next;
        });
      }
      showToast('Government employment details saved.', 'success');
      closeGovtEmpModal();
    } catch (err) {
      showToast('Failed to save: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setGovtEmpLoading(false);
    }
  }, [govtEmpCandidate, govtEmpForm, closeGovtEmpModal, showToast]);

  const handleExportCSV = useCallback(async () => {
    try {
      await candidatesAPI.exportCSV({
        itemNumber: selectedItemNumber,
        assignment: selectedAssignment,
        position: selectedPosition
      });
      showToast('CSV exported successfully!', 'success');
    } catch (error) {
      console.error('Export error:', error);
      showToast('Failed to export CSV: ' + error.message, 'error');
    }
  }, [selectedItemNumber, selectedAssignment, selectedPosition, showToast]);

  const handleExportSummaryCSV = useCallback(async () => {
    try {
      await candidatesAPI.exportSummaryCSV();
      showToast('Summary CSV exported successfully!', 'success');
    } catch (error) {
      console.error('Export error:', error);
      showToast('Failed to export summary CSV: ' + error.message, 'error');
    }
  }, [showToast]);

  const loadAssignmentSummaryData = useCallback(async () => {
    setSummaryLoading(true);
    try {
      // 1. Get all active (non-archived) publication ranges
      const activeRanges = await publicationRangesAPI.getActive();

      // 2. For each active range, load vacancies and filter by this user's assignment scope
      let allVacancies = [];
      for (const range of activeRanges) {
        const rangeVacancies = await vacanciesAPI.getByPublicationRange(range._id, false);
        const filtered = filterVacanciesByAssignment(rangeVacancies, user);
        allVacancies = allVacancies.concat(filtered);
      }

      // Deduplicate vacancies by _id
      allVacancies = Array.from(new Map(allVacancies.map(v => [v._id, v])).values());

      if (allVacancies.length === 0) {
        setSummaryData([]);
        return;
      }

      // 3. Load candidates for all vacancies
      const allItemNumbers = allVacancies.map(v => v.itemNumber);
      const candidatesRes = await Promise.all(
        allItemNumbers.map(itemNumber => candidatesAPI.getByItemNumber(itemNumber, false))
      );
      const allCandidates = Array.from(
        new Map(candidatesRes.flat().map(c => [c._id, c])).values()
      );

      // 4. Build summary grouped by assignment
      const summaryMap = {};
      allVacancies.forEach(v => {
        if (!summaryMap[v.assignment]) {
          summaryMap[v.assignment] = { assignment: v.assignment, positions: {}, totalVacancies: 0 };
        }
        if (!summaryMap[v.assignment].positions[v.position]) {
          summaryMap[v.assignment].positions[v.position] = { position: v.position, itemNumbers: [] };
        }
        summaryMap[v.assignment].positions[v.position].itemNumbers.push(v.itemNumber);
        summaryMap[v.assignment].totalVacancies++;
      });

      const result = Object.values(summaryMap).map(group => {
        const itemNums = allVacancies
          .filter(v => v.assignment === group.assignment)
          .map(v => v.itemNumber);
        const groupCandidates = allCandidates.filter(c => itemNums.includes(c.itemNumber));
        return {
          ...group,
          totalCandidates: groupCandidates.length,
          generalList: groupCandidates.filter(c => c.status === CANDIDATE_STATUS.GENERAL_LIST).length,
          longListed: groupCandidates.filter(c => c.status === CANDIDATE_STATUS.LONG_LIST).length,
          forReview: groupCandidates.filter(c => c.status === CANDIDATE_STATUS.FOR_REVIEW).length,
          disqualified: groupCandidates.filter(c => c.status === CANDIDATE_STATUS.DISQUALIFIED).length,
          positions: Object.values(group.positions).map(pos => {
            const posCandidates = allCandidates.filter(c => pos.itemNumbers.includes(c.itemNumber));
            return {
              ...pos,
              totalCandidates: posCandidates.length,
              generalList: posCandidates.filter(c => c.status === CANDIDATE_STATUS.GENERAL_LIST).length,
              longListed: posCandidates.filter(c => c.status === CANDIDATE_STATUS.LONG_LIST).length,
              forReview: posCandidates.filter(c => c.status === CANDIDATE_STATUS.FOR_REVIEW).length,
              disqualified: posCandidates.filter(c => c.status === CANDIDATE_STATUS.DISQUALIFIED).length,
            };
          }),
        };
      }).sort((a, b) => a.assignment.localeCompare(b.assignment));

      setSummaryData(result);
    } catch (error) {
      console.error('Failed to load assignment summary:', error);
      showToast('Failed to load assignment summary', 'error');
      setSummaryData([]);
    } finally {
      setSummaryLoading(false);
    }
  }, [filterVacanciesByAssignment, user, showToast]);

  // STEP 6: useEffect Hooks
  // ─── Initial load + showArchivedRanges toggle ────────────────────────────
  // All three load callbacks are stable ([] deps) so this effect only ever
  // re-runs when showArchivedRanges genuinely toggles — never after a
  // candidate update or any other state change.
  useEffect(() => {
    const init = async () => {
      await loadPublicationRanges();
      if (!selectedPublicationRangeRef.current) {
        await loadAllActiveVacancies();
      } else {
        await loadDataForPublicationRange();
      }
    };
    init();
  }, [showArchivedRanges, loadPublicationRanges, loadAllActiveVacancies, loadDataForPublicationRange]);
  // All three callbacks are [] deps so adding them here is safe — they never change.

  // ─── Publication range selection change ──────────────────────────────────
  // loadDataForPublicationRange is [] deps so listing it here is safe.
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    loadDataForPublicationRange();
  }, [selectedPublicationRange, loadDataForPublicationRange]);

  // ─── Populate dropdowns when vacancies change ───────────────────────────
  // This effect ONLY manages dropdown options and restores persisted selections.
  // It does NOT trigger candidate loading — that is handled by loadCandidatesByFilters
  // which is called directly from the vacancy loaders after setVacancies.
  // loadCandidatesByFilters is stable (zero deps) so safe to list here.
  useEffect(() => {
    if (vacancies.length > 0) {
      const uniqueAssignments = [...new Set(vacancies.map(v => v.assignment))].filter(Boolean).sort();
      setAssignments(uniqueAssignments);

      if (selectedAssignment && uniqueAssignments.includes(selectedAssignment)) {
        const filteredVacancies = vacancies.filter(v => v.assignment === selectedAssignment);
        const uniquePositions   = [...new Set(filteredVacancies.map(v => v.position))].filter(Boolean).sort();
        setPositions(uniquePositions);

        if (selectedPosition && uniquePositions.includes(selectedPosition)) {
          const positionVacancies = filteredVacancies.filter(v => v.position === selectedPosition);
          const uniqueItemNumbers = [...new Set(positionVacancies.map(v => v.itemNumber))].filter(Boolean).sort();
          setItemNumbers(uniqueItemNumbers);

          if (selectedItemNumber && uniqueItemNumbers.includes(selectedItemNumber)) {
            // Restore persisted item-number selection — load its candidates
            loadCandidatesByFilters();
          } else {
            setSelectedItemNumber('');
            setSelectedCandidate('');
            setCandidates([]);
            setCandidateDetails(null);
            setVacancyDetails(null);
          }
        } else {
          setSelectedPosition('');
          setSelectedItemNumber('');
          setSelectedCandidate('');
          setCandidates([]);
          setCandidateDetails(null);
          setVacancyDetails(null);
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
      }
    } else if (vacancies.length === 0) {
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
    }
  // loadCandidatesByFilters is stable ([] deps) — safe to include without causing loops
  }, [vacancies, selectedAssignment, selectedPosition, selectedItemNumber,
      loadCandidatesByFilters, setSelectedAssignment, setSelectedPosition,
      setSelectedItemNumber, setSelectedCandidate]);

  // Validate selected candidate still exists after filter/vacancy changes
  // NOTE: Do NOT call loadCandidateDetails here — it causes a reload loop every time
  // setCandidates is called (e.g. after handleStatusUpdate). Details are loaded
  // directly in the Update button onClick and in loadCandidatesByFilters.
  useEffect(() => {
    if (candidates.length > 0 && selectedCandidate) {
      if (!candidates.find(c => c._id === selectedCandidate)) {
        setSelectedCandidate('');
        setCandidateDetails(null);
        setComments({
          education: '',
          training: '',
          experience: '',
          eligibility: ''
        });
      }
    }
  }, [candidates, selectedCandidate, setSelectedCandidate]);

  // STEP 7: Add Modal Focus Management
  useEffect(() => {
    const anyModalOpen = showCommentModal || showViewCommentsModal || 
                         showReportModal || showVacancyModal || 
                         showCompetenciesModal || showCommentHistoryModal;
                         
    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [showCommentModal, showViewCommentsModal, showReportModal, 
      showVacancyModal, showCompetenciesModal, showCommentHistoryModal]);

  // Auto-collapse filter panel using IntersectionObserver on a sentinel element.
  // This avoids the scroll-position feedback loop where collapsing the panel
  // shifts the layout, changes window.scrollY, and re-triggers the handler.
  // IntersectionObserver is based on element visibility — immune to layout shifts.
  const sentinelRef = useRef(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Sentinel is visible  → user is near top → expand
        // Sentinel is hidden   → user scrolled past it → collapse
        setIsFiltersExpanded(entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '0px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const stats = getStatistics();
  const filteredCandidates = getFilteredCandidates();
  const genderStats = getGenderStatistics();
  const currentPublicationRange = publicationRanges.find(r => r._id === selectedPublicationRange);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <div className="sticky top-14 z-40 py-1">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">

            {/* Brand */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div className="leading-tight">
                <p className="text-sm font-bold text-gray-900">Secretariat</p>
                <p className="text-xs text-gray-400">{user.name}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 flex-wrap justify-end">

              {/* Item-number-gated buttons */}
              {selectedItemNumber && (
                <>
                  <button onClick={handleExportCSV} aria-label="Export CSV"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                    style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Export CSV
                  </button>

                  <button onClick={handleGenerateReport} aria-label="Generate Report"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                    style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Generate Report
                  </button>

                  <button onClick={() => { setShowAssignmentSummary(true); loadAssignmentSummaryData(); }} aria-label="Assignment Summary"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                    style={{ background: 'linear-gradient(135deg,#0891b2,#06b6d4)' }}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    Assignment Summary
                  </button>

                  {/* Divider */}
                  <div className="w-px h-5 bg-gray-200 mx-0.5" />
                </>
              )}

              {/* Always-visible buttons */}
              <button onClick={handleExportSummaryCSV} aria-label="Export All Summary"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Export All
              </button>

              <button onClick={() => setShowCBSManual(true)} aria-label="CBS Manual"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                CBS Manual
              </button>

              <div className="w-px h-5 bg-gray-200 mx-0.5" />

              <button onClick={() => { setShowChangePassword(true); setCpError(''); setCpSuccess(''); setCpCurrentPwd(''); setCpNewPwd(''); setCpConfirmPwd(''); }} aria-label="Change Password"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ background: 'linear-gradient(135deg,#475569,#64748b)' }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                Change Password
              </button>

            </div>
          </div>
        </div>
      </div>             

      {/* Sentinel for IntersectionObserver — sits just below the sticky header.
           When this element scrolls out of view the filter panel auto-collapses;
           when it scrolls back into view the panel re-expands. Zero height so it
           never affects layout. */}
      <div ref={sentinelRef} aria-hidden="true" style={{ height: 0, overflow: 'hidden' }} />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 pb-6">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* ── Smart Collapsible Filter Panel ──────────────────────────────────
     Replaces the 4 previous stacked sticky sections.
     Single sticky container: expanded = full controls,
     collapsed = slim summary bar (auto-collapses on scroll down). */}
      <div className="sticky top-[120px] z-40 pb-1">

        {/* EXPANDED PANEL */}
        {isFiltersExpanded && (
          <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 overflow-hidden">

            {/* Publication Range row */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label htmlFor="publication-range-select" className="block text-xs font-bold text-purple-100 mb-1">Publication Range</label>
                  <select
                    id="publication-range-select"
                    value={selectedPublicationRange}
                    onChange={(e) => {
                      setSelectedPublicationRange(e.target.value);
                      setSelectedAssignment('');
                      setSelectedPosition('');
                      setSelectedItemNumber('');
                      setStatusFilter(null);
                      setGenderFilter(null);
                    }}
                    aria-label="Filter by publication range"
                    className="w-full px-3 py-2 border-2 border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-white focus:border-white bg-white text-sm font-medium shadow-sm"
                  >
                    <option value="">All Publication Ranges</option>
                    {publicationRanges.map(range => (
                      <option key={range._id} value={range._id}>
                        {range.name}
                        {range.isArchived ? ' (ARCHIVED)' : ''}
                        {range.isActive ? ' • Active' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end gap-2 shrink-0">
                  <button
                    onClick={() => setShowArchivedRanges(!showArchivedRanges)}
                    aria-label={showArchivedRanges ? 'Hide archived publication ranges' : 'Show archived publication ranges'}
                    aria-pressed={showArchivedRanges}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-md ${
                      showArchivedRanges
                        ? 'bg-white text-purple-700 hover:bg-gray-100'
                        : 'bg-purple-800 text-white hover:bg-purple-900'
                    }`}
                  >
                    {showArchivedRanges ? 'Hide Archived' : 'Show Archived'}
                  </button>
                  {/* Collapse toggle */}
                  <button
                    onClick={() => setIsFiltersExpanded(false)}
                    aria-label="Collapse filter panel"
                    title="Collapse filters"
                    className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                </div>
              </div>
              {currentPublicationRange?.isArchived && (
                <div className="mt-2 bg-orange-100 border-l-4 border-orange-500 p-2 rounded">
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-orange-600 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <div>
                      <p className="text-xs font-bold text-orange-800">Viewing Archived Publication Range</p>
                      <p className="text-xs text-orange-700">All data shown below is from the archived publication range "{currentPublicationRange.name}"</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 space-y-3">
              {/* Dropdowns row */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="assignment-select" className="block text-xs font-bold text-gray-700 mb-1">Assignment</label>
                  <select
                    id="assignment-select"
                    value={selectedAssignment}
                    onChange={(e) => setSelectedAssignment(e.target.value)}
                    aria-label="Filter by assignment"
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-sm font-medium shadow-sm"
                  >
                    <option value="">All Assignments</option>
                    {assignments.map(assignment => (
                      <option key={assignment} value={assignment}>{assignment}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="position-select" className="block text-xs font-bold text-gray-700 mb-1">Position</label>
                  <select
                    id="position-select"
                    value={selectedPosition}
                    onChange={(e) => setSelectedPosition(e.target.value)}
                    aria-label="Filter by position"
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-sm font-medium disabled:bg-gray-100 shadow-sm"
                    disabled={!selectedAssignment}
                  >
                    <option value="">All Positions</option>
                    {positions.map(position => (
                      <option key={position} value={position}>{position}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="item-number-select" className="block text-xs font-bold text-gray-700 mb-1">Item Number</label>
                  <select
                    id="item-number-select"
                    value={selectedItemNumber}
                    onChange={(e) => setSelectedItemNumber(e.target.value)}
                    aria-label="Filter by item number"
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-sm font-medium disabled:bg-gray-100 shadow-sm"
                    disabled={!selectedPosition}
                  >
                    <option value="">All Item Numbers</option>
                    {itemNumbers.map(itemNumber => (
                      <option key={itemNumber} value={itemNumber}>{itemNumber}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Stats + Gender in one inline row */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Stat filter buttons */}
                {[
                  { label: 'Total', count: stats.total, status: null, base: 'border-blue-200 bg-blue-50 text-blue-800', active: 'border-blue-500 ring-2 ring-blue-300' },
                  { label: 'Long Listed', count: stats.longListed, status: CANDIDATE_STATUS.LONG_LIST, base: 'border-green-200 bg-green-50 text-green-800', active: 'border-green-500 ring-2 ring-green-300' },
                  { label: 'For Review', count: stats.forReview, status: CANDIDATE_STATUS.FOR_REVIEW, base: 'border-yellow-200 bg-yellow-50 text-yellow-800', active: 'border-yellow-500 ring-2 ring-yellow-300' },
                  { label: 'Disqualified', count: stats.disqualified, status: CANDIDATE_STATUS.DISQUALIFIED, base: 'border-red-200 bg-red-50 text-red-800', active: 'border-red-500 ring-2 ring-red-300' },
                ].map(({ label, count, status, base, active }) => (
                  <button
                    key={label}
                    onClick={() => status === null ? setStatusFilter(null) : handleStatusCardClick(status)}
                    aria-pressed={statusFilter === status}
                    aria-label={`Filter by ${label}`}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-all ${base} ${
                      (statusFilter === status || (status === null && statusFilter === null)) ? active : 'hover:shadow-md'
                    }`}
                  >
                    <span className="text-xl font-bold leading-none">{count}</span>
                    <span className="text-xs font-semibold leading-tight">{label}</span>
                  </button>
                ))}

                {/* Divider */}
                <div className="w-px h-8 bg-gray-200 shrink-0" />

                {/* Gender filter pills */}
                <span className="text-xs font-bold text-gray-600 whitespace-nowrap">Gender:</span>
                {[
                  { label: `All (${genderStats.total})`, value: null, active: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md' },
                  { label: `Male (${genderStats.male})`, value: 'Male', active: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md' },
                  { label: `Female (${genderStats.female})`, value: 'Female', active: 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md' },
                  { label: `LGBTQI+ (${genderStats.lgbtqi})`, value: 'LGBTQI+', active: 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-md' },
                ].map(({ label, value, active }) => (
                  <button
                    key={label}
                    onClick={() => setGenderFilter(value)}
                    aria-pressed={genderFilter === value}
                    aria-label={`Show ${label}`}
                    className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all ${
                      genderFilter === value ? active : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* COLLAPSED COMPACT BAR */}
        {!isFiltersExpanded && (
          <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 px-3 py-2 flex items-center gap-3 flex-wrap">
            {/* Expand button */}
            <button
              onClick={() => setIsFiltersExpanded(true)}
              aria-label="Expand filter panel"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <span>Filters</span>
            </button>

            {/* Breadcrumb trail of active filters */}
            <div className="flex items-center gap-1 text-xs text-gray-600 flex-1 min-w-0 overflow-hidden">
              {[
                currentPublicationRange?.name || 'All Ranges',
                selectedAssignment || null,
                selectedPosition || null,
                selectedItemNumber || null,
              ].filter(Boolean).map((crumb, i, arr) => (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                  <span className={`truncate ${i === 0 ? 'font-semibold text-purple-700' : i === arr.length - 1 ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                    {crumb}
                  </span>
                </React.Fragment>
              ))}
            </div>

            {/* Mini stat pills */}
            <div className="flex items-center gap-1 shrink-0">
              {[
                { label: `All ${stats.total}`, status: null, cls: 'bg-blue-100 text-blue-800', ring: 'ring-2 ring-blue-400' },
                { label: `✓ ${stats.longListed}`, status: CANDIDATE_STATUS.LONG_LIST, cls: 'bg-green-100 text-green-800', ring: 'ring-2 ring-green-400' },
                { label: `⚠ ${stats.forReview}`, status: CANDIDATE_STATUS.FOR_REVIEW, cls: 'bg-yellow-100 text-yellow-800', ring: 'ring-2 ring-yellow-400' },
                { label: `✕ ${stats.disqualified}`, status: CANDIDATE_STATUS.DISQUALIFIED, cls: 'bg-red-100 text-red-800', ring: 'ring-2 ring-red-400' },
              ].map(({ label, status, cls, ring }) => (
                <button
                  key={label}
                  onClick={() => status === null ? setStatusFilter(null) : handleStatusCardClick(status)}
                  aria-pressed={statusFilter === status}
                  className={`px-2 py-1 rounded text-xs font-bold transition-all ${cls} ${
                    (statusFilter === status || (status === null && statusFilter === null)) ? ring : 'hover:opacity-80'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Mini gender pills */}
            <div className="w-px h-5 bg-gray-200 shrink-0" />
            <div className="flex items-center gap-1 shrink-0">
              {[
                { label: 'All', value: null },
                { label: 'M', value: 'Male' },
                { label: 'F', value: 'Female' },
                { label: '🏳️‍🌈', value: 'LGBTQI+' },
              ].map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => setGenderFilter(value)}
                  aria-pressed={genderFilter === value}
                  aria-label={`Gender filter: ${label}`}
                  className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
                    genderFilter === value ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* ── End Smart Collapsible Filter Panel ─────────────────────────── */}

        {/* Candidates Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Candidates</h3>
              <p className="text-sm text-gray-600 mt-1">
                Showing {filteredCandidates.length} candidate{filteredCandidates.length !== 1 ? 's' : ''}
                {statusFilter && ` (${getStatusLabel(statusFilter)})`}
                {genderFilter && ` (${genderFilter})`}
                {currentPublicationRange && ` from ${currentPublicationRange.name}`}
              </p>
            </div>
            {candidatesLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                Loading…
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">#</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCandidates.map((candidate, index) => {
                  const vacancy = vacancies.find(v => v.itemNumber === candidate.itemNumber);
                  return (
                    <tr key={candidate._id} className={`hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-150 ${candidate.isArchived ? 'bg-gray-100 opacity-60' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                      <td className="px-6 py-4 max-w-[220px]">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8">
                            <div className={`h-8 w-8 rounded-full ${candidate.isArchived ? 'bg-gray-400' : 'bg-gradient-to-br from-blue-500 to-indigo-600'} flex items-center justify-center`}>
                              <span className="text-xs font-medium text-white">
                                {candidate.fullName.charAt(0)}
                              </span>
                            </div>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900 flex items-center gap-2 break-words min-w-0 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleViewComments(candidate)}
                                aria-label={`View comments for ${candidate.fullName}`}
                                className="text-left font-medium text-blue-700 hover:text-blue-900 hover:underline transition-colors focus:outline-none focus:underline"
                              >
                                {candidate.fullName}
                              </button>
                              {candidate.isArchived && (
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-800 text-xs font-bold rounded">
                                  ARCHIVED
                                </span>
                              )}
                              {/* Review badge: driven by reviewBadgeIds computed on load, works across all filter levels */}
                              {reviewBadgeIds.has(candidate._id) && (
                                <button
                                  type="button"
                                  onClick={() => openGovtEmpModal(candidate)}
                                  title="A sibling application has govt employment data - open to review and optionally apply it"
                                  className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold hover:bg-amber-200 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 animate-pulse"
                                >
                                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                  </svg>
                                  Review
                                </button>
                              )}
                              {/* Government Employee indicator */}
                              {(() => {
                                const ge = candidate.governmentEmployment;
                                const isGovtEmp = ge && (ge.agency || ge.position || ge.status);
                                const isPresent = isGovtEmp && ge.employmentPeriod === 'present';
                                const isRecent  = isGovtEmp && ge.employmentPeriod === 'within_2_years';
                                const iconColor = isPresent ? 'text-emerald-600'
                                                : isRecent  ? 'text-amber-500'
                                                : isGovtEmp ? 'text-indigo-400'
                                                : 'text-gray-300 hover:text-gray-400';
                                const tooltip = isPresent ? `Present Govt Employee — ${ge.agency || ''}${ge.position ? ' · ' + ge.position : ''}${ge.status ? ' · ' + ge.status : ''}`
                                              : isRecent  ? `Within Last 2 Years — ${ge.agency || ''}${ge.position ? ' · ' + ge.position : ''}${ge.status ? ' · ' + ge.status : ''}`
                                              : isGovtEmp ? `Govt Employee — ${ge.agency || ''}${ge.position ? ' · ' + ge.position : ''}`
                                              : 'Set government employment details';
                                return (
                                  <button
                                    type="button"
                                    onClick={() => openGovtEmpModal(candidate)}
                                    title={tooltip}
                                    aria-label={tooltip}
                                    className="shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-400 rounded-full transition-transform hover:scale-110"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      className={`w-4 h-4 transition-colors ${iconColor}`}
                                      fill={isGovtEmp ? 'currentColor' : 'none'}
                                      stroke="currentColor"
                                      strokeWidth={isGovtEmp ? 0 : 1.5}
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3L2 9h2v10h3v-6h3v6h4v-6h3v6h3V9h2L12 3z" />
                                      <rect x="10" y="15" width="4" height="4" />
                                    </svg>
                                  </button>
                                );
                              })()}
                            </div>
                            <div className="text-xs text-gray-500">{candidate.gender} • Age: {(() => {
                              if (candidate.age != null) return candidate.age;
                              if (candidate.dateOfBirth) {
                                const today = new Date(), b = new Date(candidate.dateOfBirth);
                                let a = today.getFullYear() - b.getFullYear();
                                const m = today.getMonth() - b.getMonth();
                                if (m < 0 || (m === 0 && today.getDate() < b.getDate())) a--;
                                return a;
                              }
                              return 'N/A';
                            })()}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm max-w-[200px]">
                        <button
                          type="button"
                          onClick={() => handleViewVacancy(candidate.itemNumber)}
                          aria-label={`View vacancy details for ${candidate.itemNumber}`}
                          className="text-left break-words whitespace-normal text-blue-700 hover:text-blue-900 hover:underline transition-colors focus:outline-none focus:underline font-medium"
                          title={vacancy?.position}
                        >
                          {vacancy?.position || 'N/A'}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(candidate.status)}`}>
                          {getStatusLabel(candidate.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewCommentHistory(candidate)}
                            aria-label={`View comment history for ${candidate.fullName}`}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded text-xs transition-colors duration-200"
                            title="View Comment History"
                          >
                            History
                          </button>
                          {/* Only show Update button for non-archived candidates */}
                          {!candidate.isArchived && (
                            <button
                              onClick={async () => {
                                setSelectedCandidate(candidate._id);
                                loadCandidateDetails(candidate._id);
                                loadCommentSuggestions();
                                setCommentSiblings([]); // clear while loading
                                setShowCommentModal(true);
                                // Fetch siblings for propagation panel
                                const pubRangeId = candidate.publicationRangeId || selectedPublicationRangeRef.current;
                                if (pubRangeId) {
                                  setCommentSiblingsLoading(true);
                                  try {
                                    const siblings = await candidatesAPI.getSiblings(
                                      candidate.fullName,
                                      candidate._id,
                                      pubRangeId
                                    );
                                    setCommentSiblings(siblings);
                                  } catch {
                                    // Non-fatal: modal still works, propagation panel just stays empty
                                  } finally {
                                    setCommentSiblingsLoading(false);
                                  }
                                }
                              }}
                              aria-label={`Update status for ${candidate.fullName}`}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs transition-colors duration-200"
                            >
                              Update
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredCandidates.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No candidates found</h3>
                <p className="text-gray-500">
                  {statusFilter 
                    ? `No candidates with status "${getStatusLabel(statusFilter)}".` 
                    : 'No candidates match the selected criteria.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showViewCommentsModal && viewCandidateData && (() => {
        const { candidate, vacancy } = viewCandidateData;
        const comments = candidate.comments || {};
        
        // Determine header style and status text based on candidate status
        let headerStyle = '';
        let displayStatus = getStatusLabel(candidate.status);
        
        if (candidate.status === CANDIDATE_STATUS.FOR_REVIEW) {
          headerStyle = 'bg-amber-500 text-gray-900';
        } else if (candidate.status === CANDIDATE_STATUS.DISQUALIFIED) {
          headerStyle = 'bg-red-500 text-white';
        } else if (candidate.status === CANDIDATE_STATUS.LONG_LIST) {
          headerStyle = 'bg-green-500 text-white';
        } else {
          headerStyle = 'bg-gray-500 text-white';
        }

        return (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" role="dialog" aria-modal="true" aria-labelledby="view-comments-title">
            <div className="relative top-8 mx-auto border w-11/12 max-w-6xl shadow-lg rounded-lg bg-white">
              <div className={`${headerStyle} px-6 py-4 rounded-t-lg text-center`}>
                <h2 id="view-comments-title" className="text-2xl font-bold">{candidate.fullName}</h2>
                <p className="text-base font-medium mt-1 uppercase tracking-wide">{displayStatus}</p>
                {candidate.isArchived && (
                  <p className="text-sm mt-1 bg-orange-200 text-orange-900 px-3 py-1 rounded inline-block">ARCHIVED</p>
                )}
              </div>
              
              <div className="p-5">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
                  <div className="bg-gray-50 p-3 rounded">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Candidate Info</h4>
                    <div className="text-xs space-y-1">
                      <p><span className="font-medium">Gender:</span> {candidate.gender}</p>
                      <p><span className="font-medium">Age:</span> {candidate.age || 'N/A'}</p>
                      <p><span className="font-medium">Item Number:</span> {candidate.itemNumber}</p>
                    </div>
                  </div>
                  
                  {vacancy && (
                    <div className="bg-blue-50 p-3 rounded">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Position Info</h4>
                      <div className="text-xs space-y-1">
                        <p><span className="font-medium">Position:</span> {vacancy.position}</p>
                        <p><span className="font-medium">Assignment:</span> {vacancy.assignment}</p>
                        <p><span className="font-medium">Salary Grade:</span> SG {vacancy.salaryGrade}</p>
                      </div>
                    </div>
                  )}

                  <div className="bg-green-50 p-3 rounded">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Documents</h4>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { key: 'letterOfIntent', label: 'LOI', color: 'bg-blue-100 text-blue-800' },
                        { key: 'personalDataSheet', label: 'PDS', color: 'bg-green-100 text-green-800' },
                        { key: 'workExperienceSheet', label: 'WES', color: 'bg-purple-100 text-purple-800' },
                        { key: 'proofOfEligibility', label: 'POE', color: 'bg-yellow-100 text-yellow-800' },
                        { key: 'professionalLicense', label: 'P. License', color: 'bg-teal-100 text-teal-800' },
                        { key: 'certificates', label: 'Certs', color: 'bg-indigo-100 text-indigo-800' },
                        { key: 'certificateOfEmployment', label: 'COE', color: 'bg-cyan-100 text-cyan-800' },
                        { key: 'diploma', label: 'Diploma', color: 'bg-pink-100 text-pink-800' },
                        { key: 'transcriptOfRecords', label: 'TOR', color: 'bg-red-100 text-red-800' },
                        { key: 'ipcr', label: 'IPCR', color: 'bg-orange-100 text-orange-800' }
                      ].map(doc => (
                        <button
                          key={doc.key}
                          onClick={() => candidate[doc.key] && openDocumentLink(candidate[doc.key])}
                          aria-label={`Open ${doc.label} document`}
                          className={`inline-flex items-center justify-center px-2 py-1 rounded text-xs font-medium ${doc.color} ${candidate[doc.key] ? 'hover:opacity-75 transition-opacity cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                          disabled={!candidate[doc.key]}
                        >
                          {doc.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <h3 className="text-base font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-1 mb-3">Education</h3>
                    <p className="text-gray-800 text-base leading-relaxed">{comments.education || 'No comment provided.'}</p>
                  </div>
                  
                  <div>
                    <h3 className="text-base font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-1 mb-3">Training</h3>
                    <p className="text-gray-800 text-base leading-relaxed">{comments.training || 'No comment provided.'}</p>
                  </div>
                  
                  <div>
                    <h3 className="text-base font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-1 mb-3">Experience</h3>
                    <p className="text-gray-800 text-base leading-relaxed">{comments.experience || 'No comment provided.'}</p>
                  </div>
                  
                  <div>
                    <h3 className="text-base font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-1 mb-3">Eligibility</h3>
                    <p className="text-gray-800 text-base leading-relaxed">{comments.eligibility || 'No comment provided.'}</p>
                  </div>
                </div>
              </div>
              
              <div className="px-5 py-4 border-t bg-gray-50 rounded-b-lg">
                <button
                  onClick={closeViewCommentsModal}
                  aria-label="Close comments modal"
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm transition-colors duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Comment History Modal */}
      {showCommentHistoryModal && commentHistoryData && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" role="dialog" aria-modal="true" aria-labelledby="comment-history-title">
          <div className="relative top-8 mx-auto border w-11/12 max-w-5xl shadow-lg rounded-lg bg-white max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 rounded-t-lg">
              <div className="flex justify-between items-center">
                <div>
                  <h2 id="comment-history-title" className="text-2xl font-bold text-white">Comment History</h2>
                  <p className="text-purple-100 mt-1">{commentHistoryData.fullName}</p>
                  {commentHistoryData.isArchived && (
                    <p className="text-sm mt-1 bg-orange-200 text-orange-900 px-3 py-1 rounded inline-block">ARCHIVED</p>
                  )}
                </div>
                <button
                  onClick={closeCommentHistoryModal}
                  aria-label="Close comment history modal"
                  className="text-white hover:text-gray-200 text-2xl font-bold"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {/* Status History Section */}
              {commentHistoryData.statusHistory && commentHistoryData.statusHistory.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Status Change History
                  </h3>
                  <div className="space-y-3">
                    {commentHistoryData.statusHistory
                      .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))
                      .map((entry, index) => (
                        <div key={index} className="border-l-4 border-indigo-500 bg-indigo-50 p-4 rounded-r-lg">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center space-x-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                entry.oldStatus === 'long_list' ? 'bg-green-100 text-green-800' :
                                entry.oldStatus === 'for_review' ? 'bg-yellow-100 text-yellow-800' :
                                entry.oldStatus === 'disqualified' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {entry.oldStatus?.replace('_', ' ').toUpperCase() || 'NEW'}
                              </span>
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                              </svg>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                entry.newStatus === 'long_list' ? 'bg-green-100 text-green-800' :
                                entry.newStatus === 'for_review' ? 'bg-yellow-100 text-yellow-800' :
                                entry.newStatus === 'disqualified' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {entry.newStatus?.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                              <div className="font-semibold text-gray-700">
                                {entry.changedBy?.name || 'Unknown User'}
                              </div>
                              <div>
                                {new Date(entry.changedAt).toLocaleString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                            </div>
                          </div>
                          {entry.reason && (
                            <p className="text-gray-700 text-sm mt-2 italic">
                              Reason: {entry.reason}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Comments History Section */}
              {commentHistoryData.commentsHistory && commentHistoryData.commentsHistory.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    Comment History
                  </h3>
                  <div className="space-y-4">
                    {commentHistoryData.commentsHistory
                      .sort((a, b) => new Date(b.commentedAt) - new Date(a.commentedAt))
                      .map((entry, index) => (
                        <div key={index} className="border-l-4 border-purple-500 bg-gray-50 p-4 rounded-r-lg">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center space-x-3">
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                entry.field === 'education' ? 'bg-blue-100 text-blue-800' :
                                entry.field === 'training' ? 'bg-green-100 text-green-800' :
                                entry.field === 'experience' ? 'bg-purple-100 text-purple-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {entry.field.toUpperCase()}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                entry.status === 'long_list' ? 'bg-green-100 text-green-800' :
                                entry.status === 'for_review' ? 'bg-yellow-100 text-yellow-800' :
                                entry.status === 'disqualified' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {entry.status?.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                              <div className="font-semibold text-gray-700">
                                {entry.commentedBy?.name || 'Unknown User'}
                              </div>
                              <div>
                                {new Date(entry.commentedAt).toLocaleString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                            </div>
                          </div>
                          <p className="text-gray-800 text-sm mt-2 leading-relaxed">
                            {entry.comment}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* No History Message */}
              {(!commentHistoryData.statusHistory || commentHistoryData.statusHistory.length === 0) && 
              (!commentHistoryData.commentsHistory || commentHistoryData.commentsHistory.length === 0) && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No History</h3>
                  <p className="text-gray-500">No status changes or comments have been recorded for this candidate yet.</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 rounded-b-lg">
              <button
                onClick={closeCommentHistoryModal}
                aria-label="Close comment history modal"
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg text-sm transition-colors duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showCommentModal && candidateDetails && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="update-status-title">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[92vh]">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 id="update-status-title" className="text-xl font-bold text-gray-900">
                Update Status: {candidateDetails.fullName}
                {candidateDetails.isArchived && (
                  <span className="ml-3 px-3 py-1 bg-orange-100 text-orange-800 text-sm font-bold rounded">ARCHIVED</span>
                )}
              </h2>
              <button
                onClick={closeCommentModal}
                aria-label="Close update status modal"
                className="text-gray-500 hover:text-gray-700 text-xl font-bold"
              >
                ×
              </button>
            </div>
            
            {candidateDetails.isArchived && (
              <div className="mx-6 mt-4 bg-orange-100 border-l-4 border-orange-500 p-3 rounded shrink-0">
                <p className="text-sm text-orange-800">
                  <strong>Note:</strong> This candidate is archived. Updates can still be made for historical record purposes.
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">Candidate Information</h3>
                <div className="space-y-1 text-sm">
                  <p><span className="font-medium">Name:</span> {candidateDetails.fullName}</p>
                  <p><span className="font-medium">Gender:</span> {candidateDetails.gender}</p>
                  <p><span className="font-medium">Age:</span> {candidateDetails.age || 'N/A'}</p>
                  <p><span className="font-medium">Eligibility:</span> {candidateDetails.eligibility || 'N/A'}</p>
                </div>
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Documents</h4>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'letterOfIntent', label: 'Letter of Intent', color: 'bg-blue-100 text-blue-800' },
                      { key: 'personalDataSheet', label: 'Personal Data Sheet', color: 'bg-green-100 text-green-800' },
                      { key: 'workExperienceSheet', label: 'Work Experience Sheet', color: 'bg-purple-100 text-purple-800' },
                      { key: 'proofOfEligibility', label: 'Proof of Eligibility', color: 'bg-yellow-100 text-yellow-800' },
                      { key: 'professionalLicense', label: 'Professional License', color: 'bg-teal-100 text-teal-800' },
                      { key: 'certificates', label: 'Certificates', color: 'bg-indigo-100 text-indigo-800' },
                      { key: 'certificateOfEmployment', label: 'Certificate of Employment', color: 'bg-cyan-100 text-cyan-800' },
                      { key: 'diploma', label: 'Diploma', color: 'bg-pink-100 text-pink-800' },
                      { key: 'transcriptOfRecords', label: 'Transcript of Records', color: 'bg-red-100 text-red-800' },
                      { key: 'ipcr', label: 'IPCR', color: 'bg-orange-100 text-orange-800' }
                    ].map(doc => (
                      <button
                        key={doc.key}
                        onClick={() => candidateDetails[doc.key] && openDocumentLink(candidateDetails[doc.key])}
                        aria-label={`Open ${doc.label} document`}
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${doc.color} ${candidateDetails[doc.key] ? 'hover:opacity-75 transition-opacity cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                        disabled={!candidateDetails[doc.key]}
                      >
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {doc.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              {vacancyDetails && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">Position Information</h3>
                  <div className="space-y-1 text-sm">
                    <p><span className="font-medium">Position:</span> {vacancyDetails.position}</p>
                    <p><span className="font-medium">Assignment:</span> {vacancyDetails.assignment}</p>
                    <p><span className="font-medium">Salary Grade:</span> SG {vacancyDetails.salaryGrade}</p>
                    <p><span className="font-medium">Item Number:</span> {vacancyDetails.itemNumber}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Sibling propagation panel */}
              {(commentSiblingsLoading || commentSiblings.length > 0) && (() => {
                if (commentSiblingsLoading) {
                  return (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-400 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      <p className="text-xs text-blue-600">Checking for related applications…</p>
                    </div>
                  );
                }
                const FIELDS = ['education', 'training', 'experience', 'eligibility'];
                const sibsWithData = commentSiblings.filter(s =>
                  s.comments && FIELDS.some(f => s.comments[f]?.trim())
                );
                const sibsWithout = commentSiblings.filter(s =>
                  !s.comments || FIELDS.every(f => !s.comments[f]?.trim())
                );
                return (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-3">
                    {/* Header */}
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-xs font-bold text-blue-900">
                          {candidateDetails?.fullName} applied to {commentSiblings.length} other item{commentSiblings.length > 1 ? 's' : ''}.
                        </p>
                        <p className="text-[10px] text-blue-600 mt-0.5">
                          Each field can be copied individually. This save applies ONLY to this record.
                        </p>
                      </div>
                    </div>

                    {/* Siblings WITH comment data */}
                    {sibsWithData.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Comments saved on other applications:</p>
                        {sibsWithData.map(sib => {
                          const sibVacancy = vacancies.find(v => v.itemNumber === sib.itemNumber);
                          // For each field, find the last commentsHistory entry for that field
                          // to show exactly who entered that specific comment.
                          const getFieldAuthor = (field) => {
                            if (!sib.commentsHistory?.length) return null;
                            const entries = sib.commentsHistory.filter(e => e.field === field);
                            return entries.length ? entries[entries.length - 1].commentedBy : null;
                          };
                          return (
                            <div key={sib._id} className="bg-white rounded-lg border border-blue-200 px-3 py-2.5 space-y-1.5">
                              {/* Item + position */}
                              <div className="flex items-center gap-1.5 min-w-0">
                                <svg className="w-3 h-3 shrink-0 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 3L2 9h2v10h3v-6h3v6h4v-6h3v6h3V9h2L12 3z" />
                                </svg>
                                <span className="text-xs font-bold text-blue-800">{sib.itemNumber}</span>
                                {sibVacancy?.position && (
                                  <span className="text-[10px] text-blue-500 truncate">{sibVacancy.position}</span>
                                )}
                              </div>
                              {/* Per-field rows */}
                              {FIELDS.map(field => {
                                const val = sib.comments?.[field]?.trim();
                                if (!val) return null;
                                const author = getFieldAuthor(field);
                                const isCurrentUser = author?._id === user._id || author === user._id;
                                return (
                                  <div key={field} className="flex items-start justify-between gap-2 pl-1 border-l-2 border-blue-100">
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">{field}</span>
                                        {author?.name && (
                                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                            isCurrentUser ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                          }`}>
                                            {isCurrentUser ? 'You' : author.name}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-gray-700 break-words line-clamp-2">{val}</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setComments(prev => ({ ...prev, [field]: val }))}
                                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-200 transition-colors shrink-0"
                                    >
                                      Use
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Siblings WITHOUT comment data */}
                    {sibsWithout.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide mb-1">Other items with no comments yet:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {sibsWithout.map(sib => {
                            const sibVacancy = vacancies.find(v => v.itemNumber === sib.itemNumber);
                            return (
                              <span key={sib._id} className="text-[10px] bg-white border border-blue-100 text-blue-600 px-2 py-1 rounded-lg font-semibold">
                                {sib.itemNumber}{sibVacancy?.position ? ` – ${sibVacancy.position}` : ''}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <CommentInput
                label="Education Comments"
                value={comments.education}
                onChange={(value) => handleCommentChange('education', value)}
                suggestions={commentSuggestions.education}
                placeholder="Add comments about education qualifications..."
              />
              
              <CommentInput
                label="Training Comments"
                value={comments.training}
                onChange={(value) => handleCommentChange('training', value)}
                suggestions={commentSuggestions.training}
                placeholder="Add comments about training requirements..."
              />
              
              <CommentInput
                label="Experience Comments"
                value={comments.experience}
                onChange={(value) => handleCommentChange('experience', value)}
                suggestions={commentSuggestions.experience}
                placeholder="Add comments about work experience..."
              />
              
              <CommentInput
                label="Eligibility Comments"
                value={comments.eligibility}
                onChange={(value) => handleCommentChange('eligibility', value)}
                suggestions={commentSuggestions.eligibility}
                placeholder="Add comments about eligibility requirements..."
              />
            </div>

            </div>{/* end scrollable body */}

            <div className="flex justify-end space-x-3 px-6 py-4 border-t border-gray-100 shrink-0">
              <button
                onClick={() => handleStatusUpdate(CANDIDATE_STATUS.LONG_LIST)}
                aria-label="Mark candidate as long listed"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors duration-200"
              >
                Long List
              </button>
              <button
                onClick={() => handleStatusUpdate(CANDIDATE_STATUS.FOR_REVIEW)}
                aria-label="Mark candidate for review"
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded transition-colors duration-200"
              >
                For Review
              </button>
              <button
                onClick={() => handleStatusUpdate(CANDIDATE_STATUS.DISQUALIFIED)}
                aria-label="Disqualify candidate"
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors duration-200"
              >
                Disqualify
              </button>
            </div>
          </div>
        </div>
      )}

      {showVacancyModal && vacancyDetails && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" role="dialog" aria-modal="true" aria-labelledby="vacancy-details-title">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-3xl shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 id="vacancy-details-title" className="text-xl font-bold text-gray-900">Vacancy Details</h2>
                <p className="text-sm text-gray-600">{vacancyDetails.itemNumber}</p>
                {vacancyDetails.isArchived && (
                  <span className="inline-block mt-1 px-3 py-1 bg-orange-100 text-orange-800 text-xs font-bold rounded">ARCHIVED</span>
                )}
              </div>
              <button
                onClick={closeVacancyModal}
                aria-label="Close vacancy details modal"
                className="text-gray-500 hover:text-gray-700 text-xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Position</label>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{vacancyDetails.position}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Assignment</label>
                    <p className="mt-1 text-gray-900">{vacancyDetails.assignment}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Item Number</label>
                    <p className="mt-1 text-gray-900">{vacancyDetails.itemNumber}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Salary Grade</label>
                    <p className="mt-1 text-gray-900">SG {vacancyDetails.salaryGrade}</p>
                  </div>
                </div>
              </div>

              {vacancyDetails.qualifications && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Qualifications</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {vacancyDetails.qualifications.education && (
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <label className="block text-sm font-medium text-blue-700 mb-2">Education</label>
                        <p className="text-gray-900">{vacancyDetails.qualifications.education}</p>
                      </div>
                    )}
                    {vacancyDetails.qualifications.training && (
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <label className="block text-sm font-medium text-blue-700 mb-2">Training</label>
                        <p className="text-gray-900">{vacancyDetails.qualifications.training}</p>
                      </div>
                    )}
                    {vacancyDetails.qualifications.experience && (
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <label className="block text-sm font-medium text-blue-700 mb-2">Experience</label>
                        <p className="text-gray-900">{vacancyDetails.qualifications.experience}</p>
                      </div>
                    )}
                    {vacancyDetails.qualifications.eligibility && (
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <label className="block text-sm font-medium text-blue-700 mb-2">Eligibility</label>
                        <p className="text-gray-900">{vacancyDetails.qualifications.eligibility}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t">
                <button
                  onClick={() => loadCompetenciesByItemNumber(vacancyDetails.itemNumber)}
                  aria-label="View competencies for this position"
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <span>View Competencies for this Position</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCompetenciesModal && (() => {
        const totalCount = competencies.length;
        const groups = [
          {
            key: 'basic',
            label: 'Core Competencies',
            sub: 'Psycho-Social',
            items: groupedCompetencies.basic,
            type: COMPETENCY_TYPES.BASIC,
            accent: '#2563eb',
            light: '#eff6ff',
            badge: '#dbeafe',
            badgeText: '#1d4ed8',
            dot: 'bg-blue-500',
            tag: 'CORE',
            tagBg: '#dbeafe',
            tagColor: '#1e40af',
          },
          {
            key: 'organizational',
            label: 'Organizational Competencies',
            sub: 'Potential',
            items: groupedCompetencies.organizational,
            type: COMPETENCY_TYPES.ORGANIZATIONAL,
            accent: '#7c3aed',
            light: '#f5f3ff',
            badge: '#ede9fe',
            badgeText: '#5b21b6',
            dot: 'bg-violet-500',
            tag: 'ORG',
            tagBg: '#ede9fe',
            tagColor: '#5b21b6',
          },
          {
            key: 'leadership',
            label: 'Leadership Competencies',
            sub: vacancyDetails?.salaryGrade >= 18 ? `Required · SG ${vacancyDetails?.salaryGrade}` : `Optional · SG ${vacancyDetails?.salaryGrade}`,
            items: groupedCompetencies.leadership,
            type: COMPETENCY_TYPES.LEADERSHIP,
            accent: '#0891b2',
            light: '#ecfeff',
            badge: '#cffafe',
            badgeText: '#0e7490',
            dot: 'bg-cyan-500',
            tag: 'LEAD',
            tagBg: '#cffafe',
            tagColor: '#0e7490',
          },
          {
            key: 'minimum',
            label: 'Minimum Competencies',
            sub: 'Potential',
            items: groupedCompetencies.minimum,
            type: COMPETENCY_TYPES.MINIMUM,
            accent: '#d97706',
            light: '#fffbeb',
            badge: '#fef3c7',
            badgeText: '#92400e',
            dot: 'bg-amber-500',
            tag: 'MIN',
            tagBg: '#fef3c7',
            tagColor: '#92400e',
          },
        ].filter(g => g.items.length > 0);

        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center" style={{ backgroundColor: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)' }} role="dialog" aria-modal="true" aria-labelledby="competencies-title">
            <div className="relative w-full max-w-5xl mx-4 mt-8 mb-8 bg-white rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: 'calc(100vh - 4rem)' }}>

              {/* ── Header ── */}
              <div className="flex-shrink-0 px-8 pt-7 pb-5 border-b border-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <div>
                      <h2 id="competencies-title" className="text-xl font-bold text-gray-900 leading-tight">{vacancyDetails?.position}</h2>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#f1f5f9', color: '#475569' }}>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                          Item # {vacancyDetails?.itemNumber}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#f1f5f9', color: '#475569' }}>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                          SG {vacancyDetails?.salaryGrade}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                          {totalCount} {totalCount === 1 ? 'Competency' : 'Competencies'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button onClick={closeCompetenciesModal} aria-label="Close" className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              {/* ── Body ── */}
              <div className="flex-1 overflow-y-auto px-8 py-6">
                {competencies.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    </div>
                    <p className="text-base font-semibold text-gray-500">No competencies assigned yet</p>
                    <p className="text-sm text-gray-400 mt-1">This position has no competencies configured.</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {groups.map((group) => (
                      <div key={group.key}>
                        {/* Group header */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="flex-shrink-0 w-1 h-10 rounded-full" style={{ background: group.accent }} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">{group.label}</h3>
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: group.tagBg, color: group.tagColor }}>{group.tag}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{group.sub} · {group.items.length} {group.items.length === 1 ? 'item' : 'items'}</p>
                          </div>
                        </div>

                        {/* Competency rows — clean horizontal list */}
                        <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                          {group.items.map((comp, index) => (
                            <div key={comp._id} className="flex items-center gap-4 px-5 py-3.5 bg-white hover:bg-gray-50 transition-colors group">
                              {/* Index pill */}
                              <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: group.accent }}>
                                {index + 1}
                              </span>
                              {/* Name + description */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{comp.name}</p>
                                {comp.description && (
                                  <p className="text-xs text-gray-400 mt-0.5 truncate">{comp.description}</p>
                                )}
                              </div>
                              {/* CBS button — appears on hover */}
                              <button
                                onClick={() => setCbsCompetency({ name: comp.name, competencyType: group.type })}
                                title="View CBS proficiency levels"
                                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold opacity-0 group-hover:opacity-100 transition-all"
                                style={{ background: group.badge, color: group.badgeText }}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                CBS
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Footer ── */}
              <div className="flex-shrink-0 px-8 py-4 border-t border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-400">Click <strong className="text-gray-600">CBS</strong> on any row to view proficiency levels</p>
                <button
                  onClick={closeCompetenciesModal}
                  aria-label="Close competencies modal"
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Assignment Summary Modal */}
      {showAssignmentSummary && (() => {
        const grandTotal = summaryData.reduce((acc, g) => ({
          vacancies: acc.vacancies + g.totalVacancies,
          candidates: acc.candidates + g.totalCandidates,
          generalList: acc.generalList + g.generalList,
          longListed: acc.longListed + g.longListed,
          forReview: acc.forReview + g.forReview,
          disqualified: acc.disqualified + g.disqualified,
        }), { vacancies: 0, candidates: 0, generalList: 0, longListed: 0, forReview: 0, disqualified: 0 });

        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-4 rounded-t-2xl flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Assignment Summary</h2>
                    <p className="text-xs text-teal-100">
                      {user.assignedVacancies === 'assignment'
                        ? `Assigned to: ${user.assignedAssignment}`
                        : user.assignedVacancies === 'specific'
                        ? 'Specific item numbers assigned'
                        : 'All active publication ranges'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAssignmentSummary(false)}
                  aria-label="Close assignment summary"
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-1.5 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Grand Total Banner */}
              {!summaryLoading && (
                <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 grid grid-cols-6 gap-3">
                  {[
                    { label: 'Total Vacancies', value: grandTotal.vacancies, color: 'text-gray-800' },
                    { label: 'Total Applicants', value: grandTotal.candidates, color: 'text-blue-700' },
                    { label: 'General List', value: grandTotal.generalList, color: 'text-gray-600' },
                    { label: 'Long Listed', value: grandTotal.longListed, color: 'text-green-700' },
                    { label: 'For Review', value: grandTotal.forReview, color: 'text-yellow-700' },
                    { label: 'Disqualified', value: grandTotal.disqualified, color: 'text-red-700' },
                  ].map(stat => (
                    <div key={stat.label} className="text-center">
                      <div className={`text-2xl font-extrabold ${stat.color}`}>{stat.value}</div>
                      <div className="text-xs text-gray-500 font-medium">{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Scrollable Body */}
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
                {summaryLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
                    <p className="text-sm text-gray-500 font-medium">Loading all assignments across active publications...</p>
                  </div>
                ) : summaryData.length === 0 ? (
                  <div className="text-center text-gray-500 py-12">No assignment data available.</div>
                ) : (
                  summaryData.map(group => (
                    <div key={group.assignment} className="border border-gray-200 rounded-xl overflow-hidden">
                      {/* Assignment header row */}
                      <div className="bg-gradient-to-r from-teal-50 to-cyan-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200">
                        <h3 className="font-bold text-teal-800 text-sm uppercase tracking-wide">
                          {group.assignment}
                        </h3>
                        <div className="flex items-center gap-3 flex-wrap text-xs font-semibold">
                          <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-md">
                            {group.totalVacancies} {group.totalVacancies === 1 ? 'Vacancy' : 'Vacancies'}
                          </span>
                          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-md">
                            {group.totalCandidates} Applicants
                          </span>
                          {group.longListed > 0 && (
                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded-md">
                              {group.longListed} Long Listed
                            </span>
                          )}
                          {group.forReview > 0 && (
                            <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-md">
                              {group.forReview} For Review
                            </span>
                          )}
                          {group.disqualified > 0 && (
                            <span className="bg-red-100 text-red-700 px-2 py-1 rounded-md">
                              {group.disqualified} Disqualified
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Positions breakdown table */}
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                            <th className="text-left px-4 py-2 font-semibold">Position</th>
                            <th className="text-center px-3 py-2 font-semibold">Item No(s)</th>
                            <th className="text-center px-3 py-2 font-semibold">Applicants</th>
                            <th className="text-center px-3 py-2 font-semibold">General</th>
                            <th className="text-center px-3 py-2 font-semibold">Long Listed</th>
                            <th className="text-center px-3 py-2 font-semibold">For Review</th>
                            <th className="text-center px-3 py-2 font-semibold">Disqualified</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {group.positions.map(pos => (
                            <tr key={pos.position} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-2.5 font-medium text-gray-800">{pos.position}</td>
                              <td className="px-3 py-2.5 text-center text-gray-500 text-xs">
                                {pos.itemNumbers.join(', ')}
                              </td>
                              <td className="px-3 py-2.5 text-center font-bold text-blue-700">{pos.totalCandidates}</td>
                              <td className="px-3 py-2.5 text-center text-gray-600">{pos.generalList}</td>
                              <td className="px-3 py-2.5 text-center text-green-700 font-semibold">{pos.longListed}</td>
                              <td className="px-3 py-2.5 text-center text-yellow-700 font-semibold">{pos.forReview}</td>
                              <td className="px-3 py-2.5 text-center text-red-700 font-semibold">{pos.disqualified}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setShowAssignmentSummary(false)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Change Password Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#475569,#64748b)' }}>
                  <svg className="w-4.5 h-4.5 text-white w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Change Password</h2>
                  <p className="text-xs text-gray-400">{user.name}</p>
                </div>
              </div>
              <button onClick={() => setShowChangePassword(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {cpSuccess ? (
                <div className="flex flex-col items-center py-6 text-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">Password changed successfully!</p>
                  <p className="text-xs text-gray-400">Use your new password next time you log in.</p>
                  <button onClick={() => setShowChangePassword(false)} className="mt-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90" style={{ background: 'linear-gradient(135deg,#475569,#64748b)' }}>Done</button>
                </div>
              ) : (
                <>
                  {cpError && (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200">
                      <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <p className="text-xs font-medium text-red-700">{cpError}</p>
                    </div>
                  )}

                  {[
                    { label: 'Current Password', value: cpCurrentPwd, setter: setCpCurrentPwd, placeholder: 'Enter your current password' },
                    { label: 'New Password', value: cpNewPwd, setter: setCpNewPwd, placeholder: 'At least 8 characters' },
                    { label: 'Confirm New Password', value: cpConfirmPwd, setter: setCpConfirmPwd, placeholder: 'Repeat new password' },
                  ].map(({ label, value, setter, placeholder }) => (
                    <div key={label}>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
                      <input
                        type={cpShow ? 'text' : 'password'}
                        value={value}
                        onChange={e => setter(e.target.value)}
                        placeholder={placeholder}
                        disabled={cpLoading}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 transition-all disabled:bg-gray-50"
                      />
                    </div>
                  ))}

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={cpShow} onChange={e => setCpShow(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300 text-slate-600" />
                    <span className="text-xs text-gray-500">Show passwords</span>
                  </label>

                  <p className="text-xs text-gray-400">Minimum 8 characters. You will need to log in again after changing.</p>
                </>
              )}
            </div>

            {/* Footer */}
            {!cpSuccess && (
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
                <button onClick={() => setShowChangePassword(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-all" disabled={cpLoading}>
                  Cancel
                </button>
                <button
                  disabled={cpLoading}
                  onClick={async () => {
                    setCpError('');
                    if (!cpCurrentPwd) { setCpError('Current password is required'); return; }
                    if (!cpNewPwd || cpNewPwd.length < 8) { setCpError('New password must be at least 8 characters'); return; }
                    if (cpNewPwd !== cpConfirmPwd) { setCpError('New passwords do not match'); return; }
                    if (cpCurrentPwd === cpNewPwd) { setCpError('New password must differ from current password'); return; }
                    setCpLoading(true);
                    try {
                      await usersAPI.changeSelfPassword(cpCurrentPwd, cpNewPwd);
                      setCpSuccess(true);
                    } catch (err) {
                      setCpError(err.response?.data?.message || 'Failed to change password');
                    } finally {
                      setCpLoading(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#475569,#64748b)' }}
                >
                  {cpLoading ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                  ) : (
                    <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Change Password</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CBS Manual Modal — browse mode */}
      {showCBSManual && (
        <CompetencyDetailModal
          browseMode={true}
          onClose={() => setShowCBSManual(false)}
        />
      )}

      {/* CBS Manual Modal — specific competency from competencies list */}
      {cbsCompetency && (
        <CompetencyDetailModal
          competencyName={cbsCompetency.name}
          competencyType={cbsCompetency.competencyType}
          suggestedLevel="BASIC"
          onClose={() => setCbsCompetency(null)}
        />
      )}

      {/* Government Employment Modal */}
      {showGovtEmpModal && govtEmpCandidate && (() => {
        const ge = govtEmpCandidate.governmentEmployment;
        const isGovtEmp = ge && (ge.agency || ge.position || ge.status);
        const hasInput = govtEmpForm.agency || govtEmpForm.position || govtEmpForm.status;
        const formIsEmpty = !govtEmpForm.agency && !govtEmpForm.position && !govtEmpForm.status &&
                            !govtEmpForm.employmentPeriod && !govtEmpForm.employmentEndDate &&
                            !govtEmpForm.preAssessmentExam && !govtEmpForm.remarks;
        const isWithin2Years = govtEmpForm.employmentPeriod === 'within_2_years';

        // ── Audit: check employmentEndDate against the publication range's endDate ──
        // The end date must fall within [pubEndDate − 2 years, pubEndDate] to be valid.
        const pubRange = publicationRanges.find(r => r._id === selectedPublicationRange);
        const pubEndDate = pubRange?.endDate ? new Date(pubRange.endDate) : null;

        let endDateAudit = null; // null = no issue; object = warning info
        if (isWithin2Years && govtEmpForm.employmentEndDate && pubEndDate) {
          const empEnd = new Date(govtEmpForm.employmentEndDate);
          const twoYearsBefore = new Date(pubEndDate);
          twoYearsBefore.setFullYear(twoYearsBefore.getFullYear() - 2);

          const afterPubEnd   = empEnd > pubEndDate;
          const beforeCutoff  = empEnd < twoYearsBefore;

          if (afterPubEnd) {
            endDateAudit = {
              type: 'error',
              message: `Employment end date is after the publication end date (${pubEndDate.toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' })}). This cannot be "within last 2 years" of the vacancy.`,
            };
          } else if (beforeCutoff) {
            endDateAudit = {
              type: 'warn',
              message: `Employment ended more than 2 years before the publication end date (${pubEndDate.toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' })}). This does NOT qualify as "within last 2 years."`,
            };
          }
        } else if (isWithin2Years && govtEmpForm.employmentEndDate && !pubEndDate) {
          // No publication range selected — cannot validate, soft notice
          endDateAudit = {
            type: 'info',
            message: 'No publication range is selected, so the 2-year window cannot be verified automatically.',
          };
        }

        return (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="govt-emp-modal-title">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
              {/* Header */}
              <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    hasInput && govtEmpForm.employmentPeriod === 'present'        ? 'bg-emerald-100' :
                    hasInput && govtEmpForm.employmentPeriod === 'within_2_years' ? 'bg-amber-100'   :
                    hasInput ? 'bg-indigo-100' : 'bg-gray-100'
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={`w-5 h-5 ${
                      hasInput && govtEmpForm.employmentPeriod === 'present'        ? 'text-emerald-600' :
                      hasInput && govtEmpForm.employmentPeriod === 'within_2_years' ? 'text-amber-500'   :
                      hasInput ? 'text-indigo-600' : 'text-gray-400'
                    }`} fill="currentColor">
                      <path d="M12 3L2 9h2v10h3v-6h3v6h4v-6h3v6h3V9h2L12 3z" />
                    </svg>
                  </div>
                  <div>
                    <h2 id="govt-emp-modal-title" className="text-sm font-bold text-gray-900">Government Employment</h2>
                    <p className="text-xs text-gray-500">{govtEmpCandidate.fullName}</p>
                  </div>
                </div>
                <button onClick={closeGovtEmpModal} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4 flex-1 overflow-y-auto">
                {/* Status pill */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
                  hasInput && govtEmpForm.employmentPeriod === 'present'        ? 'bg-emerald-50 text-emerald-700' :
                  hasInput && govtEmpForm.employmentPeriod === 'within_2_years' ? 'bg-amber-50 text-amber-700'     :
                  hasInput ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-50 text-gray-500'
                }`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    hasInput && govtEmpForm.employmentPeriod === 'present'        ? 'bg-emerald-500' :
                    hasInput && govtEmpForm.employmentPeriod === 'within_2_years' ? 'bg-amber-500'   :
                    hasInput ? 'bg-indigo-500' : 'bg-gray-300'
                  }`} />
                  {hasInput && govtEmpForm.employmentPeriod === 'present'        ? 'Present government employee' :
                   hasInput && govtEmpForm.employmentPeriod === 'within_2_years' ? 'Government employee within last 2 years' :
                   hasInput ? 'Government employee (period not set)' : 'No government employment details set'}
                </div>

                {/* Sibling panel: same applicant under other item numbers */}
                {(govtEmpSiblingsLoading || govtEmpSiblings.length > 0) && (() => {
                  if (govtEmpSiblingsLoading) {
                    return (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-400 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        <p className="text-xs text-blue-600">Checking for related applications…</p>
                      </div>
                    );
                  }
                  const sibsWithData = govtEmpSiblings.filter(s =>
                    s.governmentEmployment &&
                    (s.governmentEmployment.agency || s.governmentEmployment.position ||
                     s.governmentEmployment.status || s.governmentEmployment.preAssessmentExam)
                  );
                  const sibsWithout = govtEmpSiblings.filter(s =>
                    !s.governmentEmployment ||
                    (!s.governmentEmployment.agency && !s.governmentEmployment.position &&
                     !s.governmentEmployment.status && !s.governmentEmployment.preAssessmentExam)
                  );
                  return (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-3">
                      {/* Header */}
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-xs font-bold text-blue-900">
                            {govtEmpCandidate.fullName} applied to {govtEmpSiblings.length} other item{govtEmpSiblings.length > 1 ? 's' : ''}.
                          </p>
                          <p className="text-[10px] text-blue-600 mt-0.5">
                            This save applies ONLY to this record. Open each sibling separately to set their data.
                          </p>
                        </div>
                      </div>

                      {/* Siblings WITH existing data - show suggestion cards */}
                      {sibsWithData.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Data already saved on other applications:</p>
                          {sibsWithData.map(sib => {
                            const sibVacancy = vacancies.find(v => v.itemNumber === sib.itemNumber);
                            const ge = sib.governmentEmployment;
                            const enteredBy = ge?.lastUpdatedBy?.name;
                            const isCurrentUser = ge?.lastUpdatedBy?._id === user._id ||
                                                  ge?.lastUpdatedBy === user._id;
                            return (
                              <div key={sib._id} className="bg-white rounded-lg border border-blue-200 px-3 py-2.5 space-y-1.5">
                                {/* Item + position row */}
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <svg className="w-3 h-3 shrink-0 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M12 3L2 9h2v10h3v-6h3v6h4v-6h3v6h3V9h2L12 3z" />
                                    </svg>
                                    <span className="text-xs font-bold text-blue-800">{sib.itemNumber}</span>
                                    {sibVacancy?.position && (
                                      <span className="text-[10px] text-blue-500 truncate">{sibVacancy.position}</span>
                                    )}
                                  </div>
                                  {/* Who entered the data */}
                                  {enteredBy ? (
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                                      isCurrentUser ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                    }`}>
                                      {isCurrentUser ? 'You' : enteredBy}
                                    </span>
                                  ) : null}
                                </div>
                                {/* Data preview */}
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-600">
                                  {ge.agency    && <span><span className="font-semibold text-gray-700">Agency:</span> {ge.agency}</span>}
                                  {ge.position  && <span><span className="font-semibold text-gray-700">Position:</span> {ge.position}</span>}
                                  {ge.status    && <span><span className="font-semibold text-gray-700">Status:</span> {ge.status}</span>}
                                  {ge.employmentPeriod && (
                                    <span><span className="font-semibold text-gray-700">Period:</span> {
                                      ge.employmentPeriod === 'present' ? 'Present' : 'Within Last 2 Yrs'
                                    }</span>
                                  )}
                                  {ge.preAssessmentExam && (
                                    <span><span className="font-semibold text-gray-700">Pre-Exam:</span> {
                                      ge.preAssessmentExam === 'more_than_6_months' ? '>6 months' : '<6 months'
                                    }</span>
                                  )}
                                </div>
                                {/* Use this data button */}
                                <button
                                  type="button"
                                  onClick={() => setGovtEmpForm({
                                    agency:            ge.agency            || '',
                                    position:          ge.position          || '',
                                    status:            ge.status            || '',
                                    employmentPeriod:  ge.employmentPeriod  || '',
                                    employmentEndDate: ge.employmentEndDate
                                      ? ge.employmentEndDate.toString().slice(0, 10)
                                      : '',
                                    preAssessmentExam: ge.preAssessmentExam || '',
                                    remarks:           ge.remarks           || ''
                                  })}
                                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-200 transition-colors"
                                >
                                  Use this data
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Siblings WITHOUT data - info only */}
                      {sibsWithout.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide mb-1">Other items with no data yet:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {sibsWithout.map(sib => {
                              const sibVacancy = vacancies.find(v => v.itemNumber === sib.itemNumber);
                              return (
                                <span key={sib._id} className="text-[10px] bg-white border border-blue-100 text-blue-600 px-2 py-1 rounded-lg font-semibold">
                                  {sib.itemNumber}{sibVacancy?.position ? ` – ${sibVacancy.position}` : ''}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Row 1: Agency + Position */}
                <div className="grid grid-cols-2 gap-4">
                  <AutocompleteInput
                    label="Government Agency"
                    value={govtEmpForm.agency}
                    onChange={v => setGovtEmpForm(f => ({ ...f, agency: v }))}
                    options={PH_GOVERNMENT_AGENCIES}
                    placeholder="Type to search agencies…"
                  />
                  <AutocompleteInput
                    label="Position"
                    value={govtEmpForm.position}
                    onChange={v => setGovtEmpForm(f => ({ ...f, position: v }))}
                    options={govtEmpPositions}
                    onAddCustom={newVal => setGovtEmpCustomPositions(prev =>
                      prev.includes(newVal) ? prev : [...prev, newVal]
                    )}
                    placeholder="Type to search positions…"
                  />
                </div>

                {/* Row 2: Employment Status (full width) */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Employment Status</label>
                  <select
                    value={govtEmpForm.status}
                    onChange={e => setGovtEmpForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all bg-white"
                  >
                    <option value="">— Select status —</option>
                    <option value="Permanent">Permanent</option>
                    <option value="Casual">Casual</option>
                    <option value="Temporary">Temporary</option>
                    <option value="Co-terminus with the incumbent">Co-terminus with the incumbent</option>
                    <option value="Contractual-PS">Contractual-PS</option>
                    <option value="Contractual">Contractual</option>
                  </select>
                </div>

                {/* Employment End Date — only shown when Within Last 2 Years is selected */}
                {isWithin2Years && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Employment End Date
                      <span className="ml-1 font-semibold text-red-500">*</span>
                      <span className="ml-1 font-normal text-gray-400">(required)</span>
                    </label>
                    <input
                      type="date"
                      value={govtEmpForm.employmentEndDate}
                      max={pubEndDate ? pubEndDate.toISOString().slice(0, 10) : undefined}
                      onChange={e => setGovtEmpForm(f => ({ ...f, employmentEndDate: e.target.value }))}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                        endDateAudit?.type === 'error' ? 'border-red-400 focus:ring-red-400 bg-red-50'       :
                        endDateAudit?.type === 'warn'  ? 'border-amber-400 focus:ring-amber-400 bg-amber-50' :
                        !govtEmpForm.employmentEndDate  ? 'border-amber-300 focus:ring-amber-400 bg-amber-50' :
                        'border-gray-200 focus:ring-indigo-400'
                      }`}
                    />
                  </div>
                )}

                {/* Audit feedback banner for end date */}
                {isWithin2Years && endDateAudit && (
                  <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs font-medium ${
                    endDateAudit.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200'       :
                    endDateAudit.type === 'warn'  ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                    'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    {endDateAudit.type === 'error' && <svg className="w-4 h-4 shrink-0 mt-px text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    {endDateAudit.type === 'warn'  && <svg className="w-4 h-4 shrink-0 mt-px text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>}
                    {endDateAudit.type === 'info'  && <svg className="w-4 h-4 shrink-0 mt-px text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    <span>{endDateAudit.message}</span>
                  </div>
                )}
                {isWithin2Years && !endDateAudit && govtEmpForm.employmentEndDate && pubEndDate && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                    <svg className="w-4 h-4 shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>End date is within 2 years of the publication end date ({pubEndDate.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}).</span>
                  </div>
                )}
                {isWithin2Years && !govtEmpForm.employmentEndDate && (
                  <p className="text-xs text-red-600 flex items-center gap-1 font-semibold">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                    Employment End Date is required for "Within Last 2 Years".
                  </p>
                )}

                {/* Row 3: Employment Period + Pre-Assessment Exam side by side */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Employment Period */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">Employment Period</label>
                    <div className="flex flex-col gap-2">
                      {[
                        { value: 'present',        label: 'Present Employment',  color: 'peer-checked:border-emerald-500 peer-checked:bg-emerald-50', dot: 'bg-emerald-500', text: 'peer-checked:text-emerald-700' },
                        { value: 'within_2_years', label: 'Within Last 2 Years', color: 'peer-checked:border-amber-500 peer-checked:bg-amber-50',     dot: 'bg-amber-500',   text: 'peer-checked:text-amber-700'  },
                      ].map(({ value, label, color, dot, text }) => (
                        <label key={value} className="cursor-pointer">
                          <input
                            type="radio"
                            name="employmentPeriod"
                            value={value}
                            checked={govtEmpForm.employmentPeriod === value}
                            onChange={() => setGovtEmpForm(f => ({
                              ...f,
                              employmentPeriod: value,
                              ...(value !== 'within_2_years' ? { employmentEndDate: '' } : {})
                            }))}
                            className="peer sr-only"
                          />
                          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-gray-200 transition-all ${color}`}>
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${govtEmpForm.employmentPeriod === value ? dot : 'bg-gray-300'}`} />
                            <span className={`text-xs font-semibold ${govtEmpForm.employmentPeriod === value ? text.replace('peer-checked:', '') : 'text-gray-500'}`}>{label}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                    {govtEmpForm.employmentPeriod && (
                      <button type="button" onClick={() => setGovtEmpForm(f => ({ ...f, employmentPeriod: '', employmentEndDate: '' }))} className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">Clear selection</button>
                    )}
                  </div>

                  {/* Pre-Assessment Examination */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">
                      In Consideration of Pre-Assessment Examination
                      <span className="ml-1 font-semibold text-red-500">*</span>
                    </label>
                    <div className="flex flex-col gap-2">
                      {[
                        { value: 'more_than_6_months', label: 'More than 6 Months', color: 'peer-checked:border-indigo-500 peer-checked:bg-indigo-50', dot: 'bg-indigo-500', text: 'peer-checked:text-indigo-700' },
                        { value: 'less_than_6_months', label: 'Less than 6 Months', color: 'peer-checked:border-violet-500 peer-checked:bg-violet-50', dot: 'bg-violet-500', text: 'peer-checked:text-violet-700' },
                      ].map(({ value, label, color, dot, text }) => (
                        <label key={value} className="cursor-pointer">
                          <input
                            type="radio"
                            name="preAssessmentExam"
                            value={value}
                            checked={govtEmpForm.preAssessmentExam === value}
                            onChange={() => setGovtEmpForm(f => ({ ...f, preAssessmentExam: value }))}
                            className="peer sr-only"
                          />
                          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-gray-200 transition-all ${color}`}>
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${govtEmpForm.preAssessmentExam === value ? dot : 'bg-gray-300'}`} />
                            <span className={`text-xs font-semibold ${govtEmpForm.preAssessmentExam === value ? text.replace('peer-checked:', '') : 'text-gray-500'}`}>{label}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                    {govtEmpForm.preAssessmentExam && (
                      <button type="button" onClick={() => setGovtEmpForm(f => ({ ...f, preAssessmentExam: '' }))} className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">Clear selection</button>
                    )}
                  </div>
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Remarks</label>
                  <textarea
                    value={govtEmpForm.remarks}
                    onChange={e => setGovtEmpForm(f => ({ ...f, remarks: e.target.value }))}
                    placeholder="Optional notes about this employment…"
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all resize-none"
                  />
                </div>

                {/* Clear hint */}
                {hasInput ? (
                  <p className="text-xs text-gray-400">
                    Clear all fields and save to remove this applicant's government employment record entirely.
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    All fields are empty — saving now will clear any existing government employment record for this applicant.
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center gap-2 shrink-0">
                {/* Clear All button on the left */}
                <button
                  type="button"
                  onClick={() => setGovtEmpForm({ agency: '', position: '', status: '', employmentPeriod: '', employmentEndDate: '', preAssessmentExam: '', remarks: '' })}
                  disabled={govtEmpLoading}
                  className="px-4 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 border border-red-200 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  title="Clear all form fields (does not affect saved data until you Save)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Clear All
                </button>
                {/* Cancel + Save on the right */}
                <div className="flex gap-2">
                  <button
                    onClick={closeGovtEmpModal}
                    disabled={govtEmpLoading}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveGovtEmp}
                    disabled={
                      govtEmpLoading ||
                      endDateAudit?.type === 'error' ||
                      (!formIsEmpty && !govtEmpForm.preAssessmentExam) ||
                      (govtEmpForm.employmentPeriod === 'within_2_years' && !govtEmpForm.employmentEndDate)
                    }
                    title={
                      endDateAudit?.type === 'error'
                        ? 'Fix the employment end date error before saving.'
                        : (!formIsEmpty && !govtEmpForm.preAssessmentExam)
                        ? 'Select an option for "In Consideration of Pre-Assessment Examination" before saving.'
                        : (govtEmpForm.employmentPeriod === 'within_2_years' && !govtEmpForm.employmentEndDate)
                        ? 'Employment End Date is required when "Within Last 2 Years" is selected.'
                        : formIsEmpty
                        ? 'Save empty form to remove government employment record for this applicant.'
                        : undefined
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)' }}
                  >
                    {govtEmpLoading ? (
                      <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Save
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showReportModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
          <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h2 id="report-modal-title" className="text-xl font-bold text-gray-900">Candidate Report</h2>
              <button
                onClick={closeReportModal}
                aria-label="Close report modal"
                className="text-gray-500 hover:text-gray-700 text-xl font-bold"
              >
                ×
              </button>
            </div>
            <PDFReport 
              candidateId={reportCandidateId} 
              itemNumber={reportItemNumber} 
              user={user} 
              raters={reportRaters}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ── Government Employment Data ────────────────────────────────────────────────

const GOVT_EMP_POSITIONS = [
  'ACCOUNTANT I','ACCOUNTANT II','ACCOUNTANT III','ACCOUNTING ANALYST',
  'ADMINISTRATIVE AIDE IV','ADMINISTRATIVE AIDE VI',
  'ADMINISTRATIVE ASSISTANT I','ADMINISTRATIVE ASSISTANT II','ADMINISTRATIVE ASSISTANT III',
  'ADMINISTRATIVE OFFICER I','ADMINISTRATIVE OFFICER II','ADMINISTRATIVE OFFICER III',
  'ADMINISTRATIVE OFFICER IV','ADMINISTRATIVE OFFICER V',
  'ADMINISTRATIVE STAFF','ADMINISTRATIVE SUPPORT STAFF',
  'APPLICATION DEVELOPER II','ATTORNEY II','ATTORNEY III','ATTORNEY IV','ATTORNEY V',
  'AUDIT ASSISTANT','AUDIT ASSOCIATE',
  'BIOLOGIST I','BIOLOGIST II','BOOKKEEPING ASSISTANT',
  'CARTOGRAPHER I','CARTOGRAPHER II','CARTOGRAPHER III','CARTOGRAPHER IV',
  'CBFM MONITORING AND EVALUATION OFFICER',
  'CHIEF ADMINISTRATIVE OFFICER','CLERK II',
  'COMMUNICATIONS DEVELOPMENT OFFICER I','COMMUNICATIONS DEVELOPMENT OFFICER II',
  'COMMUNITY AFFAIRS OFFICER I',
  'COMPUTER PROGRAMMER I','COMPUTER PROGRAMMER II','COMPUTER TECHNICIAN',
  'CREDIT OFFICER I',
  'DATA MANAGEMENT OFFICER','DATA MANAGEMENT STAFF',
  'DATABASE MANAGEMENT OFFICER','DATABASE MANAGEMENT STAFF',
  'DATABASE MANAGER FOR INSTRUMENTATION',
  'DEVELOPMENT COMMUNICATIONS SPECIALIST',
  'DEVELOPMENT MANAGEMENT OFFICER II','DEVELOPMENT MANAGEMENT OFFICER III',
  'DEVELOPMENT MANAGEMENT OFFICER IV','DEVELOPMENT MANAGEMENT OFFICER V',
  'DIPLOMA','DRAFTSMAN II','DRIVER','DRIVER/MECHANIC/PC TECHNICIAN',
  'ECONOMIST I','ECOSYSTEMS MANAGEMENT SPECIALIST I','ECOSYSTEMS MANAGEMENT SPECIALIST II',
  'ELECTRICAL ENGINEER','ENCODER','ENGINEER I','ENGINEER II','ENGINEER III',
  'ENGINEER IV','ENGINEER V','ENGINEERING AIDE',
  'FINANCIAL ANALYST','FOREST EXTENSION OFFICER','FORESTER I','FORESTER II','FORESTER III',
  'GEOGRAPHIC INFORMATION SYSTEMS SPECIALIST I',
  'GIS OPERATOR I','GIS SPECIALIST',
  'HEALTH & WELLNESS SPECIALIST II (NURSE)',
  'ICT INFRASTRUCTURE AND OPERATIONS OFFICER','ICT TECHNICAL SUPPORT II',
  'INFORMATION ASSISTANT I','INFORMATION OFFICER I','INFORMATION OFFICER II',
  'INFORMATION SYSTEMS ANALYST II','INFORMATION SYSTEMS ANALYST III',
  'INFORMATION TECHNOLOGIST',
  'LAND MANAGEMENT EXAMINER',
  'LAND MANAGEMENT OFFICER I','LAND MANAGEMENT OFFICER II',
  'LAND MANAGEMENT OFFICER III','LAND MANAGEMENT OFFICER IV',
  'LEGAL ASSISTANT II','LEGAL RESEARCHER',
  'MATHEMATICIAN AIDE I','MATHEMATICIAN AIDE II',
  'MONITORING AND EVALUATION OFFICER II',
  'NURSERY AIDE',
  'OFFICE SUPPORT ASSISTANT','OFFICE SUPPORT OFFICER',
  'PARKS OPERATIONS SUPERINTENDENT IV',
  'PLANNING AND PROGRAMMING OFFICER II',
  'PLANNING CONTROL OFFICER',
  'PLANNING OFFICER I','PLANNING OFFICER II','PLANNING OFFICER III',
  'PLANNING OFFICER IV','PLANNING OFFICER V',
  'PRECISION INSTRUMENT TECH. II',
  'PROJECT ADMINISTRATIVE OFFICER I',
  'PROJECT COORDINATOR',
  'PROJECT DEVELOPMENT OFFICER',
  'PROJECT DOCUMENTATION ASSISTANT','PROJECT DOCUMENTATION SPECIALIST',
  'PROJECT EVALUATION OFFICER I','PROJECT EVALUATION OFFICER II','PROJECT EVALUATION OFFICER III',
  'PROJECT MONITORING ASSISTANT',
  'PROJECT OPERATIONS MANAGER',
  'PROJECT PLANNING AND DEVELOPMENT OFFICER I','PROJECT PLANNING AND DEVELOPMENT OFFICER II',
  'PROJECT TECHNICAL OFFICER I','PROJECT TECHNICAL OFFICER II',
  'PROPERTY OFFICER I',
  'SCIENCE RESEARCH ASSISTANT',
  'SENIOR COMMUNICATIONS DEVELOPMENT OFFICER',
  'SENIOR ECOSYSTEMS MANAGEMENT SPECIALIST',
  'SENIOR FOREST MANAGEMENT SPECIALIST',
  'SPECIAL INVESTIGATOR I',
  'STATISTICIAN I','STATISTICIAN II',
  'SUPERVISING ADMINISTRATIVE OFFICER',
  'TECHNICAL SUPPORT STAFF','TRACER',
  'TRAINING PROGRAM OFFICER',
  'WEMIS DATABASE ENCODER',
  'ZOOLOGY TECHNICIAN',
];

const PH_GOVERNMENT_AGENCIES = [
  // ── Constitutional Bodies ──────────────────────────────────────────────────
  'Civil Service Commission (CSC)',
  'Commission on Audit (COA)',
  'Commission on Elections (COMELEC)',
  'Office of the Ombudsman',
  'Commission on Human Rights (CHR)',
  // ── Office of the President ────────────────────────────────────────────────
  'Office of the President (OP)',
  'Office of the Executive Secretary',
  'Presidential Communications Office (PCO)',
  'Presidential Management Staff (PMS)',
  'National Security Council (NSC)',
  'Presidential Adviser on Peace, Reconciliation and Unity (PAPRU)',
  // ── Executive Departments ──────────────────────────────────────────────────
  'Department of Agrarian Reform (DAR)',
  'Department of Agriculture (DA)',
  'Department of Budget and Management (DBM)',
  'Department of Education (DepEd)',
  'Department of Energy (DOE)',
  'Department of Environment and Natural Resources (DENR)',
  'Department of Finance (DOF)',
  'Department of Foreign Affairs (DFA)',
  'Department of Health (DOH)',
  'Department of Human Settlements and Urban Development (DHSUD)',
  'Department of Information and Communications Technology (DICT)',
  'Department of the Interior and Local Government (DILG)',
  'Department of Justice (DOJ)',
  'Department of Labor and Employment (DOLE)',
  'Department of Migrant Workers (DMW)',
  'Department of National Defense (DND)',
  'Department of Public Works and Highways (DPWH)',
  'Department of Science and Technology (DOST)',
  'Department of Social Welfare and Development (DSWD)',
  'Department of Tourism (DOT)',
  'Department of Trade and Industry (DTI)',
  'Department of Transportation (DOTr)',
  // ── Other Executive Offices / Authorities / Commissions ───────────────────
  'Bangko Sentral ng Pilipinas (BSP)',
  'Board of Investments (BOI)',
  'Bureau of Customs (BOC)',
  'Bureau of Internal Revenue (BIR)',
  'Bureau of Immigration (BI)',
  'Bureau of Fisheries and Aquatic Resources (BFAR)',
  'Bureau of Local Government Finance (BLGF)',
  'Bureau of the Treasury (BTr)',
  'Civil Aeronautics Board (CAB)',
  'Climate Change Commission (CCC)',
  'Cooperative Development Authority (CDA)',
  'Film Development Council of the Philippines (FDCP)',
  'Games and Amusements Board (GAB)',
  'Governance Commission for GOCCs (GCG)',
  'Government Service Insurance System (GSIS)',
  'Housing and Urban Development Coordinating Council (HUDCC)',
  'Insurance Commission (IC)',
  'Intellectual Property Office of the Philippines (IPOPHL)',
  'Land Authority',
  'Land Bank of the Philippines (LBP)',
  'Land Registration Authority (LRA)',
  'Local Water Utilities Administration (LWUA)',
  'Metropolitan Waterworks and Sewerage System (MWSS)',
  'Mindanao Development Authority (MinDA)',
  'National Agri-Business Corporation (NABCOR)',
  'National Amnesty Commission (NAC)',
  'National Anti-Poverty Commission (NAPC)',
  'National Commission for Culture and the Arts (NCCA)',
  'National Commission on Indigenous Peoples (NCIP)',
  'National Commission on Muslim Filipinos (NCMF)',
  'National Council on Disability Affairs (NCDA)',
  'National Economic and Development Authority (NEDA)',
  'National Food Authority (NFA)',
  'National Housing Authority (NHA)',
  'National Irrigation Administration (NIA)',
  'National Labor Relations Commission (NLRC)',
  'National Power Corporation (NPC)',
  'National Privacy Commission (NPC)',
  'National Telecommunications Commission (NTC)',
  'National Youth Commission (NYC)',
  'Overseas Workers Welfare Administration (OWWA)',
  'Philippine Charity Sweepstakes Office (PCSO)',
  'Philippine Coconut Authority (PCA)',
  'Philippine Competition Commission (PCC)',
  'Philippine Crop Insurance Corporation (PCIC)',
  'Philippine Drug Enforcement Agency (PDEA)',
  'Philippine Economic Zone Authority (PEZA)',
  'Philippine Fisheries Development Authority (PFDA)',
  'Philippine Forest Corporation (PFC)',
  'Philippine Health Insurance Corporation (PhilHealth)',
  'Philippine Institute of Volcanology and Seismology (PHIVOLCS)',
  'Philippine National Oil Company (PNOC)',
  'Philippine National Police (PNP)',
  'Philippine National Railways (PNR)',
  'Philippine Ports Authority (PPA)',
  'Philippine Reclamation Authority (PRA)',
  'Philippine Rice Research Institute (PhilRice)',
  'Philippine Statistics Authority (PSA)',
  'Philippine Tourism Authority (PTA)',
  'Privatization and Management Office (PMO)',
  'Professional Regulation Commission (PRC)',
  'Securities and Exchange Commission (SEC)',
  'Social Security System (SSS)',
  'Sugar Regulatory Administration (SRA)',
  'Technical Education and Skills Development Authority (TESDA)',
  'Toll Regulatory Board (TRB)',
  'Tourism Infrastructure and Enterprise Zone Authority (TIEZA)',
  'University of the Philippines (UP)',
  'Veterans Affairs Office',
  // ── Legislative ───────────────────────────────────────────────────────────
  'Senate of the Philippines',
  'House of Representatives',
  'Congressional Planning and Budget Department (CPBD)',
  // ── Judiciary ─────────────────────────────────────────────────────────────
  'Supreme Court of the Philippines',
  'Court of Appeals (CA)',
  'Sandiganbayan',
  'Court of Tax Appeals (CTA)',
  'Regional Trial Court (RTC)',
  'Metropolitan Trial Court (MeTC)',
  'Municipal Trial Court (MTC)',
  // ── Local Government ──────────────────────────────────────────────────────
  'City Government of Manila',
  'City Government of Quezon City',
  'City Government of Makati',
  'City Government of Pasig',
  'City Government of Taguig',
  'City Government of Mandaluyong',
  'City Government of Marikina',
  'City Government of Parañaque',
  'City Government of Las Piñas',
  'City Government of Muntinlupa',
  'City Government of Caloocan',
  'City Government of Malabon',
  'City Government of Navotas',
  'City Government of Valenzuela',
  'City Government of Pasay',
  'City Government of San Juan',
  'Metro Manila Development Authority (MMDA)',
  'City Government of Antipolo',
  'City Government of Batangas',
  'City Government of Lipa',
  'City Government of Calamba',
  'City Government of San Pablo',
  'City Government of Lucena',
  'Province of Batangas',
  'Province of Cavite',
  'Province of Laguna',
  'Province of Quezon',
  'Province of Rizal',
  'Province of Aurora',
  'Province of Bataan',
  'Province of Bulacan',
  'Province of Nueva Ecija',
  'Province of Pampanga',
  'Province of Tarlac',
  'Province of Zambales',
  'Province of Abra',
  'Province of Apayao',
  'Province of Benguet',
  'Province of Ifugao',
  'Province of Kalinga',
  'Province of Mountain Province',
  'Province of Ilocos Norte',
  'Province of Ilocos Sur',
  'Province of La Union',
  'Province of Pangasinan',
  'Province of Cagayan',
  'Province of Isabela',
  'Province of Nueva Vizcaya',
  'Province of Quirino',
  'Province of Batanes',
  'Province of Albay',
  'Province of Camarines Norte',
  'Province of Camarines Sur',
  'Province of Catanduanes',
  'Province of Masbate',
  'Province of Sorsogon',
  'Province of Aklan',
  'Province of Antique',
  'Province of Capiz',
  'Province of Guimaras',
  'Province of Iloilo',
  'Province of Negros Occidental',
  'Province of Bohol',
  'Province of Cebu',
  'Province of Negros Oriental',
  'Province of Siquijor',
  'Province of Biliran',
  'Province of Eastern Samar',
  'Province of Leyte',
  'Province of Northern Samar',
  'Province of Samar',
  'Province of Southern Leyte',
  'Province of Zamboanga del Norte',
  'Province of Zamboanga del Sur',
  'Province of Zamboanga Sibugay',
  'Province of Bukidnon',
  'Province of Camiguin',
  'Province of Lanao del Norte',
  'Province of Misamis Occidental',
  'Province of Misamis Oriental',
  'Province of Compostela Valley (Davao de Oro)',
  'Province of Davao del Norte',
  'Province of Davao del Sur',
  'Province of Davao Occidental',
  'Province of Davao Oriental',
  'Province of Cotabato',
  'Province of Sarangani',
  'Province of South Cotabato',
  'Province of Sultan Kudarat',
  'Province of Agusan del Norte',
  'Province of Agusan del Sur',
  'Province of Dinagat Islands',
  'Province of Surigao del Norte',
  'Province of Surigao del Sur',
  'Province of Basilan',
  'Province of Lanao del Sur',
  'Province of Maguindanao',
  'Province of Sulu',
  'Province of Tawi-Tawi',
  // ── DENR — Central Office ─────────────────────────────────────────────────
  'DENR Central Office',
  'DENR Biodiversity Management Bureau (BMB)',
  'DENR Environmental Management Bureau (EMB)',
  'DENR Forest Management Bureau (FMB)',
  'DENR Land Management Bureau (LMB)',
  'DENR Mines and Geosciences Bureau (MGB)',
  'DENR National Mapping and Resource Information Authority (NAMRIA)',
  'DENR Palawan Council for Sustainable Development (PCSD)',
  // ── DENR Regional Offices ─────────────────────────────────────────────────
  'DENR Regional Office I — Ilocos Region',
  'DENR Regional Office II — Cagayan Valley',
  'DENR Regional Office III — Central Luzon',
  'DENR Regional Office IV-A — CALABARZON',
  'DENR Regional Office IV-B — MIMAROPA',
  'DENR Regional Office V — Bicol Region',
  'DENR Regional Office VI — Western Visayas',
  'DENR Regional Office VII — Central Visayas',
  'DENR Regional Office VIII — Eastern Visayas',
  'DENR Regional Office IX — Zamboanga Peninsula',
  'DENR Regional Office X — Northern Mindanao',
  'DENR Regional Office XI — Davao Region',
  'DENR Regional Office XII — SOCCSKSARGEN',
  'DENR Regional Office XIII — CARAGA',
  'DENR Regional Office CAR — Cordillera Administrative Region',
  'DENR Regional Office NCR — National Capital Region',
  'DENR Regional Office BARMM — Bangsamoro',
  // ── DENR PENROs ───────────────────────────────────────────────────────────
  // NCR
  'DENR PENRO Metro Manila',
  // CAR
  'DENR PENRO Abra','DENR PENRO Apayao','DENR PENRO Benguet',
  'DENR PENRO Ifugao','DENR PENRO Kalinga','DENR PENRO Mountain Province',
  // Region I
  'DENR PENRO Ilocos Norte','DENR PENRO Ilocos Sur',
  'DENR PENRO La Union','DENR PENRO Pangasinan',
  // Region II
  'DENR PENRO Batanes','DENR PENRO Cagayan','DENR PENRO Isabela',
  'DENR PENRO Nueva Vizcaya','DENR PENRO Quirino',
  // Region III
  'DENR PENRO Aurora','DENR PENRO Bataan','DENR PENRO Bulacan',
  'DENR PENRO Nueva Ecija','DENR PENRO Pampanga',
  'DENR PENRO Tarlac','DENR PENRO Zambales',
  // Region IV-A
  'DENR PENRO Batangas','DENR PENRO Cavite','DENR PENRO Laguna',
  'DENR PENRO Quezon','DENR PENRO Rizal',
  // Region IV-B
  'DENR PENRO Marinduque','DENR PENRO Occidental Mindoro',
  'DENR PENRO Oriental Mindoro','DENR PENRO Palawan','DENR PENRO Romblon',
  // Region V
  'DENR PENRO Albay','DENR PENRO Camarines Norte','DENR PENRO Camarines Sur',
  'DENR PENRO Catanduanes','DENR PENRO Masbate','DENR PENRO Sorsogon',
  // Region VI
  'DENR PENRO Aklan','DENR PENRO Antique','DENR PENRO Capiz',
  'DENR PENRO Guimaras','DENR PENRO Iloilo','DENR PENRO Negros Occidental',
  // Region VII
  'DENR PENRO Bohol','DENR PENRO Cebu',
  'DENR PENRO Negros Oriental','DENR PENRO Siquijor',
  // Region VIII
  'DENR PENRO Biliran','DENR PENRO Eastern Samar','DENR PENRO Leyte',
  'DENR PENRO Northern Samar','DENR PENRO Samar','DENR PENRO Southern Leyte',
  // Region IX
  'DENR PENRO Zamboanga del Norte','DENR PENRO Zamboanga del Sur',
  'DENR PENRO Zamboanga Sibugay',
  // Region X
  'DENR PENRO Bukidnon','DENR PENRO Camiguin',
  'DENR PENRO Lanao del Norte','DENR PENRO Misamis Occidental',
  'DENR PENRO Misamis Oriental',
  // Region XI
  'DENR PENRO Compostela Valley (Davao de Oro)','DENR PENRO Davao del Norte',
  'DENR PENRO Davao del Sur','DENR PENRO Davao Occidental',
  'DENR PENRO Davao Oriental',
  // Region XII
  'DENR PENRO Cotabato','DENR PENRO Sarangani',
  'DENR PENRO South Cotabato','DENR PENRO Sultan Kudarat',
  // Region XIII
  'DENR PENRO Agusan del Norte','DENR PENRO Agusan del Sur',
  'DENR PENRO Dinagat Islands','DENR PENRO Surigao del Norte',
  'DENR PENRO Surigao del Sur',
  // ── DENR CENROs — Region IV-A (CALABARZON) ────────────────────────────────
  // Batangas
  'DENR CENRO Batangas City','DENR CENRO Bauan','DENR CENRO Balayan',
  'DENR CENRO Lipa City','DENR CENRO Nasugbu','DENR CENRO San Jose',
  // Cavite
  'DENR CENRO Bacoor','DENR CENRO Dasmariñas','DENR CENRO Naic',
  'DENR CENRO Tagaytay City','DENR CENRO Trece Martires',
  // Laguna
  'DENR CENRO Biñan','DENR CENRO Calamba','DENR CENRO Los Baños',
  'DENR CENRO Pagsanjan','DENR CENRO Santa Cruz',
  // Quezon
  'DENR CENRO Atimonan','DENR CENRO Gumaca','DENR CENRO Infanta',
  'DENR CENRO Lopez','DENR CENRO Lucena City','DENR CENRO Mauban',
  'DENR CENRO Quezon (Catanauan)','DENR CENRO Real','DENR CENRO Tayabas',
  // Rizal
  'DENR CENRO Antipolo','DENR CENRO Binangonan',
  'DENR CENRO Morong','DENR CENRO Tanay',
  // ── DENR CENROs — Region III (Central Luzon) ──────────────────────────────
  'DENR CENRO Balanga (Bataan)','DENR CENRO Dinalupihan (Bataan)',
  'DENR CENRO Bulacan (Malolos)','DENR CENRO San Jose del Monte (Bulacan)',
  'DENR CENRO Cabanatuan (Nueva Ecija)','DENR CENRO Palayan (Nueva Ecija)',
  'DENR CENRO San Jose (Nueva Ecija)',
  'DENR CENRO Angeles (Pampanga)','DENR CENRO San Fernando (Pampanga)',
  'DENR CENRO Tarlac City (Tarlac)',
  'DENR CENRO Olongapo (Zambales)','DENR CENRO San Antonio (Zambales)',
  'DENR CENRO Palauig (Zambales)',
  'DENR CENRO Baler (Aurora)',
  // ── DENR CENROs — Region I (Ilocos) ──────────────────────────────────────
  'DENR CENRO Laoag (Ilocos Norte)','DENR CENRO Pagudpud (Ilocos Norte)',
  'DENR CENRO Bangued (Abra)','DENR CENRO Vigan (Ilocos Sur)',
  'DENR CENRO Candon (Ilocos Sur)',
  'DENR CENRO San Fernando (La Union)','DENR CENRO Bauang (La Union)',
  'DENR CENRO Alaminos (Pangasinan)','DENR CENRO Lingayen (Pangasinan)',
  'DENR CENRO Urdaneta (Pangasinan)',
  // ── DENR CENROs — Region II (Cagayan Valley) ─────────────────────────────
  'DENR CENRO Aparri (Cagayan)','DENR CENRO Tuguegarao (Cagayan)',
  'DENR CENRO Ilagan (Isabela)','DENR CENRO Cauayan (Isabela)',
  'DENR CENRO Solano (Nueva Vizcaya)','DENR CENRO Bayombong (Nueva Vizcaya)',
  'DENR CENRO Cabarroguis (Quirino)',
  // ── DENR CENROs — CAR ────────────────────────────────────────────────────
  'DENR CENRO Baguio City (Benguet)','DENR CENRO La Trinidad (Benguet)',
  'DENR CENRO Bontoc (Mountain Province)',
  'DENR CENRO Lagawe (Ifugao)','DENR CENRO Tabuk (Kalinga)',
  'DENR CENRO Bangued (CAR/Abra)','DENR CENRO Luna (Apayao)',
  // ── DENR CENROs — Region V (Bicol) ───────────────────────────────────────
  'DENR CENRO Legazpi (Albay)','DENR CENRO Ligao (Albay)',
  'DENR CENRO Tabaco (Albay)',
  'DENR CENRO Daet (Camarines Norte)',
  'DENR CENRO Naga (Camarines Sur)','DENR CENRO Iriga (Camarines Sur)',
  'DENR CENRO Pili (Camarines Sur)',
  'DENR CENRO Virac (Catanduanes)',
  'DENR CENRO Masbate City','DENR CENRO Sorsogon City',
  // ── DENR CENROs — Region VI (Western Visayas) ────────────────────────────
  'DENR CENRO Kalibo (Aklan)','DENR CENRO San Jose (Antique)',
  'DENR CENRO Roxas (Capiz)','DENR CENRO Jordan (Guimaras)',
  'DENR CENRO Iloilo City','DENR CENRO Pototan (Iloilo)',
  'DENR CENRO Bacolod (Negros Occidental)','DENR CENRO Kabankalan (Negros Occidental)',
  'DENR CENRO San Carlos (Negros Occidental)',
  // ── DENR CENROs — Region VII (Central Visayas) ───────────────────────────
  'DENR CENRO Tagbilaran (Bohol)','DENR CENRO Talibon (Bohol)',
  'DENR CENRO Carmen (Bohol)',
  'DENR CENRO Cebu City','DENR CENRO Carcar (Cebu)','DENR CENRO Bogo (Cebu)',
  'DENR CENRO Dumaguete (Negros Oriental)','DENR CENRO Bais (Negros Oriental)',
  'DENR CENRO Siquijor',
  // ── DENR CENROs — Region VIII (Eastern Visayas) ──────────────────────────
  'DENR CENRO Naval (Biliran)',
  'DENR CENRO Borongan (Eastern Samar)',
  'DENR CENRO Tacloban (Leyte)','DENR CENRO Carigara (Leyte)',
  'DENR CENRO Ormoc (Leyte)',
  'DENR CENRO Catarman (Northern Samar)',
  'DENR CENRO Calbayog (Samar)','DENR CENRO Catbalogan (Samar)',
  'DENR CENRO Maasin (Southern Leyte)',
  // ── DENR CENROs — Region IX (Zamboanga Peninsula) ────────────────────────
  'DENR CENRO Dipolog (Zamboanga del Norte)',
  'DENR CENRO Pagadian (Zamboanga del Sur)',
  'DENR CENRO Zamboanga City',
  'DENR CENRO Ipil (Zamboanga Sibugay)',
  // ── DENR CENROs — Region X (Northern Mindanao) ───────────────────────────
  'DENR CENRO Malaybalay (Bukidnon)','DENR CENRO Valencia (Bukidnon)',
  'DENR CENRO Mambajao (Camiguin)',
  'DENR CENRO Iligan (Lanao del Norte)',
  'DENR CENRO Oroquieta (Misamis Occidental)',
  'DENR CENRO Cagayan de Oro (Misamis Oriental)',
  'DENR CENRO Gingoog (Misamis Oriental)',
  // ── DENR CENROs — Region XI (Davao) ──────────────────────────────────────
  'DENR CENRO Nabunturan (Davao de Oro)',
  'DENR CENRO Tagum (Davao del Norte)','DENR CENRO Island Garden City of Samal',
  'DENR CENRO Davao City','DENR CENRO Digos (Davao del Sur)',
  'DENR CENRO Malita (Davao Occidental)',
  'DENR CENRO Mati (Davao Oriental)',
  // ── DENR CENROs — Region XII (SOCCSKSARGEN) ──────────────────────────────
  'DENR CENRO Kidapawan (Cotabato)','DENR CENRO Kabacan (Cotabato)',
  'DENR CENRO General Santos (Sarangani / South Cotabato)',
  'DENR CENRO Koronadal (South Cotabato)',
  'DENR CENRO Isulan (Sultan Kudarat)',
  // ── DENR CENROs — Region XIII (CARAGA) ───────────────────────────────────
  'DENR CENRO Butuan (Agusan del Norte)',
  'DENR CENRO Prosperidad (Agusan del Sur)',
  'DENR CENRO Dinagat (Dinagat Islands)',
  'DENR CENRO Surigao City (Surigao del Norte)',
  'DENR CENRO Tandag (Surigao del Sur)','DENR CENRO Bislig (Surigao del Sur)',
  // ── EMB Regional Offices ──────────────────────────────────────────────────
  'EMB Regional Office I','EMB Regional Office II','EMB Regional Office III',
  'EMB Regional Office IV-A','EMB Regional Office IV-B','EMB Regional Office V',
  'EMB Regional Office VI','EMB Regional Office VII','EMB Regional Office VIII',
  'EMB Regional Office IX','EMB Regional Office X','EMB Regional Office XI',
  'EMB Regional Office XII','EMB Regional Office XIII',
  'EMB Regional Office CAR','EMB Regional Office NCR',
  // ── MGB Regional Offices ──────────────────────────────────────────────────
  'MGB Regional Office I','MGB Regional Office II','MGB Regional Office III',
  'MGB Regional Office IV-A','MGB Regional Office IV-B','MGB Regional Office V',
  'MGB Regional Office VI','MGB Regional Office VII','MGB Regional Office VIII',
  'MGB Regional Office IX','MGB Regional Office X','MGB Regional Office XI',
  'MGB Regional Office XII','MGB Regional Office XIII',
  'MGB Regional Office CAR','MGB Regional Office NCR',
];

// ── AutocompleteInput Component ───────────────────────────────────────────────
// Reusable combo-box: shows filtered suggestions as the user types,
// accepts free-text, and optionally fires onAddCustom for new entries.
const AutocompleteInput = ({ label, value, onChange, options, placeholder, onAddCustom }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const wrapRef = useRef(null);

  // Keep local query in sync when parent resets the value (e.g. modal re-open)
  useEffect(() => { setQuery(value || ''); }, [value]);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return options.slice(0, 12);
    const q = query.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q)).slice(0, 12);
  }, [query, options]);

  // Is the typed value new (not already in list)?
  const isNew = query.trim() !== '' && !options.some(
    o => o.toLowerCase() === query.trim().toLowerCase()
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const commit = (val) => {
    onChange(val);
    setQuery(val);
    if (onAddCustom && !options.some(o => o.toLowerCase() === val.toLowerCase())) {
      onAddCustom(val);
    }
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
      />
      {open && (filtered.length > 0 || isNew) && (
        <ul className="absolute z-[60] mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((opt, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={() => commit(opt)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-800 transition-colors ${
                  opt.toLowerCase() === query.trim().toLowerCase() ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-gray-700'
                }`}
              >
                {opt}
              </button>
            </li>
          ))}
          {isNew && (
            <li>
              <button
                type="button"
                onMouseDown={() => commit(query.trim())}
                className="w-full text-left px-3 py-2 text-sm text-indigo-600 font-semibold hover:bg-indigo-50 border-t border-gray-100 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add &ldquo;{query.trim()}&rdquo;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

// STEP 3: Fix CommentInput Component
const CommentInput = ({ label, value, onChange, suggestions, placeholder }) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  useEffect(() => {
    if (value && suggestions.length > 0) {
      const filtered = suggestions.filter(s =>
        s.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 10);
      setFilteredSuggestions(filtered);
    } else {
      setFilteredSuggestions(suggestions.slice(0, 10));
    }
  }, [value, suggestions]);

  // FIXED: Proper dependency management
  useEffect(() => {
    if (!showSuggestions) return; // Only add listener when needed

    const handleClickOutside = (event) => {
      if (
        inputRef.current && 
        !inputRef.current.contains(event.target) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSuggestions]);

  const handleSelectSuggestion = (suggestion) => {
    onChange(suggestion);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          rows={3}
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder={placeholder}
        />
        
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div 
            ref={suggestionsRef}
            className="absolute z-10 w-full bottom-full mb-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
          >
            <div className="py-1">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 sticky top-0">
                Suggestions (click to use)
              </div>
              {filteredSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-900 focus:bg-blue-50 focus:outline-none transition-colors"
                >
                  <div className="truncate">{suggestion}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {suggestions.length > 0 && (
        <p className="mt-1 text-xs text-gray-500">
          💡 Start typing to see suggestions from previous entries
        </p>
      )}
    </div>
  );
};

// STEP 13: Update Export with Error Boundary
export default function SecretariatViewWithErrorBoundary(props) {
  return (
    <SecretariatErrorBoundary>
      <SecretariatView {...props} />
    </SecretariatErrorBoundary>
  );
}