import React, { useState, useEffect } from 'react';
import { candidatesAPI, vacanciesAPI, usersAPI } from '../utils/api';
import { getStatusLabel, CANDIDATE_STATUS } from '../utils/constants';
import { formatDate } from '../utils/helpers';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';


const PDFReport = ({ itemNumber, user, raters }) => {
  const [vacancy, setVacancy] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadReportData = async () => {
      try {
        setLoading(true);
        setError('');
        
        const [vacanciesRes, candidatesRes] = await Promise.all([
          vacanciesAPI.getAll(),
          candidatesAPI.getAll(),
        ]);
        
        const vacancy = vacanciesRes.find(v => v.itemNumber === itemNumber);
        if (!vacancy) {
          throw new Error('VACANCY NOT FOUND FOR THE SPECIFIED ITEM NUMBER');
        }
        
        const filteredCandidates = candidatesRes
          .filter(c => c.itemNumber === itemNumber)
          .sort((a, b) => a.fullName.localeCompare(b.fullName));
        
        setVacancy(vacancy);
        setCandidates(filteredCandidates);
      } catch (err) {
        console.error('FAILED TO LOAD REPORT DATA:', err);
        setError('FAILED TO LOAD REPORT DATA. PLEASE TRY AGAIN.');
      } finally {
        setLoading(false);
      }
    };

    if (itemNumber) {
      loadReportData();
    }
  }, [itemNumber]);

  const generatePDF = () => {
    try {
      if (!vacancy || !candidates) {
        setError('MISSING VACANCY OR CANDIDATE DATA FOR REPORT GENERATION.');
        return;
      }

      // Define custom paper size: 8x13 inches in points (1 inch = 72 points)
      const doc = new jsPDF({
        format: [576, 936], // [width, height] in points
        unit: 'pt' // Use points as the unit
      });

      // Set a professional font (Helvetica is standard and clean)
      doc.setFont("helvetica");

      // --- FOOTER INFORMATION ---
      const now = new Date();
      const dateTimeString = now.toLocaleString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
          hour12: true
      });
      const footerText = `Item: ${vacancy.itemNumber} | Generated: ${dateTimeString}`;

      // --- FOOTER FUNCTION ---
      function addFooter() {
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const currentPage = doc.internal.getCurrentPageInfo().pageNumber;
        const totalPages = doc.internal.getNumberOfPages();
        
        // Save current font settings
        const currentFontSize = doc.getFontSize();
        const currentFont = doc.getFont();
        
        // Set footer font
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        
        // Draw footer line
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(50, pageHeight - 30, pageWidth - 50, pageHeight - 30);
        
        // Add footer text (left side)
        doc.text(footerText, 50, pageHeight - 18);
        
        // Add page numbers (right side)
        doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - 50, pageHeight - 18, { align: 'right' });
        
        // Restore original font settings
        doc.setFontSize(currentFontSize);
        doc.setFont(currentFont.fontName, currentFont.fontStyle);
      }

      // --- IMPORTANT MARGIN AND INITIAL Y-OFFSET ADJUSTMENTS ---
      let yOffset = 60; 
      const margin = 50; 
      
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      
      // Department header
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text('DEPARTMENT OF ENVIRONMENT AND NATURAL RESOURCES (CALABARZON)', pageWidth / 2, yOffset, { align: 'center' });
      yOffset += 15;
      
      doc.setFontSize(10);
      doc.text('REGIONAL HUMAN RESOURCE SELECTION AND PROMOTION BOARD', pageWidth / 2, yOffset, { align: 'center' });
      yOffset += 25;
      
      // Main Title of the Document
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.text('SUMMARY OF THE DELIBERATION OF CANDIDATES FOR LONG LIST', pageWidth / 2, yOffset, { align: 'center' });
      doc.setFont("helvetica", "normal");
      yOffset += 30;

      // PDF HEADER: POSITION, ASSIGNMENT, ITEM (Aligned like tabs)
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");

      // Calculate label width dynamically to ensure consistent alignment
      const labelWidth = Math.max(
          doc.getStringUnitWidth('POSITION:') * doc.getFontSize(),
          doc.getStringUnitWidth('ASSIGNMENT:') * doc.getFontSize(),
          doc.getStringUnitWidth('ITEM:') * doc.getFontSize()
      ) / doc.internal.scaleFactor;
      const valueX = margin + labelWidth + 5; 

      doc.text(`POSITION:`, margin, yOffset);
      doc.setFont("helvetica", "normal");
      doc.text(`${vacancy.position || 'N/A'}`, valueX, yOffset);
      doc.setFont("helvetica", "bold");
      yOffset += 15; 

      doc.text(`ASSIGNMENT:`, margin, yOffset);
      doc.setFont("helvetica", "normal");
      doc.text(`${vacancy.assignment || 'N/A'}`, valueX, yOffset);
      doc.setFont("helvetica", "bold");
      yOffset += 15; 

      doc.text(`ITEM:`, margin, yOffset);
      doc.setFont("helvetica", "normal");
      doc.text(`${vacancy.itemNumber}`, valueX, yOffset);
      yOffset += 20;

      // PRESENT DATE AND TIME
      doc.setFontSize(8);
      const fullDateTimeString = now.toLocaleString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: true
      });
      doc.text(`Generated on: ${fullDateTimeString}`, margin, yOffset);
      yOffset += 30;

      // Helper function for 2-column lists with vertical ordering
      function drawTwoColumnList(title, candidatesList, currentY, isBoldTitle = true) {
        // Check for page break before drawing list title
        if (currentY > pageHeight - margin - 60) {
            doc.addPage();
            addFooter();
            currentY = margin + 5; 
        }

        doc.setFontSize(13);
        doc.setFont("helvetica", isBoldTitle ? "bold" : "normal");
        doc.text(title, margin, currentY);
        doc.setFont("helvetica", "normal");
        currentY += 20;

        doc.setFontSize(10);
        const colWidth = (pageWidth - (2 * margin) - 30) / 2;
        const col1X = margin; 
        const col2X = margin + colWidth + 30; 

        const halfCount = Math.ceil(candidatesList.length / 2);
        let col1CurrentY = currentY;
        let col2CurrentY = currentY;
        const baseLineHeight = 15;

        // Draw first column (items 1, 3, 5...)
        for (let i = 0; i < halfCount; i++) {
          if (col1CurrentY > pageHeight - margin - 80) {
              doc.addPage();
              addFooter();
              col1CurrentY = margin + 5;
              col2CurrentY = margin + 5;
              doc.setFontSize(10);
          }
          
          const itemNumber = `${i + 1}. `;
          const candidateName = candidatesList[i];
          const nameLines = doc.splitTextToSize(candidateName, colWidth - doc.getStringUnitWidth(itemNumber) * doc.getFontSize() / doc.internal.scaleFactor);
          
          const indentWidth = doc.getStringUnitWidth(itemNumber) * doc.getFontSize() / doc.internal.scaleFactor;
          
          // Draw first line with number
          doc.text(`${itemNumber}${nameLines[0]}`, col1X, col1CurrentY);
          
          // Draw continuation lines with indent
          for (let lineIndex = 1; lineIndex < nameLines.length; lineIndex++) {
            col1CurrentY += doc.getFontSize() * 1.2;
            doc.text(nameLines[lineIndex], col1X + indentWidth, col1CurrentY);
          }
          
          col1CurrentY += doc.getFontSize() * 1.2 + 2;
        }

        // Draw second column (items 2, 4, 6...)
        for (let i = halfCount; i < candidatesList.length; i++) {
          if (col2CurrentY > pageHeight - margin - 80) {
              doc.addPage();
              addFooter();
              col1CurrentY = margin + 5;
              col2CurrentY = margin + 5;
              doc.setFontSize(10);
          }
          
          const itemNumber = `${i + 1}. `;
          const candidateName = candidatesList[i];
          const nameLines = doc.splitTextToSize(candidateName, colWidth - doc.getStringUnitWidth(itemNumber) * doc.getFontSize() / doc.internal.scaleFactor);
          
          const indentWidth = doc.getStringUnitWidth(itemNumber) * doc.getFontSize() / doc.internal.scaleFactor;
          
          // Draw first line with number
          doc.text(`${itemNumber}${nameLines[0]}`, col2X, col2CurrentY);
          
          // Draw continuation lines with indent
          for (let lineIndex = 1; lineIndex < nameLines.length; lineIndex++) {
            col2CurrentY += doc.getFontSize() * 1.2;
            doc.text(nameLines[lineIndex], col2X + indentWidth, col2CurrentY);
          }
          
          col2CurrentY += doc.getFontSize() * 1.2 + 2;
        }
        
        let finalY = Math.max(col1CurrentY, col2CurrentY);
        
        finalY += 10;
        doc.text('*** END OF LIST ***', pageWidth / 2, finalY, { align: 'center' });
        finalY += 25;
        return finalY;
      }

      // Filter candidates by status
      const longListCandidates = candidates
        .filter(c => c.status === CANDIDATE_STATUS.LONG_LIST)
        .map(c => c.fullName || 'N/A');
      const forReviewCandidates = candidates
        .filter(c => c.status === CANDIDATE_STATUS.FOR_REVIEW)
        .map(c => c.fullName || 'N/A');
      const disqualifiedCandidates = candidates
        .filter(c => c.status === CANDIDATE_STATUS.DISQUALIFIED)
        .map(c => c.fullName || 'N/A');

      // Long List Candidates
      if (longListCandidates.length > 0) {
        yOffset = drawTwoColumnList('LONG LIST CANDIDATES:', longListCandidates, yOffset);
      }

      // For Review Candidates
      if (forReviewCandidates.length > 0) {
        yOffset = drawTwoColumnList('CANDIDATES FOR REVIEW:', forReviewCandidates, yOffset);
      }

      // Disqualified Candidates
      if (disqualifiedCandidates.length > 0) {
        yOffset = drawTwoColumnList('DISQUALIFIED CANDIDATES:', disqualifiedCandidates, yOffset);
      } else {
          yOffset += 20;
      }

      // Gender Statistics Section
      if (yOffset + 100 > pageHeight - margin - 60) {
          doc.addPage();
          addFooter();
          yOffset = margin + 10;
      }

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text('GENDER DISTRIBUTION:', margin, yOffset);
      doc.setFont("helvetica", "normal");
      yOffset += 20;

      // Calculate gender counts with all variations
      const maleCount = candidates.filter(c => 
        c.gender === 'Male' || c.gender === 'MALE/LALAKI'
      ).length;
      const femaleCount = candidates.filter(c => 
        c.gender === 'Female' || c.gender === 'FEMALE/BABAE'
      ).length;
      const lgbtqiCount = candidates.filter(c => 
        c.gender === 'LGBTQI+'
      ).length;
      const totalCandidates = candidates.length;

      // Calculate percentages
      const malePercentage = totalCandidates > 0 ? ((maleCount / totalCandidates) * 100).toFixed(1) : 0;
      const femalePercentage = totalCandidates > 0 ? ((femaleCount / totalCandidates) * 100).toFixed(1) : 0;
      const lgbtqiPercentage = totalCandidates > 0 ? ((lgbtqiCount / totalCandidates) * 100).toFixed(1) : 0;

      doc.setFontSize(11);
      doc.text(`Male: ${maleCount} (${malePercentage}%)`, margin + 20, yOffset);
      yOffset += 15;
      doc.text(`Female: ${femaleCount} (${femalePercentage}%)`, margin + 20, yOffset);
      yOffset += 15;
      if (lgbtqiCount > 0) {
        doc.text(`LGBTQI+: ${lgbtqiCount} (${lgbtqiPercentage}%)`, margin + 20, yOffset);
        yOffset += 15;
      }
      doc.text(`Total: ${totalCandidates}`, margin + 20, yOffset);
      yOffset += 30;

      // Signatories (dynamic with lines and assignment)
      if (raters && raters.length > 0) {
          const avgSignatoryHeightEstimate = 80; 
          const totalEstimatedSignatoryHeight = (Math.ceil(raters.length / 2) * avgSignatoryHeightEstimate) + 50; 

          if (yOffset + totalEstimatedSignatoryHeight > pageHeight - margin - 60) {
              doc.addPage();
              addFooter();
              yOffset = margin + 10; 
          }

          // CERTIFYING CLAUSE
          doc.setFontSize(9);
          const certifyingClause = "This certifies that the details contained herein have been thoroughly reviewed and validated.";
          doc.text(certifyingClause, margin, yOffset, { maxWidth: pageWidth - (2 * margin) });
          yOffset += 25; 

          doc.setFontSize(11);
          doc.text("Noted by:", margin, yOffset);
          yOffset += 40;

          const sigColWidth = (pageWidth - (2 * margin) - 40) / 2; 
          const sigCol1X = margin + sigColWidth / 2;
          const sigCol2X = margin + sigColWidth + 40 + sigColWidth / 2; 

          let currentSigY = yOffset;
          const nameToPositionStartGap = 0;
          const positionToEndOfLineGap = 2;

          // Define line heights for specific font sizes
          const lineHeightFor8pt = 8 * 1.2; 
          const lineHeightFor9pt = 9 * 1.2; 
          const lineHeightFor11pt = 11 * 1.2;

          for (let i = 0; i < raters.length; i += 2) {
              let maxSignatoryBlockHeight = 0; 

              const sig1 = raters[i];
              const sig2 = raters[i+1];

              // Calculate height for Signatory 1
              let sig1DynamicHeight = 0;
              if (sig1) {
                  const positionLines1 = doc.splitTextToSize(sig1.position || '', sigColWidth);
                  const assignmentLines1 = doc.splitTextToSize(sig1.designation || '', sigColWidth);
                  sig1DynamicHeight = lineHeightFor11pt + 
                                      nameToPositionStartGap + 
                                      (positionLines1.length * lineHeightFor8pt) + 
                                      positionToEndOfLineGap + 
                                      (assignmentLines1.length * lineHeightFor9pt);
              }

              // Calculate height for Signatory 2
              let sig2DynamicHeight = 0;
              if (sig2) {
                  const positionLines2 = doc.splitTextToSize(sig2.position || '', sigColWidth);
                  const assignmentLines2 = doc.splitTextToSize(sig2.designation || '', sigColWidth);
                  sig2DynamicHeight = lineHeightFor11pt + 
                                      nameToPositionStartGap + 
                                      (positionLines2.length * lineHeightFor8pt) + 
                                      positionToEndOfLineGap + 
                                      (assignmentLines2.length * lineHeightFor9pt);
              }
              
              maxSignatoryBlockHeight = Math.max(sig1DynamicHeight, sig2DynamicHeight);

              if (currentSigY + maxSignatoryBlockHeight + 30 > pageHeight - margin - 60) {
                  doc.addPage();
                  addFooter();
                  currentSigY = margin + 10; 
              }

              // Draw Signatory 1
              if (sig1) {
                  doc.setFont("helvetica", "bold");
                  doc.setFontSize(11);
                  doc.text(sig1.name || 'N/A', sigCol1X, currentSigY, { align: 'center', maxWidth: sigColWidth });
                  doc.setFont("helvetica", "normal");
                  
                  doc.setFontSize(8);
                  const positionLines1 = doc.splitTextToSize(sig1.position || '', sigColWidth);
                  let currentTextY1 = currentSigY + lineHeightFor11pt + nameToPositionStartGap;
                  doc.text(positionLines1, sigCol1X, currentTextY1, { align: 'center' });
                  
                  currentTextY1 += (positionLines1.length * lineHeightFor8pt) + positionToEndOfLineGap; 

                  doc.setFontSize(9);
                  doc.setFont("helvetica", "italic");
                  const assignmentLines1 = doc.splitTextToSize(sig1.designation || '', sigColWidth);
                  doc.text(assignmentLines1, sigCol1X, currentTextY1, { align: 'center' });
                  doc.setFont("helvetica", "normal");
              }

              // Draw Signatory 2
              if (sig2) {
                  doc.setFont("helvetica", "bold");
                  doc.setFontSize(11);
                  doc.text(sig2.name || 'N/A', sigCol2X, currentSigY, { align: 'center', maxWidth: sigColWidth });
                  doc.setFont("helvetica", "normal");
                  
                  doc.setFontSize(8);
                  const positionLines2 = doc.splitTextToSize(sig2.position || '', sigColWidth);
                  let currentTextY2 = currentSigY + lineHeightFor11pt + nameToPositionStartGap;
                  doc.text(positionLines2, sigCol2X, currentTextY2, { align: 'center' });
                  
                  currentTextY2 += (positionLines2.length * lineHeightFor8pt) + positionToEndOfLineGap;

                  doc.setFontSize(9);
                  doc.setFont("helvetica", "italic");
                  const assignmentLines2 = doc.splitTextToSize(sig2.designation || '', sigColWidth);
                  doc.text(assignmentLines2, sigCol2X, currentTextY2, { align: 'center' });
                  doc.setFont("helvetica", "normal");
              }
              
              currentSigY += maxSignatoryBlockHeight + 40;
          }
          yOffset = currentSigY;
      }

      // Add footer to ALL pages
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);
          addFooter();
      }

      doc.save(`Summary_${vacancy.itemNumber}.pdf`);
      
    } catch (error) {
      console.error('FAILED TO GENERATE PDF:', error.message, error.stack);
      setError('FAILED TO GENERATE PDF REPORT. PLEASE TRY AGAIN.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-md p-6" style={{ border: '1px solid #333' }}>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">GENERATE POSITION REPORT</h2>
        {vacancy ? (
          <div className="space-y-4">
            {/* Vacancy Information Display */}
            <div className="p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">POSITION DETAILS</h3>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">POSITION:</span> {vacancy.position?.toUpperCase()}</div>
                <div><span className="font-medium">ITEM NUMBER:</span> {vacancy.itemNumber?.toUpperCase()}</div>
                <div><span className="font-medium">ASSIGNMENT:</span> {vacancy.assignment?.toUpperCase()}</div>
                <div><span className="font-medium">SALARY GRADE:</span> SG {vacancy.salaryGrade != null ? String(vacancy.salaryGrade) : 'N/A'}</div>
              </div>
            </div>
            
            {/* Candidate Summary */}
            <div className="p-4">
              <h4 className="text-md font-medium text-gray-800 mb-3">CANDIDATE SUMMARY</h4>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">TOTAL CANDIDATES:</span> {candidates.length}</div>
                <div><span className="font-medium">LONG LIST:</span> {candidates.filter(c => c.status === CANDIDATE_STATUS.LONG_LIST).length}</div>
                <div><span className="font-medium">FOR REVIEW:</span> {candidates.filter(c => c.status === CANDIDATE_STATUS.FOR_REVIEW).length}</div>
                <div><span className="font-medium">DISQUALIFIED:</span> {candidates.filter(c => c.status === CANDIDATE_STATUS.DISQUALIFIED).length}</div>
              </div>
            </div>
            
            {/* Generate Button */}
            <div className="text-center pt-4">
              <button
                onClick={generatePDF}
                className="px-6 py-3 text-white font-medium rounded transition-all duration-200"
                style={{ 
                  backgroundColor: '#333', 
                  border: '2px solid #333',
                  fontSize: '16px'
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = '#000';
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = '#333';
                }}
              >
                DOWNLOAD PDF REPORT
              </button>
            </div>
          </div>
        ) : (
          <p className="text-gray-600">NO DATA AVAILABLE FOR REPORT GENERATION.</p>
        )}
      </div>
    </div>
  );
};

export default PDFReport;
