import React, { useState, useEffect, useRef } from 'react';
import usePersistedState from '../utils/usePersistedState';
import { vacanciesAPI, candidatesAPI, usersAPI } from '../utils/api';
import { getStatusColor, getStatusLabel, CANDIDATE_STATUS } from '../utils/constants';
import PDFReport from './PDFReport';
import { useToast } from '../utils/ToastContext';
import { competenciesAPI } from '../utils/api';
import { COMPETENCY_TYPES } from '../utils/constants';

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

  // Use usePersistedState for dropdown selections
  const [selectedAssignment, setSelectedAssignment] = usePersistedState(`secretariat_${user._id}_selectedAssignment`, '');
  const [selectedPosition, setSelectedPosition] = usePersistedState(`secretariat_${user._id}_selectedPosition`, '');
  const [selectedItemNumber, setSelectedItemNumber] = usePersistedState(`secretariat_${user._id}_selectedItemNumber`, '');
  const [selectedCandidate, setSelectedCandidate] = usePersistedState(`secretariat_${user._id}_selectedCandidate`, '');

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // NEW: Comment suggestions state
  const [commentSuggestions, setCommentSuggestions] = useState({
    education: [],
    training: [],
    experience: [],
    eligibility: []
  });

  // NEW: Status filter state
  const [statusFilter, setStatusFilter] = useState(null);

  // Calculate statistics
  const getStatistics = () => {
    const total = candidates.length;
    const longListed = candidates.filter(c => c.status === CANDIDATE_STATUS.LONG_LIST).length;
    const forReview = candidates.filter(c => c.status === CANDIDATE_STATUS.FOR_REVIEW).length;
    const disqualified = candidates.filter(c => c.status === CANDIDATE_STATUS.DISQUALIFIED).length;
    
    return { total, longListed, forReview, disqualified };
  };

  // NEW: Function to load comment suggestions from database
