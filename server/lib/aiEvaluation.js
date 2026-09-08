// server/lib/aiEvaluation.js
//
// Calls the Gemini API (Google AI Studio) to draft Secretariat review
// comments for a candidate, weighed against:
//   - the vacancy's Qualification Standards (education/training/experience/eligibility)
//   - the competencies required for that item (from the CBS)
//
// This module NEVER writes to the database. It only returns a draft object
// for the Secretariat to review, edit, and save through the normal
// PUT /candidates/:id flow.

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Keep the total inline payload well under Gemini's request size limits.
const MAX_TOTAL_INLINE_BYTES = 18 * 1024 * 1024; // ~18MB of base64-decoded bytes

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    comments: {
      type: 'OBJECT',
      properties: {
        education:   { type: 'STRING' },
        training:    { type: 'STRING' },
        experience:  { type: 'STRING' },
        eligibility: { type: 'STRING' }
      },
      required: ['education', 'training', 'experience', 'eligibility']
    },
    suggestedStatus: {
      type: 'STRING',
      enum: ['long_list', 'for_review', 'disqualified']
    },
    suggestedStatusRationale: { type: 'STRING' },
    flags: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Short notes on missing documents, unverifiable claims, or discrepancies the Secretariat should double-check.'
    }
  },
  required: ['comments', 'suggestedStatus', 'suggestedStatusRationale', 'flags']
};

function buildSystemPrompt({ candidate, vacancy, competencies, unavailableDocs }) {
  const qs = vacancy?.qualifications || {};
  const competencyLines = (competencies || [])
    .map(c => `- [${c.type}] ${c.name}`)
    .join('\n') || '(none on file for this item)';

  const missingDocsNote = unavailableDocs.length
    ? `\nThe following documents could NOT be retrieved (missing, unshared, or deleted) and must be treated as absent evidence, not as disqualifying by themselves unless the Qualification Standards require them: ${unavailableDocs.map(d => d.label).join(', ')}.`
    : '';

  return `You are assisting the Secretariat of a Philippine government agency's Recruitment, Selection and Placement Board in reviewing a candidate's application documents.

Your job is to draft — NOT finalize — the four Secretariat review comments (Education, Training, Experience, Eligibility) by comparing the attached candidate documents against the Qualification Standards (QS) and required competencies for the item below. A human Secretariat officer will review, edit, and approve everything you write before it is saved.

CANDIDATE
Name: ${candidate.fullName}
Item Number: ${candidate.itemNumber}
Position: ${vacancy?.position || '(unknown)'}
Salary Grade: ${vacancy?.salaryGrade ?? '(unknown)'}

QUALIFICATION STANDARDS FOR THIS ITEM
- Education:   ${qs.education || '(not specified)'}
- Training:    ${qs.training || '(not specified)'}
- Experience:  ${qs.experience || '(not specified)'}
- Eligibility: ${qs.eligibility || '(not specified)'}

REQUIRED COMPETENCIES FOR THIS ITEM
${competencyLines}
${missingDocsNote}

INSTRUCTIONS
1. Education: Compare the Diploma / Transcript of Records / PDS education section against the QS education requirement. State plainly whether it is met, partially met, or not met, and why.
2. Training: Compare Certificates and the PDS training section against the QS training requirement. Where a training clearly relates to one of the required competencies above, name that competency. Do not require certificates for a competency the QS doesn't ask for.
3. Experience: Compare the Work Experience Sheet / Certificate of Employment / IPCR against the QS experience requirement, including years and relevance. Where the work history demonstrates a required competency in practice (not just years served), say so.
4. Eligibility: Compare the Proof of Eligibility / Professional License against the QS eligibility requirement.
5. Write each comment in plain, factual, administrative language — 2-4 sentences, no bullet points, no markdown. Cite which document supports each claim (e.g., "Per TOR..."). If evidence is missing or a document was unavailable, say so plainly instead of guessing.
6. Do not invent facts not present in the documents. If a document is unreadable or absent, note the gap rather than assuming the candidate meets the requirement.
7. suggestedStatus is only a recommendation for a human to review — choose "long_list" if all four areas are adequately met, "for_review" if there is a genuine ambiguity or borderline case needing board discussion, or "disqualified" if a QS requirement is clearly and verifiably not met. Never choose "disqualified" on the basis of a merely missing/unretrieved document alone — flag it instead and default to "for_review".
8. flags should list anything the Secretariat should manually double-check (missing documents, illegible scans, expired eligibility dates, mismatched names, etc).

Respond ONLY with JSON matching the provided schema.`;
}

function base64ToBytes(base64) {
  return Buffer.byteLength(base64, 'base64');
}

export async function evaluateCandidateWithAI({ candidate, vacancy, competencies, files, unavailableDocs }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  // Guard against oversized requests: drop the largest files first (and
  // report them as unavailable) until we're under the inline size budget.
  const includedFiles = [...files].sort((a, b) => a.base64.length - b.base64.length);
  let totalBytes = 0;
  const finalFiles = [];
  const droppedForSize = [];
  for (const file of includedFiles) {
    const bytes = base64ToBytes(file.base64);
    if (totalBytes + bytes > MAX_TOTAL_INLINE_BYTES) {
      droppedForSize.push({ key: file.key, label: file.label, message: 'File too large to include automatically' });
      continue;
    }
    totalBytes += bytes;
    finalFiles.push(file);
  }

  const allUnavailable = [...unavailableDocs, ...droppedForSize];

  const systemPrompt = buildSystemPrompt({ candidate, vacancy, competencies, unavailableDocs: allUnavailable });

  const parts = [{ text: systemPrompt }];
  finalFiles.forEach(file => {
    parts.push({ text: `\n\n--- Document: ${file.label} (${file.name}) ---` });
    parts.push({
      inlineData: {
        mimeType: file.mimeType,
        data: file.base64
      }
    });
  });

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA
    }
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(err => {
    // Network-level fetch errors can sometimes echo the request URL (with the
    // key) back in err.message/cause — scrub before it ever bubbles up.
    throw new Error('Failed to reach Gemini API: ' + String(err.message || err).split(apiKey).join('[REDACTED]'));
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 500).split(apiKey).join('[REDACTED]')}`);
  }

  const data = await response.json();
  const textOut = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';

  let parsed;
  try {
    parsed = JSON.parse(textOut);
  } catch (err) {
    throw new Error('Gemini returned non-JSON output: ' + textOut.slice(0, 300));
  }

  return {
    ...parsed,
    documentsReviewed: finalFiles.map(f => ({ key: f.key, label: f.label })),
    unavailableDocuments: allUnavailable
  };
}