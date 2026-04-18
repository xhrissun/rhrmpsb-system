import mongoose from 'mongoose';

// ── Publication Range Schema ───────────────────────────────────────────────────
const publicationRangeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  tags: [{ type: String, trim: true }],
  startDate: { type: Date, required: true },
  endDate:   { type: Date, required: true },
  description: { type: String, trim: true, default: '' },
  isActive:    { type: Boolean, default: true },
  isArchived:  { type: Boolean, default: false },
  archivedAt:  { type: Date },
  archivedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// FIX: Added return so next() is never called twice after an error
publicationRangeSchema.pre('validate', function(next) {
  if (this.endDate <= this.startDate) {
    return next(new Error('End date must be after start date'));
  }
  next();
});

// ── User Schema ───────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:  { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8 },
  userType: { type: String, required: true, enum: ['rater', 'secretariat', 'admin', 'summary_viewer'] },
  raterType: {
    type: String,
    enum: ['Chairperson', 'Vice-Chairperson', 'Regular Member', 'DENREU', 'Gender and Development', 'End-User'],
    required: false
  },
  position:    { type: String, trim: true, default: null },
  designation: { type: String, trim: true, default: null },
  administrativePrivilege: { type: Boolean, default: false },
  assignedVacancies: {
    type: String,
    enum: ['none', 'all', 'assignment', 'specific'],
    default: 'none'
  },
  assignedAssignment:   { type: String, trim: true, default: null },
  assignedItemNumbers:  [{ type: String, trim: true }],
  suspendedItemNumbers: [{ type: String, trim: true }]
}, { timestamps: true });

