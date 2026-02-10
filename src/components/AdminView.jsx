import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import usePersistedState from '../utils/usePersistedState';
import { usersAPI, vacanciesAPI, candidatesAPI, competenciesAPI, publicationRangesAPI, authAPI } from '../utils/api';
import { USER_TYPES, RATER_TYPES, SALARY_GRADES, CANDIDATE_STATUS } from '../utils/constants';
import InterviewSummaryGenerator from './InterviewSummaryGenerator';
import { useToast } from '../utils/ToastContext';
import RatingLogsView from './RatingLogsView';
import PublicationRangeManager from './PublicationRangeManager';

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
        const aValue = sortConfig.key.split('.').reduce((obj, key) => obj?.[key], a);
        const bValue = sortConfig.key.split('.').reduce((obj, key) => obj?.[key], b);

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

  const loadUsers = useCallback(async () => {
    try {
      const usersData = await usersAPI.getAll();
      setUsers(usersData);
    } catch (error) {
      console.error('Failed to load users:', error);
      showToast('Failed to load users', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadVacancies = useCallback(async () => {
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
    } catch (error) {
      console.error('Failed to load vacancies:', error);
      showToast('Failed to load vacancies', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPublicationRange, publicationRanges, showArchivedRanges]);

  const loadCandidates = useCallback(async () => {
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
    } catch (error) {
      console.error('Failed to load candidates:', error);
      showToast('Failed to load candidates', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPublicationRange, publicationRanges, showArchivedRanges]);

  const loadCompetencies = useCallback(async () => {
    try {
      const competenciesData = await competenciesAPI.getAll();
      setCompetencies(competenciesData);
    } catch (error) {
      console.error('Failed to load competencies:', error);
      showToast('Failed to load competencies', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDataForCurrentTab = useCallback(async () => {
    // Prevent concurrent loading
    if (loadingData.current) {
      return;
    }

    // Check if state actually changed
    const currentState = {
      tab: activeTab,
      range: selectedPublicationRange,
      archived: showArchivedRanges
    };

    if (JSON.stringify(currentState) === JSON.stringify(previousStateRef.current)) {
      return;
    }

    previousStateRef.current = currentState;
    loadingData.current = true;
    setLoading(true);

    try {
      switch (activeTab) {
        case 'users':
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
        case 'assignments':
          // Assignments tab needs users data
          await loadUsers();
          break;
        case 'publicationRanges':
          // Publication ranges are already loaded separately
          break;
        case 'interviewSummary':
        case 'ratingLogs':
          // These tabs handle their own data loading
          break;
        default:
          console.warn('Unknown tab:', activeTab);
      }
    } catch (error) {
      console.error('Data load failed for tab', activeTab, error);
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
      loadingData.current = false;
    }
  }, [
    activeTab, 
    selectedPublicationRange, 
    showArchivedRanges, 
    loadUsers, 
    loadVacancies, 
    loadCandidates, 
    loadCompetencies, 
    showToast
  ]);

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

      const formData = new FormData();
      formData.append('csv', file);

      switch (type) {
        case 'vacancies':
          await vacanciesAPI.uploadCSV(formData, selectedPublicationRange);
          break;
        case 'candidates':
          await candidatesAPI.uploadCSVWithPublication(formData, selectedPublicationRange);
          break;
        case 'competencies':
          await competenciesAPI.uploadCSV(formData);
          break;
      }

      await loadDataForCurrentTab();
      showToast('CSV uploaded successfully!', 'success');
    } catch (error) {
      console.error('Failed to upload CSV:', error);
      if (error.response?.data?.invalidItemNumbers) {
        showToast(`Import failed: Invalid item numbers: ${error.response.data.invalidItemNumbers.join(', ')}`, 'error');
      } else {
        showToast(error.response?.data?.message || 'Failed to upload CSV. Please check the format and try again.', 'error');
      }
    }
  }, [selectedPublicationRange, loadDataForCurrentTab, showToast]);

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

  // Initial data load on mount
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        await loadPublicationRanges();
        
        // Load data for the initial active tab
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
        console.error('Initial data load failed:', error);
        showToast('Failed to load initial data', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Reload data when tab changes (after initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const loadTabData = async () => {
      if (loadingData.current) return;

      loadingData.current = true;
      setLoading(true);

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

  const renderVacancies = useCallback(() => {
    const filteredVacancies = filterAndSortData(vacancies, ['itemNumber', 'position', 'assignment', 'salaryGrade']);
    const activePublicationRanges = publicationRanges.filter(pr => pr.isActive && !pr.isArchived);

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
              onChange={(e) => e.target.files[0] && handleCSVUpload(e.target.files[0], 'vacancies')}
              className="hidden"
              id="vacancy-csv-upload"
            />
            <label
              htmlFor="vacancy-csv-upload"
              className={`btn-secondary px-3 py-1 rounded text-xs cursor-pointer ${
                !selectedPublicationRange 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
              onClick={(e) => {
                if (!selectedPublicationRange) {
                  e.preventDefault();
                  showToast('Please select a publication range first', 'error');
                }
              }}
            >
              Upload CSV
            </label>
            <button 
              onClick={() => handleAdd('vacancy')} 
              className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600"
            >
              Add Vacancy
            </button>
          </div>
        </div>
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
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredVacancies.map(vacancy => (
                  <tr key={vacancy._id} className={vacancy.isArchived ? 'bg-gray-50 opacity-60' : ''}>
                    <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">
                      <button
                        onClick={() => handleItemNumberClick(vacancy.itemNumber)}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {vacancy.itemNumber}
                      </button>
                      {vacancy.isArchived && (
                        <span className="ml-2 text-xs text-gray-500">(Archived)</span>
                      )}
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
                    <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
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
    showToast
  ]);

  const renderCandidates = useCallback(() => {
    const filteredCandidates = filterAndSortData(candidates, ['fullName', 'itemNumber', 'gender', 'age', 'status']);
    const activePublicationRanges = publicationRanges.filter(pr => pr.isActive && !pr.isArchived);

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
              onChange={(e) => e.target.files[0] && handleCSVUpload(e.target.files[0], 'candidates')}
              className="hidden"
              id="candidate-csv-upload"
            />
            <label
              htmlFor="candidate-csv-upload"
              className={`btn-secondary px-3 py-1 rounded text-xs cursor-pointer ${
                !selectedPublicationRange 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
              onClick={(e) => {
                if (!selectedPublicationRange) {
                  e.preventDefault();
                  showToast('Please select a publication range first', 'error');
                }
              }}
            >
              Upload CSV
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
    showToast
  ]);

  const renderCompetencies = useCallback(() => {
    const filteredCompetencies = filterAndSortData(competencies, ['name', 'type']);

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Competencies Management</h2>
          <div className="flex space-x-2">
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
            <input
              type="file"
              accept=".csv"
              onChange={(e) => e.target.files[0] && handleCSVUpload(e.target.files[0], 'competencies')}
              className="hidden"
              id="competency-csv-upload"
            />
            <label 
              htmlFor="competency-csv-upload" 
              className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 cursor-pointer"
            >
              Upload CSV
            </label>
            <button 
              onClick={() => handleAdd('competency')} 
              className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600"
            >
              Add Competency
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
                {filteredCompetencies.map(competency => {
                  let vacancyIds = [];
                  if (Array.isArray(competency.vacancyIds) && competency.vacancyIds.length > 0) {
                    vacancyIds = competency.vacancyIds;
                  } else if (competency.vacancyId) {
                    vacancyIds = [competency.vacancyId];
                  }

                  const vacancyNames = vacancyIds.length > 0
                    ? vacancyIds
                        .map(id => vacancies.find(v => v._id === id)?.itemNumber)
                        .filter(Boolean)
                        .join(', ')
                    : 'All Vacancies';

                  return (
                    <tr key={competency._id}>
                      <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">
                        {competency.name}
                      </td>
                      <td className="table-cell px-4 py-2">
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs capitalize">
                          {competency.type}
                        </span>
                      </td>
                      <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">
                        {vacancyNames}
                      </td>
                      <td className="table-cell px-4 py-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          competency.isFixed ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
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
    handleCSVUpload,
    handleAdd,
    handleEdit,
    handleDelete
  ]);

  const renderVacancyAssignments = useCallback(() => {
    const filteredUsers = filterAndSortData(users, ['name', 'email', 'userType']);

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Vacancy Assignments</h2>
          <div className="text-xs text-gray-600">
            Manage which vacancies each user can access
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
                    Current Assignment
                  </th>
                  <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                  <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map(user => (
                  <tr key={user._id}>
                    <td className="table-cell px-4 py-2">
                      <div>
                        <div className="font-medium text-xs">{user.name}</div>
                        <div className="text-xs text-gray-500">{user.email}</div>
                      </div>
                    </td>
                    <td className="table-cell px-4 py-2">
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                        {user.userType}
                      </span>
                    </td>
                    <td className="table-cell px-4 py-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        user.assignedVacancies === 'none' ? 'bg-gray-100 text-gray-800' :
                        user.assignedVacancies === 'all' ? 'bg-green-100 text-green-800' :
                        user.assignedVacancies === 'assignment' ? 'bg-blue-100 text-blue-800' :
                        user.assignedVacancies === 'specific' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {getAssignmentDisplay(user)}
                      </span>
                    </td>
                    <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">
                      {user.assignedVacancies === 'assignment' && user.assignedAssignment && (
                        <div className="text-xs text-gray-600">
                          Assignment: {user.assignedAssignment}
                        </div>
                      )}
                      {user.assignedVacancies === 'specific' && user.assignedItemNumbers?.length > 0 && (
                        <div className="text-xs text-gray-600">
                          Items: {user.assignedItemNumbers.slice(0, 3).join(', ')}
                          {user.assignedItemNumbers.length > 3 && ` +${user.assignedItemNumbers.length - 3} more`}
                        </div>
                      )}
                    </td>
                    <td className="table-cell px-4 py-2">
                      <button
                        onClick={() => handleEdit(user, 'assignment')}
                        className="btn-secondary px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300"
                      >
                        Assign Vacancies
                      </button>
                    </td>
                  </tr>
                ))}
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
      </div>
    );
  }, [
    users,
    filters,
    sortConfig,
    filterAndSortData,
    handleFilterChange,
    handleSort,
    handleEdit,
    getAssignmentDisplay
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
        assignmentType: editingItem.assignedVacancies || 'none',
        assignedAssignment: editingItem.assignedAssignment || '',
        assignedItemNumbers: editingItem.assignedItemNumbers || []
      };
    }
    return {
      assignmentType: 'none',
      assignedAssignment: '',
      assignedItemNumbers: []
    };
  });

  const { showToast } = useToast();

  const handleItemNumberChange = useCallback((itemNumber, checked) => {
    if (checked) {
      setFormData(prev => ({
        ...prev,
        assignedItemNumbers: [...prev.assignedItemNumbers, itemNumber]
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        assignedItemNumbers: prev.assignedItemNumbers.filter(item => item !== itemNumber)
      }));
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const submitData = {
        assignmentType: formData.assignmentType,
        assignedAssignment: formData.assignmentType === 'assignment' ? formData.assignedAssignment : null,
        assignedItemNumbers: formData.assignmentType === 'specific' ? formData.assignedItemNumbers : []
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

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">
            Assign Vacancies to {editingItem?.name}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Assignment Type</label>
            <div className="space-y-2">
              <label className="flex items-center text-sm">
                <input
                  type="radio"
                  name="assignmentType"
                  value="none"
                  checked={formData.assignmentType === 'none'}
                  onChange={(e) => setFormData({ ...formData, assignmentType: e.target.value })}
                  className="mr-2"
                />
                No Vacancies (No Access)
              </label>
              <label className="flex items-center text-sm">
                <input
                  type="radio"
                  name="assignmentType"
                  value="all"
                  checked={formData.assignmentType === 'all'}
                  onChange={(e) => setFormData({ ...formData, assignmentType: e.target.value })}
                  className="mr-2"
                />
                All Vacancies
              </label>
              <label className="flex items-center text-sm">
                <input
                  type="radio"
                  name="assignmentType"
                  value="assignment"
                  checked={formData.assignmentType === 'assignment'}
                  onChange={(e) => setFormData({ ...formData, assignmentType: e.target.value })}
                  className="mr-2"
                />
                By Assignment/Department (from vacancy.assignment field)
              </label>
              <label className="flex items-center text-sm">
                <input
                  type="radio"
                  name="assignmentType"
                  value="specific"
                  checked={formData.assignmentType === 'specific'}
                  onChange={(e) => setFormData({ ...formData, assignmentType: e.target.value })}
                  className="mr-2"
                />
                Specific Item Numbers
              </label>
            </div>
          </div>

          {formData.assignmentType === 'assignment' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Select Assignment</label>
              <select
                value={formData.assignedAssignment}
                onChange={(e) => setFormData({ ...formData, assignedAssignment: e.target.value })}
                className="select-field w-full border rounded px-2 py-1 text-sm"
                required
              >
                <option value="">Select Assignment</option>
                {assignments.map(assignment => (
                  <option key={assignment} value={assignment}>{assignment}</option>
                ))}
              </select>
              <p className="text-xs text-gray-600 mt-1">
                This will assign all vacancies where vacancy.assignment matches the selected value.
              </p>
            </div>
          )}

          {formData.assignmentType === 'specific' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Select Item Numbers</label>
              <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-md p-2 space-y-1 text-sm">
                {vacancies.map(vacancy => (
                  <label key={vacancy._id} className="flex items-center text-xs">
                    <input
                      type="checkbox"
                      checked={formData.assignedItemNumbers.includes(vacancy.itemNumber)}
                      onChange={(e) => handleItemNumberChange(vacancy.itemNumber, e.target.checked)}
                      className="mr-2"
                    />
                    {vacancy.itemNumber} - {vacancy.position} ({vacancy.assignment})
                  </label>
                ))}
              </div>
              {formData.assignedItemNumbers.length === 0 && (
                <p className="text-xs text-red-600 mt-1">Please select at least one item number.</p>
              )}
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
              disabled={
                (formData.assignmentType === 'assignment' && !formData.assignedAssignment) ||
                (formData.assignmentType === 'specific' && formData.assignedItemNumbers.length === 0)
              }
            >
              Assign Vacancies
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
