# Field Visit Tracker — Go-Live Build Specification

**Audience:** an AI coding agent (or a developer) building the production version.
**Goal:** rebuild the working prototype in this repository as a secure, deployable, production
system on **Next.js + NestJS + PostgreSQL**, keeping every behaviour, screen and rule the
prototype has today.

> Read this whole file before writing code. Where this file and the prototype disagree,
> **this file wins**. Where this file is silent, **copy the prototype's behaviour**.
> Never invent features that are not described here or present in the prototype.
> The product will keep growing: build the extension points in **§18** from Phase 1.

---

## 0. How to use this document

1. The prototype is the **behavioural reference**: the root of the repository
   https://github.com/ayazelahimullick12-droid/Field-Visit-Go-Live (paths below are relative to it).
   Run it (`npm install && npm run dev`, then open http://localhost:5173) and click through
   every screen before building. Its `README.md` explains the features in detail.
2. Key prototype files to study:

   | Area | Prototype file(s) |
   |---|---|
   | Design system (colours, components, motion, mobile) | `src/styles/brac.css` |
   | Shell (sidebar / bottom tab bar) | `src/lib/AppShell.jsx` |
   | Visit model, phases, office expansion for analytics | `src/lib/visits.js` |
   | Action item (complaint) statuses | `src/lib/complaints.js` |
   | Coverage / completeness / rating maths | `src/lib/offices.js` |
   | Complaint workflow, deadlines, reminders, likes/comments | `server/logic.js` |
   | Data upgrades (shows every historical shape) | `server/migrate.js` |
   | Visit registration, office pickers | `src/staff/visits/RegisterVisit.jsx`, `Places.jsx` |
   | Entry forms (action item, interaction, observation, story) | `src/staff/visits/EntrySheet.jsx` |
   | Visit page | `src/staff/visits/VisitHub.jsx` |
   | Staff app (dashboard, my action items, queue) | `src/staff/App.jsx`, `ComplaintPage.jsx`, `Stories.jsx` |
   | Management section | `src/staff/management/*` |
   | Analytics + maps | `src/staff/analytics/*`, `src/lib/InteractiveMap.jsx`, `src/lib/charts.jsx` |
   | Admin console | `src/admin/*` |
   | Public summary | `src/summary/*` |
   | Seed data / current data | `server/db.json` |
3. Follow **`BUILD_PLAN.md`** (in this repository) for the order of work, folder structure, conventions
   and change playbooks. It supersedes §16 of this file. Each phase ends with its acceptance checks passing.
4. Keep a `DECISIONS.md` in the new repo. Whenever you make a choice this spec leaves open,
   write it there in one line.

---

## 1. What the product is (one paragraph)

BRAC head-office staff register **field visits** to offices (Regional, Area and Branch Offices and
Village Organisations, VOs). During and after a visit they record four kinds of entries against
it: **action items** (problems to fix; called "complaints" in older data), **client interactions**
(client feedback with 1–5 star ratings), **observations**, and **stories** (social posts with
likes, comments and WhatsApp sharing). Action items are assigned by an **admin** to a **unit's
pool of fixers**, who start, fix or mark them long term, against a deadline with email reminders.
**Management** sees organisation-wide analytics (summary with drill-downs, office coverage, people,
analytics). Admins manage units, teams, employees, offices, rating questions and see an email log.
A **public summary** link shows a no-names snapshot. Field staff often work **offline**, so the
staff app must work without signal and sync later.

---

## 2. Technology stack

### 2.1 Decided by the product owner
- **Frontend:** Next.js (App Router, TypeScript, React).
- **Backend API:** NestJS (TypeScript).
- **Database:** PostgreSQL.

### 2.2 Additions you must use (and why)

| Need | Use | Why |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | One repo for web, api and shared code; cached builds |
| Language | **TypeScript `strict: true`** everywhere | Safety |
| ORM + migrations | **Prisma** | Typed queries, reliable migrations, seed scripts |
| Shared validation & types | **Zod** in `packages/shared`; **nestjs-zod** in the API | One schema validates the form, the request and the DB write |
| API contract | **@nestjs/swagger** → OpenAPI → **openapi-typescript** (or orval) client for the web | Typed client, never hand-written fetch types |
| Data fetching (web) | **TanStack Query** | Caching, retries, offline-friendly mutations |
| Forms | **React Hook Form + Zod resolver** | Field-level validation matching the API |
| Offline / PWA | **Serwist** (service worker for Next.js) + **Dexie** (IndexedDB) | App opens offline; visits and media queue on the device |
| Auth | **Argon2id** password hashing, **JWT access token (15 min) + rotating refresh token (30 days)** in `httpOnly; Secure; SameSite=Lax` cookies, **@nestjs/passport** guards | Real authentication replacing the prototype's plain-text passwords |
| Authorization | Role guards + per-record policy checks in Nest services | Roles: FIELD, FIXER, MANAGEMENT, ADMIN |
| File storage | **S3-compatible object storage** (AWS S3, Cloudflare R2, or self-hosted **MinIO**) with **presigned uploads** | Photos and voice notes must not live in the DB |
| Background jobs | **pg-boss** (Postgres-backed queue) | Deadline reminders, email sending, cleanup; no extra Redis to run |
| Email | **Nodemailer** over SMTP to a provider (**Amazon SES**, SendGrid/Postmark, or Google Workspace SMTP relay) | Real delivery; keep the email log |
| Security middleware | **helmet**, **@nestjs/throttler** (rate limits), strict CORS, CSRF protection for cookie auth | Baseline web security |
| Logging | **nestjs-pino** (JSON logs), request IDs | Debuggable production |
| Errors / monitoring | **Sentry** (web + api), uptime check on `/health` | Know when it breaks |
| Charts / maps | Port the prototype's **dependency-free SVG charts** and **d3-geo** map with the bundled GeoJSON | Already built, offline-capable, no map tiles |
| Testing | **Vitest** (shared + web units), **Jest + Supertest** (Nest e2e against a test Postgres), **Playwright** (browser e2e, incl. mobile viewport and offline mode) | Confidence for go-live |
| Containers | **Docker** (multi-stage) for web and api; **docker compose** for local dev (postgres, minio, mailpit) | Same build everywhere |
| CI/CD | **GitHub Actions**: lint → typecheck → test → build images → migrate → deploy | Repeatable releases |
| Reverse proxy (self-host) | **Caddy** (automatic HTTPS) | HTTPS is required for camera, microphone and service workers |

Use the latest stable major versions at build time. Pin exact versions in lockfiles.

### 2.3 Architecture

```
Browser (Next.js PWA)  ──/api/* (same origin, Next rewrites)──▶  NestJS API  ──▶  PostgreSQL
        │                                                          │  ├─▶ S3 / MinIO (media)
        └─ IndexedDB (Dexie): visit cache, outbox, media blobs     │  ├─▶ pg-boss jobs (reminders, email)
                                                                   │  └─▶ SMTP provider
```

- The web app calls the API **through the same origin** (`/api/*` rewritten by Next.js to the Nest
  service), so cookies are first-party and CORS stays closed.
- The staff, admin and management UIs are **client-rendered** pages inside Next.js (they must work
  offline); the public summary and the login page may be server-rendered.
- All business rules live in the **API**. The web app may duplicate a rule only for instant
  feedback, imported from `packages/shared` so both sides use the same code.

---

## 3. Repository layout

```
field-visit-tracker/
├─ apps/
│  ├─ web/                 Next.js (App Router)
│  │  ├─ app/
│  │  │  ├─ (public)/login, (public)/summary
│  │  │  ├─ (staff)/dashboard, visits, visits/[id], visits/new, visits/[id]/edit,
│  │  │  │          action-items, action-items/[id], queue, stories/[id],
│  │  │  │          management/{summary,offices,people,people/[id],analytics}, branches/[officeId]
│  │  │  └─ (admin)/admin/{action-items,network,units,employees,offices,questions,emails}
│  │  ├─ components/       ported UI components
│  │  ├─ styles/brac.css   ported design system (keep class names)
│  │  ├─ lib/offline/      Dexie db, outbox, sync engine
│  │  └─ public/geo/       bd-divisions / bd-districts GeoJSON
│  └─ api/                 NestJS
│     ├─ src/modules/{auth,users,units,offices,settings,visits,entries,action-items,
│     │               stories,media,analytics,public,notifications,admin,health}
│     └─ prisma/schema.prisma, prisma/migrations, prisma/seed.ts
├─ packages/
│  ├─ shared/              zod schemas, enums, constants, pure business functions
│  └─ config/              eslint, tsconfig, prettier presets
├─ infra/                  docker-compose.yml, Caddyfile, deploy scripts
├─ scripts/migrate-from-prototype.ts
└─ DECISIONS.md, README.md
```

---

## 4. Domain vocabulary (use exactly these words in the UI)

| Concept | UI wording | Notes |
|---|---|---|
| Complaint | **Action item** (plural: Action items) | Code/DB may say `actionItem`; never show "complaint" in the UI |
| Person who raised an action item | **Raised by** | BRAC staff or Client |
| Stored `department` of an action item | **Unit** | Routing unit, e.g. Software, Finance |
| Sub-group of a unit | **Team** | Optional on an action item |
| Employee's department | **Department** | e.g. Microfinance (different from Unit) |
| Fixer's list | **Action item queue** | |
| Region office | **Regional Office** | Named `<District> Region Office` in seed data |
| Area office | **Area Office** | Named `<Area name> Office` |
| Branch | **Branch Office** | From the office master list |
| Village organisation | **VO** | Typed code under a branch, e.g. `VO-142` |
| Middle location level | **District** | Prototype stores it as `region` |

Writing style for all UI text: short, professional, sentence case, no slang, no "you're going",
no "Tap". Required fields marked `*`; optional fields labelled "(optional)".

---

## 5. Data model (PostgreSQL via Prisma)

Implement this schema (adjust names to Prisma conventions; keep every field). All timestamps are
`timestamptz` in UTC; display in **Asia/Dhaka**. IDs are UUIDv7 generated **on the client** for
offline-created records (visits, entries, media) and on the server otherwise. Every user-facing
record also has a short human **code** (see §5.3).

> The schema below is a **specification sketch**: some short models are written on one line to save
> space. In `schema.prisma` write one field per line, add the missing relation fields Prisma requires,
> and keep every field, enum, unique constraint and index shown here.

```prisma
enum Role { FIELD FIXER MANAGEMENT ADMIN }
enum UserStatus { PENDING ACTIVE DISABLED }
enum OfficeType { REGION_OFFICE AREA_OFFICE BRANCH }
enum VisitStatus { OPEN DONE }
enum EntryState { DRAFT SUBMITTED }
enum Urgency { LOW MEDIUM HIGH }
enum RaisedBySource { STAFF CLIENT }
enum ActionItemStatus { WAITING ASSIGNED IN_PROGRESS FIXED LONG_TERM }
enum MediaKind { PHOTO VOICE }
enum EmailType { ASSIGNMENT REMINDER EXTENSION OTHER }
enum EmailStatus { QUEUED SENT FAILED }

model User {
  id            String     @id @db.Uuid
  name          String
  designation   String?            // e.g. Deputy Manager
  department    String?            // e.g. Microfinance (employee's department, NOT the routing unit)
  pin           String     @unique // 4–8 digits, login key, unique across all users
  email         String?    @unique
  phone         String?
  passwordHash  String
  roles         Role[]             // FIELD is implied for staff; ADMIN users use the admin console
  status        UserStatus @default(ACTIVE)
  unitId        String?    @db.Uuid  // routing unit (required when FIXER)
  unit          Unit?      @relation(fields: [unitId], references: [id])
  supervisorId  String?    @db.Uuid  // must be a MANAGEMENT user
  supervisor    User?      @relation("Supervisor", fields: [supervisorId], references: [id])
  reports       User[]     @relation("Supervisor")
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
  lastLoginAt   DateTime?
}

model RefreshToken { id String @id @db.Uuid  userId String @db.Uuid  tokenHash String  expiresAt DateTime  revokedAt DateTime?  createdAt DateTime @default(now())  userAgent String? }

model Unit { id String @id @db.Uuid  name String @unique  teams Team[]  users User[]  createdAt DateTime @default(now()) }
model Team { id String @id @db.Uuid  unitId String @db.Uuid  unit Unit @relation(fields: [unitId], references: [id])  name String  @@unique([unitId, name]) }

model Office {
  id        String     @id @db.Uuid
  type      OfficeType
  name      String               // "Mirpur Branch", "Dhaka Region Office", "Gulshan Area Office"
  division  String               // "Dhaka Division"
  district  String               // "Dhaka"
  area      String?              // "Gulshan Area" (null for REGION_OFFICE)
  lat       Float?
  lng       Float?
  active    Boolean    @default(true)   // retired offices keep history, leave coverage
  @@unique([type, district, name])
  @@index([division, district, area])
}

model Vo { id String @id @db.Uuid  code String  branchId String @db.Uuid  @@unique([branchId, code]) } // created on first use

model Settings { id Int @id @default(1)  visitTargetDays Int @default(90) }
model RatingQuestion { id String @id @db.Uuid  text String  active Boolean @default(true)  sortOrder Int }

model Visit {
  id          String      @id @db.Uuid
  code        String      @unique          // V-XXXXXX
  employeeId  String      @db.Uuid
  division    String
  district    String
  area        String
  reason      String                         // Onboarding | Monitoring | Training | Action item resolution | Survey | Other
  reasonOther String?
  date        DateTime    @db.Date           // visit date (required)
  startTime   String?                         // "HH:mm" optional
  returnDate  DateTime?   @db.Date
  returnTime  String?
  status      VisitStatus @default(OPEN)
  doneAt      DateTime?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  clientUpdatedAt DateTime?                   // last change time on the device (sync ordering)
  offices     VisitOffice[]
  stays       Stay[]
  actionItems ActionItem[]
  interactions ClientInteraction[]
  observations Observation[]
  stories     Story[]
  @@index([employeeId, date])
  @@index([division, district, area, date])
}

model VisitOffice { id String @id @db.Uuid  visitId String @db.Uuid  officeId String? @db.Uuid  voId String? @db.Uuid  @@unique([visitId, officeId, voId]) } // planned stops; exactly one of officeId/voId (CHECK)

model Stay { id String @id @db.Uuid  visitId String @db.Uuid  type String  name String  checkIn DateTime @db.Date  checkOut DateTime @db.Date  notes String? }
// type: BRAC Learning Centre (BLC) | Hotel | Guest house | BRAC office | Other

model EntryOffice { id String @id @db.Uuid  entryType String /* ACTION_ITEM|INTERACTION|OBSERVATION */  entryId String @db.Uuid  officeId String? @db.Uuid  voId String? @db.Uuid  @@index([officeId]) @@index([entryType, entryId]) } // exactly one of officeId/voId (CHECK); a VO row implies its branch
// Which office(s) an entry is about (see rules in §6.4).

model ActionItem {
  id            String           @id @db.Uuid
  code          String           @unique      // FC-XXXXXX (keep prefix for continuity)
  visitId       String           @db.Uuid
  state         EntryState       @default(DRAFT)
  submittedAt   DateTime?
  title         String                          // required to submit
  description   String?                         // description OR voice note required
  voiceId       String?          @db.Uuid
  photoId       String?          @db.Uuid
  urgency       Urgency          @default(MEDIUM)
  unitId        String?          @db.Uuid       // null = "Undefined" (admin chooses the unit)
  teamId        String?          @db.Uuid       // optional
  source        RaisedBySource   @default(STAFF)
  raisedBy      Json?                           // STAFF: {name,pin,designation,department,contact}; CLIENT: {name,phone,memberNumber,voCode,branchCode,projectCode}
  consent       Boolean          @default(true) // consent to follow-up contact
  status        ActionItemStatus?               // null while DRAFT; WAITING on submit
  assignedUnitId String?         @db.Uuid
  assignedAt    DateTime?
  deadline      DateTime?
  deadlineSetAt DateTime?
  deadlineDays  Int?
  reminderSentAt DateTime?
  startedAt     DateTime?    startedById  String? @db.Uuid
  longTermAt    DateTime?    longTermById String? @db.Uuid  longTermNote String?
  fixedAt       DateTime?    fixedById    String? @db.Uuid  resolutionNote String?  resolutionPhotoId String? @db.Uuid
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  events        ActionItemEvent[]
  deadlines     ActionItemDeadline[]
  @@index([status, assignedUnitId])
  @@index([visitId])
}
model ActionItemEvent { id String @id @db.Uuid  actionItemId String @db.Uuid  label String  actorId String? @db.Uuid  at DateTime @default(now()) } // the timeline
model ActionItemDeadline { id String @id @db.Uuid  actionItemId String @db.Uuid  deadline DateTime  days Int  kind String /* initial|extension */  setAt DateTime  setById String? @db.Uuid }

model ClientInteraction {
  id String @id @db.Uuid  code String @unique /* CI- */  visitId String @db.Uuid
  state EntryState @default(DRAFT)  submittedAt DateTime?
  description String?  voiceId String? @db.Uuid  photoId String? @db.Uuid
  client Json?                       // {name,phone,memberNumber,voCode,branchCode,projectCode}
  ratings InteractionRating[]
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
}
model InteractionRating { id String @id @db.Uuid  interactionId String @db.Uuid  questionId String @db.Uuid  questionText String /* wording at the time */  stars Int /* 1..5 */ }

model Observation {
  id String @id @db.Uuid  code String @unique /* OB- */  visitId String @db.Uuid
  state EntryState @default(DRAFT)  submittedAt DateTime?
  description String?  voiceId String? @db.Uuid  photoId String? @db.Uuid
  referredByStaff Boolean @default(false)
  staff Json?                        // {name,pin,designation,department,contact} when referredByStaff
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
}

model Story {
  id String @id @db.Uuid  code String @unique /* ST- */  visitId String @db.Uuid
  state EntryState @default(DRAFT)  submittedAt DateTime?
  title String  description String  photoId String? @db.Uuid  locationText String?
  likes StoryLike[]  comments StoryComment[]
  legacyLikeCount Int @default(0)    // likes imported from the prototype (no user attached)
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
}
model StoryLike { storyId String @db.Uuid  userId String @db.Uuid  createdAt DateTime @default(now())  @@id([storyId, userId]) }
model StoryComment { id String @id @db.Uuid  storyId String @db.Uuid  userId String @db.Uuid  text String /* max 600 */  createdAt DateTime @default(now())  deletedAt DateTime? }

model Media { id String @id @db.Uuid  kind MediaKind  storageKey String  mime String  bytes Int  durationSec Int?  uploadedById String @db.Uuid  createdAt DateTime @default(now())  attachedAt DateTime? }

model EmailLog { id String @id @db.Uuid  type EmailType  actionItemId String? @db.Uuid  toEmail String?  toName String?  subject String  body String  status EmailStatus @default(QUEUED)  providerMessageId String?  error String?  createdAt DateTime @default(now())  sentAt DateTime? }

model AuditLog { id String @id @db.Uuid  actorId String? @db.Uuid  action String  entity String  entityId String?  data Json?  ip String?  at DateTime @default(now()) }
```

### 5.1 Database rules
- Foreign keys with `onDelete: Cascade` from Visit to its offices, stays and entries (a visit can be
  deleted until DONE, §6.2), and from entries to their events, ratings, likes and comments.
- Postgres `CHECK` constraints: stars 1–5; `deadlineDays` 1–60; PIN `^\d{4,8}$`.
- Partial indexes: `ActionItem(status) WHERE state='SUBMITTED'`; `Story(submittedAt) WHERE state='SUBMITTED'`.
- Soft delete is **not** used except comments; deletions are hard deletes recorded in `AuditLog`.

### 5.2 Seed data
Port from `server/db.json`: units and teams (Software, Construction, HR, Finance, Operations,
Legal with their teams), the 78 branch offices (with lat/lng), the 4 rating questions, settings
(`visitTargetDays: 90`). **Generate** one Regional Office per district (`<District> Region Office`)
and one Area Office per area (`<Area> Office`) from the branch hierarchy. Demo users only in
development/staging seeds, never in production.

### 5.3 Codes
`V-`, `FC-`, `CI-`, `OB-`, `ST-` followed by 6 random uppercase base-36 characters, unique per
table, generated on the client for offline records and validated/regenerated by the server on
collision. Migrated records keep their prototype codes.

---

## 6. Business rules (implement in the API; mirror in `packages/shared`)

### 6.1 Users, sign-in and roles
- Sign-in with **PIN + password** for everyone (one login page with a **User / Admin** switch;
  the Admin tab only accepts users with role ADMIN). **The PIN field is visible text**
  (`type="text" inputmode="numeric"`); the password is masked.
- Self-registration (staff tab) collects: name, designation, department, PIN, email, phone,
  password + confirmation. PIN must be unique; email unique. New accounts get role FIELD.
  **Default for production: status PENDING until an admin approves** (record in DECISIONS.md if
  the owner prefers instant activation).
- Roles stack: a user can be FIELD + FIXER + MANAGEMENT. FIXER requires `unitId`. Any number of
  fixers per unit. Supervisors are MANAGEMENT users (kept for org structure; no escalations).
- Admins manage users (create, edit, set roles, unit, supervisor, reset password, disable,
  approve) and admin accounts.
- Password policy: minimum 8 characters; lockout for 15 minutes after 10 failed attempts per PIN;
  rate limit login by IP. Passwords are never returned by any endpoint.

### 6.2 Visits
- **Register:** required = Division, District, Area (from the office master list) and visit date.
  Optional = offices to be visited, start time, return date, return time, accommodation (stays).
  Purpose required (list above; "Other" requires `reasonOther`).
- **Offices to be visited** (planned stops): three multi-select lists side by side:
  - Regional Offices = all REGION_OFFICE in the visit's **division**;
  - Area Offices = all AREA_OFFICE in the visit's **district**;
  - Branch Offices = all BRANCH in the visit's **area**;
  - under each chosen branch, **VO codes** can be typed (several; normalised to upper case,
    spaces → `-`). Removing a branch removes its VOs.
  - Changing the area keeps regional offices in the same division, area offices in the same
    district, and drops branches/VOs not in the new area.
- **Phase** (display): `done` if status DONE; `upcoming` if start is in the future; `due` if the
  return date/time has passed and not done ("Not marked done"); otherwise `progress`.
- **Mark as done:** needs visit date and return date (return ≥ visit date). Offers to submit the
  drafts that are ready; incomplete drafts stay unsubmitted. After DONE, nothing on the visit can
  change (API returns 409).
- **Delete:** allowed at any time **until DONE**, by the visit's owner, with everything on it
  (including submitted entries). Confirmation states how many submitted entries and action items
  will be lost. Write an AuditLog row with a snapshot.
- Only the owner edits a visit. Management and admins can view any visit read-only.

### 6.3 Entries (all four types)
- Each entry belongs to one visit, starts as DRAFT, autosaves, and is **SUBMITTED** on its own
  (with confirmation). Submitted entries are **locked** forever (the server ignores later client
  changes to them and refuses deletion).
- Drafts are visible only to their author (management sees a draft count, read-only, when viewing
  a visit, labelled "Draft · not submitted yet").
- A voice note counts as a description. Voice notes: browser `MediaRecorder`, max 5 minutes.
  Photos: resized on the client to max 1000 px, JPEG ~72 %, before upload.

### 6.4 Entry-specific rules
| Type | Required to submit | Office rule | Other fields |
|---|---|---|---|
| **Action item** | title, description *or* voice, unit (or "Undefined") | **exactly one** office: a Regional, Area **or** Branch Office; if a branch, **optionally one VO** under it | urgency (default Medium), photo, team (optional), Raised by (BRAC staff / Client + details, optional), consent checkbox (default on) |
| **Client interaction** | description/voice **or** at least one rating | one or more **Branch Offices or VOs only** | ratings for every active rating question (each 1–5, skippable), client details, photo |
| **Observation** | description, voice or photo | one or more offices (any type, VOs under branches) | photo, **"Referred by BRAC staff"** checkbox + staff details |
| **Story** | title, description | none — **typed location text** | picture (optional) |

- Offices offered in entry forms are limited to the **visit's area** lists (same three lists as
  §6.2). The area itself is changed only via the visit's **Change** button.
