import React, { useState, useEffect } from 'react';
import { publicationRangesAPI, vacanciesAPI, candidatesAPI } from '../utils/api';
import { useToast } from '../utils/ToastContext';
import { 
  getPublicationStatusColor, 
  getPublicationStatusLabel, 
  formatDateRange 
} from '../utils/constants';

const PublicationRangeManager = () => {
  const [publicationRanges, setPublicationRanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [selectedStats, setSelectedStats] = useState(null);
  
  // NEW: States for viewing archived data
  const [showArchivedDataModal, setShowArchivedDataModal] = useState(false);
  const [archivedDataType, setArchivedDataType] = useState('vacancies'); // 'vacancies' or 'candidates'
  const [selectedPublicationRange, setSelectedPublicationRange] = useState(null);
  const [archivedVacancies, setArchivedVacancies] = useState([]);
  const [archivedCandidates, setArchivedCandidates] = useState([]);
  
  // NEW: States for cloning vacancies
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [vacancyToClone, setVacancyToClone] = useState(null);
  
  const { showToast } = useToast();

  useEffect(() => {
    loadPublicationRanges();
  }, [showArchived]);

  const loadPublicationRanges = async () => {
    try {
      setLoading(true);
      const data = await publicationRangesAPI.getAll(showArchived);
      setPublicationRanges(data);
    } catch (error) {
      console.error('Failed to load publication ranges:', error);
      showToast('Failed to load publication ranges', 'error');
    } finally {
      setLoading(false);
    }
  };

  // NEW: Load archived vacancies for a publication range
  const loadArchivedVacancies = async (publicationRangeId) => {
    try {
      const data = await vacanciesAPI.getByPublicationRange(publicationRangeId, true);
      setArchivedVacancies(data.filter(v => v.isArchived));
    } catch (error) {
      console.error('Failed to load archived vacancies:', error);
      showToast('Failed to load archived vacancies', 'error');
    }
  };

  // NEW: Load archived candidates for a publication range
  const loadArchivedCandidates = async (publicationRangeId) => {
    try {
      const data = await candidatesAPI.getByPublicationRange(publicationRangeId, true);
      setArchivedCandidates(data.filter(c => c.isArchived));
    } catch (error) {
      console.error('Failed to load archived candidates:', error);
      showToast('Failed to load archived candidates', 'error');
    }
  };

  // NEW: View archived data
  const handleViewArchivedData = async (publicationRange, type) => {
    setSelectedPublicationRange(publicationRange);
    setArchivedDataType(type);
    
    if (type === 'vacancies') {
      await loadArchivedVacancies(publicationRange._id);
    } else {
      await loadArchivedCandidates(publicationRange._id);
    }
    
    setShowArchivedDataModal(true);
  };

  // NEW: Clone vacancy to new publication range
  const handleCloneVacancy = async (vacancy, targetPublicationRangeId) => {
    try {
      const result = await vacanciesAPI.cloneToPublication(vacancy._id, targetPublicationRangeId);
      showToast(result.message, 'success');
      setShowCloneModal(false);
      setVacancyToClone(null);
      // Refresh archived vacancies
      if (selectedPublicationRange) {
        await loadArchivedVacancies(selectedPublicationRange._id);
      }
    } catch (error) {
      console.error('Clone error:', error);
      showToast(error.response?.data?.message || 'Failed to clone vacancy', 'error');
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const handleEdit = (item) => {
    if (item.isArchived) {
      showToast('Cannot edit archived publication range', 'error');
      return;
    }
    setEditingItem(item);
    setShowModal(true);
  };

  const handleArchive = async (id, name) => {
    if (!confirm(`Archive publication range "${name}"? This will also archive all associated vacancies and candidates.`)) {
      return;
    }
    
    try {
      const result = await publicationRangesAPI.archive(id);
      showToast(
        `Archived: ${result.vacanciesArchived} vacancies, ${result.candidatesArchived} candidates`, 
        'success'
      );
      loadPublicationRanges();
    } catch (error) {
      console.error('Failed to archive:', error);
      showToast('Failed to archive publication range', 'error');
    }
  };

  const handleUnarchive = async (id, name) => {
    if (!confirm(`Unarchive publication range "${name}"?`)) {
      return;
    }
    
    try {
      await publicationRangesAPI.unarchive(id);
      showToast('Publication range unarchived successfully', 'success');
      loadPublicationRanges();
    } catch (error) {
      console.error('Failed to unarchive:', error);
      showToast('Failed to unarchive publication range', 'error');
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete publication range "${name}"? This will only work if no vacancies or candidates exist.`)) {
      return;
    }
    
    try {
      await publicationRangesAPI.delete(id);
      showToast('Publication range deleted successfully', 'success');
      loadPublicationRanges();
    } catch (error) {
      console.error('Failed to delete:', error);
      showToast(error.response?.data?.message || 'Failed to delete publication range', 'error');
    }
  };

  const handleViewStats = async (id) => {
    try {
      const stats = await publicationRangesAPI.getStatistics(id);
      setSelectedStats(stats);
      setShowStatsModal(true);
    } catch (error) {
      console.error('Failed to load statistics:', error);
      showToast('Failed to load statistics', 'error');
    }
  };

  const PublicationRangeModal = () => {
    const [formData, setFormData] = useState(
      editingItem || {
        name: '',
        tags: [],
        startDate: '',
        endDate: '',
        description: '',
        isActive: true
      }
    );
    const [tagInput, setTagInput] = useState('');

    const handleAddTag = () => {
      if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
        setFormData({
          ...formData,
          tags: [...formData.tags, tagInput.trim()]
        });
        setTagInput('');
      }
    };

    const handleRemoveTag = (tagToRemove) => {
      setFormData({
        ...formData,
        tags: formData.tags.filter(tag => tag !== tagToRemove)
      });
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      try {
        if (editingItem) {
          await publicationRangesAPI.update(editingItem._id, formData);
          showToast('Publication range updated successfully', 'success');
        } else {
          await publicationRangesAPI.create(formData);
          showToast('Publication range created successfully', 'success');
        }
        setShowModal(false);
        loadPublicationRanges();
      } catch (error) {
        console.error('Failed to save:', error);
        showToast(error.response?.data?.message || 'Failed to save publication range', 'error');
      }
    };

    return (
      <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="modal-content bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 overflow-y-auto max-h-[90vh]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">
              {editingItem ? 'Edit Publication Range' : 'Create Publication Range'}
            </h2>
            <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                placeholder="e.g., Q1 2024 Recruitment"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.startDate ? new Date(formData.startDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.endDate ? new Date(formData.endDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add tag and press Enter"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-blue-900"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Optional description"
              />
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Set as Active</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                {editingItem ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const StatisticsModal = () => {
    if (!selectedStats) return null;

    return (
      <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="modal-content bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">Statistics: {selectedStats.publicationRange.name}</h2>
            <button onClick={() => setShowStatsModal(false)} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">Total Vacancies</div>
                <div className="text-2xl font-bold text-blue-600">
                  {selectedStats.statistics.totalVacancies}
                </div>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">Total Candidates</div>
                <div className="text-2xl font-bold text-green-600">
                  {selectedStats.statistics.totalCandidates}
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-2">Candidates by Status</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">General List:</span>
                  <span className="font-semibold">{selectedStats.statistics.candidatesByStatus.general_list}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Long List:</span>
                  <span className="font-semibold">{selectedStats.statistics.candidatesByStatus.long_list}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">For Review:</span>
                  <span className="font-semibold">{selectedStats.statistics.candidatesByStatus.for_review}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Disqualified:</span>
                  <span className="font-semibold">{selectedStats.statistics.candidatesByStatus.disqualified}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button
              onClick={() => setShowStatsModal(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  // NEW: Modal to view archived vacancies/candidates
  const ArchivedDataModal = () => {
    if (!selectedPublicationRange) return null;

    return (
      <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="modal-content bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 p-6 overflow-y-auto max-h-[90vh]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">
              Archived {archivedDataType === 'vacancies' ? 'Vacancies' : 'Candidates'}: {selectedPublicationRange.name}
            </h2>
            <button 
              onClick={() => setShowArchivedDataModal(false)} 
              className="text-gray-500 hover:text-gray-700 text-xl"
            >
              ✕
            </button>
          </div>

          {archivedDataType === 'vacancies' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Item Number</th>
                    <th className="px-4 py-2 text-left">Position</th>
                    <th className="px-4 py-2 text-left">Assignment</th>
                    <th className="px-4 py-2 text-left">Salary Grade</th>
                    <th className="px-4 py-2 text-left">Archived At</th>
                    <th className="px-4 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {archivedVacancies.map(vacancy => (
                    <tr key={vacancy._id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">{vacancy.itemNumber}</td>
                      <td className="px-4 py-2">{vacancy.position}</td>
                      <td className="px-4 py-2">{vacancy.assignment}</td>
                      <td className="px-4 py-2">SG {vacancy.salaryGrade}</td>
                      <td className="px-4 py-2">
                        {vacancy.archivedAt ? new Date(vacancy.archivedAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => {
                            setVacancyToClone(vacancy);
                            setShowCloneModal(true);
                          }}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
                          title="Clone to new publication range"
                        >
                          Clone
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {archivedVacancies.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No archived vacancies found
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Full Name</th>
                    <th className="px-4 py-2 text-left">Item Number</th>
                    <th className="px-4 py-2 text-left">Gender</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Archived At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {archivedCandidates.map(candidate => (
                    <tr key={candidate._id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">{candidate.fullName}</td>
                      <td className="px-4 py-2">{candidate.itemNumber}</td>
                      <td className="px-4 py-2">{candidate.gender}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                          {candidate.status}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {candidate.archivedAt ? new Date(candidate.archivedAt).toLocaleDateString() : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {archivedCandidates.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No archived candidates found
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end mt-6">
            <button
              onClick={() => setShowArchivedDataModal(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  // NEW: Clone vacancy modal
  const CloneVacancyModal = () => {
    if (!vacancyToClone) return null;

    return (
      <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h3 className="text-lg font-bold mb-4">Clone Vacancy</h3>
          <p className="text-sm text-gray-600 mb-4">
            Clone <strong>{vacancyToClone.itemNumber} - {vacancyToClone.position}</strong> to:
          </p>
          
          <select
            id="target-publication-range"
            className="w-full px-3 py-2 border rounded mb-4"
            defaultValue=""
          >
            <option value="" disabled>Select target publication range</option>
            {publicationRanges
              .filter(pr => pr.isActive && !pr.isArchived)
              .map(pr => (
                <option key={pr._id} value={pr._id}>{pr.name}</option>
              ))}
          </select>
          
          <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> This will create a copy of the vacancy in the selected publication range. 
              The original archived vacancy will remain unchanged.
            </p>
          </div>
          
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => {
                setShowCloneModal(false);
                setVacancyToClone(null);
              }}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const select = document.getElementById('target-publication-range');
                if (select.value) {
                  handleCloneVacancy(vacancyToClone, select.value);
                } else {
                  showToast('Please select a target publication range', 'error');
                }
              }}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Clone Vacancy
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Publication Ranges</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              showArchived
                ? 'bg-gray-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </button>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
          >
            Create Publication Range
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {publicationRanges.map(item => (
          <div key={item._id} className="bg-white rounded-lg shadow-md p-4 border-2 border-gray-200">
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <h3 className="font-bold text-lg text-gray-900">{item.name}</h3>
                <p className="text-sm text-gray-600">{formatDateRange(item.startDate, item.endDate)}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium border ${getPublicationStatusColor(item.isArchived, item.isActive)}`}>
                {getPublicationStatusLabel(item.isArchived, item.isActive)}
              </span>
            </div>

            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {item.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {item.description && (
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">{item.description}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleViewStats(item._id)}
                className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
              >
                Statistics
              </button>
              
              {/* NEW: View archived data buttons */}
              {item.isArchived && (
                <>
                  <button
                    onClick={() => handleViewArchivedData(item, 'vacancies')}
                    className="text-xs px-3 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                  >
                    View Vacancies
                  </button>
                  <button
                    onClick={() => handleViewArchivedData(item, 'candidates')}
                    className="text-xs px-3 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                  >
                    View Candidates
                  </button>
                </>
              )}
              
              {!item.isArchived && (
                <>
                  <button
                    onClick={() => handleEdit(item)}
                    className="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleArchive(item._id, item.name)}
                    className="text-xs px-3 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                  >
                    Archive
                  </button>
                </>
              )}
              
              {item.isArchived && (
                <button
                  onClick={() => handleUnarchive(item._id, item.name)}
                  className="text-xs px-3 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                >
                  Unarchive
                </button>
              )}
              
              <button
                onClick={() => handleDelete(item._id, item.name)}
                className="text-xs px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {publicationRanges.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {showArchived ? 'No archived publication ranges found' : 'No active publication ranges found'}
        </div>
      )}

      {showModal && <PublicationRangeModal />}
      {showStatsModal && <StatisticsModal />}
      {showArchivedDataModal && <ArchivedDataModal />}
      {showCloneModal && <CloneVacancyModal />}
    </div>
  );
};

export default PublicationRangeManager;
