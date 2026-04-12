# RHRMPSB — Regional Human Resource Management Placement Selection Board System

> **Full-stack web application** for managing the end-to-end Competency-Based Selection (CBS) process for government HR placement boards. Covers publication ranges, vacancies, candidates, competency-based interview ratings, and audit trails.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Data Models](#4-data-models)
5. [User Roles & Access Control](#5-user-roles--access-control)
6. [Core Features by Role](#6-core-features-by-role)
7. [API Routes Reference](#7-api-routes-reference)
8. [Security Measures](#8-security-measures)
9. [Performance Enhancements — Implemented (V3)](#9-performance-enhancements--implemented-v3)
10. [Remaining Bottlenecks & Recommendations](#10-remaining-bottlenecks--recommendations)
11. [Known Issues & Areas for Improvement](#11-known-issues--areas-for-improvement)
12. [Deployment](#12-deployment)
13. [Environment Variables](#13-environment-variables)

---

## 1. System Overview

The RHRMPSB system digitalizes the Competency-Based Selection (CBS) process for Philippine government HR boards. It replaces manual paper-based scoring with a structured, multi-role digital workflow where:

- **Secretariat** staff manage candidate records, qualifications review, and publication ranges.
- **Raters** (board members) conduct Behavioral Event Interviews (BEI) and submit competency scores.
- **Admin** users oversee the entire process, manage users, and generate reports.

The system enforces CBS independence rules — raters cannot see each other's scores until all ratings are submitted — and maintains a full immutable audit trail of all rating changes.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────┐
│                  FRONTEND (React SPA)                │
│  Hosted on GitHub Pages (https://xhrissun.github.io) │
│                                                      │
│  AdminView │ SecretariatView │ RaterView │ Dashboard  │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS / REST API (axios)
┌──────────────────────▼───────────────────────────────┐
│              BACKEND (Express.js on Node.js)         │
│      Hosted on Render (rhrmpsb-system.onrender.com)  │
│                                                      │
│  Auth │ Users │ Vacancies │ Candidates │ Ratings      │
│  Competencies │ RatingLogs │ PublicationRanges        │
└──────────────────────┬───────────────────────────────┘
                       │ Mongoose ODM
┌──────────────────────▼───────────────────────────────┐
│                  MongoDB Atlas                       │
│  Collections: users, vacancies, candidates,          │
│  competencies, ratings, ratinglogs, publicationranges│
└──────────────────────────────────────────────────────┘
```

**Key architectural notes:**
- The frontend is a static SPA deployed via `gh-pages` with a `/rhrmpsb-system/` base path.
- The backend is a Node.js/Express REST API deployed on Render's free tier (subject to cold starts — see §10).
- Communication is stateless JWT-based; tokens are stored in `localStorage`.
- All file uploads (CSVs) are handled in-memory (no disk storage) via `express-fileupload`.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Frontend Framework | React 18 + Vite 4 |
| Styling | Tailwind CSS 3 |
| HTTP Client | Axios |
| PDF Parsing | pdfjs-dist 4 (client-side) |
| PDF Generation | jsPDF + jspdf-autotable |
| CSV Parsing (client) | PapaParse |
| Icons | Lucide React |
| Backend Framework | Express.js 4 |
| Database ODM | Mongoose 7 |
| Database | MongoDB Atlas |
| Authentication | JWT (jsonwebtoken) + bcryptjs |
| CSV Parsing (server) | csv-parse |
| Rate Limiting | express-rate-limit |
| File Uploads | express-fileupload |
| Deployment (frontend) | GitHub Pages via gh-pages |
| Deployment (backend) | Render |

---

## 4. Data Models

### PublicationRange
Represents a posting period (e.g., "Q1 2025 Batch"). All vacancies and candidates belong to a publication range.

| Field | Type | Notes |
|---|---|---|
| name | String | Unique |
| tags | [String] | For filtering |
| startDate / endDate | Date | Validated: end > start |
| isActive / isArchived | Boolean | Soft delete pattern |

**Indexes:** `{ isArchived, isActive }`, `{ startDate, endDate }`

---

### User
Board members and staff accounts.

| Field | Type | Notes |
|---|---|---|
| email | String | Unique, lowercase |
| userType | Enum | `rater`, `secretariat`, `admin` |
| raterType | Enum | Chairperson, Vice-Chairperson, Regular Member, DENREU, GAD, End-User |
| assignedVacancies | Enum | `none`, `all`, `assignment`, `specific` |
| assignedItemNumbers | [String] | Used when `specific` |
| suspendedItemNumbers | [String] | Blocks rating for specific items |

---

### Vacancy
A job item within a publication range.

| Field | Type | Notes |
|---|---|---|
| itemNumber | String | Unique within a publication range (compound index) |
| position / assignment | String | |
| salaryGrade | Number | 1–24 |
| qualifications | Object | education, training, experience, eligibility |
| publicationRangeId | ObjectId ref | |

**Indexes:** `{ itemNumber, publicationRangeId }` (unique), `{ publicationRangeId, isArchived }`

---

### Candidate
An applicant for a vacancy within a publication range.

| Field | Type | Notes |
|---|---|---|
| fullName / itemNumber | String | |
| status | Enum | `general_list`, `long_list`, `for_review`, `disqualified` |
| commentsHistory | Array | Secretariat evaluation notes with full history |
| statusHistory | Array | Full audit trail of status changes |
| governmentEmployment | Object | Current/recent govt service details |
| publicationRangeId | ObjectId ref | |

**Indexes:** `{ publicationRangeId, isArchived, status }`, `{ itemNumber, publicationRangeId }`

---

### Competency
A BEI competency assessed during interviews. Can be fixed (applies to all vacancies) or vacancy-specific.

| Field | Type | Notes |
|---|---|---|
| name | String | |
| type | Enum | `basic`, `organizational`, `leadership`, `minimum` |
| isFixed | Boolean | If true, applies to all vacancies |
| vacancyIds | [ObjectId] | Specific vacancies this competency applies to |

---

### Rating
A single rater's score for one competency on one candidate.

| Field | Type | Notes |
|---|---|---|
| candidateId | ObjectId | |
| competencyId | ObjectId | |
| raterId | ObjectId | |
| score | Number | 1–5 (CBS rating scale) |
| itemNumber | String | Denormalized for fast filtering |
| auditLog | Array | Embedded change history |

**Unique index:** `{ itemNumber, raterId, candidateId }` — prevents duplicate submissions.

---

### RatingLog
Separate append-only audit log collection for all rating actions (created, updated, deleted, batch operations).

**Indexes:** `{ candidateId, createdAt }`, `{ raterId, createdAt }`, `{ itemNumber, createdAt }`, `{ action, createdAt }`

---

## 5. User Roles & Access Control

| Permission | Admin | Secretariat | Rater |
|---|:---:|:---:|:---:|
| Manage users | ✅ | ❌ | ❌ |
| Manage publication ranges | ✅ | ❌ | ❌ |
| Import/manage vacancies (CSV) | ✅ | ❌ | ❌ |
| Import/manage candidates (CSV) | ✅ | ❌ | ❌ |
| Review candidate qualifications | ✅ | ✅ | ❌ |
| Change candidate status | ✅ | ✅ | ❌ |
| Submit BEI ratings | ❌ | ❌ | ✅ |
| View own ratings only | N/A | N/A | ✅ |
| View all ratings | ✅ | ❌ | ❌ |
| View rating audit logs | ✅ | ✅* | ❌ |
| Export CSVs / PDFs | ✅ | ✅ | ✅ |
| Generate Interview Summary (AI) | ✅ | ✅ | ✅ |
| Comment suggestions | ✅ | ✅ | ❌ |

*Secretariat requires `administrativePrivilege: true` for audit log access.

---

## 6. Core Features by Role

### Admin View
- **User Management:** Create, edit, delete, and assign raters/secretariats to specific item numbers, assignments, or all vacancies.
- **Publication Range Management:** Create publication batches with date ranges; archive/unarchive ranges.
- **Vacancy Management:** CSV bulk import, manual entry, clone vacancies across publication ranges, undo last import.
- **Candidate Management:** CSV bulk import with validation, manual entry, undo import.
- **Competency Management:** CSV upload, manual entry, assign to vacancies, undo upload. Fixed competencies apply to all.
- **Reports & Exports:** Candidate summary CSV, detailed CSV export, rating audit log CSV.
- **Statistics:** Per-publication-range breakdown of candidate counts by status.

### Secretariat View
- **Candidate Qualification Review:** Mark candidates as general list, long list, for review, or disqualified.
- **Comments System:** Add evaluation comments per qualification category (education, training, experience, eligibility) with autocomplete suggestions.
- **Government Employment Data Entry:** Record current/recent government service with assessment pre-exam data.
- **Late Applicant Flagging.**
- **PDF Report Generation:** Generate per-candidate jsPDF qualification summary reports.
- **Interview Summary Generator:** AI-assisted BEI summary generation using Anthropic API.

### Rater View
- **Candidate Selection:** Navigate by assignment → position → item number → candidate.
- **BEI Rating Form:** Score candidates 1–5 on each competency (basic, organizational, leadership, minimum).
- **CBS Reference Guide:** Built-in STAR/BEI scoring anchors with detailed descriptors for each score level.
- **PDF Viewer (pdfParser):** Parses candidate PDF documents linked in the system; uses IndexedDB caching via `pdfParserCache.js` for repeat visits.
- **Copy Ratings:** Copy existing ratings from one item number to another for the same rater.
- **Rating Monitor:** View own submitted ratings with search and filter.

### Dashboard / Global
- **STAR/BEI Interviewer Guide:** Full behavioral event interview guide with score anchors.
- **Password Management:** Self-service password change; admin-forced password reset.
- **Keep-Alive Ping:** `/ping` endpoint hit by cron-job.org to prevent Render cold starts.

---

## 7. API Routes Reference

### Auth
| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/login` | Public (rate limited: 10/15min) |
| GET | `/api/auth/me` | Authenticated |
| POST | `/api/auth/verify-password` | Authenticated |
| PUT | `/api/auth/change-password` | Authenticated |

### Users
| Method | Route | Access |
|---|---|---|
| GET | `/api/users` | Admin |
| POST | `/api/users` | Admin |
| GET | `/api/users/raters` | Admin/Secretariat |
| GET | `/api/users/secretariats` | Admin |
| POST | `/api/users/:id/assign-vacancies` | Admin |
| GET | `/api/users/:id/assigned-vacancies` | Admin |
| PUT | `/api/users/:id` | Admin |
| PUT | `/api/users/:id/change-password` | Admin |
| DELETE | `/api/users/:id` | Admin |

### Vacancies, Candidates, Competencies, Ratings, RatingLogs, Publication Ranges
Full CRUD plus specialized endpoints: `upload-csv`, `undo-import`, `by-publication/:id`, `export-csv`, `clone-to-publication`, `comment-suggestions`, `check-existing`, `statistics`.

---

## 8. Security Measures

The codebase has been patched against a documented set of security findings (labeled F-01 through F-18):

- **F-01:** Raters cannot access other raters' scores (CBS independence).
- **F-06:** Mass-assignment prevention via field allowlists on all update routes.
- **F-07:** Raters' `GET /ratings/candidate/:id` returns only their own ratings.
- **F-09:** Raters only see candidates matching their assigned item numbers.
- **F-10:** `/health` endpoint is admin-only (prevents unauthenticated server recon).
- **F-11:** Comment suggestions are blocked for raters.
- **F-14:** Score range (1–5) validated before DB write.
- **F-15:** Export/report endpoints have a stricter rate limit (20/15min) to prevent data exfiltration loops.
- **F-16:** JWT secret enforced to minimum 32 characters.
- **F-18:** Root `/` route returns only `OK` — no endpoint map exposed.
- **Global rate limiting:** 500 req/15min globally; 10 login attempts/15min.
- **CORS:** Restricted to `xhrissun.github.io` and `cron-job.org` in production.
- **Password hashing:** bcryptjs.
- **File upload validation:** MIME type + extension check; 5MB size limit; no temp files written to disk.

---

## 9. Performance Enhancements — Implemented (V3)

This section documents all performance improvements applied in V3. Each entry includes what changed, what file was changed, and the measurable impact.

---

### ✅ PERF-01 — Rating Submission: N+1 DB Round-Trips → Single `bulkWrite`
**File:** `server/routes.js` — `POST /ratings/submit`

**Before:** The submission loop ran `Rating.findOne()` + `Rating.findOneAndUpdate()` **sequentially per competency** inside a `for` loop. A typical BEI session rates 10–15 competencies, producing 20–30 serial DB round-trips. Each round-trip incurs full network latency to MongoDB Atlas.

```js
// BEFORE — N×2 sequential DB round-trips
for (const ratingData of ratings) {
  const existingRating = await Rating.findOne(filter);       // N awaits
  const result = await Rating.findOneAndUpdate(filter, ...); // N awaits
}
```

**After:** All scores are validated up-front in a plain loop (no DB), existing ratings are looked up from the already-fetched `existingRatings` array via a `Map` (zero extra DB calls), and all upserts are sent as a **single `Rating.bulkWrite()`** with `ordered: false`. Audit log entries are accumulated and written with a single `RatingLog.insertMany()`.

```js
// AFTER — 2 total DB operations regardless of competency count
Rating.bulkWrite(bulkOps, { ordered: false });  // 1 operation
RatingLog.insertMany(logEntries);               // 1 operation
```

**Impact:** For a 12-competency rating session on an 80ms Atlas round-trip, backend DB time drops from ~1,920ms to ~160ms.

---

### ✅ PERF-02 — RaterView: Parallel Item Data Loading
**File:** `src/components/RaterView.jsx`

**Before:** When a rater selected an item number, three functions fired independently in sequence:
```js
loadCandidatesByItemNumber();   // await candidatesAPI  — fires first
loadCompetenciesByItemNumber(); // await competenciesAPI — waited for first to finish
loadVacancyDetails();           // synchronous
```

**After:** Replaced all three with a single `loadItemData` `useCallback` that fires both API calls in `Promise.all` and sets vacancy details synchronously from the already-loaded `vacancies` array:
```js
const [candidatesRes, competenciesRes] = await Promise.all([
  candidatesAPI.getByItemNumber(selectedItemNumber),
  vacancy ? competenciesAPI.getByVacancy(vacancy._id) : Promise.resolve([]),
]);
```

**Impact:** Panel load time halves — from two sequential 80ms fetches (~160ms) to one parallel round (~80ms). The candidate list and competency panel appear simultaneously instead of in two visible steps.

---

### ✅ PERF-03 — RaterView: Stable `useCallback` References
**File:** `src/components/RaterView.jsx`

**Before:** `filterVacanciesByAssignment` and `loadInitialData` were plain `const` function declarations recreated on every render, causing unnecessary `useEffect` re-runs.

**After:** Both wrapped in `useCallback` with correct dependency arrays — `filterVacanciesByAssignment` with `[]` (stable for component lifetime), `loadInitialData` with `[filterVacanciesByAssignment]`.

---

### ✅ PERF-04 — RaterView: CBS PDF Skip Button for Slow Connections
**File:** `src/components/RaterView.jsx`

**Before:** Raters were forced to wait for the full CBS PDF parse before the interface appeared — potentially 30+ seconds on a first visit over a slow connection.

**After:** A **Skip button** appears automatically after **5 seconds** of active parsing. Pressing it sets `pdfSkipRef.current = true`, which the `pdfPreloadPromise` wrapper detects on its next progress tick and resolves immediately — unblocking `Promise.all` and dismissing the loading screen. The parse continues in the background so IndexedDB is still populated for the next session (which then loads in <50ms from cache).

The button never appears on cached loads or fast connections where parsing completes before the 5-second timer fires.

---

### ✅ PERF-05 — SecretariatView: Render-Time Filtering Replaced with `useMemo`
**File:** `src/components/SecretariatView.jsx`

**Before:** Three functions were called directly in the render body on every re-render:
```js
const stats              = getStatistics();        // iterates candidates
const filteredCandidates = getFilteredCandidates(); // filters candidates
const genderStats        = getGenderStatistics();   // filters candidates
```
`useCallback` stabilizes a function *reference* — it does not memoize the *return value*. All three recomputed on every keystroke, modal open, or unrelated state change.

**After:** Converted to `useMemo` with the same dependency arrays:
```js
const stats              = useMemo(() => { ... }, [candidates]);
const genderStats        = useMemo(() => { ... }, [candidates, statusFilter]);
const filteredCandidates = useMemo(() => { ... }, [candidates, statusFilter, genderFilter, govtEmpFilter, lateFilter, lateApplicants]);
```

**Impact:** With 50–200 candidates loaded, these three computations now only run when their specific dependencies change — not on every unrelated re-render.

---

### ✅ PERF-06 — AdminView: `filterAndSortData` Hoisted to `useMemo`
**File:** `src/components/AdminView.jsx`

**Before:** Each render helper (`renderUsers`, `renderVacancies`, `renderCandidates`, `renderCompetencies`, `renderVacancyAssignments`) called `filterAndSortData(data, fields)` inside its body, re-running the full filter+sort pass every time the helper was invoked.

**After:** Five `useMemo` values are computed once at component level and consumed by reference:
```js
const filteredUsers        = useMemo(() => filterAndSortData(users,        [...]), [users,        filterAndSortData]);
const filteredVacanciesT   = useMemo(() => filterAndSortData(vacancies,    [...]), [vacancies,    filterAndSortData]);
const filteredCandidatesT  = useMemo(() => filterAndSortData(candidates,   [...]), [candidates,   filterAndSortData]);
const filteredCompetenciesT = useMemo(() => filterAndSortData(competencies, [...]), [competencies, filterAndSortData]);
const filteredUsersAssign  = useMemo(() => filterAndSortData(users,        [...]), [users,        filterAndSortData]);
```
Each render helper's `useCallback` dep array references its corresponding memoized value instead of `filterAndSortData`.

**Impact:** Sorting and filtering only re-run when the underlying data or search/sort state changes — not when modals open, upload results arrive, or tabs switch.

---

### ✅ PERF-07 — InterviewSummaryGeneratorV2: Batch Endpoint + Full Memoization
**File:** `src/components/InterviewSummaryGeneratorV2.jsx`

Full re-architecture of the interview summary board view:
- **Batch board endpoint:** `loadCandidateBoard` uses a single `/board-batch` request (2 DB queries) instead of 1+N individual enrichment calls. Graceful fallback to legacy path if endpoint unavailable.
- **Parallel initial load:** `vacanciesAPI.getAll()`, `usersAPI.getRaters()`, and `publicationRangesAPI.getActive()` fetched simultaneously via `Promise.all`.
- **`useMemo` for `metrics` and `filteredBoard`:** Board statistics and candidate filtering memoized — no recomputation on modal opens or search keystrokes.
- **`useCallback` on all async loaders.**
- **Skeleton loading cards** (`SkeletonCard`, `MetricCard`) for perceived performance.

---

## 10. Remaining Bottlenecks & Recommendations

### 🔴 Critical

#### 1. Render Free-Tier Cold Starts (~15–50 seconds)
The backend spins down after 15 minutes of inactivity. A cron-job.org ping hits `/ping` to mitigate this — ensure the interval is set to **every 10 minutes**. Permanent fix: upgrade to Render paid tier or migrate to Railway/Fly.io.

---

#### 2. Unpaginated `GET /candidates`
Both `GET /candidates` and `GET /candidates/by-publication/:id` return all candidates with no limit. Add `page`/`limit` query params and update frontend to paginate.

---

#### 3. `sourcemap: true` + `minify: false` in Production Build
`vite.config.js` ships unminified JS with source maps to all users, increasing bundle size 40–60%.

**Fix:**
```js
sourcemap: false,   // or 'hidden' for Sentry
minify: 'esbuild',  // ships with Vite
```

---

### 🟡 Medium

#### 4. Comment Suggestions Loads 1,000 Full Documents
Replace the document fetch with a MongoDB aggregation pipeline that runs entirely in the DB engine.

#### 5. In-Memory Upload Undo Logs Lost on Restart
Migrate `_uploadLogs` to a MongoDB collection with a 1-hour TTL index.

#### 6. Monolithic View Components — No Code Splitting
All views load eagerly on login. Raters download AdminView (~4,500 lines) even though they never use it. Fix with `React.lazy()` / `Suspense`.

---

### 🟢 Low

| Issue | Recommendation |
|---|---|
| `GET /ratings` has no pagination | Add `limit`/`skip` query params |
| Age recomputed on every `toJSON` | Skip if `age` field is already fresh |
| No chunk splitting for lucide-react or jsPDF | Add to `manualChunks` in `vite.config.js` |
| Mongoose connect uses default pool size | Add `maxPoolSize: 10` to connection options |

---

## 11. Known Issues & Areas for Improvement

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | In-memory upload logs wiped on server restart | High | Open |
| 2 | No pagination on `/candidates`, `/ratings` | High | Open |
| 3 | Production build ships unminified JS + source maps | High | Open |
| 4 | ~~N+1 DB queries in ratings submission~~ | ~~Medium~~ | ✅ Fixed — PERF-01 |
| 5 | Comment suggestions fetches 1,000 full documents | Medium | Open |
| 6 | ~~No loading skeleton on large candidate lists~~ | ~~Medium~~ | ✅ Fixed — PERF-07 |
| 7 | ~~Sequential API calls on item number selection (RaterView)~~ | ~~Medium~~ | ✅ Fixed — PERF-02 |
| 8 | ~~Render-time recomputation in SecretariatView~~ | ~~Medium~~ | ✅ Fixed — PERF-05 |
| 9 | ~~`filterAndSortData` re-runs inside every render helper (AdminView)~~ | ~~Medium~~ | ✅ Fixed — PERF-06 |
| 10 | ~~CBS PDF blocks loading screen on slow connections~~ | ~~Medium~~ | ✅ Fixed — PERF-04 |
| 11 | No automated tests (unit or integration) | Medium | Open |
| 12 | No API response schema validation (Zod/Joi) | Medium | Open |
| 13 | JWT tokens have no explicit expiry configuration | Medium | Open |
| 14 | `vite.config.js` does not split lucide-react or jsPDF | Low | Open |
| 15 | `mongoose.connect()` uses default connection pool settings | Low | Open |
| 16 | Age field recomputed on every `toJSON` | Low | Open |

---

## 12. Deployment

### Frontend
```bash
npm run build    # Builds to /dist
npm run deploy   # Pushes to gh-pages branch → GitHub Pages
```
Live URL: `https://xhrissun.github.io/rhrmpsb-system/`

### Backend
```bash
cd server
npm start        # node server.js
```
Hosted on Render. Auto-deploys from the connected Git branch. Requires environment variables set in the Render dashboard.

---

## 13. Environment Variables

### Backend (`server/.env`)
| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | ✅ | Full MongoDB Atlas connection string |
| `JWT_SECRET` | ✅ | Minimum 32 characters (enforced at startup) |
| `PORT` | Optional | Defaults to `5001` |
| `NODE_ENV` | Optional | Set to `production` on Render |

### Frontend (Vite)
| Variable | Notes |
|---|---|
| `VITE_*` (none currently) | API URL is derived from `import.meta.env.PROD` — no `.env` file needed |

---

*README generated from system audit — April 2026*