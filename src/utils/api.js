import axios from 'axios';


// API Configuration
const API_BASE_URL = import.meta.env.PROD 
  ? 'https://rhrmpsb-system.onrender.com/api' 
  : 'http://localhost:5001/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear all localStorage keys
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('rater_selectedAssignment');
      localStorage.removeItem('rater_selectedPosition');
      localStorage.removeItem('rater_selectedItemNumber');
      localStorage.removeItem('rater_selectedCandidate');
      localStorage.removeItem('secretariat_selectedAssignment');
      localStorage.removeItem('secretariat_selectedPosition');
      localStorage.removeItem('secretariat_selectedItemNumber');
      localStorage.removeItem('secretariat_selectedCandidate');
      localStorage.removeItem('admin_activeTab');
      // Use base path for redirect
      const basePath = import.meta.env.PROD ? '/rhrmpsb-system' : '';
      window.location.href = `${basePath}/login`;
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },
  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },
  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
  // NEW: Verify password method
  verifyPassword: async (userId, password) => {
    const response = await api.post('/auth/verify-password', { userId, password });
    return response.data.isValid;
  }
};

// Users API
export const usersAPI = {
  getAll: async () => {
    const response = await api.get('/users');
    return response.data;
  },
  getById: async (id) => {
    const response = await api.get(`/users/${id}`);
    return response.data;
  },
  create: async (userData) => {
    const response = await api.post('/users', userData);
    return response.data;
  },
  update: async (id, userData) => {
    const response = await api.put(`/users/${id}`, userData);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },
  getRaters: async () => {
    const response = await api.get('/users/raters');
    return response.data;
  },
  exportCSV: async () => {
    const response = await api.get('/users/export-csv', {
      responseType: 'blob'
    });
    return response.data;
  },
  // NEW: Vacancy assignment methods
  assignVacancies: async (userId, assignmentData) => {
    const response = await api.post(`/users/${userId}/assign-vacancies`, assignmentData);
    return response.data;
  },
  getAssignedVacancies: async (userId) => {
    const response = await api.get(`/users/${userId}/assigned-vacancies`);
    return response.data;
  },
  // Add this to your usersAPI object in api.js
  changePassword: async (userId, newPassword) => {
  const response = await api.put(`/users/${userId}/change-password`, { 
    newPassword 
  });
  return response.data;
}
};

// Vacancies API
export const vacanciesAPI = {
  getAll: async () => {
    const response = await api.get('/vacancies');
    return response.data;
  },
  getById: async (id) => {
    const response = await api.get(`/vacancies/${id}`);
    return response.data;
  },
  create: async (vacancyData) => {
    const response = await api.post('/vacancies', vacancyData);
    return response.data;
  },
  update: async (id, vacancyData) => {
    const response = await api.put(`/vacancies/${id}`, vacancyData);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/vacancies/${id}`);
    return response.data;
  },
  uploadCSV: async (formData) => {
    const response = await api.post('/vacancies/upload-csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },
  exportCSV: async () => {
    const response = await api.get('/vacancies/export-csv', {
      responseType: 'blob'
    });
    return response.data;
  },
  
  getAssignments: async () => {
    const response = await api.get('/vacancies/assignments');
    return response.data;
  }
};

// Candidates API
export const candidatesAPI = {
  getAll: async () => {
    const response = await api.get('/candidates');
    return response.data;
  },
  getById: async (id) => {
    const response = await api.get(`/candidates/${id}`);
    return response.data;
  },
  create: async (candidateData) => {
    const response = await api.post('/candidates', candidateData);
    return response.data;
  },
  update: async (id, candidateData) => {
    const response = await api.put(`/candidates/${id}`, candidateData);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/candidates/${id}`);
    return response.data;
  },
  uploadCSV: async (formData) => {
    const response = await api.post('/candidates/upload-csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },
  updateStatus: async (id, status, comments) => {
    const response = await api.put(`/candidates/${id}/status`, { status, comments });
    return response.data;
  },
  getByItemNumber: async (itemNumber) => {
    // Encode the item number to handle special characters
    const encodedItemNumber = encodeURIComponent(itemNumber);
    const response = await api.get(`/candidates/item/${encodedItemNumber}`);
    return response.data;
  },
  exportCSV: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.itemNumber) params.append('itemNumber', filters.itemNumber);
    if (filters.assignment) params.append('assignment', filters.assignment);
    if (filters.position) params.append('position', filters.position);
    
    const response = await api.get(`/candidates/export-csv?${params.toString()}`, {
      responseType: 'blob'
    });
    
    // Get the filename from Content-Disposition header if available
    const contentDisposition = response.headers['content-disposition'];
    let filename = `candidates_export_${new Date().toISOString().split('T')[0]}.csv`;
    
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }
    
    // Create blob and trigger download
    const blob = new Blob([response.data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    return { success: true, filename };
  },
  // ✅ UPDATED: Comment suggestions with configurable limit
  getCommentSuggestions: async (field, limit = 100) => {
    const response = await api.get(`/candidates/comment-suggestions/${field}?limit=${limit}`);
    return response.data;
  }
};