- Rating answers store the question wording at the time (`questionText`), so rewording a question
  never changes old answers. Questions with answers can be switched off, not deleted.
- Form layout: bordered, titled sections; a header strip "For visit <area> · <date> · <code>";
  photos sit **with the description**, never inside the person-details section; the information
  note sits **last**.

### 6.5 Action item workflow
Statuses: **Waiting → Assigned → In Progress → Fixed**, or **Long Term** from Assigned/In Progress
(Long Term can later become Fixed).

| Transition | Who | Effect |
|---|---|---|
| submit | author | status WAITING, event "Action item submitted" |
| assign | ADMIN | requires the unit (admin picks it if "Undefined", optional team); sets assignedUnitId, deadlineDays (1–60), deadline = now + days, status ASSIGNED; emails **every fixer of the unit**; event |
| start work | any FIXER of the assigned unit | ASSIGNED → IN_PROGRESS, startedAt/By, event |
| mark long term | any fixer of the unit | ASSIGNED/IN_PROGRESS → LONG_TERM, optional reason note, event; no more reminders |
| mark fixed | any fixer of the unit | ASSIGNED/IN_PROGRESS/LONG_TERM → FIXED, optional **action-taken note** and **photo**, fixedAt/By, event |
| extend deadline | ADMIN | ASSIGNED/IN_PROGRESS only; new deadline = now + days; deadline history row; resets reminder; emails the unit's fixers |

