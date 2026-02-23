import mongoose from 'mongoose';

// NEW: Publication Range Schema
const publicationRangeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date
  },
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Validation: endDate must be after startDate
publicationRangeSchema.pre('validate', function(next) {
  if (this.endDate <= this.startDate) {
    next(new Error('End date must be after start date'));
  }
  next();
});

// Updated User Schema
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
  assignedVacancies: {
    type: String,
    enum: ['none', 'all', 'assignment', 'specific'],
    default: 'none'
  },
  assignedAssignment: {
    type: String,
    trim: true,
    default: null
  },
  assignedItemNumbers: [{
    type: String,
    trim: true
  }],
  suspendedItemNumbers: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

// Updated Vacancy Schema with Publication Range
const vacancySchema = new mongoose.Schema({
  itemNumber: {
    type: String,
    required: true,
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
  },
  // NEW: Publication Range Reference
  publicationRangeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PublicationRange',
    required: true
  },
  // NEW: Archiving fields
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date
  },
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound index: itemNumber is unique WITHIN a publication range
vacancySchema.index({ itemNumber: 1, publicationRangeId: 1 }, { unique: true });

// Updated Candidate Schema with Publication Range
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
    enum: ['Male', 'Female', 'MALE/LALAKI', 'FEMALE/BABAE', 'LGBTQI+']
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
  },
  commentsHistory: [{
    field: { 
      type: String, 
      enum: ['education', 'training', 'experience', 'eligibility'],
      required: true 
    },
    comment: { 
      type: String, 
      required: true 
    },
    status: { 
      type: String, 
      enum: ['general_list', 'long_list', 'for_review', 'disqualified']
    },
    commentedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User',
      required: true 
    },
    commentedAt: { 
      type: Date, 
      default: Date.now 
    }
  }],
  statusHistory: [{
    oldStatus: { 
      type: String, 
      enum: ['general_list', 'long_list', 'for_review', 'disqualified']
    },
    newStatus: { 
      type: String, 
      enum: ['general_list', 'long_list', 'for_review', 'disqualified'],
      required: true
    },
    changedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User',
      required: true 
    },
    changedAt: { 
      type: Date, 
      default: Date.now 
    },
    reason: {
      type: String,
      default: ''
    }
  }],
  // NEW: Publication Range Reference
  publicationRangeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PublicationRange',
    required: true
  },
  // NEW: Archiving fields
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date
  },
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Competency Schema (unchanged - still links to item numbers)
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

// Rating Schema (unchanged)
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
  },
  itemNumber: {
    type: String,
    required: true,
    trim: true
  },
  auditLog: [{
    action: {
      type: String,
      enum: ['created', 'updated', 'deleted'],
      required: true
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    performedAt: {
      type: Date,
      default: Date.now
    },
    oldScore: {
      type: Number,
      min: 1,
      max: 5
    },
    newScore: {
      type: Number,
      min: 1,
      max: 5
    },
    ipAddress: String,
    userAgent: String
  }]
}, {
  timestamps: true
});

// Rating Audit Log Schema (unchanged)
const ratingLogSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['created', 'updated', 'deleted', 'batch_created', 'batch_updated', 'batch_deleted'],
    required: true
  },
  ratingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rating'
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate',
    required: true
  },
  raterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  itemNumber: {
    type: String,
    required: true,
    trim: true
  },
  competencyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competency'
  },
  competencyType: {
    type: String,
    enum: ['basic', 'organizational', 'leadership', 'minimum']
  },
  oldScore: {
    type: Number,
    min: 1,
    max: 5
  },
  newScore: {
    type: Number,
    min: 1,
    max: 5
  },
  ratingsCount: {
    type: Number,
    default: 1
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ipAddress: String,
  userAgent: String,
  notes: String
}, {
  timestamps: true
});

// Add indexes
ratingLogSchema.index({ candidateId: 1, createdAt: -1 });
ratingLogSchema.index({ raterId: 1, createdAt: -1 });
ratingLogSchema.index({ itemNumber: 1, createdAt: -1 });
ratingLogSchema.index({ action: 1, createdAt: -1 });

publicationRangeSchema.index({ isArchived: 1, isActive: 1 });
vacancySchema.index({ publicationRangeId: 1, isArchived: 1 });
candidateSchema.index({ publicationRangeId: 1, isArchived: 1 });
candidateSchema.index({ itemNumber: 1, publicationRangeId: 1 });
ratingSchema.index({ itemNumber: 1, raterId: 1, candidateId: 1 }, { unique: true });

// Pre-save middleware
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

userSchema.statics.findRaters = function() {
  return this.find({ userType: 'rater' }).select('-password');
};

userSchema.statics.findByVacancyAssignment = function(itemNumber, assignment) {
  return this.find({
    assignedVacancies: { $ne: 'none' },
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

// NEW: Find active (non-archived) candidates by publication range
candidateSchema.statics.findByPublicationRange = function(publicationRangeId, includeArchived = false) {
  const query = { publicationRangeId };
  if (!includeArchived) {
    query.isArchived = false;
  }
  return this.find(query);
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

ratingSchema.statics.findByCandidateAndItem = function(candidateId, itemNumber) {
  return this.find({ 
    candidateId: candidateId,
    itemNumber: itemNumber 
  })
    .populate('raterId', 'name raterType position designation')
    .populate('competencyId', 'name type');
};

competencySchema.statics.findByType = function(type) {
  return this.find({ type: type });
};

competencySchema.statics.findByVacancy = function (vacancyId) {
  return this.find({
    $or: [
      { vacancyId: vacancyId },
      { vacancyIds: { $exists: true, $ne: [], $in: [vacancyId] } },
      { isFixed: true }
    ]
  });
};

// NEW: Publication Range static methods
publicationRangeSchema.statics.findActive = function() {
  return this.find({ isActive: true, isArchived: false });
};

publicationRangeSchema.statics.findArchived = function() {
  return this.find({ isArchived: true });
};

// Create models
const User = mongoose.model('User', userSchema);
const Vacancy = mongoose.model('Vacancy', vacancySchema);
const Candidate = mongoose.model('Candidate', candidateSchema);
const Competency = mongoose.model('Competency', competencySchema);
const Rating = mongoose.model('Rating', ratingSchema);
const RatingLog = mongoose.model('RatingLog', ratingLogSchema);
const PublicationRange = mongoose.model('PublicationRange', publicationRangeSchema);

// Add these indexes at the end of the models.js file, before the exports:

publicationRangeSchema.index({ isArchived: 1, isActive: 1 });
publicationRangeSchema.index({ startDate: 1, endDate: 1 });
vacancySchema.index({ publicationRangeId: 1, isArchived: 1 });
candidateSchema.index({ publicationRangeId: 1, isArchived: 1, status: 1 });

export { User, Vacancy, Candidate, Competency, Rating, RatingLog, PublicationRange };
