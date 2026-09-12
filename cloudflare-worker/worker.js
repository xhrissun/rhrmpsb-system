// cloudflare-worker/worker.js
//
// WHY THIS EXISTS
// ----------------
// The AI-evaluate feature needs to get a candidate's raw document bytes
// (PDF/image/docx/xlsx) into the browser so text extraction can happen
// there instead of on Render (that move was what fixed the OOM crashes —
// see server/routes.js and src/utils/clientTextExtraction.js). But every
// byte that travels FROM Render TO the browser counts against Render's
// billed outbound bandwidth, and at ~20-50MB per candidate across 3000
// applicants, that's 60-150GB/month just for this one feature.
//
// This Worker exists to move ONLY that byte transfer off Render, onto
// Cloudflare's network — which does not bill for egress bandwidth at all,
// even on the free plan. Render remains the ONLY place that decides
// whether a request is allowed: this Worker forwards the browser's own
// Authorization header to Render's existing auth/role/job/candidate
// checks (GET /candidates/:id/ai-evaluate/document-token/:jobId/:docKey)
// and only proceeds to fetch from Drive if Render says yes. No Drive file
// is ever made public, even briefly — this Worker holds its own copy of
// the same service-account credentials Render already uses, and calls the
// Drive API directly, server-to-server, exactly the way Render used to.
//
// Net effect: identical security model, ~zero Render bandwidth for this
// feature, no cost cap that scales badly with applicant volume.
//
// DEPLOYMENT (one-time; see cloudflare-worker/README.md for full steps):
//   wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY   (same JSON value as
//     Render's GOOGLE_SERVICE_ACCOUNT_KEY env var — copy it verbatim)
//   wrangler secret put RENDER_API_BASE              (e.g.
//     https://rhrmpsb-system.onrender.com/api)
//   wrangler secret put ALLOWED_ORIGINS              (comma-separated,
//     e.g. https://xhrissun.github.io)
//   wrangler deploy

const DOCUMENT_PATH_RE = /^\/document\/([^/]+)\/([^/]+)\/([^/]+)$/;

function corsHeaders(request, env) {
  const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin'
  };
}

// --- Minimal Google service-account OAuth2 (JWT Bearer flow), implemented
// with the Web Crypto API since the `googleapis` npm package (Node-only)
// doesn't run in Workers. This is the same flow Render's `googleapis`
// library does internally — just written out by hand for this runtime.

function base64UrlFromBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlFromString(str) {
  return base64UrlFromBytes(new TextEncoder().encode(str));
}

