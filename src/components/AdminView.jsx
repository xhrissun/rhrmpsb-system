import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import usePersistedState from '../utils/usePersistedState';
import { usersAPI, vacanciesAPI, candidatesAPI, competenciesAPI } from '../utils/api';
import { parseCSV, exportToCSV } from '../utils/helpers';
import { USER_TYPES, RATER_TYPES, SALARY_GRADES, CANDIDATE_STATUS } from '../utils/constants';
import InterviewSummaryGenerator from './InterviewSummaryGenerator';
import { useToast } from '../utils/ToastContext';

// --- SearchBar and FilterableHeader (moved out of AdminView to prevent remounts) ---
export const SearchBar = ({ placeholder, value, onChange }) => {
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
};

// ✅ Memoized to prevent remounts on state updates
export const FilterableHeader = memo(function FilterableHeader({
  label,
  filterKey,
  sortKey,
  filterValue,
  onFilterChange,
  onSort,
  sortConfig
}) {
  const handleInputChange = (e) => {
    e.stopPropagation();
    const newValue = e.target.value;
    onFilterChange(filterKey, newValue);
  };

  return (
    <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
      <div className="flex flex-col space-y-1">
        <div className="flex items-center space-x-1">
          <span>{label}</span>
          {sortKey && (
            <button
              onClick={() => onSort(sortKey)}
              className="text-gray-400 hover:text-gray-600"
              type="button"
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


const AdminView = ({ user }) => {
  // Use usePersistedState for activeTab
  const [activeTab, setActiveTab] = usePersistedState(`admin_${user._id}_activeTab`, 'users');
  useEffect(() => {
    console.log('📌 ActiveTab changed in usePersistedState:', activeTab);
  }, [activeTab]);
  const [users, setUsers] = useState([]);
  const [vacancies, setVacancies] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [competencies, setCompetencies] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [loading, setLoading] = useState(true);
  // Add these state variables after line 17 (after const [loading, setLoading] = useState(true);)
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [showVacancyModal, setShowVacancyModal] = useState(false);
  const [selectedVacancy, setSelectedVacancy] = useState(null);
  const prevTabRef = useRef(activeTab);

  const { showToast } = useToast();

  // Add these functions after the state declarations and before loadAllData
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filterAndSortData = (data, searchFields) => {
    let filteredData = [...data];

    // Apply search
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
  };

  const handleItemNumberClick = (itemNumber) => {
    const vacancy = vacancies.find(v => v.itemNumber === itemNumber);
    if (vacancy) {
      setSelectedVacancy(vacancy);
      setShowVacancyModal(true);
    }
  };

  // Add this function after handleFilterChange (around line 95):
  const handleSearchChange = useCallback((value) => {
    // ✅ Just update the state, no unnecessary re-render triggers
    setSearchTerm(value);
  }, []);

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



  console.log('🎬 AdminView Render:', {
    activeTab,
    searchTerm,
    searchTermLength: searchTerm?.length,
    prevTab: prevTabRef.current
  });


  // Validate activeTab
  useEffect(() => {
    const validTabs = ['users', 'vacancies', 'candidates', 'competencies', 'assignments', 'interviewSummary'];
    if (activeTab && !validTabs.includes(activeTab)) {
      setActiveTab('users');
    }
  }, [activeTab, setActiveTab]);

  // Load all data on component mount
  useEffect(() => {
    loadAllData();
  }, []);

// Add this useEffect to reset filters when changing tabs
  useEffect(() => {
    console.log('🔄 Filter Reset useEffect triggered:', {
      prevTab: prevTabRef.current,
      currentTab: activeTab,
      willReset: prevTabRef.current !== activeTab
    });
    
    if (prevTabRef.current !== activeTab) {
    // ✅ Reset filters and sorting ONLY when user actually switches tab
    setSearchTerm('');
    setFilters({});
    setSortConfig({ key: null, direction: 'asc' });
    prevTabRef.current = activeTab;
  }
}, [activeTab]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [usersData, vacanciesData, candidatesData, competenciesData] = await Promise.all([
        usersAPI.getAll(),
        vacanciesAPI.getAll(),
        candidatesAPI.getAll(),
        competenciesAPI.getAll()
      ]);

      setUsers(usersData);
      setVacancies(vacanciesData);
      setCandidates(candidatesData);
      setCompetencies(competenciesData);

      // Load assignments with fallback
      try {
        const assignmentsData = await vacanciesAPI.getAssignments();
        setAssignments(assignmentsData);
      } catch (assignmentError) {
        console.error('Failed to load assignments, using fallback:', assignmentError);
        const uniqueAssignments = [...new Set(
          vacanciesData
            .map(v => v.assignment)
            .filter(a => a && a.trim() !== '')
        )].sort();
        setAssignments(uniqueAssignments);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      showToast('Failed to load data. Please refresh the page.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Reload specific data when needed
  const loadData = async () => {
    await loadAllData();
  };

  const handleAdd = (type) => {
    setModalType(type);
    setEditingItem(null);
    setShowModal(true);
  };

  const handleEdit = (item, type) => {
    setModalType(type);
    setEditingItem(item);
    setShowModal(true);
  };

  const handleDelete = async (id, type) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;

    try {
      switch (type) {
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
      loadData();
      showToast('Item deleted successfully!', 'success');
    } catch (error) {
      console.error('Failed to delete item:', error);
      showToast('Failed to delete item. Please try again.', 'error');
    }
  };

  const handleCSVUpload = async (file, type) => {
    try {
      const formData = new FormData();
      formData.append('csv', file);

      switch (type) {
        case 'vacancies':
          await vacanciesAPI.uploadCSV(formData);
          break;
        case 'candidates':
          await candidatesAPI.uploadCSV(formData);
          break;
        case 'competencies':
          await competenciesAPI.uploadCSV(formData);
          break;
      }

      loadData();
      showToast('CSV uploaded successfully!', 'success');
    } catch (error) {
      console.error('Failed to upload CSV:', error);
      showToast('Failed to upload CSV. Please check the format and try again.', 'error');
    }
  };

  // CSV Export Functions
  const downloadCSV = (data, filename) => {
    const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const convertToCSV = (array) => {
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
  };

  const handleExportCSV = (type) => {
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
            // Handle both vacancyIds array and single vacancyId
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
  };

  const handleExportEmptyTemplate = (type) => {
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
  };

  const UserModal = () => {
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

    const handleSubmit = async (e) => {
      e.preventDefault();
      try {
        if (editingItem) {
          await usersAPI.update(editingItem._id, formData);
        } else {
          await usersAPI.create(formData);
        }
        setShowModal(false);
        loadData();
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
            <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
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
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300">
                Cancel
              </button>
              <button type="submit" className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600">
                {editingItem ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const VacancyModal = () => {
    const [formData, setFormData] = useState(
      editingItem ? {
        ...editingItem,
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
        qualifications: {
          education: '',
          training: '',
          experience: '',
          eligibility: ''
        }
      }
    );

    const handleSubmit = async (e) => {
      e.preventDefault();
      try {
        if (editingItem) {
          await vacanciesAPI.update(editingItem._id, formData);
        } else {
          await vacanciesAPI.create(formData);
        }
        setShowModal(false);
        loadData();
        showToast(`Vacancy ${editingItem ? 'updated' : 'created'} successfully!`, 'success');
      } catch (error) {
        console.error('Failed to save vacancy:', error);
        showToast('Failed to save vacancy. Please try again.', 'error');
      }
    };

    return (
      <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="modal-content bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 overflow-y-auto max-h-[90vh]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">
              {editingItem ? 'Edit Vacancy' : 'Add Vacancy'}
            </h2>
            <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3 text-sm">
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
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300">
                Cancel
              </button>
              <button type="submit" className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600">
                {editingItem ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const CandidateModal = () => {
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
        status: CANDIDATE_STATUS.GENERAL_LIST
      };

      if (editingItem) {
        return {
          ...defaultData,
          ...editingItem,
          dateOfBirth: editingItem.dateOfBirth ? editingItem.dateOfBirth.split('T')[0] : ''
        };
      }

      return defaultData;
    });

    const handleSubmit = async (e) => {
      e.preventDefault();
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
          status: formData.status || CANDIDATE_STATUS.GENERAL_LIST
        };

        if (editingItem) {
          await candidatesAPI.update(editingItem._id, submitData);
        } else {
          await candidatesAPI.create(submitData);
        }
        setShowModal(false);
        loadData();
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
            <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3 text-sm grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300">
                Cancel
              </button>
              <button type="submit" className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600">
                {editingItem ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const CompetencyModal = () => {
  const [formData, setFormData] = useState(() => {
    const defaultData = {
      name: '',
      type: 'basic',
      selectedVacancies: [],
      isFixed: false
    };

    if (editingItem) {
      // Handle both vacancyIds array and single vacancyId
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

  const [vacancySearch, setVacancySearch] = useState(''); // 🔍 NEW STATE

  const handleVacancyChange = (vacancyId, checked) => {
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
  };

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

      setShowModal(false);
      loadData();
      showToast(`Competency ${editingItem ? 'updated' : 'created'} successfully!`, 'success');
    } catch (error) {
      console.error('Failed to save competency:', error);
      showToast('Failed to save competency. Please try again.', 'error');
    }
  };

  // 🧠 Filter vacancies based on search
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
          <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
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

              {/* 🔍 Search Input */}
              <input
                type="text"
                placeholder="Search vacancies..."
                value={vacancySearch}
                onChange={(e) => setVacancySearch(e.target.value)}
                className="w-full px-2 py-1 mb-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              {/* ✅ Filtered List */}
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
              onClick={() => setShowModal(false)}
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


  const VacancyAssignmentModal = () => {
      const [formData, setFormData] = useState(() => {
        if (editingItem) {
          return {
            assignmentType: editingItem.assignedVacancies || 'all',
            assignedAssignment: editingItem.assignedAssignment || '',
            assignedItemNumbers: editingItem.assignedItemNumbers || []
          };
        }
        return {
          assignmentType: 'all',
          assignedAssignment: '',
          assignedItemNumbers: []
        };
      });

      const handleItemNumberChange = (itemNumber, checked) => {
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
      };

      const handleSubmit = async (e) => {
        e.preventDefault();
        try {
          const submitData = {
            assignmentType: formData.assignmentType,
            assignedAssignment: formData.assignmentType === 'assignment' ? formData.assignedAssignment : null,
            assignedItemNumbers: formData.assignmentType === 'specific' ? formData.assignedItemNumbers : []
          };

          await usersAPI.assignVacancies(editingItem._id, submitData);
          setShowModal(false);
          loadData();
          showToast('Vacancy assignment updated successfully!', 'success');
        } catch (error) {
          console.error('Failed to assign vacancies:', error);
          showToast('Failed to assign vacancies. Please try again.', 'error');;
        }
      };

      return (
        <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="modal-content bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">
                Assign Vacancies to {editingItem?.name}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Assignment Type</label>
                <div className="space-y-2">
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
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300">
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

  // VacancyDetailsModal - This should be AFTER VacancyAssignmentModal
  const VacancyDetailsModal = () => {
    if (!selectedVacancy) return null;

    return (
      <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="modal-content bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 overflow-y-auto max-h-[90vh]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Vacancy Details</h2>
            <button onClick={() => setShowVacancyModal(false)} className="text-gray-500 hover:text-gray-700 text-2xl">✕</button>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Item Number</label>
                <p className="mt-1 text-sm text-gray-900">{selectedVacancy.itemNumber}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Position</label>
                <p className="mt-1 text-sm text-gray-900">{selectedVacancy.position}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Assignment</label>
                <p className="mt-1 text-sm text-gray-900">{selectedVacancy.assignment}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Salary Grade</label>
                <p className="mt-1 text-sm text-gray-900">{selectedVacancy.salaryGrade}</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Qualifications</h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Education</label>
                  <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                    {selectedVacancy.qualifications?.education || 'Not specified'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Training</label>
                  <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                    {selectedVacancy.qualifications?.training || 'Not specified'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Experience</label>
                  <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                    {selectedVacancy.qualifications?.experience || 'Not specified'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Eligibility</label>
                  <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                    {selectedVacancy.qualifications?.eligibility || 'Not specified'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowVacancyModal(false)}
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

  const getStatusColor = (status) => {
    switch (status) {
      case CANDIDATE_STATUS.GENERAL_LIST:
        return 'bg-blue-100 text-blue-800';
      case CANDIDATE_STATUS.LONG_LIST:
        return 'bg-yellow-100 text-yellow-800';
      case CANDIDATE_STATUS.FOR_REVIEW:
        return 'bg-orange-100 text-orange-800';
      case CANDIDATE_STATUS.DISQUALIFIED:
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case CANDIDATE_STATUS.GENERAL_LIST:
        return 'General List';
      case CANDIDATE_STATUS.LONG_LIST:
        return 'Long List';
      case CANDIDATE_STATUS.FOR_REVIEW:
        return 'For Review';
      case CANDIDATE_STATUS.DISQUALIFIED:
        return 'Disqualified';
      default:
        return status;
    }
  };

  const getAssignmentDisplay = (user) => {
    if (user.assignedVacancies === 'all') {
      return 'All Vacancies';
    } else if (user.assignedVacancies === 'assignment') {
      return `Assignment: ${user.assignedAssignment || 'Not Set'}`;
    } else if (user.assignedVacancies === 'specific') {
      const count = user.assignedItemNumbers?.length || 0;
      return `Specific Items (${count})`;
    }
    return 'All Vacancies';
  };

  const renderUsers = () => {
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
          <button onClick={() => handleAdd('user')} className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600">
            Add User
          </button>
        </div>
      </div>
      <div className="card bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <FilterableHeader label="Name" filterKey="name" sortKey="name" filterValue={filters.name || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <FilterableHeader label="Email" filterKey="email" sortKey="email" filterValue={filters.email || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <FilterableHeader label="User Type" filterKey="userType" sortKey="userType" filterValue={filters.userType || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <FilterableHeader label="Rater Type" filterKey="raterType" sortKey="raterType" filterValue={filters.raterType || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <FilterableHeader label="Position" filterKey="position" sortKey="position" filterValue={filters.position || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map(user => (
                <tr key={user._id}>
                  <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">{user.name}</td>
                  <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">{user.email}</td>
                  <td className="table-cell px-4 py-2">
                    <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                      {user.userType}
                    </span>
                  </td>
                  <td className="table-cell px-4 py-2 text-xs">{user.raterType || '-'}</td>
                  <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">{user.position || '-'}</td>
                  <td className="table-cell px-4 py-2">
                    <button
                      onClick={() => handleEdit(user, 'user')}
                      className="btn-secondary px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 mr-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(user._id, 'user')}
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
};

  const renderVacancies = () => {
  const filteredVacancies = filterAndSortData(vacancies, ['itemNumber', 'position', 'assignment', 'salaryGrade']);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Vacancies Management</h2>
        <div className="flex space-x-2">
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
          <label htmlFor="vacancy-csv-upload" className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 cursor-pointer">
            Upload CSV
          </label>
          <button onClick={() => handleAdd('vacancy')} className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600">
            Add Vacancy
          </button>
        </div>
      </div>
      <div className="card bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <FilterableHeader label="Item Number" filterKey="itemNumber" sortKey="itemNumber" filterValue={filters.itemNumber || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <FilterableHeader label="Position" filterKey="position" sortKey="position" filterValue={filters.position || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <FilterableHeader label="Assignment" filterKey="assignment" sortKey="assignment" filterValue={filters.assignment || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <FilterableHeader label="Salary Grade" filterKey="salaryGrade" sortKey="salaryGrade" filterValue={filters.salaryGrade || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredVacancies.map(vacancy => (
                <tr key={vacancy._id}>
                  <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">{vacancy.itemNumber}</td>
                  <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">{vacancy.position}</td>
                  <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">{vacancy.assignment}</td>
                  <td className="table-cell px-4 py-2 text-xs">{vacancy.salaryGrade}</td>
                  <td className="table-cell px-4 py-2">
                    <button
                      onClick={() => handleEdit(vacancy, 'vacancy')}
                      className="btn-secondary px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 mr-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(vacancy._id, 'vacancy')}
                      className="btn-danger px-2 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600"
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
};

  const renderCandidates = () => {
  const filteredCandidates = filterAndSortData(candidates, ['fullName', 'itemNumber', 'gender', 'age', 'status']);

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
          <input
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files[0] && handleCSVUpload(e.target.files[0], 'candidates')}
            className="hidden"
            id="candidate-csv-upload"
          />
          <label htmlFor="candidate-csv-upload" className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 cursor-pointer">
            Upload CSV
          </label>
          <button onClick={() => handleAdd('candidate')} className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600">
            Add Candidate
          </button>
        </div>
      </div>
      <div className="card bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <FilterableHeader label="Name" filterKey="fullName" sortKey="fullName" filterValue={filters.fullName || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <FilterableHeader label="Item Number" filterKey="itemNumber" sortKey="itemNumber" filterValue={filters.itemNumber || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <FilterableHeader label="Gender" filterKey="gender" sortKey="gender" filterValue={filters.gender || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <FilterableHeader label="Age" filterKey="age" sortKey="age" filterValue={filters.age || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <FilterableHeader label="Status" filterKey="status" sortKey="status" filterValue={filters.status || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCandidates.map(candidate => (
                <tr key={candidate._id}>
                  <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">{candidate.fullName}</td>
                  <td className="table-cell px-4 py-2 text-xs">
                    <button
                      onClick={() => handleItemNumberClick(candidate.itemNumber)}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {candidate.itemNumber}
                    </button>
                  </td>
                  <td className="table-cell px-4 py-2 text-xs">{candidate.gender}</td>
                  <td className="table-cell px-4 py-2 text-xs">{candidate.age}</td>
                  <td className="table-cell px-4 py-2">
                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(candidate.status)}`}>
                      {getStatusLabel(candidate.status)}
                    </span>
                  </td>
                  <td className="table-cell px-4 py-2">
                    <button
                      onClick={() => handleEdit(candidate, 'candidate')}
                      className="btn-secondary px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 mr-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(candidate._id, 'candidate')}
                      className="btn-danger px-2 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filteredCandidates.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    No candidates found matching your search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

  const renderCompetencies = () => {
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
          <label htmlFor="competency-csv-upload" className="btn-secondary px-3 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 cursor-pointer">
            Upload CSV
          </label>
          <button onClick={() => handleAdd('competency')} className="btn-primary px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600">
            Add Competency
          </button>
        </div>
      </div>
      <div className="card bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <FilterableHeader label="Name" filterKey="name" sortKey="name" filterValue={filters.name || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <FilterableHeader label="Type" filterKey="type" sortKey="type" filterValue={filters.type || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vacancies</th>
                <FilterableHeader label="Fixed" filterKey="isFixed" sortKey="isFixed" filterValue={filters.isFixed || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCompetencies.map(competency => {
                // ✅ FIX: Check both vacancyIds array AND single vacancyId
                let vacancyIds = [];
                
                // If vacancyIds array exists and has items, use it
                if (Array.isArray(competency.vacancyIds) && competency.vacancyIds.length > 0) {
                  vacancyIds = competency.vacancyIds;
                }
                // Otherwise if single vacancyId exists, use it
                else if (competency.vacancyId) {
                  vacancyIds = [competency.vacancyId];
                }
                
                // Map IDs to item numbers
                const vacancyNames = vacancyIds.length > 0
                  ? vacancyIds
                      .map(id => vacancies.find(v => v._id === id)?.itemNumber)
                      .filter(Boolean)
                      .join(', ')
                  : 'All Vacancies';
                
                return (
                  <tr key={competency._id}>
                    <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">{competency.name}</td>
                    <td className="table-cell px-4 py-2">
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs capitalize">
                        {competency.type}
                      </span>
                    </td>
                    <td className="table-cell px-4 py-2 whitespace-normal break-words max-w-xs text-xs">{vacancyNames}</td>
                    <td className="table-cell px-4 py-2">
                      <span className={`px-2 py-1 rounded text-xs ${competency.isFixed ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
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
                        onClick={() => handleDelete(competency._id, 'competency')}
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
};

  const renderVacancyAssignments = () => {
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
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <FilterableHeader label="User" filterKey="name" sortKey="name" filterValue={filters.name || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <FilterableHeader label="User Type" filterKey="userType" sortKey="userType" filterValue={filters.userType || ''} onFilterChange={handleFilterChange} onSort={handleSort} sortConfig={sortConfig} />
                <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Assignment</th>
                <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                <th className="table-header px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
};
                      

  const renderInterviewSummary = () => (
    <div className="space-y-4">
      <InterviewSummaryGenerator user={user} />
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
  <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pt-16">
    {/* Sidebar - Fixed with Header Offset */}
    <div className="w-64 flex-shrink-0">
      <div className="sidebar fixed top-16 left-0 w-64 h-[calc(100vh-4rem)] bg-white shadow-xl border-r border-gray-200 overflow-y-auto">
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
          </nav>
        </div>
      </div>
    </div>

    {/* Main Content */}
    <div className="flex-1 p-6 overflow-auto">
      {/* Search Bar */}
      {activeTab !== 'interviewSummary' && (
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
              : 'Search users by name, email, or type...'
          }
          value={searchTerm}
          onChange={handleSearchChange}
        />
      )}

      {/* Tab Content */}
      {activeTab === 'users' && renderUsers()}
      {activeTab === 'vacancies' && renderVacancies()}
      {activeTab === 'candidates' && renderCandidates()}
      {activeTab === 'competencies' && renderCompetencies()}
      {activeTab === 'assignments' && renderVacancyAssignments()}
      {activeTab === 'interviewSummary' && renderInterviewSummary()}
    </div>

    {/* Modals */}
    {showModal && modalType === 'user' && <UserModal />}
    {showModal && modalType === 'vacancy' && <VacancyModal />}
    {showModal && modalType === 'candidate' && <CandidateModal />}
    {showModal && modalType === 'competency' && <CompetencyModal />}
    {showModal && modalType === 'assignment' && <VacancyAssignmentModal />}
    {showVacancyModal && <VacancyDetailsModal />}
  </div>
);
};

export default AdminView;
