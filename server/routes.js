import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parse } from 'csv-parse/sync';
import { User, Vacancy, Candidate, Competency, Rating } from './models.js';

const router = express.Router();

// Authentication middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Parse CSV data from buffer - Handle empty values properly
const parseCSV = (buffer) => {
  try {
    let csvString = buffer.toString('utf8')
      .replace(/\r\n/g, '\n')     // normalize line endings
      .replace(/\uFEFF/g, '')     // remove BOM if present
      .trim();                    // remove trailing blank lines

    const results = parse(csvString, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
      cast: (value, context) => {
        if (typeof value === 'string') return value.trim();
        return value;
      }
    });

    return results;
  } catch (error) {
    throw new Error('Failed to parse CSV: ' + error.message);
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

router.post('/vacancies/upload-csv', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    if (!req.files || !req.files.csv) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const vacanciesData = parseCSV(req.files.csv.data);
    const processedVacancies = vacanciesData.map(vacancy => ({
      itemNumber: vacancy.itemNumber || '',
      position: vacancy.position || '',
      assignment: vacancy.assignment || '',
      salaryGrade: vacancy.salaryGrade || 1,
      qualifications: {
        education: vacancy.education || '',
        training: vacancy.training || '',
        experience: vacancy.experience || '',
        eligibility: vacancy.eligibility || ''
      }
    }));
    
    await Vacancy.insertMany(processedVacancies);
    res.json({ message: 'Vacancies uploaded successfully' });
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

router.get('/candidates/:id', authMiddleware, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
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
    // Decode the item number parameter
    const itemNumber = decodeURIComponent(req.params.itemNumber);
    const candidates = await Candidate.findByItemNumber(itemNumber);
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
    // Get the current candidate first to preserve existing data
    const currentCandidate = await Candidate.findById(req.params.id);
    if (!currentCandidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    // Only update fields that are provided and not empty
    const updateData = {};
    
    // Handle required fields - only update if provided and not empty
    if (req.body.fullName && req.body.fullName.trim() !== '') {
      updateData.fullName = req.body.fullName.trim();
    }
    if (req.body.itemNumber && req.body.itemNumber.trim() !== '') {
      updateData.itemNumber = req.body.itemNumber.trim();
    }
    if (req.body.gender && req.body.gender.trim() !== '') {
      updateData.gender = req.body.gender.trim();
    }

    // Handle optional fields - can be empty or null
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
    if (req.body.hasOwnProperty('status')) {
      updateData.status = req.body.status || 'general_list';
    }

    // Handle comments object
    if (req.body.comments) {
      updateData.comments = {
        education: req.body.comments.education || '',
        training: req.body.comments.training || '',
        experience: req.body.comments.experience || '',
        eligibility: req.body.comments.eligibility || ''
      };
    }

    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    
    res.json(candidate);
  } catch (error) {
    console.error('Error updating candidate:', error);
    
    // Handle validation errors more specifically
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
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    if (!req.files || !req.files.csv) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const competenciesData = parseCSV(req.files.csv.data);
    const processedCompetencies = [];
    const errors = [];

    for (const competency of competenciesData) {
      // 🔍 Validate required fields
      if (!competency.name || !competency.type) {
        errors.push(`Missing required fields (name, type) for: ${JSON.stringify(competency)}`);
        continue;
      }

      // 🔍 Validate type
      const validTypes = ['basic', 'organizational', 'leadership', 'minimum'];
      if (!validTypes.includes(competency.type.trim().toLowerCase())) {
        errors.push(`Invalid competency type '${competency.type}' for: ${competency.name}`);
        continue;
      }

      let vacancyIds = [];

      // 🧩 Handle linked vacancy item numbers - THIS IS THE FIX!
      if (competency.vacancyItemNumbers && competency.vacancyItemNumbers.trim() !== '') {
        // Split by semicolon, trim each item, and filter out empty strings
        const itemNumbers = competency.vacancyItemNumbers
          .split(';')
          .map(item => item.trim())
          .filter(item => item !== '');

        console.log(`Processing competency "${competency.name}" with item numbers:`, itemNumbers);

        // Only process if we have actual item numbers after filtering
        if (itemNumbers.length > 0) {
          for (const itemNumber of itemNumbers) {
            const vacancy = await Vacancy.findOne({ itemNumber: itemNumber.trim() });
            if (!vacancy) {
              errors.push(`Vacancy with item number '${itemNumber}' not found for competency: ${competency.name}`);
              continue;
            }
            vacancyIds.push(vacancy._id);
          }

          // Skip if any vacancy failed to resolve
          if (vacancyIds.length !== itemNumbers.length) {
            continue;
          }
        }
      }

      // 🧠 Normalize isFixed
      const isFixed =
        competency.isFixed === true ||
        competency.isFixed?.toString().toLowerCase() === 'true' ||
        competency.isFixed === '1';

      // 🧩 Build competency data safely
      const competencyData = {
        name: competency.name.trim(),
        type: competency.type.trim().toLowerCase(),
        isFixed
      };

      // Assign the correct references based on how many vacancies were found
      if (vacancyIds.length > 1) {
        // Multiple vacancies: use vacancyIds array
        competencyData.vacancyIds = vacancyIds;
        competencyData.vacancyId = null;
        console.log(`✅ Assigned ${vacancyIds.length} vacancies to competency "${competency.name}"`);
      } else if (vacancyIds.length === 1) {
        // Single vacancy: use vacancyId field only
        competencyData.vacancyId = vacancyIds[0];
        // Don't include vacancyIds field at all
        console.log(`✅ Assigned 1 vacancy to competency "${competency.name}"`);
      } else {
        // No vacancies specified and not fixed: applies to all vacancies
        competencyData.vacancyId = null;
        competencyData.vacancyIds = [];
        console.log(`✅ Competency "${competency.name}" applies to all vacancies (no specific assignment)`);
      }

      processedCompetencies.push(competencyData);
    }

    // ⚠️ If any validation errors occurred
    if (errors.length > 0) {
      return res.status(400).json({
        message: 'CSV validation failed',
        errors,
      });
    }

    // 💾 Insert all valid competencies
    if (processedCompetencies.length > 0) {
      await Competency.insertMany(processedCompetencies);
      return res.json({
        message: `Successfully uploaded ${processedCompetencies.length} competencies`,
        count: processedCompetencies.length,
      });
    }

    res.status(400).json({ message: 'No valid competencies found in CSV file' });
  } catch (error) {
    console.error('CSV upload error:', error);
    res.status(500).json({
      message: 'Failed to upload CSV: ' + error.message,
      error: error.message,
    });
  }
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

    // Validate that all ratings have itemNumber
    const missingItemNumber = ratings.some(r => !r.itemNumber);
    if (missingItemNumber) {
      return res.status(400).json({ message: 'All ratings must include itemNumber' });
    }
    
    // Check if any ratings already exist for this rater, candidate, and item number combination
    const candidateIds = [...new Set(ratings.map(r => r.candidateId))];
    const itemNumbers = [...new Set(ratings.map(r => r.itemNumber))];
    
    const existingRatings = await Rating.find({
      candidateId: { $in: candidateIds },
      raterId: req.user._id,
      itemNumber: { $in: itemNumbers }
    });
    
    const hasExistingRatings = existingRatings.length > 0;
    
    // If there are existing ratings but this isn't marked as an update, return error
    if (hasExistingRatings && !isUpdate) {
      return res.status(409).json({ 
        message: 'Existing ratings found for this candidate and item number',
        requiresUpdate: true,
        existingCount: existingRatings.length
      });
    }
    
    // Process each rating with upsert logic
    const results = [];
    for (const ratingData of ratings) {
      const filter = {
        candidateId: ratingData.candidateId,
        raterId: req.user._id,
        competencyId: ratingData.competencyId,
        competencyType: ratingData.competencyType,
        itemNumber: ratingData.itemNumber  // CRITICAL: Include itemNumber in filter
      };
      
      const update = {
        ...filter,
        score: parseInt(ratingData.score),
        submittedAt: new Date()
      };
      
      // Upsert: update if exists, create if not
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
    }
    
    res.json({ 
      message: hasExistingRatings ? 'Ratings updated successfully' : 'Ratings submitted successfully',
      isUpdate: hasExistingRatings,
      ratingsProcessed: results.length
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

router.delete('/ratings/candidate/:candidateId/rater/:raterId/item/:itemNumber', authMiddleware, async (req, res) => {
  if (req.user.userType !== 'rater') {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  try {
    const { candidateId, raterId, itemNumber } = req.params;
    
    // Decode item number in case it has special characters
    const decodedItemNumber = decodeURIComponent(itemNumber);
    
    const result = await Rating.deleteMany({
      candidateId: candidateId,
      raterId: raterId,
      itemNumber: decodedItemNumber
    });
    
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
    if (!['all', 'assignment', 'specific'].includes(assignmentType)) {
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
    
    if (user.assignedVacancies === 'all') {
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

// Add this with your other candidate routes
router.get('/candidates/comment-suggestions/:field', authMiddleware, async (req, res) => {
  try {
    const { field } = req.params;
    const validFields = ['education', 'training', 'experience', 'eligibility'];
    
    if (!validFields.includes(field)) {
      return res.status(400).json({ message: 'Invalid field' });
    }
    
    // Get more candidates for better frequency analysis
    const candidates = await Candidate.find(
      { [`comments.${field}`]: { $exists: true, $ne: '' } },
      { [`comments.${field}`]: 1 }
    ).limit(500);
    
    // Count frequency with normalization (trim + uppercase for deduplication)
    const commentFrequency = {};
    
    candidates.forEach(c => {
      const comment = c.comments?.[field];
      if (comment && comment.trim() !== '') {
        // Normalize: trim, remove extra spaces, convert to uppercase
        const normalized = comment
          .trim()
          .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
          .toUpperCase();
        
        commentFrequency[normalized] = (commentFrequency[normalized] || 0) + 1;
      }
    });
    
    // Sort by frequency (most used first), limit to top 20
    const suggestions = Object.entries(commentFrequency)
      .sort((a, b) => b[1] - a[1])  // Sort by frequency descending
      .slice(0, 20)                  // Top 20 most common
      .map(([comment]) => comment);   // Extract just the comment text
    
    res.json(suggestions);
    
  } catch (error) {
    console.error('Comment suggestions error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});


export default router;
