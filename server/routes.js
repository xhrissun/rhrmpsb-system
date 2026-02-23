import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { parse } from 'csv-parse/sync';
import { User, Vacancy, Candidate, Competency, Rating, RatingLog, PublicationRange } from './models.js';

const router = express.Router();

// ─── Authentication middleware (unchanged) ────────────────────────────────────
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

// ─── CSV parser (unchanged) ───────────────────────────────────────────────────
const parseCSV = (buffer) => {
  try {
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

// ─── NEW: Fuzzy-match helpers ─────────────────────────────────────────────────

/**
 * Strips noise from a competency name so cosmetic differences
 * (extra spaces, punctuation, capitalisation) don't fool the matcher.
 */
const normalizeCompetencyName = (name) =>
  name
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')            // collapse whitespace
    .replace(/[^A-Z0-9\s()\/]/g, '') // keep only letters, digits, parens, slash
    .trim();

/**
 * Returns a 0–1 similarity score between two strings using
 * Levenshtein distance on their normalised forms.
 * 1.0 = identical after normalisation.
 */
const stringSimilarity = (a, b) => {
  const na = normalizeCompetencyName(a);
  const nb = normalizeCompetencyName(b);
  if (na === nb) return 1.0;

  const longer  = na.length >= nb.length ? na : nb;
  const shorter = na.length >= nb.length ? nb : na;
  if (longer.length === 0) return 1.0;

  // Build Levenshtein matrix
  const m = Array.from({ length: shorter.length + 1 }, (_, i) =>
    Array.from({ length: longer.length + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= shorter.length; i++) {
    for (let j = 1; j <= longer.length; j++) {
      m[i][j] =
        shorter[i - 1] === longer[j - 1]
          ? m[i - 1][j - 1]
          : 1 + Math.min(m[i - 1][j - 1], m[i][j - 1], m[i - 1][j]);
    }
  }

  return (longer.length - m[shorter.length][longer.length]) / longer.length;
};

/** 85 % similarity → treated as the same competency */
const SIMILARITY_THRESHOLD = 0.85;

// ─── In-memory upload log store ───────────────────────────────────────────────
// Keyed by uploadId; auto-expires after 1 hour.
const _uploadLogs = {};

const pruneOldLogs = () => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const key of Object.keys(_uploadLogs)) {
    if (_uploadLogs[key].uploadedAt.getTime() < cutoff) delete _uploadLogs[key];
  }
};


// Auth Routes
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: user.toJSON() });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/auth/me', authMiddleware, async (req, res) => {
  res.json(req.user);
});

