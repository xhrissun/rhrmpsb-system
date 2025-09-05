export const USER_TYPES = {
  RATER: 'rater',
  SECRETARIAT: 'secretariat', 
  ADMIN: 'admin'
};

export const RATER_TYPES = {
  CHAIRPERSON: 'Chairperson',
  VICECHAIRPERSON: 'Vice-Chairperson',
  REGULARMEMBER: 'Regular Member',
  DENREU: 'DENREU',
  GENDERANDDEVELOPMENT: 'Gender and Development',
  ENDUSER: 'End-User'
};

export const CANDIDATE_STATUS = {
  GENERAL_LIST: 'general_list',
  LONG_LIST: 'long_list',
  DISQUALIFIED: 'disqualified',
  FOR_REVIEW: 'for_review'
};

export const SALARY_GRADES = Array.from({ length: 24 }, (_, i) => i + 1);

export const BASIC_COMPETENCIES = [
  'Communication Skills',
  'Interpersonal Skills',
  'Problem-Solving Ability',
  'Adaptability',
  'Work Ethics',
  'Emotional Intelligence',
  'Critical Thinking',
  'Team Collaboration'
];

export const ORGANIZATIONAL_COMPETENCIES = [
  'Knowledge of Organization',
  'Customer Service Orientation',
  'Result Orientation',
  'Innovation and Creativity',
  'Organizational Commitment',
  'Quality Management',
  'Process Improvement',
  'Strategic Thinking'
];

export const LEADERSHIP_COMPETENCIES = [
  'Leadership and Management',
  'Decision Making',
  'People Development',
  'Change Management',
  'Vision and Strategic Direction',
  'Conflict Resolution',
  'Delegation',
  'Performance Management'
];

export const RATING_SCALE = [
  { value: 1, label: 'Poor' },
  { value: 2, label: 'Below Average' },
  { value: 3, label: 'Average' },
  { value: 4, label: 'Above Average' },
  { value: 5, label: 'Excellent' }
];

export const COMPETENCY_TYPES = {
  BASIC: 'basic',
  ORGANIZATIONAL: 'organizational',
  LEADERSHIP: 'leadership',
  MINIMUM: 'minimum'
};

// Add these two functions to your existing constants.js file

export const getStatusColor = (status) => {
  switch (status) {
    case CANDIDATE_STATUS.GENERAL_LIST:
      return 'bg-gray-100 text-gray-800';
    case CANDIDATE_STATUS.LONG_LIST:
      return 'bg-blue-100 text-blue-800';
    case CANDIDATE_STATUS.FOR_REVIEW:
      return 'bg-yellow-100 text-yellow-800';
    case CANDIDATE_STATUS.DISQUALIFIED:
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const getStatusLabel = (status) => {
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
      return 'Unknown';
  }
};