import mongoose from 'mongoose';

// Updated User Schema in models.js
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  userType: {
    type: String,
    required: true,
    enum: ['rater', 'secretariat', 'admin']
  },
  raterType: {
    type: String,
    enum: ['Chairperson', 'Vice-Chairperson', 'Regular Member', 'DENREU', 'Gender and Development', 'End-User'],
    required: false
  },
  position: {
    type: String,
    trim: true,
    default: null
  },
  designation: {
    type: String,
    trim: true,
    default: null
  },
  administrativePrivilege: {
    type: Boolean,
    default: false
  },
  // NEW: Vacancy assignment fields
  assignedVacancies: {
    type: String,
    enum: ['all', 'assignment', 'specific'],
    default: 'all'
  },
  assignedAssignment: {
    type: String,
    trim: true,
    default: null
  },
  assignedItemNumbers: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});



// NEW: Find users by vacancy assignment
userSchema.statics.findByVacancyAssignment = function(itemNumber, assignment) {
  return this.find({
    $or: [
      { assignedVacancies: 'all' },
      { assignedVacancies: 'assignment', assignedAssignment: assignment },
      { assignedVacancies: 'specific', assignedItemNumbers: { $in: [itemNumber] } }
    ]
  }).select('-password');
};

// Vacancy Schema
const vacancySchema = new mongoose.Schema({
  itemNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  position: {
    type: String,
    required: true,
    trim: true
  },
  assignment: {
    type: String,
    required: true,
    trim: true
  },
  salaryGrade: {
    type: Number,
    required: true,
    min: 1,
    max: 24
  },
  qualifications: {
    education: {
      type: String,
      trim: true,
      default: ''
    },
    training: {
      type: String,
      trim: true,
      default: ''
    },
    experience: {
      type: String,
      trim: true,
      default: ''
    },
    eligibility: {
      type: String,
      trim: true,
      default: ''
    }
  }
}, {
  timestamps: true
});

// Candidate Schema
const candidateSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  itemNumber: {
    type: String,
    required: true,
    trim: true
  },
  gender: {
    type: String,
    required: true,
    enum: ['Male', 'Female', 'MALE/LALAKI', 'FEMALE/BABAE']
  },
  dateOfBirth: {
    type: Date
  },
  age: {
    type: Number
  },
  eligibility: {
    type: String,
    trim: true,
    default: ''
  },
  professionalLicense: {
    type: String,
    trim: true,
    default: ''
  },
  letterOfIntent: {
    type: String,
    trim: true,
    default: ''
  },
  personalDataSheet: {
    type: String,
    trim: true,
    default: ''
  },
  workExperienceSheet: {
    type: String,
    trim: true,
    default: ''
  },
  proofOfEligibility: {
    type: String,
    trim: true,
    default: ''
  },
  certificates: {
    type: String,
    trim: true,
    default: ''
  },
  ipcr: {
    type: String,
    trim: true,
    default: ''
  },
  certificateOfEmployment: {
    type: String,
    trim: true,
    default: ''
  },
  diploma: {
    type: String,
    trim: true,
    default: ''
  },
  transcriptOfRecords: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['general_list', 'long_list', 'disqualified', 'for_review'],
    default: 'general_list'
  },
  comments: {
    education: {
      type: String,
      default: ''
    },
    training: {
      type: String,
      default: ''
    },
    experience: {
      type: String,
      default: ''
    },
    eligibility: {
      type: String,
      default: ''
    }
  }
}, {
  timestamps: true
});

// Updated Competency Schema to support multiple vacancies
const competencySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['basic', 'organizational', 'leadership', 'minimum']
  },
  // Support both single vacancy (backward compatibility) and multiple vacancies
  vacancyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vacancy'
  },
  vacancyIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vacancy'
  }],
  isFixed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Rating Schema
const ratingSchema = new mongoose.Schema({
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate',
    required: true
  },
  competencyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competency',
    required: true
  },
  raterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  score: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  interviewDate: {
    type: Date,
    default: Date.now
  },
  competencyType: {
    type: String,
    enum: ['basic', 'organizational', 'leadership', 'minimum']
  }
}, {
  timestamps: true
});

// Pre-save middleware for Candidate
candidateSchema.pre('save', function(next) {
  if (this.dateOfBirth && !this.age) {
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    this.age = age;
  }
  next();
});

// Methods
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

// Updated static methods
userSchema.statics.findRaters = function() {
  return this.find({ userType: 'rater' }).select('-password');
};

// NEW: Find users by vacancy assignment
userSchema.statics.findByVacancyAssignment = function(itemNumber, assignment) {
  return this.find({
    $or: [
      { assignedVacancies: 'all' },
      { assignedVacancies: 'assignment', assignedAssignment: assignment },
      { assignedVacancies: 'specific', assignedItemNumbers: { $in: [itemNumber] } }
    ]
  }).select('-password');
};


candidateSchema.statics.findByItemNumber = function(itemNumber) {
  return this.find({ itemNumber: itemNumber });
};

candidateSchema.statics.findByStatus = function(status) {
  return this.find({ status: status });
};

ratingSchema.statics.findByCandidate = function(candidateId) {
  return this.find({ candidateId: candidateId })
    .populate('raterId', 'name raterType position designation')
    .populate('competencyId', 'name type');
};

ratingSchema.statics.findByRater = function(raterId) {
  return this.find({ raterId: raterId })
    .populate('candidateId', 'fullName itemNumber')
    .populate('competencyId', 'name type');
};

competencySchema.statics.findByType = function(type) {
  return this.find({ type: type });
};

// Updated to handle both single and multiple vacancy assignments
competencySchema.statics.findByVacancy = function(vacancyId) {
  return this.find({
    $or: [
      { vacancyId: vacancyId },
      { vacancyIds: { $in: [vacancyId] } },
      { isFixed: true },
      { $and: [{ vacancyId: { $exists: false } }, { vacancyIds: { $size: 0 } }] }
    ]
  });
};

// Create models
const User = mongoose.model('User', userSchema);
const Vacancy = mongoose.model('Vacancy', vacancySchema);
const Candidate = mongoose.model('Candidate', candidateSchema);
const Competency = mongoose.model('Competency', competencySchema);
const Rating = mongoose.model('Rating', ratingSchema);

export { User, Vacancy, Candidate, Competency, Rating };