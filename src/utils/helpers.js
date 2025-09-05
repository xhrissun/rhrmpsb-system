import Papa from 'papaparse';

export const calculateRatingScores = (ratings, competencies, salaryGrade) => {
  if (!ratings || ratings.length === 0) return { psychoSocial: 0, potential: 0 };

  // Calculate average ratings for each competency type using correct formulas
  const basicAvg = calculateBasicAverage(ratings, competencies.basic);
  const orgAvg = calculateOrganizationalAverage(ratings, competencies.organizational);
  const leadershipAvg = calculateLeadershipAverage(ratings, competencies.leadership);
  const minimumAvg = calculateMinimumAverage(ratings, competencies.minimum);

  // Psycho-social score = Basic competencies average * 2
  const psychoSocial = basicAvg * 2;

  // Potential score calculation based on salary grade
  let potential = 0;
  if (salaryGrade >= 18) {
    // SG 18 and above: ((Organizational + Leadership + Minimum) / 3) * 2
    potential = ((orgAvg + leadershipAvg + minimumAvg) / 3) * 2;
  } else {
    // SG 17 and below: ((Organizational + Minimum) / 2) * 2
    potential = ((orgAvg + minimumAvg) / 2) * 2;
  }

  return {
    psychoSocial: Math.round(psychoSocial * 100) / 100,
    potential: Math.round(potential * 100) / 100,
    breakdown: {
      basic: basicAvg,
      organizational: orgAvg,
      leadership: leadershipAvg,
      minimum: minimumAvg
    }
  };
};

// BASIC: SUM OF RATING OF EACH COMPETENCY / 5
const calculateBasicAverage = (ratings, competencies) => {
  if (!competencies || competencies.length === 0) return 0;

  let totalScore = 0;
  let totalCompetencies = 0;

  competencies.forEach(competency => {
    const competencyRatings = ratings.filter(rating => 
      rating.competencyId === competency._id && rating.competencyType === 'basic'
    );

    if (competencyRatings.length > 0) {
      const avgScore = competencyRatings.reduce((sum, rating) => sum + rating.score, 0) / competencyRatings.length;
      totalScore += avgScore; // Sum the ratings (no division by 5 here)
      totalCompetencies++;
    }
  });

  // Divide the sum by 5 as per requirement
  return totalScore / 5;
};

// ORGANIZATIONAL: SUM OF RATING OF EACH COMPETENCY / 5
const calculateOrganizationalAverage = (ratings, competencies) => {
  if (!competencies || competencies.length === 0) return 0;

  let totalScore = 0;
  let totalCompetencies = 0;

  competencies.forEach(competency => {
    const competencyRatings = ratings.filter(rating => 
      rating.competencyId === competency._id && rating.competencyType === 'organizational'
    );

    if (competencyRatings.length > 0) {
      const avgScore = competencyRatings.reduce((sum, rating) => sum + rating.score, 0) / competencyRatings.length;
      totalScore += avgScore; // Sum the ratings (no division by 5 here)
      totalCompetencies++;
    }
  });

  // Divide the sum by 5 as per requirement
  return totalScore / 5;
};

// LEADERSHIP: SUM OF RATING OF EACH COMPETENCY / 5 (if applicable)
const calculateLeadershipAverage = (ratings, competencies) => {
  if (!competencies || competencies.length === 0) return 0;

  let totalScore = 0;
  let totalCompetencies = 0;

  competencies.forEach(competency => {
    const competencyRatings = ratings.filter(rating => 
      rating.competencyId === competency._id && rating.competencyType === 'leadership'
    );

    if (competencyRatings.length > 0) {
      const avgScore = competencyRatings.reduce((sum, rating) => sum + rating.score, 0) / competencyRatings.length;
      totalScore += avgScore; // Sum the ratings (no division by 5 here)
      totalCompetencies++;
    }
  });

  // Divide the sum by 5 as per requirement
  return totalScore / 5;
};

// MINIMUM: SUM OF RATING OF EACH COMPETENCY / NUMBER OF MINIMUM COMPETENCIES ASSIGNED
const calculateMinimumAverage = (ratings, competencies) => {
  if (!competencies || competencies.length === 0) return 0;

  let totalScore = 0;

  competencies.forEach(competency => {
    const competencyRatings = ratings.filter(rating => 
      rating.competencyId === competency._id && rating.competencyType === 'minimum'
    );

    if (competencyRatings.length > 0) {
      const avgScore = competencyRatings.reduce((sum, rating) => sum + rating.score, 0) / competencyRatings.length;
      totalScore += avgScore;
    }
  });

  // Divide sum by the number of minimum competencies assigned
  return competencies.length > 0 ? totalScore / competencies.length : 0;
};

export const calculateFinalScores = (allRatings, competencies, salaryGrade) => {
  const raterAverages = {};
  
  // Group ratings by rater and competency
  allRatings.forEach(rating => {
    const key = `${rating.raterId}_${rating.competencyId}_${rating.competencyType}`;
    if (!raterAverages[key]) {
      raterAverages[key] = {
        raterId: rating.raterId,
        competencyId: rating.competencyId,
        competencyType: rating.competencyType,
        scores: []
      };
    }
    raterAverages[key].scores.push(rating.score);
  });

  // Calculate average for each rater-competency combination
  const averageRatings = Object.values(raterAverages).map(group => ({
    ...group,
    averageScore: group.scores.reduce((sum, score) => sum + score, 0) / group.scores.length
  }));

  return calculateRatingScores(averageRatings, competencies, salaryGrade);
};

export const parseCSV = (file) => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          reject(results.errors);
        } else {
          resolve(results.data);
        }
      },
      error: (error) => {
        reject([error]);
      }
    });
  });
};

export const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString();
};

export const formatDateTime = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleString();
};

export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validateRequired = (value) => {
  return value && value.trim().length > 0;
};

export const generateItemNumber = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${timestamp}-${random}`;
};

export const exportToCSV = (data, filename) => {
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const truncateText = (text, maxLength = 50) => {
  if (!text) return '';
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
};

export const getStatusColor = (status) => {
  switch (status) {
    case 'general_list':
      return 'bg-blue-100 text-blue-800';
    case 'long_list':
      return 'bg-green-100 text-green-800';
    case 'disqualified':
      return 'bg-red-100 text-red-800';
    case 'for_review':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const getStatusLabel = (status) => {
  switch (status) {
    case 'general_list':
      return 'General List';
    case 'long_list':
      return 'Long List';
    case 'disqualified':
      return 'Disqualified';
    case 'for_review':
      return 'For Review';
    default:
      return 'Unknown';
  }
};