// Ratings API
export const ratingsAPI = {
  getAll: async () => {
    const response = await api.get('/ratings');
    return response.data;
  },
  getByCandidate: async (candidateId) => {
    const response = await api.get(`/ratings/candidate/${candidateId}`);
    return response.data;
  },
  getByRater: async (raterId) => {
    const response = await api.get(`/ratings/rater/${raterId}`);
    return response.data;
  },
  create: async (ratingData) => {
    const response = await api.post('/ratings', ratingData);
    return response.data;
  },
  update: async (id, ratingData) => {
    const response = await api.put(`/ratings/${id}`, ratingData);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/ratings/${id}`);
    return response.data;
  },
  submitRatings: async (ratingsData, isUpdate = false) => {
    const response = await api.post('/ratings/submit', {
      ...ratingsData,
      isUpdate
    });
    return response.data;
  },
  
  // Check existing ratings by item number (for individual rater updates)
  checkExistingRatings: async (candidateId, raterId, itemNumber) => {
    const response = await api.get(`/ratings/candidate/${candidateId}`);
    const raterRatings = response.data.filter(rating => 
      rating.raterId && 
      rating.raterId._id === raterId &&
      rating.itemNumber === itemNumber  // Filter by itemNumber
    );
    return {
      hasExisting: raterRatings.length > 0,
      count: raterRatings.length,
      ratings: raterRatings
    };
  },
  
  // NEW: Check if ratings exist for candidate + item number + rater type (prevent duplicates)
  checkExistingByRaterType: async (candidateId, itemNumber, raterType) => {
    const encodedItemNumber = encodeURIComponent(itemNumber);
    const encodedRaterType = encodeURIComponent(raterType);
    const response = await api.get(
      `/ratings/check-existing/${candidateId}/${encodedItemNumber}/${encodedRaterType}`
    );
    return response.data;
  },
  
  // Reset ratings by item number
  resetRatings: async (candidateId, raterId, itemNumber) => {
    // Encode item number to handle special characters
    const encodedItemNumber = encodeURIComponent(itemNumber);
    const response = await api.delete(
      `/ratings/candidate/${candidateId}/rater/${raterId}/item/${encodedItemNumber}`
    );
    return response.data;
  }
};

// Competencies API
export const competenciesAPI = {
  getAll: async () => {
    const response = await api.get('/competencies');
    return response.data;
  },
  getById: async (id) => {
    const response = await api.get(`/competencies/${id}`);
    return response.data;
  },
  create: async (competencyData) => {
    const response = await api.post('/competencies', competencyData);
    return response.data;
  },
  update: async (id, competencyData) => {
    const response = await api.put(`/competencies/${id}`, competencyData);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/competencies/${id}`);
    return response.data;
  },
  getByVacancy: async (vacancyId) => {
    const response = await api.get(`/competencies/vacancy/${vacancyId}`);
    return response.data;
  },
  uploadCSV: async (formData) => {
    const response = await api.post('/competencies/upload-csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },
  exportCSV: async () => {
    const response = await api.get('/competencies/export-csv', {
      responseType: 'blob'
    });
    return response.data;
  }
};

// Reports API
export const reportsAPI = {
  generateRatingReport: async (candidateId) => {
    const response = await api.get(`/reports/rating/${candidateId}`, {
      responseType: 'blob'
    });
    return response.data;
  },
  getCandidateReport: async (candidateId) => {
    const response = await api.get(`/reports/candidate/${candidateId}`);
    return response.data;
  }
};



export default api;