- The unit's fixer pool is **live**: a fixer added later sees the unit's items; the queue shows
  items whose `assignedUnitId` = the user's unit.
- **Reminder:** one email to every fixer of the unit, 24 h before the deadline (48 h if more than
  2 days were given), only while ASSIGNED/IN_PROGRESS. Implement as a pg-boss scheduled job per
  item (re-scheduled on extension) plus a 5-minute sweep for safety.
- **There are no escalations.** A missed deadline only shows as **"Past deadline"** to admin,
  fixers and management.
- **On time** = fixed at or before the latest deadline.
- The resolution (who fixed it, when, note, photo) is shown everywhere the item appears.

### 6.6 Stories
- Feed of all submitted stories, newest first: photo (or gradient), title, first ~30 words,
  location text, author and date.
- **Like:** one per user (toggle). **Comment:** any signed-in user, max 600 chars, shown with
  author and time. Authors and admins may delete a comment (soft delete).
- **Share:** "Share on WhatsApp" opens `https://wa.me/?text=<title>%0A<link>`; the link is
  `/stories/<id>` and **requires sign-in**; after sign-in the user lands on that story.

### 6.7 Analytics definitions (must match exactly)
- **Office visits** ("expanded records"): one record per (visit, office) for the planned offices of
  DONE visits plus every office named by a submitted entry. An entry naming several offices counts
  at each.
