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
9. [Performance Analysis — Current Bottlenecks](#9-performance-analysis--current-bottlenecks)
10. [Recommended Performance Improvements](#10-recommended-performance-improvements)
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
- The backend is a Node.js/Express REST API deployed on Render's free tier (subject to cold starts — see §9).
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

## 9. Performance Analysis — Current Bottlenecks

### 🔴 Critical

#### 1. Render Free-Tier Cold Starts (~15–50 seconds)
The backend is hosted on Render's free tier, which **spins down after 15 minutes of inactivity**. The first request after idle triggers a cold start that can take 15–50 seconds. A cron-job.org ping hits `/ping` to mitigate this, but the ping interval may not be short enough.

**Impact:** Every user who opens the app after a period of inactivity faces a blank loading screen.

---

#### 2. N+1 Query in `POST /ratings/submit`
Inside the ratings submission loop, `Rating.findOne()` and `Rating.findOneAndUpdate()` are called **sequentially per rating** inside a `for` loop:
```js
for (const ratingData of ratings) {
  const existingRating = await Rating.findOne(filter);  // N round-trips
  const result = await Rating.findOneAndUpdate(...);     // N round-trips
}
```
A typical BEI session rates 10–15 competencies. This causes 20–30 sequential DB round-trips per submission.

---

#### 3. Unpaginated `GET /candidates` (Admin/Secretariat)
`Candidate.find()` with no `.limit()` returns **all candidates** in the entire database. As the system grows across publication ranges, this will become a major bottleneck for admin and secretariat users.

---

#### 4. Comment Suggestions Loads Up to 1,000 Candidate Documents
`GET /candidates/comment-suggestions/:field` fetches up to 1,000 full candidate documents to build a frequency map. Only the `comments.field` projection is used, but loading 1,000 documents on every suggestions dropdown open is expensive.

---

#### 5. Monolithic Frontend Bundles (AdminView: 4,514 lines; SecretariatView: 4,694 lines)
The three main view components are extremely large single files. They are loaded eagerly on login even though only one view is ever used per session. This inflates the initial JS parse time significantly.

---

#### 6. `sourcemap: true` + `minify: false` in Production Build
The Vite config has source maps enabled and minification disabled for the production build:
```js
sourcemap: true,
minify: false,
```
This ships unminified JS to users, increasing bundle size by 30–50% and slowing parse time.

---

### 🟡 Medium

#### 7. Sequential API Calls on Initial Load (AdminView)
On tab changes in AdminView, vacancies and candidates are fetched sequentially rather than in a single `Promise.all`. Several `useEffect` chains trigger cascading re-fetches.

#### 8. In-Memory Upload Log Store (`_uploadLogs`)
Upload undo logs are stored in a plain JS object in memory. These are **wiped on every server restart** (which happens frequently on Render's free tier). The code itself has a `NOTE` acknowledging this needs to be migrated to MongoDB.

#### 9. `pdfjs-dist` Worker Bundle Size
The PDF.js library is chunked separately in Vite, but it is a large dependency (~3MB). It loads on all views even when no PDF parsing is needed.

---

### 🟢 Low

#### 10. `GET /ratings` Has No Pagination
The admin-only `GET /ratings` route fetches all ratings with no limit. As ratings accumulate over multiple publication ranges, this will grow unbounded.

#### 11. Age Recomputed on Every `toJSON` Call
The `candidateSchema` `toJSON` transform calls `computeAge(dateOfBirth)` for every candidate on every API response. For bulk exports with hundreds of candidates, this is avoidable CPU work since `age` is also stored.

---

## 10. Recommended Performance Improvements

### Priority 1 — Immediate Wins (Low Effort, High Impact)

#### Fix Vite Production Build Config
In `vite.config.js`, change:
```js
// Before
sourcemap: true,
minify: false,

// After
sourcemap: false,        // or 'hidden' if you need source maps in Sentry/error tracking
minify: 'esbuild',       // esbuild is fast and ships with Vite — no extra install needed
```
This alone can reduce JS bundle size by 40–60% and speed up first paint.

---

#### Batch the Ratings Submit Loop
Replace the sequential `for` loop in `POST /ratings/submit` with a `bulkWrite`:
```js
// Replace the for-loop with:
const ops = ratings.map(r => ({
  updateOne: {
    filter: { candidateId: r.candidateId, raterId: req.user._id, competencyId: r.competencyId, itemNumber: r.itemNumber },
    update: { $set: { score: parseInt(r.score), competencyType: r.competencyType, submittedAt: new Date() } },
    upsert: true
  }
}));
const bulkResult = await Rating.bulkWrite(ops, { ordered: false });
```
This reduces 20–30 sequential DB round-trips to **1 batched operation**.

---

#### Shorten the Keep-Alive Ping Interval
Configure cron-job.org to ping `/ping` every **10 minutes** instead of a longer interval to prevent Render cold starts. Render's free tier spins down after 15 minutes of inactivity.

---

### Priority 2 — Medium Effort, High Impact

#### Add Pagination to Candidate Fetching
Add `limit` and `skip` (or cursor-based pagination) to `GET /candidates` and `GET /candidates/by-publication/:id`:
```js
const { page = 1, limit = 50 } = req.query;
const candidates = await Candidate.find(query)
  .sort({ fullName: 1 })
  .skip((page - 1) * parseInt(limit))
  .limit(parseInt(limit));
const total = await Candidate.countDocuments(query);
res.json({ candidates, total, page, limit });
```
Update the frontend to support paginated loading with "Load more" or page controls.

---

#### Lazy-Load View Components
In `App.jsx` / `Dashboard.jsx`, replace static imports with React lazy loading:
```jsx
const AdminView       = React.lazy(() => import('./components/AdminView'));
const SecretariatView = React.lazy(() => import('./components/SecretariatView'));
const RaterView       = React.lazy(() => import('./components/RaterView'));
```
Wrap with `<Suspense fallback={<LoadingSpinner />}>`. This means raters only download the RaterView bundle (~118KB), not AdminView or SecretariatView.

---

#### Migrate Upload Logs to MongoDB with TTL Index
Replace the in-memory `_uploadLogs` object with a dedicated MongoDB collection:
```js
// New schema
const uploadLogSchema = new mongoose.Schema({
  publicationRangeId: ObjectId,
  uploadedIds: [ObjectId],
  uploadedAt: { type: Date, default: Date.now, expires: 3600 } // TTL: 1 hour
});
```
This survives server restarts (critical on Render free tier).

---

#### Convert Comment Suggestions to an Aggregation Pipeline
Replace the 1,000-document fetch with a native MongoDB aggregation:
```js
const suggestions = await Candidate.aggregate([
  { $match: { [`comments.${field}`]: { $exists: true, $ne: '' } } },
  { $group: { _id: `$comments.${field}`, count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: maxSuggestions },
  { $project: { _id: 0, comment: '$_id' } }
]);
```
This runs entirely in the DB engine with no document transfer.

---

### Priority 3 — Longer Term

| Improvement | Benefit |
|---|---|
| Upgrade Render plan to a paid tier (or migrate to Railway/Fly.io) | Eliminates cold starts permanently |
| Add a Redis or in-memory cache layer for `/publication-ranges/active` and `/competencies` (near-static data) | Reduces DB load on high-traffic pages |
| Split AdminView, SecretariatView, RaterView into smaller sub-components | Improves code maintainability and React reconciliation speed |
| Add `GET /ratings` pagination | Prevents unbounded query growth |
| Add `createdAt` range filter to `GET /rating-logs` | Prevents full-collection scans on large audit logs |
| Move PDF parsing to a Web Worker | Keeps the UI thread responsive during heavy PDF parsing |

---

## 11. Known Issues & Areas for Improvement

| # | Issue | Severity |
|---|---|---|
| 1 | In-memory upload logs are wiped on server restart (Render restarts frequently) | High |
| 2 | No pagination on `/candidates`, `/candidates/by-publication`, `/ratings` | High |
| 3 | Production build ships unminified JS with source maps | High |
| 4 | N+1 DB queries in ratings submission loop | Medium |
| 5 | Comment suggestions fetches 1,000 full documents | Medium |
| 6 | No loading skeleton / progressive loading on large candidate lists | Medium |
| 7 | `vite.config.js` does not split lucide-react or jsPDF into separate chunks | Low |
| 8 | No automated tests (unit or integration) | Medium |
| 9 | No API response schema validation (e.g., Zod/Joi on request bodies) | Medium |
| 10 | JWT tokens have no explicit expiry configuration in the login route | Medium |
| 11 | `mongoose.connect()` called without connection pool settings (defaults) | Low |
| 12 | `Age` field recomputed on every `toJSON` — could be skipped if `age` is fresh | Low |

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