// ── Vacancy Schema ────────────────────────────────────────────────────────────
const vacancySchema = new mongoose.Schema({
  itemNumber: { type: String, required: true, trim: true },
  position:   { type: String, required: true, trim: true },
  assignment: { type: String, required: true, trim: true },
  salaryGrade: { type: Number, required: true, min: 1, max: 24 },
  qualifications: {
    education:   { type: String, trim: true, default: '' },
    training:    { type: String, trim: true, default: '' },
    experience:  { type: String, trim: true, default: '' },
    eligibility: { type: String, trim: true, default: '' }
  },
  publicationRangeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PublicationRange',
    required: true
  },
  isArchived: { type: Boolean, default: false },
  archivedAt: { type: Date },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Compound index: itemNumber is unique WITHIN a publication range
vacancySchema.index({ itemNumber: 1, publicationRangeId: 1 }, { unique: true });
vacancySchema.index({ publicationRangeId: 1, isArchived: 1 });

// ── Candidate Schema ──────────────────────────────────────────────────────────
const candidateSchema = new mongoose.Schema({
  fullName:   { type: String, required: true, trim: true },
  itemNumber: { type: String, required: true, trim: true },
  gender: {
    type: String,
    required: true,
    enum: ['Male', 'Female', 'MALE/LALAKI', 'FEMALE/BABAE', 'LGBTQI+']
  },
  dateOfBirth: { type: Date },
  age:         { type: Number },
  eligibility:            { type: String, trim: true, default: '' },
  professionalLicense:    { type: String, trim: true, default: '' },
  letterOfIntent:         { type: String, trim: true, default: '' },
  personalDataSheet:      { type: String, trim: true, default: '' },
  workExperienceSheet:    { type: String, trim: true, default: '' },
  proofOfEligibility:     { type: String, trim: true, default: '' },
  certificates:           { type: String, trim: true, default: '' },
  ipcr:                   { type: String, trim: true, default: '' },
  certificateOfEmployment:{ type: String, trim: true, default: '' },
  diploma:                { type: String, trim: true, default: '' },
  transcriptOfRecords:    { type: String, trim: true, default: '' },
  status: {
    type: String,
    enum: ['general_list', 'long_list', 'disqualified', 'for_review'],
    default: 'general_list'
  },
  comments: {
    education:   { type: String, default: '' },
    training:    { type: String, default: '' },
    experience:  { type: String, default: '' },
    eligibility: { type: String, default: '' }
  },
  commentsHistory: [{
    field: {
      type: String,
      enum: ['education', 'training', 'experience', 'eligibility'],
      required: true
    },
    comment:     { type: String, required: true },
    status:      { type: String, enum: ['general_list', 'long_list', 'for_review', 'disqualified'] },
    commentedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    commentedAt: { type: Date, default: Date.now }
  }],
  statusHistory: [{
    oldStatus: { type: String, enum: ['general_list', 'long_list', 'for_review', 'disqualified'] },
    newStatus: { type: String, enum: ['general_list', 'long_list', 'for_review', 'disqualified'], required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
    reason:    { type: String, default: '' }
  }],
  publicationRangeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PublicationRange',
    required: true
  },
  governmentEmployment: {
    agency:   { type: String, trim: true, default: '' },
    position: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['', 'Permanent', 'Casual', 'Temporary', 'Co-terminus with the incumbent', 'Contractual-PS', 'Contractual'],
      default: ''
    },
    employmentPeriod: {
      type: String,
      enum: ['', 'present', 'within_2_years'],
      default: ''
    },
    // End date of employment — required when employmentPeriod is 'within_2_years'
    // Stored as Date; audited on the client against the publication range endDate.
    employmentEndDate: { type: Date, default: null },
    preAssessmentExam: {
      type: String,
      enum: ['', 'more_than_6_months', 'less_than_6_months'],
      default: ''
    },
    remarks:  { type: String, trim: true, default: '' },
    // Track which secretariat user last saved this record so the modal can
    // show "Data entered by <name>" on sibling rows.
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastUpdatedAt: { type: Date, default: null }
  },
  isLateApplicant: { type: Boolean, default: false },
  isArchived: { type: Boolean, default: false },
  archivedAt: { type: Date },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Shared age calculator
const computeAge = (dob) => {
  if (!dob) return null;
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

// Always recompute age from dateOfBirth on save (never trust the stored value)
candidateSchema.pre('save', function(next) {
  if (this.dateOfBirth) this.age = computeAge(this.dateOfBirth);
  next();
});

// Always recompute age from dateOfBirth on findOneAndUpdate
const calcAge = function(next) {
  const update = this.getUpdate();
  const dob = update?.$set?.dateOfBirth || update?.dateOfBirth;
  if (dob) {
    const age = computeAge(dob);
    if (update.$set) update.$set.age = age;
    else update.age = age;
  }
  next();
};
candidateSchema.pre('findOneAndUpdate', calcAge);

// Virtual: compute age live from dateOfBirth at read time so stale DB
// values (including null) never reach the client as N/A.
candidateSchema.virtual('computedAge').get(function() {
  return computeAge(this.dateOfBirth);
});

// Override toJSON so that `age` is always the live-computed value when
// dateOfBirth is present, falling back to the stored value only if no dob.
// PERF: Short-circuit when the stored age was already written this calendar year
// (pre('save') and pre('findOneAndUpdate') hooks keep it current) to avoid
// redundant Date arithmetic on every serialization, e.g. bulk CSV exports.
candidateSchema.set('toJSON', {
  virtuals: false,
  transform(doc, ret) {
    if (ret.dateOfBirth) {
      const storedYear = ret.updatedAt ? new Date(ret.updatedAt).getFullYear() : null;
      if (storedYear && storedYear === new Date().getFullYear() && ret.age != null) {
        return ret;
      }
      ret.age = computeAge(ret.dateOfBirth);
    }
    return ret;
  }
});

// ── Competency Schema ─────────────────────────────────────────────────────────
const competencySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true, enum: ['basic', 'organizational', 'leadership', 'minimum'] },
  vacancyId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Vacancy' },
  vacancyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vacancy' }],
  isFixed:    { type: Boolean, default: false },
  isArchived: { type: Boolean, default: false },
  archivedAt: { type: Date },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// ── Rating Schema ─────────────────────────────────────────────────────────────
const ratingSchema = new mongoose.Schema({
  candidateId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
  competencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Competency', required: true },
  raterId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  score:        { type: Number, required: true, min: 1, max: 5 },
  interviewDate: { type: Date, default: Date.now },
  competencyType: { type: String, enum: ['basic', 'organizational', 'leadership', 'minimum'] },
  itemNumber:   { type: String, required: true, trim: true },
  auditLog: [{
    action:      { type: String, enum: ['created', 'updated', 'deleted'], required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    performedAt: { type: Date, default: Date.now },
    oldScore:    { type: Number, min: 1, max: 5 },
    newScore:    { type: Number, min: 1, max: 5 },
    ipAddress:   String,
    userAgent:   String
  }]
}, { timestamps: true });

// ── Rating Audit Log Schema ───────────────────────────────────────────────────
const ratingLogSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['created', 'updated', 'deleted', 'batch_created', 'batch_updated', 'batch_deleted'],
    required: true
  },
  ratingId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Rating' },
  candidateId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
  raterId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  itemNumber:    { type: String, required: true, trim: true },
  competencyId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Competency' },
  competencyType:{ type: String, enum: ['basic', 'organizational', 'leadership', 'minimum'] },
  oldScore:      { type: Number, min: 1, max: 5 },
  newScore:      { type: Number, min: 1, max: 5 },
  ratingsCount:  { type: Number, default: 1 },
  performedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ipAddress: String,
  userAgent: String,
  notes: String
}, { timestamps: true });