- **Coverage:** an active BRANCH is *on track* if its latest office visit is within
  `visitTargetDays`, *overdue* if older, *never visited* if none. Coverage % = on track ÷ active
  branches. Not affected by the time filter.
- **Information completeness** of an office visit = average of 5 equal checks: registered (office,
  date, reason), observation recorded, client interaction with a rating, anything recorded at that
  office, description/voice/photo captured on any observation/interaction/action item.
- **Average client rating:** per interaction, the mean of its stars; then the mean of those.
- **Fix rate:** fixed ÷ filed (filed in period). **Fixed on time %:** of items fixed in period.
  **Average days to fix:** submittedAt → fixedAt for items fixed in period.
- **Period comparison:** the same-length period immediately before (last month for "This month",
  last year for "This year"; none for "All time").

---

## 7. Screens (port the prototype's look and behaviour)

Port `src/styles/brac.css` as the global stylesheet and keep its class names so the prototype's
markup translates directly. Fonts: Helvetica Neue stack. Light/dark mode toggle (per device).
Desktop: left sidebar. Phone (< 900 px): top bar + bottom tab bar with a raised "New visit"
button; tables become cards; dialogs become sheets. Respect `prefers-reduced-motion`. No
horizontal page scroll at 375 px.

### 7.1 Public
- **Login** (`/login`): User / Admin switch, PIN (visible) + password, registration form on the
  User tab, forwards to the right app.
