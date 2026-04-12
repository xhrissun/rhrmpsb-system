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
9. [Performance Enhancements — Implemented](#9-performance-enhancements--implemented)
10. [Remaining Bottlenecks & Recommendations](#10-remaining-bottlenecks--recommendations)
11. [Known Issues & Areas for Improvement](#11-known-issues--areas-for-improvement)
12. [Concurrent Load — Risk Assessment](#12-concurrent-load--risk-assessment)
13. [Deployment](#13-deployment)
14. [Environment Variables](#14-environment-variables)

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

| Field | Type | Notes |
|---|---|---|
| fullName / itemNumber | String | |
| status | Enum | `general_list`, `long_list`, `for_review`, `disqualified` |
| commentsHistory | Array | Secretariat evaluation notes with full history |
| statusHistory | Array | Full audit trail of status changes |
| governmentEmployment | Object | Current/recent govt service details |
| publicationRangeId | ObjectId ref | |

**Indexes:** `{ publicationRangeId, isArchived, status }`, `{ itemNumber, publicationRangeId }`, `{ itemNumber }`

---

### Competency

| Field | Type | Notes |
|---|---|---|
| name | String | |
| type | Enum | `basic`, `organizational`, `leadership`, `minimum` |
| isFixed | Boolean | If true, applies to all vacancies |
| vacancyIds | [ObjectId] | Specific vacancies this competency applies to |

---

### Rating

| Field | Type | Notes |
|---|---|---|
| candidateId | ObjectId | |
| competencyId | ObjectId | |
| raterId | ObjectId | |
| score | Number | 1–5 (CBS rating scale) |
| itemNumber | String | Denormalized for fast filtering |
| auditLog | Array | Embedded change history |

**Unique index:** `{ itemNumber, raterId, candidateId }` — prevents duplicate submissions.
**Board query index:** `{ itemNumber, candidateId }` — added V5; prevents collection scans under concurrent load.

---

### RatingLog
Append-only audit log collection for all rating actions.

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
- **Comments System:** Add evaluation comments per qualification category with autocomplete suggestions.
- **Government Employment Data Entry:** Record current/recent government service with assessment pre-exam data.
- **Late Applicant Flagging.**
- **PDF Report Generation:** Generate per-candidate jsPDF qualification summary reports.
- **Interview Summary Generator:** AI-assisted BEI summary generation using Anthropic API.

### Rater View
- **Candidate Selection:** Navigate by assignment → position → item number → candidate.
- **BEI Rating Form:** Score candidates 1–5 on each competency (basic, organizational, leadership, minimum).
- **CBS Reference Guide:** Built-in STAR/BEI scoring anchors with detailed descriptors for each score level.
- **PDF Viewer (pdfParser):** Parses candidate PDF documents; uses IndexedDB caching via `pdfParserCache.js`.
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
| POST | `/api/auth/login` | Public (rate limited: 20/15min) |
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
Full CRUD plus specialized endpoints: `upload-csv`, `undo-import`, `by-publication/:id`, `export-csv`, `clone-to-publication`, `comment-suggestions`, `check-existing`, `statistics`, `item/:itemNumber/board`.

---

## 8. Security Measures

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
- **Global rate limiting:** 500 req/15min globally; 20 login attempts/15min.
- **CORS:** Restricted to `xhrissun.github.io` and `cron-job.org` in production.
- **Password hashing:** bcryptjs.
- **File upload validation:** MIME type + extension check; 5MB size limit; no temp files written to disk.

---

## 9. Performance Enhancements — Implemented

### ✅ PERF-01 — Rating Submission: N+1 DB Round-Trips → `bulkWrite`
**File:** `server/routes.js` — `POST /ratings/submit`

**Root cause of 6-second submit delay.** The submission loop ran `Rating.findOne()` + `Rating.findOneAndUpdate()` sequentially per competency — 20–30 serial DB round-trips for a typical 12-competency session.

**Fix:** Scores validated up-front (no DB). Existing ratings looked up via a `Map` built from the already-fetched `existingRatings` array. All upserts sent as a single `Rating.bulkWrite({ ordered: false })`. Audit entries written with one `RatingLog.insertMany()`.

```js
// 2 total DB operations regardless of competency count
await Rating.bulkWrite(bulkOps, { ordered: false });
await RatingLog.insertMany(logEntries);
```

**Impact:** Backend DB time for 12 competencies at 80ms Atlas latency: ~1,920ms → ~160ms.

---

### ✅ PERF-02 — RaterView: Parallel Item Data Loading
**File:** `src/components/RaterView.jsx`

Sequential API calls on item number selection replaced with a single `Promise.all`. Candidates and competencies load simultaneously.

---

### ✅ PERF-03 — RaterView: Stable `useCallback` References
**File:** `src/components/RaterView.jsx`

`filterVacanciesByAssignment` and `loadInitialData` wrapped in `useCallback` with correct dependency arrays.

---

### ✅ PERF-04 — RaterView: CBS PDF Skip Button for Slow Connections
**File:** `src/components/RaterView.jsx`

Skip button appears after 5 seconds of active parsing. Parse continues in background to populate IndexedDB cache for next session.

---

### ✅ PERF-05 — SecretariatView: Render-Time Filtering → `useMemo`
**File:** `src/components/SecretariatView.jsx`

`getStatistics()`, `getFilteredCandidates()`, `getGenderStatistics()` converted from render-body calls to `useMemo` with proper dependency arrays.

---

### ✅ PERF-06 — AdminView: `filterAndSortData` → `useMemo`
**File:** `src/components/AdminView.jsx`

Five `useMemo` values replace repeated `filterAndSortData()` calls inside render helpers.

---

### ✅ PERF-07 — InterviewSummaryGeneratorV2: Batch Endpoint + Memoization
**File:** `src/components/InterviewSummaryGeneratorV2.jsx`, `server/routes.js`

Batch board endpoint (`GET /candidates/item/:itemNumber/board`) replaces 1+N per-candidate enrichment calls. `useMemo` for metrics and filtered board. Skeleton loading cards.

---

### ✅ PERF-08 — Comment Suggestions: MongoDB Aggregation Pipeline
**File:** `server/routes.js` — `GET /candidates/comment-suggestions/:field`

`Candidate.find().limit(1000)` + JS frequency count replaced with a 5-stage aggregation pipeline. Frequency counting runs inside the DB engine; only the top-N strings (~2KB vs ~200KB+) travel over the wire.

```js
const pipeline = [
  { $match: { [`comments.${field}`]: { $exists: true, $ne: '' } } },
  { $project: { comment: `$comments.${field}` } },
  { $group: { _id: '$comment', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: maxSuggestions }
];
```

---

### ✅ PERF-09 — Mongoose Connection Pool
**File:** `server/server.js`

`mongoose.connect(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 })` doubles the default pool from 5 and adds a hard timeout instead of hanging indefinitely.

---

### ✅ PERF-10 — Production Build: Minification + Chunk Splitting
**File:** `vite.config.js`

`sourcemap: false`, `minify: 'esbuild'`. Added `lucide-react` and `jspdf` to `manualChunks` alongside existing `vendor` and `pdfjs` chunks. Bundle size reduced 40–60%.

---

### ✅ PERF-11 — Age Field: Skip Redundant `toJSON` Recomputation
**File:** `server/models.js`

`toJSON` transform short-circuits if `updatedAt` is in the current year and `age` is already set. `pre('save')` and `pre('findOneAndUpdate')` hooks keep the value current at write time.

---

### ✅ PERF-12 — Rating Compound Index for Board Query
**File:** `server/models.js`

Added `{ itemNumber: 1, candidateId: 1 }` index. The board batch query `Rating.find({ candidateId: { $in: [...] }, itemNumber })` previously relied on the single-field `candidateId` index and degraded to a collection scan under concurrent load.

---

### ✅ FIX-01 — SG-Aware Rater Count in Interview Summary Metrics
**Files:** `server/routes.js`, `src/components/InterviewSummaryGeneratorV2.jsx`

**Bug:** For SG≤14 positions, only Regular Member and End-User are required raters. The board batch endpoint previously counted all unique rater IDs (including Chairperson, Vice-Chairperson, GAD, DENREU) toward `raterCount`, making "Fully Rated" always wrong and progress bars inflated.

**Fix (server):** Board endpoint fetches the full rater roster, builds `requiredRaterIds` based on salary grade (SG≤14 → `{Regular Member, End-User}`; SG≥15 → all 6 types), counts only qualifying IDs, and returns `requiredRaters` (2 or 6) alongside the board data.

**Fix (frontend):** `boardRequiredRaters` stored from server response. All metrics, labels, and progress bars use this value instead of hardcoded `6`.

---

### ✅ FIX-02 — Test Mode for Computation Verification
**File:** `src/components/InterviewSummaryGeneratorV2.jsx`

**New feature** in the candidate summary modal. Allows verification that row averages, CER scores, and final breakdowns compute correctly using hypothetical scores — without submitting or touching real data.

**Usage:**
1. Open any candidate modal in the Interview Summary view.
2. Click the **Test Mode** button (amber) in the modal header.
3. An amber banner confirms test mode is active.
4. Enter scores (1–5, decimals allowed) in any required rater cell. NA columns remain NA (respects SG rules).
5. Row averages, TOTAL rows, Psycho-Social, Potential, and Overall CER scores update live.
6. Click **Exit Test Mode** or close the modal to restore live data.

Real rating data is not read, written, or affected in any way during test mode.

---

## 10. Remaining Bottlenecks & Recommendations

### 🔴 Critical

#### 1. Render Free-Tier Cold Starts (~15–50 seconds)
The backend spins down after 15 minutes of inactivity. Keep cron-job.org ping interval at **≤10 minutes**. Permanent fix: upgrade to Render paid tier or migrate to Railway/Fly.io.

#### 2. Unpaginated `GET /candidates`
Both `GET /candidates` and `GET /candidates/by-publication/:id` return all candidates with no limit. Add `page`/`limit` query params and paginate the frontend.

---

### 🟡 Medium

#### 3. In-Memory Upload Undo Logs Lost on Restart
Migrate `_uploadLogs` to a MongoDB collection with a 1-hour TTL index.

#### 4. Monolithic View Components — No Code Splitting
All views load eagerly on login. Raters download AdminView (~4,500 lines) even though they never use it. Fix with `React.lazy()` / `Suspense`.

---

### 🟢 Low

| Issue | Recommendation |
|---|---|
| `GET /ratings` has no pagination | Add `limit`/`skip` query params |
| No automated tests | Add Vitest for frontend, Jest + Supertest for API routes |
| No API request schema validation | Add Zod or Joi on all request bodies |
| JWT has no refresh token mechanism | Consider sliding session or refresh tokens for long sessions |

---

## 11. Known Issues & Areas for Improvement

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | In-memory upload logs wiped on server restart | High | Open |
| 2 | No pagination on `/candidates`, `/ratings` | High | Open |
| 3 | ~~Production build ships unminified JS + source maps~~ | ~~High~~ | ✅ Fixed — PERF-10 |
| 4 | ~~N+1 DB queries in ratings submission (6-second submit)~~ | ~~High~~ | ✅ Fixed — PERF-01 |
| 5 | ~~Comment suggestions fetches 1,000 full documents~~ | ~~Medium~~ | ✅ Fixed — PERF-08 |
| 6 | ~~No loading skeleton on large candidate lists~~ | ~~Medium~~ | ✅ Fixed — PERF-07 |
| 7 | ~~Sequential API calls on item number selection (RaterView)~~ | ~~Medium~~ | ✅ Fixed — PERF-02 |
| 8 | ~~Render-time recomputation in SecretariatView~~ | ~~Medium~~ | ✅ Fixed — PERF-05 |
| 9 | ~~filterAndSortData re-runs inside every render helper (AdminView)~~ | ~~Medium~~ | ✅ Fixed — PERF-06 |
| 10 | ~~CBS PDF blocks loading screen on slow connections~~ | ~~Medium~~ | ✅ Fixed — PERF-04 |
| 11 | No automated tests (unit or integration) | Medium | Open |
| 12 | No API response schema validation (Zod/Joi) | Medium | Open |
| 13 | JWT tokens have no explicit expiry configuration | Medium | Open |
| 14 | ~~vite.config.js does not split lucide-react or jsPDF~~ | ~~Low~~ | ✅ Fixed — PERF-10 |
| 15 | ~~mongoose.connect() uses default connection pool settings~~ | ~~Low~~ | ✅ Fixed — PERF-09 |
| 16 | ~~Age field recomputed on every toJSON~~ | ~~Low~~ | ✅ Fixed — PERF-11 |
| 17 | ~~Board metrics count all rater types regardless of SG~~ | ~~Medium~~ | ✅ Fixed — FIX-01 |
| 18 | ~~No way to verify computation formulas without live data~~ | ~~Medium~~ | ✅ Fixed — FIX-02 |
| 19 | ~~Rating board query lacks compound index~~ | ~~Medium~~ | ✅ Fixed — PERF-12 |

---

## 12. Concurrent Load — Risk Assessment

**Q: Is there a risk of slowing or crashing when multiple raters log in and rate simultaneously?**

The system is now hardened for the expected concurrent load of a full 6-rater board session. Full analysis:

| Layer | Risk | Status |
|---|---|---|
| Rating submission DB writes | **Low.** `bulkWrite` with `ordered: false` — one rater's failure does not block others. Unique index prevents duplicate writes at DB level. | ✅ PERF-01 |
| Board batch query under concurrent reads | **Low.** Compound index `{ itemNumber, candidateId }` prevents collection scans. | ✅ PERF-12 |
| MongoDB connection contention | **Low.** `maxPoolSize: 10` handles 10 simultaneous DB operations without queueing. | ✅ PERF-09 |
| Render free tier memory (512MB) | **Medium.** Single Node process. A spike of 10+ large simultaneous requests could exhaust RAM. Mitigated by global rate limiter (500 req/15min) but not fully eliminated. Upgrade to paid tier for production. | Open |
| MongoDB Atlas M0 (free tier) | **Medium.** M0 has shared CPU/IOPS and a 500-connection cap. Under heavy concurrent load, query times will increase. Upgrade to M2+ for production workloads. | Open |
| Render cold starts | **High if ping lapses.** Keep cron-job.org ping at ≤10 minutes. | Existing |

**Practical ceiling:** The system handles 6 simultaneous raters rating the same item concurrently without issues at the application level. Problems at 20+ concurrent sessions are infrastructure constraints (Render free tier RAM, Atlas M0 IOPS), not application code.

---

## 13. Deployment

### Frontend
```bash
npm run build    # Builds to /dist with esbuild minification, no source maps
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

## 14. Environment Variables

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

*README updated April 2026 — V5*
