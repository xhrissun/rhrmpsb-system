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

// Models to try, in order. If GEMINI_MODEL is set, it's tried first; the rest
// of this default chain is appended after it (deduplicated) as automatic
// fallbacks. Override the whole chain with GEMINI_MODEL_FALLBACK_CHAIN
// (comma-separated), e.g. "gemini-3.6-flash,gemini-3.5-flash".
//
// Ordered with the higher-daily-quota "Lite" models mixed in so a busy day
// doesn't dead-end on a single 20-requests/day ceiling.
const DEFAULT_MODEL_CHAIN = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-2.5-flash-lite'
];

function getModelChain() {
  if (process.env.GEMINI_MODEL_FALLBACK_CHAIN) {
    return process.env.GEMINI_MODEL_FALLBACK_CHAIN.split(',').map(m => m.trim()).filter(Boolean);
  }
  const chain = [...DEFAULT_MODEL_CHAIN];
  if (process.env.GEMINI_MODEL && !chain.includes(process.env.GEMINI_MODEL)) {
    chain.unshift(process.env.GEMINI_MODEL);
  } else if (process.env.GEMINI_MODEL) {
    // Requested model is already in the chain — just move it to the front.
    chain.splice(chain.indexOf(process.env.GEMINI_MODEL), 1);
    chain.unshift(process.env.GEMINI_MODEL);
  }
  return chain;
}

const geminiUrlFor = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 503 (model overloaded) and 429 (rate limited/quota exhausted) and 404
// (model retired/unavailable to this key) all mean "try a different model",
// not "give up". Anything else (400 bad request, auth errors) is a real
// problem and fails immediately rather than burning through the whole chain.
const MODEL_SWITCH_STATUSES = [404, 429, 503];

async function callGeminiOnce(model, body, apiKey) {
  const url = `${geminiUrlFor(model)}?key=${apiKey}`;
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    // Network-level fetch errors can sometimes echo the request URL (with
    // the key) back in err.message/cause — scrub before it ever bubbles up.
    throw new Error('Failed to reach Gemini API: ' + String(err.message || err).split(apiKey).join('[REDACTED]'));
  }
}

// Tries each model in the fallback chain. Within a model, retries a couple
// of times on transient errors before moving on to the next model.
// Returns { response, modelUsed } for the first success, or throws after
// every model in the chain has been exhausted.
async function fetchGeminiWithFallback(body, apiKey) {
  const chain = getModelChain();
  const attemptsLog = [];

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const isLastModel = i === chain.length - 1;
    const maxAttemptsForThisModel = isLastModel ? 3 : 2; // spend more retries on the last resort

    let response;
    for (let attempt = 1; attempt <= maxAttemptsForThisModel; attempt++) {
      response = await callGeminiOnce(model, body, apiKey);

      if (response.ok) {
        if (i > 0 || attempt > 1) {
          console.warn(`[Gemini] Succeeded with model "${model}" (attempt ${attempt}) after: ${attemptsLog.join('; ') || 'no prior failures'}`);
        }
        return { response, modelUsed: model };
      }

      if (!MODEL_SWITCH_STATUSES.includes(response.status) || attempt === maxAttemptsForThisModel) {
        break; // either a non-retryable error, or out of attempts for this model
      }

      const backoffMs = 1200 * Math.pow(2, attempt - 1); // 1.2s, 2.4s...
      await sleep(backoffMs);
    }

    const errText = await response.text().catch(() => '');
    attemptsLog.push(`${model} → ${response.status}`);

    if (!MODEL_SWITCH_STATUSES.includes(response.status)) {
      // Non-retryable error (e.g. 400 bad request from our own schema) —
      // no point trying other models, they'll fail the same way.
      return { response, modelUsed: model, errText };
    }

    console.warn(`[Gemini] Model "${model}" unavailable (${response.status}), trying next in chain...`);
    if (isLastModel) {
      return { response, modelUsed: model, errText, allModelsExhausted: true, attemptsLog };
    }
  }
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

  const response = await fetchGeminiWithRetry(`${GEMINI_API_URL}?key=${apiKey}`, body, apiKey);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const sanitized = errText.slice(0, 500).split(apiKey).join('[REDACTED]');
    if (response.status === 503 || response.status === 429) {
      throw new Error(`Gemini is temporarily overloaded (${response.status}) even after retrying. This is on Google's side, not a configuration issue — please try again in a minute. Raw: ${sanitized}`);
    }
    throw new Error(`Gemini API error (${response.status}): ${sanitized}`);
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