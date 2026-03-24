import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { parse } from 'csv-parse/sync';
import rateLimit from 'express-rate-limit';
import { User, Vacancy, Candidate, Competency, Rating, RatingLog, PublicationRange } from './models.js';

const router = express.Router();

// ── Auth rate limiter ─────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please wait 15 minutes before trying again.' }
});

// F-15 FIX: Stricter limiter for bulk export/report endpoints — prevents data exfiltration loops.
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many export requests. Please wait 15 minutes before trying again.' }
});

// ── Authentication middleware ─────────────────────────────────────────────────
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'Invalid token' });
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// ── Shared CSV escape utility (DRY - was duplicated 4x) ──────────────────────
const escapeCsvValue = (value) => {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

// ── CSV parser ────────────────────────────────────────────────────────────────
const parseCSV = (buffer) => {
  try {
    // FIX: Validate file is text before parsing
    const csvString = buffer
      .toString('utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\uFEFF/g, '')
      .trim();
    return parse(csvString, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
      cast: (value) => (typeof value === 'string' ? value.trim() : value),
    });
  } catch (error) {
    throw new Error('Failed to parse CSV: ' + error.message);
  }
};

// ── CSV file type validation ──────────────────────────────────────────────────
const validateCsvFile = (file) => {
  const allowedMimes = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'];
  const isValidMime = allowedMimes.some(m => file.mimetype.includes(m));
  const isValidName = file.name.toLowerCase().endsWith('.csv');
  if (!isValidMime && !isValidName) {
    throw new Error('Only CSV files are accepted.');
  }
};

// ── Fuzzy-match helpers ───────────────────────────────────────────────────────
const normalizeCompetencyName = (name) =>
  name.trim().toUpperCase().replace(/\s+/g, ' ').replace(/[^A-Z0-9\s()\/]/g, '').trim();

const stringSimilarity = (a, b) => {
  const na = normalizeCompetencyName(a);
  const nb = normalizeCompetencyName(b);
  if (na === nb) return 1.0;
  const longer  = na.length >= nb.length ? na : nb;
  const shorter = na.length >= nb.length ? nb : na;
  if (longer.length === 0) return 1.0;
  const m = Array.from({ length: shorter.length + 1 }, (_, i) =>
    Array.from({ length: longer.length + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= shorter.length; i++) {
    for (let j = 1; j <= longer.length; j++) {
      m[i][j] = shorter[i-1] === longer[j-1]
        ? m[i-1][j-1]
        : 1 + Math.min(m[i-1][j-1], m[i][j-1], m[i-1][j]);
    }
  }
  return (longer.length - m[shorter.length][longer.length]) / longer.length;
};

const SIMILARITY_THRESHOLD = 0.85;

// ── In-memory upload log store ────────────────────────────────────────────────
// NOTE: These logs are cleared on server restart. For production persistence,
// consider migrating to a MongoDB collection with a TTL index.
const _uploadLogs = {};

const pruneOldLogs = () => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const key of Object.keys(_uploadLogs)) {
    if (_uploadLogs[key].uploadedAt.getTime() < cutoff) delete _uploadLogs[key];
  }
};

// ── User input allowlist for update ──────────────────────────────────────────
const USER_UPDATE_ALLOWED = [
  'name', 'email', 'userType', 'raterType', 'position', 'designation',
  'administrativePrivilege', 'assignedVacancies', 'assignedAssignment', 'assignedItemNumbers'
];

// F-06 FIX: Allowlists for vacancy and competency updates — prevent mass assignment.
const VACANCY_CREATE_ALLOWED = [
  'itemNumber', 'position', 'assignment', 'salaryGrade', 'qualifications', 'publicationRangeId'
];
const VACANCY_UPDATE_ALLOWED = [
  'itemNumber', 'position', 'assignment', 'salaryGrade', 'qualifications'
];
const COMPETENCY_WRITE_ALLOWED = [
  'name', 'type', 'vacancyId', 'vacancyIds', 'isFixed'
];


// ═══════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.post('/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: user.toJSON() });
  } catch (error) {
    console.error('[POST /auth/login]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/auth/me', authMiddleware, async (req, res) => {
  res.json(req.user);
});

router.post('/auth/verify-password', authLimiter, authMiddleware, async (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) {
    return res.status(400).json({ message: 'userId and password are required' });
  }
  if (req.user._id.toString() !== userId && req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const isMatch = await bcrypt.compare(password, user.password);
    res.json({ isValid: isMatch });
  } catch (error) {
    console.error('[POST /auth/verify-password]', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// USER ROUTES
// Order: static paths first, then /:id last
// ═══════════════════════════════════════════════════════════════════════════

router.get('/users', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    console.error('[GET /users]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/users/raters', authMiddleware, async (req, res) => {
  // F-08 FIX: Admin gets full rater objects (including _id for management).
  // Non-admin (secretariat) gets assignment fields needed for vacancy filtering
  // but NOT _id, password, or other sensitive fields that could enable IDOR attacks.
  try {
    const raters = await User.findRaters();
    if (req.user.userType !== 'admin') {
      return res.json(raters.map(r => ({
        name: r.name,
        raterType: r.raterType,
        userType: r.userType,
        assignedVacancies: r.assignedVacancies,
        assignedAssignment: r.assignedAssignment,
        assignedItemNumbers: r.assignedItemNumbers,
      })));
    }
    res.json(raters);
  } catch (error) {
    console.error('[GET /users/raters]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/users', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const { name, email, password, userType, raterType, position, designation, administrativePrivilege } = req.body;
    if (!name || !email || !password || !userType) {
      return res.status(400).json({ message: 'Missing required fields: name, email, password, userType' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }
    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) return res.status(400).json({ message: 'User with this email already exists' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const userData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      userType,
      administrativePrivilege: administrativePrivilege || false
    };
    if (raterType && raterType.trim() !== '') userData.raterType = raterType.trim();
    if (position && position.trim() !== '') userData.position = position.trim();
    if (designation && designation.trim() !== '') userData.designation = designation.trim();

    const user = new User(userData);
    await user.save();
    res.status(201).json(user.toJSON());
  } catch (error) {
    console.error('[POST /users]', error);
    if (error.code === 11000) return res.status(400).json({ message: 'User with this email already exists' });
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation error: ' + messages.join(', ') });
    }
    res.status(500).json({ message: 'Server error during user creation' });
  }
});

router.post('/users/:userId/assign-vacancies', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const { assignmentType, assignedAssignment, assignedItemNumbers } = req.body;
    if (!['none', 'all', 'assignment', 'specific'].includes(assignmentType)) {
      return res.status(400).json({ message: 'Invalid assignment type' });
    }
    const updateData = { assignedVacancies: assignmentType, assignedAssignment: null, assignedItemNumbers: [] };
    if (assignmentType === 'assignment') {
      if (!assignedAssignment || assignedAssignment.trim() === '') {
        return res.status(400).json({ message: 'Assignment is required for assignment-based allocation' });
      }
      updateData.assignedAssignment = assignedAssignment.trim();
    } else if (assignmentType === 'specific') {
      if (!assignedItemNumbers || assignedItemNumbers.length === 0) {
        return res.status(400).json({ message: 'At least one item number is required for specific allocation' });
      }
      updateData.assignedItemNumbers = assignedItemNumbers.filter(item => item && item.trim() !== '');
    }
    const user = await User.findByIdAndUpdate(req.params.userId, updateData, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Vacancy assignment updated successfully', user });
  } catch (error) {
    console.error('[POST /users/:userId/assign-vacancies]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.get('/users/:userId/assigned-vacancies', authMiddleware, async (req, res) => {
  // F-05 FIX: A user may only query their own assignments; admins can query any user.
  const isOwner = req.user._id.toString() === req.params.userId;
  const isAdmin = req.user.userType === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Access denied' });
  try {
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    let assignedVacancies = [];
    if (user.assignedVacancies === 'all') {
      assignedVacancies = await Vacancy.find();
    } else if (user.assignedVacancies === 'assignment' && user.assignedAssignment) {
      assignedVacancies = await Vacancy.find({ assignment: user.assignedAssignment });
    } else if (user.assignedVacancies === 'specific' && user.assignedItemNumbers.length > 0) {
      assignedVacancies = await Vacancy.find({ itemNumber: { $in: user.assignedItemNumbers } });
    }
    res.json({
      user: {
        id: user._id, name: user.name,
        assignedVacancies: user.assignedVacancies,
        assignedAssignment: user.assignedAssignment,
        assignedItemNumbers: user.assignedItemNumbers
      },
      vacancies: assignedVacancies
    });
  } catch (error) {
    console.error('[GET /users/:userId/assigned-vacancies]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

// Self-service password change — uses /auth/ namespace to avoid any
// collision with the /users/:id pattern entirely.
router.put('/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword) return res.status(400).json({ message: 'Current password is required' });
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters long' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password must be different from current password' });
    }
    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Current password is incorrect' });
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await User.findByIdAndUpdate(req.user._id, { password: hashedPassword });
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('[PUT /auth/change-password]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

// Admin-only: change any user's password by ID
router.put('/users/:id/change-password', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await User.findByIdAndUpdate(req.params.id, { password: hashedPassword });
    res.json({ message: `Password updated successfully for ${user.name}`, userName: user.name });
  } catch (error) {
    console.error('[PUT /users/:id/change-password]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

// /:id routes LAST for users
router.put('/users/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    // FIX: Only allow whitelisted fields to prevent arbitrary field injection
    const updateData = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => USER_UPDATE_ALLOWED.includes(k))
    );
    if (updateData.assignedVacancies === 'all') {
      updateData.assignedAssignment = null;
      updateData.assignedItemNumbers = [];
    } else if (updateData.assignedVacancies === 'assignment') {
      updateData.assignedItemNumbers = [];
    } else if (updateData.assignedVacancies === 'specific') {
      updateData.assignedAssignment = null;
    }
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error('[PUT /users/:id]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.delete('/users/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('[DELETE /users/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// VACANCY ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/vacancies', authMiddleware, async (req, res) => {
  try {
    const vacancies = await Vacancy.find();
    res.json(vacancies);
  } catch (error) {
    console.error('[GET /vacancies]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/vacancies/assignments', authMiddleware, async (req, res) => {
  try {
    const vacancies = await Vacancy.find({}, 'assignment').lean();
    if (vacancies.length === 0) return res.json([]);
    const assignments = [...new Set(
      vacancies.map(v => v.assignment).filter(a => a && a.trim() !== '').map(a => a.trim())
    )].sort();
    res.json(assignments);
  } catch (error) {
    console.error('[GET /vacancies/assignments]', error);
    res.status(500).json({ message: 'Failed to fetch assignments', error: error.message });
  }
});

router.get('/vacancies/by-publication/:publicationRangeId', authMiddleware, async (req, res) => {
  try {
    const { includeArchived = 'false' } = req.query;
    const query = { publicationRangeId: req.params.publicationRangeId };
    if (includeArchived === 'false') query.isArchived = false;
    const vacancies = await Vacancy.find(query).sort({ itemNumber: 1 });
    res.json(vacancies);
  } catch (error) {
    console.error('[GET /vacancies/by-publication]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.post('/vacancies/undo-import/:publicationRangeId', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    // F-12 FIX: Clamp minutesAgo to 1–60 — prevents wiping historically old records.
    const raw = parseInt(req.body.minutesAgo) || 5;
    const minutesAgo = Math.min(Math.max(raw, 1), 60);
    const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000);
    const result = await Vacancy.deleteMany({
      publicationRangeId: req.params.publicationRangeId,
      createdAt: { $gte: cutoffTime },
      isArchived: false,
    });
    res.json({
      message: `Undo successful: Deleted ${result.deletedCount} recently imported vacancies`,
      deletedCount: result.deletedCount,
      cutoffTime,
    });
  } catch (error) {
    console.error('[POST /vacancies/undo-import]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.post('/vacancies/upload-csv/:publicationRangeId', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    if (!req.files || !req.files.csv) return res.status(400).json({ message: 'No file uploaded' });

    // FIX: Validate file type
    try { validateCsvFile(req.files.csv); } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    const publicationRange = await PublicationRange.findById(req.params.publicationRangeId);
    if (!publicationRange) return res.status(404).json({ message: 'Publication range not found' });
    if (publicationRange.isArchived) {
      return res.status(400).json({ message: 'Cannot import to archived publication range' });
    }

    const vacanciesData = parseCSV(req.files.csv.data);

    // Validate required fields first — give clear error instead of crashing
    const invalidRows = [];
    const validRows   = [];
    vacanciesData.forEach((vacancy, index) => {
      const missing = [];
      if (!vacancy.itemNumber || !vacancy.itemNumber.trim()) missing.push('itemNumber');
      if (!vacancy.position   || !vacancy.position.trim())   missing.push('position');
      if (!vacancy.assignment || !vacancy.assignment.trim())  missing.push('assignment');
      if (missing.length > 0) {
        invalidRows.push({ row: index + 2, missingFields: missing });
      } else {
        validRows.push(vacancy);
      }
    });

    if (invalidRows.length > 0) {
      return res.status(400).json({
        message: `${invalidRows.length} row(s) are missing required fields`,
        invalidRows,
        hint: 'Required columns: itemNumber, position, assignment'
      });
    }

    const processedVacancies = validRows.map(vacancy => ({
      itemNumber: vacancy.itemNumber.trim(),
      position:   vacancy.position.trim(),
      assignment: vacancy.assignment.trim(),
      salaryGrade: Number(vacancy.salaryGrade) || 1,
      publicationRangeId: publicationRange._id,
      qualifications: {
        education:   vacancy.education   || '',
        training:    vacancy.training    || '',
        experience:  vacancy.experience  || '',
        eligibility: vacancy.eligibility || ''
      }
    }));

    const existingItemNumbers = await Vacancy.find({
      publicationRangeId: publicationRange._id, isArchived: false
    }).distinct('itemNumber');
    const existingSet = new Set(existingItemNumbers);
    const duplicates  = processedVacancies.filter(v => existingSet.has(v.itemNumber));
    if (duplicates.length > 0) {
      return res.status(400).json({
        message: 'Duplicate item numbers found in this publication range',
        duplicates: duplicates.map(d => d.itemNumber)
      });
    }

    // Batch lookup — single query instead of one per row
    const itemNums = processedVacancies.map(v => v.itemNumber);
    const archivedVacancies = await Vacancy.find({
      itemNumber: { $in: itemNums },
      publicationRangeId: publicationRange._id,
      isArchived: true
    });
    const archivedMap = new Map(archivedVacancies.map(v => [v.itemNumber, v]));

    const unarchived = [];
    const toInsert   = [];

    for (const v of processedVacancies) {
      const archivedVacancy = archivedMap.get(v.itemNumber);
      if (archivedVacancy) {
        await Vacancy.findByIdAndUpdate(archivedVacancy._id, {
          isArchived: false, archivedAt: null, archivedBy: null
        });
        await Competency.updateMany(
          { $or: [{ vacancyId: archivedVacancy._id }, { vacancyIds: archivedVacancy._id }] },
          { $set: { isArchived: false, archivedAt: null, archivedBy: null } }
        );
        unarchived.push(v.itemNumber);
      } else {
        toInsert.push(v);
      }
    }

    if (toInsert.length > 0) await Vacancy.insertMany(toInsert);

    res.json({
      message: `Vacancies uploaded successfully. ${toInsert.length} created, ${unarchived.length} unarchived.`,
      created: toInsert.length, unarchived: unarchived.length, unarchivedItemNumbers: unarchived
    });
  } catch (error) {
    console.error('[POST /vacancies/upload-csv]', error);
    res.status(500).json({ message: 'Failed to upload CSV: ' + error.message });
  }
});

router.get('/vacancies/:id', authMiddleware, async (req, res) => {
  try {
    const vacancy = await Vacancy.findById(req.params.id);
    if (!vacancy) return res.status(404).json({ message: 'Vacancy not found' });
    res.json(vacancy);
  } catch (error) {
    console.error('[GET /vacancies/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/vacancies', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    // F-06 FIX: Only allowlisted fields accepted — no mass assignment.
    const vacancyData = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => VACANCY_CREATE_ALLOWED.includes(k))
    );
    vacancyData.qualifications = {
      education:   req.body.qualifications?.education   || '',
      training:    req.body.qualifications?.training    || '',
      experience:  req.body.qualifications?.experience  || '',
      eligibility: req.body.qualifications?.eligibility || ''
    };
    const vacancy = new Vacancy(vacancyData);
    await vacancy.save();
    res.json(vacancy);
  } catch (error) {
    console.error('[POST /vacancies]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/vacancies/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    // F-06 FIX: Only allowlisted fields accepted — no mass assignment.
    const updateData = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => VACANCY_UPDATE_ALLOWED.includes(k))
    );
    if (req.body.qualifications) {
      updateData.qualifications = {
        education:   req.body.qualifications?.education   || '',
        training:    req.body.qualifications?.training    || '',
        experience:  req.body.qualifications?.experience  || '',
        eligibility: req.body.qualifications?.eligibility || ''
      };
    }
    const vacancy = await Vacancy.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!vacancy) return res.status(404).json({ message: 'Vacancy not found' });
    res.json(vacancy);
  } catch (error) {
    console.error('[PUT /vacancies/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/vacancies/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const vacancy = await Vacancy.findByIdAndDelete(req.params.id);
    if (!vacancy) return res.status(404).json({ message: 'Vacancy not found' });
    res.json({ message: 'Vacancy deleted' });
  } catch (error) {
    console.error('[DELETE /vacancies/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/vacancies/:vacancyId/clone-to-publication/:publicationRangeId', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const sourceVacancy = await Vacancy.findById(req.params.vacancyId);
    if (!sourceVacancy) return res.status(404).json({ message: 'Source vacancy not found' });
    const targetPublicationRange = await PublicationRange.findById(req.params.publicationRangeId);
    if (!targetPublicationRange) return res.status(404).json({ message: 'Target publication range not found' });
    if (targetPublicationRange.isArchived) {
      return res.status(400).json({ message: 'Cannot clone to archived publication range' });
    }
    const existingVacancy = await Vacancy.findOne({
      itemNumber: sourceVacancy.itemNumber,
      publicationRangeId: targetPublicationRange._id,
      isArchived: false
    });
    if (existingVacancy) {
      return res.status(400).json({
        message: `Vacancy with item number ${sourceVacancy.itemNumber} already exists in ${targetPublicationRange.name}`
      });
    }
    const clonedVacancy = new Vacancy({
      itemNumber: sourceVacancy.itemNumber,
      position:   sourceVacancy.position,
      assignment: sourceVacancy.assignment,
      salaryGrade: sourceVacancy.salaryGrade,
      publicationRangeId: targetPublicationRange._id,
      qualifications: {
        education:   sourceVacancy.qualifications?.education   || '',
        training:    sourceVacancy.qualifications?.training    || '',
        experience:  sourceVacancy.qualifications?.experience  || '',
        eligibility: sourceVacancy.qualifications?.eligibility || ''
      },
      isArchived: false, archivedAt: null, archivedBy: null
    });
    await clonedVacancy.save();

    const sourceCompetencies = await Competency.find({
      $or: [{ vacancyId: sourceVacancy._id }, { vacancyIds: sourceVacancy._id }]
    });
    const clonedCompetencies = [];
    for (const comp of sourceCompetencies) {
      if (!comp.isFixed) {
        const clonedComp = new Competency({
          name: comp.name, type: comp.type, isFixed: false,
          vacancyId:  comp.vacancyIds && comp.vacancyIds.length > 1 ? null : clonedVacancy._id,
          vacancyIds: comp.vacancyIds && comp.vacancyIds.length > 1 ? [clonedVacancy._id] : []
        });
        await clonedComp.save();
        clonedCompetencies.push(clonedComp);
      }
    }
    res.json({
      message: `Vacancy cloned successfully to ${targetPublicationRange.name}`,
      clonedVacancy, competenciesCloned: clonedCompetencies.length,
      sourcePublicationRange: sourceVacancy.publicationRangeId,
      targetPublicationRange: targetPublicationRange._id
    });
  } catch (error) {
    console.error('[POST /vacancies/:id/clone-to-publication]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// CANDIDATE ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/candidates', authMiddleware, async (req, res) => {
  try {
    // F-09 FIX: Raters only see candidates for their assigned item numbers.
    // Admin and secretariat see all candidates.
    if (req.user.userType === 'rater') {
      let filter = {};
      if (req.user.assignedVacancies === 'specific' && req.user.assignedItemNumbers?.length > 0) {
        filter.itemNumber = { $in: req.user.assignedItemNumbers };
      } else if (req.user.assignedVacancies === 'assignment' && req.user.assignedAssignment) {
        const vacancies = await Vacancy.find({ assignment: req.user.assignedAssignment }, 'itemNumber');
        filter.itemNumber = { $in: vacancies.map(v => v.itemNumber) };
      } else if (req.user.assignedVacancies === 'none') {
        return res.json([]); // No assignments — return nothing
      }
      // assignedVacancies === 'all': no filter, rater sees everything
      const candidates = await Candidate.find(filter);
      return res.json(candidates);
    }
    const candidates = await Candidate.find();
    res.json(candidates);
  } catch (error) {
    console.error('[GET /candidates]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/candidates/export-summary-csv', exportLimiter, authMiddleware, async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ fullName: 1 });
    if (candidates.length === 0) return res.status(404).json({ message: 'No candidates found for export' });

    const vacancies = await Vacancy.find({}, 'itemNumber position');
    const itemNumberToPosition = {};
    vacancies.forEach(v => { itemNumberToPosition[v.itemNumber] = v.position; });

    const headers = [
      'Full Name', 'Gender', 'Item Number', 'Position Applied',
      'Status', 'Education Comments', 'Training Comments',
      'Experience Comments', 'Eligibility Comments',
      'Govt Agency', 'Govt Position', 'Govt Employment Status', 'Govt Employment Period',
      'Govt Employment End Date', 'Pre-Assessment Exam Consideration', 'Govt Remarks'
    ];
    const rows = candidates.map(c => [
      c.fullName || '', c.gender || '', c.itemNumber || '',
      itemNumberToPosition[c.itemNumber] || 'N/A', c.status || '',
      c.comments?.education || '', c.comments?.training || '',
      c.comments?.experience || '', c.comments?.eligibility || '',
      c.governmentEmployment?.agency           || '',
      c.governmentEmployment?.position         || '',
      c.governmentEmployment?.status           || '',
      c.governmentEmployment?.employmentPeriod === 'present'        ? 'Present Employment'  :
      c.governmentEmployment?.employmentPeriod === 'within_2_years' ? 'Within Last 2 Years' : '',
      c.governmentEmployment?.employmentEndDate
        ? new Date(c.governmentEmployment.employmentEndDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
        : '',
      c.governmentEmployment?.preAssessmentExam === 'more_than_6_months' ? 'More than 6 Months' :
      c.governmentEmployment?.preAssessmentExam === 'less_than_6_months' ? 'Less than 6 Months' : '',
      c.governmentEmployment?.remarks          || ''
    ]);

    const csvContent = [headers, ...rows].map(r => r.map(escapeCsvValue).join(',')).join('\n');
    const filename = `candidates_summary_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\ufeff' + csvContent);
  } catch (error) {
    console.error('[GET /candidates/export-summary-csv]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.get('/candidates/export-csv', exportLimiter, authMiddleware, async (req, res) => {
  try {
    const { itemNumber, assignment, position } = req.query;
    let filter = {};
    if (itemNumber) {
      filter.itemNumber = itemNumber;
    } else if (position && assignment) {
      const vacancies = await Vacancy.find({ assignment, position }, 'itemNumber');
      filter.itemNumber = { $in: vacancies.map(v => v.itemNumber) };
    } else if (assignment) {
      const vacancies = await Vacancy.find({ assignment }, 'itemNumber');
      filter.itemNumber = { $in: vacancies.map(v => v.itemNumber) };
    }

    const candidates = await Candidate.find(filter)
      .populate('commentsHistory.commentedBy', 'name')
      .sort({ fullName: 1 });
    if (candidates.length === 0) return res.status(404).json({ message: 'No candidates found for export' });

    const getLastCommenterInfo = (candidate, field) => {
      const fieldHistory = candidate.commentsHistory
        .filter(h => h.field === field)
        .sort((a, b) => new Date(b.commentedAt) - new Date(a.commentedAt));
      if (fieldHistory.length > 0) {
        return {
          name: fieldHistory[0].commentedBy?.name || 'Unknown',
          date: new Date(fieldHistory[0].commentedAt).toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          })
        };
      }
      return { name: 'N/A', date: 'N/A' };
    };

    const headers = [
      'Full Name', 'Item Number', 'Gender', 'Date of Birth', 'Age', 'Eligibility', 'Status',
      'Education Comments', 'Education Last Updated By', 'Education Last Updated At',
      'Training Comments', 'Training Last Updated By', 'Training Last Updated At',
      'Experience Comments', 'Experience Last Updated By', 'Experience Last Updated At',
      'Eligibility Comments', 'Eligibility Last Updated By', 'Eligibility Last Updated At',
      'Professional License', 'Letter of Intent', 'Personal Data Sheet',
      'Work Experience Sheet', 'Proof of Eligibility', 'Certificates', 'IPCR',
      'Certificate of Employment', 'Diploma', 'Transcript of Records',
      'Govt Agency', 'Govt Position', 'Govt Employment Status', 'Govt Employment Period',
      'Govt Employment End Date', 'Pre-Assessment Exam Consideration', 'Govt Remarks'
    ];

    const rows = candidates.map(c => {
      const edu   = getLastCommenterInfo(c, 'education');
      const train = getLastCommenterInfo(c, 'training');
      const exp   = getLastCommenterInfo(c, 'experience');
      const elig  = getLastCommenterInfo(c, 'eligibility');
      return [
        c.fullName || '', c.itemNumber || '', c.gender || '',
        c.dateOfBirth ? new Date(c.dateOfBirth).toLocaleDateString() : '',
        c.age || '', c.eligibility || '', c.status || '',
        c.comments?.education || '', edu.name, edu.date,
        c.comments?.training  || '', train.name, train.date,
        c.comments?.experience|| '', exp.name,  exp.date,
        c.comments?.eligibility||'', elig.name, elig.date,
        c.professionalLicense||'', c.letterOfIntent||'', c.personalDataSheet||'',
        c.workExperienceSheet||'', c.proofOfEligibility||'', c.certificates||'',
        c.ipcr||'', c.certificateOfEmployment||'', c.diploma||'', c.transcriptOfRecords||'',
        c.governmentEmployment?.agency           || '',
        c.governmentEmployment?.position         || '',
        c.governmentEmployment?.status           || '',
        c.governmentEmployment?.employmentPeriod === 'present'       ? 'Present Employment'  :
        c.governmentEmployment?.employmentPeriod === 'within_2_years'? 'Within Last 2 Years' : '',
        c.governmentEmployment?.employmentEndDate
          ? new Date(c.governmentEmployment.employmentEndDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
          : '',
        c.governmentEmployment?.preAssessmentExam === 'more_than_6_months' ? 'More than 6 Months' :
        c.governmentEmployment?.preAssessmentExam === 'less_than_6_months' ? 'Less than 6 Months' : '',
        c.governmentEmployment?.remarks          || ''
      ];
    });

    const csvContent = [headers, ...rows].map(r => r.map(escapeCsvValue).join(',')).join('\n');
    const timestamp  = new Date().toISOString().split('T')[0];
    const filename   = itemNumber
      ? `candidates_${itemNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.csv`
      : `candidates_export_${timestamp}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\ufeff' + csvContent);
  } catch (error) {
    console.error('[GET /candidates/export-csv]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.get('/candidates/item/:itemNumber', authMiddleware, async (req, res) => {
  try {
    const itemNumber = decodeURIComponent(req.params.itemNumber);
    const { includeArchived = 'false' } = req.query;
    const query = { itemNumber };
    if (includeArchived === 'false') query.isArchived = false;
    const candidates = await Candidate.find(query)
      .populate('commentsHistory.commentedBy', 'name userType')
      .populate('statusHistory.changedBy', 'name userType')
      .sort({ fullName: 1 });
    res.json(candidates);
  } catch (error) {
    console.error('[GET /candidates/item/:itemNumber]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/candidates/comment-suggestions/:field', authMiddleware, async (req, res) => {
  // F-11 FIX: Secretariat evaluation language must not be visible to raters.
  if (req.user.userType === 'rater') return res.status(403).json({ message: 'Access denied' });
  try {
    const { field } = req.params;
    const { limit = 250 } = req.query;
    const validFields = ['education', 'training', 'experience', 'eligibility'];
    if (!validFields.includes(field)) return res.status(400).json({ message: 'Invalid field' });

    const maxSuggestions = Math.min(Math.max(parseInt(limit) || 100, 1), 500);
    const candidates = await Candidate.find(
      { [`comments.${field}`]: { $exists: true, $ne: '' } },
      { [`comments.${field}`]: 1 }
    ).limit(1000);

    const commentFrequency = {};
    candidates.forEach(c => {
      const comment = c.comments?.[field];
      if (comment && comment.trim() !== '') {
        const normalized = comment.trim().replace(/\s+/g, ' ')
          .replace(/\s*(,.:;!?)\s*/g, '$1').replace(/([(),.:;!?])+/g, '$1')
          .replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ')
          .normalize('NFKC').toUpperCase();
        commentFrequency[normalized] = (commentFrequency[normalized] || 0) + 1;
      }
    });

    const suggestions = Object.entries(commentFrequency)
      .sort((a, b) => b[1] - a[1]).slice(0, maxSuggestions).map(([c]) => c);
    res.json(suggestions);
  } catch (error) {
    console.error('[GET /candidates/comment-suggestions]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.get('/candidates/by-publication/:publicationRangeId', authMiddleware, async (req, res) => {
  try {
    const { includeArchived = 'false' } = req.query;
    const query = { publicationRangeId: req.params.publicationRangeId };
    if (includeArchived === 'false') query.isArchived = false;
    const candidates = await Candidate.find(query)
      .populate('commentsHistory.commentedBy', 'name userType')
      .populate('statusHistory.changedBy', 'name userType')
      .sort({ fullName: 1 });
    res.json(candidates);
  } catch (error) {
    console.error('[GET /candidates/by-publication]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.post('/candidates/upload-csv/:publicationRangeId', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    if (!req.files || !req.files.csv) return res.status(400).json({ message: 'No file uploaded' });
    try { validateCsvFile(req.files.csv); } catch (e) {
      return res.status(400).json({ message: e.message });
    }
    const publicationRange = await PublicationRange.findById(req.params.publicationRangeId);
    if (!publicationRange) return res.status(404).json({ message: 'Publication range not found' });
    if (publicationRange.isArchived) {
      return res.status(400).json({ message: 'Cannot import candidates to archived publication range' });
    }

    const candidatesData = parseCSV(req.files.csv.data);
    const vacancies = await Vacancy.find({ publicationRangeId: publicationRange._id, isArchived: false });
    const itemNumberMap = new Map(vacancies.map(v => [v.itemNumber, v.position]));

    const invalidItems = [];
    const processedCandidates = [];

    for (const candidate of candidatesData) {
      const itemNum = candidate.itemNumber?.trim();
      if (!itemNum || !itemNumberMap.has(itemNum)) {
        invalidItems.push({
          itemNumber: itemNum || 'MISSING',
          candidateName: candidate.fullName,
          reason: !itemNum ? 'Missing item number' : 'Item number not found in this publication range'
        });
        continue;
      }
      processedCandidates.push({
        fullName: candidate.fullName || '', itemNumber: candidate.itemNumber.trim(),
        gender: candidate.gender || '', dateOfBirth: candidate.dateOfBirth || null,
        age: candidate.age || null, eligibility: candidate.eligibility || '',
        professionalLicense: candidate.professionalLicense || '',
        letterOfIntent: candidate.letterOfIntent || '',
        personalDataSheet: candidate.personalDataSheet || '',
        workExperienceSheet: candidate.workExperienceSheet || '',
        proofOfEligibility: candidate.proofOfEligibility || '',
        certificates: candidate.certificates || '', ipcr: candidate.ipcr || '',
        certificateOfEmployment: candidate.certificateOfEmployment || '',
        diploma: candidate.diploma || '', transcriptOfRecords: candidate.transcriptOfRecords || '',
        status: candidate.status || 'general_list', publicationRangeId: publicationRange._id,
        comments: {
          education: candidate.educationComments || '', training: candidate.trainingComments || '',
          experience: candidate.experienceComments || '', eligibility: candidate.eligibilityComments || ''
        }
      });
    }

    if (invalidItems.length > 0) {
      return res.status(400).json({
        message: 'Import validation failed', errors: invalidItems,
        validItemNumbers: Array.from(itemNumberMap.keys())
      });
    }

    const insertResult = await Candidate.insertMany(processedCandidates);
    res.json({
      message: `Successfully imported ${insertResult.length} candidates`,
      count: insertResult.length,
      publicationRange: { id: publicationRange._id, name: publicationRange.name }
    });
  } catch (error) {
    console.error('[POST /candidates/upload-csv/:publicationRangeId]', error);
    res.status(500).json({ message: 'Failed to upload CSV: ' + error.message });
  }
});

router.post('/candidates/upload-csv', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    if (!req.files || !req.files.csv) return res.status(400).json({ message: 'No file uploaded' });
    try { validateCsvFile(req.files.csv); } catch (e) {
      return res.status(400).json({ message: e.message });
    }
    const candidatesData = parseCSV(req.files.csv.data);
    const processedCandidates = candidatesData.map(candidate => ({
      fullName: candidate.fullName || '', itemNumber: candidate.itemNumber || '',
      gender: candidate.gender || '', dateOfBirth: candidate.dateOfBirth || null,
      age: candidate.age || null, eligibility: candidate.eligibility || '',
      professionalLicense: candidate.professionalLicense || '',
      letterOfIntent: candidate.letterOfIntent || '',
      personalDataSheet: candidate.personalDataSheet || '',
      workExperienceSheet: candidate.workExperienceSheet || '',
      proofOfEligibility: candidate.proofOfEligibility || '',
      certificates: candidate.certificates || '', ipcr: candidate.ipcr || '',
      certificateOfEmployment: candidate.certificateOfEmployment || '',
      diploma: candidate.diploma || '', transcriptOfRecords: candidate.transcriptOfRecords || '',
      status: candidate.status || 'general_list',
      comments: {
        education: candidate.educationComments || '', training: candidate.trainingComments || '',
        experience: candidate.experienceComments || '', eligibility: candidate.eligibilityComments || ''
      }
    }));
    await Candidate.insertMany(processedCandidates);
    res.json({ message: 'Candidates uploaded successfully' });
  } catch (error) {
    console.error('[POST /candidates/upload-csv]', error);
    res.status(500).json({ message: 'Failed to upload CSV: ' + error.message });
  }
});

router.post('/candidates/undo-import/:publicationRangeId', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    // F-12 FIX: Clamp minutesAgo to 1–60 — prevents wiping historically old records.
    const raw = parseInt(req.body.minutesAgo) || 5;
    const minutesAgo = Math.min(Math.max(raw, 1), 60);
    const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000);
    const result = await Candidate.deleteMany({
      publicationRangeId: req.params.publicationRangeId,
      createdAt: { $gte: cutoffTime }
    });
    res.json({
      message: `Undo successful: Deleted ${result.deletedCount} recently imported candidates`,
      deletedCount: result.deletedCount, cutoffTime
    });
  } catch (error) {
    console.error('[POST /candidates/undo-import]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

// /:id routes LAST for candidates
router.get('/candidates/:id', authMiddleware, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id)
      .populate('commentsHistory.commentedBy', 'name userType')
      .populate('statusHistory.changedBy', 'name userType');
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });
    res.json(candidate);
  } catch (error) {
    console.error('[GET /candidates/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/candidates', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    if (!req.body.fullName || req.body.fullName.trim() === '') return res.status(400).json({ message: 'Full name is required' });
    if (!req.body.itemNumber || req.body.itemNumber.trim() === '') return res.status(400).json({ message: 'Item number is required' });
    if (!req.body.gender || req.body.gender.trim() === '') return res.status(400).json({ message: 'Gender is required' });

    const candidateData = {
      fullName: req.body.fullName.trim(), itemNumber: req.body.itemNumber.trim(),
      gender: req.body.gender.trim(), dateOfBirth: req.body.dateOfBirth || null,
      age: req.body.age || null, eligibility: req.body.eligibility || '',
      professionalLicense: req.body.professionalLicense || '',
      letterOfIntent: req.body.letterOfIntent || '',
      personalDataSheet: req.body.personalDataSheet || '',
      workExperienceSheet: req.body.workExperienceSheet || '',
      proofOfEligibility: req.body.proofOfEligibility || '',
      certificates: req.body.certificates || '', ipcr: req.body.ipcr || '',
      certificateOfEmployment: req.body.certificateOfEmployment || '',
      diploma: req.body.diploma || '', transcriptOfRecords: req.body.transcriptOfRecords || '',
      status: req.body.status || 'general_list',
      comments: {
        education: req.body.comments?.education || '', training: req.body.comments?.training || '',
        experience: req.body.comments?.experience || '', eligibility: req.body.comments?.eligibility || ''
      }
    };
    const candidate = new Candidate(candidateData);
    await candidate.save();
    res.json(candidate);
  } catch (error) {
    console.error('[POST /candidates]', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => `${err.path}: ${err.message}`);
      return res.status(400).json({ message: 'Validation error: ' + messages.join(', '), errors: error.errors });
    }
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.put('/candidates/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin' && req.user.userType !== 'secretariat') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const currentCandidate = await Candidate.findById(req.params.id);
    if (!currentCandidate) return res.status(404).json({ message: 'Candidate not found' });

    const updateData = {};
    if (req.body.fullName && req.body.fullName.trim() !== '') updateData.fullName = req.body.fullName.trim();
    if (req.body.itemNumber && req.body.itemNumber.trim() !== '') updateData.itemNumber = req.body.itemNumber.trim();
    if (req.body.gender && req.body.gender.trim() !== '') updateData.gender = req.body.gender.trim();

    const optionalFields = [
      'dateOfBirth', 'age', 'eligibility', 'professionalLicense', 'letterOfIntent',
      'personalDataSheet', 'workExperienceSheet', 'proofOfEligibility', 'certificates',
      'ipcr', 'certificateOfEmployment', 'diploma', 'transcriptOfRecords'
    ];
    optionalFields.forEach(field => {
      if (req.body.hasOwnProperty(field)) {
        updateData[field] = req.body[field] || (['dateOfBirth', 'age'].includes(field) ? null : '');
      }
    });

    if (req.body.hasOwnProperty('status')) {
      const newStatus = req.body.status || 'general_list';
      const oldStatus = currentCandidate.status;
      updateData.status = newStatus;
      if (newStatus !== oldStatus) {
        updateData.$push = updateData.$push || {};
        updateData.$push.statusHistory = {
          oldStatus, newStatus, changedBy: req.user._id,
          changedAt: new Date(), reason: req.body.statusChangeReason || ''
        };
      }
    }

    if (req.body.hasOwnProperty('governmentEmployment')) {
      updateData.governmentEmployment = {
        agency:            req.body.governmentEmployment?.agency            || '',
        position:          req.body.governmentEmployment?.position          || '',
        status:            req.body.governmentEmployment?.status            || '',
        employmentPeriod:  req.body.governmentEmployment?.employmentPeriod  || '',
        employmentEndDate: req.body.governmentEmployment?.employmentEndDate || null,
        preAssessmentExam: req.body.governmentEmployment?.preAssessmentExam || '',
        remarks:           req.body.governmentEmployment?.remarks           || ''
      };
    }

    if (req.body.comments) {
      const newComments = {
        education:   req.body.comments.education   || '',
        training:    req.body.comments.training    || '',
        experience:  req.body.comments.experience  || '',
        eligibility: req.body.comments.eligibility || ''
      };
      updateData.comments = newComments;
      const historyEntries = [];
      ['education', 'training', 'experience', 'eligibility'].forEach(field => {
        const oldComment = currentCandidate.comments?.[field] || '';
        const newComment = newComments[field] || '';
        if (newComment !== oldComment && newComment.trim() !== '') {
          historyEntries.push({
            field, comment: newComment,
            status: updateData.status || currentCandidate.status,
            commentedBy: req.user._id, commentedAt: new Date()
          });
        }
      });
      if (historyEntries.length > 0) {
        updateData.$push = updateData.$push || {};
        updateData.$push.commentsHistory = { $each: historyEntries };
      }
    }

    const candidate = await Candidate.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
      .populate('commentsHistory.commentedBy', 'name userType')
      .populate('statusHistory.changedBy', 'name userType');
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });
    res.json(candidate);
  } catch (error) {
    console.error('[PUT /candidates/:id]', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => `${err.path}: ${err.message}`);
      return res.status(400).json({ message: 'Validation error: ' + messages.join(', '), errors: error.errors });
    }
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.delete('/candidates/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const candidate = await Candidate.findByIdAndDelete(req.params.id);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });
    res.json({ message: 'Candidate deleted' });
  } catch (error) {
    console.error('[DELETE /candidates/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// One-time migration: recompute and persist age for every candidate that has
// dateOfBirth but a null/missing age. Safe to call multiple times.
router.post('/candidates/backfill-ages', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const candidates = await Candidate.find({ dateOfBirth: { $ne: null } });
    let updated = 0;
    const today = new Date();
    for (const c of candidates) {
      const birthDate = new Date(c.dateOfBirth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
      if (c.age !== age) {
        await Candidate.updateOne({ _id: c._id }, { $set: { age } });
        updated++;
      }
    }
    res.json({ message: `Backfill complete. Updated ${updated} of ${candidates.length} candidates.`, updated, total: candidates.length });
  } catch (error) {
    console.error('[POST /candidates/backfill-ages]', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// COMPETENCY ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/competencies', authMiddleware, async (req, res) => {
  try {
    const competencies = await Competency.find();
    res.json(competencies);
  } catch (error) {
    console.error('[GET /competencies]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/competencies/recent-uploads', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  pruneOldLogs();
  const recent = Object.entries(_uploadLogs)
    .map(([uploadId, log]) => ({
      uploadId, uploadedAt: log.uploadedAt,
      createdCount: log.createdIds.length, mergedCount: log.updatedChanges.length,
    }))
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .slice(0, 5);
  res.json(recent);
});

router.get('/competencies/vacancy/:vacancyId', authMiddleware, async (req, res) => {
  try {
    const competencies = await Competency.findByVacancy(req.params.vacancyId);
    res.json(competencies);
  } catch (error) {
    console.error('[GET /competencies/vacancy/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/competencies/upload-csv', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    if (!req.files?.csv) return res.status(400).json({ message: 'No file uploaded' });
    try { validateCsvFile(req.files.csv); } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    const rows   = parseCSV(req.files.csv.data);
    const errors = [];
    const existingCompetencies = await Competency.find({});

    const uploadLog = {
      uploadedAt: new Date(), uploadedBy: req.user._id,
      createdIds: [], updatedChanges: []
    };
    const results = { created: [], merged: [], skipped: [] };

    for (const row of rows) {
      if (!row.name || !row.type) { errors.push(`Missing name/type: ${JSON.stringify(row)}`); continue; }
      const rowType = row.type.trim().toLowerCase();
      const validTypes = ['basic', 'organizational', 'leadership', 'minimum'];
      if (!validTypes.includes(rowType)) { errors.push(`Invalid type '${row.type}' for: ${row.name}`); continue; }

      const vacancyIds = [];
      if (row.vacancyItemNumbers?.trim()) {
        const itemNumbers = row.vacancyItemNumbers.split(';').map(s => s.trim()).filter(Boolean);
        // FIX: Batch lookup
        const foundVacancies = await Vacancy.find({ itemNumber: { $in: itemNumbers }, isArchived: { $ne: true } });
        const foundMap = new Map(foundVacancies.map(v => [v.itemNumber, v]));
        for (const itemNumber of itemNumbers) {
          const vacancy = foundMap.get(itemNumber);
          if (!vacancy) { errors.push(`Active vacancy '${itemNumber}' not found for: ${row.name}`); continue; }
          vacancyIds.push(vacancy._id.toString());
        }
      }

      const isFixed = row.isFixed === true || row.isFixed?.toString().toLowerCase() === 'true' || row.isFixed === '1';

      const extractLevel = (name) => { const m = name.match(/^\((BAS|INT|ADV|SUP)\)/i); return m ? m[1].toUpperCase() : null; };
      const uploadedLevel = extractLevel(row.name);

      let bestMatch = null, bestScore = 0;
      for (const existing of existingCompetencies) {
        if (existing.type !== rowType) continue;
        const existingLevel = extractLevel(existing.name);
        if (uploadedLevel && existingLevel && uploadedLevel !== existingLevel) continue;
        const score = stringSimilarity(row.name, existing.name);
        if (score >= SIMILARITY_THRESHOLD && score > bestScore) { bestScore = score; bestMatch = existing; }
      }

      if (bestMatch) {
        const existingVacancyIds = [];
        if (Array.isArray(bestMatch.vacancyIds) && bestMatch.vacancyIds.length > 0) {
          bestMatch.vacancyIds.forEach(id => existingVacancyIds.push(id.toString()));
        } else if (bestMatch.vacancyId) {
          existingVacancyIds.push(bestMatch.vacancyId.toString());
        }
        const newVacancyIds = vacancyIds.filter(id => !existingVacancyIds.includes(id));
        if (newVacancyIds.length > 0) {
          uploadLog.updatedChanges.push({
            competencyId: bestMatch._id.toString(),
            previousVacancyIds: [...existingVacancyIds],
            previousVacancyId: bestMatch.vacancyId ? bestMatch.vacancyId.toString() : null,
            addedVacancyIds: newVacancyIds,
          });
          const mergedObjectIds = [...existingVacancyIds, ...newVacancyIds].map(id => new mongoose.Types.ObjectId(id));
          await Competency.findByIdAndUpdate(bestMatch._id, {
            vacancyIds: mergedObjectIds,
            vacancyId: null,
            isArchived: false,      // ← unarchive if it was previously archived
            archivedAt: null,
            archivedBy: null
          });
          results.merged.push({ existingName: bestMatch.name, uploadedName: row.name, similarity: Math.round(bestScore * 100), addedItemCount: newVacancyIds.length });
        } else {
          results.skipped.push({ name: row.name, reason: `Matched '${bestMatch.name}' (${Math.round(bestScore * 100)}% similar) — no new vacancies to add` });
        }
        continue;
      }

      const data = { name: row.name.trim(), type: rowType, isFixed };
      if (vacancyIds.length > 1) {
        data.vacancyIds = vacancyIds.map(id => new mongoose.Types.ObjectId(id));
        data.vacancyId  = null;
      } else if (vacancyIds.length === 1) {
        data.vacancyId  = new mongoose.Types.ObjectId(vacancyIds[0]);
        data.vacancyIds = [];
      } else {
        data.vacancyId = null; data.vacancyIds = [];
      }
      const created = new Competency(data);
      await created.save();
      uploadLog.createdIds.push(created._id.toString());
      results.created.push({ name: row.name });
    }

    if (errors.length > 0) return res.status(400).json({ message: 'CSV validation failed', errors });

    pruneOldLogs();
    const uploadId = `comp_${Date.now()}_${req.user._id}`;
    _uploadLogs[uploadId] = uploadLog;

    return res.json({
      message: `Upload complete: ${results.created.length} created, ${results.merged.length} merged, ${results.skipped.length} skipped`,
      uploadId, results, canUndo: true, undoExpiresIn: '1 hour',
    });
  } catch (error) {
    console.error('[POST /competencies/upload-csv]', error);
    res.status(500).json({ message: 'Failed to upload CSV: ' + error.message });
  }
});

router.post('/competencies/undo-upload/:uploadId', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const log = _uploadLogs[req.params.uploadId];
    if (!log) return res.status(404).json({ message: 'Upload log not found or has expired (logs expire after 1 hour)' });

    let deletedCount = 0, revertedCount = 0;
    if (log.createdIds.length > 0) {
      const result = await Competency.deleteMany({ _id: { $in: log.createdIds.map(id => new mongoose.Types.ObjectId(id)) } });
      deletedCount = result.deletedCount;
    }
    for (const change of log.updatedChanges) {
      const prev = change.previousVacancyIds ?? [];
      let updatePayload;
      if (prev.length > 1) {
        updatePayload = { vacancyIds: prev.map(id => new mongoose.Types.ObjectId(id)), vacancyId: null };
      } else if (prev.length === 1) {
        updatePayload = { vacancyId: new mongoose.Types.ObjectId(prev[0]), vacancyIds: [] };
      } else {
        updatePayload = { vacancyId: change.previousVacancyId ? new mongoose.Types.ObjectId(change.previousVacancyId) : null, vacancyIds: [] };
      }
      await Competency.findByIdAndUpdate(new mongoose.Types.ObjectId(change.competencyId), updatePayload);
      revertedCount++;
    }
    delete _uploadLogs[req.params.uploadId];
    res.json({ message: `Undo successful: ${deletedCount} deleted, ${revertedCount} reverted`, deletedCount, revertedCount });
  } catch (error) {
    console.error('[POST /competencies/undo-upload]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

// /:id routes LAST for competencies
router.get('/competencies/:id', authMiddleware, async (req, res) => {
  try {
    const competency = await Competency.findById(req.params.id);
    if (!competency) return res.status(404).json({ message: 'Competency not found' });
    res.json(competency);
  } catch (error) {
    console.error('[GET /competencies/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/competencies', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    // F-06 FIX: Only allowlisted fields accepted.
    const compData = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => COMPETENCY_WRITE_ALLOWED.includes(k))
    );
    const competency = new Competency(compData);
    await competency.save();
    res.json(competency);
  } catch (error) {
    console.error('[POST /competencies]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/competencies/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    // F-06 FIX: Only allowlisted fields accepted.
    const compUpdate = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => COMPETENCY_WRITE_ALLOWED.includes(k))
    );
    const competency = await Competency.findByIdAndUpdate(req.params.id, compUpdate, { new: true });
    if (!competency) return res.status(404).json({ message: 'Competency not found' });
    res.json(competency);
  } catch (error) {
    console.error('[PUT /competencies/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/competencies/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const competency = await Competency.findByIdAndDelete(req.params.id);
    if (!competency) return res.status(404).json({ message: 'Competency not found' });
    res.json({ message: 'Competency deleted' });
  } catch (error) {
    console.error('[DELETE /competencies/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// RATING ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/ratings', authMiddleware, async (req, res) => {
  // F-01 FIX: Only admins may fetch the full ratings collection.
  // Raters must not see other raters' scores — CBS independence requirement.
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const ratings = await Rating.find()
      .populate('raterId', 'name raterType')
      .populate('competencyId', 'name type');
    res.json(ratings);
  } catch (error) {
    console.error('[GET /ratings]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/ratings/submit', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'rater') return res.status(403).json({ message: 'Access denied' });
  try {
    const { ratings, isUpdate = false } = req.body;
    if (!ratings || ratings.length === 0) return res.status(400).json({ message: 'No ratings provided' });
    if (ratings.some(r => !r.itemNumber)) return res.status(400).json({ message: 'All ratings must include itemNumber' });

    const candidateIds = [...new Set(ratings.map(r => r.candidateId))];
    const itemNumbers  = [...new Set(ratings.map(r => r.itemNumber))];

    const existingRatings = await Rating.find({
      candidateId: { $in: candidateIds }, raterId: req.user._id, itemNumber: { $in: itemNumbers }
    });
    const hasExistingRatings = existingRatings.length > 0;
    if (hasExistingRatings && !isUpdate) {
      return res.status(409).json({
        message: 'Existing ratings found for this candidate and item number',
        requiresUpdate: true, existingCount: existingRatings.length
      });
    }

    const results = [], logEntries = [];
    for (const ratingData of ratings) {
      const filter = {
        candidateId: ratingData.candidateId, raterId: req.user._id,
        competencyId: ratingData.competencyId, competencyType: ratingData.competencyType,
        itemNumber: ratingData.itemNumber
      };
      const existingRating = await Rating.findOne(filter);
      // F-14 FIX: Validate score range before hitting the DB.
      const newScore = parseInt(ratingData.score);
      if (isNaN(newScore) || newScore < 1 || newScore > 5)
        return res.status(400).json({ message: `Invalid score value: ${ratingData.score}. Must be 1–5.` });
      if (existingRating && existingRating.score === newScore) continue;

      const update = { ...filter, score: newScore, submittedAt: new Date() };
      const result = await Rating.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true });
      results.push(result);
      logEntries.push({
        action: existingRating ? 'updated' : 'created',
        ratingId: result._id, candidateId: ratingData.candidateId, raterId: req.user._id,
        itemNumber: ratingData.itemNumber, competencyId: ratingData.competencyId,
        competencyType: ratingData.competencyType, oldScore: existingRating?.score || null, newScore,
        performedBy: req.user._id,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      });
    }
    if (logEntries.length > 0) await RatingLog.insertMany(logEntries);
    res.json({
      message: hasExistingRatings ? 'Ratings updated successfully' : 'Ratings submitted successfully',
      isUpdate: hasExistingRatings, ratingsProcessed: results.length, changesLogged: logEntries.length
    });
  } catch (error) {
    console.error('[POST /ratings/submit]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.get('/ratings/candidate/:candidateId', authMiddleware, async (req, res) => {
  try {
    // F-07 FIX: Raters only see their own ratings for a candidate.
    // Admin and secretariat see all ratings (needed for reporting and compilation).
    if (req.user.userType === 'rater') {
      const ratings = await Rating.find({
        candidateId: req.params.candidateId,
        raterId: req.user._id
      })
        .populate('competencyId', 'name type')
        .populate('raterId', 'name raterType position designation');
      return res.json(ratings);
    }
    const ratings = await Rating.findByCandidate(req.params.candidateId);
    res.json(ratings);
  } catch (error) {
    console.error('[GET /ratings/candidate/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/ratings/rater/:raterId', authMiddleware, async (req, res) => {
  // F-02 FIX: A rater may only fetch their own ratings.
  // Admins may fetch any rater's ratings (for reporting / audit).
  const isOwner = req.user._id.toString() === req.params.raterId;
  const isAdmin = req.user.userType === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Access denied' });
  try {
    const ratings = await Rating.findByRater(req.params.raterId);
    res.json(ratings);
  } catch (error) {
    console.error('[GET /ratings/rater/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/ratings/check-existing/:candidateId/:itemNumber/:raterType', authMiddleware, async (req, res) => {
  try {
    const { candidateId, itemNumber, raterType } = req.params;
    const decodedItemNumber = decodeURIComponent(itemNumber);
    const ratersOfType = await User.find({ raterType }).select('_id');
    const raterIds = ratersOfType.map(r => r._id);
    const existingRatings = await Rating.find({
      candidateId, itemNumber: decodedItemNumber, raterId: { $in: raterIds }
    }).populate('raterId', 'name raterType');

    if (existingRatings.length > 0) {
      const existingRater = existingRatings[0].raterId;
      return res.json({
        hasExisting: true,
        existingRater: { id: existingRater._id, name: existingRater.name, raterType: existingRater.raterType },
        ratingCount: existingRatings.length
      });
    }
    res.json({ hasExisting: false });
  } catch (error) {
    console.error('[GET /ratings/check-existing]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.delete('/ratings/candidate/:candidateId/rater/:raterId/item/:itemNumber', authMiddleware, async (req, res) => {
  // F-03 FIX: A rater may only delete their own ratings — identity check added.
  if (req.user.userType !== 'rater' || req.user._id.toString() !== req.params.raterId)
    return res.status(403).json({ message: 'Access denied' });
  try {
    const { candidateId, raterId, itemNumber } = req.params;
    const decodedItemNumber = decodeURIComponent(itemNumber);
    const ratingsToDelete = await Rating.find({ candidateId, raterId, itemNumber: decodedItemNumber });
    const result = await Rating.deleteMany({ candidateId, raterId, itemNumber: decodedItemNumber });
    if (ratingsToDelete.length > 0 && result.deletedCount > 0) {
      const logEntries = ratingsToDelete.map(rating => ({
        action: 'deleted', ratingId: rating._id, candidateId: rating.candidateId,
        raterId: rating.raterId, itemNumber: rating.itemNumber, competencyId: rating.competencyId,
        competencyType: rating.competencyType, oldScore: rating.score, performedBy: req.user._id,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      }));
      await RatingLog.insertMany(logEntries);
    }
    res.json({ message: 'Ratings reset successfully', deletedCount: result.deletedCount });
  } catch (error) {
    console.error('[DELETE /ratings/candidate/:id/rater/:id/item/:id]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.delete('/ratings/candidate/:candidateId/rater/:raterId', authMiddleware, async (req, res) => {
  // F-03 FIX: Identity check — rater can only delete their own ratings.
  if (req.user.userType !== 'rater' || req.user._id.toString() !== req.params.raterId)
    return res.status(403).json({ message: 'Access denied' });
  try {
    await Rating.deleteMany({ candidateId: req.params.candidateId, raterId: req.params.raterId });
    res.json({ message: 'Ratings reset successfully' });
  } catch (error) {
    console.error('[DELETE /ratings/candidate/:id/rater/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/ratings/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'rater') return res.status(403).json({ message: 'Access denied' });
  try {
    // F-04 FIX: Verify ownership — rater may only update their own ratings.
    const existing = await Rating.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Rating not found' });
    if (existing.raterId.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Access denied' });
    // F-04 FIX: Only allow score updates — no other fields writable via this route.
    const newScore = parseInt(req.body.score);
    if (isNaN(newScore) || newScore < 1 || newScore > 5)
      return res.status(400).json({ message: 'Score must be between 1 and 5' });
    const rating = await Rating.findByIdAndUpdate(
      req.params.id, { score: newScore, submittedAt: new Date() }, { new: true }
    );
    res.json(rating);
  } catch (error) {
    console.error('[PUT /ratings/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// REPORT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/reports/rating/:candidateId', exportLimiter, authMiddleware, async (req, res) => {
  try {
    const ratings = await Rating.findByCandidate(req.params.candidateId);
    res.json(ratings);
  } catch (error) {
    console.error('[GET /reports/rating/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/reports/candidate/:candidateId', exportLimiter, authMiddleware, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.candidateId);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });
    res.json(candidate);
  } catch (error) {
    console.error('[GET /reports/candidate/:id]', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// RATING LOG ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/rating-logs', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin' && !req.user.administrativePrivilege) {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const { candidateId, raterId, itemNumber, action, limit = 100, skip = 0 } = req.query;
    const filter = {};
    if (candidateId) filter.candidateId = candidateId;
    if (raterId)     filter.raterId     = raterId;
    if (itemNumber)  filter.itemNumber  = itemNumber;
    if (action)      filter.action      = action;

    const [logs, total] = await Promise.all([
      RatingLog.find(filter)
        .populate('candidateId', 'fullName itemNumber')
        .populate('raterId', 'name raterType email')
        .populate('performedBy', 'name userType')
        .populate('competencyId', 'name type')
        .sort({ createdAt: -1 }).limit(parseInt(limit)).skip(parseInt(skip)),
      RatingLog.countDocuments(filter)
    ]);
    res.json({ logs, total, limit: parseInt(limit), skip: parseInt(skip) });
  } catch (error) {
    console.error('[GET /rating-logs]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.get('/rating-logs/stats', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin' && !req.user.administrativePrivilege) {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const [stats, raterActivity] = await Promise.all([
      RatingLog.aggregate([{ $group: { _id: '$action', count: { $sum: 1 } } }]),
      RatingLog.aggregate([
        { $group: {
          _id: '$raterId', totalActions: { $sum: 1 },
          created: { $sum: { $cond: [{ $eq: ['$action', 'created'] }, 1, 0] } },
          updated: { $sum: { $cond: [{ $eq: ['$action', 'updated'] }, 1, 0] } },
          deleted: { $sum: { $cond: [{ $eq: ['$action', 'deleted'] }, 1, 0] } }
        }},
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'rater' } },
        { $unwind: '$rater' },
        { $project: { raterId: '$_id', raterName: '$rater.name', raterType: '$rater.raterType', totalActions: 1, created: 1, updated: 1, deleted: 1 } },
        { $sort: { totalActions: -1 } }
      ])
    ]);
    res.json({ actionStats: stats, raterActivity });
  } catch (error) {
    console.error('[GET /rating-logs/stats]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.get('/rating-logs/export-csv', exportLimiter, authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin' && !req.user.administrativePrivilege) {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const logs = await RatingLog.find()
      .populate('candidateId', 'fullName itemNumber')
      .populate('raterId', 'name raterType email')
      .populate('performedBy', 'name userType')
      .populate('competencyId', 'name type')
      .sort({ createdAt: -1 });

    const headers = [
      'Date & Time', 'Action', 'Rater Name', 'Rater Type', 'Rater Email',
      'Candidate Name', 'Item Number', 'Competency', 'Competency Type',
      'Old Score', 'New Score', 'Performed By', 'IP Address'
    ];
    const rows = logs.map(log => [
      new Date(log.createdAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      log.action.toUpperCase(),
      log.raterId?.name      || 'N/A', log.raterId?.raterType || 'N/A', log.raterId?.email || 'N/A',
      log.candidateId?.fullName || 'N/A', log.itemNumber || 'N/A',
      log.competencyId?.name || 'N/A', log.competencyType || 'N/A',
      log.oldScore ?? 'N/A', log.newScore ?? 'N/A',
      log.performedBy?.name  || 'N/A', log.ipAddress || 'N/A'
    ]);

    const csvContent = [headers, ...rows].map(r => r.map(escapeCsvValue).join(',')).join('\n');
    const filename   = `rating_audit_log_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\ufeff' + csvContent);
  } catch (error) {
    console.error('[GET /rating-logs/export-csv]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// PUBLICATION RANGE ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/publication-ranges', authMiddleware, async (req, res) => {
  try {
    const { includeArchived = 'false' } = req.query;
    const query = includeArchived === 'false' ? { isArchived: false } : {};
    const publicationRanges = await PublicationRange.find(query)
      .populate('archivedBy', 'name email').sort({ startDate: -1 });
    res.json(publicationRanges);
  } catch (error) {
    console.error('[GET /publication-ranges]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.get('/publication-ranges/active', authMiddleware, async (req, res) => {
  try {
    const publicationRanges = await PublicationRange.findActive();
    res.json(publicationRanges);
  } catch (error) {
    console.error('[GET /publication-ranges/active]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.get('/publication-ranges/archived', authMiddleware, async (req, res) => {
  try {
    const publicationRanges = await PublicationRange.findArchived()
      .populate('archivedBy', 'name email').sort({ archivedAt: -1 });
    res.json(publicationRanges);
  } catch (error) {
    console.error('[GET /publication-ranges/archived]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.post('/publication-ranges', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const { name, tags, startDate, endDate, description, isActive } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ message: 'Missing required fields: name, startDate, endDate' });
    }
    const existingRange = await PublicationRange.findOne({ name });
    if (existingRange) return res.status(400).json({ message: 'A publication range with this name already exists' });

    const publicationRange = new PublicationRange({
      name, tags: tags || [], startDate, endDate,
      description: description || '', isActive: isActive !== undefined ? isActive : true
    });
    await publicationRange.save();
    res.status(201).json(publicationRange);
  } catch (error) {
    console.error('[POST /publication-ranges]', error);
    if (error.message.includes('End date must be after start date')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.post('/publication-ranges/:id/archive', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const publicationRange = await PublicationRange.findById(req.params.id);
    if (!publicationRange) return res.status(404).json({ message: 'Publication range not found' });
    if (publicationRange.isArchived) return res.status(400).json({ message: 'Publication range is already archived' });

    const activeVacancies = await Vacancy.find({ publicationRangeId: publicationRange._id, isArchived: false }, 'itemNumber');
    const vacancyItemNumbers = activeVacancies.map(v => v.itemNumber);

    publicationRange.isArchived = true;
    publicationRange.isActive   = false;
    publicationRange.archivedAt = new Date();
    publicationRange.archivedBy = req.user._id;
    await publicationRange.save();

    const [vacancyUpdateResult, candidateUpdateResult] = await Promise.all([
      Vacancy.updateMany({ publicationRangeId: publicationRange._id }, { $set: { isArchived: true, archivedAt: new Date(), archivedBy: req.user._id } }),
      Candidate.updateMany({ publicationRangeId: publicationRange._id }, { $set: { isArchived: true, archivedAt: new Date(), archivedBy: req.user._id } })
    ]);

    let usersUpdated = 0;
    if (vacancyItemNumbers.length > 0) {
      const usersWithSpecific = await User.find({ assignedVacancies: 'specific', assignedItemNumbers: { $in: vacancyItemNumbers } });
      for (const user of usersWithSpecific) {
        const toSuspend = user.assignedItemNumbers.filter(n => vacancyItemNumbers.includes(n));
        const remaining = user.assignedItemNumbers.filter(n => !vacancyItemNumbers.includes(n));
        const newSuspended = [...new Set([...(user.suspendedItemNumbers || []), ...toSuspend])];
        await User.findByIdAndUpdate(user._id, { assignedItemNumbers: remaining, suspendedItemNumbers: newSuspended });
        usersUpdated++;
      }
    }

    res.json({
      message: 'Publication range archived successfully', publicationRange,
      vacanciesArchived: vacancyUpdateResult.modifiedCount,
      candidatesArchived: candidateUpdateResult.modifiedCount,
      assignmentsSuspended: usersUpdated,
      note: 'User vacancy assignments suspended; will restore on unarchive'
    });
  } catch (error) {
    console.error('[POST /publication-ranges/:id/archive]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

// FIX: Removed the duplicate unarchive route — only the full version (with assignment restoration) remains
router.post('/publication-ranges/:id/unarchive', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const publicationRange = await PublicationRange.findById(req.params.id);
    if (!publicationRange) return res.status(404).json({ message: 'Publication range not found' });
    if (!publicationRange.isArchived) return res.status(400).json({ message: 'Publication range is not archived' });

    const archivedVacancies = await Vacancy.find({ publicationRangeId: publicationRange._id }, 'itemNumber');
    const vacancyItemNumbers = archivedVacancies.map(v => v.itemNumber);

    publicationRange.isArchived = false;
    publicationRange.archivedAt = null;
    publicationRange.archivedBy = null;
    await publicationRange.save();

    const [vacancyUpdateResult, candidateUpdateResult] = await Promise.all([
      Vacancy.updateMany({ publicationRangeId: publicationRange._id }, { $set: { isArchived: false, archivedAt: null, archivedBy: null } }),
      Candidate.updateMany({ publicationRangeId: publicationRange._id }, { $set: { isArchived: false, archivedAt: null, archivedBy: null } })
    ]);

    let usersRestored = 0;
    if (vacancyItemNumbers.length > 0) {
      const usersWithSuspended = await User.find({ suspendedItemNumbers: { $in: vacancyItemNumbers } });
      for (const user of usersWithSuspended) {
        const toRestore       = (user.suspendedItemNumbers || []).filter(n => vacancyItemNumbers.includes(n));
        const remainingSusp   = (user.suspendedItemNumbers || []).filter(n => !vacancyItemNumbers.includes(n));
        const newAssigned     = [...new Set([...(user.assignedItemNumbers || []), ...toRestore])];
        await User.findByIdAndUpdate(user._id, { assignedItemNumbers: newAssigned, suspendedItemNumbers: remainingSusp });
        usersRestored++;
      }
    }

    res.json({
      message: 'Publication range unarchived successfully', publicationRange,
      vacanciesUnarchived: vacancyUpdateResult.modifiedCount,
      candidatesUnarchived: candidateUpdateResult.modifiedCount,
      assignmentsRestored: usersRestored,
      note: 'User vacancy assignments restored'
    });
  } catch (error) {
    console.error('[POST /publication-ranges/:id/unarchive]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.get('/publication-ranges/:id/statistics', authMiddleware, async (req, res) => {
  try {
    const publicationRange = await PublicationRange.findById(req.params.id);
    if (!publicationRange) return res.status(404).json({ message: 'Publication range not found' });

    const [vacancyCount, candidateCount, candidatesByStatus] = await Promise.all([
      Vacancy.countDocuments({ publicationRangeId: publicationRange._id }),
      Candidate.countDocuments({ publicationRangeId: publicationRange._id }),
      Candidate.aggregate([
        { $match: { publicationRangeId: publicationRange._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    const statusBreakdown = { general_list: 0, long_list: 0, for_review: 0, disqualified: 0 };
    candidatesByStatus.forEach(item => { statusBreakdown[item._id] = item.count; });

    res.json({
      publicationRange: { id: publicationRange._id, name: publicationRange.name, isArchived: publicationRange.isArchived, isActive: publicationRange.isActive },
      statistics: { totalVacancies: vacancyCount, totalCandidates: candidateCount, candidatesByStatus: statusBreakdown }
    });
  } catch (error) {
    console.error('[GET /publication-ranges/:id/statistics]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

// Generic /:id routes LAST
router.get('/publication-ranges/:id', authMiddleware, async (req, res) => {
  try {
    const publicationRange = await PublicationRange.findById(req.params.id).populate('archivedBy', 'name email');
    if (!publicationRange) return res.status(404).json({ message: 'Publication range not found' });
    res.json(publicationRange);
  } catch (error) {
    console.error('[GET /publication-ranges/:id]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.put('/publication-ranges/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const { name, tags, startDate, endDate, description, isActive } = req.body;
    const publicationRange = await PublicationRange.findById(req.params.id);
    if (!publicationRange) return res.status(404).json({ message: 'Publication range not found' });
    if (publicationRange.isArchived) return res.status(400).json({ message: 'Cannot update archived publication range' });

    if (name && name !== publicationRange.name) {
      const existingRange = await PublicationRange.findOne({ name });
      if (existingRange) return res.status(400).json({ message: 'A publication range with this name already exists' });
    }

    if (name)                publicationRange.name        = name;
    if (tags !== undefined)  publicationRange.tags        = tags;
    if (startDate)           publicationRange.startDate   = startDate;
    if (endDate)             publicationRange.endDate     = endDate;
    if (description !== undefined) publicationRange.description = description;
    if (isActive !== undefined)    publicationRange.isActive    = isActive;

    await publicationRange.save();
    res.json(publicationRange);
  } catch (error) {
    console.error('[PUT /publication-ranges/:id]', error);
    if (error.message.includes('End date must be after start date')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

router.delete('/publication-ranges/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const publicationRange = await PublicationRange.findById(req.params.id);
    if (!publicationRange) return res.status(404).json({ message: 'Publication range not found' });

    const [vacancyCount, candidateCount] = await Promise.all([
      Vacancy.countDocuments({ publicationRangeId: publicationRange._id }),
      Candidate.countDocuments({ publicationRangeId: publicationRange._id })
    ]);

    if (vacancyCount > 0) {
      return res.status(400).json({ message: `Cannot delete publication range with ${vacancyCount} associated vacancies. Archive instead.` });
    }
    if (candidateCount > 0) {
      return res.status(400).json({ message: `Cannot delete publication range with ${candidateCount} associated candidates. Archive instead.` });
    }

    await PublicationRange.findByIdAndDelete(req.params.id);
    res.json({ message: 'Publication range deleted successfully' });
  } catch (error) {
    console.error('[DELETE /publication-ranges/:id]', error);
    res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? 'Server error: ' + error.message : 'Server error' });
  }
});

export default router;