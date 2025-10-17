import React, { useState, useEffect } from 'react';
import usePersistedState from '../utils/usePersistedState';
import { vacanciesAPI, candidatesAPI } from '../utils/api';
import { getStatusColor, getStatusLabel, CANDIDATE_STATUS } from '../utils/constants';
import PDFReport from './PDFReport';
import { useToast } from '../utils/ToastContext';

const SecretariatView = ({ user }) => {
  const [vacancies, setVacancies] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [itemNumbers, setItemNumbers] = useState([]);

  const { showToast } = useToast();

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

  // Calculate statistics
  const getStatistics = () => {
    const total = candidates.length;
    const longListed = candidates.filter(c => c.status === CANDIDATE_STATUS.LONG_LIST).length;
    const forReview = candidates.filter(c => c.status === CANDIDATE_STATUS.FOR_REVIEW).length;
    const disqualified = candidates.filter(c => c.status === CANDIDATE_STATUS.DISQUALIFIED).length;
    
    return { total, longListed, forReview, disqualified };
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

  const handleGenerateReport = () => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const stats = getStatistics();

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

        {/* Statistics Cards - Closer spacing and more pop */}
        <div className="sticky top-[268px] z-10 pt-1 pb-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-lg border-2 border-blue-200 p-4 hover:shadow-xl transition-shadow">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-md">
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

            <div className="bg-white rounded-xl shadow-lg border-2 border-green-200 p-4 hover:shadow-xl transition-shadow">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow-md">
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

            <div className="bg-white rounded-xl shadow-lg border-2 border-yellow-200 p-4 hover:shadow-xl transition-shadow">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg flex items-center justify-center shadow-md">
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

            <div className="bg-white rounded-xl shadow-lg border-2 border-red-200 p-4 hover:shadow-xl transition-shadow">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center shadow-md">
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
              Showing {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
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
                {candidates.map((candidate, index) => {
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

            {candidates.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No candidates found</h3>
                <p className="text-gray-500">No candidates match the selected criteria.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals (keeping the existing modal implementations) */}
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

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Education Comments
                </label>
                <textarea
                  value={comments.education}
                  onChange={(e) => handleCommentChange('education', e.target.value)}
                  rows={3}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Add comments about education qualifications..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Training Comments
                </label>
                <textarea
                  value={comments.training}
                  onChange={(e) => handleCommentChange('training', e.target.value)}
                  rows={3}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Add comments about training requirements..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Experience Comments
                </label>
                <textarea
                  value={comments.experience}
                  onChange={(e) => handleCommentChange('experience', e.target.value)}
                  rows={3}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Add comments about work experience..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Eligibility Comments
                </label>
                <textarea
                  value={comments.eligibility}
                  onChange={(e) => handleCommentChange('eligibility', e.target.value)}
                  rows={3}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Add comments about eligibility requirements..."
                />
              </div>
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
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SecretariatView;
