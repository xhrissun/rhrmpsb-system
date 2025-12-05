import React, { useState, useEffect } from 'react';
import { vacanciesAPI, candidatesAPI, competenciesAPI, ratingsAPI, usersAPI } from '../utils/api';
import { calculateRatingScores } from '../utils/helpers';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const InterviewSummaryGenerator = ({ user }) => {
  const [assignments, setAssignments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [items, setItems] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [competencies, setCompetencies] = useState([]);
  const [raters, setRaters] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [vacancyDetails, setVacancyDetails] = useState(null);
  const [candidateDetails, setCandidateDetails] = useState(null);
  const [salaryGrade, setSalaryGrade] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ratings, setRatings] = useState([]);
  const [groupedCompetencies, setGroupedCompetencies] = useState({
    basic: [],
    organizational: [],
    leadership: [],
    minimum: []
  });

  // NEW: Auto-refresh for interview summary
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useEffect(() => {
    if (!autoRefresh || !selectedCandidate || !selectedItem) return;

    const interval = setInterval(async () => {
      try {
        const [candidateData, ratingsData] = await Promise.all([
          candidatesAPI.getById(selectedCandidate),
          ratingsAPI.getByCandidate(selectedCandidate)
        ]);
        
        setCandidateDetails(candidateData);
        const filteredRatings = ratingsData.filter(rating => 
          rating.itemNumber === selectedItem
        );
        setRatings(filteredRatings);
        setLastRefresh(new Date());
      } catch (error) {
        console.error('Auto-refresh failed:', error);
      }
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, selectedCandidate, selectedItem]);

  const formatTimeSince = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const [vacancies, ratersData] = await Promise.all([
          vacanciesAPI.getAll(),
          usersAPI.getRaters()
        ]);
        
        const uniqueAssignments = [...new Set(
          vacancies
            .map(v => v.assignment)
            .filter(a => a && a.trim() !== '')
        )].sort();
        
        setAssignments(uniqueAssignments);
        setRaters(ratersData);
      } catch (error) {
        console.error('Failed to load initial data:', error);
        alert('Failed to load initial data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedAssignment) {
      const fetchPositions = async () => {
        try {
          setLoading(true);
          const vacancies = await vacanciesAPI.getAll();
          const filteredPositions = [...new Set(
            vacancies
              .filter(v => v.assignment === selectedAssignment)
              .map(v => v.position)
              .filter(p => p && p.trim() !== '')
          )].sort();
          setPositions(filteredPositions);
          setSelectedPosition('');
          setItems([]);
          setSelectedItem('');
          setCandidates([]);
          setSelectedCandidate('');
          setCompetencies([]);
          setGroupedCompetencies({ basic: [], organizational: [], leadership: [], minimum: [] });
          setVacancyDetails(null);
          setCandidateDetails(null);
          setSalaryGrade(null);
          setRatings([]);
        } catch (error) {
          console.error('Failed to load positions:', error);
          alert('Failed to load positions. Please try again.');
        } finally {
          setLoading(false);
        }
      };
      fetchPositions();
    } else {
      setPositions([]);
      setItems([]);
      setSelectedPosition('');
      setSelectedItem('');
      setCandidates([]);
      setSelectedCandidate('');
      setCompetencies([]);
      setGroupedCompetencies({ basic: [], organizational: [], leadership: [], minimum: [] });
      setVacancyDetails(null);
      setCandidateDetails(null);
      setSalaryGrade(null);
      setRatings([]);
    }
  }, [selectedAssignment]);

  useEffect(() => {
    if (selectedAssignment && selectedPosition) {
      const fetchItems = async () => {
        try {
          setLoading(true);
          const vacancies = await vacanciesAPI.getAll();
          const filteredItems = [...new Set(
            vacancies
              .filter(v => v.assignment === selectedAssignment && v.position === selectedPosition)
              .map(v => v.itemNumber)
              .filter(i => i && i.trim() !== '')
          )].sort();
          setItems(filteredItems);
          setSelectedItem('');
          setCandidates([]);
          setSelectedCandidate('');
          setCompetencies([]);
          setGroupedCompetencies({ basic: [], organizational: [], leadership: [], minimum: [] });
          setVacancyDetails(null);
          setCandidateDetails(null);
          setSalaryGrade(null);
          setRatings([]);
        } catch (error) {
          console.error('Failed to load items:', error);
          alert('Failed to load items. Please try again.');
        } finally {
          setLoading(false);
        }
      };
      fetchItems();
    }
  }, [selectedAssignment, selectedPosition]);

  useEffect(() => {
    if (selectedItem) {
      const fetchData = async () => {
        try {
          setLoading(true);
          const candidateData = await candidatesAPI.getAll();
          const filteredCandidates = candidateData
            .filter(c => c.itemNumber === selectedItem && c.status === 'long_list')
            .map(c => ({ id: c._id, name: c.fullName }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setCandidates(filteredCandidates);

          const vacancies = await vacanciesAPI.getAll();
          const vacancy = vacancies.find(v => v.itemNumber === selectedItem);
          setVacancyDetails(vacancy);
          setSalaryGrade(vacancy?.salaryGrade || null);

          if (vacancy) {
            const competencyData = await competenciesAPI.getByVacancy(vacancy._id);
            const sortedCompetencies = competencyData
              .map(c => ({
                id: c._id,
                name: c.name,
                type: c.type,
                code: c.name.toUpperCase().replace(/ /g, '_')
              }))
              .sort((a, b) => {
                const typeOrder = { basic: 1, organizational: 2, leadership: 3, minimum: 4 };
                if (typeOrder[a.type] !== typeOrder[b.type]) {
                  return typeOrder[a.type] - typeOrder[b.type];
                }
                return a.name.localeCompare(b.name);
              });
            
            setCompetencies(sortedCompetencies);
            setGroupedCompetencies({
              basic: sortedCompetencies.filter(c => c.type === 'basic').map((c, index) => ({ ...c, ordinal: index + 1 })),
              organizational: sortedCompetencies.filter(c => c.type === 'organizational').map((c, index) => ({ ...c, ordinal: index + 1 })),
              leadership: sortedCompetencies.filter(c => c.type === 'leadership').map((c, index) => ({ ...c, ordinal: index + 1 })),
              minimum: sortedCompetencies.filter(c => c.type === 'minimum').map((c, index) => ({ ...c, ordinal: index + 1 }))
            });
          }
        } catch (error) {
          console.error('Failed to load candidates or competencies:', error);
          alert('Failed to load candidates or competencies. Please try again.');
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [selectedItem]);

  // UPDATED: Filter ratings by selectedItem (itemNumber)
  useEffect(() => {
    if (selectedCandidate) {
      const fetchCandidateData = async () => {
        try {
          setLoading(true);
          const [candidateData, ratingsData] = await Promise.all([
            candidatesAPI.getById(selectedCandidate),
            ratingsAPI.getByCandidate(selectedCandidate)
          ]);
          
          setCandidateDetails(candidateData);
          
          // CRITICAL: Only show ratings for the selected item number
          const filteredRatings = ratingsData.filter(rating => 
            rating.itemNumber === selectedItem
          );
          
          setRatings(filteredRatings);
        } catch (error) {
          console.error('Failed to load candidate data or ratings:', error);
          alert('Failed to load candidate data or ratings. Please try again.');
        } finally {
          setLoading(false);
        }
      };
      fetchCandidateData();
    } else {
      setCandidateDetails(null);
      setRatings([]);
    }
  }, [selectedCandidate, selectedItem]); // CRITICAL: Add selectedItem dependency

  const getRaterTypeCode = (raterType) => {
    switch (raterType) {
      case 'Chairperson': return 'CHAIR';
      case 'Vice-Chairperson': return 'VICE';
      case 'Regular Member': return 'REGMEM';
      case 'DENREU': return 'DENREU';
      case 'Gender and Development': return 'GAD';
      case 'End-User': return 'END-USER';
      default: return raterType || 'UNKNOWN';
    }
  };

  const isRaterRequired = (raterType) => {
    if (!salaryGrade) return false;
    const requiredRatersSG14AndBelow = ['REGMEM', 'END-USER'];
    const allRaters = ['CHAIR', 'VICE', 'GAD', 'DENREU', 'REGMEM', 'END-USER'];
    
    return salaryGrade <= 14 
      ? requiredRatersSG14AndBelow.includes(raterType)
      : allRaters.includes(raterType);
  };

  // UPDATED: Filter by itemNumber
  const getRatingDisplay = (competencyCode, raterType) => {
    if (!isRaterRequired(raterType)) return 'NA';
    
    const rating = ratings.find(r => 
      r.competencyId.name.toUpperCase().replace(/ /g, '_') === competencyCode &&
      getRaterTypeCode(r.raterId.raterType) === raterType &&
      r.itemNumber === selectedItem  // CRITICAL: Filter by item number
    );
    return rating ? rating.score.toFixed(2) : '-';
  };

  // UPDATED: Filter by itemNumber
  const calculateRowAverage = (competencyCode, competencyType) => {
    const raterTypes = ['CHAIR', 'VICE', 'GAD', 'DENREU', 'REGMEM', 'END-USER'];
    const validRatings = raterTypes
      .filter(raterType => isRaterRequired(raterType))
      .map(raterType => {
        const rating = ratings.find(r => 
          r.competencyId.name.toUpperCase().replace(/ /g, '_') === competencyCode && 
          getRaterTypeCode(r.raterId.raterType) === raterType &&
          r.competencyType === competencyType &&
          r.itemNumber === selectedItem  // CRITICAL: Filter by item number
        );
        return rating ? rating.score : 0;
      })
      .filter(score => score !== 0);
    
    return validRatings.length > 0 
      ? validRatings.reduce((sum, score) => sum + score, 0) / validRatings.length
      : 0;
  };

  const calculateCompetencyTypeAverage = (competencyType) => {
    const competencies = groupedCompetencies[competencyType] || [];
    if (competencies.length === 0) return 0;

    let totalScore = 0;
    let ratedCompetencies = 0;

    competencies.forEach(comp => {
      const avg = calculateRowAverage(comp.code, competencyType);
      if (avg > 0) {
        totalScore += avg;
        ratedCompetencies++;
      }
    });

    return ratedCompetencies > 0 
      ? (competencyType === 'minimum' 
        ? totalScore / competencies.length 
        : totalScore / 5)
      : 0;
  };

  const calculateFinalScores = () => {
    if (!ratings.length || !salaryGrade) {
      return { psychoSocial: 0, potential: 0, breakdown: { basic: 0, organizational: 0, leadership: 0, minimum: 0 } };
    }

    const basicAvg = calculateCompetencyTypeAverage('basic');
    const orgAvg = calculateCompetencyTypeAverage('organizational');
    const leadershipAvg = calculateCompetencyTypeAverage('leadership');
    const minimumAvg = calculateCompetencyTypeAverage('minimum');

    const psychoSocial = basicAvg * 2;
    let potential = 0;
    if (salaryGrade >= 18) {
      potential = ((orgAvg + leadershipAvg + minimumAvg) / 3) * 2;
    } else {
      potential = ((orgAvg + minimumAvg) / 2) * 2;
    }

    return {
      psychoSocial: Math.round(psychoSocial * 100) / 100,
      potential: Math.round(potential * 100) / 100,
      breakdown: {
        basic: Math.round(basicAvg * 100) / 100,
        organizational: Math.round(orgAvg * 100) / 100,
        leadership: Math.round(leadershipAvg * 100) / 100,
        minimum: Math.round(minimumAvg * 100) / 100
      }
    };
  };

  const shouldShowLeadership = () => {
    return salaryGrade >= 18 && groupedCompetencies.leadership.length > 0;
  };

  // UPDATED: PDF Generation with itemNumber filtering
  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const scores = calculateFinalScores();

    // --- Header ---
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Department of Environment and Natural Resources', 105, 10, { align: 'center' });
    doc.text('Regional Office (CALABARZON)', 105, 13, { align: 'center' });
    doc.text('Human Resource Merit Promotion and Selection Board (HRMPSB)', 105, 16, { align: 'center' });
    doc.setFontSize(12);
    doc.text('SUMMARY OF INTERVIEW SCORES', 105, 22, { align: 'center' });

    // --- Candidate Info (aligned with tabs) ---
    doc.setFontSize(8);
    let y = 28;
    const xLeft = 20;
    const xTab = 70;

    const details = [
      ['Name of Candidate:', candidateDetails?.fullName || ''],
      ['Office:', vacancyDetails?.assignment || ''],
      ['Vacancy:', vacancyDetails?.position || ''],
      ['Item Number:', selectedItem || ''],
      ['Date of Interview:', new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })]
    ];

    details.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, xLeft, y);
      doc.setFont('helvetica', 'normal');
      doc.text(value, xTab, y);
      y += 3.5;
    });

    // --- Column Widths ---
    const colCompetency = 116;
    const colRating = 10.5;

    const columnWidths = {
      0: { cellWidth: colCompetency, halign: 'left' },
      1: { cellWidth: colRating, halign: 'center' },
      2: { cellWidth: colRating, halign: 'center' },
      3: { cellWidth: colRating, halign: 'center' },
      4: { cellWidth: colRating, halign: 'center' },
      5: { cellWidth: colRating, halign: 'center' },
      6: { cellWidth: colRating, halign: 'center' },
      7: { cellWidth: colRating, halign: 'center' }
    };

    // UPDATED: Helper to render a competency group table with itemNumber filtering
    const makeCompTable = (groupTitle, competencies, type) => {
      doc.autoTable({
        startY: doc.lastAutoTable ? doc.lastAutoTable.finalY + 4 : y + 4,
        head: [[
          groupTitle, 'CHAIR', 'VICE', 'GAD', 'DENREU', 'REGMEM', 'END-U', 'AVE'
        ]],
        body: competencies.map(comp => [
          `${comp.ordinal}. ${comp.name}`,
          getRatingDisplay(comp.code, 'CHAIR'),
          getRatingDisplay(comp.code, 'VICE'),
          getRatingDisplay(comp.code, 'GAD'),
          getRatingDisplay(comp.code, 'DENREU'),
          getRatingDisplay(comp.code, 'REGMEM'),
          getRatingDisplay(comp.code, 'END-USER'),
          { content: calculateRowAverage(comp.code, type).toFixed(2), styles: { fontStyle: 'bold' } }
        ]),
        foot: [[
          { content: 'TOTAL', styles: { halign: 'center', fontStyle: 'bold' } },
          ...['CHAIR','VICE','GAD','DENREU','REGMEM','END-USER'].map(rt =>
            ({ content: (competencies.reduce((sum, comp) => {
              const r = ratings.find(r =>
                r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                getRaterTypeCode(r.raterId.raterType) === rt &&
                r.itemNumber === selectedItem  // CRITICAL: Filter by item number
              );
              return sum + (r ? r.score : 0);
            }, 0) / Math.max(1, competencies.length)).toFixed(2), styles: { halign: 'center' } })
          ),
          { content: calculateFinalScores().breakdown[type].toFixed(2), styles: { fontStyle: 'bold', halign: 'center' } }
        ]],
        styles: { fontSize: 5.2, cellPadding: 0.8, valign: 'middle' },
        headStyles: { halign: 'center', fontStyle: 'bold' },
        columnStyles: columnWidths,
        theme: 'grid',
        margin: { left: 10, right: 14 }
      });

      y = doc.lastAutoTable.finalY;
    };

    // --- Section I: Psycho-Social ---
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('I. PSYCHO-SOCIAL ATTRIBUTES AND PERSONALITY TRAITS', xLeft, y);

    // Create box for CER Score
    const cerScore1 = scores.psychoSocial.toFixed(2);
    const scoreBoxWidth = 40;
    const scoreBoxHeight = 6;
    const scoreBoxX = 190 - scoreBoxWidth;
    const scoreBoxY = y - 4;

    // Draw heavy border box
    doc.setLineWidth(.3);
    doc.rect(scoreBoxX, scoreBoxY, scoreBoxWidth, scoreBoxHeight);

    // Add CER score text inside the box
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`CER SCORE: ${cerScore1}`, scoreBoxX + scoreBoxWidth/2, y + .3, { align: 'center' });

    // For basic competencies
    makeCompTable('BASIC COMPETENCIES', groupedCompetencies.basic, 'basic');

    // --- Section II: Potential - Place heading and force table positioning ---
    let potentialSectionY = doc.lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('II. POTENTIAL', xLeft, potentialSectionY);

    // Create box for CER Score
    const cerScore2 = scores.potential.toFixed(2);
    const scoreBox2X = 190 - scoreBoxWidth;
    const scoreBox2Y = potentialSectionY - 4;

    // Draw heavy border box
    doc.setLineWidth(.3);
    doc.rect(scoreBox2X, scoreBox2Y, scoreBoxWidth, scoreBoxHeight);

    // Add CER score text inside the box
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`CER SCORE: ${cerScore2}`, scoreBox2X + scoreBoxWidth/2, potentialSectionY + .3, { align: 'center' });

    // ORGANIZATIONAL TABLE - with forced positioning
    doc.autoTable({
      startY: potentialSectionY + 4,
      head: [['ORGANIZATIONAL COMPETENCIES', 'CHAIR', 'VICE', 'GAD', 'DENREU', 'REGMEM', 'END-U', 'AVE']],
      body: groupedCompetencies.organizational.map(comp => [
        `${comp.ordinal}. ${comp.name}`,
        getRatingDisplay(comp.code, 'CHAIR'),
        getRatingDisplay(comp.code, 'VICE'),
        getRatingDisplay(comp.code, 'GAD'),
        getRatingDisplay(comp.code, 'DENREU'),
        getRatingDisplay(comp.code, 'REGMEM'),
        getRatingDisplay(comp.code, 'END-USER'),
        { content: calculateRowAverage(comp.code, 'organizational').toFixed(2), styles: { fontStyle: 'bold' } }
      ]),
      foot: [[
        { content: 'TOTAL', styles: { halign: 'center', fontStyle: 'bold' } },
        ...['CHAIR','VICE','GAD','DENREU','REGMEM','END-USER'].map(rt =>
          ({ content: (groupedCompetencies.organizational.reduce((sum, comp) => {
            const r = ratings.find(r =>
              r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
              getRaterTypeCode(r.raterId.raterType) === rt &&
              r.itemNumber === selectedItem  // CRITICAL: Filter by item number
            );
            return sum + (r ? r.score : 0);
          }, 0) / Math.max(1, groupedCompetencies.organizational.length)).toFixed(2), styles: { halign: 'center' } })
        ),
        { content: calculateFinalScores().breakdown.organizational.toFixed(2), styles: { fontStyle: 'bold', halign: 'center' } }
      ]],
      styles: { fontSize: 5.2, cellPadding: 0.8, valign: 'middle' },
      headStyles: { halign: 'center', fontStyle: 'bold' },
      columnStyles: columnWidths,
      theme: 'grid',
      margin: { left: 10, right: 14 }
    });

    if (shouldShowLeadership()) {
      // For leadership competencies
      makeCompTable('LEADERSHIP COMPETENCIES', groupedCompetencies.leadership, 'leadership');
    }
    makeCompTable('MINIMUM COMPETENCIES', groupedCompetencies.minimum, 'minimum');

    y = doc.lastAutoTable.finalY + 6;

    // --- Dynamic Signatories based on actual raters who rated this candidate ---
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.text('Certified True and Correct:', xLeft, y);
    y += 10;

    // Get unique rater IDs from the ratings for this candidate
    const raterIdsWhoRated = [...new Set(ratings.map(rating => rating.raterId._id.toString()))];
    
    // Filter raters to only include those who actually rated this candidate
    const ratersWhoRated = raters.filter(rater => 
      rater && 
      rater.name && 
      rater.raterType &&
      raterIdsWhoRated.includes(rater._id.toString())
    );

    // Create signatories array from actual raters data
    const raterTypeOrder = ['Chairperson', 'Vice-Chairperson', 'End-User', 'Regular Member', 'DENREU', 'Gender and Development'];
    
    // Sort raters according to the specified order
    const sortedRaters = ratersWhoRated.sort((a, b) => {
      const indexA = raterTypeOrder.indexOf(a.raterType);
      const indexB = raterTypeOrder.indexOf(b.raterType);
      
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      
      return indexA - indexB;
    });

    // Create signatories array with name, position, and designation
    const signatories = sortedRaters.map(rater => [
      rater.name.toUpperCase(),
      rater.position,
      rater.designation
    ]);
    
    // Render signatories in a 2-column layout
    const colWidth = 90;
    let col = 0;
    let rowY = y;
    
    signatories.forEach(([name, position, designation]) => {
      const x = xLeft + (col * colWidth);
      
      // Name (bold, smaller)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(name, x + colWidth / 2, rowY, { align: 'center' });
      
      // Position (normal, smaller)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      if (position) {
        doc.text(position, x + colWidth / 2, rowY + 3, { align: 'center' });
      }
      
      // Designation (if available, normal, smaller)
      if (designation) {
        doc.text(designation, x + colWidth / 2, rowY + 6, { align: 'center' });
      }
    
      col++;
      if (col === 2) {
        col = 0;
        rowY += 16;
      }
    });

    // --- Save ---
    doc.save(`Interview_Summary_${candidateDetails?.fullName || 'Report'}.pdf`);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 shadow-xl rounded-2xl p-8 border border-blue-100">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
              Interview Summary Generator
            </h2>
            {selectedCandidate && (
              <div className="flex items-center space-x-3">
                {/* Auto-refresh toggle */}
                <div className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-sm">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    <span className="ml-3 text-sm font-medium text-gray-700">
                      Auto-refresh {autoRefresh && `(${formatTimeSince(lastRefresh)})`}
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>
          <p className="text-gray-600">Generate comprehensive interview summaries with real-time rating data</p>
        </div>

        {/* Selection Filters */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Selection Criteria
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Assignment</label>
              <select
                value={selectedAssignment}
                onChange={(e) => setSelectedAssignment(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              >
                <option value="">Select Assignment</option>
                {assignments.map(assignment => (
                  <option key={assignment} value={assignment}>{assignment}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Position</label>
              <select
                value={selectedPosition}
                onChange={(e) => setSelectedPosition(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                disabled={!selectedAssignment}
              >
                <option value="">Select Position</option>
                {positions.map(position => (
                  <option key={position} value={position}>{position}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Item Number</label>
              <select
                value={selectedItem}
                onChange={(e) => setSelectedItem(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                disabled={!selectedPosition}
              >
                <option value="">Select Item Number</option>
                {items.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Candidate</label>
              <select
                value={selectedCandidate}
                onChange={(e) => setSelectedCandidate(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                disabled={!selectedItem}
              >
                <option value="">Select Candidate</option>
                {candidates.map(candidate => (
                  <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {selectedCandidate && candidateDetails && (
          <>
            {/* Candidate Information Card */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-6 border-l-4 border-blue-600">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Candidate Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Full Name</p>
                  <p className="font-semibold text-gray-900">{candidateDetails.fullName}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Office/Assignment</p>
                  <p className="font-semibold text-gray-900">{vacancyDetails?.assignment || 'REGIONAL OFFICE'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Position Applied</p>
                  <p className="font-semibold text-gray-900">{vacancyDetails?.position}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Item Number</p>
                  <p className="font-semibold text-gray-900">{selectedItem}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Salary Grade</p>
                  <p className="font-semibold text-gray-900">{salaryGrade}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Interview Date</p>
                  <p className="font-semibold text-gray-900">{new Date().toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            {groupedCompetencies.basic.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-bold mb-2">I. PSYCHO-SOCIAL ATTRIBUTES</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DIMENSIONS</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CHAIR</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VICE</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GAD</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DENREU</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">REGMEM</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">END-USER</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AVERAGE</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {groupedCompetencies.basic.map((comp, index) => (
                        <tr key={comp.code}>
                          <td className="px-6 py-4 whitespace-nowrap">{`${comp.ordinal}. ${comp.name}`}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'CHAIR')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'VICE')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'GAD')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'DENREU')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'REGMEM')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'END-USER')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{calculateRowAverage(comp.code, 'basic').toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="px-6 py-4 whitespace-nowrap">TOTAL</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.basic.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'CHAIR' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.basic.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.basic.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'VICE' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.basic.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.basic.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'GAD' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.basic.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.basic.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'DENREU' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.basic.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {(groupedCompetencies.basic.reduce((sum, comp) => {
                            const rating = ratings.find(r => 
                              r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                              getRaterTypeCode(r.raterId.raterType) === 'REGMEM' &&
                              r.itemNumber === selectedItem
                            );
                            return sum + (rating ? rating.score : 0);
                          }, 0) / Math.max(1, groupedCompetencies.basic.length)).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {(groupedCompetencies.basic.reduce((sum, comp) => {
                            const rating = ratings.find(r => 
                              r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                              getRaterTypeCode(r.raterId.raterType) === 'END-USER' &&
                              r.itemNumber === selectedItem
                            );
                            return sum + (rating ? rating.score : 0);
                          }, 0) / Math.max(1, groupedCompetencies.basic.length)).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{calculateFinalScores().breakdown.basic.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {groupedCompetencies.organizational.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-bold mb-2">II. ORGANIZATIONAL COMPETENCIES</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DIMENSIONS</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CHAIR</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VICE</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GAD</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DENREU</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">REGMEM</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">END-USER</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AVERAGE</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {groupedCompetencies.organizational.map((comp, index) => (
                        <tr key={comp.code}>
                          <td className="px-6 py-4 whitespace-nowrap">{`${comp.ordinal}. ${comp.name}`}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'CHAIR')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'VICE')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'GAD')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'DENREU')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'REGMEM')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'END-USER')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{calculateRowAverage(comp.code, 'organizational').toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="px-6 py-4 whitespace-nowrap">TOTAL</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.organizational.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'CHAIR' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.organizational.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.organizational.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'VICE' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.organizational.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.organizational.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'GAD' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.organizational.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.organizational.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'DENREU' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.organizational.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {(groupedCompetencies.organizational.reduce((sum, comp) => {
                            const rating = ratings.find(r => 
                              r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                              getRaterTypeCode(r.raterId.raterType) === 'REGMEM' &&
                              r.itemNumber === selectedItem
                            );
                            return sum + (rating ? rating.score : 0);
                          }, 0) / Math.max(1, groupedCompetencies.organizational.length)).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {(groupedCompetencies.organizational.reduce((sum, comp) => {
                            const rating = ratings.find(r => 
                              r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                              getRaterTypeCode(r.raterId.raterType) === 'END-USER' &&
                              r.itemNumber === selectedItem
                            );
                            return sum + (rating ? rating.score : 0);
                          }, 0) / Math.max(1, groupedCompetencies.organizational.length)).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{calculateFinalScores().breakdown.organizational.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {shouldShowLeadership() && (
              <div className="mb-6">
                <h3 className="text-lg font-bold mb-2">III. LEADERSHIP COMPETENCIES</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DIMENSIONS</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CHAIR</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VICE</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GAD</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DENREU</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">REGMEM</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">END-USER</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AVERAGE</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {groupedCompetencies.leadership.map((comp, index) => (
                        <tr key={comp.code}>
                          <td className="px-6 py-4 whitespace-nowrap">{`${comp.ordinal}. ${comp.name}`}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'CHAIR')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'VICE')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'GAD')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'DENREU')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'REGMEM')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'END-USER')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{calculateRowAverage(comp.code, 'leadership').toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="px-6 py-4 whitespace-nowrap">TOTAL</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.leadership.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'CHAIR' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.leadership.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.leadership.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'VICE' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.leadership.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.leadership.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'GAD' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.leadership.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.leadership.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'DENREU' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.leadership.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {(groupedCompetencies.leadership.reduce((sum, comp) => {
                            const rating = ratings.find(r => 
                              r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                              getRaterTypeCode(r.raterId.raterType) === 'REGMEM' &&
                              r.itemNumber === selectedItem
                            );
                            return sum + (rating ? rating.score : 0);
                          }, 0) / Math.max(1, groupedCompetencies.leadership.length)).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {(groupedCompetencies.leadership.reduce((sum, comp) => {
                            const rating = ratings.find(r => 
                              r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                              getRaterTypeCode(r.raterId.raterType) === 'END-USER' &&
                              r.itemNumber === selectedItem
                            );
                            return sum + (rating ? rating.score : 0);
                          }, 0) / Math.max(1, groupedCompetencies.leadership.length)).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{calculateFinalScores().breakdown.leadership.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {groupedCompetencies.minimum.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-bold mb-2">IV. MINIMUM COMPETENCIES</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DIMENSIONS</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CHAIR</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VICE</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GAD</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DENREU</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">REGMEM</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">END-USER</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AVERAGE</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {groupedCompetencies.minimum.map((comp, index) => (
                        <tr key={comp.code}>
                          <td className="px-6 py-4 whitespace-nowrap">{`${comp.ordinal}. ${comp.name}`}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'CHAIR')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'VICE')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'GAD')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'DENREU')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'REGMEM')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRatingDisplay(comp.code, 'END-USER')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{calculateRowAverage(comp.code, 'minimum').toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="px-6 py-4 whitespace-nowrap">TOTAL</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.minimum.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'CHAIR' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.minimum.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.minimum.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'VICE' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.minimum.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.minimum.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'GAD' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.minimum.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{salaryGrade <= 14 ? 'NA' : (groupedCompetencies.minimum.reduce((sum, comp) => {
                          const rating = ratings.find(r => 
                            r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                            getRaterTypeCode(r.raterId.raterType) === 'DENREU' &&
                            r.itemNumber === selectedItem
                          );
                          return sum + (rating ? rating.score : 0);
                        }, 0) / Math.max(1, groupedCompetencies.minimum.length)).toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {(groupedCompetencies.minimum.reduce((sum, comp) => {
                            const rating = ratings.find(r => 
                              r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                              getRaterTypeCode(r.raterId.raterType) === 'REGMEM' &&
                              r.itemNumber === selectedItem
                            );
                            return sum + (rating ? rating.score : 0);
                          }, 0) / Math.max(1, groupedCompetencies.minimum.length)).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {(groupedCompetencies.minimum.reduce((sum, comp) => {
                            const rating = ratings.find(r => 
                              r.competencyId.name.toUpperCase().replace(/ /g, '_') === comp.code &&
                              getRaterTypeCode(r.raterId.raterType) === 'END-USER' &&
                              r.itemNumber === selectedItem
                            );
                            return sum + (rating ? rating.score : 0);
                          }, 0) / Math.max(1, groupedCompetencies.minimum.length)).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{calculateFinalScores().breakdown.minimum.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Final Scores Card */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-lg p-6 mb-6 text-white">
              <h3 className="text-xl font-bold mb-4 flex items-center">
                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Calculated Scores
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-lg p-4">
                  <p className="text-sm font-medium mb-2 opacity-90">Psycho-Social Score</p>
                  <p className="text-4xl font-bold">{calculateFinalScores().psychoSocial.toFixed(2)}</p>
                </div>
                <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-lg p-4">
                  <p className="text-sm font-medium mb-2 opacity-90">Potential Score</p>
                  <p className="text-4xl font-bold">{calculateFinalScores().potential.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Export Button */}
            <div className="flex justify-end">
              <button 
                onClick={exportToPDF} 
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                disabled={!selectedCandidate || !candidateDetails}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Export to PDF</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default InterviewSummaryGenerator;
