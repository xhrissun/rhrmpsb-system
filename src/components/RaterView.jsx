import React, { useState, useEffect, useRef } from 'react';
import usePersistedState from '../utils/usePersistedState';
import { vacanciesAPI, candidatesAPI, ratingsAPI, competenciesAPI, authAPI } from '../utils/api';
import { calculateRatingScores, formatDate } from '../utils/helpers';
import { RATING_SCALE, COMPETENCY_TYPES, CANDIDATE_STATUS } from '../utils/constants';

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
  const [submitting, setSubmitting] = useState(false);
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalType, setSuccessModalType] = useState('submit');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false);
  const [isClearConfirmModalOpen, setIsClearConfirmModalOpen] = useState(false);
  const [isExitConfirmModalOpen, setIsExitConfirmModalOpen] = useState(false); // NEW: Exit warning modal
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isUpdateSubmission, setIsUpdateSubmission] = useState(false); // NEW: Track if submission is an update

  const activeRatingRef = useRef(null);
  const scrollPositionRef = useRef(0);

  // Handle page refresh/back warning
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (Object.keys(ratings).length > 0) {
        event.preventDefault();
        setIsExitConfirmModalOpen(true);
        event.returnValue = ''; // Required for some browsers
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
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
        loadExistingRatings();
      }
    }
  }, [candidates, selectedCandidate]);

  const filterVacanciesByAssignment = (allVacancies, user) => {
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
    } finally {
      setLoading(false);
    }
  };

  const loadCandidatesByItemNumber = async () => {
    try {
      const candidatesRes = await candidatesAPI.getByItemNumber(selectedItemNumber);
      const longListCandidates = candidatesRes.filter(candidate =>
        candidate.status === CANDIDATE_STATUS.LONG_LIST
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
      setGroupedCompetencies({
        basic: [],
        organizational: [],
        leadership: [],
        minimum: []
      });
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
      
      // CRITICAL: Filter by both rater AND item number
      const raterRatings = existingRatings.filter(rating =>
        rating.raterId && 
        rating.raterId._id === user._id &&
        rating.itemNumber === selectedItemNumber  // Only load ratings for THIS item number
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

  const handleRatingChange = (competencyType, competencyId, score) => {
    scrollPositionRef.current = window.scrollY;
    
    const key = `${competencyType}_${competencyId}`;
    setRatings(prev => ({
      ...prev,
      [key]: parseInt(score)
    }));
    
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollPositionRef.current);
    });
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
      alert('Please rate all competencies before submitting.');
      return;
    }
    try {
      // Check if ratings exist for THIS specific candidate + item number combination
      const existingRatings = await ratingsAPI.checkExistingRatings(
        selectedCandidate, 
        user._id,
        selectedItemNumber  // Pass item number to check
      );
      
      if (existingRatings.hasExisting) {
        setIsUpdateSubmission(true);
        setIsPasswordModalOpen(true); // Prompt for password if updating
      } else {
        setIsUpdateSubmission(false);
        setIsConfirmModalOpen(true); // Direct to confirmation for new ratings
      }
    } catch (error) {
      console.error('Failed to check existing ratings:', error);
      alert('Failed to verify existing ratings. Please try again.');
    }
  };

  const handlePasswordSubmitForUpdate = async () => {
    try {
      const isValid = await authAPI.verifyPassword(user._id, password);
      if (isValid) {
        setIsPasswordModalOpen(false);
        setPassword('');
        setPasswordError('');
        setIsConfirmModalOpen(true); // Proceed to confirmation after password verification
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
          itemNumber: selectedItemNumber  // CRITICAL: Include itemNumber with each rating
        };
      });

      await ratingsAPI.submitRatings({ ratings: ratingsData }, isUpdateSubmission);
      setIsConfirmModalOpen(false);
      setSuccessModalType(isUpdateSubmission ? 'update' : 'submit');
      setIsSuccessModalOpen(true);
    } catch (error) {
      console.error('Failed to submit ratings:', error);
      alert('Failed to submit ratings. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRatings = () => {
    setIsDeleteConfirmModalOpen(true);
  };

  const handlePasswordSubmit = async () => {
    try {
      const isValid = await authAPI.verifyPassword(user._id, password);
      if (isValid) {
        try {
          // Delete ratings for THIS specific candidate + rater + item number
          await ratingsAPI.resetRatings(
            selectedCandidate, 
            user._id,
            selectedItemNumber  // CRITICAL: Pass item number to delete only those ratings
          );
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

  const handleClearRatings = () => {
    setIsClearConfirmModalOpen(true);
  };

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
    if (Object.keys(ratings).length === 0) {
      return { psychoSocial: 0, potential: 0, breakdown: {} };
    }

    const mockRatings = Object.entries(ratings).map(([key, score]) => {
      const [competencyType, competencyId] = key.split('_');
      return {
        raterId: user._id,
        competencyId,
        competencyType,
        score: parseInt(score)
      };
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
      if (ratings[key]) {
        totalScore += ratings[key];
        ratedCount++;
      }
    });

    if (competencyType === 'minimum') {
      return competencyList.length > 0 ? (totalScore / competencyList.length).toFixed(3) : '0.000';
    } else {
      return ratedCount > 0 ? (totalScore / 5).toFixed(3) : '0.000';
    }
  };

  const openDocumentLink = (url) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  const shouldShowLeadership = () => {
    return vacancyDetails?.salaryGrade >= 18 && groupedCompetencies.leadership.length > 0;
  };

  const totalCompetencies = groupedCompetencies.basic.length + 
    groupedCompetencies.organizational.length + 
    (shouldShowLeadership() ? groupedCompetencies.leadership.length : 0) + 
    groupedCompetencies.minimum.length;

  const RadioRating = ({ competency, competencyType, currentRating, onChange }) => {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 md:p-8 mb-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="text-center mb-6">
          <h4 className="text-lg md:text-xl lg:text-2xl font-semibold text-gray-900 mb-3">
            {competency.name}
          </h4>
          <div
            className={`flex justify-center items-center px-4 py-2 md:px-6 md:py-3 text-sm md:text-base lg:text-lg font-medium rounded-full text-center w-full max-w-xs mx-auto ${
              currentRating
                ? 'bg-green-100 text-green-800 border border-green-200'
                : 'bg-gray-100 text-gray-600 border border-gray-200'
            }`}
          >
            {currentRating ? (
              <>
                <svg className="w-5 h-5 md:w-6 md:h-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Rated: {currentRating}/5
              </>
            ) : (
              <>
                <svg className="w-5 h-5 md:w-6 md:h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Not Rated
              </>
            )}
          </div>
        </div>

        <div className="flex justify-center">
          <div className="flex space-x-4 md:space-x-8">
            {RATING_SCALE.map(({ value, label }) => (
              <label
                key={value}
                className="flex flex-col items-center cursor-pointer group"
              >
                <div
                  className={`relative w-16 h-16 md:w-24 md:h-24 lg:w-28 lg:h-28 rounded-full border-2 transition-all duration-200 ${
                    currentRating === value
                      ? 'border-blue-600 bg-blue-600 shadow-lg scale-105'
                      : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50 hover:scale-102'
                  }`}
                >
                  <input
                    type="radio"
                    name={`rating_${competencyType}_${competency._id}`}
                    value={value}
                    checked={currentRating === value}
                    onChange={() => onChange(competencyType, competency._id, value)}
                    className="sr-only"
                  />
                  <div
                    className={`absolute inset-0 flex items-center justify-center text-xl md:text-3xl lg:text-4xl font-bold ${
                      currentRating === value ? 'text-white' : 'text-gray-700'
                    }`}
                  >
                    {value}
                  </div>
                </div>
                <span
                  className={`text-sm md:text-lg lg:text-xl font-medium mt-3 text-center w-16 md:w-24 lg:w-28 ${
                    currentRating === value
                      ? 'text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Loading rating interface...</p>
        </div>
      </div>
    );
  }

  const currentScores = calculateCurrentScores();
  const allRated = areAllCompetenciesRated();

  return (
    <div className="min-h-screen bg-gray-50">
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

          {candidateDetails && vacancyDetails && (
            <div className={`sticky top-16 z-30 bg-gray-100 rounded-xl border border-green-200 overflow-hidden mb-6 shadow-lg transition-all duration-300 ${isModalMinimized ? 'max-h-84' : 'max-h-full'}`}>
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
                  className="text-white hover:text-green-200 focus:outline-none"
                >
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

                    <div className="bg-gray-50 rounded-lg p-3">
                      <h5 className="text-base md:text-lg font-semibold text-gray-700 mb-1">Position Requirements</h5>
                      <div className="grid grid-cols-2 gap-x-4 text-sm md:text-base">
                        <div className="flex">
                          <span className="font-medium text-gray-600 w-24">Education:</span>
                          <span>{vacancyDetails.qualifications?.education || 'N/A'}</span>
                        </div>
                        <div className="flex">
                          <span className="font-medium text-gray-600 w-24">Training:</span>
                          <span>{vacancyDetails.qualifications?.training || 'N/A'}</span>
                        </div>
                        <div className="flex">
                          <span className="font-medium text-gray-600 w-24">Experience:</span>
                          <span>{vacancyDetails.qualifications?.experience || 'N/A'}</span>
                        </div>
                        <div className="flex">
                          <span className="font-medium text-gray-600 w-24">Eligibility:</span>
                          <span>{vacancyDetails.qualifications?.eligibility || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

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
                        allRated 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
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
                    </div>
                    <div className="text-center p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg text-white">
                      <p className="text-lg font-medium opacity-90">Potential</p>
                      <p className="text-3xl font-bold">{currentScores.potential.toFixed(3)}</p>
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
                  <button
                    onClick={() => setIsConfirmModalOpen(false)}
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 text-lg font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmSubmitRatings}
                    disabled={submitting}
                    className={`px-6 py-3 rounded-lg font-semibold flex items-center justify-center space-x-2 text-lg ${
                      submitting
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 focus:ring-2 focus:ring-green-500'
                    }`}
                  >
                    {submitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>{isUpdateSubmission ? 'Updating...' : 'Submitting...'}</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{isUpdateSubmission ? 'Update Ratings' : 'Submit Ratings'}</span>
                      </>
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
                <p className="text-lg text-gray-600 mb-6 font-medium">
                  Are you sure you want to delete all ratings for {candidateDetails?.fullName}? This action requires password confirmation.
                </p>
                <div className="flex justify-end gap-4">
                  <button
                    onClick={() => setIsDeleteConfirmModalOpen(false)}
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 text-lg font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setIsDeleteConfirmModalOpen(false);
                      setIsPasswordModalOpen(true);
                      setPassword('');
                      setPasswordError('');
                    }}
                    className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 text-lg font-semibold"
                  >
                    Proceed to Password
                  </button>
                </div>
              </div>
            </div>
          )}

          {isClearConfirmModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-8 max-w-3xl w-full mx-4">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">Confirm Clear Ratings</h3>
                <p className="text-lg text-gray-600 mb-6 font-medium">
                  Are you sure you want to clear all ratings for {candidateDetails?.fullName}? This will reset the ratings on this page without affecting the database.
                </p>
                <div className="flex justify-end gap-4">
                  <button
                    onClick={() => setIsClearConfirmModalOpen(false)}
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 text-lg font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmClearRatings}
                    className="px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg hover:from-gray-700 hover:to-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 text-lg font-semibold"
                  >
                    Clear Ratings
                  </button>
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
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your password"
                  />
                  {passwordError && (
                    <p className="mt-2 text-sm text-red-600">{passwordError}</p>
                  )}
                </div>
                <div className="flex justify-end gap-4">
                  <button
                    onClick={() => {
                      setIsPasswordModalOpen(false);
                      setPassword('');
                      setPasswordError('');
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={isUpdateSubmission ? handlePasswordSubmitForUpdate : handlePasswordSubmit}
                    disabled={!password}
                    className={`px-4 py-2 rounded-lg font-medium flex items-center justify-center space-x-2 ${
                      password
                        ? 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800 focus:ring-2 focus:ring-red-500'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
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
                    {successModalType === 'submit' ? 'Ratings Submitted Successfully!' : 
                     successModalType === 'update' ? 'Ratings Updated Successfully!' : 
                     successModalType === 'delete' ? 'Ratings Deleted Successfully!' : 
                     'Ratings Cleared Successfully!'}
                  </h3>
                  <p className="text-lg text-gray-600 mb-6 font-medium">
                    {successModalType === 'submit'
                      ? `The ratings for ${candidateDetails?.fullName} have been submitted.`
                      : successModalType === 'update'
                      ? `The ratings for ${candidateDetails?.fullName} have been updated.`
                      : successModalType === 'delete'
                      ? `All ratings for ${candidateDetails?.fullName} have been deleted from the database.`
                      : `All ratings for ${candidateDetails?.fullName} have been cleared on this page.`}
                  </p>
                  <button
                    onClick={() => {
                      setIsSuccessModalOpen(false);
                      setSuccessModalType('submit');
                      if (successModalType === 'submit' || successModalType === 'update' || successModalType === 'delete') {
                        setSelectedCandidate('');
                        setCandidateDetails(null);
                        setRatings({});
                      }
                    }}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {isExitConfirmModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-8 max-w-3xl w-full mx-4">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">Warning: Unsubmitted Ratings</h3>
                <p className="text-lg text-gray-600 mb-6 font-medium">
                  You have unsubmitted ratings for {candidateDetails?.fullName}. If you refresh or leave the page, these ratings will be lost. Do you want to proceed?
                </p>
                <div className="flex justify-end gap-4">
                  <button
                    onClick={() => setIsExitConfirmModalOpen(false)}
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 text-lg font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExitConfirm}
                    className="px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-500 text-lg font-semibold"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedCandidate && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6 shadow-sm">
              <div className="bg-gray-800 px-6 py-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-white">COMPETENCY RATINGS (BEI-BASED)</h2>
                  <p className="text-gray-300 mt-1">
                    Rating {candidateDetails?.fullName} for {vacancyDetails?.position}
                  </p>
                  <div className="flex justify-center items-center space-x-4 mt-4">
                    <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
                      allRated 
                        ? 'bg-green-100 text-green-800 border border-green-200' 
                        : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                    }`}>
                      {allRated ? (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          All Competencies Rated
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Progress: {Object.keys(ratings).length} / {totalCompetencies}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {groupedCompetencies.basic.length > 0 && (
                  <div className="mb-10">
                    <div className="text-center mb-0">
                      <h3 className="text-2xl font-bold mb-2 text-gray-900">PSYCHO-SOCIAL ATTRIBUTES AND PERSONALITY TRAITS</h3>
                      <h3 className="text-2xl font-bold mb-2 text-gray-900">Basic Competencies</h3>
                      <span className="text-sm text-gray-500 bg-blue-50 px-4 py-0 rounded-full border border-blue-200">
                        Average Score: {getCompetencyAverage('basic')}
                      </span>
                    </div>
                    <div className="space-y-4 mt-4">
                      {groupedCompetencies.basic.map(competency => (
                        <RadioRating
                          key={competency._id}
                          competency={competency}
                          competencyType="basic"
                          currentRating={ratings[`basic_${competency._id}`]}
                          onChange={handleRatingChange}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {groupedCompetencies.organizational.length > 0 && (
                  <div className="mb-10">
                    <div className="text-center mb-0">
                      <h3 className="text-2xl font-bold mb-2 text-gray-900">POTENTIAL</h3>
                      <h3 className="text-2xl font-bold mb-2 text-gray-900">Organizational Competencies</h3>
                      <span className="text-sm text-gray-500 bg-purple-50 px-4 py-0 rounded-full border border-purple-200">
                        Average Score: {getCompetencyAverage('organizational')}
                      </span>
                    </div>
                    <div className="space-y-4 mt-4">
                      {groupedCompetencies.organizational.map(competency => (
                        <RadioRating
                          key={competency._id}
                          competency={competency}
                          competencyType="organizational"
                          currentRating={ratings[`organizational_${competency._id}`]}
                          onChange={handleRatingChange}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {shouldShowLeadership() && (
                  <div className="mb-10">
                    <div className="text-center mb-0">
                      <h3 className="text-2xl font-bold mb-2 text-gray-900">Leadership Competencies</h3>
                      <span className="text-sm text-gray-500 bg-indigo-50 px-4 py-0 rounded-full border border-indigo-200">
                        Average Score: {getCompetencyAverage('leadership')}
                      </span>
                      <p className="text-xs text-gray-600 mt-2">Required for Salary Grade {vacancyDetails.salaryGrade}</p>
                    </div>
                    <div className="space-y-4 mt-4">
                      {groupedCompetencies.leadership.map(competency => (
                        <RadioRating
                          key={competency._id}
                          competency={competency}
                          competencyType="leadership"
                          currentRating={ratings[`leadership_${competency._id}`]}
                          onChange={handleRatingChange}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {!shouldShowLeadership() && groupedCompetencies.leadership.length === 0 && vacancyDetails?.salaryGrade < 18 && (
                  <div className="mb-8 text-center">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 inline-block">
                      <div className="flex items-center justify-center space-x-2 text-yellow-800">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm font-medium">
                          Leadership competencies not required for Salary Grade {vacancyDetails.salaryGrade}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {groupedCompetencies.minimum.length > 0 && (
                  <div className="mb-10">
                    <div className="text-center mb-0">
                      <h3 className="text-2xl font-bold mb-2 text-gray-900">Minimum Competencies</h3>
                      <span className="text-sm text-gray-500 bg-orange-50 px-4 py-0 rounded-full border border-orange-200">
                        Average Score: {getCompetencyAverage('minimum')}
                      </span>
                    </div>
                    <div className="space-y-4 mt-4">
                      {groupedCompetencies.minimum.map(competency => (
                        <RadioRating
                          key={competency._id}
                          competency={competency}
                          competencyType="minimum"
                          currentRating={ratings[`minimum_${competency._id}`]}
                          onChange={handleRatingChange}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t pt-6">
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button
                      onClick={handleClearRatings}
                      className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-all font-medium flex items-center justify-center space-x-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Clear Ratings</span>
                    </button>

                    <button
                      onClick={handleDeleteRatings}
                      className="px-6 py-3 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all font-medium flex items-center justify-center space-x-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span>Delete Ratings</span>
                    </button>
                    
                    <button
                      onClick={handleSubmitRatings}
                      disabled={!allRated || submitting}
                      className={`px-8 py-3 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all flex items-center justify-center space-x-2 ${
                        allRated && !submitting
                          ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 focus:ring-green-500 shadow-lg'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {submitting ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Submitting...</span>
                        </>
                      ) : allRated ? (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Submit All Ratings</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Complete All Ratings First</span>
                        </>
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
              <p className="text-gray-600 max-w-md mx-auto">
                Select an assignment, position, item number, and candidate from the dropdowns above to start the rating process.
              </p>
              <div className="mt-6 text-sm text-gray-500 bg-gray-50 rounded-lg p-4 inline-block">
                <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
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