function pemToArrayBuffer(pem) {
  const contents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(contents);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwtRS256(claimSet, privateKeyPem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const signingInput = `${base64UrlFromString(JSON.stringify(header))}.${base64UrlFromString(JSON.stringify(claimSet))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

// Cached at module scope: Cloudflare reuses the same isolate across many
// requests, so this avoids re-minting a Google access token (a network
// round-trip + RSA signature) on every single document fetch. Worst case
// (isolate recycled) it just re-mints — never breaks correctness.
let cachedToken = null; // { accessToken, expiresAt }

async function getGoogleAccessToken(env) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  let credentials;
  try {
    credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch (err) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY secret is not valid JSON: ' + err.message);
  }

  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  const assertion = await signJwtRS256(claimSet, credentials.private_key);

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`
  });
  if (!resp.ok) {
    throw new Error('Failed to obtain Google access token: ' + (await resp.text()).slice(0, 300));
  }
  const data = await resp.json();
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.accessToken;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const match = url.pathname.match(DOCUMENT_PATH_RE);
    if (request.method !== 'GET' || !match) {
      return new Response(JSON.stringify({ message: 'Not found' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    const [, candidateId, jobId, docKey] = match;

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ message: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // Step 1: ask Render "is this allowed?" — Render runs its normal
    // authMiddleware + role check + job/candidate/doc lookup exactly as it
    // always has. This Worker never makes that decision itself.
    let driveFileId;
    try {
      const authorizeResp = await fetch(
        `${env.RENDER_API_BASE}/candidates/${candidateId}/ai-evaluate/document-token/${jobId}/${docKey}`,
        { headers: { Authorization: authHeader } }
      );
      const authorizeBody = await authorizeResp.text();
      if (!authorizeResp.ok) {
        // Forward Render's exact status + message — the browser's error
        // handling for this call doesn't need to know a Worker is involved.
        return new Response(authorizeBody, {
          status: authorizeResp.status,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
      ({ driveFileId } = JSON.parse(authorizeBody));
    } catch (err) {
      return new Response(JSON.stringify({ message: 'Failed to reach authorization server: ' + err.message }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // Step 2: fetch the file directly from Drive, server-to-server, using
    // this Worker's own copy of the same service-account credentials
    // Render uses. Nothing is ever made public.
    try {
      const accessToken = await getGoogleAccessToken(env);
      const driveResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!driveResp.ok) {
        const errText = await driveResp.text().catch(() => '');
        return new Response(JSON.stringify({ message: `Drive returned ${driveResp.status}: ${errText.slice(0, 300)}` }), {
          status: 502,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }

      // Buffered here (not streamed straight through, unlike before) so it
      // can actually be validated. This Worker is the ONLY path a document
      // takes in production (it's what avoids Render's bandwidth cost — see
      // the file header comment), so if corruption isn't caught here, it
      // isn't caught anywhere before reaching the browser's XLSX/DOCX
      // parser, which only reports it as an opaque internal error like
      // "Bad compressed size" — meaningless to whoever reads it. Workers
      // have generous memory for this (candidate documents are a few MB at
      // most), so buffering to validate is a fine trade for a real error
      // message instead of a corrupted download reaching the browser silently.
      const contentType = driveResp.headers.get('Content-Type') || 'application/octet-stream';
      const declaredLength = driveResp.headers.get('Content-Length');
      const buffer = await driveResp.arrayBuffer();

      if (declaredLength && Number(declaredLength) !== buffer.byteLength) {
        return new Response(JSON.stringify({
          message: `Download from Google Drive was incomplete (expected ${declaredLength} bytes, got ${buffer.byteLength}). This is usually transient — try running the AI evaluation again.`
        }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      // XLSX/DOCX are ZIP archives — a truncated or corrupted one is
      // directly verifiable by checking for the local-file-header signature
      // at the start and the end-of-central-directory signature near the
      // tail (see server/lib/googleDrive.js for the same check on the
      // Render-proxy fallback path, and why this specifically matches
      // "Bad compressed size"-style downstream parser errors).
      const isZipBased =
        contentType.includes('spreadsheetml.sheet') || contentType.includes('wordprocessingml.document');
      if (isZipBased) {
        const bytes = new Uint8Array(buffer);
        const hasLocalFileHeader = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
        const tailStart = Math.max(0, bytes.length - 2048);
        let hasEndOfCentralDir = false;
        for (let i = tailStart; i <= bytes.length - 4; i++) {
          if (bytes[i] === 0x50 && bytes[i + 1] === 0x4B && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
            hasEndOfCentralDir = true;
            break;
          }
        }
        if (!hasLocalFileHeader || !hasEndOfCentralDir) {
          return new Response(JSON.stringify({
            message: `The downloaded file is incomplete or corrupted (got ${bytes.length} bytes) — if this is a Google Sheet, it may exceed Drive's export-to-Excel size limit (try downloading it as .xlsx and re-uploading that file directly instead of linking the live Sheet). Otherwise, try running the AI evaluation again.`
          }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
        }
      }

      const headers = new Headers(cors);
      headers.set('Content-Type', contentType);
      return new Response(buffer, { status: 200, headers });
    } catch (err) {
      return new Response(JSON.stringify({ message: 'Failed to fetch document from Drive: ' + err.message }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
  }
};