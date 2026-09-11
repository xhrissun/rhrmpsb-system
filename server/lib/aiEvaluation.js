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
//
// PRIVACY: this module no longer sends raw document files (images/PDFs) or
// the candidate's name to Gemini. The route calling this (server/routes.js)
// extracts text locally (server/lib/textExtraction.js) and redacts direct
// identifiers (server/lib/redact.js) before this function ever sees it —
// only redacted text plus a non-identifying case reference goes over the
// wire to Google.

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
    },
    governmentEmployment: {
      type: 'OBJECT',
      description: 'Evidence of CURRENT or RECENT (roughly within the last 2 years) government employment found in the candidate documents — used only to pre-fill a form for Secretariat review, never saved automatically.',
      properties: {
        detected: { type: 'BOOLEAN', description: 'true only if the documents contain clear, specific evidence of a government position — not merely a guess or generic government-sector interest.' },
        agency: { type: 'STRING', description: 'Government agency/office name as stated in the documents. Empty string if not detected.' },
        position: { type: 'STRING', description: 'Position/job title held. Empty string if not detected.' },
        status: {
          type: 'STRING',
          enum: ['Not Stated', 'Permanent', 'Casual', 'Temporary', 'Co-terminus with the incumbent', 'Contractual-PS', 'Contractual'],
          description: 'Status of appointment, matched to this exact list only if the document states one of these terms (e.g. a PDS Work Experience Sheet "Status of Appointment" column). Use "Not Stated" if not stated or if it does not match one of these terms — never guess or approximate.'
        },
        isOngoing: { type: 'BOOLEAN', description: 'true if the position is stated as current/ongoing (e.g. "present", no end date given for an otherwise-dated entry).' },
        employmentEndDate: { type: 'STRING', description: 'ISO date (yyyy-mm-dd) if the document states a specific end date for this position AND isOngoing is false. Empty string if ongoing or no end date is stated. Never estimate or infer a date that is not explicitly written.' },
        evidence: { type: 'STRING', description: 'One short bullet-style sentence citing which document this came from, e.g. "Per Work Experience Sheet: DENR-CENRO, 2022-present." Empty string if detected is false.' }
      },
      required: ['detected', 'agency', 'position', 'status', 'isOngoing', 'employmentEndDate', 'evidence']
    }
  },
  required: ['comments', 'suggestedStatus', 'suggestedStatusRationale', 'flags', 'governmentEmployment']
};

