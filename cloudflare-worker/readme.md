# Document proxy Worker

Moves the raw-document-byte transfer for AI evaluation off Render's billed
bandwidth and onto Cloudflare's free, unmetered egress — without changing
who's allowed to see what. Render still runs every authorization check
(login, role, job ownership, candidate/document lookup) exactly as before;
this Worker just asks Render "is this allowed?" before it fetches anything,
and never makes that decision itself. No Drive file is ever made public,
even briefly — this Worker authenticates to Drive with its own copy of the
same service-account credentials Render already uses.

## One-time setup

1. **Create a free Cloudflare account** at https://dash.cloudflare.com/sign-up
   if you don't already have one. Workers' free tier includes 100,000
   requests/day and, importantly, **no bandwidth billing at all** — that's
   the whole point of moving this here.

2. **Install Wrangler** (Cloudflare's CLI), from the repo root:
   ```
   npm install -g wrangler
   wrangler login
   ```
   This opens a browser to authorize Wrangler against your Cloudflare
   account.

3. **Set the three secrets** this Worker needs (run from inside this
   `cloudflare-worker/` folder):
   ```
   cd cloudflare-worker

   wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY
   ```
   Paste the **exact same JSON value** you already have in Render's
   `GOOGLE_SERVICE_ACCOUNT_KEY` environment variable (Render dashboard →
   your service → Environment). Same credentials, just also given to this
   Worker so it can call Drive directly too.

   ```
   wrangler secret put RENDER_API_BASE
   ```
   Enter: `https://rhrmpsb-system.onrender.com/api` (no trailing slash).

   ```
   wrangler secret put ALLOWED_ORIGINS
   ```
   Enter your frontend's origin(s), comma-separated, e.g.:
   `https://xhrissun.github.io,http://localhost:5173`

4. **Deploy:**
   ```
   wrangler deploy
   ```
   This prints a URL like `https://rhrmpsb-doc-proxy.<your-subdomain>.workers.dev`.
   Copy it.

5. **Point the frontend at it.** This repo deploys via GitHub Actions to
   GitHub Pages (`.github/workflows/deploy.yml`), which is already wired to
   read a `VITE_DOC_PROXY_BASE` repo secret and pass it into the build.
   Just add the secret:
   - GitHub repo → Settings → Secrets and variables → Actions → New
     repository secret
   - Name: `VITE_DOC_PROXY_BASE`
   - Value: the Worker URL from step 4, e.g.
     `https://rhrmpsb-doc-proxy.<your-subdomain>.workers.dev`

   Push to `main` (or re-run the workflow) to redeploy with it picked up.
   If this secret is left unset, the app automatically falls back to
   fetching documents through Render directly (the old behavior) — useful
   for local development without a Cloudflare account, but it brings back
   the bandwidth cost, so make sure it's set for the real deployment.

   For local dev, you can instead create a `.env.local` (already
   gitignored) with:
   ```
   VITE_DOC_PROXY_BASE=https://rhrmpsb-doc-proxy.<your-subdomain>.workers.dev
   ```

## Verifying it worked

- Open your Render dashboard's bandwidth graph and watch it during your
  next AI evaluation run — the per-document spikes should disappear from
  Render's outbound bandwidth (they're now Cloudflare's, which doesn't
  meter or bill for it).
- If a document fails to load, check the Worker's logs with
  `wrangler tail` while reproducing — errors from Render's authorization
  check or from Drive both get forwarded through with their real status
  code and message, so the browser's error message should still be
  meaningful.

## Updating

Any time `worker.js` changes, redeploy with `wrangler deploy` from this
folder. Secrets persist across deploys — you only need to set them again
if a credential actually rotates (e.g. you regenerate the service account
key)..