// User Routes
router.get('/users', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/users/raters', authMiddleware, async (req, res) => {
  try {
    const raters = await User.findRaters();
    res.json(raters);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Updated user creation route in routes.js
router.post('/users', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    const { name, email, password, userType, raterType, position, designation, administrativePrivilege } = req.body;
    
    // Validate required fields
    if (!name || !email || !password || !userType) {
      return res.status(400).json({ message: 'Missing required fields: name, email, password, userType' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user data object with proper defaults
    const userData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      userType,
      administrativePrivilege: administrativePrivilege || false
    };
    
    // Only add optional fields if they have valid values
    if (raterType && raterType.trim() !== '') {
      userData.raterType = raterType.trim();
    }
    if (position && position.trim() !== '') {
      userData.position = position.trim();
    }
    if (designation && designation.trim() !== '') {
      userData.designation = designation.trim();
    }
    
    // Create and save the user
    const user = new User(userData);
    await user.save();
    
    // Return user without password
    res.status(201).json(user.toJSON());
    
  } catch (error) {
    console.error('User creation error:', error);
    
    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation error: ' + messages.join(', ') });
    }
    
    res.status(500).json({ 
      message: 'Server error during user creation', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// UPDATE: Modify the existing user update route to handle vacancy assignments
router.put('/users/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    // Handle vacancy assignment updates
    const updateData = { ...req.body };
    
    // Ensure vacancy assignment fields are properly handled
    if (updateData.assignedVacancies) {
      if (updateData.assignedVacancies === 'all') {
        updateData.assignedAssignment = null;
        updateData.assignedItemNumbers = [];
      } else if (updateData.assignedVacancies === 'assignment') {
        updateData.assignedItemNumbers = [];
      } else if (updateData.assignedVacancies === 'specific') {
        updateData.assignedAssignment = null;
      }
    }
    
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    res.json(user);
  } catch (error) {
    console.error('User update error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

router.delete('/users/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Vacancy Routes
router.get('/vacancies', authMiddleware, async (req, res) => {
  try {
    const vacancies = await Vacancy.find();
    res.json(vacancies);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/vacancies/:id', authMiddleware, async (req, res) => {
  try {
    const vacancy = await Vacancy.findById(req.params.id);
    if (!vacancy) {
      return res.status(404).json({ message: 'Vacancy not found' });
    }
    res.json(vacancy);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/vacancies', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    // Ensure qualifications object has default empty strings
    const vacancyData = {
      ...req.body,
      qualifications: {
        education: req.body.qualifications?.education || '',
        training: req.body.qualifications?.training || '',
        experience: req.body.qualifications?.experience || '',
        eligibility: req.body.qualifications?.eligibility || ''
      }
    };
    const vacancy = new Vacancy(vacancyData);
    await vacancy.save();
    res.json(vacancy);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/vacancies/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const vacancy = await Vacancy.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(vacancy);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/vacancies/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    await Vacancy.findByIdAndDelete(req.params.id);
    res.json({ message: 'Vacancy deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// In routes.js, update the vacancy CSV upload route (around line 350):

router.post('/vacancies/upload-csv/:publicationRangeId', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    if (!req.files || !req.files.csv) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Verify publication range exists
    const publicationRange = await PublicationRange.findById(req.params.publicationRangeId);
    if (!publicationRange) {
      return res.status(404).json({ message: 'Publication range not found' });
    }
    
    if (publicationRange.isArchived) {
      return res.status(400).json({ message: 'Cannot import to archived publication range' });
    }
    
    const vacanciesData = parseCSV(req.files.csv.data);
    const processedVacancies = vacanciesData.map(vacancy => ({
      itemNumber: vacancy.itemNumber || '',
      position: vacancy.position || '',
      assignment: vacancy.assignment || '',
      salaryGrade: vacancy.salaryGrade || 1,
      publicationRangeId: publicationRange._id,
      qualifications: {
        education: vacancy.education || '',
        training: vacancy.training || '',
        experience: vacancy.experience || '',
        eligibility: vacancy.eligibility || ''
      }
    }));

    // Check for duplicates against ACTIVE vacancies in this publication range
    const existingItemNumbers = await Vacancy.find({
      publicationRangeId: publicationRange._id,
      isArchived: false
    }).distinct('itemNumber');
    
    const existingSet = new Set(existingItemNumbers);
    const duplicates = processedVacancies.filter(v => existingSet.has(v.itemNumber));
    
    if (duplicates.length > 0) {
      return res.status(400).json({
        message: 'Duplicate item numbers found in this publication range',
        duplicates: duplicates.map(d => d.itemNumber)
      });
    }

    // For each vacancy to upload, check if it exists as ARCHIVED
    // If archived, unarchive vacancy + competencies only
    // Candidates, ratings, logs tied to that vacancy remain archived — nothing is deleted
    const unarchived = [];
    const toInsert = [];

    for (const v of processedVacancies) {
      const archivedVacancy = await Vacancy.findOne({
        itemNumber: v.itemNumber,
        publicationRangeId: publicationRange._id,
        isArchived: true
      });

      if (archivedVacancy) {
        // Unarchive the vacancy only — no other records are touched or deleted
        await Vacancy.findByIdAndUpdate(archivedVacancy._id, {
          isArchived: false,
          archivedAt: null,
          archivedBy: null
        });

        // Unarchive competencies linked to this vacancy only
        // Candidates, ratings, and audit logs remain archived and untouched
        await Competency.updateMany(
          {
            $or: [
              { vacancyId: archivedVacancy._id },
              { vacancyIds: archivedVacancy._id }
            ]
          },
          {
            $set: {
              isArchived: false,
              archivedAt: null,
              archivedBy: null
            }
          }
        );

        unarchived.push(v.itemNumber);
      } else {
        toInsert.push(v);
      }
    }

    if (toInsert.length > 0) {
      await Vacancy.insertMany(toInsert);
    }

    res.json({
      message: `Vacancies uploaded successfully. ${toInsert.length} created, ${unarchived.length} unarchived.`,
      created: toInsert.length,
      unarchived: unarchived.length,
      unarchivedItemNumbers: unarchived
    });

  } catch (error) {
    console.error('CSV upload error:', error);
    res.status(500).json({ message: 'Failed to upload CSV: ' + error.message });
  }
});

// Candidate Routes
router.get('/candidates', authMiddleware, async (req, res) => {
  try {
    const candidates = await Candidate.find();
    res.json(candidates);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Export all candidates summary as CSV (no position filtering)
router.get('/candidates/export-summary-csv', authMiddleware, async (req, res) => {
  try {
    // Get ALL candidates without any filtering
    const candidates = await Candidate.find()
      .sort({ fullName: 1 });
    
    if (candidates.length === 0) {
      return res.status(404).json({ message: 'No candidates found for export' });
    }
    
    // Get all vacancies to map item numbers to positions
    const vacancies = await Vacancy.find({}, 'itemNumber position');
    const itemNumberToPosition = {};
    vacancies.forEach(v => {
      itemNumberToPosition[v.itemNumber] = v.position;
    });
    
    // CSV headers - simplified version
    const headers = [
      'Full Name',
      'Gender',
      'Item Number',
      'Position Applied',
      'Status',
      'Education Comments',
      'Training Comments',
      'Experience Comments',
      'Eligibility Comments'
    ];
    
    // Build CSV rows
    const rows = candidates.map(candidate => {
      const position = itemNumberToPosition[candidate.itemNumber] || 'N/A';
      
      return [
        candidate.fullName || '',
        candidate.gender || '',
        candidate.itemNumber || '',
        position,
        candidate.status || '',
        candidate.comments?.education || '',
        candidate.comments?.training || '',
        candidate.comments?.experience || '',
        candidate.comments?.eligibility || ''
      ];
    });
    
    // Escape CSV values (handle commas, quotes, and newlines)
    const escapeCsvValue = (value) => {
      if (value == null) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };
    
    // Build CSV content
    const csvContent = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map(row => row.map(escapeCsvValue).join(','))
    ].join('\n');
    
    // Set response headers for CSV download
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `candidates_summary_${timestamp}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\ufeff' + csvContent); // Add BOM for Excel compatibility
    
  } catch (error) {
    console.error('CSV summary export error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});



// Export candidates as CSV
router.get('/candidates/export-csv', authMiddleware, async (req, res) => {
  try {
    const { itemNumber, assignment, position } = req.query;
    
    // Build filter based on query parameters
    let filter = {};
    if (itemNumber) {
      filter.itemNumber = itemNumber;
    } else if (position && assignment) {
      // Get all item numbers for this position and assignment
      const vacancies = await Vacancy.find({ assignment, position }, 'itemNumber');
      const itemNumbers = vacancies.map(v => v.itemNumber);
      filter.itemNumber = { $in: itemNumbers };
    } else if (assignment) {
      // Get all item numbers for this assignment
      const vacancies = await Vacancy.find({ assignment }, 'itemNumber');
      const itemNumbers = vacancies.map(v => v.itemNumber);
      filter.itemNumber = { $in: itemNumbers };
    }
    
    // Get candidates with filter and populate comment history
    const candidates = await Candidate.find(filter)
      .populate('commentsHistory.commentedBy', 'name')
      .sort({ fullName: 1 });
    
    if (candidates.length === 0) {
      return res.status(404).json({ message: 'No candidates found for export' });
    }
    
    // CSV headers with comment history
    const headers = [
      'Full Name',
      'Item Number',
      'Gender',
      'Date of Birth',
      'Age',
      'Eligibility',
      'Status',
      'Education Comments',
      'Education Last Updated By',
      'Education Last Updated At',
      'Training Comments',
      'Training Last Updated By',
      'Training Last Updated At',
      'Experience Comments',
      'Experience Last Updated By',
      'Experience Last Updated At',
      'Eligibility Comments',
      'Eligibility Last Updated By',
      'Eligibility Last Updated At',
      'Professional License',
      'Letter of Intent',
      'Personal Data Sheet',
      'Work Experience Sheet',
      'Proof of Eligibility',
      'Certificates',
      'IPCR',
      'Certificate of Employment',
      'Diploma',
      'Transcript of Records'
    ];
    
    // Helper function to get last commenter info
    const getLastCommenterInfo = (candidate, field) => {
      const fieldHistory = candidate.commentsHistory
        .filter(h => h.field === field)
        .sort((a, b) => new Date(b.commentedAt) - new Date(a.commentedAt));
      
      if (fieldHistory.length > 0) {
        return {
          name: fieldHistory[0].commentedBy?.name || 'Unknown',
          date: new Date(fieldHistory[0].commentedAt).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        };
      }
      return { name: 'N/A', date: 'N/A' };
    };
    
    // Build CSV rows
    const rows = candidates.map(candidate => {
      const eduInfo = getLastCommenterInfo(candidate, 'education');
      const trainInfo = getLastCommenterInfo(candidate, 'training');
      const expInfo = getLastCommenterInfo(candidate, 'experience');
      const eligInfo = getLastCommenterInfo(candidate, 'eligibility');
      
      return [
        candidate.fullName || '',
        candidate.itemNumber || '',
        candidate.gender || '',
        candidate.dateOfBirth ? new Date(candidate.dateOfBirth).toLocaleDateString() : '',
        candidate.age || '',
        candidate.eligibility || '',
        candidate.status || '',
        candidate.comments?.education || '',
        eduInfo.name,
        eduInfo.date,
        candidate.comments?.training || '',
        trainInfo.name,
        trainInfo.date,
        candidate.comments?.experience || '',
        expInfo.name,
        expInfo.date,
        candidate.comments?.eligibility || '',
        eligInfo.name,
        eligInfo.date,
        candidate.professionalLicense || '',
        candidate.letterOfIntent || '',
        candidate.personalDataSheet || '',
        candidate.workExperienceSheet || '',
        candidate.proofOfEligibility || '',
        candidate.certificates || '',
        candidate.ipcr || '',
        candidate.certificateOfEmployment || '',
        candidate.diploma || '',
        candidate.transcriptOfRecords || ''
      ];
    });
    
    // Escape CSV values (handle commas, quotes, and newlines)
    const escapeCsvValue = (value) => {
      if (value == null) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };
    
    // Build CSV content
    const csvContent = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map(row => row.map(escapeCsvValue).join(','))
    ].join('\n');
    
    // Set response headers for CSV download
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = itemNumber 
      ? `candidates_${itemNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.csv`
      : `candidates_export_${timestamp}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\ufeff' + csvContent); // Add BOM for Excel compatibility
    
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

router.get('/candidates/:id', authMiddleware, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id)
      .populate('commentsHistory.commentedBy', 'name userType')
      .populate('statusHistory.changedBy', 'name userType');
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    res.json(candidate);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/candidates/item/:itemNumber', authMiddleware, async (req, res) => {
  try {
    const itemNumber = decodeURIComponent(req.params.itemNumber);
    const candidates = await Candidate.find({ itemNumber })
      .populate('commentsHistory.commentedBy', 'name userType')
      .populate('statusHistory.changedBy', 'name userType')
      .sort({ fullName: 1 });
    res.json(candidates);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Updated Candidate Routes in routes.js

router.post('/candidates', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    // Validate required fields before creating
    if (!req.body.fullName || req.body.fullName.trim() === '') {
      return res.status(400).json({ message: 'Full name is required' });
    }
    if (!req.body.itemNumber || req.body.itemNumber.trim() === '') {
      return res.status(400).json({ message: 'Item number is required' });
    }
    if (!req.body.gender || req.body.gender.trim() === '') {
      return res.status(400).json({ message: 'Gender is required' });
    }

    // Ensure all URL fields are explicitly set with defaults
    const candidateData = {
      fullName: req.body.fullName.trim(),
      itemNumber: req.body.itemNumber.trim(),
      gender: req.body.gender.trim(),
      dateOfBirth: req.body.dateOfBirth || null,
      age: req.body.age || null,
      eligibility: req.body.eligibility || '',
      professionalLicense: req.body.professionalLicense || '',
      letterOfIntent: req.body.letterOfIntent || '',
      personalDataSheet: req.body.personalDataSheet || '',
      workExperienceSheet: req.body.workExperienceSheet || '',
      proofOfEligibility: req.body.proofOfEligibility || '',
      certificates: req.body.certificates || '',
      ipcr: req.body.ipcr || '',
      certificateOfEmployment: req.body.certificateOfEmployment || '',
      diploma: req.body.diploma || '',
      transcriptOfRecords: req.body.transcriptOfRecords || '',
      status: req.body.status || 'general_list',
      comments: {
        education: req.body.comments?.education || '',
        training: req.body.comments?.training || '',
        experience: req.body.comments?.experience || '',
        eligibility: req.body.comments?.eligibility || ''
      }
    };

    const candidate = new Candidate(candidateData);
    await candidate.save();
    res.json(candidate);
  } catch (error) {
    console.error('Error creating candidate:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => `${err.path}: ${err.message}`);
      return res.status(400).json({ 
        message: 'Validation error: ' + messages.join(', '),
        errors: error.errors
      });
    }
    
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

router.put('/candidates/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin' && req.user.userType !== 'secretariat') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const currentCandidate = await Candidate.findById(req.params.id);
    if (!currentCandidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    const updateData = {};
    
    // Handle required fields
    if (req.body.fullName && req.body.fullName.trim() !== '') {
      updateData.fullName = req.body.fullName.trim();
    }
    if (req.body.itemNumber && req.body.itemNumber.trim() !== '') {
      updateData.itemNumber = req.body.itemNumber.trim();
    }
    if (req.body.gender && req.body.gender.trim() !== '') {
      updateData.gender = req.body.gender.trim();
    }

    // Handle optional fields
    if (req.body.hasOwnProperty('dateOfBirth')) {
      updateData.dateOfBirth = req.body.dateOfBirth || null;
    }
    if (req.body.hasOwnProperty('age')) {
      updateData.age = req.body.age || null;
    }
    if (req.body.hasOwnProperty('eligibility')) {
      updateData.eligibility = req.body.eligibility || '';
    }
    if (req.body.hasOwnProperty('professionalLicense')) {
      updateData.professionalLicense = req.body.professionalLicense || '';
    }
    if (req.body.hasOwnProperty('letterOfIntent')) {
      updateData.letterOfIntent = req.body.letterOfIntent || '';
    }
    if (req.body.hasOwnProperty('personalDataSheet')) {
      updateData.personalDataSheet = req.body.personalDataSheet || '';
    }
    if (req.body.hasOwnProperty('workExperienceSheet')) {
      updateData.workExperienceSheet = req.body.workExperienceSheet || '';
    }
    if (req.body.hasOwnProperty('proofOfEligibility')) {
      updateData.proofOfEligibility = req.body.proofOfEligibility || '';
    }
    if (req.body.hasOwnProperty('certificates')) {
      updateData.certificates = req.body.certificates || '';
    }
    if (req.body.hasOwnProperty('ipcr')) {
      updateData.ipcr = req.body.ipcr || '';
    }
    if (req.body.hasOwnProperty('certificateOfEmployment')) {
      updateData.certificateOfEmployment = req.body.certificateOfEmployment || '';
    }
    if (req.body.hasOwnProperty('diploma')) {
      updateData.diploma = req.body.diploma || '';
    }
    if (req.body.hasOwnProperty('transcriptOfRecords')) {
      updateData.transcriptOfRecords = req.body.transcriptOfRecords || '';
    }

    // NEW: Track status changes
    if (req.body.hasOwnProperty('status')) {
      const newStatus = req.body.status || 'general_list';
      const oldStatus = currentCandidate.status;
      
      updateData.status = newStatus;
      
      // Only add to history if status actually changed
      if (newStatus !== oldStatus) {
        const statusHistoryEntry = {
          oldStatus: oldStatus,
          newStatus: newStatus,
          changedBy: req.user._id,
          changedAt: new Date(),
          reason: req.body.statusChangeReason || '' // Optional reason
        };
        
        updateData.$push = updateData.$push || {};
        updateData.$push.statusHistory = statusHistoryEntry;
      }
    }

    // Handle comments with history tracking
    if (req.body.comments) {
      const newComments = {
        education: req.body.comments.education || '',
        training: req.body.comments.training || '',
        experience: req.body.comments.experience || '',
        eligibility: req.body.comments.eligibility || ''
      };
      
      updateData.comments = newComments;
      
      // Track changes in commentsHistory
      const historyEntries = [];
      const fields = ['education', 'training', 'experience', 'eligibility'];
      
      fields.forEach(field => {
        const oldComment = currentCandidate.comments?.[field] || '';
        const newComment = newComments[field] || '';
        
        // Only add to history if comment actually changed
        if (newComment !== oldComment && newComment.trim() !== '') {
          historyEntries.push({
            field: field,
            comment: newComment,
            status: updateData.status || currentCandidate.status,
            commentedBy: req.user._id,
            commentedAt: new Date()
          });
        }
      });
      
      // Add comment history entries if any comments changed
      if (historyEntries.length > 0) {
        updateData.$push = updateData.$push || {};
        updateData.$push.commentsHistory = { $each: historyEntries };
      }
    }

    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    )
    .populate('commentsHistory.commentedBy', 'name userType')
    .populate('statusHistory.changedBy', 'name userType');
    
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    
    res.json(candidate);
  } catch (error) {
    console.error('Error updating candidate:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => `${err.path}: ${err.message}`);
      return res.status(400).json({ 
        message: 'Validation error: ' + messages.join(', '),
        errors: error.errors
      });
    }
    
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

router.delete('/candidates/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    await Candidate.findByIdAndDelete(req.params.id);
    res.json({ message: 'Candidate deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/candidates/upload-csv', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    if (!req.files || !req.files.csv) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const candidatesData = parseCSV(req.files.csv.data);
    const processedCandidates = candidatesData.map(candidate => ({
      fullName: candidate.fullName || '',
      itemNumber: candidate.itemNumber || '',
      gender: candidate.gender || '',
      dateOfBirth: candidate.dateOfBirth || null,
      age: candidate.age || null,
      eligibility: candidate.eligibility || '',
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
      status: candidate.status || 'general_list',
      comments: {
        education: candidate.educationComments || '',
        training: candidate.trainingComments || '',
        experience: candidate.experienceComments || '',
        eligibility: candidate.eligibilityComments || ''
      }
    }));
    
    await Candidate.insertMany(processedCandidates);
    res.json({ message: 'Candidates uploaded successfully' });
  } catch (error) {
    console.error('CSV upload error:', error);
    res.status(500).json({ message: 'Failed to upload CSV: ' + error.message });
  }
});

// Competency Routes
router.get('/competencies', authMiddleware, async (req, res) => {
  try {
    const competencies = await Competency.find();
    res.json(competencies);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/competencies/vacancy/:vacancyId', authMiddleware, async (req, res) => {
  try {
    const competencies = await Competency.findByVacancy(req.params.vacancyId);
    res.json(competencies);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/competencies/:id', authMiddleware, async (req, res) => {
  try {
    const competency = await Competency.findById(req.params.id);
    if (!competency) {
      return res.status(404).json({ message: 'Competency not found' });
    }
    res.json(competency);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/competencies', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const competency = new Competency(req.body);
    await competency.save();
    res.json(competency);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/competencies/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const competency = await Competency.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(competency);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/competencies/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    await Competency.findByIdAndDelete(req.params.id);
    res.json({ message: 'Competency deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Updated competencies upload route with support for multiple vacancies
router.post('/competencies/upload-csv', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin')
    return res.status(403).json({ message: 'Access denied' });

  try {
    if (!req.files?.csv)
      return res.status(400).json({ message: 'No file uploaded' });

    const rows   = parseCSV(req.files.csv.data);
    const errors = [];

    // Load every existing competency for fuzzy matching.
    // Archive status is IRRELEVANT here — we match by name+type only.
    const existingCompetencies = await Competency.find({});

    const uploadLog = {
      uploadedAt  : new Date(),
      uploadedBy  : req.user._id,
      createdIds  : [],  // _id strings of brand-new competencies
      updatedChanges: [] // { competencyId, previousVacancyIds, previousVacancyId, addedVacancyIds }
    };

    const results = { created: [], merged: [], skipped: [] };

    for (const row of rows) {
      // ── Basic validation ──────────────────────────────────────────────────
      if (!row.name || !row.type) {
        errors.push(`Missing name/type: ${JSON.stringify(row)}`);
        continue;
      }

      const rowType = row.type.trim().toLowerCase();
      const validTypes = ['basic', 'organizational', 'leadership', 'minimum'];
      if (!validTypes.includes(rowType)) {
        errors.push(`Invalid type '${row.type}' for: ${row.name}`);
        continue;
      }

      // ── Resolve vacancy IDs ───────────────────────────────────────────────
      // Only ACTIVE (non-archived) vacancies are touched.
      // Archived vacancies keep their competency links untouched.
      const vacancyIds = [];
      if (row.vacancyItemNumbers?.trim()) {
        const itemNumbers = row.vacancyItemNumbers
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean);

        for (const itemNumber of itemNumbers) {
          const vacancy = await Vacancy.findOne({
            itemNumber,
            isArchived: { $ne: true }, // skip archived vacancies
          });
          if (!vacancy) {
            errors.push(`Active vacancy '${itemNumber}' not found for: ${row.name}`);
            continue;
          }
          vacancyIds.push(vacancy._id.toString());
        }
      }

      const isFixed =
        row.isFixed === true ||
        row.isFixed?.toString().toLowerCase() === 'true' ||
        row.isFixed === '1';

      // ── Fuzzy match against existing competencies ─────────────────────────
      let bestMatch = null;
      let bestScore = 0;

      for (const existing of existingCompetencies) {
        if (existing.type !== rowType) continue; // type must match
        const score = stringSimilarity(row.name, existing.name);
        if (score >= SIMILARITY_THRESHOLD && score > bestScore) {
          bestScore = score;
          bestMatch = existing;
        }
      }

      // ── MERGE path ────────────────────────────────────────────────────────
      if (bestMatch) {
        // Collect the existing vacancy ID list (normalise legacy single-id format)
        const existingVacancyIds = [];
        if (Array.isArray(bestMatch.vacancyIds) && bestMatch.vacancyIds.length > 0) {
          bestMatch.vacancyIds.forEach((id) => existingVacancyIds.push(id.toString()));
        } else if (bestMatch.vacancyId) {
          existingVacancyIds.push(bestMatch.vacancyId.toString());
        }

        const newVacancyIds = vacancyIds.filter(
          (id) => !existingVacancyIds.includes(id)
        );

        if (newVacancyIds.length > 0) {
          // Record state before change (for undo)
          uploadLog.updatedChanges.push({
            competencyId      : bestMatch._id.toString(),
            previousVacancyIds: [...existingVacancyIds],
            previousVacancyId : bestMatch.vacancyId
              ? bestMatch.vacancyId.toString()
              : null,
            addedVacancyIds   : newVacancyIds,
          });

          const mergedObjectIds = [
            ...existingVacancyIds,
            ...newVacancyIds,
          ].map((id) => new mongoose.Types.ObjectId(id));

          await Competency.findByIdAndUpdate(bestMatch._id, {
            vacancyIds: mergedObjectIds,
            vacancyId : null, // normalise to array format
          });

          results.merged.push({
            existingName   : bestMatch.name,
            uploadedName   : row.name,
            similarity     : Math.round(bestScore * 100),
            addedItemCount : newVacancyIds.length,
          });
        } else {
          results.skipped.push({
            name  : row.name,
            reason: `Matched '${bestMatch.name}' (${Math.round(bestScore * 100)}% similar) — no new vacancies to add`,
          });
        }

        continue; // don't fall through to create
      }

      // ── CREATE path ───────────────────────────────────────────────────────
      const data = { name: row.name.trim(), type: rowType, isFixed };

      if (vacancyIds.length > 1) {
        data.vacancyIds = vacancyIds.map((id) => new mongoose.Types.ObjectId(id));
        data.vacancyId  = null;
      } else if (vacancyIds.length === 1) {
        data.vacancyId  = new mongoose.Types.ObjectId(vacancyIds[0]);
        data.vacancyIds = [];
      } else {
        data.vacancyId  = null;
        data.vacancyIds = [];
      }

      const created = new Competency(data);
      await created.save();

      uploadLog.createdIds.push(created._id.toString());
      results.created.push({ name: row.name });
    }

    // ── Return validation errors before persisting anything ───────────────
    // NOTE: Since we write row-by-row above we detect errors eagerly.
    // If you want atomic all-or-nothing, wrap in a MongoDB session/transaction.
    if (errors.length > 0) {
      return res.status(400).json({ message: 'CSV validation failed', errors });
    }

    // ── Save upload log for undo ───────────────────────────────────────────
    pruneOldLogs();
    const uploadId = `comp_${Date.now()}_${req.user._id}`;
    _uploadLogs[uploadId] = uploadLog;

    return res.json({
      message     : `Upload complete: ${results.created.length} created, ${results.merged.length} merged, ${results.skipped.length} skipped`,
      uploadId,
      results,
      canUndo     : true,
      undoExpiresIn: '1 hour',
    });
  } catch (error) {
    console.error('Competency CSV upload error:', error);
    res.status(500).json({ message: 'Failed to upload CSV: ' + error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE 2 (NEW): POST /competencies/undo-upload/:uploadId
// ═══════════════════════════════════════════════════════════════════════════

router.post('/competencies/undo-upload/:uploadId', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin')
    return res.status(403).json({ message: 'Access denied' });

  try {
    const log = _uploadLogs[req.params.uploadId];
    if (!log) {
      return res.status(404).json({
        message: 'Upload log not found or has expired (logs expire after 1 hour)',
      });
    }

    let deletedCount  = 0;
    let revertedCount = 0;

    // 1. Delete brand-new competencies
    if (log.createdIds.length > 0) {
      const result = await Competency.deleteMany({
        _id: { $in: log.createdIds.map((id) => new mongoose.Types.ObjectId(id)) },
      });
      deletedCount = result.deletedCount;
    }

    // 2. Revert merged competencies to their previous vacancy-id state.
    //    Archived competencies are unaffected — we only touch the IDs we changed.
    for (const change of log.updatedChanges) {
      const prev = change.previousVacancyIds ?? [];

      let updatePayload;
      if (prev.length > 1) {
        updatePayload = {
          vacancyIds: prev.map((id) => new mongoose.Types.ObjectId(id)),
          vacancyId : null,
        };
      } else if (prev.length === 1) {
        updatePayload = {
          vacancyId : new mongoose.Types.ObjectId(prev[0]),
          vacancyIds: [],
        };
      } else {
        // Was originally empty / single-id format before upload
        updatePayload = {
          vacancyId : change.previousVacancyId
            ? new mongoose.Types.ObjectId(change.previousVacancyId)
            : null,
          vacancyIds: [],
        };
      }

      await Competency.findByIdAndUpdate(
        new mongoose.Types.ObjectId(change.competencyId),
        updatePayload
      );
      revertedCount++;
    }

    delete _uploadLogs[req.params.uploadId];

    res.json({
      message      : `Undo successful: ${deletedCount} deleted, ${revertedCount} reverted`,
      deletedCount,
      revertedCount,
    });
  } catch (error) {
    console.error('Undo upload error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE 3 (NEW): GET /competencies/recent-uploads
// Returns the last 5 upload logs available for undo.
// ═══════════════════════════════════════════════════════════════════════════

router.get('/competencies/recent-uploads', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin')
    return res.status(403).json({ message: 'Access denied' });

  pruneOldLogs();

  const recent = Object.entries(_uploadLogs)
    .map(([uploadId, log]) => ({
      uploadId,
      uploadedAt  : log.uploadedAt,
      createdCount: log.createdIds.length,
      mergedCount : log.updatedChanges.length,
    }))
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .slice(0, 5);

  res.json(recent);
});


// Rating Routes
router.get('/ratings', authMiddleware, async (req, res) => {
  try {
    const ratings = await Rating.find()
      .populate('raterId', 'name raterType')
      .populate('competencyId', 'name type');
    res.json(ratings);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/ratings/candidate/:candidateId', authMiddleware, async (req, res) => {
  try {
    const ratings = await Rating.findByCandidate(req.params.candidateId);
    res.json(ratings);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/ratings/rater/:raterId', authMiddleware, async (req, res) => {
  try {
    const ratings = await Rating.findByRater(req.params.raterId);
    res.json(ratings);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// NEW: Check if ratings exist for candidate + item number + rater type
router.get('/ratings/check-existing/:candidateId/:itemNumber/:raterType', authMiddleware, async (req, res) => {
  try {
    const { candidateId, itemNumber, raterType } = req.params;
    
    // Decode item number in case it has special characters
    const decodedItemNumber = decodeURIComponent(itemNumber);
    
    // Find all users with this rater type
    const ratersOfType = await User.find({ raterType: raterType }).select('_id');
    const raterIds = ratersOfType.map(r => r._id);
    
    // Check if any rater of this type has already rated this candidate for this item number
    const existingRatings = await Rating.find({
      candidateId: candidateId,
      itemNumber: decodedItemNumber,
      raterId: { $in: raterIds }
    }).populate('raterId', 'name raterType');
    
    if (existingRatings.length > 0) {
      // Get the rater who already submitted
      const existingRater = existingRatings[0].raterId;
      
      return res.json({
        hasExisting: true,
        existingRater: {
          id: existingRater._id,
          name: existingRater.name,
          raterType: existingRater.raterType
        },
        ratingCount: existingRatings.length
      });
    }
    
    res.json({ hasExisting: false });
    
  } catch (error) {
    console.error('Check existing ratings error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Updated rating submission route in routes.js
router.post('/ratings/submit', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'rater') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    const { ratings, isUpdate = false } = req.body;
    
    if (!ratings || ratings.length === 0) {
      return res.status(400).json({ message: 'No ratings provided' });
    }

    const missingItemNumber = ratings.some(r => !r.itemNumber);
    if (missingItemNumber) {
      return res.status(400).json({ message: 'All ratings must include itemNumber' });
    }
    
    const candidateIds = [...new Set(ratings.map(r => r.candidateId))];
    const itemNumbers = [...new Set(ratings.map(r => r.itemNumber))];
    
    const existingRatings = await Rating.find({
      candidateId: { $in: candidateIds },
      raterId: req.user._id,
      itemNumber: { $in: itemNumbers }
    });
    
    const hasExistingRatings = existingRatings.length > 0;
    
    if (hasExistingRatings && !isUpdate) {
      return res.status(409).json({ 
        message: 'Existing ratings found for this candidate and item number',
        requiresUpdate: true,
        existingCount: existingRatings.length
      });
    }
    
    // Process each rating with upsert logic
    const results = [];
    const logEntries = [];
    
    for (const ratingData of ratings) {
      const filter = {
        candidateId: ratingData.candidateId,
        raterId: req.user._id,
        competencyId: ratingData.competencyId,
        competencyType: ratingData.competencyType,
        itemNumber: ratingData.itemNumber
      };
      
      const existingRating = await Rating.findOne(filter);
      const newScore = parseInt(ratingData.score);
      
      // FIXED: Only create log entry if score actually changed or it's a new rating
      const shouldLog = !existingRating || existingRating.score !== newScore;
      
      if (!shouldLog) {
        // Skip this rating - no change needed
        continue;
      }
      
      const update = {
        ...filter,
        score: newScore,
        submittedAt: new Date()
      };
      
      const result = await Rating.findOneAndUpdate(
        filter,
        update,
        { 
          upsert: true, 
          new: true,
          setDefaultsOnInsert: true
        }
      );
      
      results.push(result);
      
      // Create audit log entry only for actual changes
      logEntries.push({
        action: existingRating ? 'updated' : 'created',
        ratingId: result._id,
        candidateId: ratingData.candidateId,
        raterId: req.user._id,
        itemNumber: ratingData.itemNumber,
        competencyId: ratingData.competencyId,
        competencyType: ratingData.competencyType,
        oldScore: existingRating?.score || null,
        newScore: newScore,
        performedBy: req.user._id,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      });
    }
    
    // Bulk insert audit logs only for actual changes
    if (logEntries.length > 0) {
      await RatingLog.insertMany(logEntries);
    }
    
    res.json({ 
      message: hasExistingRatings ? 'Ratings updated successfully' : 'Ratings submitted successfully',
      isUpdate: hasExistingRatings,
      ratingsProcessed: results.length,
      changesLogged: logEntries.length
    });
    
  } catch (error) {
    console.error('Rating submission error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});
router.put('/ratings/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'rater') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const rating = await Rating.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(rating);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/ratings/candidate/:candidateId/rater/:raterId', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'rater') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    await Rating.deleteMany({
      candidateId: req.params.candidateId,
      raterId: req.params.raterId,
    });
    res.json({ message: 'Ratings reset successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Also update the delete route to only log actual deletions
router.delete('/ratings/candidate/:candidateId/rater/:raterId/item/:itemNumber', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'rater') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    const { candidateId, raterId, itemNumber } = req.params;
    const decodedItemNumber = decodeURIComponent(itemNumber);
    
    // Get ratings before deleting for audit log
    const ratingsToDelete = await Rating.find({
      candidateId: candidateId,
      raterId: raterId,
      itemNumber: decodedItemNumber
    });
    
    const result = await Rating.deleteMany({
      candidateId: candidateId,
      raterId: raterId,
      itemNumber: decodedItemNumber
    });
    
    // Only create log entries if ratings were actually deleted
    if (ratingsToDelete.length > 0 && result.deletedCount > 0) {
      const logEntries = ratingsToDelete.map(rating => ({
        action: 'deleted',
        ratingId: rating._id,
        candidateId: rating.candidateId,
        raterId: rating.raterId,
        itemNumber: rating.itemNumber,
        competencyId: rating.competencyId,
        competencyType: rating.competencyType,
        oldScore: rating.score,
        performedBy: req.user._id,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      }));
      
      await RatingLog.insertMany(logEntries);
    }
    
    res.json({ 
      message: 'Ratings reset successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Rating deletion error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Report Routes
router.get('/reports/rating/:candidateId', authMiddleware, async (req, res) => {
  try {
    const ratings = await Rating.findByCandidate(req.params.candidateId);
    res.json(ratings);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/reports/candidate/:candidateId', authMiddleware, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.candidateId);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    res.json(candidate);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// NEW: Vacancy Assignment Routes
router.post('/users/:userId/assign-vacancies', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    const { assignmentType, assignedAssignment, assignedItemNumbers } = req.body;
    
    // Validate assignment type
    if (!['none', 'all', 'assignment', 'specific'].includes(assignmentType)) {
      return res.status(400).json({ message: 'Invalid assignment type' });
    }
    
    const updateData = {
      assignedVacancies: assignmentType
    };
    
    // Clear other assignment fields first
    updateData.assignedAssignment = null;
    updateData.assignedItemNumbers = [];
    
    // Set the appropriate field based on assignment type
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
    
    const user = await User.findByIdAndUpdate(
      req.params.userId, 
      updateData, 
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ message: 'Vacancy assignment updated successfully', user });
  } catch (error) {
    console.error('Vacancy assignment error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// NEW: Get user's assigned vacancies
router.get('/users/:userId/assigned-vacancies', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    let assignedVacancies = [];
    
    if (user.assignedVacancies === 'none') {
      assignedVacancies = [];
    } else if (user.assignedVacancies === 'all') {
      assignedVacancies = await Vacancy.find();
    } else if (user.assignedVacancies === 'assignment' && user.assignedAssignment) {
      assignedVacancies = await Vacancy.find({ assignment: user.assignedAssignment });
    } else if (user.assignedVacancies === 'specific' && user.assignedItemNumbers.length > 0) {
      assignedVacancies = await Vacancy.find({ itemNumber: { $in: user.assignedItemNumbers } });
    }
    
    res.json({
      user: {
        id: user._id,
        name: user.name,
        assignedVacancies: user.assignedVacancies,
        assignedAssignment: user.assignedAssignment,
        assignedItemNumbers: user.assignedItemNumbers
      },
      vacancies: assignedVacancies
    });
  } catch (error) {
    console.error('Get assigned vacancies error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Replace the existing /vacancies/assignments route in your routes.js with this simplified version:

router.get('/vacancies/assignments', authMiddleware, async (req, res) => {
  try {
    // Use a simple find() query instead of distinct() or aggregation
    const vacancies = await Vacancy.find({}, 'assignment').lean();
    
    if (vacancies.length === 0) {
      return res.json([]);
    }
    
    // Extract unique assignments using JavaScript Set
    const assignments = [...new Set(
      vacancies
        .map(v => v.assignment)
        .filter(a => a && typeof a === 'string' && a.trim() !== '')
        .map(a => a.trim())
    )].sort();
    
    res.json(assignments);
    
  } catch (error) {
    console.error('Assignments route error:', error.message);
    res.status(500).json({ 
      message: 'Failed to fetch assignments', 
      error: error.message 
    });
  }
});

// Auth Routes
router.post('/auth/verify-password', authMiddleware, async (req, res) => {
  const { userId, password } = req.body;

  // Ensure the requesting user is either the same user or an admin
  if (req.user._id.toString() !== userId && req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    res.json({ isValid: isMatch });
  } catch (error) {
    console.error('Password verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add this route to your routes.js
router.put('/users/:id/change-password', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(req.params.id, { password: hashedPassword });
    
    res.json({ 
      message: `Password updated successfully for ${user.name}`,
      userName: user.name
    });
    
  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Comment suggestions route with configurable limit
router.get('/candidates/comment-suggestions/:field', authMiddleware, async (req, res) => {
  try {
    const { field } = req.params;
    const { limit = 250 } = req.query; // Default to 100, can be overridden via query param
    
    const validFields = ['education', 'training', 'experience', 'eligibility'];
    
    if (!validFields.includes(field)) {
      return res.status(400).json({ message: 'Invalid field' });
    }
    
    // Parse and validate limit
    const maxSuggestions = Math.min(Math.max(parseInt(limit) || 100, 1), 500);
    
    // Fetch candidates with comments in the specified field
    const candidates = await Candidate.find(
      { [`comments.${field}`]: { $exists: true, $ne: '' } },
      { [`comments.${field}`]: 1 }
    ).limit(1000); // Increase candidate fetch limit for better data
    
    const commentFrequency = {};
    
    candidates.forEach(c => {
      const comment = c.comments?.[field];
      if (comment && comment.trim() !== '') {
        // SUPER AGGRESSIVE normalization:
        const normalized = comment
          .trim()                              // Remove leading/trailing spaces
          .replace(/\s+/g, ' ')               // Collapse multiple spaces
          .replace(/\s*(,.:;!?)\s*/g, '$1') // Remove spaces around punctuation
          .replace(/([(),.:;!?])+/g, '$1')    // Remove duplicate punctuation
          .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
          .replace(/\u00A0/g, ' ')            // Replace non-breaking spaces with regular spaces
          .normalize('NFKC')                  // Unicode normalization
          .toUpperCase();                     // Convert to uppercase
        
        commentFrequency[normalized] = (commentFrequency[normalized] || 0) + 1;
      }
    });
    
    // Sort by frequency and return top N suggestions
    const suggestions = Object.entries(commentFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxSuggestions)
      .map(([comment]) => comment);
    
    res.json(suggestions);
    
  } catch (error) {
    console.error('Comment suggestions error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Rating Audit Log Routes
router.get('/rating-logs', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin' && !req.user.administrativePrivilege) {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    const { candidateId, raterId, itemNumber, action, limit = 100, skip = 0 } = req.query;
    
    const filter = {};
    if (candidateId) filter.candidateId = candidateId;
    if (raterId) filter.raterId = raterId;
    if (itemNumber) filter.itemNumber = itemNumber;
    if (action) filter.action = action;
    
    const logs = await RatingLog.find(filter)
      .populate('candidateId', 'fullName itemNumber')
      .populate('raterId', 'name raterType email')
      .populate('performedBy', 'name userType')
      .populate('competencyId', 'name type')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    const total = await RatingLog.countDocuments(filter);
    
    res.json({
      logs,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    console.error('Failed to fetch rating logs:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get rating logs summary statistics
router.get('/rating-logs/stats', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin' && !req.user.administrativePrivilege) {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    const stats = await RatingLog.aggregate([
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const raterActivity = await RatingLog.aggregate([
      {
        $group: {
          _id: '$raterId',
          totalActions: { $sum: 1 },
          created: {
            $sum: { $cond: [{ $eq: ['$action', 'created'] }, 1, 0] }
          },
          updated: {
            $sum: { $cond: [{ $eq: ['$action', 'updated'] }, 1, 0] }
          },
          deleted: {
            $sum: { $cond: [{ $eq: ['$action', 'deleted'] }, 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'rater'
        }
      },
      {
        $unwind: '$rater'
      },
      {
        $project: {
          raterId: '$_id',
          raterName: '$rater.name',
          raterType: '$rater.raterType',
          totalActions: 1,
          created: 1,
          updated: 1,
          deleted: 1
        }
      },
      {
        $sort: { totalActions: -1 }
      }
    ]);
    
    res.json({
      actionStats: stats,
      raterActivity
    });
  } catch (error) {
    console.error('Failed to fetch rating stats:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Export rating logs as CSV
router.get('/rating-logs/export-csv', authMiddleware, async (req, res) => {
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
      'Date & Time',
      'Action',
      'Rater Name',
      'Rater Type',
      'Rater Email',
      'Candidate Name',
      'Item Number',
      'Competency',
      'Competency Type',
      'Old Score',
      'New Score',
      'Performed By',
      'IP Address'
    ];
    
    const rows = logs.map(log => [
      new Date(log.createdAt).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      log.action.toUpperCase(),
      log.raterId?.name || 'N/A',
      log.raterId?.raterType || 'N/A',
      log.raterId?.email || 'N/A',
      log.candidateId?.fullName || 'N/A',
      log.itemNumber || 'N/A',
      log.competencyId?.name || 'N/A',
      log.competencyType || 'N/A',
      log.oldScore || 'N/A',
      log.newScore || 'N/A',
      log.performedBy?.name || 'N/A',
      log.ipAddress || 'N/A'
    ]);
    
    const escapeCsvValue = (value) => {
      if (value == null) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };
    
    const csvContent = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map(row => row.map(escapeCsvValue).join(','))
    ].join('\n');
    
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `rating_audit_log_${timestamp}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\ufeff' + csvContent);
    
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});


// ========================================
// PUBLICATION RANGE ROUTES
// ========================================

// Get all publication ranges
router.get('/publication-ranges', authMiddleware, async (req, res) => {
  try {
    const { includeArchived = 'false' } = req.query;
    
    let query = {};
    if (includeArchived === 'false') {
      query.isArchived = false;
    }
    
    const publicationRanges = await PublicationRange.find(query)
      .populate('archivedBy', 'name email')
      .sort({ startDate: -1 });
    
    res.json(publicationRanges);
  } catch (error) {
    console.error('Failed to fetch publication ranges:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get active publication ranges
router.get('/publication-ranges/active', authMiddleware, async (req, res) => {
  try {
    const publicationRanges = await PublicationRange.findActive();
    res.json(publicationRanges);
  } catch (error) {
    console.error('Failed to fetch active publication ranges:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get archived publication ranges
router.get('/publication-ranges/archived', authMiddleware, async (req, res) => {
  try {
    const publicationRanges = await PublicationRange.findArchived()
      .populate('archivedBy', 'name email')
      .sort({ archivedAt: -1 });
    res.json(publicationRanges);
  } catch (error) {
    console.error('Failed to fetch archived publication ranges:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get single publication range by ID
router.get('/publication-ranges/:id', authMiddleware, async (req, res) => {
  try {
    const publicationRange = await PublicationRange.findById(req.params.id)
      .populate('archivedBy', 'name email');
    
    if (!publicationRange) {
      return res.status(404).json({ message: 'Publication range not found' });
    }
    
    res.json(publicationRange);
  } catch (error) {
    console.error('Failed to fetch publication range:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Create publication range
router.post('/publication-ranges', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    const { name, tags, startDate, endDate, description, isActive } = req.body;
    
    // Validate required fields
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ 
        message: 'Missing required fields: name, startDate, endDate' 
      });
    }
    
    // Check if name already exists
    const existingRange = await PublicationRange.findOne({ name });
    if (existingRange) {
      return res.status(400).json({ 
        message: 'A publication range with this name already exists' 
      });
    }
    
    const publicationRange = new PublicationRange({
      name,
      tags: tags || [],
      startDate,
      endDate,
      description: description || '',
      isActive: isActive !== undefined ? isActive : true
    });
    
    await publicationRange.save();
    res.status(201).json(publicationRange);
    
  } catch (error) {
    console.error('Failed to create publication range:', error);
    
    if (error.message.includes('End date must be after start date')) {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Update publication range
router.put('/publication-ranges/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    const { name, tags, startDate, endDate, description, isActive } = req.body;
    
    const publicationRange = await PublicationRange.findById(req.params.id);
    if (!publicationRange) {
      return res.status(404).json({ message: 'Publication range not found' });
    }
    
    // Check if archived
    if (publicationRange.isArchived) {
      return res.status(400).json({ 
        message: 'Cannot update archived publication range' 
      });
    }
    
    // Check if changing name to an existing name
    if (name && name !== publicationRange.name) {
      const existingRange = await PublicationRange.findOne({ name });
      if (existingRange) {
        return res.status(400).json({ 
          message: 'A publication range with this name already exists' 
        });
      }
    }
    
    // Update fields
    if (name) publicationRange.name = name;
    if (tags !== undefined) publicationRange.tags = tags;
    if (startDate) publicationRange.startDate = startDate;
    if (endDate) publicationRange.endDate = endDate;
    if (description !== undefined) publicationRange.description = description;
    if (isActive !== undefined) publicationRange.isActive = isActive;
    
    await publicationRange.save();
    res.json(publicationRange);
    
  } catch (error) {
    console.error('Failed to update publication range:', error);
    
    if (error.message.includes('End date must be after start date')) {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Archive publication range (and all associated vacancies/candidates)
router.post('/publication-ranges/:id/archive', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    const publicationRange = await PublicationRange.findById(req.params.id);
    if (!publicationRange) {
      return res.status(404).json({ message: 'Publication range not found' });
    }
    
    if (publicationRange.isArchived) {
      return res.status(400).json({ 
        message: 'Publication range is already archived' 
      });
    }
    
    // Archive the publication range
    publicationRange.isArchived = true;
    publicationRange.isActive = false;
    publicationRange.archivedAt = new Date();
    publicationRange.archivedBy = req.user._id;
    await publicationRange.save();
    
    // Archive all associated vacancies
    const vacancyUpdateResult = await Vacancy.updateMany(
      { publicationRangeId: publicationRange._id },
      {
        $set: {
          isArchived: true,
          archivedAt: new Date(),
          archivedBy: req.user._id
        }
      }
    );
    
    // Archive all associated candidates
    const candidateUpdateResult = await Candidate.updateMany(
      { publicationRangeId: publicationRange._id },
      {
        $set: {
          isArchived: true,
          archivedAt: new Date(),
          archivedBy: req.user._id
        }
      }
    );
    
    res.json({
      message: 'Publication range archived successfully',
      publicationRange,
      vacanciesArchived: vacancyUpdateResult.modifiedCount,
      candidatesArchived: candidateUpdateResult.modifiedCount,
      note: 'Associated ratings preserved for historical record'
    });
    
  } catch (error) {
    console.error('Failed to archive publication range:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Unarchive publication range
router.post('/publication-ranges/:id/unarchive', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    const publicationRange = await PublicationRange.findById(req.params.id);
    if (!publicationRange) {
      return res.status(404).json({ message: 'Publication range not found' });
    }
    
    if (!publicationRange.isArchived) {
      return res.status(400).json({ 
        message: 'Publication range is not archived' 
      });
    }
    
    // Unarchive the publication range
    publicationRange.isArchived = false;
    publicationRange.archivedAt = null;
    publicationRange.archivedBy = null;
    await publicationRange.save();
    
    // Unarchive all associated vacancies
    const vacancyUpdateResult = await Vacancy.updateMany(
      { publicationRangeId: publicationRange._id },
      {
        $set: {
          isArchived: false,
          archivedAt: null,
          archivedBy: null
        }
      }
    );
    
    // Unarchive all associated candidates
    const candidateUpdateResult = await Candidate.updateMany(
      { publicationRangeId: publicationRange._id },
      {
        $set: {
          isArchived: false,
          archivedAt: null,
          archivedBy: null
        }
      }
    );
    
    res.json({
      message: 'Publication range unarchived successfully',
      publicationRange,
      vacanciesUnarchived: vacancyUpdateResult.modifiedCount,
      candidatesUnarchived: candidateUpdateResult.modifiedCount
    });
    
  } catch (error) {
    console.error('Failed to unarchive publication range:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Delete publication range (only if no vacancies/candidates exist)
router.delete('/publication-ranges/:id', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    const publicationRange = await PublicationRange.findById(req.params.id);
    if (!publicationRange) {
      return res.status(404).json({ message: 'Publication range not found' });
    }
    
    // Check if any vacancies exist
    const vacancyCount = await Vacancy.countDocuments({ 
      publicationRangeId: publicationRange._id 
    });
    
    if (vacancyCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete publication range with ${vacancyCount} associated vacancies. Archive instead.` 
      });
    }
    
    // Check if any candidates exist
    const candidateCount = await Candidate.countDocuments({ 
      publicationRangeId: publicationRange._id 
    });
    
    if (candidateCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete publication range with ${candidateCount} associated candidates. Archive instead.` 
      });
    }
    
    await PublicationRange.findByIdAndDelete(req.params.id);
    res.json({ message: 'Publication range deleted successfully' });
    
  } catch (error) {
    console.error('Failed to delete publication range:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get statistics for a publication range
router.get('/publication-ranges/:id/statistics', authMiddleware, async (req, res) => {
  try {
    const publicationRange = await PublicationRange.findById(req.params.id);
    if (!publicationRange) {
      return res.status(404).json({ message: 'Publication range not found' });
    }
    
    const [vacancyCount, candidateCount, candidatesByStatus] = await Promise.all([
      Vacancy.countDocuments({ publicationRangeId: publicationRange._id }),
      Candidate.countDocuments({ publicationRangeId: publicationRange._id }),
      Candidate.aggregate([
        { $match: { publicationRangeId: publicationRange._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);
    
    const statusBreakdown = {
      general_list: 0,
      long_list: 0,
      for_review: 0,
      disqualified: 0
    };
    
    candidatesByStatus.forEach(item => {
      statusBreakdown[item._id] = item.count;
    });
    
    res.json({
      publicationRange: {
        id: publicationRange._id,
        name: publicationRange.name,
        isArchived: publicationRange.isArchived,
        isActive: publicationRange.isActive
      },
      statistics: {
        totalVacancies: vacancyCount,
        totalCandidates: candidateCount,
        candidatesByStatus: statusBreakdown
      }
    });
    
  } catch (error) {
    console.error('Failed to fetch statistics:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// ========================================
// UPDATED VACANCY ROUTES (WITH PUBLICATION RANGE)
// ========================================

// Get vacancies by publication range
router.get('/vacancies/by-publication/:publicationRangeId', authMiddleware, async (req, res) => {
  try {
    const { includeArchived = 'false' } = req.query;
    
    const query = { publicationRangeId: req.params.publicationRangeId };
    if (includeArchived === 'false') {
      query.isArchived = false;
    }
    
    const vacancies = await Vacancy.find(query).sort({ itemNumber: 1 });
    res.json(vacancies);
  } catch (error) {
    console.error('Failed to fetch vacancies:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// ========================================
// UPDATED CANDIDATE ROUTES (WITH PUBLICATION RANGE)
// ========================================

// Get candidates by publication range
router.get('/candidates/by-publication/:publicationRangeId', authMiddleware, async (req, res) => {
  try {
    const { includeArchived = 'false' } = req.query;
    
    const query = { publicationRangeId: req.params.publicationRangeId };
    if (includeArchived === 'false') {
      query.isArchived = false;
    }
    
    const candidates = await Candidate.find(query)
      .populate('commentsHistory.commentedBy', 'name userType')
      .populate('statusHistory.changedBy', 'name userType')
      .sort({ fullName: 1 });
    
    res.json(candidates);
  } catch (error) {
    console.error('Failed to fetch candidates:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Upload candidates CSV with publication range validation
router.post('/candidates/upload-csv/:publicationRangeId', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    if (!req.files || !req.files.csv) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const publicationRange = await PublicationRange.findById(req.params.publicationRangeId);
    if (!publicationRange) {
      return res.status(404).json({ message: 'Publication range not found' });
    }
    
    if (publicationRange.isArchived) {
      return res.status(400).json({ 
        message: 'Cannot import candidates to archived publication range' 
      });
    }
    
    const candidatesData = parseCSV(req.files.csv.data);
    
    // Get all vacancy item numbers for this publication range
    // IMPROVED: More specific validation
    const vacancies = await Vacancy.find({ 
      publicationRangeId: publicationRange._id,
      isArchived: false
    });
    
    // Create map instead of just set for better error messages
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
        fullName: candidate.fullName || '',
        itemNumber: candidate.itemNumber.trim(),
        gender: candidate.gender || '',
        dateOfBirth: candidate.dateOfBirth || null,
        age: candidate.age || null,
        eligibility: candidate.eligibility || '',
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
        status: candidate.status || 'general_list',
        publicationRangeId: publicationRange._id,
        comments: {
          education: candidate.educationComments || '',
          training: candidate.trainingComments || '',
          experience: candidate.experienceComments || '',
          eligibility: candidate.eligibilityComments || ''
        }
      });
    }
    
    if (invalidItems.length > 0) {
      return res.status(400).json({
        message: 'Import validation failed',
        errors: invalidItems,
        validItemNumbers: Array.from(itemNumberMap.keys())
      });
    }
    
    const insertResult = await Candidate.insertMany(processedCandidates);
    
    res.json({ 
      message: `Successfully imported ${insertResult.length} candidates`,
      count: insertResult.length,
      publicationRange: {
        id: publicationRange._id,
        name: publicationRange.name
      }
    });
    
  } catch (error) {
    console.error('CSV upload error:', error);
    res.status(500).json({ message: 'Failed to upload CSV: ' + error.message });
  }
});

// Undo last CSV import for a publication range
router.post('/candidates/undo-import/:publicationRangeId', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    const { minutesAgo = 5 } = req.body;
    const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000);
    
    const result = await Candidate.deleteMany({
      publicationRangeId: req.params.publicationRangeId,
      createdAt: { $gte: cutoffTime }
    });
    
    res.json({
      message: `Undo successful: Deleted ${result.deletedCount} recently imported candidates`,
      deletedCount: result.deletedCount,
      cutoffTime: cutoffTime
    });
    
  } catch (error) {
    console.error('Undo import error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Clone archived vacancy to new publication range
router.post('/vacancies/:vacancyId/clone-to-publication/:publicationRangeId', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    // Get source vacancy
    const sourceVacancy = await Vacancy.findById(req.params.vacancyId);
    if (!sourceVacancy) {
      return res.status(404).json({ message: 'Source vacancy not found' });
    }
    
    // Get target publication range
    const targetPublicationRange = await PublicationRange.findById(req.params.publicationRangeId);
    if (!targetPublicationRange) {
      return res.status(404).json({ message: 'Target publication range not found' });
    }
    
    if (targetPublicationRange.isArchived) {
      return res.status(400).json({ message: 'Cannot clone to archived publication range' });
    }
    
    // Check if item number already exists in target publication range
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
    
    // Create cloned vacancy
    const clonedVacancy = new Vacancy({
      itemNumber: sourceVacancy.itemNumber,
      position: sourceVacancy.position,
      assignment: sourceVacancy.assignment,
      salaryGrade: sourceVacancy.salaryGrade,
      publicationRangeId: targetPublicationRange._id,
      qualifications: {
        education: sourceVacancy.qualifications?.education || '',
        training: sourceVacancy.qualifications?.training || '',
        experience: sourceVacancy.qualifications?.experience || '',
        eligibility: sourceVacancy.qualifications?.eligibility || ''
      },
      isArchived: false,
      archivedAt: null,
      archivedBy: null
    });
    
    await clonedVacancy.save();
    
    // Clone competencies linked to the source vacancy
    const sourceCompetencies = await Competency.find({
      $or: [
        { vacancyId: sourceVacancy._id },
        { vacancyIds: sourceVacancy._id }
      ]
    });
    
    const clonedCompetencies = [];
    for (const comp of sourceCompetencies) {
      // Only clone non-fixed competencies
      if (!comp.isFixed) {
        const clonedComp = new Competency({
          name: comp.name,
          type: comp.type,
          vacancyId: comp.vacancyIds && comp.vacancyIds.length > 1 ? null : clonedVacancy._id,
          vacancyIds: comp.vacancyIds && comp.vacancyIds.length > 1 ? [clonedVacancy._id] : [],
          isFixed: false
        });
        await clonedComp.save();
        clonedCompetencies.push(clonedComp);
      }
    }
    
    res.json({
      message: `Vacancy cloned successfully to ${targetPublicationRange.name}`,
      clonedVacancy,
      competenciesCloned: clonedCompetencies.length,
      sourcePublicationRange: sourceVacancy.publicationRangeId,
      targetPublicationRange: targetPublicationRange._id
    });
    
  } catch (error) {
    console.error('Clone vacancy error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

export default router;
