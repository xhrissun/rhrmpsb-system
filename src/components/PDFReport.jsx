import React, { useState, useEffect } from 'react';
import { candidatesAPI, vacanciesAPI } from '../utils/api';
import { CANDIDATE_STATUS } from '../utils/constants';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// ─── Core PDF builder ────────────────────────────────────────────────────────
function buildDeliberationPDF({ vacancy, candidates, raters, includeSignatories }) {
  // Explicit boolean check — never rely on raters array truthiness alone
  const withSigs = includeSignatories === true && Array.isArray(raters) && raters.length > 0;

  const doc = new jsPDF({ format: [576, 936], unit: 'pt' });
  doc.setFont('helvetica');

  const pageWidth  = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin     = 50;
  const SAFE_BOTTOM = margin + 60; // pts reserved at bottom for footer

  const now = new Date();
  const shortDT = now.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  const footerLeft = `Item: ${vacancy.itemNumber} | Generated: ${shortDT}`;

  // ── Footer — ONLY called in the final pass after all pages are built ───────
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

  // ── Page-break guard — never stamps footers mid-render ───────────────────
  function breakIfNeeded(y, needed) {
    if (y + needed > pageHeight - SAFE_BOTTOM) {
      doc.addPage();
      return margin + 5;
    }
    return y;
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

  // Fixed label column so POSITION/ASSIGNMENT/ITEM values align cleanly
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
  doc.text(vacancy.itemNumber, valX, y);
  y += 20;

  doc.setFontSize(8);
  const fullDT = now.toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
  doc.text(`Generated on: ${fullDT}`, margin, y);
  y += 30;

  // ── Two-column list renderer ──────────────────────────────────────────────
  //
  // THE FIX FOR GAPS:
  // The old code used `rowH = max(leftLines, rightLines) * lineH` and advanced
  // y by that amount — so a 2-line right entry caused a blank gap on the left
  // for the NEXT row.
  //
  // New approach: use a FIXED LINE_H per visual line. Each cell's wrapped lines
  // are drawn at (baseY + k * LINE_H) relative to the row anchor. y advances
  // by (rowLines * LINE_H) — the actual height consumed — not a guess.
  //
  function drawTwoColList(title, names) {
    if (!names || names.length === 0) return y;

    y = breakIfNeeded(y, 20 + 2 * 16 + 35); // title + 2 rows + END OF LIST

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, y);
    doc.setFont('helvetica', 'normal');
    y += 20;

    doc.setFontSize(10);
    const colW   = (pageWidth - 2 * margin - 30) / 2;
    const col1X  = margin;
    const col2X  = margin + colW + 30;
    const LINE_H = 14; // fixed pts per visual line — consistent, no gaps

    const half = Math.ceil(names.length / 2);

    for (let row = 0; row < half; row++) {
      const li = row;        // left index  (1st half)
      const ri = row + half; // right index (2nd half)

      const leftName  = names[li] || null;
      const rightName = names[ri] || null;

      // Compute wrapped lines for each cell
      function wrapCell(name, num) {
        if (!name) return { numStr: '', numW: 0, lines: [] };
        const numStr = `${num}. `;
        const numW   = doc.getStringUnitWidth(numStr) * doc.getFontSize() / doc.internal.scaleFactor;
        const lines  = doc.splitTextToSize(name, colW - numW);
        return { numStr, numW, lines };
      }

      const left  = wrapCell(leftName,  li + 1);
      const right = wrapCell(rightName, ri + 1);

      // Total visual lines this row occupies
      const rowLines = Math.max(left.lines.length || 1, right.lines.length || 1);
      const rowH     = rowLines * LINE_H;

      // Break page if this whole row won't fit
      y = breakIfNeeded(y, rowH + 4);
      const baseY = y; // anchor — all lines in this row reference baseY

      // Draw left cell
      if (leftName) {
        doc.text(`${left.numStr}${left.lines[0]}`, col1X, baseY);
        for (let k = 1; k < left.lines.length; k++) {
          doc.text(left.lines[k], col1X + left.numW, baseY + k * LINE_H);
        }
      }

      // Draw right cell
      if (rightName) {
        doc.text(`${right.numStr}${right.lines[0]}`, col2X, baseY);
        for (let k = 1; k < right.lines.length; k++) {
          doc.text(right.lines[k], col2X + right.numW, baseY + k * LINE_H);
        }
      }

      // Advance y by the actual height of this row
      y += rowH;
    }

    // END OF LIST marker
    y = breakIfNeeded(y, 35);
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
    const rows = 3 + (counts.lgbtqi > 0 ? 1 : 0);
    y = breakIfNeeded(y, 15 + rows * 12 + 20);

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

  y = breakIfNeeded(y, 200);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('GENDER DISTRIBUTION:', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 25;

  drawGenderBlock('ALL CANDIDATES:', genderCounts(candidates));

  const longListObjs = candidates.filter(c => c.status === CANDIDATE_STATUS.LONG_LIST);
  if (longListObjs.length > 0) {
    drawGenderBlock('LONG LIST CANDIDATES:', genderCounts(longListObjs));
  }

  // ── Signatories — ONLY when includeSignatories is explicitly true ─────────
  if (withSigs) {
    y += 10;

    const LH11 = 11 * 1.2;
    const LH8  =  8 * 1.2;
    const LH9  =  9 * 1.2;
    const sigColW = (pageWidth - 2 * margin - 40) / 2;
    const sig1CX  = margin + sigColW / 2;
    const sig2CX  = margin + sigColW + 40 + sigColW / 2;

    y = breakIfNeeded(y, 60);
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

      y = breakIfNeeded(y, blockH + 40);
      const baseY = y;
      drawOneSig(sig1, sig1CX, baseY);
      drawOneSig(sig2, sig2CX, baseY);
      y += blockH + 40;
    }
  }

  // ── Final pass: stamp correct "Page X of Y" on every page ────────────────
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(p, total);
  }

  return doc;
}

// ─── PDFReport component — full deliberation report WITH signatories ─────────
const PDFReport = ({ itemNumber, user, raters }) => {
  const [vacancy,    setVacancy]    = useState(null);
  const [candidates, setCandidates] = useState([]);
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
      // includeSignatories: true — this is the full deliberation report
      const doc = buildDeliberationPDF({ vacancy, candidates, raters, includeSignatories: true });
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
// Called directly from SecretariatView via the "Longlist PDF" button.
// Saves as Longlist_<itemNumber>.pdf so it's distinct from Summary_<itemNumber>.pdf
export async function generateLongListPDF(itemNumber) {
  const [vacanciesRes, candidatesRes] = await Promise.all([
    vacanciesAPI.getAll(),
    candidatesAPI.getAll(),
  ]);

  const vacancy = vacanciesRes.find(v => v.itemNumber === itemNumber);
  if (!vacancy) throw new Error('Vacancy not found for item: ' + itemNumber);

  const candidates = candidatesRes
    .filter(c => c.itemNumber === itemNumber)
    .sort((a, b) => (a.fullName || '').localeCompare(b.fullName));

  // includeSignatories: false — hard-coded, no certifying clause, no names
  const doc = buildDeliberationPDF({
    vacancy,
    candidates,
    raters: [],
    includeSignatories: false,
  });

  doc.save(`Longlist_${vacancy.itemNumber}.pdf`);
}

export { buildDeliberationPDF };
export default PDFReport;