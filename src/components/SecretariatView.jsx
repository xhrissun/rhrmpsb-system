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

  const [statusFilter, setStatusFilter] = useState(null);
  const [showAssignmentSummary, setShowAssignmentSummary] = useState(false);
  const [showCBSManual, setShowCBSManual] = useState(false);
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">VACANCY DETAILS</th>
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8">
                            <div className={`h-8 w-8 rounded-full ${candidate.isArchived ? 'bg-gray-400' : 'bg-gradient-to-br from-blue-500 to-indigo-600'} flex items-center justify-center`}>
                              <span className="text-xs font-medium text-white">
                                {candidate.fullName.charAt(0)}
                              </span>
                            </div>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                              {candidate.fullName}
                              {candidate.isArchived && (
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-800 text-xs font-bold rounded">
                                  ARCHIVED
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">{candidate.gender} • Age: {candidate.age || 'N/A'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <button
                          onClick={() => handleViewVacancy(candidate.itemNumber)}
                          aria-label={`View vacancy details for ${candidate.itemNumber}`}
                          className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-1 rounded text-xs transition-colors duration-200"
                        >
                          View
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="max-w-xs truncate" title={vacancy?.position}>
                          {vacancy?.position || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(candidate.status)}`}>
                          {getStatusLabel(candidate.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewComments(candidate)}
                            aria-label={`View comments for ${candidate.fullName}`}
                            className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-1 rounded text-xs transition-colors duration-200"
                          >
                            View
                          </button>
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
                              onClick={() => {
                                setSelectedCandidate(candidate._id);
                                loadCandidateDetails(candidate._id);
                                loadCommentSuggestions();
                                setShowCommentModal(true);
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
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" role="dialog" aria-modal="true" aria-labelledby="update-status-title">
          <div className="relative top-4 mx-auto p-6 border w-[95%] max-w-7xl shadow-lg rounded-md bg-white max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
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
              <div className="mb-4 bg-orange-100 border-l-4 border-orange-500 p-3 rounded">
                <p className="text-sm text-orange-800">
                  <strong>Note:</strong> This candidate is archived. Updates can still be made for historical record purposes.
                </p>
              </div>
            )}
            
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

            <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
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