import React, { useState, useEffect } from 'react';
import { candidatesAPI, vacanciesAPI } from '../utils/api';
import { CANDIDATE_STATUS } from '../utils/constants';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// ─── Core PDF builder ────────────────────────────────────────────────────────
function buildDeliberationPDF({ vacancy, candidates, raters, includeSignatories, allItemNumbers }) {
  const withSigs = includeSignatories === true && Array.isArray(raters) && raters.length > 0;

  const doc = new jsPDF({ format: [576, 936], unit: 'pt' });
  doc.setFont('helvetica');

  const pageWidth   = doc.internal.pageSize.width;
  const pageHeight  = doc.internal.pageSize.height;
  const margin      = 50;
  const FOOTER_H    = 60;  // pts reserved at bottom for footer line + text
  const LINE_H      = 14;  // fixed line-height for every candidate entry line
  const COL_GAP     = 30;  // gap between the two columns
  const colW        = (pageWidth - 2 * margin - COL_GAP) / 2;
  const col1X       = margin;
  const col2X       = margin + colW + COL_GAP;
  const bodyBottom  = pageHeight - margin - FOOTER_H; // lowest y allowed for content

  const now = new Date();
  const shortDT = now.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  // Merge all item numbers for same position+assignment, falling back to single item
  const mergedItems = (allItemNumbers && allItemNumbers.length > 0)
    ? allItemNumbers.join(', ')
    : vacancy.itemNumber;
  const footerLeft = `Item: ${mergedItems} | Generated: ${shortDT}`;

  // ── Footer stamp — only called in the final pass ──────────────────────────
  function drawFooter(pageNum, totalPages) {
    const sz = doc.getFontSize();
    const fn = doc.getFont();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30);
    doc.text(footerLeft, margin, pageHeight - 18);
    doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, pageHeight - 18, { align: 'right' });
    doc.setFontSize(sz);
    doc.setFont(fn.fontName, fn.fontStyle);
  }

  // ── Page 1 header ─────────────────────────────────────────────────────────
  let y = 60;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DEPARTMENT OF ENVIRONMENT AND NATURAL RESOURCES (CALABARZON)', pageWidth / 2, y, { align: 'center' });
  y += 15;

  doc.setFontSize(10);
  doc.text('REGIONAL HUMAN RESOURCE SELECTION AND PROMOTION BOARD', pageWidth / 2, y, { align: 'center' });
  y += 25;

  doc.setFontSize(15);
  doc.text('SUMMARY OF THE DELIBERATION OF CANDIDATES FOR LONG LIST', pageWidth / 2, y, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  y += 30;

  // POSITION / ASSIGNMENT / ITEM — fixed label column
  const labelW = 92;
  const valX   = margin + labelW + 5;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('POSITION:',   margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(vacancy.position   || 'N/A', valX, y);
  y += 15;

  doc.setFont('helvetica', 'bold');
  doc.text('ASSIGNMENT:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(vacancy.assignment || 'N/A', valX, y);
  y += 15;

  doc.setFont('helvetica', 'bold');
  doc.text('ITEM:',       margin, y);
  doc.setFont('helvetica', 'normal');
  {
    const itemLines = doc.splitTextToSize(mergedItems, pageWidth - valX - margin);
    doc.text(itemLines, valX, y);
    y += itemLines.length * 14 + 6;
  }

  doc.setFontSize(8);
  const fullDT = now.toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
  doc.text(`Generated on: ${fullDT}`, margin, y);
  y += 30;

  // ── Pre-compute wrapped lines for every entry in a list ───────────────────
  // Returns an array of { numStr, numW, lines, totalH } — one object per name.
  // totalH is how many pts this entry takes vertically.
  function precompute(names) {
    doc.setFontSize(10);
    return names.map((name, i) => {
      const numStr = `${i + 1}. `;
      const numW   = doc.getStringUnitWidth(numStr) * 10 / doc.internal.scaleFactor;
      const lines  = doc.splitTextToSize(name, colW - numW);
      return { numStr, numW, lines, totalH: lines.length * LINE_H };
    });
  }

  // ── True newspaper-column layout ──────────────────────────────────────────
  //
  // Algorithm:
  //  1. Pre-compute every entry's height.
  //  2. Fill left column top-to-bottom until space runs out → spill to right.
  //  3. Fill right column top-to-bottom until space runs out → new page, repeat.
  //  4. Both columns on the same page start at the same Y.
  //
  // This means entries always read top-to-bottom in the left column first,
  // then top-to-bottom in the right column — matching the sample PDF exactly.
  // No row-pairing, no half-split, no gaps from unequal wrapping.
  //
  function drawTwoColList(title, names) {
    if (!names || names.length === 0) return y;

    // Need room for the title at minimum
    if (y + 20 + LINE_H > bodyBottom) {
      doc.addPage();
      y = margin + 5;
    }

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, y);
    doc.setFont('helvetica', 'normal');
    y += 20;

    doc.setFontSize(10);

    const entries = precompute(names);
    let ei = 0; // entry index, walks 0 → names.length-1

    while (ei < entries.length) {
      // ── Fill left column ──────────────────────────────────────────────────
      const pageTopY = y; // both columns on this page start here
      let leftColY = pageTopY;

      while (ei < entries.length) {
        const e = entries[ei];
        if (leftColY + e.totalH > bodyBottom) break; // no more room in left col

        // Draw this entry in the left column
        doc.text(`${e.numStr}${e.lines[0]}`, col1X, leftColY);
        for (let k = 1; k < e.lines.length; k++) {
          doc.text(e.lines[k], col1X + e.numW, leftColY + k * LINE_H);
        }
        leftColY += e.totalH;
        ei++;
      }

      // ── Fill right column (same page, same starting Y) ────────────────────
      let rightColY = pageTopY; // reset to the same top as the left column

      while (ei < entries.length) {
        const e = entries[ei];
        if (rightColY + e.totalH > bodyBottom) break; // no more room in right col

        // Draw this entry in the right column
        doc.text(`${e.numStr}${e.lines[0]}`, col2X, rightColY);
        for (let k = 1; k < e.lines.length; k++) {
          doc.text(e.lines[k], col2X + e.numW, rightColY + k * LINE_H);
        }
        rightColY += e.totalH;
        ei++;
      }

      // y advances to the LOWER of where either column ended — prevents overlap
      y = Math.max(leftColY, rightColY);

      // If there are still entries left, new page
      if (ei < entries.length) {
        doc.addPage();
        y = margin + 5;
      }
    }

    // END OF LIST marker
    if (y + 35 > bodyBottom) {
      doc.addPage();
      y = margin + 5;
    }
    y += 10;
    doc.text('*** END OF LIST ***', pageWidth / 2, y, { align: 'center' });
    y += 25;
    return y;
  }

  // ── Candidate lists ───────────────────────────────────────────────────────
  const sorted = [...candidates].sort((a, b) => (a.fullName || '').localeCompare(b.fullName));

  const longList     = sorted.filter(c => c.status === CANDIDATE_STATUS.LONG_LIST)   .map(c => c.fullName || 'N/A');
  const forReview    = sorted.filter(c => c.status === CANDIDATE_STATUS.FOR_REVIEW)  .map(c => c.fullName || 'N/A');
  const disqualified = sorted.filter(c => c.status === CANDIDATE_STATUS.DISQUALIFIED).map(c => c.fullName || 'N/A');

  y = drawTwoColList('LONG LIST CANDIDATES:', longList);
  y = drawTwoColList('CANDIDATES FOR REVIEW:', forReview);
  if (disqualified.length > 0) {
    y = drawTwoColList('DISQUALIFIED CANDIDATES:', disqualified);
  } else {
    y += 10;
  }

  // ── Gender distribution ───────────────────────────────────────────────────
  function genderCounts(list) {
    return {
      male:   list.filter(c => c.gender === 'Male'    || c.gender === 'MALE/LALAKI').length,
      female: list.filter(c => c.gender === 'Female'  || c.gender === 'FEMALE/BABAE').length,
      lgbtqi: list.filter(c => c.gender === 'LGBTQI+').length,
      total:  list.length,
    };
  }

  function drawGenderBlock(label, counts) {
    const pct  = (n) => counts.total > 0 ? ((n / counts.total) * 100).toFixed(1) : '0.0';
    const need = 15 + (3 + (counts.lgbtqi > 0 ? 1 : 0)) * 12 + 20;
    if (y + need > bodyBottom) { doc.addPage(); y = margin + 5; }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin + 10, y);
    doc.setFont('helvetica', 'normal');
    y += 15;

    doc.setFontSize(10);
    doc.text(`Male: ${counts.male} (${pct(counts.male)}%)`,       margin + 30, y); y += 12;
    doc.text(`Female: ${counts.female} (${pct(counts.female)}%)`, margin + 30, y); y += 12;
    if (counts.lgbtqi > 0) {
      doc.text(`LGBTQI+: ${counts.lgbtqi} (${pct(counts.lgbtqi)}%)`, margin + 30, y); y += 12;
    }
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: ${counts.total}`, margin + 30, y);
    doc.setFont('helvetica', 'normal');
    y += 20;
  }

  // Calculate actual space needed: heading + all-candidates block + long-list block
  const hasLgbtAll = candidates.some(c => c.gender === 'LGBTQI+');
  const longListObjs2 = candidates.filter(c => c.status === CANDIDATE_STATUS.LONG_LIST);
  const hasLgbtLL  = longListObjs2.some(c => c.gender === 'LGBTQI+');
  const genderBlockNeed = (hasLgbt) => 15 + (3 + (hasLgbt ? 1 : 0)) * 12 + 20;
  const genderSectionNeed = 25 + genderBlockNeed(hasLgbtAll) + (longListObjs2.length > 0 ? genderBlockNeed(hasLgbtLL) : 0);
  if (y + genderSectionNeed > bodyBottom) { doc.addPage(); y = margin + 5; }
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('GENDER DISTRIBUTION:', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 25;

  drawGenderBlock('ALL CANDIDATES:', genderCounts(candidates));

  if (longListObjs2.length > 0) {
    drawGenderBlock('LONG LIST CANDIDATES:', genderCounts(longListObjs2));
  }

  // ── Signatories — only when explicitly requested ──────────────────────────
  if (withSigs) {
    y += 10;

    const LH11 = 11 * 1.2;
    const LH8  =  8 * 1.2;
    const LH9  =  9 * 1.2;
    const sigColW = (pageWidth - 2 * margin - 40) / 2;
    const sig1CX  = margin + sigColW / 2;
    const sig2CX  = margin + sigColW + 40 + sigColW / 2;

    if (y + 60 > bodyBottom) { doc.addPage(); y = margin + 5; }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      'This certifies that the details contained herein have been thoroughly reviewed and validated.',
      margin, y, { maxWidth: pageWidth - 2 * margin }
    );
    y += 25;

    doc.setFontSize(11);
    doc.text('Noted by:', margin, y);
    y += 40;

    function sigBlockH(sig) {
      if (!sig) return 0;
      const posLines  = doc.splitTextToSize(sig.position    || '', sigColW);
      const desgLines = doc.splitTextToSize(sig.designation || '', sigColW);
      return LH11 + posLines.length * LH8 + 2 + desgLines.length * LH9;
    }

    function drawOneSig(sig, cx, baseY) {
      if (!sig) return;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(sig.name || 'N/A', cx, baseY, { align: 'center', maxWidth: sigColW });
      doc.setFont('helvetica', 'normal');

      doc.setFontSize(8);
      const posLines = doc.splitTextToSize(sig.position || '', sigColW);
      let ty = baseY + LH11;
      doc.text(posLines, cx, ty, { align: 'center' });
      ty += posLines.length * LH8 + 2;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      const desgLines = doc.splitTextToSize(sig.designation || '', sigColW);
      doc.text(desgLines, cx, ty, { align: 'center' });
      doc.setFont('helvetica', 'normal');
    }

    for (let i = 0; i < raters.length; i += 2) {
      const sig1   = raters[i];
      const sig2   = raters[i + 1] || null;
      const blockH = Math.max(sigBlockH(sig1), sigBlockH(sig2));

      if (y + blockH + 40 > bodyBottom) { doc.addPage(); y = margin + 5; }
      const baseY = y;
      drawOneSig(sig1, sig1CX, baseY);
      drawOneSig(sig2, sig2CX, baseY);
      y += blockH + 40;
    }
  }

  // ── Final pass: stamp correct Page X of Y on every page ──────────────────
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(p, total);
  }

  return doc;
}

// ─── PDFReport component — full deliberation report WITH signatories ──────────
const PDFReport = ({ itemNumber, user, raters }) => {
  const [vacancy,    setVacancy]    = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [siblingItemNumbers, setSiblingItemNumbers] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (!itemNumber) return;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const [vacanciesRes, candidatesRes] = await Promise.all([
          vacanciesAPI.getAll(),
          candidatesAPI.getAll(),
        ]);
        const found = vacanciesRes.find(v => v.itemNumber === itemNumber);
        if (!found) throw new Error('VACANCY NOT FOUND FOR THE SPECIFIED ITEM NUMBER');
        setVacancy(found);
        // Collect all item numbers sharing the same position + assignment
        const sibling = vacanciesRes.filter(
          v => v.position === found.position && v.assignment === found.assignment
        ).map(v => v.itemNumber).filter(Boolean).sort();
        setSiblingItemNumbers(sibling);
        setCandidates(
          candidatesRes
            .filter(c => c.itemNumber === itemNumber)
            .sort((a, b) => (a.fullName || '').localeCompare(b.fullName))
        );
      } catch (err) {
        console.error('FAILED TO LOAD REPORT DATA:', err);
        setError('FAILED TO LOAD REPORT DATA. PLEASE TRY AGAIN.');
      } finally {
        setLoading(false);
      }
    })();
  }, [itemNumber]);

  const generatePDF = () => {
    try {
      if (!vacancy || !candidates) {
        setError('MISSING VACANCY OR CANDIDATE DATA.');
        return;
      }
      const doc = buildDeliberationPDF({ vacancy, candidates, raters, includeSignatories: true, allItemNumbers: siblingItemNumbers });
      doc.save(`Summary_${vacancy.itemNumber}.pdf`);
    } catch (err) {
      console.error('FAILED TO GENERATE PDF:', err.message, err.stack);
      setError('FAILED TO GENERATE PDF REPORT. PLEASE TRY AGAIN.');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900" />
    </div>
  );

  if (error) return (
    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
      <p>{error}</p>
    </div>
  );

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-md p-6" style={{ border: '1px solid #333' }}>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">GENERATE POSITION REPORT</h2>
        {vacancy ? (
          <div className="space-y-4">
            <div className="p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">POSITION DETAILS</h3>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">POSITION:</span> {vacancy.position?.toUpperCase()}</div>
                <div><span className="font-medium">ITEM NUMBER:</span> {vacancy.itemNumber?.toUpperCase()}</div>
                <div><span className="font-medium">ASSIGNMENT:</span> {vacancy.assignment?.toUpperCase()}</div>
                <div><span className="font-medium">SALARY GRADE:</span> SG {vacancy.salaryGrade != null ? String(vacancy.salaryGrade) : 'N/A'}</div>
              </div>
            </div>
            <div className="p-4">
              <h4 className="text-md font-medium text-gray-800 mb-3">CANDIDATE SUMMARY</h4>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">TOTAL CANDIDATES:</span> {candidates.length}</div>
                <div><span className="font-medium">LONG LIST:</span> {candidates.filter(c => c.status === CANDIDATE_STATUS.LONG_LIST).length}</div>
                <div><span className="font-medium">FOR REVIEW:</span> {candidates.filter(c => c.status === CANDIDATE_STATUS.FOR_REVIEW).length}</div>
                <div><span className="font-medium">DISQUALIFIED:</span> {candidates.filter(c => c.status === CANDIDATE_STATUS.DISQUALIFIED).length}</div>
              </div>
            </div>
            <div className="text-center pt-4">
              <button
                onClick={generatePDF}
                className="px-6 py-3 text-white font-medium rounded transition-all duration-200"
                style={{ backgroundColor: '#333', border: '2px solid #333', fontSize: '16px' }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = '#000'; }}
                onMouseOut={e  => { e.currentTarget.style.backgroundColor = '#333'; }}
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

// ─── Longlist-only export — NO signatories, NO certifying clause ──────────────
export async function generateLongListPDF(itemNumber) {
  const [vacanciesRes, candidatesRes] = await Promise.all([
    vacanciesAPI.getAll(),
    candidatesAPI.getAll(),
  ]);

  const vacancy = vacanciesRes.find(v => v.itemNumber === itemNumber);
  if (!vacancy) throw new Error('Vacancy not found for item: ' + itemNumber);

  // Collect all item numbers sharing the same position + assignment
  const allItemNumbers = vacanciesRes
    .filter(v => v.position === vacancy.position && v.assignment === vacancy.assignment)
    .map(v => v.itemNumber).filter(Boolean).sort();

  const candidates = candidatesRes
    .filter(c => c.itemNumber === itemNumber)
    .sort((a, b) => (a.fullName || '').localeCompare(b.fullName));

  const doc = buildDeliberationPDF({
    vacancy,
    candidates,
    raters: [],
    includeSignatories: false,
    allItemNumbers,
  });

  doc.save(`Longlist_${vacancy.itemNumber}.pdf`);
}

export { buildDeliberationPDF };
export default PDFReport;