// `caseRef` replaces the candidate's name in anything sent to Gemini — it's
// just the item number plus a short non-reversible-looking suffix, enough
// for the model to keep one candidate's documents straight within a single
// request, but it carries no name/address/PII on its own.
function buildSystemPrompt({ caseRef, vacancy, competencies, documentTexts, unavailableDocs, neverLinkedDocs }) {
  const qs = vacancy?.qualifications || {};
  const competencyLines = (competencies || [])
    .map(c => `- [${c.type}] ${c.name}`)
    .join('\n') || '(none on file for this item)';

  const missingDocsNote = unavailableDocs.length
    ? `\nThe following documents WERE submitted but could NOT be used as evidence (missing, unshared, deleted, illegible, or no extractable text) and must be treated as absent evidence, not as disqualifying by themselves unless the Qualification Standards require them: ${unavailableDocs.map(d => d.label).join(', ')}.`
    : '';

  const neverLinkedNote = (neverLinkedDocs && neverLinkedDocs.length)
    ? `\nThe following document types were NEVER SUBMITTED by this candidate at all (no file on file, not merely unreadable) — treat as absent evidence for whichever area they'd support, same non-disqualifying rule as above: ${neverLinkedDocs.map(d => d.label).join(', ')}.`
    : '';

  const documentSections = documentTexts.length
    ? documentTexts.map(d => `--- Document: ${d.label} ---\n${d.text}`).join('\n\n')
    : '(no usable document text was extracted)';

  return `You are assisting the Secretariat of a Philippine government agency's Recruitment, Selection and Placement Board in reviewing a candidate's application documents.

Your job is to draft — NOT finalize — the four Secretariat review comments (Education, Training, Experience, Eligibility) by comparing the candidate documents below against the Qualification Standards (QS) and required competencies for the item below. A human Secretariat officer will review, edit, and approve everything you write before it is saved.

Note: names, dates of birth, addresses, and ID numbers have been redacted from the text below before it reached you — this is intentional and not a data quality issue. Evaluate the substance (education, training, experience, eligibility) without needing the candidate's identity.

CASE REFERENCE
Reference: ${caseRef}
Position: ${vacancy?.position || '(unknown)'}
Salary Grade: ${vacancy?.salaryGrade ?? '(unknown)'}

QUALIFICATION STANDARDS FOR THIS ITEM
- Education:   ${qs.education || '(not specified)'}
- Training:    ${qs.training || '(not specified)'}
- Experience:  ${qs.experience || '(not specified)'}
- Eligibility: ${qs.eligibility || '(not specified)'}

REQUIRED COMPETENCIES FOR THIS ITEM
${competencyLines}
${missingDocsNote}${neverLinkedNote}

CANDIDATE DOCUMENTS (extracted text, redacted)
${documentSections}

INSTRUCTIONS
1. Education: Compare the Diploma / Transcript of Records / PDS education section against the QS education requirement. State plainly whether it is met, partially met, or not met, and why. If a higher credential (e.g. a Master's/Doctoral unit or degree) is claimed in the PDS but the supporting Diploma/TOR for it is missing from the documents provided, do NOT treat it as met — say so and add an explicit warning bullet telling the Secretariat exactly what to verify (e.g., "- PDS claims MA units — check TOR/Diploma for these; not provided.").
2. Training: Only count workshops, trainings, seminars, and capacity-building programs the candidate COMPLETED AS A PARTICIPANT/ATTENDEE. Do NOT count orientations (these are informational sessions, not skills training) or engagements where the candidate served as a guest speaker, resource person, or facilitator (delivering training is not the same as receiving it) — if a document describes one of these, leave it out of the training count and, if it's prominent in the documents (e.g. listed alongside real trainings in the PDS), note in a bullet that it was excluded and why, e.g. "- Excluded: Guest Speaker, [event] — not training received." List each qualifying relevant training/seminar found (PDS training section, Certificates) individually with its number of training hours in parentheses immediately after the name, e.g. "- Basic Occupational Safety and Health (40 hrs) — per Certificate." If an extracted document states the hours, always include that number this way — never drop it. If a training is named but no document in front of you states its hours, do not invent a number: write "(hours not stated — verify with certificate)" instead, as an explicit warning. Then state whether the total relevant hours meet the QS training requirement. Where a training clearly relates to one of the required competencies above, name that competency.
3. Experience: List each relevant position individually with its duration in parentheses in years (and months if given), e.g. "- Environmental Management Specialist II, DENR-CENRO (3 yrs 4 mos) — per Work Experience Sheet." Compute the duration from the dates in the Work Experience Sheet / Service Record / Certificate of Employment / IPCR; never drop the year count. If the dates given are incomplete, contradictory, or missing, write "(duration unclear — verify with document)" instead of guessing, as an explicit warning. Then state whether the total relevant years meet the QS experience requirement. Where the work history demonstrates a required competency in practice (not just years served), say so.
4. Eligibility: Compare the Proof of Eligibility / Professional License against the QS eligibility requirement. If an eligibility or license appears expired, unclear, or unverifiable from the text (e.g. a date that has passed, or a license number given with no visible validity date), add an explicit warning bullet saying so rather than assuming it is still valid.
5. Write each comment (education/training/experience/eligibility) as short bullet points, each starting with "- " on its own line (use a literal newline character between bullets, not numbering, not markdown headers/bold). Each bullet under ~25 words, plain factual administrative language. Cite which document supports each claim (e.g., "- Per TOR, met — BS Forestry 2016."). If evidence is missing or a document was unavailable, say so in one short bullet instead of guessing. Be terse — do not restate the requirement text back, do not pad with filler sentences.
6. Warnings belong IN the relevant comment, not only in the flags list. Any time something needs the Secretariat to manually double-check a specific document — a claim in the PDS not backed by the actual certificate/diploma/TOR, an expired-looking eligibility, unclear dates, an illegible or missing document affecting that specific area — write it as its own short bullet inside that comment, worded as a direct instruction to the reviewer (e.g., "- Check TOR for Master's units claimed in PDS.", "- Verify License No. validity — expiry unclear from scan."). A Secretariat officer reading only the Training comment, for example, should not need to also check the flags list to know a training's hours are unverified.
7. Do not invent facts not present in the documents. If a document is unreadable or absent, note the gap rather than assuming the candidate meets the requirement.
8. suggestedStatus is only a recommendation for a human to review — choose "long_list" if all four areas are adequately met, "for_review" if there is a genuine ambiguity or borderline case needing board discussion, or "disqualified" if a QS requirement is clearly and verifiably not met. Never choose "disqualified" on the basis of a merely missing/unretrieved document alone — flag it instead and default to "for_review".
9. suggestedStatusRationale: ONE short sentence (under 25 words) summarizing the overall reason for the status.
10. flags should list anything the Secretariat should manually double-check (missing documents, illegible scans, expired eligibility dates, redacted fields that need the human reviewer's own verification, etc) as a short checklist — this is in ADDITION to (not instead of) the inline warnings required in instruction 6, so the same concern may reasonably appear in both places. Each flag is a short phrase, not a sentence.
11. governmentEmployment: separately from the four comments above, check whether the documents show the candidate CURRENTLY holds, or held within roughly the last 2 years, a position in Philippine government (national agency, LGU, GOCC, SUC, etc.) — this is normally found in the PDS Work Experience section, Certificate of Employment, Service Record, or IPCR. Only set detected:true with clear, specific evidence (agency name and position stated) — never infer this from ambiguous or generic wording. Fill agency/position/status/isOngoing/employmentEndDate/evidence exactly as instructed in the schema. If no such position is evident, set detected:false, status:"Not Stated", and leave the other fields as empty strings/false. This is a separate signal for a different form the Secretariat fills in manually — do not fabricate a government position from a private-sector job merely because the employer's name resembles a government body.

Be as concise as possible everywhere above the minimum needed to be useful — this output is billed per token. Respond ONLY with JSON matching the provided schema, no other text.`;
}

