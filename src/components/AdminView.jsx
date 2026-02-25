import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import usePersistedState from '../utils/usePersistedState';
import { usersAPI, vacanciesAPI, candidatesAPI, competenciesAPI, publicationRangesAPI, authAPI } from '../utils/api';
import { USER_TYPES, RATER_TYPES, SALARY_GRADES, CANDIDATE_STATUS } from '../utils/constants';
import InterviewSummaryGenerator from './InterviewSummaryGenerator';
import { useToast } from '../utils/ToastContext';
import RatingLogsView from './RatingLogsView';
import PublicationRangeManager from './PublicationRangeManager';
import CompetencyDetailModal from './CompetencyDetailModal';

// ──────────────────────────────────────────────────────────────────────────────
// Exported reusable components
// ──────────────────────────────────────────────────────────────────────────────

export const SearchBar = memo(function SearchBar({ placeholder, value, onChange }) {
  return (
    <div className="mb-4">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
});

export const FilterableHeader = memo(function FilterableHeader({
  label,
  filterKey,
  sortKey,
  filterValue,
  onFilterChange,
  onSort,
  sortConfig
}) {
  const handleInputChange = useCallback((e) => {
    e.stopPropagation();
    const newValue = e.target.value;
    onFilterChange(filterKey, newValue);
  }, [filterKey, onFilterChange]);

  return (
    <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" scope="col">
      <div className="flex flex-col space-y-1">
        <div className="flex items-center space-x-1">
          <span>{label}</span>
          {sortKey && (
            <button
              onClick={() => onSort(sortKey)}
              className="text-gray-400 hover:text-gray-600"
              type="button"
              aria-sort={sortConfig.key === sortKey ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              {sortConfig.key === sortKey ? (
                sortConfig.direction === 'asc' ? '▲' : '▼'
              ) : '⇅'}
            </button>
          )}
        </div>
        {filterKey && (
          <input
            type="text"
            placeholder="Filter..."
            value={filterValue || ''}
            onChange={handleInputChange}
            className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </th>
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// Error Boundary
// ──────────────────────────────────────────────────────────────────────────────

class AdminErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('AdminView Error:', error, errorInfo);
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

// ──────────────────────────────────────────────────────────────────────────────
// Main AdminView Component
// ──────────────────────────────────────────────────────────────────────────────

const AdminView = ({ user }) => {
  // ─── Persisted State ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = usePersistedState(`admin_${user._id}_activeTab`, 'users');
  const [selectedPublicationRange, setSelectedPublicationRange] = usePersistedState(
    `admin_${user._id}_selectedPublicationRange`, 
    ''
  );

  // ─── Core Data State ───────────────────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [vacancies, setVacancies] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [competencies, setCompetencies] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [publicationRanges, setPublicationRanges] = useState([]);

  // ─── UI State ──────────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [showVacancyModal, setShowVacancyModal] = useState(false);
  const [selectedVacancy, setSelectedVacancy] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [showArchivedRanges, setShowArchivedRanges] = useState(false);
  const [lastCompetencyUpload, setLastCompetencyUpload] = useState(null);
  const [repostedItemNumbers, setRepostedItemNumbers] = useState(new Set());
  const [showAssignmentDetailsModal, setShowAssignmentDetailsModal] = useState(false);
  const [selectedUserForDetails, setSelectedUserForDetails] = useState(null);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadingType, setUploadingType] = useState('');
  const [lastVacancyUpload, setLastVacancyUpload] = useState(null);
  const [competencyVacancyModal, setCompetencyVacancyModal] = useState(null);
  const [showCompetencyModal, setShowCompetencyModal] = useState(false);
  const [selectedVacancyForCompetencies, setSelectedVacancyForCompetencies] = useState(null);
  const [vacancyCompetencies, setVacancyCompetencies] = useState([]);
  const [loadingCompetencies, setLoadingCompetencies] = useState(false);
  const [showCompetencySummary, setShowCompetencySummary] = useState(false);

  const [showCompetencyDetail, setShowCompetencyDetail] = useState(false);
  const [selectedCompetencyForDetail, setSelectedCompetencyForDetail] = useState(null);

  const handleViewCompetencyDetail = useCallback((competency) => {
    setSelectedCompetencyForDetail(competency);
    setShowCompetencyDetail(true);
  }, []);

  // ─── CSV Upload UX State ───────────────────────────────────────────────────
  const [csvUploading, setCsvUploading] = useState({
    vacancies: false,
    candidates: false,
    competencies: false,
  });
  const [uploadResults, setUploadResults] = useState({
    vacancies: null,
    candidates: null,
    competencies: null,
  });

  // ─── Toast Context ─────────────────────────────────────────────────────────
  const { showToast } = useToast();

  // ─── Refs for Race Conditions & State Tracking ────────────────────────────
  const isInitialMount = useRef(true);
  const loadingData = useRef(false);
  const previousStateRef = useRef({
    tab: activeTab,
    range: selectedPublicationRange,
    archived: showArchivedRanges
  });

  // Add a data cache ref at the top with other refs
  const dataCacheRef = useRef({
    users: null,
    vacancies: null,
    candidates: null,
    competencies: null,
    publicationRanges: null
  });

  // ─── CSV Upload UX Helpers ─────────────────────────────────────────────────
  const setUploading = useCallback((type, val) => {
    setCsvUploading(prev => ({ ...prev, [type]: val }));
  }, []);

  const setUploadResult = useCallback((type, result) => {
    setUploadResults(prev => ({ ...prev, [type]: result }));
  }, []);

  const dismissUploadResult = useCallback((type) => {
    setUploadResults(prev => ({ ...prev, [type]: null }));
  }, []);

  // ─── Utility Functions ─────────────────────────────────────────────────────
  
  const getAssignmentDisplay = useCallback((user) => {
    switch (user.assignedVacancies) {
      case 'all': return 'All Vacancies';
      case 'assignment': return 'By Assignment';
      case 'specific': return 'Specific Items';
      default: return 'No Access';
    }
  }, []);

  const getStatusColor = useCallback((status) => {
    switch (status) {
      case CANDIDATE_STATUS.GENERAL_LIST: return 'bg-blue-100 text-blue-800';
      case CANDIDATE_STATUS.LONG_LIST: return 'bg-yellow-100 text-yellow-800';
      case CANDIDATE_STATUS.FOR_REVIEW: return 'bg-orange-100 text-orange-800';
      case CANDIDATE_STATUS.DISQUALIFIED: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }, []);

  const getStatusLabel = useCallback((status) => {
    switch (status) {
      case CANDIDATE_STATUS.GENERAL_LIST: return 'General List';
      case CANDIDATE_STATUS.LONG_LIST: return 'Long List';
      case CANDIDATE_STATUS.FOR_REVIEW: return 'For Review';
      case CANDIDATE_STATUS.DISQUALIFIED: return 'Disqualified';
      default: return status;
    }
  }, []);

  const filterAndSortData = useCallback((data, searchFields) => {
    let filteredData = [...data];

    // Apply search term
    if (searchTerm) {
      filteredData = filteredData.filter(item =>
        searchFields.some(field => {
          const value = field.split('.').reduce((obj, key) => obj?.[key], item);
          return value?.toString().toLowerCase().includes(searchTerm.toLowerCase());
        })
      );
    }

    // Apply column filters
    Object.keys(filters).forEach(key => {
      if (filters[key]) {
        filteredData = filteredData.filter(item => {
          const value = key.split('.').reduce((obj, k) => obj?.[k], item);
          return value?.toString().toLowerCase().includes(filters[key].toLowerCase());
        });
      }
    });

    // Apply sorting
    if (sortConfig.key) {
      filteredData.sort((a, b) => {
        let aValue = sortConfig.key.split('.').reduce((obj, key) => obj?.[key], a);
        let bValue = sortConfig.key.split('.').reduce((obj, key) => obj?.[key], b);

        // Strip competency prefixes when sorting by 'name'
        if (sortConfig.key === 'name' && typeof aValue === 'string' && typeof bValue === 'string') {
          // Remove patterns like "(ADV) -", "(BAS) -", "(INT) -" from the beginning
          aValue = aValue.replace(/^\([A-Z]+\)\s*-\s*/i, '').trim();
          bValue = bValue.replace(/^\([A-Z]+\)\s*-\s*/i, '').trim();
        }

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return filteredData;
  }, [searchTerm, filters, sortConfig]);

  // ─── CSV Utility Functions ─────────────────────────────────────────────────
  
  const convertToCSV = useCallback((array) => {
    if (array.length === 0) return '';

    const headers = Object.keys(array[0]);
    const csvContent = [
      headers.join(','),
      ...array.map(row =>
        headers.map(header => {
          const value = row[header];
          if (typeof value === 'object' && value !== null) {
            return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          }
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value || '';
        }).join(',')
      )
    ].join('\n');

    return csvContent;
  }, []);

  const downloadCSV = useCallback((data, filename) => {
    const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);


  // ─── Data Loading Functions ────────────────────────────────────────────────

  const loadPublicationRanges = useCallback(async () => {
    try {
      const ranges = await publicationRangesAPI.getAll(showArchivedRanges);
      setPublicationRanges(ranges);

      if (selectedPublicationRange) {
        const stillExists = ranges.find(r => r._id === selectedPublicationRange);
        if (!stillExists) {
          setSelectedPublicationRange('');
          showToast('Selected publication range is no longer available', 'info');
        }
      }
    } catch (error) {
      console.error('Failed to load publication ranges:', error);
      showToast('Failed to load publication ranges', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchivedRanges, selectedPublicationRange]);

  const loadUsers = useCallback(async (forceRefresh = false) => {
  if (dataCacheRef.current.users && !forceRefresh) {
    setUsers(dataCacheRef.current.users);
    return;
  }
  
  try {
    const usersData = await usersAPI.getAll();
    setUsers(usersData);
    dataCacheRef.current.users = usersData;
  } catch (error) {
    console.error('Failed to load users:', error);
    showToast('Failed to load users', 'error');
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

const loadVacancies = useCallback(async (forceRefresh = false) => {
  const cacheKey = `${selectedPublicationRange}_${showArchivedRanges}`;
  if (dataCacheRef.current.vacancies?.cacheKey === cacheKey && !forceRefresh) {
    setVacancies(dataCacheRef.current.vacancies.data);
    setAssignments(dataCacheRef.current.vacancies.assignments);
    setRepostedItemNumbers(dataCacheRef.current.vacancies.repostedItemNumbers);
    return;
  }

  try {
    let vacanciesRes;
    if (selectedPublicationRange) {
      const selectedRange = publicationRanges.find(r => r._id === selectedPublicationRange);
      const includeArchived = selectedRange?.isArchived || false;
      vacanciesRes = await vacanciesAPI.getByPublicationRange(selectedPublicationRange, includeArchived);
    } else {
      vacanciesRes = await vacanciesAPI.getAll();
      vacanciesRes = vacanciesRes.filter(v => !v.isArchived || showArchivedRanges);
    }

    setVacancies(vacanciesRes);

    const uniqueAssignments = [...new Set(
      vacanciesRes.map(v => v.assignment).filter(a => a && a.trim() !== '')
    )].sort();
    setAssignments(uniqueAssignments);

    // ── Repost detection ──────────────────────────────────────────────────
    // Fetch ALL vacancies (active + archived) to find item numbers that
    // appear in both — those active ones have been reposted.
    const allVacancies = await vacanciesAPI.getAll();
    const archivedItemNumbers = new Set(
      allVacancies.filter(v => v.isArchived).map(v => v.itemNumber)
    );
    const activeItemNumbers = new Set(
      allVacancies.filter(v => !v.isArchived).map(v => v.itemNumber)
    );
    const reposted = new Set(
      [...activeItemNumbers].filter(n => archivedItemNumbers.has(n))
    );
    setRepostedItemNumbers(reposted);

    dataCacheRef.current.vacancies = {
      cacheKey,
      data: vacanciesRes,
      assignments: uniqueAssignments,
      repostedItemNumbers: reposted
    };
  } catch (error) {
    console.error('Failed to load vacancies:', error);
    showToast('Failed to load vacancies', 'error');
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedPublicationRange, publicationRanges, showArchivedRanges]);

const loadCandidates = useCallback(async (forceRefresh = false) => {
  const cacheKey = `${selectedPublicationRange}_${showArchivedRanges}`;
  if (dataCacheRef.current.candidates?.cacheKey === cacheKey && !forceRefresh) {
    setCandidates(dataCacheRef.current.candidates.data);
    return;
  }
  
  try {
    let candidatesRes;
    
    if (selectedPublicationRange) {
      const selectedRange = publicationRanges.find(r => r._id === selectedPublicationRange);
      const includeArchived = selectedRange?.isArchived || false;
      candidatesRes = await candidatesAPI.getByPublicationRange(selectedPublicationRange, includeArchived);
    } else {
      candidatesRes = await candidatesAPI.getAll();
      candidatesRes = candidatesRes.filter(c => !c.isArchived || showArchivedRanges);
    }
    
    setCandidates(candidatesRes);
    dataCacheRef.current.candidates = {
      cacheKey,
      data: candidatesRes
    };
  } catch (error) {
    console.error('Failed to load candidates:', error);
    showToast('Failed to load candidates', 'error');
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedPublicationRange, publicationRanges, showArchivedRanges]);

const loadCompetencies = useCallback(async (forceRefresh = false) => {
  if (dataCacheRef.current.competencies && !forceRefresh) {
    setCompetencies(dataCacheRef.current.competencies);
    return;
  }
  
  try {
    const competenciesData = await competenciesAPI.getAll();
    setCompetencies(competenciesData);
    dataCacheRef.current.competencies = competenciesData;
  } catch (error) {
    console.error('Failed to load competencies:', error);
    showToast('Failed to load competencies', 'error');
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

const handleViewCompetencies = async (vacancy) => {
  setSelectedVacancyForCompetencies(vacancy);
  setShowCompetencyModal(true);
  setLoadingCompetencies(true);
  
  try {
    const competenciesData = await competenciesAPI.getByVacancy(vacancy._id);
    setVacancyCompetencies(competenciesData);
  } catch (error) {
    console.error('Failed to load competencies:', error);
    showToast('Failed to load competencies', 'error');
    setVacancyCompetencies([]);
  } finally {
    setLoadingCompetencies(false);
  }
};

// Replace the tab change useEffect with this smarter version
useEffect(() => {
  if (isInitialMount.current) {
    isInitialMount.current = false;
    return;
  }

  const loadTabData = async () => {
    if (loadingData.current) return;

    loadingData.current = true;
    
    // NO LOADING SPINNER for cached data
    const needsLoading = 
      (activeTab === 'users' && !dataCacheRef.current.users) ||
      (activeTab === 'assignments' && !dataCacheRef.current.users) ||
      (activeTab === 'vacancies' && !dataCacheRef.current.vacancies) ||
      (activeTab === 'candidates' && !dataCacheRef.current.candidates) ||
      (activeTab === 'competencies' && !dataCacheRef.current.competencies);
    
    if (needsLoading) {
      setLoading(true);
    }

    try {
      switch (activeTab) {
        case 'users':
        case 'assignments':
          await loadUsers();
          break;
        case 'vacancies':
          await loadVacancies();
          break;
        case 'candidates':
          await loadCandidates();
          break;
        case 'competencies':
          await loadCompetencies();
          break;
      }
    } catch (error) {
      console.error('Tab data load failed:', error);
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
      loadingData.current = false;
    }
  };

  loadTabData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeTab]);

// Update loadDataForCurrentTab to invalidate cache
const loadDataForCurrentTab = useCallback(async () => {
  if (loadingData.current) return;

  loadingData.current = true;
  setLoading(true);

  try {
    switch (activeTab) {
      case 'users':
        await loadUsers(true); // Force refresh
        break;
      case 'vacancies':
        await loadVacancies(true);
        break;
      case 'candidates':
        await loadCandidates(true);
        break;
      case 'competencies':
        await loadCompetencies(true);
        break;
      case 'assignments':
        await loadUsers(true);
        break;
    }
  } catch (error) {
    console.error('Data load failed for tab', activeTab, error);
    showToast('Failed to load data', 'error');
  } finally {
    setLoading(false);
    loadingData.current = false;
  }
}, [activeTab, loadUsers, loadVacancies, loadCandidates, loadCompetencies, showToast]);

  // ─── Event Handlers ────────────────────────────────────────────────────────

  const handleSort = useCallback((key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  const handleFilterChange = useCallback((key, value) => {
    setFilters((prev) => {
      const newFilters = { ...prev };
      if (value.trim() === '') {
        delete newFilters[key];
      } else {
        newFilters[key] = value;
      }
      return newFilters;
    });
  }, []);

  const handleItemNumberClick = useCallback((itemNumber) => {
    const vacancy = vacancies.find(v => v.itemNumber === itemNumber);
    if (vacancy) {
      setSelectedVacancy(vacancy);
      setShowVacancyModal(true);
    }
  }, [vacancies]);

  const handleAdd = useCallback((type) => {
    setModalType(type);
    setEditingItem(null);
    setShowModal(true);
  }, []);

  const handleEdit = useCallback((item, type) => {
    const itemName =
      type === 'user' ? item.name :
      type === 'vacancy' ? item.itemNumber :
      type === 'candidate' ? item.fullName :
      type === 'competency' ? item.name :
      type === 'assignment' ? item.name :
      'this item';

    setPendingAction({
      type: 'edit',
      item,
      category: type,
      itemName
    });
    setShowPasswordModal(true);
  }, []);

  const executeEdit = useCallback(() => {
    if (!pendingAction) return;
    const { item, category } = pendingAction;

    setModalType(category);
    setEditingItem(item);
    setShowModal(true);
    setPendingAction(null);
  }, [pendingAction]);

  const handleDelete = useCallback((id, type, itemName = 'this item') => {
    setPendingAction({
      type: 'delete',
      id,
      category: type,
      itemName
    });
    setShowPasswordModal(true);
  }, []);

  const executeDelete = useCallback(async () => {
    if (!pendingAction) return;
    const { id, category } = pendingAction;

    try {
      switch (category) {
        case 'user':
          await usersAPI.delete(id);
          break;
        case 'vacancy':
          await vacanciesAPI.delete(id);
          break;
        case 'candidate':
          await candidatesAPI.delete(id);
          break;
        case 'competency':
          await competenciesAPI.delete(id);
          break;
      }
      await loadDataForCurrentTab();
      showToast('Item deleted successfully!', 'success');
    } catch (error) {
      console.error('Failed to delete item:', error);
      showToast('Failed to delete item. Please try again.', 'error');
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction, loadDataForCurrentTab, showToast]);

  const handleCSVUpload = useCallback(async (file, type) => {
    try {
      if ((type === 'vacancies' || type === 'candidates') && !selectedPublicationRange) {
        showToast('Please select a publication range first', 'error');
        return;
      }

      setUploading(type, true);
      setUploadFileName(file.name);   // <-- NEW
      setUploadingType(type);         // <-- NEW
      setUploadResult(type, null);

      const formData = new FormData();
      formData.append('csv', file);

      let response;
      switch (type) {
        case 'vacancies':
          response = await vacanciesAPI.uploadCSV(formData, selectedPublicationRange);
          setLastVacancyUpload({      // <-- NEW: track so Undo knows the range
          publicationRangeId: selectedPublicationRange,
          uploadedAt: new Date(),
          });
          break;
        case 'candidates':
          response = await candidatesAPI.uploadCSVWithPublication(formData, selectedPublicationRange);
          break;
        case 'competencies':
          response = await competenciesAPI.uploadCSV(formData);
          break;
      }

      await loadDataForCurrentTab();
      showToast('CSV uploaded successfully!', 'success');
      setUploadResult(type, { type: 'success', message: response?.message || 'Upload successful' });
    } catch (error) {
      console.error('Failed to upload CSV:', error);
      const msg = error.response?.data?.invalidItemNumbers
        ? `Import failed: Invalid item numbers: ${error.response.data.invalidItemNumbers.join(', ')}`
        : error.response?.data?.message || 'Failed to upload CSV. Please check the format and try again.';
      showToast(msg, 'error');
      setUploadResult(type, { type: 'error', message: msg });
    } finally {
      setUploading(type, false);
      setUploadFileName('');   // <-- NEW
      setUploadingType(''); 
    }
  }, [selectedPublicationRange, loadDataForCurrentTab, showToast, setUploading, setUploadResult]);

  const handleUndoImport = useCallback(async (publicationRangeId) => {
    if (!publicationRangeId) {
      showToast('Please select a publication range', 'error');
      return;
    }

    if (!confirm('Undo the last import? This will delete all candidates imported in the last 5 minutes.')) {
      return;
    }

    try {
      const result = await candidatesAPI.undoImport(publicationRangeId, 5);
      showToast(`Undo successful: Deleted ${result.deletedCount} candidates`, 'success');
      await loadDataForCurrentTab();
    } catch (error) {
      console.error('Failed to undo import:', error);
      showToast('Failed to undo import', 'error');
    }
  }, [loadDataForCurrentTab, showToast]);

  const handleExportCSV = useCallback((type) => {
    try {
      let data = [];
      let filename = '';

      switch (type) {
        case 'users':
          data = users.map(user => ({
            name: user.name,
            email: user.email,
            userType: user.userType,
            raterType: user.raterType || '',
            position: user.position || '',
            designation: user.designation || '',
            administrativePrivilege: user.administrativePrivilege || false
          }));
          filename = 'users_template.csv';
          break;

        case 'vacancies':
          data = vacancies.map(vacancy => ({
            itemNumber: vacancy.itemNumber,
            position: vacancy.position,
            assignment: vacancy.assignment,
            salaryGrade: vacancy.salaryGrade,
            education: vacancy.qualifications?.education || '',
            training: vacancy.qualifications?.training || '',
            experience: vacancy.qualifications?.experience || '',
            eligibility: vacancy.qualifications?.eligibility || ''
          }));
          filename = 'vacancies_template.csv';
          break;

        case 'candidates':
          data = candidates.map(candidate => ({
            fullName: candidate.fullName,
            itemNumber: candidate.itemNumber,
            gender: candidate.gender,
            dateOfBirth: candidate.dateOfBirth,
            age: candidate.age,
            eligibility: candidate.eligibility,
            professionalLicense: candidate.professionalLicense || '',
            letterOfIntent: candidate.letterOfIntent || '',
            personalDataSheet: candidate.personalDataSheet || '',
            workExperienceSheet: candidate.workExperienceSheet || '',
            proofOfEligibility: candidate.proofOfEligibility || '',
            certificates: candidate.certificates || '',
            ipcr: candidate.ipcr || '',
            certificateOfEmployment: candidate.certificateOfEmployment || '',
            diploma: candidate.diploma || '',
            transcriptOfRecords: candidate.transcriptOfRecords || '',
            status: candidate.status
          }));
          filename = 'candidates_template.csv';
          break;

        case 'competencies':
          data = competencies.map(competency => {
            let vacancyIds = [];
            if (Array.isArray(competency.vacancyIds) && competency.vacancyIds.length > 0) {
              vacancyIds = competency.vacancyIds;
            } else if (competency.vacancyId) {
              vacancyIds = [competency.vacancyId];
            }

            const vacancyItemNumbers = vacancyIds
              .map(id => vacancies.find(v => v._id === id)?.itemNumber)
              .filter(Boolean)
              .join(';');
            
            return {
              name: competency.name,
              type: competency.type,
              vacancyItemNumbers: vacancyItemNumbers,
              isFixed: competency.isFixed === true ? 'true' : 'false'
            };
          });
          filename = 'competencies_template.csv';
          break;

        default:
          throw new Error('Invalid export type');
      }

      if (data.length === 0) {
        showToast(`No ${type} data to export. Please add some ${type} first.`, 'error');
        return;
      }

      const csvContent = convertToCSV(data);
      downloadCSV(csvContent, filename);
      showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} CSV exported successfully!`, 'success');
    } catch (error) {
      console.error('Failed to export CSV:', error);
      showToast('Failed to export CSV. Please try again.', 'error');
    }
  }, [users, vacancies, candidates, competencies, convertToCSV, downloadCSV, showToast]);

  const handleExportEmptyTemplate = useCallback((type) => {
    let templateData = {};
    let filename = '';

    switch (type) {
      case 'users':
        templateData = {
          name: 'John Doe',
          email: 'john.doe@example.com',
          userType: 'rater',
          raterType: 'Member',
          position: 'Manager',
          designation: 'Senior Manager',
          administrativePrivilege: false
        };
        filename = 'users_empty_template.csv';
        break;

      case 'vacancies':
        templateData = {
          itemNumber: 'ITEM-001',
          position: 'Software Engineer',
          assignment: 'IT Department',
          salaryGrade: 15,
          education: 'Bachelor\'s degree in Computer Science',
          training: 'Programming courses',
          experience: '2 years of software development',
          eligibility: 'CS Professional'
        };
        filename = 'vacancies_empty_template.csv';
        break;

      case 'candidates':
        templateData = {
          fullName: 'Jane Smith',
          itemNumber: 'ITEM-001',
          gender: 'Female',
          dateOfBirth: '1990-01-01',
          age: 33,
          eligibility: 'CS Professional',
          professionalLicense: 'https://drive.google.com/file/d/example1',
          letterOfIntent: 'https://drive.google.com/file/d/example2',
          personalDataSheet: 'https://drive.google.com/file/d/example3',
          workExperienceSheet: 'https://drive.google.com/file/d/example4',
          proofOfEligibility: 'https://drive.google.com/file/d/example5',
          certificates: 'https://drive.google.com/file/d/example6',
          ipcr: 'https://drive.google.com/file/d/example7',
          certificateOfEmployment: 'https://drive.google.com/file/d/example8',
          diploma: 'https://drive.google.com/file/d/example9',
          transcriptOfRecords: 'https://drive.google.com/file/d/example10',
          status: 'general_list'
        };
        filename = 'candidates_empty_template.csv';
        break;

      case 'competencies':
        templateData = {
          name: 'Communication Skills',
          type: 'basic',
          vacancyItemNumbers: 'ITEM-001;ITEM-002',
          isFixed: 'false'
        };
        filename = 'competencies_empty_template.csv';
        break;
    }

    const csvContent = convertToCSV([templateData]);
    downloadCSV(csvContent, filename);
    showToast(`Empty ${type} template exported successfully!`, 'success');
  }, [convertToCSV, downloadCSV, showToast]);

  // Load publication ranges on mount and when archive toggle changes
  // Load publication ranges when archive toggle changes
  useEffect(() => {
    const loadRanges = async () => {
      try {
        const ranges = await publicationRangesAPI.getAll(showArchivedRanges);
        setPublicationRanges(ranges);

        if (selectedPublicationRange) {
          const stillExists = ranges.find(r => r._id === selectedPublicationRange);
          if (!stillExists) {
            setSelectedPublicationRange('');
            showToast('Selected publication range is no longer available', 'info');
          }
        }
      } catch (error) {
        console.error('Failed to load publication ranges:', error);
        showToast('Failed to load publication ranges', 'error');
      }
    };
    
    loadRanges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchivedRanges]);

  // Initial data load on mount - LOAD ALL TABS
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        await loadPublicationRanges();
        
        // 🚀 PRE-LOAD ALL TABS IN PARALLEL
        await Promise.all([
          loadUsers(),        // For users + assignments tabs
          loadVacancies(),    // For vacancies tab
          loadCandidates(),   // For candidates tab
          loadCompetencies()  // For competencies tab
        ]);
        
      } catch (error) {
        console.error('Initial data load failed:', error);
        showToast('Failed to load initial data', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Reload data when publication range or archive setting changes
  useEffect(() => {
    if (isInitialMount.current) return;

    const reloadData = async () => {
      if (loadingData.current) return;
      
      loadingData.current = true;
      setLoading(true);

      try {
        if (activeTab === 'vacancies') {
          await loadVacancies();
        } else if (activeTab === 'candidates') {
          await loadCandidates();
        }
      } catch (error) {
        console.error('Data reload failed:', error);
      } finally {
        setLoading(false);
        loadingData.current = false;
      }
    };

    reloadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPublicationRange, showArchivedRanges]);

  // Modal focus management
  useEffect(() => {
    const anyModalOpen = showModal || showVacancyModal || showPasswordModal;
    
    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [showModal, showVacancyModal, showPasswordModal]);

  // Clear file inputs when publication range changes
  useEffect(() => {
    const vacancyInput = document.getElementById('vacancy-csv-upload');
    const candidateInput = document.getElementById('candidate-csv-upload');
    
    if (vacancyInput) vacancyInput.value = '';
    if (candidateInput) candidateInput.value = '';
  }, [selectedPublicationRange]);

  // ─── Render Helper Functions ───────────────────────────────────────────────

  const renderUsers = useCallback(() => {
    const filteredUsers = filterAndSortData(users, ['name', 'email', 'userType', 'raterType', 'position']);

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Users Management</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => handleExportCSV('users')}
              className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
              disabled={users.length === 0}
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExportEmptyTemplate('users')}
              className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
            >
              Download Template
            </button>
            <button 
              onClick={() => handleAdd('user')} 
              className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600"
            >
              Add User
            </button>
          </div>
        </div>
        <div className="card bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm" role="table">
              <thead className="bg-gray-50">
                <tr>
                  <FilterableHeader 
                    label="Name" 
                    filterKey="name" 
                    sortKey="name" 
                    filterValue={filters.name || ''} 
                    onFilterChange={handleFilterChange} 
                    onSort={handleSort} 
                    sortConfig={sortConfig} 
                  />
                  <FilterableHeader 
                    label="Email" 
                    filterKey="email" 
                    sortKey="email" 
                    filterValue={filters.email || ''} 
                    onFilterChange={handleFilterChange} 
                    onSort={handleSort} 
                    sortConfig={sortConfig} 
                  />
                  <FilterableHeader 
                    label="User Type" 
                    filterKey="userType" 
                    sortKey="userType" 
                    filterValue={filters.userType || ''} 
                    onFilterChange={handleFilterChange} 
                    onSort={handleSort} 
                    sortConfig={sortConfig} 
                  />
                  <FilterableHeader 
                    label="Rater Type" 
                    filterKey="raterType" 
                    sortKey="raterType" 
                    filterValue={filters.raterType || ''} 
                    onFilterChange={handleFilterChange} 
                    onSort={handleSort} 
                    sortConfig={sortConfig} 
                  />
                  <FilterableHeader 
                    label="Position" 
                    filterKey="position" 
                    sortKey="position" 
                    filterValue={filters.position || ''} 
                    onFilterChange={handleFilterChange} 
                    onSort={handleSort} 
                    sortConfig={sortConfig} 
                  />
                  <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map(user => (
                  <tr key={user._id}>
                    <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">
                      {user.name}
                    </td>
                    <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">
                      {user.email}
                    </td>
                    <td className="table-cell px-4 py-2">
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                        {user.userType}
                      </span>
                    </td>
                    <td className="table-cell px-4 py-2 text-xs">
                      {user.raterType || '-'}
                    </td>
                    <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">
                      {user.position || '-'}
                    </td>
                    <td className="table-cell px-4 py-2">
                      <button
                        onClick={() => handleEdit(user, 'user')}
                        className="btn-secondary px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 mr-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(user._id, 'user', user.name)}
                        className="btn-danger px-2 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                      No users found matching your search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }, [users, filters, sortConfig, filterAndSortData, handleFilterChange, handleSort, handleExportCSV, handleExportEmptyTemplate, handleAdd, handleEdit, handleDelete]);

  const handleUndoVacancyImport = useCallback(async () => {
  if (!lastVacancyUpload) {
    showToast('No vacancy import to undo', 'error');
    return;
  }

  if (!confirm('Undo the last vacancy import? This will delete all vacancies imported in the last 5 minutes.')) {
    return;
  }

  try {
    const result = await vacanciesAPI.undoImport(lastVacancyUpload.publicationRangeId, 5);
    showToast(`Undo successful: Deleted ${result.deletedCount} vacancies`, 'success');
    setLastVacancyUpload(null);
    await loadDataForCurrentTab();
  } catch (error) {
    console.error('Failed to undo vacancy import:', error);
    showToast('Failed to undo import', 'error');
  }
}, [lastVacancyUpload, loadDataForCurrentTab, showToast]);

  const renderVacancies = useCallback(() => {
    const filteredVacancies = filterAndSortData(vacancies, ['itemNumber', 'position', 'assignment', 'salaryGrade']);
    const activePublicationRanges = publicationRanges.filter(pr => pr.isActive && !pr.isArchived);
    const isUploading = csvUploading.vacancies;
    const uploadResult = uploadResults.vacancies;

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Vacancies Management</h2>
          <div className="flex space-x-2">
            <select
              value={selectedPublicationRange || ''}
              onChange={(e) => setSelectedPublicationRange(e.target.value)}
              className="px-3 py-1 text-xs border border-gray-300 rounded bg-white"
            >
              <option value="">All Ranges</option>
              {publicationRanges.map(pr => (
                <option key={pr._id} value={pr._id}>{pr.name}</option>
              ))}
            </select>
            <label className="flex items-center text-xs">
              <input
                type="checkbox"
                checked={showArchivedRanges}
                onChange={(e) => setShowArchivedRanges(e.target.checked)}
                className="mr-2"
              />
              Show Archived
            </label>
            <button
              onClick={() => handleExportCSV('vacancies')}
              className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
              disabled={vacancies.length === 0}
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExportEmptyTemplate('vacancies')}
              className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
            >
              Download Template
            </button>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                if (e.target.files[0]) {
                  handleCSVUpload(e.target.files[0], 'vacancies');
                  e.target.value = '';
                }
              }}
              className="hidden"
              id="vacancy-csv-upload"
              disabled={isUploading}
            />
            <label
              htmlFor="vacancy-csv-upload"
              className={`btn-secondary px-3 py-1 rounded text-xs flex items-center gap-1 ${
                isUploading
                  ? 'bg-blue-100 text-blue-600 cursor-wait'
                  : !selectedPublicationRange
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-200 hover:bg-gray-300 cursor-pointer'
              }`}
              onClick={(e) => {
                if (isUploading) { e.preventDefault(); return; }
                if (!selectedPublicationRange) {
                  e.preventDefault();
                  showToast('Please select a publication range first', 'error');
                }
              }}
            >
              {isUploading ? (
                <>
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Uploading…
                </>
              ) : 'Upload CSV'}
            </label>
            {selectedPublicationRange && lastVacancyUpload && (
              <button
                onClick={handleUndoVacancyImport}
                className="px-3 py-1 rounded text-xs bg-orange-500 text-white hover:bg-orange-600"
              >
                Undo Last Import
              </button>
            )}
            <button
              onClick={() => handleAdd('vacancy')}
              className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600"
            >
              Add Vacancy
            </button>
          </div>
        </div>

        {/* Upload result banner */}
        {uploadResult && (
          <div className={`flex items-center justify-between px-3 py-2 rounded text-xs border ${
            uploadResult.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <span>{uploadResult.type === 'success' ? '✅' : '❌'} {uploadResult.message}</span>
            <button onClick={() => dismissUploadResult('vacancies')} className="ml-4 text-gray-400 hover:text-gray-600">✕</button>
          </div>
        )}

        <div className="card bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm" role="table">
              <thead className="bg-gray-50">
                <tr>
                  <FilterableHeader 
                    label="Item Number" 
                    filterKey="itemNumber" 
                    sortKey="itemNumber" 
                    filterValue={filters.itemNumber || ''} 
                    onFilterChange={handleFilterChange} 
                    onSort={handleSort} 
                    sortConfig={sortConfig} 
                  />
                  <FilterableHeader 
                    label="Position" 
                    filterKey="position" 
                    sortKey="position" 
                    filterValue={filters.position || ''} 
                    onFilterChange={handleFilterChange} 
                    onSort={handleSort} 
                    sortConfig={sortConfig} 
                  />
                  <FilterableHeader 
                    label="Assignment" 
                    filterKey="assignment" 
                    sortKey="assignment" 
                    filterValue={filters.assignment || ''} 
                    onFilterChange={handleFilterChange} 
                    onSort={handleSort} 
                    sortConfig={sortConfig} 
                  />
                  <FilterableHeader 
                    label="Salary Grade" 
                    filterKey="salaryGrade" 
                    sortKey="salaryGrade" 
                    filterValue={filters.salaryGrade || ''} 
                    onFilterChange={handleFilterChange} 
                    onSort={handleSort} 
                    sortConfig={sortConfig} 
                  />
                  <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Competencies
                  </th>
                  <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredVacancies.map(vacancy => (
                  <tr key={vacancy._id} className={vacancy.isArchived ? 'bg-gray-50 opacity-60' : ''}>
                    <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleItemNumberClick(vacancy.itemNumber)}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {vacancy.itemNumber}
                        </button>
                        {vacancy.isArchived && (
                          <span className="text-xs text-gray-500">(Archived)</span>
                        )}
                        {!vacancy.isArchived && repostedItemNumbers.has(vacancy.itemNumber) && (
                          <span
                            className="px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-300 rounded text-xs font-medium"
                            title="This item number also exists in an archived publication range — it has been reposted."
                          >
                            ♻ Reposted
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">
                      {vacancy.position}
                    </td>
                    <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">
                      {vacancy.assignment}
                    </td>
                    <td className="table-cell px-4 py-2 text-xs">
                      SG {vacancy.salaryGrade}
                    </td>
                    <td className="table-cell px-4 py-2">
                      <button
                        onClick={() => handleViewCompetencies(vacancy)}
                        className="text-blue-600 hover:text-blue-800 hover:underline text-xs"
                        disabled={vacancy.isArchived}
                      >
                        View
                      </button>
                    </td>
                    <td className="table-cell px-4 py-2">
                      <button
                        onClick={() => handleEdit(vacancy, 'vacancy')}
                        className="btn-secondary px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 mr-1"
                        disabled={vacancy.isArchived}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(vacancy._id, 'vacancy', vacancy.itemNumber)}
                        className="btn-danger px-2 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600"
                        disabled={vacancy.isArchived}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredVacancies.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                      No vacancies found matching your search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }, [
    vacancies, 
    publicationRanges, 
    selectedPublicationRange, 
    showArchivedRanges, 
    filters, 
    sortConfig, 
    filterAndSortData, 
    handleFilterChange, 
    handleSort, 
    handleExportCSV, 
    handleExportEmptyTemplate, 
    handleCSVUpload, 
    handleAdd, 
    handleEdit, 
    handleDelete, 
    handleItemNumberClick,
    setSelectedPublicationRange,
    showToast,
    repostedItemNumbers,
    csvUploading.vacancies,
    uploadResults.vacancies,
    dismissUploadResult,
  ]);

  const renderCandidates = useCallback(() => {
    const filteredCandidates = filterAndSortData(candidates, ['fullName', 'itemNumber', 'gender', 'age', 'status']);
    const activePublicationRanges = publicationRanges.filter(pr => pr.isActive && !pr.isArchived);
    const isUploading = csvUploading.candidates;
    const uploadResult = uploadResults.candidates;

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Candidates Management</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => handleExportCSV('candidates')}
              className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
              disabled={candidates.length === 0}
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExportEmptyTemplate('candidates')}
              className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
            >
              Download Template
            </button>
            <select
              value={selectedPublicationRange || ''}
              onChange={(e) => setSelectedPublicationRange(e.target.value)}
              className="px-3 py-1 text-xs border border-gray-300 rounded bg-white"
            >
              <option value="">Select Publication Range</option>
              {activePublicationRanges.map(pr => (
                <option key={pr._id} value={pr._id}>{pr.name}</option>
              ))}
            </select>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                if (e.target.files[0]) {
                  handleCSVUpload(e.target.files[0], 'candidates');
                  e.target.value = '';
                }
              }}
              className="hidden"
              id="candidate-csv-upload"
              disabled={isUploading}
            />
            <label
              htmlFor="candidate-csv-upload"
              className={`btn-secondary px-3 py-1 rounded text-xs flex items-center gap-1 ${
                isUploading
                  ? 'bg-blue-100 text-blue-600 cursor-wait'
                  : !selectedPublicationRange
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-200 hover:bg-gray-300 cursor-pointer'
              }`}
              onClick={(e) => {
                if (isUploading) { e.preventDefault(); return; }
                if (!selectedPublicationRange) {
                  e.preventDefault();
                  showToast('Please select a publication range first', 'error');
                }
              }}
            >
              {isUploading ? (
                <>
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Uploading…
                </>
              ) : 'Upload CSV'}
            </label>
            {selectedPublicationRange && (
              <button
                onClick={() => handleUndoImport(selectedPublicationRange)}
                className="px-3 py-1 rounded text-xs bg-orange-500 text-white hover:bg-orange-600"
              >
                Undo Last Import
              </button>
            )}
            <button 
              onClick={() => handleAdd('candidate')} 
              className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600"
            >
              Add Candidate
            </button>
          </div>
        </div>

        {/* Upload result banner */}
        {uploadResult && (
          <div className={`flex items-center justify-between px-3 py-2 rounded text-xs border ${
            uploadResult.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <span>{uploadResult.type === 'success' ? '✅' : '❌'} {uploadResult.message}</span>
            <button onClick={() => dismissUploadResult('candidates')} className="ml-4 text-gray-400 hover:text-gray-600">✕</button>
          </div>
        )}

        <div className="card bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm" role="table">
              <thead className="bg-gray-50">
                <tr>
                  <FilterableHeader 
                    label="Name" 
                    filterKey="fullName" 
                    sortKey="fullName" 
                    filterValue={filters.fullName || ''} 
                    onFilterChange={handleFilterChange} 
                    onSort={handleSort} 
                    sortConfig={sortConfig} 
                  />
                  <FilterableHeader 
                    label="Item Number" 
                    filterKey="itemNumber" 
                    sortKey="itemNumber" 
                    filterValue={filters.itemNumber || ''} 
                    onFilterChange={handleFilterChange} 
                    onSort={handleSort} 
                    sortConfig={sortConfig} 
                  />
                  <FilterableHeader 
                    label="Gender" 
                    filterKey="gender" 
                    sortKey="gender" 
                    filterValue={filters.gender || ''} 
                    onFilterChange={handleFilterChange} 
                    onSort={handleSort} 
                    sortConfig={sortConfig} 
                  />
                  <FilterableHeader 
                    label="Age" 
                    filterKey="age" 
                    sortKey="age" 
                    filterValue={filters.age || ''} 
                    onFilterChange={handleFilterChange} 
                    onSort={handleSort} 
                    sortConfig={sortConfig} 
                  />
                  <FilterableHeader 
                    label="Status" 
                    filterKey="status" 
                    sortKey="status" 
                    filterValue={filters.status || ''} 
                    onFilterChange={handleFilterChange} 
                    onSort={handleSort} 
                    sortConfig={sortConfig} 
                  />
                  <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCandidates.map(candidate => (
                  <tr key={candidate._id} className={candidate.isArchived ? 'bg-gray-50 opacity-60' : ''}>
                    <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">
                      {candidate.fullName}
                      {candidate.isArchived && (
                        <span className="ml-2 text-xs text-gray-500">(Archived)</span>
                      )}
                    </td>
                    <td className="table-cell px-4 py-2 text-xs">
                      <button
                        onClick={() => handleItemNumberClick(candidate.itemNumber)}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {candidate.itemNumber}
                      </button>
                    </td>
                    <td className="table-cell px-4 py-2 text-xs">
                      {candidate.gender}
                    </td>
                    <td className="table-cell px-4 py-2 text-xs">
                      {candidate.age}
                    </td>
                    <td className="table-cell px-4 py-2">
                      <span className={`px-2 py-1 rounded text-xs ${getStatusColor(candidate.status)}`}>
                        {getStatusLabel(candidate.status)}
                      </span>
                    </td>
                    <td className="table-cell px-4 py-2">
                      <button
                        onClick={() => handleEdit(candidate, 'candidate')}
                        className="btn-secondary px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 mr-1"
                        disabled={candidate.isArchived}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(candidate._id, 'candidate', candidate.fullName)}
                        className="btn-danger px-2 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600"
                        disabled={candidate.isArchived}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredCandidates.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                      No candidates found matching your search criteria
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }, [
    candidates,
    publicationRanges,
    selectedPublicationRange,
    filters,
    sortConfig,
    filterAndSortData,
    handleFilterChange,
    handleSort,
    handleExportCSV,
    handleExportEmptyTemplate,
    handleCSVUpload,
    handleUndoImport,
    handleAdd,
    handleEdit,
    handleDelete,
    handleItemNumberClick,
    getStatusColor,
    getStatusLabel,
    setSelectedPublicationRange,
    showToast,
    csvUploading.candidates,
    uploadResults.candidates,
    dismissUploadResult,
  ]);

  const handleCompetencyUpload = useCallback(async (file) => {
    try {
      setUploading('competencies', true);
      setUploadFileName(file.name);
      setUploadingType('competencies');
      setUploadResult('competencies', null);

      const formData = new FormData();
      formData.append('csv', file);

      const result = await competenciesAPI.uploadCSV(formData);

      // Store upload info so the Undo button can reference it
      setLastCompetencyUpload({
        uploadId : result.uploadId,
        message  : result.message,
        results  : result.results,
      });

      // Build a human-readable summary for the toast
      const { created, merged, skipped } = result.results;
      const parts = [];
      if (created.length)  parts.push(`${created.length} created`);
      if (merged.length)   parts.push(`${merged.length} merged`);
      if (skipped.length)  parts.push(`${skipped.length} skipped`);

      showToast(
        `Competencies uploaded — ${parts.join(', ')}. Click "Undo Upload" to revert.`,
        'success'
      );

      setUploadResult('competencies', { type: 'success', message: result.message, results: result.results });
      await loadDataForCurrentTab();
    } catch (error) {
      console.error('Competency CSV upload error:', error);
      const serverMessage =
        error.response?.data?.errors?.join('\n') ||
        error.response?.data?.message ||
        'Failed to upload CSV. Please check the format and try again.';
      showToast(serverMessage, 'error');
      setUploadResult('competencies', { type: 'error', message: serverMessage });
    } finally {
      setUploading('competencies', false);
      setUploadFileName('');
      setUploadingType('');
    }
  }, [loadDataForCurrentTab, showToast, setUploading, setUploadResult]);

  const handleUndoCompetencyUpload = useCallback(async () => {
    if (!lastCompetencyUpload) {
      showToast('No upload to undo', 'error');
      return;
    }

    if (
      !window.confirm(
        `Undo the last competency upload?\n\n${lastCompetencyUpload.message}\n\nThis will:\n` +
        `• Delete ${lastCompetencyUpload.results.created.length} newly created competencies\n` +
        `• Remove ${lastCompetencyUpload.results.merged.length} newly added vacancy links\n\n` +
        `This action cannot be undone again.`
      )
    ) return;

    try {
      const result = await competenciesAPI.undoUpload(lastCompetencyUpload.uploadId);
      showToast(result.message, 'success');
      setLastCompetencyUpload(null);
      setUploadResult('competencies', null);
      await loadDataForCurrentTab();
    } catch (error) {
      console.error('Undo upload error:', error);
      showToast(
        error.response?.data?.message || 'Failed to undo upload',
        'error'
      );
    }
  }, [lastCompetencyUpload, loadDataForCurrentTab, showToast, setUploadResult]);

  const renderCompetencies = useCallback(() => {
    const filteredCompetencies = filterAndSortData(competencies, ['name', 'type']);
    const isUploading = csvUploading.competencies;
    const uploadResult = uploadResults.competencies;

    return (
      <div className="space-y-4">
        {/* ── Header row ── */}
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Competencies Management</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowCompetencySummary(true)}
              className="px-3 py-1 rounded text-xs bg-purple-500 text-white hover:bg-purple-600 flex items-center gap-1"
            >
              📊 View Summary by Position
            </button>
            <button
              onClick={() => handleExportCSV('competencies')}
              className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
              disabled={competencies.length === 0}
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExportEmptyTemplate('competencies')}
              className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
            >
              Download Template
            </button>

            {/* Hidden file input */}
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                if (e.target.files[0]) {
                  handleCompetencyUpload(e.target.files[0]);
                  e.target.value = ''; // reset so same file can be re-uploaded
                }
              }}
              className="hidden"
              id="competency-csv-upload"
              disabled={isUploading}
            />
            <label
              htmlFor="competency-csv-upload"
              className={`btn-secondary px-3 py-1 rounded text-xs flex items-center gap-1 ${
                isUploading
                  ? 'bg-blue-100 text-blue-600 cursor-wait'
                  : 'bg-gray-200 hover:bg-gray-300 cursor-pointer'
              }`}
              onClick={(e) => { if (isUploading) e.preventDefault(); }}
            >
              {isUploading ? (
                <>
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Uploading…
                </>
              ) : 'Upload CSV'}
            </label>

            {/* Undo button — only visible if a recent upload exists */}
            {lastCompetencyUpload && (
              <button
                onClick={handleUndoCompetencyUpload}
                className="px-3 py-1 rounded text-xs bg-orange-500 text-white hover:bg-orange-600"
                title={lastCompetencyUpload.message}
              >
                ↩ Undo Upload
              </button>
            )}

            <button
              onClick={() => handleAdd('competency')}
              className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600"
            >
              Add Competency
            </button>
          </div>
        </div>

        {/* ── Upload result banner ── */}
        {uploadResult && (
          <div className={`flex items-center justify-between px-3 py-2 rounded text-xs border ${
            uploadResult.type === 'success'
              ? 'bg-blue-50 border-blue-200 text-blue-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex flex-col gap-1 flex-1">
              <div className="font-semibold">
                {uploadResult.type === 'success' ? 'Last upload result — ' : '❌ '}
                <span className="font-normal">{uploadResult.message}</span>
              </div>
              {uploadResult.type === 'success' && uploadResult.results && (
                <div className="flex flex-wrap gap-4 text-blue-700">
                  {uploadResult.results.created.length > 0 && (
                    <span>
                      ✅ <strong>Created ({uploadResult.results.created.length}):</strong>{' '}
                      {uploadResult.results.created.map((c) => c.name).join(', ')}
                    </span>
                  )}
                  {uploadResult.results.merged.length > 0 && (
                    <span>
                      🔀 <strong>Merged ({uploadResult.results.merged.length}):</strong>{' '}
                      {uploadResult.results.merged
                        .map((m) => `"${m.uploadedName}" → "${m.existingName}" (${m.similarity}% match, +${m.addedItemCount} vacancy link${m.addedItemCount !== 1 ? 's' : ''})`)
                        .join(' | ')}
                    </span>
                  )}
                  {uploadResult.results.skipped.length > 0 && (
                    <span>
                      ⏭ <strong>Skipped ({uploadResult.results.skipped.length}):</strong>{' '}
                      {uploadResult.results.skipped.map((s) => s.name).join(', ')}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => dismissUploadResult('competencies')} className="ml-4 text-gray-400 hover:text-gray-600 flex-shrink-0">✕</button>
          </div>
        )}

        {/* ── Table ── */}
        <div className="card bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm" role="table">
              <thead className="bg-gray-50">
                <tr>
                  <FilterableHeader
                    label="Name"
                    filterKey="name"
                    sortKey="name"
                    filterValue={filters.name || ''}
                    onFilterChange={handleFilterChange}
                    onSort={handleSort}
                    sortConfig={sortConfig}
                  />
                  <FilterableHeader
                    label="Type"
                    filterKey="type"
                    sortKey="type"
                    filterValue={filters.type || ''}
                    onFilterChange={handleFilterChange}
                    onSort={handleSort}
                    sortConfig={sortConfig}
                  />
                  <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vacancies
                  </th>
                  <FilterableHeader
                    label="Fixed"
                    filterKey="isFixed"
                    sortKey="isFixed"
                    filterValue={filters.isFixed || ''}
                    onFilterChange={handleFilterChange}
                    onSort={handleSort}
                    sortConfig={sortConfig}
                  />
                  <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCompetencies.map((competency) => {
                  let vacancyIds = [];
                  if (Array.isArray(competency.vacancyIds) && competency.vacancyIds.length > 0) {
                    vacancyIds = competency.vacancyIds;
                  } else if (competency.vacancyId) {
                    vacancyIds = [competency.vacancyId];
                  }

                  const activeVacancyNames = vacancyIds
                    .map((id) => vacancies.find((v) => v._id === id && !v.isArchived)?.itemNumber)
                    .filter(Boolean);
                  const archivedVacancyNames = vacancyIds
                    .map((id) => vacancies.find((v) => v._id === id && v.isArchived)?.itemNumber)
                    .filter(Boolean);
                  const vacancyNames = vacancyIds.length === 0 ? 'All Vacancies' : null;

                  return (
                    <tr key={competency._id}>
                      <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">
                        <button
                          onClick={() => handleViewCompetencyDetail(competency)}
                          className="text-left text-blue-700 hover:text-blue-900 hover:underline underline-offset-2 font-medium transition-colors"
                          title="View CBS proficiency levels"
                        >
                          {competency.name}
                        </button>
                      </td>
                      <td className="table-cell px-4 py-2">
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs capitalize">
                          {competency.type}
                        </span>
                      </td>
                        <td className="table-cell px-4 py-2 text-xs">
                        {vacancyIds.length === 0 ? (
                          <span className="text-gray-500 italic">All Vacancies</span>
                        ) : (
                          <button
                            onClick={async () => {
                              const allVacancies = await vacanciesAPI.getAll();
                              const linked = vacancyIds
                                .map(id => allVacancies.find(v => v._id === id || v._id?.toString() === id?.toString()))
                                .filter(Boolean);
                              const active = linked.filter(v => !v.isArchived);
                              const archived = linked.filter(v => v.isArchived);
                              setCompetencyVacancyModal({ competency, active, archived });
                            }}
                            className="text-blue-600 hover:underline text-left"
                          >
                            {vacancyIds.length} linked
                            {vacancyIds.some(id => vacancies.find(v => v._id === id && v.isArchived)) && (
                              <span className="ml-1 text-amber-500">⚠</span>
                            )}
                          </button>
                        )}
                      </td>
                      <td className="table-cell px-4 py-2">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            competency.isFixed
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {competency.isFixed ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="table-cell px-4 py-2">
                        <button
                          onClick={() => handleEdit(competency, 'competency')}
                          className="btn-secondary px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 mr-1"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(competency._id, 'competency', competency.name)}
                          className="btn-danger px-2 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredCompetencies.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                      No competencies found matching your search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }, [
    competencies,
    vacancies,
    filters,
    sortConfig,
    filterAndSortData,
    handleFilterChange,
    handleSort,
    handleExportCSV,
    handleExportEmptyTemplate,
    handleCompetencyUpload,
    handleUndoCompetencyUpload,
    handleAdd,
    handleEdit,
    handleDelete,
    lastCompetencyUpload,
    csvUploading.competencies,
    uploadResults.competencies,
    dismissUploadResult,
    competencyVacancyModal,
  ]);

  const renderVacancyAssignments = useCallback(() => {
  const filteredUsers = filterAndSortData(users, ['name', 'email', 'userType']);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Vacancy Assignments</h2>
        <div className="text-xs text-gray-600">
          Manage which vacancies each user can access. Archived vacancies are excluded.
        </div>
      </div>
      <div className="card bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm" role="table">
            <thead className="bg-gray-50">
              <tr>
                <FilterableHeader
                  label="User"
                  filterKey="name"
                  sortKey="name"
                  filterValue={filters.name || ''}
                  onFilterChange={handleFilterChange}
                  onSort={handleSort}
                  sortConfig={sortConfig}
                />
                <FilterableHeader
                  label="User Type"
                  filterKey="userType"
                  sortKey="userType"
                  filterValue={filters.userType || ''}
                  onFilterChange={handleFilterChange}
                  onSort={handleSort}
                  sortConfig={sortConfig}
                />
                <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assignment Type
                </th>
                <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Active Vacancies
                </th>
                <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map(u => {
                // Count active (non-archived) vacancies for display
                const activeCount = (() => {
                  if (u.assignedVacancies === 'all') return vacancies.filter(v => !v.isArchived).length;
                  if (u.assignedVacancies === 'assignment' && u.assignedAssignment)
                    return vacancies.filter(v => v.assignment === u.assignedAssignment && !v.isArchived).length;
                  if (u.assignedVacancies === 'specific')
                    return (u.assignedItemNumbers || []).filter(
                      n => vacancies.find(v => v.itemNumber === n && !v.isArchived)
                    ).length;
                  return 0;
                })();

                const suspendedCount = (u.suspendedItemNumbers || []).length;

                return (
                  <tr key={u._id}>
                    <td className="table-cell px-4 py-2">
                      <div>
                        <div className="font-medium text-xs">{u.name}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </div>
                    </td>
                    <td className="table-cell px-4 py-2">
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                        {u.userType}
                      </span>
                    </td>
                    <td className="table-cell px-4 py-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        u.assignedVacancies === 'none'       ? 'bg-gray-100 text-gray-800' :
                        u.assignedVacancies === 'all'        ? 'bg-green-100 text-green-800' :
                        u.assignedVacancies === 'assignment' ? 'bg-blue-100 text-blue-800' :
                        u.assignedVacancies === 'specific'   ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {getAssignmentDisplay(u)}
                      </span>
                      {u.assignedVacancies === 'assignment' && u.assignedAssignment && (
                        <div className="text-xs text-gray-500 mt-0.5">{u.assignedAssignment}</div>
                      )}
                    </td>
                    <td className="table-cell px-4 py-2">
                      {u.assignedVacancies === 'none' ? (
                        <span className="text-xs text-gray-400 italic">No access</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-700">
                            {activeCount} active
                          </span>
                          {suspendedCount > 0 && (
                            <span
                              className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs"
                              title="Item numbers suspended while their publication range is archived. They will restore automatically on unarchive."
                            >
                              {suspendedCount} suspended
                            </span>
                          )}
                          {activeCount > 0 && (
                            <button
                              onClick={() => {
                                setSelectedUserForDetails(u);
                                setShowAssignmentDetailsModal(true);
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              View Details →
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="table-cell px-4 py-2">
                      <button
                        onClick={() => handleEdit(u, 'assignment')}
                        className="btn-secondary px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
                      >
                        Assign Vacancies
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                    No users found matching your search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assignment Details Modal */}
      {showAssignmentDetailsModal && selectedUserForDetails && (
        <AssignmentDetailsModal
          user={selectedUserForDetails}
          vacancies={vacancies}
          onClose={() => {
            setShowAssignmentDetailsModal(false);
            setSelectedUserForDetails(null);
          }}
        />
      )}
    </div>
  );
}, [
  users,
  vacancies,
  filters,
  sortConfig,
  filterAndSortData,
  handleFilterChange,
  handleSort,
  handleEdit,
  getAssignmentDisplay,
  showAssignmentDetailsModal,
  selectedUserForDetails,
]);

  const renderInterviewSummary = useCallback(() => {
    return (
      <div className="space-y-4">
        <InterviewSummaryGenerator user={user} />
      </div>
    );
  }, [user]);

  // ─── Early Return for Loading State ───────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // ─── Main Return - JSX ─────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pt-16">
      {/* Sidebar - Fixed with Header Offset */}
      <div className="w-64 flex-shrink-0">
        <div className="sidebar fixed top-16 left-0 w-64 h-[calc(100vh-4rem)] bg-white shadow-xl border-r border-gray-200 overflow-y-auto z-40">
          <div className="p-6">
            <h2 className="text-xl font-bold mb-8 text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              Administrative Panel
            </h2>
            <nav className="space-y-2">
              <button
                onClick={() => setActiveTab('users')}
                className={`sidebar-item w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'users'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg transform scale-105'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:translate-x-1'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg">👥</span>
                  User Types
                </span>
              </button>
              <button
                onClick={() => setActiveTab('vacancies')}
                className={`sidebar-item w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'vacancies'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg transform scale-105'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:translate-x-1'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg">💼</span>
                  Vacancies
                </span>
              </button>
              <button
                onClick={() => setActiveTab('candidates')}
                className={`sidebar-item w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'candidates'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg transform scale-105'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:translate-x-1'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg">📋</span>
                  General List
                </span>
              </button>
              <button
                onClick={() => setActiveTab('competencies')}
                className={`sidebar-item w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'competencies'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg transform scale-105'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:translate-x-1'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg">⭐</span>
                  Competencies
                </span>
              </button>
              <button
                onClick={() => setActiveTab('assignments')}
                className={`sidebar-item w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'assignments'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg transform scale-105'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:translate-x-1'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg">📌</span>
                  Vacancy Assignments
                </span>
              </button>
              <button
                onClick={() => setActiveTab('interviewSummary')}
                className={`sidebar-item w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'interviewSummary'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg transform scale-105'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:translate-x-1'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg">📊</span>
                  Interview Summary
                </span>
              </button>
              <button
                onClick={() => setActiveTab('ratingLogs')}
                className={`sidebar-item w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'ratingLogs'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg transform scale-105'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:translate-x-1'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg">📝</span>
                  Rating Audit Log
                </span>
              </button>
              <button
                onClick={() => setActiveTab('publicationRanges')}
                className={`sidebar-item w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'publicationRanges'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg transform scale-105'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:translate-x-1'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg">📅</span>
                  Publication Ranges
                </span>
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto">
        {/* Search Bar - Only show for data tabs */}
        {activeTab !== 'interviewSummary' && activeTab !== 'ratingLogs' && activeTab !== 'publicationRanges' && (
          <SearchBar
            key={activeTab}
            placeholder={
              activeTab === 'users'
                ? 'Search users by name, email, or type...'
                : activeTab === 'vacancies'
                ? 'Search vacancies by item number, position, assignment, or salary grade...'
                : activeTab === 'candidates'
                ? 'Search candidates by name, item number, gender, age, or status...'
                : activeTab === 'competencies'
                ? 'Search competencies by name or type...'
                : 'Search...'
            }
            value={searchTerm}
            onChange={setSearchTerm}
          />
        )}

        {/* Tab Content */}
        {activeTab === 'users' && renderUsers()}
        {activeTab === 'vacancies' && renderVacancies()}
        {activeTab === 'candidates' && renderCandidates()}
        {activeTab === 'competencies' && renderCompetencies()}
        {activeTab === 'assignments' && renderVacancyAssignments()}
        {activeTab === 'interviewSummary' && renderInterviewSummary()}
        {activeTab === 'ratingLogs' && <RatingLogsView />}
        {activeTab === 'publicationRanges' && <PublicationRangeManager />}

        {/* Modals */}
        {showModal && modalType === 'user' && (
          <UserModal
            editingItem={editingItem}
            onClose={() => setShowModal(false)}
            onSuccess={loadDataForCurrentTab}
          />
        )}
        {showModal && modalType === 'vacancy' && (
          <VacancyModal
            editingItem={editingItem}
            publicationRanges={publicationRanges}
            onClose={() => setShowModal(false)}
            onSuccess={loadDataForCurrentTab}
          />
        )}
        {showModal && modalType === 'candidate' && (
          <CandidateModal
            editingItem={editingItem}
            publicationRanges={publicationRanges}
            onClose={() => setShowModal(false)}
            onSuccess={loadDataForCurrentTab}
          />
        )}
        {showModal && modalType === 'competency' && (
          <CompetencyModal
            editingItem={editingItem}
            vacancies={vacancies}
            onClose={() => setShowModal(false)}
            onSuccess={loadDataForCurrentTab}
          />
        )}
        {showModal && modalType === 'assignment' && (
          <VacancyAssignmentModal
            editingItem={editingItem}
            assignments={assignments}
            vacancies={vacancies}
            onClose={() => setShowModal(false)}
            onSuccess={loadDataForCurrentTab}
          />
        )}
        {showVacancyModal && (
          <VacancyDetailsModal
            vacancy={selectedVacancy}
            onClose={() => setShowVacancyModal(false)}
          />
        )}

        <CsvUploadProgressModal
          isOpen={!!uploadingType}
          type={uploadingType}
          fileName={uploadFileName}
        />
        
        <CompetencyVacancyModal
          data={competencyVacancyModal}
          onClose={() => setCompetencyVacancyModal(null)}
        />

        {/* Competency Summary by Position Modal */}
        {showCompetencySummary && (
          <CompetencySummaryModal
            vacancies={vacancies}
            competencies={competencies}
            onClose={() => setShowCompetencySummary(false)}
          />
        )}

        {/* Competency Viewing Modal */}
        {showCompetencyModal && selectedVacancyForCompetencies && (
          <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="modal-content bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 overflow-y-auto max-h-[90vh]">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Competencies</h2>
                <button 
                  onClick={() => {
                    setShowCompetencyModal(false);
                    setSelectedVacancyForCompetencies(null);
                    setVacancyCompetencies([]);
                  }} 
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedVacancyForCompetencies.position}
                </h3>
                <p className="text-sm text-gray-600">
                  Item Number: {selectedVacancyForCompetencies.itemNumber}
                </p>
                <p className="text-sm text-gray-600">
                  Assignment: {selectedVacancyForCompetencies.assignment}
                </p>
                <p className="text-sm text-gray-600">
                  Salary Grade: SG {selectedVacancyForCompetencies.salaryGrade}
                </p>
              </div>

              {loadingCompetencies ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : vacancyCompetencies.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No competencies assigned to this vacancy yet.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Basic Competencies */}
                  {vacancyCompetencies.filter(c => c.type === 'basic').length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2 pb-2 border-b border-gray-200">
                        Core Competencies (Psycho-Social)
                      </h4>
                      <ul className="space-y-2">
                        {vacancyCompetencies
                          .filter(c => c.type === 'basic')
                          .map((competency, index) => (
                            <li key={competency._id} className="flex items-start">
                              <span className="text-blue-600 mr-2">{index + 1}.</span>
                              <button
                                onClick={() => handleViewCompetencyDetail(competency)}
                                className="text-left text-gray-800 hover:text-blue-700 hover:underline underline-offset-2 transition-colors"
                                title="View CBS proficiency levels"
                              >
                                {competency.name}
                              </button>
                              {competency.isFixed && (
                                <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                                  Fixed
                                </span>
                              )}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {/* Organizational Competencies */}
                  {vacancyCompetencies.filter(c => c.type === 'organizational').length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2 pb-2 border-b border-gray-200">
                        Organizational Competencies (Potential)
                      </h4>
                      <ul className="space-y-2">
                        {vacancyCompetencies
                          .filter(c => c.type === 'organizational')
                          .map((competency, index) => (
                            <li key={competency._id} className="flex items-start">
                              <span className="text-purple-600 mr-2">{index + 1}.</span>
                              <button
                                onClick={() => handleViewCompetencyDetail(competency)}
                                className="text-left text-gray-800 hover:text-blue-700 hover:underline underline-offset-2 transition-colors"
                                title="View CBS proficiency levels"
                              >
                                {competency.name}
                              </button>
                              {competency.isFixed && (
                                <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                                  Fixed
                                </span>
                              )}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {/* Leadership Competencies */}
                  {vacancyCompetencies.filter(c => c.type === 'leadership').length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2 pb-2 border-b border-gray-200">
                        Leadership Competencies
                        {selectedVacancyForCompetencies.salaryGrade >= 18 && (
                          <span className="ml-2 text-xs text-green-600">(Required for SG {selectedVacancyForCompetencies.salaryGrade})</span>
                        )}
                      </h4>
                      <ul className="space-y-2">
                        {vacancyCompetencies
                          .filter(c => c.type === 'leadership')
                          .map((competency, index) => (
                            <li key={competency._id} className="flex items-start">
                              <span className="text-indigo-600 mr-2">{index + 1}.</span>
                              <button
                                onClick={() => handleViewCompetencyDetail(competency)}
                                className="text-left text-gray-800 hover:text-blue-700 hover:underline underline-offset-2 transition-colors"
                                title="View CBS proficiency levels"
                              >
                                {competency.name}
                              </button>
                              {competency.isFixed && (
                                <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                                  Fixed
                                </span>
                              )}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {/* Minimum Competencies */}
                  {vacancyCompetencies.filter(c => c.type === 'minimum').length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2 pb-2 border-b border-gray-200">
                        Minimum Competencies
                      </h4>
                      <ul className="space-y-2">
                        {vacancyCompetencies
                          .filter(c => c.type === 'minimum')
                          .map((competency, index) => (
                            <li key={competency._id} className="flex items-start">
                              <span className="text-orange-600 mr-2">{index + 1}.</span>
                              <button
                                onClick={() => handleViewCompetencyDetail(competency)}
                                className="text-left text-gray-800 hover:text-blue-700 hover:underline underline-offset-2 transition-colors"
                                title="View CBS proficiency levels"
                              >
                                {competency.name}
                              </button>
                              {competency.isFixed && (
                                <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                                  Fixed
                                </span>
                              )}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {/* Summary */}
                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium text-gray-700">Total Competencies:</span>
                      <span className="font-bold text-gray-900">{vacancyCompetencies.length}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        Core: {vacancyCompetencies.filter(c => c.type === 'basic').length}
                      </span>
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
                        Organizational: {vacancyCompetencies.filter(c => c.type === 'organizational').length}
                      </span>
                      {vacancyCompetencies.filter(c => c.type === 'leadership').length > 0 && (
                        <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded">
                          Leadership: {vacancyCompetencies.filter(c => c.type === 'leadership').length}
                        </span>
                      )}
                      <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">
                        Minimum: {vacancyCompetencies.filter(c => c.type === 'minimum').length}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => {
                    setShowCompetencyModal(false);
                    setSelectedVacancyForCompetencies(null);
                    setVacancyCompetencies([]);
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {showCompetencyDetail && selectedCompetencyForDetail && (
          <CompetencyDetailModal
            competencyName={selectedCompetencyForDetail.name}
            competencyType={selectedCompetencyForDetail.type}
            onClose={() => {
              setShowCompetencyDetail(false);
              setSelectedCompetencyForDetail(null);
            }}
          />
        )}

        {/* Password Confirmation Modal */}
        {showPasswordModal && (
          <PasswordConfirmModal
            isOpen={showPasswordModal}
            onClose={() => {
              setShowPasswordModal(false);
              setPendingAction(null);
            }}
            onConfirm={() => {
              if (pendingAction?.type === 'delete') {
                executeDelete();
              } else if (pendingAction?.type === 'edit') {
                executeEdit();
              }
            }}
            actionType={pendingAction?.type === 'delete' ? 'Delete' : 'Edit'}
            itemName={pendingAction?.itemName || 'this item'}
            user={user}
          />
        )}
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Modal Components (defined outside main component for better organization)
// ──────────────────────────────────────────────────────────────────────────────

const UserModal = ({ editingItem, onClose, onSuccess }) => {
  const [formData, setFormData] = useState(
    editingItem || {
      name: '',
      email: '',
      password: '',
      userType: USER_TYPES.RATER,
      raterType: '',
      position: '',
      designation: '',
      administrativePrivilege: false
    }
  );

  const { showToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await usersAPI.update(editingItem._id, formData);
      } else {
        await usersAPI.create(formData);
      }
      onClose();
      onSuccess();
      showToast(`User ${editingItem ? 'updated' : 'created'} successfully!`, 'success');
    } catch (error) {
      console.error('Failed to save user:', error);
      showToast('Failed to save user. Please try again.', 'error');
    }
  };

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">
            {editingItem ? 'Edit User' : 'Add User'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
              required
            />
          </div>
          {!editingItem && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="input-field w-full border rounded px-2 py-1 text-sm"
                required
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">User Type</label>
            <select
              value={formData.userType}
              onChange={(e) => setFormData({ ...formData, userType: e.target.value })}
              className="select-field w-full border rounded px-2 py-1 text-sm"
              required
            >
              {Object.values(USER_TYPES).map(type => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>
          {formData.userType === USER_TYPES.RATER && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Rater Type</label>
              <select
                value={formData.raterType}
                onChange={(e) => setFormData({ ...formData, raterType: e.target.value })}
                className="select-field w-full border rounded px-2 py-1 text-sm"
              >
                <option value="">Select Rater Type</option>
                {Object.values(RATER_TYPES).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Position</label>
            <input
              type="text"
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Designation</label>
            <input
              type="text"
              value={formData.designation}
              onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          {formData.userType === USER_TYPES.SECRETARIAT && (
            <div>
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={formData.administrativePrivilege}
                  onChange={(e) => setFormData({ ...formData, administrativePrivilege: e.target.checked })}
                  className="mr-2"
                />
                Administrative Privilege
              </label>
            </div>
          )}
          <div className="flex justify-end space-x-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600"
            >
              {editingItem ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const VacancyModal = ({ editingItem, publicationRanges, onClose, onSuccess }) => {
  const [formData, setFormData] = useState(
    editingItem ? {
      ...editingItem,
      publicationRangeId: editingItem.publicationRangeId || '',
      qualifications: {
        education: editingItem.qualifications?.education || '',
        training: editingItem.qualifications?.training || '',
        experience: editingItem.qualifications?.experience || '',
        eligibility: editingItem.qualifications?.eligibility || ''
      }
    } : {
      itemNumber: '',
      position: '',
      assignment: '',
      salaryGrade: 1,
      publicationRangeId: '',
      qualifications: {
        education: '',
        training: '',
        experience: '',
        eligibility: ''
      }
    }
  );

  const { showToast } = useToast();
  const activePublicationRanges = publicationRanges.filter(pr => pr.isActive && !pr.isArchived);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.publicationRangeId) {
      showToast('Please select a publication range', 'error');
      return;
    }

    const selectedPR = activePublicationRanges.find(pr => pr._id === formData.publicationRangeId);
    if (selectedPR?.isArchived) {
      showToast('Cannot create vacancy in archived publication range', 'error');
      return;
    }

    try {
      if (editingItem) {
        await vacanciesAPI.update(editingItem._id, formData);
      } else {
        await vacanciesAPI.create(formData);
      }
      onClose();
      onSuccess();
      showToast(`Vacancy ${editingItem ? 'updated' : 'created'} successfully!`, 'success');
    } catch (error) {
      console.error('Failed to save vacancy:', error);
      showToast(error.response?.data?.message || 'Failed to save vacancy. Please try again.', 'error');
    }
  };

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">
            {editingItem ? 'Edit Vacancy' : 'Add Vacancy'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Publication Range <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.publicationRangeId}
              onChange={(e) => setFormData({ ...formData, publicationRangeId: e.target.value })}
              className="select-field w-full border rounded px-2 py-1 text-sm"
              required
              disabled={editingItem?.isArchived}
            >
              <option value="">Select Publication Range</option>
              {activePublicationRanges.map(pr => (
                <option key={pr._id} value={pr._id}>{pr.name}</option>
              ))}
            </select>
            {activePublicationRanges.length === 0 && (
              <p className="text-xs text-red-600 mt-1">
                No active publication ranges available. Please create one first.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Item Number</label>
            <input
              type="text"
              value={formData.itemNumber}
              onChange={(e) => setFormData({ ...formData, itemNumber: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Position</label>
            <input
              type="text"
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Assignment</label>
            <input
              type="text"
              value={formData.assignment}
              onChange={(e) => setFormData({ ...formData, assignment: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Salary Grade</label>
            <select
              value={formData.salaryGrade}
              onChange={(e) => setFormData({ ...formData, salaryGrade: parseInt(e.target.value) })}
              className="select-field w-full border rounded px-2 py-1 text-sm"
              required
            >
              {SALARY_GRADES.map(grade => (
                <option key={grade} value={grade}>{grade}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Education</label>
            <textarea
              value={formData.qualifications.education}
              onChange={(e) => setFormData({
                ...formData,
                qualifications: { ...formData.qualifications, education: e.target.value }
              })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Training</label>
            <textarea
              value={formData.qualifications.training}
              onChange={(e) => setFormData({
                ...formData,
                qualifications: { ...formData.qualifications, training: e.target.value }
              })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Experience</label>
            <textarea
              value={formData.qualifications.experience}
              onChange={(e) => setFormData({
                ...formData,
                qualifications: { ...formData.qualifications, experience: e.target.value }
              })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Eligibility</label>
            <textarea
              value={formData.qualifications.eligibility}
              onChange={(e) => setFormData({
                ...formData,
                qualifications: { ...formData.qualifications, eligibility: e.target.value }
              })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
              rows={2}
            />
          </div>
          <div className="flex justify-end space-x-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600"
            >
              {editingItem ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const CandidateModal = ({ editingItem, publicationRanges, onClose, onSuccess }) => {
  const [formData, setFormData] = useState(() => {
    const defaultData = {
      fullName: '',
      itemNumber: '',
      gender: '',
      dateOfBirth: '',
      age: '',
      eligibility: '',
      professionalLicense: '',
      letterOfIntent: '',
      personalDataSheet: '',
      workExperienceSheet: '',
      proofOfEligibility: '',
      certificates: '',
      ipcr: '',
      certificateOfEmployment: '',
      diploma: '',
      transcriptOfRecords: '',
      status: CANDIDATE_STATUS.GENERAL_LIST,
      publicationRangeId: ''
    };
    if (editingItem) {
      return {
        ...defaultData,
        ...editingItem,
        dateOfBirth: editingItem.dateOfBirth ? editingItem.dateOfBirth.split('T')[0] : '',
        publicationRangeId: editingItem.publicationRangeId || ''
      };
    }
    return defaultData;
  });

  const { showToast } = useToast();
  const activePublicationRanges = publicationRanges.filter(pr => pr.isActive && !pr.isArchived);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.publicationRangeId) {
      showToast('Please select a publication range', 'error');
      return;
    }
    try {
      const submitData = {
        fullName: formData.fullName || '',
        itemNumber: formData.itemNumber || '',
        gender: formData.gender || '',
        dateOfBirth: formData.dateOfBirth || null,
        age: formData.age || null,
        eligibility: formData.eligibility || '',
        professionalLicense: formData.professionalLicense || '',
        letterOfIntent: formData.letterOfIntent || '',
        personalDataSheet: formData.personalDataSheet || '',
        workExperienceSheet: formData.workExperienceSheet || '',
        proofOfEligibility: formData.proofOfEligibility || '',
        certificates: formData.certificates || '',
        ipcr: formData.ipcr || '',
        certificateOfEmployment: formData.certificateOfEmployment || '',
        diploma: formData.diploma || '',
        transcriptOfRecords: formData.transcriptOfRecords || '',
        status: formData.status || CANDIDATE_STATUS.GENERAL_LIST,
        publicationRangeId: formData.publicationRangeId
      };
      if (editingItem) {
        await candidatesAPI.update(editingItem._id, submitData);
      } else {
        await candidatesAPI.create(submitData);
      }
      onClose();
      onSuccess();
      showToast(`Candidate ${editingItem ? 'updated' : 'created'} successfully!`, 'success');
    } catch (error) {
      console.error('Failed to save candidate:', error);
      showToast('Failed to save candidate. Please try again.', 'error');
    }
  };

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">
            {editingItem ? 'Edit Candidate' : 'Add Candidate'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-sm grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Publication Range <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.publicationRangeId}
              onChange={(e) => setFormData({ ...formData, publicationRangeId: e.target.value })}
              className="select-field w-full border rounded px-2 py-1 text-sm"
              required
              disabled={editingItem?.isArchived}
            >
              <option value="">Select Publication Range</option>
              {activePublicationRanges.map(pr => (
                <option key={pr._id} value={pr._id}>{pr.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Item Number</label>
            <input
              type="text"
              value={formData.itemNumber}
              onChange={(e) => setFormData({ ...formData, itemNumber: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Gender</label>
            <select
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
              className="select-field w-full border rounded px-2 py-1 text-sm"
              required
            >
              <option value="">Select Gender</option>
              <option value="MALE/LALAKI">Male/Lalaki</option>
              <option value="FEMALE/BABAE">Female/Babae</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date of Birth</label>
            <input
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Age</label>
            <input
              type="number"
              value={formData.age}
              onChange={(e) => setFormData({ ...formData, age: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Eligibility</label>
            <input
              type="text"
              value={formData.eligibility}
              onChange={(e) => setFormData({ ...formData, eligibility: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Professional License</label>
            <input
              type="text"
              value={formData.professionalLicense}
              onChange={(e) => setFormData({ ...formData, professionalLicense: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Letter of Intent</label>
            <input
              type="text"
              value={formData.letterOfIntent}
              onChange={(e) => setFormData({ ...formData, letterOfIntent: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Personal Data Sheet</label>
            <input
              type="text"
              value={formData.personalDataSheet}
              onChange={(e) => setFormData({ ...formData, personalDataSheet: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Work Experience Sheet</label>
            <input
              type="text"
              value={formData.workExperienceSheet}
              onChange={(e) => setFormData({ ...formData, workExperienceSheet: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Proof of Eligibility</label>
            <input
              type="text"
              value={formData.proofOfEligibility}
              onChange={(e) => setFormData({ ...formData, proofOfEligibility: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Certificates</label>
            <input
              type="text"
              value={formData.certificates}
              onChange={(e) => setFormData({ ...formData, certificates: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">IPCR</label>
            <input
              type="text"
              value={formData.ipcr}
              onChange={(e) => setFormData({ ...formData, ipcr: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Certificate of Employment</label>
            <input
              type="text"
              value={formData.certificateOfEmployment}
              onChange={(e) => setFormData({ ...formData, certificateOfEmployment: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Diploma</label>
            <input
              type="text"
              value={formData.diploma}
              onChange={(e) => setFormData({ ...formData, diploma: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Transcript of Records</label>
            <input
              type="text"
              value={formData.transcriptOfRecords}
              onChange={(e) => setFormData({ ...formData, transcriptOfRecords: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="select-field w-full border rounded px-2 py-1 text-sm"
              required
            >
              {Object.values(CANDIDATE_STATUS).map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end space-x-2 md:col-span-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600"
            >
              {editingItem ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const CompetencyModal = ({ editingItem, vacancies, onClose, onSuccess }) => {
  const [formData, setFormData] = useState(() => {
    const defaultData = {
      name: '',
      type: 'basic',
      selectedVacancies: [],
      isFixed: false
    };

    if (editingItem) {
      let vacancyIds = [];
      if (Array.isArray(editingItem.vacancyIds) && editingItem.vacancyIds.length > 0) {
        vacancyIds = editingItem.vacancyIds;
      } else if (editingItem.vacancyId) {
        vacancyIds = [editingItem.vacancyId];
      }

      return {
        name: editingItem.name || '',
        type: editingItem.type || 'basic',
        selectedVacancies: vacancyIds,
        isFixed: editingItem.isFixed || false
      };
    }

    return defaultData;
  });

  const [vacancySearch, setVacancySearch] = useState('');
  const { showToast } = useToast();

  const handleVacancyChange = useCallback((vacancyId, checked) => {
    if (checked) {
      setFormData(prev => ({
        ...prev,
        selectedVacancies: [...prev.selectedVacancies, vacancyId]
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        selectedVacancies: prev.selectedVacancies.filter(id => id !== vacancyId)
      }));
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const submitData = {
        name: formData.name,
        type: formData.type,
        vacancyIds: formData.isFixed ? [] : formData.selectedVacancies,
        isFixed: formData.isFixed
      };

      if (editingItem) {
        await competenciesAPI.update(editingItem._id, submitData);
      } else {
        await competenciesAPI.create(submitData);
      }

      onClose();
      onSuccess();
      showToast(`Competency ${editingItem ? 'updated' : 'created'} successfully!`, 'success');
    } catch (error) {
      console.error('Failed to save competency:', error);
      showToast('Failed to save competency. Please try again.', 'error');
    }
  };

  const filteredVacancies = vacancies.filter(vac =>
    `${vac.itemNumber} - ${vac.position}`
      .toLowerCase()
      .includes(vacancySearch.toLowerCase())
  );

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">
            {editingItem ? 'Edit Competency' : 'Add Competency'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Competency Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input-field w-full border rounded px-2 py-1 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="select-field w-full border rounded px-2 py-1 text-sm"
              required
            >
              <option value="basic">Basic</option>
              <option value="organizational">Organizational</option>
              <option value="leadership">Leadership</option>
              <option value="minimum">Minimum</option>
            </select>
          </div>

          <div>
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={formData.isFixed}
                onChange={(e) => setFormData({ ...formData, isFixed: e.target.checked })}
                className="mr-2"
              />
              Fixed Competency (applies to all vacancies)
            </label>
          </div>

          {!formData.isFixed && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Select Vacancies (leave empty to apply to all vacancies)
              </label>

              <input
                type="text"
                placeholder="Search vacancies..."
                value={vacancySearch}
                onChange={(e) => setVacancySearch(e.target.value)}
                className="w-full px-2 py-1 mb-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-md p-2 space-y-1 text-sm">
                {filteredVacancies.length > 0 ? (
                  filteredVacancies.map(vacancy => (
                    <label key={vacancy._id} className="flex items-center text-xs">
                      <input
                        type="checkbox"
                        checked={formData.selectedVacancies.includes(vacancy._id)}
                        onChange={(e) => handleVacancyChange(vacancy._id, e.target.checked)}
                        className="mr-2"
                      />
                      {vacancy.itemNumber} - {vacancy.position}
                    </label>
                  ))
                ) : (
                  <p className="text-gray-400 text-xs italic">No vacancies found.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600"
            >
              {editingItem ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const VacancyAssignmentModal = ({ editingItem, assignments, vacancies, onClose, onSuccess }) => {
  const [formData, setFormData] = useState(() => {
    if (editingItem) {
      return {
        assignmentType      : editingItem.assignedVacancies || 'none',
        assignedAssignment  : editingItem.assignedAssignment || '',
        assignedItemNumbers : editingItem.assignedItemNumbers || []
      };
    }
    return { assignmentType: 'none', assignedAssignment: '', assignedItemNumbers: [] };
  });

  const [vacancySearch, setVacancySearch] = useState('');
  const { showToast } = useToast();

  // Only show active (non-archived) vacancies for assignment
  const activeVacancies = vacancies.filter(v => !v.isArchived);

  // Only show assignments that have at least one active vacancy
  const activeAssignments = [...new Set(
    activeVacancies.map(v => v.assignment).filter(Boolean)
  )].sort();

  const handleItemNumberChange = useCallback((itemNumber, checked) => {
    if (checked) {
      setFormData(prev => ({ ...prev, assignedItemNumbers: [...prev.assignedItemNumbers, itemNumber] }));
    } else {
      setFormData(prev => ({ ...prev, assignedItemNumbers: prev.assignedItemNumbers.filter(id => id !== itemNumber) }));
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const submitData = {
        assignmentType      : formData.assignmentType,
        assignedAssignment  : formData.assignmentType === 'assignment' ? formData.assignedAssignment : null,
        assignedItemNumbers : formData.assignmentType === 'specific'   ? formData.assignedItemNumbers : []
      };
      await usersAPI.assignVacancies(editingItem._id, submitData);
      onClose();
      onSuccess();
      showToast('Vacancy assignment updated successfully!', 'success');
    } catch (error) {
      console.error('Failed to assign vacancies:', error);
      showToast('Failed to assign vacancies. Please try again.', 'error');
    }
  };

  const filteredVacancies = activeVacancies.filter(v =>
    `${v.itemNumber} ${v.position} ${v.assignment}`
      .toLowerCase()
      .includes(vacancySearch.toLowerCase())
  );

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">
            Assign Vacancies to {editingItem?.name}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        {/* Suspended notice */}
        {(editingItem?.suspendedItemNumbers?.length || 0) > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            ℹ️ <strong>{editingItem.suspendedItemNumbers.length}</strong> item number(s) are currently
            suspended because their publication range is archived. They will be automatically restored
            when the publication range is unarchived.
            <div className="mt-1 font-mono text-amber-700">
              {editingItem.suspendedItemNumbers.join(', ')}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Assignment Type</label>
            <div className="space-y-2">
              {[
                { value: 'none',       label: 'No Vacancies (No Access)' },
                { value: 'all',        label: `All Active Vacancies (${activeVacancies.length})` },
                { value: 'assignment', label: 'By Assignment / Department' },
                { value: 'specific',   label: 'Specific Item Numbers' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center text-sm">
                  <input
                    type="radio"
                    name="assignmentType"
                    value={opt.value}
                    checked={formData.assignmentType === opt.value}
                    onChange={(e) => setFormData({ ...formData, assignmentType: e.target.value })}
                    className="mr-2"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {formData.assignmentType === 'assignment' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Select Assignment <span className="text-gray-400">(active ranges only)</span>
              </label>
              <select
                value={formData.assignedAssignment}
                onChange={(e) => setFormData({ ...formData, assignedAssignment: e.target.value })}
                className="select-field w-full border rounded px-2 py-1 text-sm"
                required
              >
                <option value="">Select Assignment</option>
                {activeAssignments.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              {activeAssignments.length === 0 && (
                <p className="text-xs text-red-600 mt-1">No active assignments available.</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Assigns all active vacancies where vacancy.assignment matches the selected value.
              </p>
            </div>
          )}

          {formData.assignmentType === 'specific' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Select Item Numbers <span className="text-gray-400">(active only)</span>
              </label>
              <input
                type="text"
                placeholder="Search item number, position, or office..."
                value={vacancySearch}
                onChange={(e) => setVacancySearch(e.target.value)}
                className="w-full px-2 py-1 mb-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-md p-2 space-y-1 text-sm">
                {filteredVacancies.length > 0 ? (
                  filteredVacancies.map(v => (
                    <label key={v._id} className="flex items-start text-xs gap-2 py-0.5">
                      <input
                        type="checkbox"
                        checked={formData.assignedItemNumbers.includes(v.itemNumber)}
                        onChange={(e) => handleItemNumberChange(v.itemNumber, e.target.checked)}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <span>
                        <span className="font-mono font-medium">{v.itemNumber}</span>
                        <span className="text-gray-600"> — {v.position}</span>
                        <span className="text-gray-400"> ({v.assignment})</span>
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-gray-400 text-xs italic">No active vacancies found.</p>
                )}
              </div>
              {formData.assignedItemNumbers.length > 0 && (
                <p className="text-xs text-blue-600 mt-1">
                  {formData.assignedItemNumbers.length} item{formData.assignedItemNumbers.length !== 1 ? 's' : ''} selected
                </p>
              )}
              {formData.assignmentType === 'specific' && formData.assignedItemNumbers.length === 0 && (
                <p className="text-xs text-red-600 mt-1">Please select at least one item number.</p>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600"
              disabled={
                (formData.assignmentType === 'assignment' && !formData.assignedAssignment) ||
                (formData.assignmentType === 'specific'   && formData.assignedItemNumbers.length === 0)
              }
            >
              Save Assignment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const VacancyDetailsModal = ({ vacancy, onClose }) => {
  if (!vacancy) return null;

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Vacancy Details</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">✕</button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Item Number</label>
              <p className="mt-1 text-sm text-gray-900">{vacancy.itemNumber}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Position</label>
              <p className="mt-1 text-sm text-gray-900">{vacancy.position}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Assignment</label>
              <p className="mt-1 text-sm text-gray-900">{vacancy.assignment}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Salary Grade</label>
              <p className="mt-1 text-sm text-gray-900">SG {vacancy.salaryGrade}</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Qualifications</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Education</label>
                <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                  {vacancy.qualifications?.education || 'Not specified'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Training</label>
                <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                  {vacancy.qualifications?.training || 'Not specified'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Experience</label>
                <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                  {vacancy.qualifications?.experience || 'Not specified'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Eligibility</label>
                <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                  {vacancy.qualifications?.eligibility || 'Not specified'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


const AssignmentDetailsModal = ({ user, vacancies, onClose }) => {
  if (!user) return null;

  // Determine which vacancies to show based on assignment type
  const getAssignedVacancies = () => {
    if (user.assignedVacancies === 'all') {
      return vacancies.filter(v => !v.isArchived);
    }
    if (user.assignedVacancies === 'assignment' && user.assignedAssignment) {
      return vacancies.filter(v => v.assignment === user.assignedAssignment && !v.isArchived);
    }
    if (user.assignedVacancies === 'specific' && user.assignedItemNumbers?.length > 0) {
      return vacancies.filter(v => user.assignedItemNumbers.includes(v.itemNumber) && !v.isArchived);
    }
    return [];
  };

  const assignedVacancies = getAssignedVacancies();

  const assignmentBadge = {
    all        : 'bg-green-100 text-green-800',
    assignment : 'bg-blue-100 text-blue-800',
    specific   : 'bg-purple-100 text-purple-800',
    none       : 'bg-gray-100 text-gray-800',
  }[user.assignedVacancies] || 'bg-gray-100 text-gray-800';

  const assignmentLabel = {
    all        : 'All Vacancies',
    assignment : `By Assignment: ${user.assignedAssignment || '—'}`,
    specific   : 'Specific Item Numbers',
    none       : 'No Access',
  }[user.assignedVacancies] || 'Unknown';

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-content bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 p-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-start mb-4 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
            <p className="text-sm text-gray-500">{user.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`px-2 py-1 rounded text-xs font-medium ${assignmentBadge}`}>
                {assignmentLabel}
              </span>
              <span className="text-xs text-gray-500">
                {assignedVacancies.length} active vacanc{assignedVacancies.length !== 1 ? 'ies' : 'y'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>

        {/* No vacancies state */}
        {user.assignedVacancies === 'none' && (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-3">🚫</div>
              <p className="font-medium">No vacancy access assigned</p>
              <p className="text-sm mt-1">Use "Assign Vacancies" to grant access.</p>
            </div>
          </div>
        )}

        {/* Vacancies table */}
        {user.assignedVacancies !== 'none' && (
          <>
            {assignedVacancies.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <div className="text-center text-gray-500">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="font-medium">No active vacancies found</p>
                  <p className="text-sm mt-1">
                    {user.assignedVacancies === 'assignment'
                      ? `No active vacancies match assignment "${user.assignedAssignment}".`
                      : 'The assigned item numbers have no active vacancies.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-auto flex-1">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item #</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assignment / Office</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SG</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Education</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Experience</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Eligibility</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {assignedVacancies.map(v => (
                      <tr key={v._id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-xs font-mono whitespace-nowrap">{v.itemNumber}</td>
                        <td className="px-4 py-2 text-xs font-medium max-w-[180px] whitespace-normal">{v.position}</td>
                        <td className="px-4 py-2 text-xs text-gray-600 max-w-[160px] whitespace-normal">{v.assignment}</td>
                        <td className="px-4 py-2 text-xs text-center">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">
                            {v.salaryGrade}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600 max-w-[160px] whitespace-normal">
                          {v.qualifications?.education || <span className="text-gray-300 italic">—</span>}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600 max-w-[160px] whitespace-normal">
                          {v.qualifications?.experience || <span className="text-gray-300 italic">—</span>}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600 max-w-[140px] whitespace-normal">
                          {v.qualifications?.eligibility || <span className="text-gray-300 italic">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end mt-4 flex-shrink-0 pt-2 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const CsvUploadProgressModal = ({ isOpen, type, fileName }) => {
  const labels = {
    vacancies   : 'Uploading Vacancies',
    candidates  : 'Uploading Candidates',
    competencies: 'Uploading Competencies',
  };
  const icons = {
    vacancies   : '💼',
    candidates  : '📋',
    competencies: '⭐',
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="relative inline-flex items-center justify-center mb-5">
          <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center text-4xl animate-pulse">
            {icons[type] || '📁'}
          </div>
          <svg className="absolute inset-0 w-20 h-20 animate-spin" viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="36" stroke="#3B82F6" strokeWidth="4" strokeDasharray="56 170" strokeLinecap="round" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">{labels[type] || 'Uploading…'}</h3>
        {fileName && (
          <p className="text-xs text-gray-400 mb-4 truncate px-2" title={fileName}>{fileName}</p>
        )}
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="h-2 rounded-full bg-blue-500"
            style={{ width: '40%', animation: 'csv-progress-slide 1.4s ease-in-out infinite' }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-3">Please wait — do not close this tab</p>
        <style>{`
          @keyframes csv-progress-slide {
            0%   { transform: translateX(-150%); }
            100% { transform: translateX(400%); }
          }
        `}</style>
      </div>
    </div>
  );
};

const CompetencySummaryModal = ({ vacancies, competencies, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('itemNumber'); // itemNumber, position, assignment, salaryGrade

  // Build a map of vacancy ID -> competencies
  const vacancyCompetencyMap = useMemo(() => {
    const map = new Map();
    
    // Initialize all vacancies with empty arrays
    vacancies.forEach(v => {
      map.set(v._id, []);
    });

    // Populate with competencies
    competencies.forEach(comp => {
      // Check if this competency has specific vacancy assignments
      const hasSpecificVacancies = comp.vacancyIds && Array.isArray(comp.vacancyIds) && comp.vacancyIds.length > 0;
      
      if (hasSpecificVacancies) {
        // Only apply to the specified vacancies
        comp.vacancyIds.forEach(vId => {
          // Match by _id or by string comparison (in case of ID type mismatches)
          const matchingVacancy = vacancies.find(v => 
            v._id === vId || v._id?.toString() === vId?.toString()
          );
          if (matchingVacancy && map.has(matchingVacancy._id)) {
            map.get(matchingVacancy._id).push(comp);
          }
        });
      } else if (comp.isFixed) {
        // Fixed competencies with no specific vacancies apply to ALL vacancies
        vacancies.forEach(v => {
          map.get(v._id).push(comp);
        });
      }
      // NOTE: Competencies without vacancyIds AND without isFixed flag are orphaned
      // and should NOT be assigned to any vacancy
    });

    return map;
  }, [vacancies, competencies]);

  // Filter and sort vacancies
  const filteredVacancies = useMemo(() => {
    let filtered = vacancies.filter(v => !v.isArchived);

    if (searchTerm) {
      filtered = filtered.filter(v =>
        v.itemNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.assignment.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'itemNumber') return a.itemNumber.localeCompare(b.itemNumber);
      if (sortBy === 'position') return a.position.localeCompare(b.position);
      if (sortBy === 'assignment') return a.assignment.localeCompare(b.assignment);
      if (sortBy === 'salaryGrade') return a.salaryGrade - b.salaryGrade;
      return 0;
    });

    return filtered;
  }, [vacancies, searchTerm, sortBy]);

  const groupCompetenciesByType = (comps) => {
    return {
      basic: comps.filter(c => c.type === 'basic'),
      organizational: comps.filter(c => c.type === 'organizational'),
      leadership: comps.filter(c => c.type === 'leadership'),
      minimum: comps.filter(c => c.type === 'minimum')
    };
  };

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-content bg-white rounded-lg shadow-xl w-full max-w-7xl mx-4 p-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">📊 Competency Summary by Position</h2>
            <p className="text-sm text-gray-600 mt-1">
              Showing {filteredVacancies.length} active position{filteredVacancies.length !== 1 ? 's' : ''} with their assigned competencies
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none">✕</button>
        </div>

        {/* Search and Sort Controls */}
        <div className="flex gap-3 mb-4 flex-shrink-0">
          <input
            type="text"
            placeholder="🔍 Search by item number, position, or assignment..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="itemNumber">Sort by Item Number</option>
            <option value="position">Sort by Position</option>
            <option value="assignment">Sort by Assignment</option>
            <option value="salaryGrade">Sort by Salary Grade</option>
          </select>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 space-y-4 pr-2">
          {filteredVacancies.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <div className="text-center">
                <div className="text-5xl mb-3">🔍</div>
                <p className="font-medium">No positions found</p>
                <p className="text-sm mt-1">Try adjusting your search criteria</p>
              </div>
            </div>
          ) : (
            filteredVacancies.map((vacancy) => {
              const assignedComps = vacancyCompetencyMap.get(vacancy._id) || [];
              const grouped = groupCompetenciesByType(assignedComps);
              const totalCount = assignedComps.length;

              return (
                <div key={vacancy._id} className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                  {/* Vacancy Header */}
                  <div className="flex items-start justify-between mb-3 pb-3 border-b border-gray-200">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-mono font-semibold">
                          {vacancy.itemNumber}
                        </span>
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          SG {vacancy.salaryGrade}
                        </span>
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                          {totalCount} competenc{totalCount !== 1 ? 'ies' : 'y'}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">{vacancy.position}</h3>
                      <p className="text-sm text-gray-600">{vacancy.assignment}</p>
                    </div>
                  </div>

                  {/* Competencies Display */}
                  {totalCount === 0 ? (
                    <div className="text-center py-6 text-gray-400">
                      <p className="text-sm italic">No competencies assigned yet</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Core Competencies */}
                      {grouped.basic.length > 0 && (
                        <div className="bg-blue-50 rounded-lg p-3">
                          <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">
                              {grouped.basic.length}
                            </span>
                            Core Competencies
                          </h4>
                          <ul className="space-y-1">
                            {grouped.basic.map((comp, idx) => (
                              <li key={comp._id} className="flex items-start text-xs">
                                <span className="text-blue-600 mr-1 flex-shrink-0">{idx + 1}.</span>
                                <span className="text-gray-800">
                                  {comp.name}
                                  {comp.isFixed && (
                                    <span className="ml-1 px-1 py-0.5 bg-green-200 text-green-800 rounded text-[10px]">Fixed</span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Organizational Competencies */}
                      {grouped.organizational.length > 0 && (
                        <div className="bg-purple-50 rounded-lg p-3">
                          <h4 className="text-xs font-bold text-purple-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <span className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs">
                              {grouped.organizational.length}
                            </span>
                            Organizational
                          </h4>
                          <ul className="space-y-1">
                            {grouped.organizational.map((comp, idx) => (
                              <li key={comp._id} className="flex items-start text-xs">
                                <span className="text-purple-600 mr-1 flex-shrink-0">{idx + 1}.</span>
                                <span className="text-gray-800">
                                  {comp.name}
                                  {comp.isFixed && (
                                    <span className="ml-1 px-1 py-0.5 bg-green-200 text-green-800 rounded text-[10px]">Fixed</span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Leadership Competencies */}
                      {grouped.leadership.length > 0 && (
                        <div className="bg-indigo-50 rounded-lg p-3">
                          <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <span className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs">
                              {grouped.leadership.length}
                            </span>
                            Leadership
                          </h4>
                          <ul className="space-y-1">
                            {grouped.leadership.map((comp, idx) => (
                              <li key={comp._id} className="flex items-start text-xs">
                                <span className="text-indigo-600 mr-1 flex-shrink-0">{idx + 1}.</span>
                                <span className="text-gray-800">
                                  {comp.name}
                                  {comp.isFixed && (
                                    <span className="ml-1 px-1 py-0.5 bg-green-200 text-green-800 rounded text-[10px]">Fixed</span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Minimum Competencies */}
                      {grouped.minimum.length > 0 && (
                        <div className="bg-orange-50 rounded-lg p-3">
                          <h4 className="text-xs font-bold text-orange-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <span className="w-6 h-6 bg-orange-600 text-white rounded-full flex items-center justify-center text-xs">
                              {grouped.minimum.length}
                            </span>
                            Minimum
                          </h4>
                          <ul className="space-y-1">
                            {grouped.minimum.map((comp, idx) => (
                              <li key={comp._id} className="flex items-start text-xs">
                                <span className="text-orange-600 mr-1 flex-shrink-0">{idx + 1}.</span>
                                <span className="text-gray-800">
                                  {comp.name}
                                  {comp.isFixed && (
                                    <span className="ml-1 px-1 py-0.5 bg-green-200 text-green-800 rounded text-[10px]">Fixed</span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center mt-4 pt-4 border-t flex-shrink-0">
          <div className="text-xs text-gray-600">
            <span className="font-semibold">{filteredVacancies.length}</span> positions shown • 
            <span className="ml-2 font-semibold">{competencies.length}</span> total competencies in system
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const CompetencyVacancyModal = ({ data, onClose }) => {
  if (!data) return null;
  const { competency, active, archived } = data;

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-bold text-gray-900">Linked Vacancies</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <p className="text-xs text-gray-500 mb-4 italic">{competency.name}</p>

        {active.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              ✅ Active ({active.length})
            </h3>
            <div className="space-y-1">
              {active.map(v => (
                <div key={v._id} className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded text-xs">
                  <span className="font-mono font-medium">{v.itemNumber}</span>
                  <span className="text-gray-500">— {v.position}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {archived.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
              ⚠ Archived ({archived.length})
            </h3>
            <p className="text-xs text-amber-600 mb-2">
              These item numbers belong to archived publication ranges and are no longer active.
            </p>
            <div className="space-y-1">
              {archived.map(v => (
                <div key={v._id} className="flex items-center gap-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs">
                  <span className="font-mono font-medium text-amber-800">{v.itemNumber}</span>
                  <span className="text-amber-600">— {v.position}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const PasswordConfirmModal = ({ isOpen, onClose, onConfirm, actionType, itemName, user }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const isValid = await authAPI.verifyPassword(user._id, password);

      if (isValid) {
        onConfirm();
        onClose();
        setPassword('');
      } else {
        setError('Incorrect password. Please try again.');
      }
    } catch (error) {
      setError('Failed to verify password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-gray-900">Confirm {actionType}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
            <p className="text-sm text-yellow-800">
              ⚠️ You are about to {actionType.toLowerCase()} <strong>{itemName}</strong>.
              Please enter your password to confirm this action.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter Your Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter password"
              required
              autoFocus
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-sm bg-gray-200 hover:bg-gray-300"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Verifying...' : `Confirm ${actionType}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Export with Error Boundary
// ──────────────────────────────────────────────────────────────────────────────

export default function AdminViewWithErrorBoundary(props) {
  return (
    <AdminErrorBoundary>
      <AdminView {...props} />
    </AdminErrorBoundary>
  );
}