- **Public summary** (`/summary`, no sign-in): last 30 days snapshot of the Summary tiles and the
  monthly trend; **no filters, no clickable drill-downs, no "Needs attention", no names or
  contact details**. Served from a cached aggregate endpoint (§8).

### 7.2 Staff app (FIELD; extra tabs for FIXER and MANAGEMENT)
Navigation: Dashboard · Visits · My action items · Management (MANAGEMENT) · Action item queue
(FIXER, badge = items needing action). Ctrl/⌘ + K quick search (pages, visits; for management also
people and branches).

1. **Dashboard:** greeting hero (name, roles, designation, phone, PIN; "Register a visit");
   hero tiles Total visits · This month · Offices visited; **Your overview** (Action items, Client
   interactions, Observations, Stories; "Show more" adds visits this month, visits today, open and
   fixed action items) **before** **Your visits** (4 most relevant visit cards + sync pill);
   **Story feed** (4, "Show more").
2. **Visits:** grouped visit cards (needs attention / in progress / upcoming / done).
3. **Register / Change visit:** sections Visit location · Offices to be visited · Purpose of visit ·
   Schedule · Accommodation (optional). Delete visit link while not DONE.
4. **Visit page:** header (phase, code, title, purpose · date · duration), sync pill, **Delete
   visit**, **Mark as done**. A framed **"Visit record"** panel containing the **Visit details**
   card (offices, path, schedule, stays, **Change**) and a **"Records for this visit"** box with the
   four tiles (Action item, Client interaction, Observation, Story; counts of drafts/submitted;
   "+" to add). Selecting a tile lists drafts then submitted entries; selecting an entry opens the
   form (draft) or read-only view (submitted).
5. **Entry forms / views:** §6.3–6.4.
6. **My action items:** search; filter chips with counts (All, Drafts, Waiting, Assigned, In
   Progress, Long Term, Fixed); groups in that order with headings and counts; fixed group shows 6
   then "Show all". **Tile = code, status, title, first 100 words of description.** Selecting
   opens the **action item page**.
7. **Action item page** (`/action-items/[id]`): code, status, past-deadline flag, title, urgency,
   unit · team, status explanation; fixer actions (Start work, Mark fixed, Mark long term) for
   fixers of the unit; Description (text, voice player, photo); Long-term note; Resolution;
   Timeline; Details (office, visit link, filed by/date, assigned to, deadline, work started);
   Raised by (with consent flag).
8. **Action item queue** (FIXER): title "<Unit> action items", teammates listed, score cards
   (Assigned, Action required, Long term, Fixed), groups Action required (past deadline first,
   then soonest deadline) · Long term · Fixed, using the same tiles.
9. **Management** (sub-tabs): **Summary · Offices · People · Analytics**.
   - **Summary:** filters — time (Last 30 days, Last 90 days, This month, This year, All time,
     Custom range), location (Division → District → Area → Branch), staff Department; one-line
     narrative; 19 clickable tiles in 4 sections (Field activity: Visits, Offices reached, Active
     staff, Visits marked done; Network coverage: Coverage, Never visited, Overdue; Information
     gathered: Info completeness, Avg client rating, Client interactions, Observations, Stories;
     Action item handling: Action items filed, Fix rate, Fixed on time, Avg days to fix, Waiting
     for assignment, Past deadline, Long term) with deltas; **Needs attention** list (clickable);
     12-month trend (visits, filed, fixed). Each tile opens a **breakdown dialog**: definition,
     trends, splits by location level and staff department, metric-specific charts and the
     underlying records table (see prototype `Summary.jsx` `Drill` for the exact panels).
     "Copy public link" button.
   - **Offices:** coverage map with filters + needs-attention list; tiles of visits per office
     type; table of every office (type, status, visits, staff, recorded counts, rating, open action
     items, last visit), status and type chips, search, sort, CSV export; expandable rows listing
     visits with links to person and visit; Branch 360° link.
   - **People:** directory (designation, department, PIN, visits, offices, entries, completeness,
     rating, last visit) with search, role chips, department filter, sort, CSV; **person profile**
     (contact details, KPIs, visits, places visited, everything recorded, read-only visit view).
   - **Analytics:** Visits tab (density map, by division/district, over time, purpose mix,
     completeness) and Action items tab (funnel, age of open items, by unit, on-time fixes by
     unit, status by unit, urgency, by team).
   - **Branch 360°** (`/branches/[officeId]`): status, locator map, KPIs, visit history, rating
     trend, action items raised there.

### 7.3 Admin console (ADMIN)
Tabs: **Action items** (KPIs; sections Waiting for assignment · Past deadline · Assigned / in
progress · Long term · Fixed; search; urgency filter; detail dialog with journey strip, assign
form with fixer-pool preview, extend-deadline form, resolution, timeline) · **Network health**
(coverage) · **Units** (units + teams, fixers per unit, counts) · **Employees** (CRUD incl.
designation, department, roles, unit, supervisor, approval; **Admin accounts**) · **Offices**
(master list CRUD, retire, CSV import/export `Branch, Area, District, Division, Latitude,
Longitude, Active`, visit target days) · **Client questions** (add, reword, reorder, switch off)
· **Sent emails** (log with type filter and status).

---

## 8. API (NestJS, REST, JSON, prefix `/api/v1` — see §18.4)

All endpoints validate input with the shared Zod schemas and return typed DTOs documented in
OpenAPI. Errors: `{ statusCode, error, message, details? }`. Pagination: `?cursor&limit` (max 100).

