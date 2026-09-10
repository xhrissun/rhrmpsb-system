// server/lib/redact.js
//
// Strips direct identifiers out of already-extracted document TEXT before
// it's sent to Gemini. This runs entirely on this server — nothing here
// calls any external API.
//
// IMPORTANT — read before trusting this blindly:
// This is regex/pattern-based best-effort redaction, not a certified
// de-identification pipeline. It reliably removes:
//   - the candidate's exact name and individual name parts
//   - their date of birth, in common written formats
//   - TIN / PRC license / GSIS-style numeric ID patterns
//   - email addresses and PH mobile numbers
//   - lines that look like a Philippine address (Brgy/Purok/St./etc.)
// It will NOT catch every variant (nicknames, misspellings, addresses
// phrased unusually, a name embedded inside a scanned image that OCR read
// slightly wrong, etc.), and it does nothing about quasi-identifiers like
// a specific employer name + exact dates that could still narrow a small
// applicant pool down to one person. Treat this as risk REDUCTION for what
// Google sees, not anonymization — the Secretariat's own system still
// re-links the AI's output back to the named candidate immediately after.

const PH_ADDRESS_KEYWORDS = [
  'barangay', 'brgy', 'purok', 'sitio', 'zone', 'blk', 'block', 'lot',
  'street', 'st\\.', 'avenue', 'ave\\.', 'highway', 'subdivision', 'compound',
  'municipality', 'city of', 'province of', 'zip code', 'postal code'
];

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameTokens(fullName) {
  return (fullName || '')
    .split(/[\s,]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3); // skip bare initials like "A." or "Jr"
}

function redactNames(text, fullName) {
  let out = text;
  if (!fullName) return out;

  // Full name, whole string, any word order between tokens (handles
  // "Dela Cruz, Juan A." vs "Juan A. Dela Cruz" vs mixed casing).
  const tokens = nameTokens(fullName);
  if (fullName.trim().length >= 3) {
    const escapedFull = escapeRegExp(fullName.trim());
    out = out.replace(new RegExp(escapedFull, 'gi'), '[NAME REDACTED]');
  }

  // Individual name parts (first name, middle name, each surname component).
  // Word-boundary matched so we don't nuke unrelated substrings.
  tokens.forEach(token => {
    if (token.length < 3) return; // skip initials/short particles
    const escaped = escapeRegExp(token);
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '[NAME REDACTED]');
  });

  return out;
}

function redactDateOfBirth(text, dateOfBirth) {
  if (!dateOfBirth) return text;
  const d = new Date(dateOfBirth);
  if (Number.isNaN(d.getTime())) return text;

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const monthName = months[d.getMonth()];

  const variants = [
    `${yyyy}-${mm}-${dd}`,
    `${mm}/${dd}/${yyyy}`,
    `${dd}/${mm}/${yyyy}`,
    `${monthName} ${d.getDate()}, ${yyyy}`,
    `${d.getDate()} ${monthName} ${yyyy}`
  ];

  let out = text;
  variants.forEach(v => {
    out = out.split(v).join('[DOB REDACTED]');
  });
  return out;
}

function redactIdPatterns(text) {
  let out = text;
  // TIN: 000-000-000 or 000-000-000-000
  out = out.replace(/\b\d{3}-\d{3}-\d{3}(-\d{3})?\b/g, '[ID REDACTED]');
  // Generic long numeric IDs (PRC license, GSIS BP number, etc.), 6-12 digits
  out = out.replace(/\b\d{6,12}\b/g, '[ID REDACTED]');
  // PH mobile numbers
  out = out.replace(/\b(?:\+63|0)9\d{9}\b/g, '[PHONE REDACTED]');
  // Email addresses
  out = out.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[EMAIL REDACTED]');
  return out;
}

// Standalone address rows in a form (PDS, application forms) are short —
// typically under a dozen words. A line THIS short that contains an
// address keyword is almost certainly nothing but an address, so wiping
// it wholesale is safe. A LONGER line (a Letter of Intent paragraph, a
// Work Experience Sheet entry that got OCR'd/extracted as one long line)
// that merely mentions a street or city in passing is prose with real
// substance — wiping the whole thing destroyed entire documents' content
// in practice. For those, only the local phrase around the keyword is
// redacted, leaving the rest of the line intact.
const MAX_WORDS_FOR_WHOLE_LINE_REDACTION = 12;

function redactAddressLines(text) {
  const keywordPattern = new RegExp(`\\b(${PH_ADDRESS_KEYWORDS.join('|')})\\b`, 'i');
  const windowPattern = new RegExp(`(?:\\S+\\s+){0,4}\\b(?:${PH_ADDRESS_KEYWORDS.join('|')})\\b(?:\\s+\\S+){0,6}`, 'gi');

  return text
    .split('\n')
    .map(line => {
      if (!keywordPattern.test(line)) return line;

      const wordCount = line.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount <= MAX_WORDS_FOR_WHOLE_LINE_REDACTION) {
        return '[ADDRESS LINE REDACTED]';
      }
      return line.replace(windowPattern, '[ADDRESS REDACTED]');
    })
    .join('\n');
}

// Main entry point. `candidate` is the Mongoose candidate document (needs
// fullName, optionally dateOfBirth).
export function redactCandidateText(text, candidate) {
  if (!text) return text;
  let out = text;
  out = redactNames(out, candidate?.fullName);
  out = redactDateOfBirth(out, candidate?.dateOfBirth);
  out = redactIdPatterns(out);
  out = redactAddressLines(out);
  return out;
}