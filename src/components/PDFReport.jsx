import React, { useState, useEffect } from 'react';
import { candidatesAPI, vacanciesAPI } from '../utils/api';
import { CANDIDATE_STATUS } from '../utils/constants';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// ─── Core PDF builder ────────────────────────────────────────────────────────
// Accepts all data + a flag `includSignatories` so the same logic serves both
// the full deliberation report and the secretariat "Longlist Only" export.
function buildDeliberationPDF({ vacancy, candidates, raters, includeSignatories = true }) {
  const doc = new jsPDF({
    format: [576, 936], // 8 × 13 inches in points
    unit: 'pt',
  });

  doc.setFont('helvetica');

  const pageWidth  = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin     = 50;

  const now = new Date();
  const shortDT = now.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  const footerLeft = `Item: ${vacancy.itemNumber} | Generated: ${shortDT}`;

  // ── Footer drawing (called in the final pass once total pages are known) ──
  function drawFooter(pageNum, totalPages) {
    const savedSize  = doc.getFontSize();
    const savedFont  = doc.getFont();

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30);
    doc.text(footerLeft, margin, pageHeight - 18);
    doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, pageHeight - 18, { align: 'right' });

    doc.setFontSize(savedSize);
    doc.setFont(savedFont.fontName, savedFont.fontStyle);
  }

  // ── Safe page-break helper ────────────────────────────────────────────────
  // Returns the Y to continue drawing from. Does NOT draw the footer here;
  // footers are applied in a final pass so page count is always correct.
  const FOOTER_SAFE_ZONE = 60; // points reserved at the bottom for the footer
  function safeY(y, needed = 20) {
    if (y + needed > pageHeight - margin - FOOTER_SAFE_ZONE) {
      doc.addPage();
      return margin + 5;
    }
    return y;
  }

  // ── Build page 1 header ───────────────────────────────────────────────────
  let y = 60;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(
    'DEPARTMENT OF ENVIRONMENT AND NATURAL RESOURCES (CALABARZON)',
    pageWidth / 2, y, { align: 'center' }
  );
  y += 15;

  doc.setFontSize(10);
  doc.text(
    'REGIONAL HUMAN RESOURCE SELECTION AND PROMOTION BOARD',
    pageWidth / 2, y, { align: 'center' }
  );
  y += 25;

  doc.setFontSize(15);
  doc.text(
    'SUMMARY OF THE DELIBERATION OF CANDIDATES FOR LONG LIST',
    pageWidth / 2, y, { align: 'center' }
  );
  doc.setFont('helvetica', 'normal');
  y += 30;

  // Position / Assignment / Item block
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');

  // Fixed label column width so values align cleanly
  const labelColW = 90; // pts — wide enough for "ASSIGNMENT:"
  const valueX    = margin + labelColW + 6;

  doc.text('POSITION:',   margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(vacancy.position   || 'N/A', valueX, y);
  doc.setFont('helvetica', 'bold');
  y += 15;

  doc.text('ASSIGNMENT:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(vacancy.assignment || 'N/A', valueX, y);
  doc.setFont('helvetica', 'bold');
  y += 15;

  doc.text('ITEM:',       margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(vacancy.itemNumber, valueX, y);
  y += 20;

  // Generated-on timestamp
  doc.setFontSize(8);
  const fullDT = now.toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
  doc.text(`Generated on: ${fullDT}`, margin, y);
  y += 30;

  // ── Two-column list renderer ──────────────────────────────────────────────
  // Draws entries row-by-row (left then right), so both columns advance in
  // lockstep and page-breaks are always clean and symmetric.
  function drawTwoColList(title, names) {
    if (!names || names.length === 0) return y;

    // Ensure room for the title + at least 2 rows before committing
    y = safeY(y, 20 + 2 * 14 + 35);

    // Section title
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, y);
    doc.setFont('helvetica', 'normal');
    y += 20;

    doc.setFontSize(10);
    const colW  = (pageWidth - 2 * margin - 30) / 2;
    const col1X = margin;
    const col2X = margin + colW + 30;
    const lineH = doc.getFontSize() * 1.2 + 2;

    const half = Math.ceil(names.length / 2);

    for (let row = 0; row < half; row++) {
      const leftIdx  = row;
      const rightIdx = row + half;

      const leftName  = names[leftIdx]  || null;
      const rightName = names[rightIdx] || null;

      // Calculate how tall this row will be (tallest of the two cells)
      function cellLines(name, num) {
        if (!name) return [];
        const numStr    = `${num}. `;
        const numW      = doc.getStringUnitWidth(numStr) * doc.getFontSize() / doc.internal.scaleFactor;
        return doc.splitTextToSize(name, colW - numW);
      }

      const leftLines  = leftName  ? cellLines(leftName,  leftIdx  + 1) : [];
      const rightLines = rightName ? cellLines(rightName, rightIdx + 1) : [];
      const rowH       = Math.max(leftLines.length, rightLines.length) * lineH;

      // Page break if needed, resetting y for both columns together
      y = safeY(y, rowH + 10);

      // Draw left cell
      if (leftName) {
        const numStr = `${leftIdx + 1}. `;
        const numW   = doc.getStringUnitWidth(numStr) * doc.getFontSize() / doc.internal.scaleFactor;
        doc.text(`${numStr}${leftLines[0]}`, col1X, y);
        for (let li = 1; li < leftLines.length; li++) {
          doc.text(leftLines[li], col1X + numW, y + li * lineH);
        }
      }

      // Draw right cell
      if (rightName) {
        const numStr = `${rightIdx + 1}. `;
        const numW   = doc.getStringUnitWidth(numStr) * doc.getFontSize() / doc.internal.scaleFactor;
        doc.text(`${numStr}${rightLines[0]}`, col2X, y);
        for (let li = 1; li < rightLines.length; li++) {
          doc.text(rightLines[li], col2X + numW, y + li * lineH);
        }
      }

      y += rowH;
    }

    // END OF LIST marker
    y = safeY(y, 35);
    y += 10;
    doc.text('*** END OF LIST ***', pageWidth / 2, y, { align: 'center' });
    y += 25;

    return y;
  }

  // ── Filter candidates ─────────────────────────────────────────────────────
  const sorted = [...candidates].sort((a, b) => (a.fullName || '').localeCompare(b.fullName));

  const longList     = sorted.filter(c => c.status === CANDIDATE_STATUS.LONG_LIST)   .map(c => c.fullName || 'N/A');
  const forReview    = sorted.filter(c => c.status === CANDIDATE_STATUS.FOR_REVIEW)  .map(c => c.fullName || 'N/A');
  const disqualified = sorted.filter(c => c.status === CANDIDATE_STATUS.DISQUALIFIED).map(c => c.fullName || 'N/A');

  // Draw candidate sections
  y = drawTwoColList('LONG LIST CANDIDATES:', longList);
  y = drawTwoColList('CANDIDATES FOR REVIEW:', forReview);
  if (disqualified.length > 0) {
    y = drawTwoColList('DISQUALIFIED CANDIDATES:', disqualified);
  } else {
    y += 10;
  }

  // ── Gender distribution ───────────────────────────────────────────────────
  function genderCounts(list) {
    const male   = list.filter(c => c.gender === 'Male'    || c.gender === 'MALE/LALAKI').length;
    const female = list.filter(c => c.gender === 'Female'  || c.gender === 'FEMALE/BABAE').length;
    const lgbtqi = list.filter(c => c.gender === 'LGBTQI+').length;
    return { male, female, lgbtqi, total: list.length };
  }

  function drawGenderBlock(label, counts) {
    const pct = (n) => counts.total > 0 ? ((n / counts.total) * 100).toFixed(1) : '0.0';
    const blockH = 15 + 12 + 12 + (counts.lgbtqi > 0 ? 12 : 0) + 20;
    y = safeY(y, blockH);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin + 10, y);
    doc.setFont('helvetica', 'normal');
    y += 15;

    doc.setFontSize(10);
    doc.text(`Male: ${counts.male} (${pct(counts.male)}%)`,     margin + 30, y); y += 12;
    doc.text(`Female: ${counts.female} (${pct(counts.female)}%)`, margin + 30, y); y += 12;
    if (counts.lgbtqi > 0) {
      doc.text(`LGBTQI+: ${counts.lgbtqi} (${pct(counts.lgbtqi)}%)`, margin + 30, y); y += 12;
    }
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: ${counts.total}`, margin + 30, y);
    doc.setFont('helvetica', 'normal');
    y += 20;
  }

  y = safeY(y, 200);

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

  // ── Signatories ───────────────────────────────────────────────────────────
  if (includeSignatories && raters && raters.length > 0) {
    y += 10;

    const lineH11 = 11 * 1.2;
    const lineH8  =  8 * 1.2;
    const lineH9  =  9 * 1.2;
    const sigColW = (pageWidth - 2 * margin - 40) / 2;
    const sig1CX  = margin + sigColW / 2;
    const sig2CX  = margin + sigColW + 40 + sigColW / 2;

    // Certifying clause
    y = safeY(y, 60);
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

    for (let i = 0; i < raters.length; i += 2) {
      const sig1 = raters[i];
      const sig2 = raters[i + 1] || null;

      function sigHeight(sig) {
        if (!sig) return 0;
        const posLines  = doc.splitTextToSize(sig.position    || '', sigColW);
        const desgLines = doc.splitTextToSize(sig.designation || '', sigColW);
        return lineH11 + posLines.length * lineH8 + 2 + desgLines.length * lineH9;
      }

      const blockH = Math.max(sigHeight(sig1), sigHeight(sig2));
      y = safeY(y, blockH + 40);

      function drawSig(sig, cx) {
        if (!sig) return;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(sig.name || 'N/A', cx, y, { align: 'center', maxWidth: sigColW });
        doc.setFont('helvetica', 'normal');

        doc.setFontSize(8);
        const posLines = doc.splitTextToSize(sig.position || '', sigColW);
        let ty = y + lineH11;
        doc.text(posLines, cx, ty, { align: 'center' });
        ty += posLines.length * lineH8 + 2;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        const desgLines = doc.splitTextToSize(sig.designation || '', sigColW);
        doc.text(desgLines, cx, ty, { align: 'center' });
        doc.setFont('helvetica', 'normal');
      }

      drawSig(sig1, sig1CX);
      drawSig(sig2, sig2CX);

      y += blockH + 40;
    }
  }

  // ── Apply correct footers to every page in a single final pass ───────────
  // This is the KEY fix: we only call drawFooter AFTER all pages exist,
  // so "Page X of Y" is always accurate on every page.
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(p, total);
  }

  return doc;
}

// ─── PDFReport component (full deliberation with signatories) ────────────────
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
        setError('MISSING VACANCY OR CANDIDATE DATA FOR REPORT GENERATION.');
        return;
      }
      const doc = buildDeliberationPDF({ vacancy, candidates, raters, includeSignatories: true });
      doc.save(`Summary_${vacancy.itemNumber}.pdf`);
    } catch (err) {
      console.error('FAILED TO GENERATE PDF:', err.message, err.stack);
      setError('FAILED TO GENERATE PDF REPORT. PLEASE TRY AGAIN.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900" />
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
                onMouseOver={e => { e.target.style.backgroundColor = '#000'; }}
                onMouseOut={e  => { e.target.style.backgroundColor = '#333'; }}
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

// ─── Standalone helper called from SecretariatView ───────────────────────────
// Generates the longlist PDF (no signatories) without opening a modal.
// Pass the already-loaded vacancy + candidates arrays to avoid a second fetch.
export async function generateLongListPDF(itemNumber) {
  const [vacanciesRes, candidatesRes] = await Promise.all([
    vacanciesAPI.getAll(),
    candidatesAPI.getAll(),
  ]);
  const vacancy = vacanciesRes.find(v => v.itemNumber === itemNumber);
  if (!vacancy) throw new Error('Vacancy not found for item number: ' + itemNumber);
  const candidates = candidatesRes
    .filter(c => c.itemNumber === itemNumber)
    .sort((a, b) => (a.fullName || '').localeCompare(b.fullName));

  const doc = buildDeliberationPDF({ vacancy, candidates, raters: [], includeSignatories: false });
  doc.save(`Longlist_${vacancy.itemNumber}.pdf`);
}

export { buildDeliberationPDF };
export default PDFReport;