| Area | Endpoints | Access |
|---|---|---|
| Auth | `POST /auth/login` (pin, password, mode user/admin) · `POST /auth/refresh` · `POST /auth/logout` · `POST /auth/register` · `GET /auth/me` | public / self |
| Reference | `GET /reference` (units+teams, offices, rating questions, settings) with ETag | signed in |
| Visits | `GET /visits?mine=1` · `GET /visits/:id` · **`PUT /visits/:id`** (offline-safe aggregate upsert, §9) · `POST /visits/:id/done` · `DELETE /visits/:id` | owner (write); MANAGEMENT/ADMIN read |
| Media | `POST /media/presign` (kind, mime, bytes) → `{id, uploadUrl}` · `POST /media/:id/complete` · `GET /media/:id` (302 to signed URL, permission-checked) | signed in |
| Action items | `GET /action-items?scope=mine|queue|all&status&q` · `GET /action-items/:id` · `POST /action-items/:id/assign` · `/start` · `/long-term` · `/fix` · `/extend` | per §6.5 |
| Stories | `GET /stories?cursor` · `GET /stories/:id` · `POST /stories/:id/like` (toggle) · `POST /stories/:id/comments` · `DELETE /comments/:id` | signed in |
| Management | `GET /analytics/summary?from&to&division&district&area&branch&dept` · `GET /analytics/drill/:metric?...` · `GET /analytics/offices?...` · `GET /analytics/people?...` · `GET /analytics/people/:id?...` · `GET /analytics/visits?...` · `GET /analytics/action-items?...` · `GET /branches/:officeId` | MANAGEMENT, ADMIN |
| Public | `GET /public/summary` (last 30 days, aggregates only, no names; cached 5 min) | public |
| Admin | CRUD `/admin/users`, `/admin/units`, `/admin/teams`, `/admin/offices` (+ `/import`, `/export`), `/admin/questions`, `PUT /admin/settings`, `GET /admin/emails` | ADMIN |
| Ops | `GET /health` (db, storage, queue) · `GET /version` | public |

**Analytics must be computed in SQL on the server** (the prototype computes in the browser from all
visits, which will not scale). Use indexed queries; add materialised views refreshed every 5–15
minutes if p95 exceeds 800 ms at 100k visits. Every analytics endpoint applies the same filter
object (time range, location, department).

---

## 9. Offline-first requirements (staff app)

- The app shell, fonts, icons, GeoJSON and the last `/reference` response are cached by the
  service worker / IndexedDB so the app opens and forms work without signal after one online
  session.
- **Visits are owned by the device until synced.** All edits to the user's own visits (including
  drafts and submissions) are written to Dexie first, shown instantly, and appended to an
  **outbox**. The outbox flushes when online and every 20 s while non-empty. A sync pill shows
  "All changes sent" or "Saved on this device · sends when online".
- Media blobs are stored in IndexedDB and uploaded (presign → PUT → complete) **before** the visit
  that references them is synced; the visit payload then carries media IDs.
- `PUT /visits/:id` accepts the whole visit aggregate with an `Idempotency-Key` header and the
  device's `clientUpdatedAt`. Server rules (port `mergeVisit` from `server/logic.js`):
  1. If the stored visit is DONE → 409 with the stored visit (client replaces its copy).
  2. Submitted entries already on the server are kept as stored (client copies ignored) and can't
     be removed; newly submitted entries are stamped (`submittedAt`, status WAITING, event).
  3. Drafts are replaced by the client's drafts.
  4. Return the canonical visit; the client overwrites its cache with it.
- Things that need the server (first sign-in, fixer actions, likes, comments, analytics) show a
  clear "No connection" message offline.
- Microphone, camera and service worker require **HTTPS** in every non-local environment.

---

## 10. Security and privacy

- HTTPS only (HSTS). Cookies `httpOnly; Secure; SameSite=Lax`. CSRF token (double-submit) on all
  state-changing requests.
- Authorization on **every** endpoint: role guard + ownership/unit policy in the service layer.
  Write e2e tests that prove a FIELD user cannot read another user's drafts, a fixer cannot act on
  another unit's items, and non-management users get 403 on analytics.
- Personal data (client names, phone numbers, member numbers, staff PINs) appears only to roles
  that need it; never in the public summary, logs or error reports (configure Sentry scrubbing).
- Media served only through permission-checked short-lived signed URLs (5 min).
- Upload limits: photos ≤ 5 MB, voice ≤ 10 MB / 5 min; allow-list MIME types.
- Rate limits: login 10/min per IP; writes 120/min per user; public summary 60/min per IP.
- AuditLog for: sign-in/out, failed logins, role changes, approvals, assignment, status changes,
  deadline extensions, visit deletion, office edits, settings changes.
- Secrets only from environment variables / the host's secret store; never committed.
- Database: least-privilege app user; nightly backups + point-in-time recovery; restore tested
  before go-live.
- Data retention: keep visits and action items indefinitely unless the owner sets a policy (record
  in DECISIONS.md); delete orphaned media (uploaded, never attached) after 7 days via a job.

---

## 11. Notifications

- Emails are rendered from templates (assignment, reminder, extension) and **sent** through the
  SMTP provider by a pg-boss worker with retries (exponential backoff, 5 attempts). Every email is
  written to `EmailLog` with status QUEUED → SENT/FAILED; the admin "Sent emails" tab reads it.
- Sender: a no-reply address on the owner's domain with SPF, DKIM and DMARC configured.
- In development use **Mailpit** (captures mail locally).

---

## 12. Data migration from the prototype

Write `scripts/migrate-from-prototype.ts` that reads `server/db.json` and loads Postgres
idempotently (safe to re-run):
- employees → User (hash existing passwords with Argon2id; flag `mustChangePassword` if desired),
  adminUsers → User with role ADMIN; departments → Unit, units → Team; offices → Office (branches),
  then generate Regional/Area Offices; settings and rating questions.
- visits → Visit (+ VisitOffice from `stops`, Stay from `stays`); entries by type; `places` /
  `place` → EntryOffice (VO names `VO-142 · Mirpur Branch` → Vo rows); complaint fields →
  ActionItem (status mapping already done in data: Waiting/Assigned/In Progress/Fixed/Long Term;
  map older `Open`→WAITING, `Resolved`→FIXED); `log` → ActionItemEvent; `deadlineHistory` →
  ActionItemDeadline; story `likes` count → `legacyLikeCount`, `likedBy` → StoryLike, comments →
  StoryComment.
- Base64 photos (`photoUrl` data URLs) and `server/uploads/*` voice files → upload to object
  storage → Media rows → link.
- emailLog → EmailLog (status SENT, historical).
- Print a reconciliation report (counts per table, prototype vs Postgres) and fail on mismatch.

---

## 13. Non-functional requirements

- **Performance:** first load ≤ 3 s on a mid-range Android phone over 3G for the staff app shell;
  API p95 ≤ 300 ms for CRUD, ≤ 800 ms for analytics at 100k visits / 50k action items.
- **Accessibility:** WCAG 2.1 AA (labels, focus states, keyboard navigation, colour contrast in
  light and dark mode).
- **Browsers:** latest Chrome/Edge/Firefox/Safari; Android Chrome 100+; iOS Safari 16+.
- **Time zone:** store UTC, display Asia/Dhaka; "today" and month boundaries computed in
  Asia/Dhaka.
- **Language:** English UI with all strings in one messages file (so Bangla can be added later
  with next-intl without code changes).
- **Responsiveness:** verified at 375 px, 768 px, 1280 px.

---

## 14. Environments, deployment and operations

### 14.1 Environments
`local` (docker compose: postgres, minio, mailpit) → `staging` (production-like, seeded demo data)
→ `production`. Each has its own database, bucket, secrets and domain.