// ── Notification Log Schema ───────────────────────────────────────────────────
// Stores ISG bell-panel notifications persistently.
// Each document mirrors the shape that InterviewSummaryGeneratorV2 already
// renders, so the frontend needs no changes beyond the API call.
const notificationLogSchema = new mongoose.Schema({
  // Who/what triggered the notification (mirrors RatingLog fields the ISG uses)
  action: {
    type: String,
    enum: ['created', 'updated', 'deleted', 'batch_created', 'batch_updated', 'batch_deleted'],
    required: true
  },
  ratingId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Rating' },
  candidateId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
  raterId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  itemNumber:    { type: String, required: true, trim: true },
  competencyId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Competency' },
  competencyType:{ type: String, enum: ['basic', 'organizational', 'leadership', 'minimum'] },
  oldScore:      { type: Number, min: 1, max: 5 },
  newScore:      { type: Number, min: 1, max: 5 },
  ratingsCount:  { type: Number, default: 1 },
  performedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notes: String,

  // Keep the last 500 notifications; older ones auto-expire after 30 days
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
}, { timestamps: true });

notificationLogSchema.index({ createdAt: -1 });
notificationLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// ── Interview Session Schema ──────────────────────────────────────────────────
// One document per (rater × candidate × itemNumber) interview sitting.
// Created/updated automatically when ratings are submitted.
const interviewSessionSchema = new mongoose.Schema({
  raterId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',      required: true },
  candidateId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
  itemNumber:   { type: String, required: true, trim: true },

  // Timer data
  elapsedMs:      { type: Number, default: 0, min: 0 },   // actual time elapsed (ms)
  totalDurationMs:{ type: Number, default: 0, min: 0 },   // configured duration incl. extensions
  extensionCount: { type: Number, default: 0, min: 0 },   // how many +5 min adds were made
  timerCompleted: { type: Boolean, default: false },       // true if timer ran to zero

  // Rater's quick notes
  notes: { type: String, trim: true, default: '' },

  // When the interview actually started / finished (wall-clock)
  interviewStartedAt: { type: Date },
  interviewEndedAt:   { type: Date },
}, { timestamps: true });

// ── PDF Cache Schema ──────────────────────────────────────────────────────────
// Server-side cache for parsed PDF competency data.
// Avoids re-parsing on every server restart.
const pdfCacheSchema = new mongoose.Schema({
  fingerprint: { type: String, required: true, unique: true, index: true },
  schemaVersion: { type: Number, default: 1 },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  cachedAt: { type: Date, default: Date.now },
  source: { type: String, default: 'server' },
  // FIX: TTL field — stale entries auto-expire after 30 days
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
}, { timestamps: true });
// TTL index: MongoDB auto-deletes when expiresAt is reached
pdfCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// One session per rater+candidate+item sitting
interviewSessionSchema.index(
  { raterId: 1, candidateId: 1, itemNumber: 1 },
  { unique: true }
);
interviewSessionSchema.index({ candidateId: 1 });
interviewSessionSchema.index({ raterId: 1, createdAt: -1 });

