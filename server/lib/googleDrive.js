// server/lib/googleDrive.js
//
// Fetches candidate document bytes from Google Drive using a service account.
//
// SETUP REQUIRED (one-time, done by whoever owns the Drive account the
// documents are uploaded to):
//   1. Create a Google Cloud project (or reuse one) and enable the
//      "Google Drive API".
//   2. Create a Service Account, then create a JSON key for it.
//   3. Open the JSON key file, copy the "client_email" value, and SHARE the
//      Drive folder that the candidate documents live in with that email
//      address (Viewer access is enough). This does NOT make the folder
//      public — it only grants access to this one service account.
//   4. Put the full JSON key contents (as a single-line string) into the
//      GOOGLE_SERVICE_ACCOUNT_KEY environment variable on the server.
//
// No domain-wide delegation is needed and no OAuth consent screen is
// required, because we are not impersonating the Drive owner — we are
// simply granting a second "reader" (the service account) direct access to
// the same folder.

import { google } from 'googleapis';

let driveClientPromise = null;

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set');
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON: ' + err.message);
  }
}

function getDriveClient() {
  if (!driveClientPromise) {
    const credentials = getServiceAccountCredentials();
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    driveClientPromise = Promise.resolve(google.drive({ version: 'v3', auth }));
  }
  return driveClientPromise;
}

// Accepts any of the common Google Drive share-link formats and returns the
// bare file ID, or null if the URL doesn't look like a Drive link.
export function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,      // .../file/d/FILE_ID/view
    /[?&]id=([a-zA-Z0-9_-]+)/,          // .../open?id=FILE_ID or uc?id=FILE_ID
    /\/document\/d\/([a-zA-Z0-9_-]+)/,  // Google Docs links, just in case
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Fetches a single file's bytes + metadata from Drive.
// Returns { fileId, name, mimeType, base64 } or throws a specific, actionable error.
export async function fetchDriveFile(url) {
  const fileId = extractDriveFileId(url);
  if (!fileId) {
    throw new Error(`Not a recognizable Google Drive link: ${url}`);
  }

  let drive;
  try {
    drive = await getDriveClient();
  } catch (err) {
    // Credential/config problems — surface clearly instead of looking like a per-file issue.
    throw new Error(`Service account not configured correctly: ${err.message}`);
  }

  let meta;
  try {
    meta = await drive.files.get({
      fileId,
      fields: 'name, mimeType, size',
      supportsAllDrives: true
    });
  } catch (err) {
    throw new Error(describeGoogleApiError(err, fileId));
  }

  const { mimeType, name } = meta.data;

  // Google-native formats (Docs/Sheets/Slides) have no direct binary — export
  // Docs as PDF and Sheets as .xlsx so the extraction step downstream can
  // read them the same way as an uploaded PDF or .xlsx file. Slides still
  // aren't supported.
  const isGoogleNative = mimeType?.startsWith('application/vnd.google-apps');
  let effectiveMimeType = mimeType;
  let dataResponse;

  try {
    if (isGoogleNative) {
      if (mimeType === 'application/vnd.google-apps.document') {
        effectiveMimeType = 'application/pdf';
        dataResponse = await drive.files.export(
          { fileId, mimeType: 'application/pdf' },
          { responseType: 'arraybuffer' }
        );
      } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        effectiveMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        dataResponse = await drive.files.export(
          { fileId, mimeType: effectiveMimeType },
          { responseType: 'arraybuffer' }
        );
      } else {
        throw new Error(`Unsupported Google-native file type: ${mimeType}`);
      }
    } else {
      dataResponse = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' }
      );
    }
  } catch (err) {
    throw new Error(describeGoogleApiError(err, fileId));
  }

  const base64 = Buffer.from(dataResponse.data).toString('base64');

  return {
    fileId,
    name: name || fileId,
    mimeType: effectiveMimeType,
    base64
  };
}

// Turns a raw googleapis error into a specific, actionable message instead of
// a generic "failed" — this is what shows up per-document in the UI, so it
// needs to say WHY, not just THAT it failed.
function describeGoogleApiError(err, fileId) {
  const status = err?.code || err?.response?.status;
  const googleMessage = err?.errors?.[0]?.message || err?.response?.data?.error?.message || err?.message;

  if (status === 404) {
    return `File ${fileId} not found (404). Either the file/folder was not actually shared with the service account's email, the file is a Shortcut whose real target wasn't shared, or the file was moved/deleted.`;
  }
  if (status === 403) {
    return `Permission denied (403) for file ${fileId}: "${googleMessage}". Common causes: the Drive API isn't enabled on the same GCP project as this service account, the account/org has a policy blocking sharing outside the organization, or the file lives in a Shared Drive (which requires adding the service account as a Shared Drive member, not just sharing the folder).`;
  }
  if (status === 401 || /invalid_grant|invalid_rapt|unauthorized/i.test(googleMessage || '')) {
    return `Authentication failed (${status || 'auth error'}): "${googleMessage}". Check that GOOGLE_SERVICE_ACCOUNT_KEY on the server is the complete, valid JSON key (not truncated/re-escaped) and that the server's clock is correct.`;
  }
  return `Google Drive error for file ${fileId}: "${googleMessage}" (status: ${status || 'unknown'})`;
}

// NOTE: there used to be a fetchDriveFiles() here that downloaded every
// document for a candidate in parallel (Promise.allSettled), each held in
// memory simultaneously as both a raw arraybuffer AND a base64 string,
// before extraction even started. That was the actual source of the OOM
// crashes on Render's 512MB instances — it happened at download time, one
// step before the sequential-OCR fix in textExtraction.js ever got a
// chance to help, because by the time extraction started the whole
// batch's bytes were already resident in memory at once.
//
// The fix is to never have more than one document's bytes in memory at a
// time, which means fetch and extract have to be interleaved per-document
// rather than run as two separate batch phases. That orchestration now
// lives in textExtraction.js's fetchAndExtractDriveDocs(), which calls
// fetchDriveFile() (below) one document at a time, extracts it, and lets
// the bytes get garbage-collected before moving to the next document.
// fetchDriveFile() itself is unchanged and still fetches a single file.