### 14.2 Environment variables (minimum)
```
# api
DATABASE_URL=postgresql://app:***@db:5432/fvt
JWT_ACCESS_SECRET=***            JWT_REFRESH_SECRET=***
COOKIE_DOMAIN=fvt.example.org    APP_ORIGIN=https://fvt.example.org
S3_ENDPOINT=...  S3_REGION=...  S3_BUCKET=...  S3_ACCESS_KEY=***  S3_SECRET_KEY=***
SMTP_HOST=...  SMTP_PORT=587  SMTP_USER=***  SMTP_PASS=***  MAIL_FROM="Field Visit Tracker <no-reply@example.org>"
SENTRY_DSN=...  LOG_LEVEL=info  TZ_DISPLAY=Asia/Dhaka
# web
API_INTERNAL_URL=http://api:4000   NEXT_PUBLIC_SENTRY_DSN=...   NEXT_PUBLIC_APP_NAME="Field Visit Tracker"
```

### 14.3 Deployment options (owner chooses; record in DECISIONS.md)
- **A. Self-hosted (recommended if data must stay on BRAC-controlled servers):** one Linux VM
  (4 vCPU, 8 GB RAM, 100 GB SSD to start) running docker compose: `caddy` (HTTPS), `web`, `api`,
  `worker` (pg-boss), `postgres` (or a managed Postgres), `minio`; nightly `pg_dump` + WAL archiving
  to off-site storage; MinIO bucket replication or backup.
- **B. Managed cloud:** Next.js on Vercel (or a container host), NestJS + worker on
  Render/Fly.io/AWS ECS, managed Postgres (Neon, Supabase, AWS RDS) with PITR, Cloudflare R2 or S3,
  Amazon SES. Choose a region near Bangladesh (e.g. Singapore or Mumbai).

### 14.4 CI/CD (GitHub Actions)
On PR: install → lint → typecheck → unit tests → API e2e (Postgres service container) →
Playwright e2e (against docker compose) → build. On merge to `main`: build and push images →
deploy to staging → `prisma migrate deploy` → smoke tests → manual approval → production.
Migrations must be backward compatible for one release (expand → migrate → contract).

### 14.5 Monitoring
Sentry for web and api; uptime monitor on `/api/health` every minute; alerts on 5xx rate, job
failures (reminder/email queue), backup failures, disk > 80 %. Structured JSON logs retained 30 days.

---

## 15. Testing and acceptance

Minimum automated coverage before go-live:
- **Shared functions** (unit): phases, mark-done blocker, completeness checks, coverage status,
  status transitions, period ranges, office option lists, VO normalisation, on-time calculation.
- **API e2e:** auth (login, refresh, lockout, PIN uniqueness), visit aggregate sync (all four merge
  rules, 409 on DONE, idempotency), delete-until-done, each entry type's submit validation and office
  rules (action item exactly one office + optional VO; interaction branch/VO only; story none),
  full action item workflow incl. permissions and reminder scheduling (fake clock), stories like
  once per user and comments, analytics numbers against a fixed seed, public summary contains no
  names, admin CRUD and CSV import.
- **Playwright:** register a visit with offices and VO codes; add each entry type; submit; mark
  done; go offline (context.setOffline), create a visit and an action item with a photo, come back
  online and verify sync; fixer flow Start → Long term → Fixed; management summary filters and a
  drill-down; admin assigns and extends; shared story link → sign-in → story opens; 375 px viewport
  has no horizontal scroll.
- **Reconciliation:** the migration script's report matches the prototype counts.

---

## 16. Build plan (summary — the detailed, authoritative plan is `BUILD_PLAN.md`)

| # | Phase | Done when |
|---|---|---|
| 1 | **Foundation:** extension points from §18 (permissions + scopes, reference lists, entry-type registry, `/api/v1` + `schemaVersion` upgraders, domain events + outbox, feature flags, metric registry skeleton), monorepo, TS configs, lint, docker compose (postgres, minio, mailpit), Prisma schema + first migration, seed, Nest skeleton with health, Next skeleton, CI pipeline | `pnpm dev` runs web + api; CI green; `/api/health` ok |
| 2 | **Design system + shell:** port `brac.css`, AppShell (sidebar/bottom bar), theme toggle, charts, map, Portal/dialog, toast | Static pages match prototype screenshots at 375/1280 px |
| 3 | **Auth & users:** login (PIN visible), register, refresh/logout, guards, roles, admin employee/admin-account management, approval flow | Auth e2e passes |
| 4 | **Reference data & admin setup:** units/teams, offices (+ RO/AO generation, CSV import/export, retire), rating questions, settings | Admin can configure everything; `/reference` cached |
| 5 | **Visits online:** register/change/delete/mark done, office selectors, stays, visit page with framed records panel | Visit flows pass e2e (online) |
| 6 | **Entries + media:** four entry forms and views, drafts/submit, photo and voice via presigned uploads, rating snapshots | Entry e2e passes |
| 7 | **Offline:** service worker, Dexie cache/outbox, media queue, aggregate sync endpoint with merge rules, sync pill | Offline Playwright test passes |
| 8 | **Action item workflow:** my action items (grouped/filter/search), action item page, queue, admin center, transitions, deadlines, reminders (pg-boss), emails (Mailpit), email log | Workflow e2e incl. fake-clock reminder passes |
| 9 | **Stories:** feed, likes, comments, WhatsApp share, deep link through sign-in | Story e2e passes |
| 10 | **Management & analytics:** SQL aggregation endpoints, Summary (filters, tiles, drill-downs, needs attention), Offices, People/profile, Analytics, Branch 360°, public summary | Numbers match the prototype on migrated data (±0) |
| 11 | **Migration:** prototype import script with media upload and reconciliation report | Report matches; spot-check 20 records |
| 12 | **Hardening:** security headers, rate limits, CSRF, audit log, Sentry, backups + restore drill, load test (k6) at target volumes, accessibility pass | All §10, §13 items checked |
| 13 | **Go-live:** staging sign-off by the owner, production deploy, DNS + HTTPS, email domain auth, run migration, smoke test, monitor | Go-live checklist (§17) complete |

---

## 17. Go-live checklist

- [ ] Owner decisions recorded (§19).
- [ ] Extension points from §18 in place (permissions, registry, versioned sync, events, flags).
- [ ] Production domain with HTTPS; HSTS on; `/api/health` green.
- [ ] Database backups running; a restore has been tested; PITR enabled.
- [ ] Object storage bucket private; signed URLs work; lifecycle rule for orphaned uploads.
- [ ] SMTP sending verified to real inboxes; SPF/DKIM/DMARC pass.
- [ ] Admin accounts created with strong passwords; demo accounts absent.
- [ ] Prototype data migrated; reconciliation report attached; users told to reset passwords if
      required.
- [ ] Sentry receiving events; alerts routed to a named person.
- [ ] All automated tests green on the release commit.
- [ ] Owner walked through: register visit → each entry → mark done; offline sync on a real phone;
      fixer flow; admin assignment; management summary; public summary.