// ── Indexes ───────────────────────────────────────────────────────────────────
publicationRangeSchema.index({ isArchived: 1, isActive: 1 });
publicationRangeSchema.index({ startDate: 1, endDate: 1 });

userSchema.index({ raterType: 1 });

candidateSchema.index({ publicationRangeId: 1, isArchived: 1, status: 1 });
candidateSchema.index({ itemNumber: 1, publicationRangeId: 1 });
candidateSchema.index({ itemNumber: 1 });

competencySchema.index({ isFixed: 1 });

ratingSchema.index({ candidateId: 1 });
ratingSchema.index({ itemNumber: 1, raterId: 1, candidateId: 1 }, { unique: true });
ratingSchema.index({ itemNumber: 1, candidateId: 1 }); // board batch query: fetch all ratings for a set of candidates in one item

ratingLogSchema.index({ candidateId: 1, createdAt: -1 });
ratingLogSchema.index({ raterId: 1, createdAt: -1 });
ratingLogSchema.index({ itemNumber: 1, createdAt: -1 });
ratingLogSchema.index({ action: 1, createdAt: -1 });

// ── Methods ───────────────────────────────────────────────────────────────────
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

userSchema.statics.findRaters = function() {
  return this.find({ userType: 'rater' }).select('-password');
};

userSchema.statics.findSecretariats = function() {
  return this.find({ userType: 'secretariat' }).select('-password');
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
  return this.find({ itemNumber });
};
candidateSchema.statics.findByStatus = function(status) {
  return this.find({ status });
};
candidateSchema.statics.findByPublicationRange = function(publicationRangeId, includeArchived = false) {
  const query = { publicationRangeId };
  if (!includeArchived) query.isArchived = false;
  return this.find(query);
};

ratingSchema.statics.findByCandidate = function(candidateId) {
  return this.find({ candidateId })
    .populate('raterId', 'name raterType position designation')
    .populate('competencyId', 'name type');
};
ratingSchema.statics.findByRater = function(raterId) {
  return this.find({ raterId })
    .populate('candidateId', 'fullName itemNumber')
    .populate('competencyId', 'name type');
};
ratingSchema.statics.findByCandidateAndItem = function(candidateId, itemNumber) {
  return this.find({ candidateId, itemNumber })
    .populate('raterId', 'name raterType position designation')
    .populate('competencyId', 'name type');
};

competencySchema.statics.findByType = function(type) {
  return this.find({ type });
};
competencySchema.statics.findByVacancy = function(vacancyId) {
  return this.find({
    isArchived: { $ne: true },
    $or: [
      { vacancyId },
      { vacancyIds: { $exists: true, $ne: [], $in: [vacancyId] } },
      { isFixed: true }
    ]
  });
};

publicationRangeSchema.statics.findActive = function() {
  return this.find({ isActive: true, isArchived: false });
};
publicationRangeSchema.statics.findArchived = function() {
  return this.find({ isArchived: true });
};

// ── Create models ─────────────────────────────────────────────────────────────
const User            = mongoose.model('User',             userSchema);
const Vacancy         = mongoose.model('Vacancy',          vacancySchema);
const Candidate       = mongoose.model('Candidate',        candidateSchema);
const Competency      = mongoose.model('Competency',       competencySchema);
const Rating          = mongoose.model('Rating',           ratingSchema);
const RatingLog       = mongoose.model('RatingLog',        ratingLogSchema);
const PublicationRange= mongoose.model('PublicationRange', publicationRangeSchema);
const NotificationLog = mongoose.model('NotificationLog',  notificationLogSchema);
const InterviewSession = mongoose.model('InterviewSession', interviewSessionSchema);
const PDFCache        = mongoose.model('PDFCache',         pdfCacheSchema);

export { User, Vacancy, Candidate, Competency, Rating, RatingLog, PublicationRange, NotificationLog, InterviewSession, PDFCache };