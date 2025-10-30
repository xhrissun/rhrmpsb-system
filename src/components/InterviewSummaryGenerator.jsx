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
       &&
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

    // Create signatories array with actual rater data including both raterType and designation
    const signatories = sortedRaters.map(rater => [
      rater.name.toUpperCase(),
      rater.position,
      rater.designation
    ]);

    // Render signatories in a 2-column layout
    const colWidth = 90;
    let col = 0;
    let rowY = y;
    
    signatories.forEach(([name, raterType, designation]) => {
      const x = xLeft + (col * colWidth);
      
      // Name (bold, smaller)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(name, x + colWidth / 2, rowY, { align: 'center' });
      
      // Rater Type (normal, smaller)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text(raterType, x + colWidth / 2, rowY + 3, { align: 'center' });
      
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
    <div className="container mx-auto p-4">
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Interview Summary Generator</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Assignment</label>
            <select
              value={selectedAssignment}
              onChange={(e) => setSelectedAssignment(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
            >
              <option value="">Select Assignment</option>
              {assignments.map(assignment => (
                <option key={assignment} value={assignment}>{assignment}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Position</label>
            <select
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              disabled={!selectedAssignment}
            >
              <option value="">Select Position</option>
              {positions.map(position => (
                <option key={position} value={position}>{position}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Item Number</label>
            <select
              value={selectedItem}
              onChange={(e) => setSelectedItem(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              disabled={!selectedPosition}
            >
              <option value="">Select Item Number</option>
              {items.map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Candidate</label>
            <select
              value={selectedCandidate}
              onChange={(e) => setSelectedCandidate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              disabled={!selectedItem}
            >
              <option value="">Select Candidate</option>
              {candidates.map(candidate => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
            </select>
          </div>
        </div>

        {loading && <div className="text-center">Loading...</div>}

        {selectedCandidate && candidateDetails && (
          <>
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
              <h3 className="text-lg font-bold mb-2">Candidate Information</h3>
              <p><strong>Name:</strong> {candidateDetails.fullName}</p>
              <p><strong>Office:</strong> {vacancyDetails?.assignment || 'REGIONAL OFFICE'}</p>
              <p><strong>Vacancy:</strong> {vacancyDetails?.position}</p>
              <p><strong>Item Number:</strong> {selectedItem}</p>
              <p><strong>Salary Grade:</strong> {salaryGrade}</p>
              <p><strong>Date of Interview:</strong> {new Date().toLocaleDateString()}</p>
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

            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <h3 className="text-lg font-bold mb-2">Calculated Scores</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p><strong>Psycho-Social Score:</strong> {calculateFinalScores().psychoSocial.toFixed(2)}</p>
                </div>
                <div>
                  <p><strong>Potential Score:</strong> {calculateFinalScores().potential.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button 
                onClick={exportToPDF} 
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!selectedCandidate || !candidateDetails}
              >
                Export to PDF
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default InterviewSummaryGenerator;