- [ ] Rollback plan written (previous images + DB backup point).

---

## 18. Built for change (extension points — mandatory from Phase 1)

Many features will be added after go-live. Build these extension points from the start; they
**override** §5–§8 where they conflict. The rule of thumb: **adding a feature should mean adding
files, not editing many existing ones.**

### 18.1 Permissions, not role checks
- Code checks **permissions** (`visit.read.any`, `actionItem.assign`, `analytics.view`,
  `admin.offices.manage`, …), never role names. Permissions are constants in `packages/shared`.
- Store roles as rows: `Role { id, key, name }`, `RolePermission { roleId, permission }`,
  `UserRole { userId, roleId }` (replaces the `Role` enum / `roles[]` column in §5). Seed FIELD,
  FIXER, MANAGEMENT, ADMIN with today's permissions. A new role (e.g. Regional Manager) is a seed
  row plus permission list, with no guard changes.
- Keep a **scope** concept on permissions (`own`, `unit`, `region`, `all`) so "management sees only
  their region" can be added later without touching every query: all list/analytics queries go
  through one `ScopeService.filterFor(user, permission)` helper.

### 18.2 Admin-managed lists
Move every fixed list into reference tables editable in the admin console (`ReferenceList
{ key, value, label, sortOrder, active }`): visit purposes, accommodation types, BLC names,
urgency labels, staff departments, designations. Records store the value; renaming a label never
rewrites history. Code may only rely on values marked `system: true` (e.g. "Other" requires text).

### 18.3 Entry-type registry
- Each entry type is described once in `packages/shared/entry-types/<type>.ts`: key, labels,
  code prefix, Zod schema (draft and submit), office rule (`none | one | many`, allowed office
  types, VO allowed), which fields count for completeness, and analytics facts it contributes.
- The API (validation, sync merge, permissions), the web (form sections, read-only view, tiles on
  the visit page, filters) and analytics read this registry. Each type still has its **own table**
  (for fast queries), sharing a base column set (`id, code, visitId, state, submittedAt,
  createdById, createdAt, updatedAt`) and the shared `EntryOffice` link table.
- Adding a fifth type = one registry file + one table/migration + one form component + one
  view component. The visit page, sync, permissions and filters pick it up automatically.
- Each entry table has an `extra Json` column validated by an optional admin-defined schema, so
  small extra fields can be added without a release (record in DECISIONS.md before using it).

### 18.4 Versioned API and old offline clients
- Prefix the API with `/api/v1`. Breaking changes go to `/api/v2`; v1 keeps working for at least
  90 days.
- Every sync payload carries `schemaVersion`. The server keeps **upgraders** (like the prototype's
  `server/migrate.js`) that convert older payloads to the current shape, so a phone that was
  offline for weeks on an old version still syncs.
- The service worker checks `/api/version`; when a newer web build exists it shows "A new version
  is available — Reload" **only after the outbox is empty**. Below `minSupportedVersion` the app
  blocks writes until it reloads (never discarding queued data).
- Database migrations follow expand → migrate → contract (add columns nullable, backfill, then
  remove old ones in a later release).

### 18.5 Domain events
- Services publish typed events after commit (`VisitDone`, `EntrySubmitted`, `ActionItemAssigned`,
  `ActionItemStatusChanged`, `StoryLiked`, `UserApproved`, …) through `@nestjs/event-emitter`,
  persisted to an `Outbox` table and relayed by the pg-boss worker (transactional outbox).
- Emails, reminders, audit logging and analytics refreshes are **listeners**. New reactions
  (SMS, push notifications, webhooks to other BRAC systems, Slack/Teams messages) are new
  listeners; core services are not edited.
- `Notifier` interface with channel adapters (`email` now; `sms`, `push`, `webhook` later) and a
  per-user notification preference table.

### 18.6 Feature flags
`FeatureFlag { key, enabled, rolesAllowed[], usersAllowed[], percentage }` read through one
`isEnabled(user, key)` helper on both API and web (cached, sent with `/auth/me`). Every new
feature ships behind a flag, first to staging, then to chosen users, then to everyone. Admin
console gets a Feature flags tab.

### 18.7 Analytics metric registry
Summary tiles and their drill-downs are defined in a registry (`key, label, section, definition
text, SQL query builder, drill panels, goodWhenDown`). A new figure is one registry entry; the
Summary page, breakdown dialog and public snapshot render whatever the registry lists. All
metrics accept the same filter object.

### 18.8 Integrations and data access
- Read-only reporting views (`report_visits`, `report_action_items`, …) in a separate schema
  for Power BI / Looker Studio / Excel connections, so reporting requests don't need new screens.
- API keys (`ApiClient { name, keyHash, permissions, expiresAt }`) for system-to-system access.
- CSV/Excel export on every list endpoint (`?format=csv`).

### 18.9 Keeping the codebase easy to extend
- One NestJS module per feature, no cross-module database access (modules call each other's
  services). One route group per feature in Next.js.
- `docs/adr/` — one short Architecture Decision Record per significant decision.
- `CHANGELOG.md` and semantic versioning of releases.
- Update **this spec** (or a `docs/features/<feature>.md` per new feature) in the same pull
  request that adds or changes behaviour; the spec stays the source of truth.
- Test coverage gate in CI (≥ 80 % for `packages/shared` and API services); every new feature
  adds at least one e2e test.

### 18.10 Recipe: adding a feature later
1. Write `docs/features/<name>.md` (what, who, rules, screens, acceptance tests).
2. Add permissions and a feature flag.
3. Expand migration (new tables/columns, nullable or defaulted).
4. Shared Zod schemas and pure rules in `packages/shared`; API module or listener; web route/components.
5. Emit/consume domain events instead of editing other modules.
6. Tests (unit + e2e), update OpenAPI client, CHANGELOG, ADR if needed.
7. Release behind the flag → staging → pilot users → everyone → remove the flag.

## 19. Decisions the owner must make (ask before Phase 1; defaults in brackets)

1. **Hosting location** — self-hosted on BRAC infrastructure or managed cloud, and region.
   [Self-hosted Docker on a VM, region near Bangladesh.]
2. **Sign-in** — PIN + password only, or also Google sign-in restricted to `@brac.net`.
   [PIN + password at launch; Google SSO in a later release.]
3. **Registration** — open self-registration with admin approval, or admin-created accounts only.
   [Self-registration, PENDING until an admin approves.]
4. **Email provider and sender address.** [Amazon SES, `no-reply@<domain>`.]
5. **Management scope** — organisation-wide (as in the prototype) or limited to a manager's
   region/department. [Organisation-wide.]
6. **Bangla UI** at launch or later. [Later; strings externalised now.]
7. **Data retention** for visits, action items and media. [Keep indefinitely.]
8. **Action item code prefix** for new records. [Keep `FC-`.]
9. **Public summary** — keep public, or restrict to the BRAC network. [Public snapshot, no names.]