// Collapses the whitespace noise OCR/PDF extraction tends to leave behind
// (repeated blank lines, runs of spaces/tabs, trailing spaces per line)
// before the text is counted against the char budget and sent to Gemini.
// Purely cosmetic whitespace costs real input tokens at scale, so trimming
// it is a free, content-safe way to cut cost — nothing semantic is removed.
function normalizeForPrompt(text) {
  if (!text) return text;
  return text
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

// `documentTexts` is an array of { key, label, name, text } — already
// extracted locally (server/lib/textExtraction.js) and already redacted
// (server/lib/redact.js) by the time it reaches this function. This
// function no longer sends any raw file bytes (no inlineData) to Gemini at
// all — only the redacted text goes over the wire, plus a non-identifying
// case reference in place of the candidate's name.
export async function evaluateCandidateWithAI({ caseRef, vacancy, competencies, documentTexts, unavailableDocs, neverLinkedDocs = [] }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  // Guard against oversized requests: drop the longest texts first (and
  // report them as unavailable) until we're under the character budget.
  // (Text is far smaller than the equivalent base64 file, so this budget is
  // generous compared to the old inline-file limit.)
  const MAX_TOTAL_CHARS = 400_000;
  // Normalize whitespace first — this is what actually gets counted and
  // sent, so trimming OCR whitespace noise here directly reduces both the
  // input-token cost and the chance of hitting the size cap.
  const normalizedTexts = documentTexts.map(d => ({ ...d, text: normalizeForPrompt(d.text) }));
  const sortedByLength = [...normalizedTexts].sort((a, b) => a.text.length - b.text.length);
  let totalChars = 0;
  const finalTexts = [];
  const droppedForSize = [];
  for (const doc of sortedByLength) {
    if (totalChars + doc.text.length > MAX_TOTAL_CHARS) {
      droppedForSize.push({ key: doc.key, label: doc.label, message: 'Extracted text too large to include automatically' });
      continue;
    }
    totalChars += doc.text.length;
    finalTexts.push(doc);
  }

  const allUnavailable = [...unavailableDocs, ...droppedForSize];

  const systemPrompt = buildSystemPrompt({ caseRef, vacancy, competencies, documentTexts: finalTexts, unavailableDocs: allUnavailable, neverLinkedDocs });

  const body = {
    contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      // Comments now list each training/position individually with its
      // hours/years plus any inline warnings, which is inherently longer
      // than the old "1-3 short bullets" format — bumped up from 4096
      // accordingly so more candidates succeed on the first try instead of
      // needing the truncation-retry below.
      maxOutputTokens: 6144
    }
  };

  const { response, modelUsed, errText: fallbackErrText, allModelsExhausted } = await fetchGeminiWithFallback(body, apiKey);

  if (!response.ok) {
    const errText = fallbackErrText ?? await response.text().catch(() => '');
    const sanitized = errText.slice(0, 500).split(apiKey).join('[REDACTED]');
    if (allModelsExhausted || response.status === 503 || response.status === 429) {
      throw new Error(`Gemini is temporarily overloaded (${response.status}) even after retrying${modelUsed ? ` (last tried: ${modelUsed})` : ''}. This is on Google's side, not a configuration issue — please try again in a minute. Raw: ${sanitized}`);
    }
    throw new Error(`Gemini API error (${response.status})${modelUsed ? ` [model: ${modelUsed}]` : ''}: ${sanitized}`);
  }

  const data = await response.json();
  const finishReason = data?.candidates?.[0]?.finishReason;
  const textOut = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';

  let parsed;
  try {
    parsed = JSON.parse(textOut);
  } catch (err) {
    if (finishReason === 'MAX_TOKENS') {
      // The output got cut off mid-string rather than the model producing
      // malformed JSON — one retry with a much larger budget almost always
      // fixes this (it's a budget problem, not a model-quality problem).
      console.warn(`[Gemini] Response truncated at maxOutputTokens=6144 for model ${modelUsed}; retrying once with a larger budget.`);
      const retryBody = { ...body, generationConfig: { ...body.generationConfig, maxOutputTokens: 10240 } };
      const retry = await fetchGeminiWithFallback(retryBody, apiKey);
      if (retry.response.ok) {
        const retryData = await retry.response.json();
        const retryFinishReason = retryData?.candidates?.[0]?.finishReason;
        const retryText = retryData?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
        try {
          parsed = JSON.parse(retryText);
          // Falls through to the return below with the retried result.
          return {
            ...parsed,
            modelUsed: retry.modelUsed,
            documentsReviewed: finalTexts.map(f => ({ key: f.key, label: f.label })),
            unavailableDocuments: allUnavailable,
            neverLinkedDocuments: neverLinkedDocs,
            promptSent: systemPrompt
          };
        } catch {
          throw new Error(
            `Gemini's response was truncated even at maxOutputTokens=10240 (finishReason: ${retryFinishReason}). ` +
            `This candidate likely has an unusually large amount of extracted document text — try again, or ask an admin to raise the output token budget further.`
          );
        }
      }
      throw new Error(`Gemini returned truncated output and the retry with a larger budget also failed (${retry.response.status}).`);
    }
    throw new Error('Gemini returned non-JSON output' + (finishReason ? ` (finishReason: ${finishReason})` : '') + ': ' + textOut.slice(0, 300));
  }

  return {
    ...parsed,
    modelUsed,
    documentsReviewed: finalTexts.map(f => ({ key: f.key, label: f.label })),
    unavailableDocuments: allUnavailable,
    neverLinkedDocuments: neverLinkedDocs,
    // The exact text of the request sent to Gemini (system prompt +
    // redacted document text). Returned so the caller can show/audit
    // precisely what left this server, for privacy verification — this
    // module sends nothing Gemini-bound that isn't in this string.
    promptSent: systemPrompt
  };
}