const loadCommentSuggestions = async () => {
  console.log('🔍 Environment check:', {
    isProd: import.meta.env.PROD,
    mode: import.meta.env.MODE
  });
  
  try {
    const fields = ['education', 'training', 'experience', 'eligibility'];
    const suggestions = {};
    
    for (const field of fields) {
      console.log(`📥 Fetching ${field} suggestions...`);
      try {
        suggestions[field] = await candidatesAPI.getCommentSuggestions(field);
        console.log(`✅ Got ${suggestions[field].length} ${field} suggestions`);
      } catch (error) {
        console.error(`❌ Failed to load ${field}:`, error.message);
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
};

  const fetchRatersForVacancy = async (itemNumber) => {
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

      // Sort raters by raterType hierarchy
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
  };

  const loadCompetenciesByItemNumber = async (itemNumber) => {
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
  };

  const closeCompetenciesModal = () => {
    setShowCompetenciesModal(false);
    setCompetencies([]);
    setGroupedCompetencies({
      basic: [],
      organizational: [],
      leadership: [],
      minimum: []
    });
  };

  // Load initial data on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  // Handle state restoration and population of dropdowns
  useEffect(() => {
    if (!loading && vacancies.length > 0) {
      // Populate assignments
      const uniqueAssignments = [...new Set(vacancies.map(v => v.assignment))].filter(a => a).sort();
      setAssignments(uniqueAssignments);

      // Restore persisted state if valid
      if (selectedAssignment && uniqueAssignments.includes(selectedAssignment)) {
        // Restore positions
        const filteredVacancies = vacancies.filter(v => v.assignment === selectedAssignment);
        const uniquePositions = [...new Set(filteredVacancies.map(v => v.position))].filter(p => p).sort();
        setPositions(uniquePositions);

        if (selectedPosition && uniquePositions.includes(selectedPosition)) {
          // Restore item numbers
          const positionVacancies = filteredVacancies.filter(v => v.position === selectedPosition);
          const uniqueItemNumbers = [...new Set(positionVacancies.map(v => v.itemNumber))].filter(i => i).sort();
          setItemNumbers(uniqueItemNumbers);

          if (selectedItemNumber && uniqueItemNumbers.includes(selectedItemNumber)) {
            // Trigger loading of candidates
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
    } else if (!loading && vacancies.length === 0) {
      // Clear all state if no vacancies are available
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
  }, [vacancies, loading, selectedAssignment, selectedPosition, selectedItemNumber]);

  // Validate and load candidate details
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
      } else {
        loadCandidateDetails(selectedCandidate);
      }
    }
  }, [candidates, selectedCandidate]);

  // Filter vacancies based on user's assignment type
  const filterVacanciesByAssignment = (allVacancies, user) => {
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
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const vacanciesRes = await vacanciesAPI.getAll();
      const filteredVacancies = filterVacanciesByAssignment(vacanciesRes, user);
      setVacancies(filteredVacancies);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      setError('Failed to load data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const loadCandidatesByFilters = async () => {
    try {
      let filteredCandidates = [];
      if (selectedItemNumber) {
        filteredCandidates = await candidatesAPI.getByItemNumber(selectedItemNumber);
      } else if (selectedPosition) {
        const vacancyItemNumbers = vacancies
          .filter(v => v.assignment === selectedAssignment && v.position === selectedPosition)
          .map(v => v.itemNumber);
        const candidatesRes = await Promise.all(
          vacancyItemNumbers.map(itemNumber => candidatesAPI.getByItemNumber(itemNumber))
        );
        filteredCandidates = candidatesRes.flat();
      } else if (selectedAssignment) {
        const vacancyItemNumbers = vacancies
          .filter(v => v.assignment === selectedAssignment)
          .map(v => v.itemNumber);
        const candidatesRes = await Promise.all(
          vacancyItemNumbers.map(itemNumber => candidatesAPI.getByItemNumber(itemNumber))
        );
        filteredCandidates = candidatesRes.flat();
      } else {
        const vacancyItemNumbers = vacancies.map(v => v.itemNumber);
        const candidatesRes = await Promise.all(
          vacancyItemNumbers.map(itemNumber => candidatesAPI.getByItemNumber(itemNumber))
        );
        filteredCandidates = candidatesRes.flat();
      }
      filteredCandidates.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setCandidates(filteredCandidates);
    } catch (error) {
      console.error('Failed to load candidates:', error);
      setError('Failed to load candidates.');
      setCandidates([]);
    }
  };

  const loadCandidateDetails = async (candidateId) => {
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
      setError('Failed to load candidate details.');
      setCandidateDetails(null);
    }
  };

  const handleCommentChange = (field, value) => {
    setComments(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleStatusUpdate = async (status) => {
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
  };

  const handleViewComments = (candidate) => {
    const vacancy = vacancies.find(v => v.itemNumber === candidate.itemNumber);
    setViewCandidateData({ candidate, vacancy });
    setShowViewCommentsModal(true);
  };

  const handleGenerateReport = async () => {
    const filteredRaters = await fetchRatersForVacancy(selectedItemNumber);
    setReportRaters(filteredRaters);
    setReportCandidateId('');
    setReportItemNumber(selectedItemNumber);
    setShowReportModal(true);
  };

  const handleViewVacancy = (itemNumber) => {
    const vacancy = vacancies.find(v => v.itemNumber === itemNumber);
    setVacancyDetails(vacancy);
    setShowVacancyModal(true);
  };

  const closeCommentModal = () => {
    setShowCommentModal(false);
    setSelectedCandidate('');
    setCandidateDetails(null);
    setComments({
      education: '',
      training: '',
      experience: '',
      eligibility: ''
    });
  };

  const closeViewCommentsModal = () => {
    setShowViewCommentsModal(false);
    setViewCandidateData(null);
  };

  const closeReportModal = () => {
    setShowReportModal(false);
    setReportCandidateId('');
    setReportItemNumber('');
  };

  const closeVacancyModal = () => {
    setShowVacancyModal(false);
    setVacancyDetails(null);
  };

  const openDocumentLink = (url) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  // NEW: Handle status card click to filter candidates
  const handleStatusCardClick = (status) => {
    if (statusFilter === status) {
      // If clicking the same card, clear the filter
      setStatusFilter(null);
    } else {
      // Otherwise, set the new filter
      setStatusFilter(status);
    }
  };

  // NEW: Filter candidates based on status filter
  const getFilteredCandidates = () => {
    if (!statusFilter) {
      return candidates;
    }
    return candidates.filter(c => c.status === statusFilter);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const stats = getStatistics();
  const filteredCandidates = getFilteredCandidates();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header - Now Sticky */}
      <div className="sticky top-14 z-30 pt-3 pb-3">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-white shadow-md border-b border-gray-200 rounded-xl">
            <div className="px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">Secretariat Dashboard</h1>
                    <p className="text-sm text-gray-600">Welcome, {user.name}</p>
                  </div>
                </div>
                
                {selectedItemNumber && (
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={async () => {
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
                      }}
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-2.5 px-6 rounded-lg text-sm transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                      <div className="flex items-center space-x-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>Export CSV</span>
                      </div>
                    </button>
                    
                    <button
                      onClick={handleGenerateReport}
                      className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-2.5 px-6 rounded-lg text-sm transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                      <div className="flex items-center space-x-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>Generate Report</span>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>             

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Filters - More compact layout with better styling */}
        <div className="sticky top-36 z-20 pt-3 pb-1">
          <div className="bg-white rounded-xl shadow-lg border-2 border-gray-300 p-5">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-48">
                <label className="block text-xs font-bold text-gray-800 mb-1.5">Assignment</label>
                <select
                  value={selectedAssignment}
                  onChange={(e) => setSelectedAssignment(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-sm font-medium shadow-sm"
                >
                  <option value="">All Assignments</option>
                  {assignments.map(assignment => (
                    <option key={assignment} value={assignment}>{assignment}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1 min-w-48">
                <label className="block text-xs font-bold text-gray-800 mb-1.5">Position</label>
                <select
                  value={selectedPosition}
                  onChange={(e) => setSelectedPosition(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-sm font-medium disabled:bg-gray-100 shadow-sm"
                  disabled={!selectedAssignment}
                >
                  <option value="">All Positions</option>
                  {positions.map(position => (
                    <option key={position} value={position}>{position}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1 min-w-48">
                <label className="block text-xs font-bold text-gray-800 mb-1.5">Item Number</label>
                <select
                  value={selectedItemNumber}
                  onChange={(e) => setSelectedItemNumber(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-sm font-medium disabled:bg-gray-100 shadow-sm"
                  disabled={!selectedPosition}
                >
                  <option value="">All Item Numbers</option>
                  {itemNumbers.map(itemNumber => (
                    <option key={itemNumber} value={itemNumber}>{itemNumber}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Cards - NOW CLICKABLE with active state */}
        <div className="sticky top-[268px] z-10 pt-1 pb-4">
          <div className="grid grid-cols-4 gap-4">
            {/* Total Card - No filter, just shows all */}
            <div 
              onClick={() => setStatusFilter(null)}
              className={`bg-white rounded-xl shadow-lg border-2 p-4 transition-all cursor-pointer ${
                statusFilter === null 
                  ? 'border-blue-500 ring-4 ring-blue-200 shadow-xl' 
                  : 'border-blue-200 hover:shadow-xl hover:border-blue-300'
              }`}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-md ${
                    statusFilter === null ? 'scale-110' : ''
                  } transition-transform`}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-bold text-gray-600">Total</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
              </div>
            </div>

            {/* Long Listed Card */}
            <div 
              onClick={() => handleStatusCardClick(CANDIDATE_STATUS.LONG_LIST)}
              className={`bg-white rounded-xl shadow-lg border-2 p-4 transition-all cursor-pointer ${
                statusFilter === CANDIDATE_STATUS.LONG_LIST 
                  ? 'border-green-500 ring-4 ring-green-200 shadow-xl' 
                  : 'border-green-200 hover:shadow-xl hover:border-green-300'
              }`}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow-md ${
                    statusFilter === CANDIDATE_STATUS.LONG_LIST ? 'scale-110' : ''
                  } transition-transform`}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-bold text-gray-600">Long Listed</p>
                  <p className="text-2xl font-bold text-green-600">{stats.longListed}</p>
                </div>
              </div>
            </div>

            {/* For Review Card */}
            <div 
              onClick={() => handleStatusCardClick(CANDIDATE_STATUS.FOR_REVIEW)}
              className={`bg-white rounded-xl shadow-lg border-2 p-4 transition-all cursor-pointer ${
                statusFilter === CANDIDATE_STATUS.FOR_REVIEW 
                  ? 'border-yellow-500 ring-4 ring-yellow-200 shadow-xl' 
                  : 'border-yellow-200 hover:shadow-xl hover:border-yellow-300'
              }`}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`w-10 h-10 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg flex items-center justify-center shadow-md ${
                    statusFilter === CANDIDATE_STATUS.FOR_REVIEW ? 'scale-110' : ''
                  } transition-transform`}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-bold text-gray-600">For Review</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats.forReview}</p>
                </div>
              </div>
            </div>

            {/* Disqualified Card */}
            <div 
              onClick={() => handleStatusCardClick(CANDIDATE_STATUS.DISQUALIFIED)}
              className={`bg-white rounded-xl shadow-lg border-2 p-4 transition-all cursor-pointer ${
                statusFilter === CANDIDATE_STATUS.DISQUALIFIED 
                  ? 'border-red-500 ring-4 ring-red-200 shadow-xl' 
                  : 'border-red-200 hover:shadow-xl hover:border-red-300'
              }`}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center shadow-md ${
                    statusFilter === CANDIDATE_STATUS.DISQUALIFIED ? 'scale-110' : ''
                  } transition-transform`}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-bold text-gray-600">Disqualified</p>
                  <p className="text-2xl font-bold text-red-600">{stats.disqualified}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Candidates Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Candidates</h3>
            <p className="text-sm text-gray-600 mt-1">
              Showing {filteredCandidates.length} candidate{filteredCandidates.length !== 1 ? 's' : ''}
              {statusFilter && ` (${getStatusLabel(statusFilter)})`}
            </p>
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
                    <tr key={candidate._id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-150">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                              <span className="text-xs font-medium text-white">
                                {candidate.fullName.charAt(0)}
                              </span>
                            </div>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">{candidate.fullName}</div>
                            <div className="text-xs text-gray-500">{candidate.gender} • Age: {candidate.age || 'N/A'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <button
                          onClick={() => handleViewVacancy(candidate.itemNumber)}
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
                            className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-1 rounded text-xs transition-colors duration-200"
                          >
                            View
                          </button>
                          <button
                            onClick={() => {
                              setSelectedCandidate(candidate._id);
                              loadCandidateDetails(candidate._id);
                              loadCommentSuggestions(); // Load suggestions when opening modal
                              setShowCommentModal(true);
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs transition-colors duration-200"
                          >
                            Update
                          </button>
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
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-8 mx-auto border w-11/12 max-w-6xl shadow-lg rounded-lg bg-white">
              <div className={`${headerStyle} px-6 py-4 rounded-t-lg text-center`}>
                <h2 className="text-2xl font-bold">{candidate.fullName}</h2>
                <p className="text-base font-medium mt-1 uppercase tracking-wide">{displayStatus}</p>
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
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm transition-colors duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showCommentModal && candidateDetails && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-4 mx-auto p-6 border w-[95%] max-w-7xl shadow-lg rounded-md bg-white max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                Update Status: {candidateDetails.fullName}
              </h2>
              <button
                onClick={closeCommentModal}
                className="text-gray-500 hover:text-gray-700 text-xl font-bold"
              >
                ×
              </button>
            </div>
            
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

            {/* NEW: Comment fields with auto-suggestions */}
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
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors duration-200"
              >
                Long List
              </button>
              <button
                onClick={() => handleStatusUpdate(CANDIDATE_STATUS.FOR_REVIEW)}
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded transition-colors duration-200"
              >
                For Review
              </button>
              <button
                onClick={() => handleStatusUpdate(CANDIDATE_STATUS.DISQUALIFIED)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors duration-200"
              >
                Disqualify
              </button>
            </div>
          </div>
        </div>
      )}

      {showVacancyModal && vacancyDetails && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-3xl shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Vacancy Details</h2>
                <p className="text-sm text-gray-600">{vacancyDetails.itemNumber}</p>
              </div>
              <button
                onClick={closeVacancyModal}
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

      {showCompetenciesModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-6 border w-11/12 max-w-5xl shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-white pb-4 border-b">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Competencies</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {vacancyDetails?.position} • Item # {vacancyDetails?.itemNumber} • SG {vacancyDetails?.salaryGrade}
                </p>
              </div>
              <button
                onClick={closeCompetenciesModal}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {competencies.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Competencies Found</h3>
                <p className="text-gray-500">No competencies have been assigned to this position yet.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Basic Competencies */}
                {groupedCompetencies.basic.length > 0 && (
                  <div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
                      <h3 className="text-lg font-bold text-blue-900">Core Competencies (Psycho-Social)</h3>
                      <p className="text-sm text-blue-700 mt-1">{groupedCompetencies.basic.length} competencies</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupedCompetencies.basic.map((comp, index) => (
                        <div key={comp._id} className="bg-white border-2 border-blue-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start">
                            <span className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                              {index + 1}
                            </span>
                            <div className="ml-3 flex-1">
                              <h4 className="font-semibold text-gray-900">{comp.name}</h4>
                              {comp.description && (
                                <p className="text-sm text-gray-600 mt-1">{comp.description}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Organizational Competencies */}
                {groupedCompetencies.organizational.length > 0 && (
                  <div>
                    <div className="bg-purple-50 border-l-4 border-purple-500 p-4 mb-4">
                      <h3 className="text-lg font-bold text-purple-900">Organizational Competencies (Potential)</h3>
                      <p className="text-sm text-purple-700 mt-1">{groupedCompetencies.organizational.length} competencies</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupedCompetencies.organizational.map((comp, index) => (
                        <div key={comp._id} className="bg-white border-2 border-purple-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start">
                            <span className="flex-shrink-0 w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                              {index + 1}
                            </span>
                            <div className="ml-3 flex-1">
                              <h4 className="font-semibold text-gray-900">{comp.name}</h4>
                              {comp.description && (
                                <p className="text-sm text-gray-600 mt-1">{comp.description}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Leadership Competencies */}
                {groupedCompetencies.leadership.length > 0 && (
                  <div>
                    <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 mb-4">
                      <h3 className="text-lg font-bold text-indigo-900">Leadership Competencies (Potential)</h3>
                      <p className="text-sm text-indigo-700 mt-1">
                        {groupedCompetencies.leadership.length} competencies
                        {vacancyDetails?.salaryGrade >= 18 
                          ? ' • Required for SG ' + vacancyDetails.salaryGrade
                          : ' • Not required for SG ' + vacancyDetails?.salaryGrade}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupedCompetencies.leadership.map((comp, index) => (
                        <div key={comp._id} className="bg-white border-2 border-indigo-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start">
                            <span className="flex-shrink-0 w-8 h-8 bg-indigo-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                              {index + 1}
                            </span>
                            <div className="ml-3 flex-1">
                              <h4 className="font-semibold text-gray-900">{comp.name}</h4>
                              {comp.description && (
                                <p className="text-sm text-gray-600 mt-1">{comp.description}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Minimum Competencies */}
                {groupedCompetencies.minimum.length > 0 && (
                  <div>
                    <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-4">
                      <h3 className="text-lg font-bold text-orange-900">Minimum Competencies (Potential)</h3>
                      <p className="text-sm text-orange-700 mt-1">{groupedCompetencies.minimum.length} competencies</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupedCompetencies.minimum.map((comp, index) => (
                        <div key={comp._id} className="bg-white border-2 border-orange-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start">
                            <span className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                              {index + 1}
                            </span>
                            <div className="ml-3 flex-1">
                              <h4 className="font-semibold text-gray-900">{comp.name}</h4>
                              {comp.description && (
                                <p className="text-sm text-gray-600 mt-1">{comp.description}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 pt-4 border-t sticky bottom-0 bg-white">
              <button
                onClick={closeCompetenciesModal}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showReportModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Candidate Report</h2>
              <button
                onClick={closeReportModal}
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

// NEW: CommentInput component with auto-suggestions
const CommentInput = ({ label, value, onChange, suggestions, placeholder }) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  useEffect(() => {
    // Filter suggestions based on current input
    if (value && suggestions.length > 0) {
      const filtered = suggestions.filter(s => 
        s.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 10); // Limit to 10 suggestions
      setFilteredSuggestions(filtered);
    } else {
      setFilteredSuggestions(suggestions.slice(0, 10));
    }
  }, [value, suggestions]);

  // Close suggestions when clicking outside
  useEffect(() => {
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
  }, []);

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

export default SecretariatView;
