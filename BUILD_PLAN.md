# Field Visit Tracker — Production Build Plan

**For:** the AI agent (or developer) building the production system.
**Repository with the prototype and the spec:** https://github.com/ayazelahimullick12-droid/Field-Visit-Go-Live

This plan says **how** to build, **in what order**, and **how to keep the system easy to edit, extend
and trim after go-live**. **What** to build (data model, rules, screens, API) is in
[`GO_LIVE_BUILD_SPEC.md`](GO_LIVE_BUILD_SPEC.md). The working prototype at the root of the repository
is the behavioural reference.

| Document | Role | If they conflict |
|---|---|---|
| `BUILD_PLAN.md` (this file) | Process, structure, conventions, phases, change playbooks | Wins on structure, process and anything about changeability |
| `GO_LIVE_BUILD_SPEC.md` | Product requirements | Wins on behaviour, rules and screens |
| Prototype code | Reference implementation | Copy its behaviour where both documents are silent |

---

## Contents

1. [Working agreement for the AI](#1-working-agreement-for-the-ai)
2. [The changeability principles](#2-the-changeability-principles)
3. [Repositories and environments](#3-repositories-and-environments)
4. [Architecture: feature slices and registries](#4-architecture-feature-slices-and-registries)
5. [Repository skeleton (exact)](#5-repository-skeleton-exact)
6. [Conventions](#6-conventions)
7. [The registries (definitions and examples)](#7-the-registries-definitions-and-examples)
8. [Phase plan](#8-phase-plan)
9. [Change playbooks (after go-live)](#9-change-playbooks-after-go-live)
10. [Quality gates and Definition of Done](#10-quality-gates-and-definition-of-done)
11. [Release, migration and rollback policy](#11-release-migration-and-rollback-policy)
12. [Documentation system](#12-documentation-system)
13. [Templates](#13-templates)
14. [Owner touchpoints](#14-owner-touchpoints)
15. [Starting the build in Claude Code](#15-starting-the-build-in-claude-code)
16. [Readable code standard (mandatory)](#16-readable-code-standard-mandatory)

---

## 1. Working agreement for the AI

0. **No admin rights, no Docker on this PC.** Follow §3.4 for local development.
1. **Read first, in this order:** this file → `GO_LIVE_BUILD_SPEC.md` → the prototype's `README.md` →
   the prototype source files listed in spec §0. Run the prototype locally and click every screen.
2. **Ask the owner the decisions in spec §19 before Phase 1** (one message, with the defaults).
   Record every answer in `DECISIONS.md`.
3. **Work one phase at a time, in order.** Do not start a phase until the previous phase's
   acceptance checks pass. At the end of every phase: summarise what was built, show how to run it,
   list anything deferred, and wait for the owner's go-ahead if the phase is marked **Owner review**.
4. **Small pull requests.** One concern per PR (≈ 400 changed lines max, excluding generated files and
   migrations). Each PR updates tests and docs in the same change.
5. **Never break the rules in §2.** If a requirement seems to force breaking one, stop and ask.
   **Write every line to the readable code standard in §16** (copy the layer templates; CI enforces the limits).
6. **No invented features.** If something is unclear, check the prototype; if still unclear, ask.
7. **Keep a running `PROGRESS.md`** (phase, task checkboxes, open questions) so a new chat can resume.
8. **Never commit secrets or real personal data.** Use `.env` files that are git-ignored and
   `.env.example` files that are committed.

---

## 2. The changeability principles

These are mandatory. They are what make the system easy to **edit, add to and delete from** later.

| # | Principle | In practice |
|---|---|---|
| P1 | **Business-changeable things are data, not code** | Dropdown lists, settings, wording overrides, roles/permissions, rating questions, offices, units/teams, feature flags are rows in the database, edited in the admin console, audited. |
| P2 | **One feature = one folder per layer** | `apps/api/src/features/<x>`, `apps/web/src/features/<x>`, `packages/shared/src/features/<x>`. Adding a feature adds folders; deleting it deletes folders. Features never import each other's internals. |
| P3 | **Registries are the single source of truth** | Entry types, workflow states, permissions, navigation, settings, metrics, notifications, reference lists and feature flags are declared once in a registry and read by API, web and tests. |
| P4 | **Everything new ships behind a feature flag** | Turn on per role/user/percentage; kill switch without deploy. |
| P5 | **Database changes are expand → migrate → contract** | Never drop or rename a column in the same release that stops using it. Destructive steps happen one release later. |
| P6 | **APIs and offline payloads are versioned** | `/api/v1`, `schemaVersion` on sync payloads, server-side upgraders for old phones. |
| P7 | **Features talk through domain events** | "When X happens, also do Y" is a new listener, never an edit to X. |
| P8 | **All UI text lives in a message catalog** | Renaming a concept (e.g. "Complaint" → "Action item") is a catalog change. Admins can override wording without a deploy. |
| P9 | **Design comes from tokens** | Colours, spacing, radii, fonts are CSS variables; restyling is a token change. |
| P10 | **Tests and docs are the contract** | Every feature has e2e tests and a `docs/features/<x>.md`. Changing behaviour means changing the doc and the tests in the same PR. |
| P11 | **Deletions are deliberate and reversible for one release** | Features are switched off → hidden → stop writing → removed → data contracted; each step is a separate release. |
| P12 | **Prefer string codes validated by registries over database enums for business vocabularies** | Statuses, purposes, types that the business may change are `text` columns checked against the registry (with a DB `CHECK` regenerated by migration). Database enums only for purely technical values. |

> **Spec overrides:** where spec §5 shows a Prisma `enum` for a business vocabulary
> (`ActionItemStatus`, visit `reason`, stay `type`, `Urgency`, `RaisedBySource`, `Role`), implement it
> as described in §7 of this plan (registry + `text` column + check constraint). Technical enums
> (`EntryState`, `VisitStatus`, `MediaKind`, `EmailStatus`, `UserStatus`) may stay enums.

---

## 3. Repositories and environments

### 3.1 Repositories
- **Reference (read-only):** `Field-Visit-Go-Live` — the prototype and the two plan documents. Do not
  modify its `main` branch; a hosting service may deploy it.
- **Production code:** **https://github.com/ayazelahimullick12-droid/Go-Live-FV** (private, created
  empty by the owner). Clone it into the owner's working folder. Copy `BUILD_PLAN.md` and
  `GO_LIVE_BUILD_SPEC.md` into its `docs/` folder in the first PR, and create `CLAUDE.md` (§13.5).

### 3.2 Branching
- Trunk-based: short-lived branches `feat/<phase>-<topic>`, `fix/<topic>`, `chore/<topic>`, merged to
  `main` via PR after CI passes. `main` is always deployable to staging.
- Releases are tags `vMAJOR.MINOR.PATCH` (semantic versioning). Production deploys only from tags.

### 3.3 Environments

| Env | Purpose | Data | Deploys |
|---|---|---|---|
| local | Development | Seed + demo data | `pnpm dev` (embedded Postgres, local storage, log email; §3.4) |
| ci | Automated tests | Throwaway | Every PR |
| staging | Owner review, UAT, rehearsals | Seed + anonymised copy of production (optional) | Every merge to `main` |
| production | Live | Real | Tagged releases, manual approval |

### 3.4 Local development without Docker or admin rights (mandatory)
The owner's PC has **no admin rights and no Docker**. Local development must work with only Git,
Node.js (already installed) and pnpm (`npm install -g pnpm`, installs into the user profile).

| Service | Local development (this PC) | CI (GitHub Actions) | Staging / production |
|---|---|---|---|
| PostgreSQL | **`embedded-postgres`** npm package started by `pnpm db:start` (data in `.local/pg`, git-ignored), or a free hosted Neon database via `DATABASE_URL` | Postgres service container | Managed or self-hosted Postgres |
| File storage | **`STORAGE_DRIVER=local`**: files under `.local/storage`, served by the API with signed, expiring URLs | `local` | **`STORAGE_DRIVER=s3`** (S3 / R2 / MinIO) |
| Email | **`MAIL_DRIVER=log`**: rendered email written to the log and `EmailLog` (visible in Admin → Sent emails) | `log` | **`MAIL_DRIVER=smtp`** |
| Background jobs | pg-boss on the same Postgres | same | same |
| Browsers for Playwright | `pnpm exec playwright install chromium` (user profile) | installed by the workflow | — |

Rules:
- `pnpm dev` starts embedded Postgres (if `DATABASE_URL` is not set), applies migrations, seeds, and
  starts api + web. `pnpm test` starts its own throwaway embedded Postgres per run.
- Drivers are chosen only by environment variables; staging and production switch to S3 and SMTP
  **without code changes**. Each driver implements one small interface (`StorageDriver`,
  `MailDriver`) with a contract test that runs against every implementation.
- Never require admin rights, global system installs, Windows services or Docker on the development PC.
  Docker may be used only inside GitHub Actions and on the production server.
- Everything machine-specific lives in git-ignored `.local/` and `.env` files.

---

## 4. Architecture: feature slices and registries

```
               packages/shared  (pure TypeScript, no framework)
               ├─ registries/   entry types, workflow, permissions, nav, settings, metrics,
               │                reference lists, notifications, feature flags, messages
               └─ features/<x>/ zod schemas, pure rules, constants, event payload types
                       ▲                                   ▲
          imports      │                                   │      imports
                       │                                   │
apps/api (NestJS)                                   apps/web (Next.js)
├─ core/      config, db, auth, permissions,        ├─ core/      api client, auth, permissions,
│             flags, settings, events, jobs,        │             flags, messages, offline engine,
│             audit, media, notifications, i18n     │             nav shell, design system
└─ features/<x>/  module, controller, service,      └─ features/<x>/  routes, components, forms,
                  repository, policies, listeners                     queries, offline handlers
```

Rules:
- `core/` may be imported by any feature. A feature may import `core/` and `packages/shared`, **never
  another feature's folder**. Cross-feature needs go through (a) a public service exported by the
  feature's module, or (b) domain events.
- Each registry has **one definition file per item** where practical (e.g.
  `registries/entry-types/action-item.ts`) and an `index.ts` that lists them. Adding an item = adding a
  file + one line in `index.ts`. Deleting = removing both.
- Lint rules enforce boundaries (`eslint-plugin-boundaries` or `@nx/enforce-module-boundaries`-style
  rules via `eslint-plugin-import` `no-restricted-paths`).

---

## 5. Repository skeleton (exact)

```
Go-Live-FV/
├─ CLAUDE.md                 rules every AI session loads automatically (§13.5)
├─ .claude/settings.json      Claude Code permissions for this project (§15)
├─ .local/                    git-ignored: embedded Postgres data, local file storage
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  │  ├─ main.ts                     bootstrap (helmet, pino, versioning, swagger, cookies)
│  │  │  ├─ app.module.ts               imports CoreModule + FeatureModules (from features/index.ts)
│  │  │  ├─ core/
│  │  │  │  ├─ config/                  typed env (zod), per-env defaults
│  │  │  │  ├─ db/                      PrismaService, transaction helper, pagination helper
│  │  │  │  ├─ auth/                    login, refresh, guards, current-user decorator
│  │  │  │  ├─ permissions/             PermissionGuard, @Requires('x'), ScopeService
│  │  │  │  ├─ flags/                   FlagService, @Flag('x') guard
│  │  │  │  ├─ settings/                SettingsService (typed, cached), admin controller
│  │  │  │  ├─ reference-lists/         ListService, admin controller
│  │  │  │  ├─ messages/                wording overrides service + controller
│  │  │  │  ├─ events/                  EventBus, Outbox writer, relay worker
│  │  │  │  ├─ jobs/                    pg-boss module, job registry
│  │  │  │  ├─ audit/                   AuditService, interceptor
│  │  │  │  ├─ media/                   presign, complete, signed GET, orphan cleanup job;
│  │  │  │                           drivers/local.ts, drivers/s3.ts (STORAGE_DRIVER)
│  │  │  │  ├─ notifications/           Notifier, channels (email now), templates registry;
│  │  │  │                           mail drivers log.ts, smtp.ts (MAIL_DRIVER)
│  │  │  │  ├─ sync/                    schemaVersion upgraders, idempotency store
│  │  │  │  └─ health/                  /health, /version
│  │  │  └─ features/
│  │  │     ├─ index.ts                 list of feature modules (add/remove one line)
│  │  │     ├─ users/   units/   offices/   rating-questions/
│  │  │     ├─ visits/  entries/ action-items/  stories/
│  │  │     ├─ analytics/  public-summary/  admin-emails/  reporting/
│  │  │     └─ <feature>/
│  │  │        ├─ <feature>.module.ts
│  │  │        ├─ <feature>.controller.ts       thin: parse → service → DTO
│  │  │        ├─ <feature>.service.ts          business logic, emits events
│  │  │        ├─ <feature>.repository.ts       all Prisma access for this feature
│  │  │        ├─ <feature>.policies.ts         who may do what (uses permissions + scope)
│  │  │        ├─ listeners/                    reactions to other features' events
│  │  │        ├─ jobs/                         scheduled/queued jobs for this feature
│  │  │        └─ __tests__/                    unit + e2e for this feature
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  ├─ migrations/
│  │  │  └─ seed/   index.ts, reference.ts (lists, roles, flags, settings), demo.ts (non-prod only)
│  │  └─ test/      e2e setup (test DB, factories, fake clock, fake mailer, fake storage)
│  └─ web/
│     ├─ src/
│     │  ├─ app/                        Next.js routes: thin files that render feature pages
│     │  │  ├─ (public)/login/page.tsx  (public)/summary/page.tsx
│     │  │  ├─ (app)/layout.tsx          AppShell from the nav registry
│     │  │  └─ (app)/[...]/page.tsx      one file per route, importing features/<x>/pages/*
│     │  ├─ core/
│     │  │  ├─ api/                     generated OpenAPI client + fetch wrapper (CSRF, refresh)
│     │  │  ├─ auth/  permissions/  flags/  settings/
│     │  │  ├─ messages/                t('key') with catalog + admin overrides
│     │  │  ├─ offline/                 Dexie db, outbox, media queue, sync engine, SW registration
│     │  │  ├─ shell/                   AppShell, nav from registry, command palette, toasts
│     │  │  └─ ui/                      design-system components (Button, Card, Kpi, Dialog, Sheet,
│     │  │                              Table, FilterChips, MultiSelect, OfficeSelector, Charts, Map)
│     │  ├─ features/<feature>/
│     │  │  ├─ pages/                   page components used by app/ routes
│     │  │  ├─ components/
│     │  │  ├─ forms/                   RHF + zod (schemas from shared)
│     │  │  ├─ queries.ts               TanStack Query hooks
│     │  │  ├─ offline.ts               (only if the feature works offline)
│     │  │  └─ __tests__/
│     │  └─ styles/  tokens.css (design tokens), brac.css (ported component styles)
│     ├─ public/  geo/ (GeoJSON), icons, manifest.webmanifest
│     └─ e2e/     Playwright specs, one file per feature
├─ packages/
│  ├─ shared/
│  │  └─ src/
│  │     ├─ registries/
│  │     │  ├─ entry-types/   index.ts, action-item.ts, client-interaction.ts, observation.ts, story.ts
│  │     │  ├─ workflows/     action-item.ts
│  │     │  ├─ permissions.ts  roles.seed.ts
│  │     │  ├─ nav.ts          settings.ts   reference-lists.ts   flags.ts
│  │     │  ├─ metrics/        index.ts + one file per metric
│  │     │  ├─ notifications.ts
│  │     │  └─ messages/       en.ts (all UI strings)  bn.ts (later)
│  │     ├─ features/<feature>/  schemas.ts, rules.ts, constants.ts, events.ts
│  │     └─ lib/              dates (Asia/Dhaka), codes, ids (uuidv7), office lists, money/number fmt
│  └─ config/    eslint, tsconfig, prettier, vitest presets
├─ infra/        production only: Dockerfiles, docker-compose.prod.yml, Caddyfile, backup scripts
│                (never needed on the development PC)
├─ scripts/      dev-db.ts (embedded Postgres start/stop/reset), migrate-from-prototype.ts,
│                generate-api-client.ts, new-feature.ts (scaffolder)
├─ docs/
│  ├─ BUILD_PLAN.md  GO_LIVE_BUILD_SPEC.md
│  ├─ features/      one .md per feature (template §13.1)
│  ├─ adr/           0001-*.md decisions (template §13.2)
│  ├─ runbooks/      deploy.md, rollback.md, restore-backup.md, rotate-secrets.md, incident.md
│  └─ admin-guide.md (how admins change lists, settings, wording, flags, roles)
├─ .github/   workflows/ci.yml, deploy.yml; pull_request_template.md
├─ DECISIONS.md  PROGRESS.md  CHANGELOG.md  README.md  .env.example
└─ turbo.json  pnpm-workspace.yaml  package.json
```

`scripts/new-feature.ts <name>` scaffolds the folders above for a new feature (module, controller,
service, repository, policies, test, web page, queries, docs file, e2e spec) so every feature starts
with the same shape.

---

## 6. Conventions

### 6.1 Naming
- Files `kebab-case`; React components `PascalCase`; variables `camelCase`; DB tables `PascalCase`
  models mapped to `snake_case` tables/columns (`@@map`, `@map`).
- Registry keys: lower camel (`actionItem`, `visits.targetDays`), permissions dotted
  (`actionItem.assign`), events PascalCase past tense (`ActionItemAssigned`), flags dotted
  (`stories.comments`), message keys dotted (`actionItem.label.singular`).

### 6.2 Identifiers and codes
- Primary keys UUIDv7 (client-generated for offline-created rows). Human codes per spec §5.3.
- Never expose internal numeric IDs.

### 6.3 API
- `/api/v1/...`, nouns, plural resources. Actions that are state transitions:
  `POST /api/v1/action-items/:id/transitions/:transitionKey` (generic, driven by the workflow
  registry, §7.3).
- Request/response schemas come from `packages/shared` (nestjs-zod). Swagger generated; the web client
  regenerated by `pnpm gen:api` in CI (fails if out of date).
- Errors: `{ statusCode, code, message, details }` where `code` is a stable string
  (`VISIT_DONE_LOCKED`, `PIN_TAKEN`) the web maps to a catalog message.
- Lists: cursor pagination, `?q` search, filters as query params validated by zod.

### 6.4 Data
- Every table: `createdAt`, `updatedAt`, `createdById` (where meaningful).
- Business vocabularies: `text` + registry + `CHECK` (P12).
- Flexible extras: `extra jsonb` validated by the registry's optional `extraSchema`.
- All writes through repositories; all multi-row writes in a transaction; events written to the
  Outbox **in the same transaction**.

### 6.5 Time
- Store UTC; compute "today", weeks, months in **Asia/Dhaka** using `packages/shared/lib/dates.ts`
  only. No `new Date()` arithmetic in features.

### 6.6 UI
- Every string through `t('key')`. No hard-coded text in components (lint rule).
- Styling only via tokens and design-system classes; no inline colours.
- Every interactive control keyboard-accessible with visible focus; forms use `<label for>`.
- Mobile first; verify 375 / 768 / 1280 px.

### 6.7 Commits and PRs
- Conventional commits (`feat(visits): …`, `fix(action-items): …`).
- PR template checklist (§13.3) must be completed.

---

## 7. The registries (definitions and examples)

Each registry is typed in `packages/shared`. Examples below are the required shape; extend as needed.

### 7.1 Permissions and roles
```ts
// packages/shared/src/registries/permissions.ts
export const PERMISSIONS = {
  'visit.create': 'Register visits',
  'visit.read.own': 'See own visits', 'visit.read.any': 'See any visit (read-only)',
  'entry.create': 'Record entries on own visits',
  'actionItem.queue.view': 'See the action item queue of own unit',
  'actionItem.transition.start': 'Start work', 'actionItem.transition.fix': 'Mark fixed',
  'actionItem.transition.longTerm': 'Mark long term',
  'actionItem.assign': 'Assign action items', 'actionItem.extend': 'Extend deadlines',
  'story.like': 'Like stories', 'story.comment': 'Comment on stories', 'story.comment.moderate': 'Delete any comment',
  'analytics.view': 'See management analytics', 'people.view': 'See people and visit histories',
  'admin.users.manage': '…', 'admin.offices.manage': '…', 'admin.units.manage': '…',
  'admin.lists.manage': '…', 'admin.settings.manage': '…', 'admin.flags.manage': '…',
  'admin.wording.manage': '…', 'admin.roles.manage': '…', 'admin.emails.view': '…',
} as const;
export type Permission = keyof typeof PERMISSIONS;
// Scopes: own | unit | region | all — attached to role permissions (RolePermission.scope)
```
- DB: `Role { id, key, name, system }`, `RolePermission { roleId, permission, scope }`,
  `UserRole { userId, roleId }`. Seed FIELD, FIXER, MANAGEMENT, ADMIN with today's behaviour.
- API: `@Requires('actionItem.assign')` on handlers; services call `policies.can(user, perm, record)`.
- Web: `useCan('analytics.view')` hides/disables UI. **Never** check role names in code.
- Admin console: Roles tab (create role, tick permissions, choose scope). Changing who can do what
  is data only.

### 7.2 Entry types
```ts
// packages/shared/src/registries/entry-types/action-item.ts
export const actionItemType = defineEntryType({
  key: 'actionItem',
  codePrefix: 'FC',
  labels: { singular: 'entry.actionItem.singular', plural: 'entry.actionItem.plural' },
  icon: 'message-circle',
  order: 10,                                   // order of tiles on the visit page
  flag: null,                                  // or 'entries.actionItem'
  draftSchema, submitSchema,                   // zod (title, description|voice, unit, …)
  officeRule: { mode: 'one', types: ['REGION_OFFICE', 'AREA_OFFICE', 'BRANCH'], vo: 'oneUnderBranch' },
  completeness: { countsAsRecorded: true, detailFields: ['description', 'voiceId', 'photoId'] },
  workflow: 'actionItem',                      // registry key in workflows/, or null
  permissions: { create: 'entry.create' },
  extraSchema: null,                           // optional admin-defined extras
});
```
- API `features/entries` provides generic draft/submit/list/get using the registry; per-type
  behaviour lives in a small handler file per type (`entries/types/action-item.handler.ts`).
- Web `features/entries` renders tiles, lists and forms from the registry; per-type form sections live
  in `features/entries/types/<type>/Form.tsx` and `View.tsx`, registered in a map keyed by `key`.
- Sync, analytics facts, permissions and filters iterate over the registry — a new type appears
  everywhere once registered.

### 7.3 Workflows (action item statuses)
```ts
// packages/shared/src/registries/workflows/action-item.ts
export const actionItemWorkflow = defineWorkflow({
  key: 'actionItem',
  initial: 'WAITING',
  states: {
    WAITING:     { label: 'status.waiting',    color: 'danger',  open: true,  deadlineActive: false },
    ASSIGNED:    { label: 'status.assigned',   color: 'info',    open: true,  deadlineActive: true  },
    IN_PROGRESS: { label: 'status.inProgress', color: 'brand',   open: true,  deadlineActive: true  },
    LONG_TERM:   { label: 'status.longTerm',   color: 'warning', open: true,  deadlineActive: false },
    FIXED:       { label: 'status.fixed',      color: 'success', open: false, terminal: true },
  },
  transitions: {
    assign:   { from: ['WAITING'], to: 'ASSIGNED', permission: 'actionItem.assign', input: assignInput, effects: ['setDeadline', 'notifyUnitFixers'] },
    start:    { from: ['ASSIGNED'], to: 'IN_PROGRESS', permission: 'actionItem.transition.start', actor: 'unitFixer' },
    longTerm: { from: ['ASSIGNED', 'IN_PROGRESS'], to: 'LONG_TERM', permission: 'actionItem.transition.longTerm', actor: 'unitFixer', input: noteInput },
    fix:      { from: ['ASSIGNED', 'IN_PROGRESS', 'LONG_TERM'], to: 'FIXED', permission: 'actionItem.transition.fix', actor: 'unitFixer', input: fixInput },
    extend:   { from: ['ASSIGNED', 'IN_PROGRESS'], to: null /* same state */, permission: 'actionItem.extend', input: daysInput, effects: ['setDeadline', 'notifyUnitFixers'] },
  },
});
```
- One generic endpoint executes transitions: validates `from`, permission, actor rule, input; applies
  named **effects** (implemented in `features/action-items/effects/*.ts`); writes the timeline event;
  emits `ActionItemStatusChanged`.
- Web buttons on the action item page are generated from the transitions available to the user.
- Adding a status or transition = registry change + effect (if new) + migration updating the `CHECK`
  constraint + messages. Removing one follows the deletion playbook (§9.5).

### 7.4 Navigation
```ts
// packages/shared/src/registries/nav.ts
export const NAV = [
  { key: 'dashboard', path: '/dashboard', label: 'nav.dashboard', icon: 'home', order: 10 },
  { key: 'visits', path: '/visits', label: 'nav.visits', icon: 'clipboard-list', order: 20, permission: 'visit.create' },
  { key: 'myActionItems', path: '/action-items', label: 'nav.myActionItems', icon: 'message-circle', order: 30, permission: 'entry.create' },
  { key: 'management', path: '/management/summary', label: 'nav.management', icon: 'bar-chart', order: 40, permission: 'analytics.view' },
  { key: 'queue', path: '/queue', label: 'nav.queue', icon: 'wrench', order: 50, permission: 'actionItem.queue.view', badge: 'queueOpenCount' },
] as const;
// Admin console has ADMIN_NAV with the same shape.
```
The shell renders whatever the user may see (permission + flag). A new page = route file + nav entry.

### 7.5 Settings
```ts
// packages/shared/src/registries/settings.ts
defineSetting({ key: 'visits.targetDays', type: 'int', default: 90, min: 7, max: 365, label: 'settings.visitTargetDays', group: 'Coverage' });
defineSetting({ key: 'actionItems.reminderRule', type: 'json', default: { hoursBefore: 24, hoursBeforeIfLongerThanDays: { days: 2, hours: 48 } }, group: 'Action items' });
defineSetting({ key: 'actionItems.defaultDeadlineDays', type: 'int', default: 3, min: 1, max: 60 });
defineSetting({ key: 'media.voiceMaxSeconds', type: 'int', default: 300 });
defineSetting({ key: 'media.photoMaxPx', type: 'int', default: 1000 });
defineSetting({ key: 'stories.commentMaxLength', type: 'int', default: 600 });
defineSetting({ key: 'publicSummary.enabled', type: 'bool', default: true });
defineSetting({ key: 'publicSummary.days', type: 'int', default: 30 });
defineSetting({ key: 'registration.requiresApproval', type: 'bool', default: true });
```
Stored in `Setting { key, value jsonb, updatedById, updatedAt }`; unknown keys rejected; admin
Settings tab is generated from the registry (grouped, validated, audited).

### 7.6 Reference lists
```ts
// packages/shared/src/registries/reference-lists.ts
export const LISTS = {
  visitPurposes:      { label: 'lists.visitPurposes', system: ['OTHER'] },          // OTHER requires free text
  accommodationTypes: { label: 'lists.accommodationTypes', system: ['BLC', 'OTHER'] },
  blcs:               { label: 'lists.blcs' },
  designations:       { label: 'lists.designations', allowFreeText: true },
  staffDepartments:   { label: 'lists.staffDepartments', allowFreeText: true },
  urgencies:          { label: 'lists.urgencies', system: ['LOW', 'MEDIUM', 'HIGH'], ranked: true },
} as const;
```
Rows: `ReferenceItem { list, value, label, sortOrder, active, system }`. Records store `value`;
labels can be renamed; items can be deactivated (hidden from forms, still shown on old records).
Seed with the prototype's values (spec §5.2, prototype `src/lib/visits.js`).

### 7.7 Feature flags
`FeatureFlag { key, description, enabled, roles[], users[], percentage, expiresAt }` declared in
`registries/flags.ts` (key + description + owner + intended removal date). `isEnabled(user, key)`
on API and web. Admin Flags tab. CI warns when a flag is past its removal date.

### 7.8 Analytics metrics
```ts
// packages/shared/src/registries/metrics/visits.ts
export const visitsMetric = defineMetric({
  key: 'visits', section: 'activity', order: 10,
  label: 'metrics.visits.label', definition: 'metrics.visits.definition',
  format: 'count', goodDirection: 'up', comparePrevious: true, public: true,
  drill: ['trend12m', 'byLocation', 'byPurpose', 'byStaffDepartment', 'topStaff'],
});
```
API side: `features/analytics/metrics/visits.query.ts` implements `compute(filters)` and each drill
panel query. The Summary page, breakdown dialog and public snapshot render from the registry. Adding
a figure = shared definition + query file + messages + a test with a fixed seed.

### 7.9 Notifications
```ts
// packages/shared/src/registries/notifications.ts
defineNotification({ key: 'actionItem.assigned', event: 'ActionItemAssigned', channels: ['email'],
  recipients: 'unitFixers', template: 'notifications.actionItemAssigned', flag: null });
defineNotification({ key: 'actionItem.reminder', event: 'ActionItemDeadlineApproaching', channels: ['email'], recipients: 'unitFixers' });
defineNotification({ key: 'actionItem.extended', event: 'ActionItemDeadlineExtended', channels: ['email'], recipients: 'unitFixers' });
```
A generic listener sends whatever is registered. Templates in the message catalog; admins may
override template wording (P8). New channels (SMS, push, webhook) implement the `Channel` interface.

### 7.10 Messages (wording)
- `registries/messages/en.ts` holds every UI string, keyed. `MessageOverride { locale, key, value }`
  lets admins change wording live (Admin → Wording tab with search, preview, reset to default).
- The vocabulary in spec §4 is the default catalog.

---

## 8. Phase plan

Each phase lists **Goal**, **Tasks**, **Acceptance**, and **Change hooks** (what this phase adds that
makes later edits easy). Tasks are written as checkboxes to copy into `PROGRESS.md`.

### Phase 0 — Kickoff (Owner review)
**Goal:** agree decisions and accounts before code.
- [ ] Read the documents and run the prototype; list any contradictions found.
- [ ] Ask the owner the spec §19 decisions in one message with defaults; record in `DECISIONS.md`.
- [ ] Clone https://github.com/ayazelahimullick12-droid/Go-Live-FV into the working folder; confirm push access.
- [ ] Create `CLAUDE.md` (§13.5) and commit it with the docs (first commit).
- [ ] List accounts the owner must create (hosting, domain, email provider, Sentry, object storage)
      with what is needed from each (keys, DNS records). Do not block Phase 1 on them; use local
      drivers (§3.4: embedded Postgres, local storage, log email) until available.
**Acceptance:** `DECISIONS.md` filled; repository accessible; owner says "go".

### Phase 1 — Repository foundation
**Goal:** a monorepo that builds, tests and runs locally and in CI.
- [ ] pnpm workspace + Turborepo; `apps/api` (NestJS), `apps/web` (Next.js App Router), `packages/shared`, `packages/config`.
- [ ] TypeScript strict; ESLint (incl. boundary rules §4 and no-hardcoded-strings rule for web), Prettier, Husky + lint-staged, commitlint.
- [ ] Local services without Docker (§3.4): `embedded-postgres` via `scripts/dev-db.ts` (`pnpm db:start | db:stop | db:reset`), `.local/` git-ignored, `DATABASE_URL` override for Neon.
- [ ] Vitest (shared, web), Jest + Supertest (api) with a disposable test database per run, Playwright skeleton.
- [ ] GitHub Actions `ci.yml`: install → lint → typecheck → unit → api e2e (Postgres service container) → build → Playwright (starts api + web with local drivers).
- [ ] `.env.example` for api and web; typed config loader (zod) failing fast on missing vars.
- [ ] `scripts/new-feature.ts` scaffolder (§5).
- [ ] Docs: copy plan + spec into `docs/`; create `DECISIONS.md`, `PROGRESS.md`, `CHANGELOG.md`, ADR template, feature template, PR template.
**Acceptance:** on a PC **without admin rights or Docker**, `pnpm i && pnpm dev` starts embedded Postgres, migrates, seeds and runs web + api; `pnpm test` passes using its own embedded Postgres; CI green on an empty feature; scaffolder creates a feature that passes lint/tests.
**Change hooks:** boundaries enforced from day one; scaffolder gives every future feature the same shape.

### Phase 2 — Platform core (the extension points)
**Goal:** all registries and cross-cutting services exist before any business feature.
- [ ] Prisma base schema: `User`, `Role`, `RolePermission`, `UserRole`, `RefreshToken`, `Setting`, `ReferenceItem`, `FeatureFlag`, `MessageOverride`, `AuditLog`, `Outbox`, `Media`, `EmailLog`, `IdempotencyKey`, `ApiClient`.
- [ ] `core/config`, `core/db` (Prisma service, transaction helper, pagination), `core/health` (`/health`, `/version` with build SHA, `minSupportedClientVersion`).
- [ ] API versioning `/api/v1`; global zod validation pipe; error filter with stable `code`s; pino logging with request IDs; helmet; throttler; CSRF double-submit.
- [ ] `core/permissions`: permissions registry, guards, `ScopeService`, seed roles (FIELD, FIXER, MANAGEMENT, ADMIN) with spec behaviour.
- [ ] `core/settings`, `core/reference-lists`, `core/flags`, `core/messages` services + admin endpoints + caching (in-memory with change notification via Postgres `LISTEN/NOTIFY`).
- [ ] `core/events`: typed EventBus, transactional Outbox, relay worker (pg-boss) with retries; `core/jobs` (pg-boss module, job registry, scheduling API).
- [ ] `core/audit`: service + interceptor writing who/what/when for mutating requests.
- [ ] `core/media`: `StorageDriver` interface with `local` and `s3` drivers (+ shared contract test); presign (MIME/size allow-list from settings), complete, signed GET, orphan cleanup job.
- [ ] `core/notifications`: Notifier + email channel (Nodemailer) + template rendering from messages; EmailLog statuses; `MailDriver` interface with `log` (dev/CI) and `smtp` (staging/production) drivers.
- [ ] `core/sync`: idempotency middleware (`Idempotency-Key`), `schemaVersion` upgrader registry.
- [ ] OpenAPI generation + `pnpm gen:api` producing the web client; CI check that it is up to date.
- [ ] Seed `reference.ts` (roles, permissions, settings defaults, lists from the prototype, flags — including `management.offices`, `management.people`, `management.analytics`, all **off**; spec §20.1).
- [ ] ESLint readability rules and limits from §16.2 active in CI from this phase on.
**Acceptance:** e2e tests prove: a permission-protected test endpoint returns 403/200 correctly; a setting change is audited and visible without restart; an event written in a transaction is delivered exactly once to a listener (also after a forced crash before relay); a flag hides a test endpoint; media presign/upload/get works with the local driver (and the s3 driver passes the same contract test when credentials are configured).
**Change hooks:** every later feature plugs into these; most post-go-live edits become data changes.

### Phase 3 — Authentication and users (Owner review)
**Goal:** real sign-in and user administration.
- [ ] `features/auth`: login (PIN visible + password, user/admin mode), refresh rotation, logout, `/auth/me` (user, permissions, flags, settings subset, wording overrides version).
- [ ] Argon2id hashing; lockout after 10 failures/15 min; login rate limit; password policy.
- [ ] Registration (name, designation, department, PIN, email, phone, password) → PENDING if `registration.requiresApproval`.
- [ ] `features/users` admin: list/search, create, edit (designation, department, unit, supervisor, roles), approve, disable, reset password; admin accounts (users with ADMIN role).
- [ ] Web: login page, registration, auth context, route protection, "No connection" handling for first sign-in.
**Acceptance:** spec §15 auth tests pass; admin can approve a registration and assign FIXER (requires unit); disabled users cannot sign in or refresh.
**Change hooks:** roles/permissions editable in data; new user fields go through `extra` or expand migrations.

### Phase 4 — Web shell and design system (Owner review)
**Goal:** the prototype's look and navigation, driven by registries.
- [ ] Port prototype `src/styles/brac.css` into `styles/tokens.css` (all colours, radii, shadows, fonts, spacing as CSS variables, light + dark) and `styles/brac.css` (component classes).
- [ ] `core/ui`: Button, Card, Kpi, DeltaChip, Ring, Sparkline, Dialog, Sheet (mobile), ConfirmDialog (scrollable on short screens), Toast, Table (stacks to cards < 900 px), FilterChips, SearchBox, Select, MultiSelect (single/multi), TagInput, PhotoUpload (client resize per setting), VoiceRecorder/Player, EmptyState, Skeleton.
- [ ] Charts: port `src/lib/charts.jsx` (TrendLine, RankedBar, StackedBar) and `InteractiveMap.jsx` + GeoJSON.
- [ ] `core/shell`: AppShell (sidebar ≥ 900 px; top bar + bottom tabs + raised "New visit" < 900 px) rendered from `NAV`/`ADMIN_NAV`, theme toggle, command palette (Ctrl/⌘ K) fed by a palette registry.
- [ ] `core/messages`: `t()` with catalog + overrides; language switch plumbing (English only).
- [ ] PWA basics: manifest, Serwist service worker caching the shell, fonts, GeoJSON; update prompt that waits for an empty outbox.
**Acceptance:** Storybook-style demo page (or `/dev/ui`) shows every component in light/dark at 375/1280 px; shell shows only nav items the signed-in user may see; app shell loads offline after one visit.
**Change hooks:** restyle via tokens; new pages via route + nav entry; wording via catalog/overrides.

### Phase 5 — Organisation reference data
**Goal:** everything visits depend on, editable by admins.
- [ ] `features/units`: units + teams CRUD, fixers per unit view.
- [ ] `features/offices`: Office (+ RO/AO generation from branch hierarchy), retire/reactivate, CSV import/export (`Branch, Area, District, Division, Latitude, Longitude, Active`), office option lists endpoint (division → district → area → RO/AO/BO per spec §6.2), VO upsert.
- [ ] `features/rating-questions`: add, reword, reorder, switch off (no delete once answered).
- [ ] Admin console screens: Units, Offices (incl. visit target setting), Client questions, Lists, Settings, **Features** (switches for the Management tabs and other flags, spec §20.1), Wording, Roles, Sent emails (read).
- [ ] `/api/v1/reference` bundle with ETag for offline caching.
- [ ] Seed from prototype `server/db.json` (units/teams, 78 branches with coordinates, questions).
**Acceptance:** admin edits each of the above and the change appears in forms without a deploy; CSV round-trips; renaming an office keeps history linked.
**Change hooks:** organisation changes (new districts, renamed areas, new units) never need developers.

### Phase 6 — Visits (online)
**Goal:** register, change, view, delete and complete visits.
- [ ] Prisma: `Visit`, `VisitOffice`, `Stay` (spec §5) with `extra jsonb`.
- [ ] `features/visits` API: create/update (owner), get (owner; read-only for `visit.read.any`), list mine, mark done (blocker rules), delete until DONE (cascade + audit snapshot).
- [ ] Shared rules: phase calculation, mark-done blocker, duration, office lists, area-change pruning (spec §6.2).
- [ ] Web: Visits list (grouped cards), Register/Change visit (sections: Visit location*, Offices to be visited, Purpose of visit, Schedule, Accommodation), Visit page with the framed **Visit record** panel and **Records for this visit** box (tiles from the entry-type registry), Delete visit and Mark as done dialogs.
**Acceptance:** spec §6.2 rules covered by unit tests; Playwright: register → change area (pruning) → mark done → locked; delete with entries warns with counts.
**Change hooks:** visit fields via expand migrations or `extra`; purposes/accommodation via lists.

### Phase 7 — Entries and media
**Goal:** the four entry types through the registry.
- [ ] Prisma: `ActionItem`, `ClientInteraction` (+ `InteractionRating`), `Observation`, `Story`, `EntryOffice`, `Vo`; base columns per §7.2; `extra jsonb`.
- [ ] Entry-type registry entries for all four (§7.2) incl. office rules (action item: exactly one office + optional single VO; interaction: branches/VOs only; observation: any; story: typed location).
- [ ] `features/entries`: generic draft upsert, submit (lock + stamp + event `EntrySubmitted`), list by visit, get; per-type handlers.
- [ ] Rating snapshots (question text stored with each answer).
- [ ] Media attach/detach rules (photo with description; voice ≤ setting; resolution photo on fix).
- [ ] Web: entry forms rendered from the registry with bordered titled sections, visit context strip, required/optional marks, photo beside description, information note last; read-only views; entry lists on the visit page (drafts then submitted).
**Acceptance:** spec §6.3–§6.4 validation tests per type; Playwright creates and submits each type with a photo and a voice note.
**Change hooks:** a fifth entry type or new fields follow playbooks §9.3/§9.1 without touching visits, sync or analytics core.

### Phase 8 — Offline sync (Owner review on a real phone)
**Goal:** field staff can work without signal.
- [ ] Dexie schema: visits (with entries), outbox, media blobs, reference cache, idempotency log.
- [ ] Sync engine: write-through to Dexie, outbox flush (online events + every 20 s), media first (presign → PUT → complete) then visit aggregate.
- [ ] `PUT /api/v1/visits/:id` aggregate upsert implementing spec §9 merge rules, `Idempotency-Key`, `schemaVersion` upgraders (start with v1 = current shape; include an upgrader test using a fake v0 payload).
- [ ] Sync pill ("All changes sent" / "Saved on this device · sends when online"); conflict handling (409 on DONE → replace local copy, explain to user).
- [ ] Version gating: `/version` check; block writes below `minSupportedClientVersion` without losing queued data.
**Acceptance:** Playwright offline test (create visit + action item with photo offline → reconnect → server state matches); kill the tab mid-sync and confirm no duplicates; old-version payload is upgraded.
**Change hooks:** new fields on offline entities ship with an upgrader; old phones keep syncing.

### Phase 9 — Action item workflow and notifications
**Goal:** assignment to the unit's fixer pool through to Fixed / Long Term, with reminders.
- [ ] Workflow registry (§7.3) + generic transition endpoint + effects (`setDeadline`, `notifyUnitFixers`, `clearReminder`, `recordResolution`).
- [ ] Deadline history, timeline events, live fixer pool (unit membership), no escalations.
- [ ] Reminder job: schedule on assign/extend per `actionItems.reminderRule`; cancel on Long Term/Fixed; 5-minute safety sweep.
- [ ] Notifications registry entries (§7.9); email templates; EmailLog.
- [ ] Web: **My action items** (search, status chips with counts, groups Drafts · Waiting · Assigned · In progress · Long term · Fixed, fixed preview 6 + Show all, tiles = code, status, title, first 100 words); **Action item page** (all details, transition buttons from the registry, dialogs for fix note/photo and long-term reason); **Action item queue** (unit title, teammates, score cards, groups, past-deadline first); **Admin action items center** (sections, assign with fixer-pool preview, extend, journey strip).
**Acceptance:** spec §6.5 and §15 workflow tests with a fake clock (reminder at 24 h/48 h; none for Long Term); only unit fixers can transition; emails visible in the log and the Sent emails tab (log driver).
**Change hooks:** statuses/transitions/notifications are registry edits (§9.6); reminder timing is a setting.

### Phase 10 — Stories
**Goal:** feed, likes, comments, sharing.
- [ ] `features/stories`: feed (cursor), get, like toggle (one per user), comments (max length setting), comment delete (author or `story.comment.moderate`), legacy like count.
- [ ] Web: feed cards, story sheet with comments, "Share on WhatsApp" (`wa.me` with title + `/stories/:id`), deep link preserved through sign-in.
- [ ] Flags: `stories.comments`, `stories.share` (so either can be switched off).
**Acceptance:** spec §6.6 tests; Playwright: share link → sign-in → story opens.

### Phase 11 — Management analytics and public summary (Owner review)
**Goal:** the Management section and the public snapshot, computed server-side.
- [ ] Shared filter schema (time preset or custom range, division/district/area/branch, staff department) and period/comparison maths.
- [ ] Metric registry with the 19 Summary metrics and their drill panels (spec §7.2 item 9; prototype `src/staff/management/Summary.jsx`), SQL queries per metric, indexes; materialised views only if performance requires (§13 targets).
- [ ] Endpoints: summary, drill/:metric, offices (coverage + table + CSV), people (+ profile), analytics visits/action-items, branch 360°, public summary (cached, no names, no "Needs attention").
- [ ] Web: Management section with **Summary always on** and Offices · People · Analytics each behind its flag (sub-tab bar hidden when only Summary is on); dependent pages hidden with their tab (spec §20.1); breakdown dialog; Branch 360°; person profile with read-only visit view; public `/summary`.
- [ ] API returns `FEATURE_DISABLED` (403) for endpoints of switched-off tabs.
- [ ] `features/reporting`: read-only SQL views in a `reporting` schema + DB role for BI tools.
**Acceptance:** numbers equal the prototype's on the migrated data set (spec §15) for a fixed list of filter combinations; analytics p95 within targets on a 100k-visit synthetic dataset.
**Change hooks:** new figures/drills are registry entries (§9.7); BI tools cover ad-hoc reporting.

### Phase 12 — Data migration from the prototype
- [ ] `scripts/migrate-from-prototype.ts` per spec §12 (idempotent, media upload, reconciliation report).
- [ ] Dry run on staging with the latest `server/db.json`; owner spot-checks 20 records.
**Acceptance:** reconciliation report matches; re-running changes nothing.

### Phase 13 — Hardening
- [ ] Security review against spec §10 (authorization e2e matrix, CSRF, headers, rate limits, upload limits, Sentry scrubbing).
- [ ] Performance: k6 load test at target volumes; fix slow queries; verify indexes.
- [ ] Accessibility: axe checks in Playwright on every page; manual keyboard pass.
- [ ] Observability: Sentry (web/api), uptime monitor, alert routes, log retention.
- [ ] Backups + restore drill documented in `docs/runbooks/restore-backup.md`.
- [ ] `docs/admin-guide.md` written (how to change lists, settings, wording, roles, flags, offices).
**Acceptance:** all items ticked; no high/critical findings open.

### Phase 14 — Staging UAT and go-live (Owner review)
- [ ] Production infrastructure per `DECISIONS.md` (spec §14.3); DNS, HTTPS, email domain (SPF/DKIM/DMARC).
- [ ] UAT script for the owner (each role's main flows, offline on a real phone, admin changes).
- [ ] Release `v1.0.0`: deploy, migrate data, smoke tests, go-live checklist (spec §17).
- [ ] Hypercare: daily error/metrics review for two weeks; fix list.

### Phase 15 — After go-live (continuous)
- Weekly dependency updates (Renovate/Dependabot), monthly restore test, quarterly access review.
- Each new request starts with a feature doc (§13.1) and follows the change playbooks (§9).

---

## 9. Change playbooks (after go-live)

Every playbook ends with: tests updated, feature doc updated, CHANGELOG entry, flag plan noted.

### 9.1 Add a field to an existing record (e.g. "Gender" on client details)
1. Decide: **searchable/reportable** → real column; **informational only** → `extra` (with `extraSchema`).
2. Real column: **expand migration** adding a nullable column (or with default) — deploy.
3. Shared zod schema: add the field (optional at first); update the entry-type registry/form section.
4. Offline: add an upgrader that fills the default for older `schemaVersion` payloads.
5. Web: field in the form + read-only view + message keys; behind a flag if user-visible.
6. Analytics/reporting view: include the column if needed.
7. If it must become required: release N makes it required in the UI; release N+1 backfills and adds `NOT NULL`.

### 9.2 Rename a field or a label
- **Label only:** change the message catalog (or an admin wording override). No deploy for overrides.
- **Field name in code/DB:** expand (add new column) → dual-write → backfill → switch reads → contract
  (drop old) over two releases. API keeps the old property name for 90 days if external clients use it.

### 9.3 Add a new entry type (e.g. "Audit checklist")
1. Feature doc. 2. Registry file in `registries/entry-types/` + line in `index.ts` (behind a flag).
3. Prisma model with base columns + type columns; migration. 4. API handler in `entries/types/`.
5. Web `Form.tsx` + `View.tsx` registered in the type map. 6. Messages. 7. Metrics (optional) via §9.7.
8. Upgrader (no-op for older clients: they never send the type). 9. Tests (unit, e2e, Playwright).
10. Pilot via flag → everyone → remove flag.

### 9.4 Change an entry type's rules (e.g. allow several offices on action items)
Change `officeRule`/schemas in the registry; adjust the handler; add a migration only if storage
changes; update the doc and tests. Old records stay valid (rules apply to new submissions).

### 9.5 Remove something (field, list item, status, entry type, feature) — the deletion ladder
Each rung is a separate release; you may stop at any rung.
1. **Switch off:** flag off (feature) or deactivate (list item) — users stop seeing it; data intact.
2. **Hide everywhere:** remove from forms and navigation; keep read-only display on old records.
3. **Stop writing:** API rejects new writes (`410 Gone` with a clear code); exports still include it.
4. **Remove code:** delete the feature folders/registry entries/handlers/messages; keep data.
5. **Contract data (optional):** archive to a `archive` schema or export to storage, then drop.
   Requires owner sign-off and a backup taken that day. Never drop data in the same release as step 3.
- **Statuses:** move existing records to a replacement state with a data migration before removing the
  state from the registry and `CHECK`.
- **Entry types:** keep the table and read-only view until owner decides to archive.

### 9.6 Change the action item workflow
- New status: add to `states`, add transitions, messages, colour token; migration to extend the
  `CHECK`; update analytics if it changes "open"/"fixed" meaning (registry flags `open`, `terminal`).
- New transition/effect: registry + effect file + permission + tests.
- Remove a status: §9.5 (migrate records first).

### 9.7 Add, change or remove a Summary metric or drill panel
- Add: metric definition (shared) + query (api) + messages + seed-based test; appears automatically.
- Change a definition: new query + updated `definition` text + CHANGELOG note (numbers will shift).
- Remove: set `hidden: true` for one release, then delete files.

### 9.8 Add a page / navigation item
Route file in `app/` → page component in `features/<x>/pages` → `NAV` entry with permission/flag →
messages → Playwright spec.

### 9.9 Add a role or change who can do what
Admin → Roles: create role, tick permissions, choose scope. Code change only if a **new permission**
is needed: add to `PERMISSIONS`, guard the endpoint/UI, seed it to the right roles, test the matrix.

### 9.10 Add or edit a dropdown option
Admin → Lists. No code. (System items cannot be deleted, only relabelled.)

### 9.11 Change a business number (visit target, reminder timing, limits)
Admin → Settings. No code. Audited.

### 9.12 Add a notification or a new channel (SMS/push/webhook)
Notification registry entry (event, recipients, template, channel) → template messages → for a new
channel, implement `Channel` in `core/notifications/channels/` with config + tests.

### 9.13 Add an integration with another system
Prefer: reporting views (read) or webhooks (events out) or API clients with scoped keys (in). Never
give external systems direct table write access.

### 9.14 Change the look
Edit `tokens.css` (colours, fonts, radii) or a component's class in `brac.css`. Run visual checks
at 375/1280 px in light and dark.

### 9.15 Hotfix in production
Branch `fix/…` from the release tag → fix + test → PR → tag `vX.Y.Z+1` → deploy → merge back to
`main`. Use a flag to switch off the broken feature immediately if the fix takes longer.

---

## 10. Quality gates and Definition of Done

### 10.1 Every PR
- [ ] Lint, typecheck, unit, e2e, Playwright green; coverage gate (≥ 80 % shared + api services).
- [ ] Generated API client up to date.
- [ ] No hard-coded UI strings; no direct cross-feature imports (lint).
- [ ] Readable code checklist §16.12 passed (limits in §16.2 enforced by CI).
- [ ] Migrations follow expand/contract; reviewed with the migration checklist (§13.4).
- [ ] Feature doc, CHANGELOG (if user-visible), DECISIONS/ADR (if a decision) updated.
- [ ] New user-visible behaviour behind a flag (or justified in the PR).
- [ ] Screenshots at 375 px and 1280 px for UI changes.

### 10.2 Every phase
- [ ] Acceptance checks of the phase pass in CI and on staging.
- [ ] `PROGRESS.md` updated; owner demo done for **Owner review** phases.

---

## 11. Release, migration and rollback policy

- **Versioning:** semantic; `CHANGELOG.md` in "Added / Changed / Deprecated / Removed / Fixed".
- **Migrations:** run automatically on deploy (`prisma migrate deploy`) **before** the new app version
  starts; must be compatible with the previous app version (expand/contract). Long backfills run as
  jobs, not in migrations.
- **Client compatibility:** server accepts the previous `schemaVersion` for ≥ 90 days; bump
  `minSupportedClientVersion` only after the dashboard shows < 1 % of syncs from older versions.
- **Rollback:** redeploy the previous image tag (migrations are backward compatible by policy). Data
  restore only for data-loss incidents (`docs/runbooks/restore-backup.md`).
- **Release cadence:** small releases weekly or as needed; flags decouple deploy from release.

---

## 12. Documentation system

| File | Purpose | Updated when |
|---|---|---|
| `docs/GO_LIVE_BUILD_SPEC.md` | Requirements baseline | Behaviour changes (or point to the feature doc) |
| `docs/BUILD_PLAN.md` | This plan | Process/structure changes |
| `docs/features/<x>.md` | Current truth for each feature | Every change to that feature |
| `docs/adr/NNNN-<title>.md` | Why a significant decision was made | New decisions |
| `docs/admin-guide.md` | How admins change data-driven things | New admin capability |
| `docs/runbooks/*.md` | Operations procedures | Infra/process changes |
| `DECISIONS.md` | One-line log of choices and owner answers | Any decision |
| `PROGRESS.md` | Build status for resuming work | Every work session |
| `CHANGELOG.md` | What changed per release | Every user-visible change |

---

## 13. Templates

### 13.1 Feature doc (`docs/features/<feature>.md`)
```md
# <Feature name>
Status: draft | building | live | deprecated   Flag: <flag key or none>   Owner: <name>
## Purpose (2–3 sentences)
## Users and permissions (permission keys, scopes)
## Data (tables/columns, registry entries, settings, lists)
## Rules (numbered, testable)
## Screens (routes, states, empty/error/offline behaviour, mobile notes)
## API (endpoints, events emitted/consumed)
## Analytics impact
## Acceptance tests (Given/When/Then)
## Change log (date — change — PR)
```

### 13.2 ADR (`docs/adr/NNNN-<title>.md`)
```md
# NNNN <Title>
Date: YYYY-MM-DD   Status: proposed | accepted | superseded by NNNN
## Context  ## Decision  ## Consequences  ## Alternatives considered
```

### 13.3 Pull request template
```md
## What and why
## Screenshots (375 px / 1280 px) — UI changes only
## Checklist
- [ ] Tests added/updated (unit / e2e / Playwright)
- [ ] Migration is expand-only or part of a planned contract step
- [ ] Offline upgrader added (if an offline payload changed)
- [ ] Strings in the catalog; no cross-feature imports
- [ ] Behind flag: <key> / not needed because …
- [ ] Docs updated: feature doc / admin guide / CHANGELOG / ADR
```

### 13.4 Migration checklist
- [ ] Adds only (columns nullable or defaulted, new tables, new indexes `CONCURRENTLY`), or is a
      scheduled contract step whose code removal shipped in an earlier release.
- [ ] No long locks on large tables; backfills as jobs.
- [ ] `CHECK` constraints for registry-backed columns regenerated.
- [ ] Tested against a copy of production-size data on staging.

### 13.5 `CLAUDE.md` (repository root — loaded automatically by every Claude Code session)
```md
# Field Visit Tracker — production build

Read before doing anything: docs/BUILD_PLAN.md (process, structure, rules), docs/GO_LIVE_BUILD_SPEC.md
(requirements), PROGRESS.md (where we are), DECISIONS.md (owner answers and choices).
Behavioural reference (read-only, never push): https://github.com/ayazelahimullick12-droid/Field-Visit-Go-Live

## Non-negotiables
- Work phase by phase (BUILD_PLAN §8); stop at "Owner review" phases.
- This PC has no admin rights and no Docker: embedded Postgres, STORAGE_DRIVER=local, MAIL_DRIVER=log (§3.4).
- Changeability principles (§2): business-changeable things are data; one feature = one folder per layer;
  registries are the single source of truth; new features behind flags; expand → migrate → contract.
- Readable code standard (§16): plain names from the glossary, functions ≤ 40 lines, ≤ 3 params,
  ≤ 3 nesting levels, JSDoc on exports, UI text via t('key'), errors via codes.
- Every PR: tests + docs + CHANGELOG; CI green; checklist §10.1 and §16.12.
- Never commit secrets or real personal data. Never force-push.

## Commands
pnpm dev        start embedded Postgres, migrate, seed, run api + web
pnpm test       unit + e2e (own throwaway database)
pnpm lint       lint + typecheck
pnpm db:reset   wipe and reseed the local database
pnpm gen:api    regenerate the typed API client

## End of every session
Update PROGRESS.md (done / next / open questions) and DECISIONS.md, commit, push.
```

---

## 14. Owner touchpoints

| When | What the owner does |
|---|---|
| Phase 0 | Answers decisions (spec §19), creates accounts/repository |
| End of Phases 3, 4, 8, 11, 14 | Reviews a demo on staging; approves to continue |
| Phase 12 | Spot-checks migrated records |
| Phase 14 | Runs the UAT script; approves go-live |
| After go-live | Uses Admin → Lists, Settings, Wording, Roles, Flags for day-to-day changes; raises feature requests as short descriptions that the AI turns into feature docs |

---

## 15. Starting the build in Claude Code

### 15.1 What the owner does (once)
1. On the PC: `npm install -g pnpm` (no admin needed). Git and Node.js are already installed and Git is
   signed in to GitHub. **No Docker, no admin rights needed** (§3.4).
2. On GitHub: make sure **Go-Live-FV** is **Private** and empty.
3. In the Claude Code app: model **Opus**; permission mode **Accept edits**; Settings → Claude Code →
   prompt suggestions **off**, flash taskbar on notifications **on**, keep awake **on**.
4. Open Claude Code in an **empty folder** and send the **setup prompt** (§15.2). Approve the file it
   creates, type `/exit`, then open a **new chat in the same folder** and send the **kickoff prompt**
   (§15.3).

### 15.2 Setup prompt (first chat, creates the permissions file)
```text
Create .claude/settings.json in this folder with exactly this content, then stop:

{
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": [
      "Bash(pnpm:*)", "Bash(npm:*)", "Bash(npx:*)", "Bash(node:*)",
      "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git add:*)",
      "Bash(git commit:*)", "Bash(git push:*)", "Bash(git pull:*)", "Bash(git fetch:*)",
      "Bash(git clone:*)", "Bash(git checkout:*)", "Bash(git switch:*)", "Bash(git branch:*)",
      "Bash(git merge:*)", "Bash(git stash:*)", "Bash(git restore:*)", "Bash(git mv:*)",
      "WebFetch(domain:github.com)", "WebFetch(domain:raw.githubusercontent.com)"
    ],
    "deny": [
      "Bash(git push --force:*)", "Bash(git push -f:*)",
      "Read(./.env)", "Read(./**/.env)"
    ]
  }
}
```

### 15.3 Kickoff prompt (new chat in the same folder)
```text
You are building the production version of the Field Visit Tracker.

Reference repository (prototype + plans, read-only):
https://github.com/ayazelahimullick12-droid/Field-Visit-Go-Live
Read, in order: BUILD_PLAN.md, GO_LIVE_BUILD_SPEC.md, README.md, then the prototype source.
Never push to that repository; a hosting service may deploy from its main branch.

Production repository (private, empty; build everything here):
https://github.com/ayazelahimullick12-droid/Go-Live-FV
Clone it into this folder (the folder already contains .claude/settings.json; keep it).

Rules:
- Follow BUILD_PLAN.md exactly: phases in order, the changeability principles (§2), local development
  without Docker or admin rights (§3.4), the repository skeleton (§5), the registries (§7), the quality
  gates (§10) and the readable code standard (§16).
- At launch the Management section shows only Summary; Offices, People and Analytics are admin
  switches (spec §20.1).
- First commit: docs/BUILD_PLAN.md, docs/GO_LIVE_BUILD_SPEC.md, CLAUDE.md (template in BUILD_PLAN
  §13.5), PROGRESS.md, DECISIONS.md, .gitignore (including .local/ and .env).
- Then Phase 0: ask me the decisions in GO_LIVE_BUILD_SPEC.md §19 in one message, with the defaults,
  and list anything else I need. Do not write application code until I answer.
- Keep PROGRESS.md and DECISIONS.md up to date and push at the end of every work session.
- Stop for my review at the end of every phase marked "Owner review", and tell me exactly how to
  open the app to check it.
- Never commit secrets or real personal data.
```

### 15.4 Resume prompt (every later chat, same folder)
```text
Resume the Field Visit Tracker build. Read CLAUDE.md, then PROGRESS.md and DECISIONS.md, pull the
latest from Go-Live-FV, tell me in three lines where we are and what is next, then continue.
```

---

## 16. Readable code standard (mandatory)

The owner will add features later, often with a different AI or developer. **Code must be easy to
read by someone who has never seen it.** When readability and cleverness conflict, readability wins.
Every PR is reviewed against §16.12.

### 16.1 The ten rules
1. **Say what it is.** Names describe the business meaning: `assignActionItemToUnit`, not `handle`,
   `process`, `doIt`, `data2`. Use the glossary words (§16.11) exactly.
2. **One job per function, one topic per file.** If you need "and" to describe it, split it.
3. **Short and flat.** Functions ≤ 40 lines, nesting ≤ 3 levels, early returns instead of `else`
   chains, no nested ternaries.
4. **Few parameters.** ≤ 3 positional parameters; otherwise one named object
   (`createVisit({ ownerId, area, date })`).
5. **No magic values.** Numbers and strings with meaning are named constants, settings or registry
   entries (`settings.visits.targetDays`, never `90`).
6. **Types at every boundary.** Inputs and outputs of controllers, services, repositories, hooks and
   components are typed; no `any` (lint error); `unknown` + zod parse for external data.
7. **Pure logic in `packages/shared`.** Calculations (phases, completeness, coverage, deadlines,
   period ranges) are pure functions with unit tests; services orchestrate, they don't calculate.
8. **Side effects at the edges.** Database, network, time and randomness are injected or wrapped
   (`clock.now()`, `ids.newId()`), so logic is testable and readable.
9. **Comments explain why, not what.** Every exported function has a one-line JSDoc summary; add
   a "why" comment wherever a reader might ask "why is it done like this?". No commented-out code.
10. **Same thing, same shape.** Every feature folder looks the same (§5); every controller, service,
    repository, page, form and hook follows the templates below. Copy the template, then fill it in.

### 16.2 Enforced by tooling (CI fails if broken)
```jsonc
// packages/config/eslint (excerpt)
{
  "rules": {
    "complexity": ["error", 10],
    "max-depth": ["error", 3],
    "max-lines-per-function": ["error", { "max": 40, "skipComments": true, "skipBlankLines": true }],
    "max-lines": ["error", { "max": 300, "skipComments": true, "skipBlankLines": true }],
    "max-params": ["error", 3],
    "no-nested-ternary": "error",
    "no-magic-numbers": ["warn", { "ignore": [0, 1, -1, 2, 100], "ignoreArrayIndexes": true, "enforceConst": true }],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-module-boundary-types": "error",
    "id-length": ["error", { "min": 2, "exceptions": ["i", "j", "x", "y", "_"] }],
    "import/no-cycle": "error",
    "jsdoc/require-jsdoc": ["error", { "publicOnly": true }],
    "no-restricted-syntax": ["error", { "selector": "JSXText[value=/[A-Za-z]{3,}/]", "message": "Use t('key') for UI text." }]
  }
}
```
Plus: Prettier (formatting is never discussed in review), `tsc --noEmit` strict, `knip` (unused
files/exports), and a boundaries rule (features may not import other features).
Exceptions need an inline `// eslint-disable-next-line <rule> -- <reason>`; reviewers check the reason.

### 16.3 File size and structure limits
| Kind | Soft limit | When exceeded |
|---|---|---|
| React component file | 200 lines | extract sub-components into `components/` |
| Page component | 150 lines | move logic into a hook (`useXPage`) and sections into components |
| Service | 300 lines | split by use case (`action-items.assign.service.ts`, `…transitions.service.ts`) |
| Repository | 250 lines | split by aggregate |
| Function | 40 lines | extract named helpers |

### 16.4 Naming dictionary
| Kind | Pattern | Examples |
|---|---|---|
| Boolean | `is/has/can/should` + adjective | `isDone`, `hasVoiceNote`, `canAssign` |
| Function doing an action | verb + object | `submitEntry`, `scheduleReminder`, `computeCoverage` |
| Function returning a value | noun or `get` + noun | `visitPhase(visit)`, `getUnitFixers(unitId)` |
| Event handler (web) | `on` + event / `handle` + event | `onSubmit`, `handleAssignClick` |
| React hook | `use` + noun | `useVisit(id)`, `useActionItemQueue()` |
| Constant | UPPER_SNAKE | `MAX_TITLE_LENGTH` |
| Zod schema | noun + `Schema` | `actionItemSubmitSchema` |
| Type from schema | PascalCase | `ActionItemSubmit` |
| Test | "does X when Y" | `it("refuses changes once the visit is done")` |
Avoid abbreviations except: `id`, `url`, `api`, `db`, `vo`, `ro`, `ao`, `bo`.

### 16.5 Comments and documentation in code
- **File header** (every file): one or two lines saying what the file is for and where it is used.
- **Exported functions/components:** JSDoc with summary, `@param` only when not obvious, and a short
  `@example` for shared business functions.
- **Business rules in code** reference the spec: `// Spec §6.5: only fixers of the assigned unit may start work.`
- **Each feature folder** has a `README.md` (10–30 lines): purpose, main files, events emitted and
  consumed, permissions used, link to `docs/features/<feature>.md`.
- **`docs/CODEBASE_TOUR.md`**: a one-page guided tour (how a request flows from a button to the
  database and back, where registries live, how to add a feature) kept current.

### 16.6 Error handling
- Throw domain errors with stable codes (`throw new DomainError('VISIT_DONE_LOCKED')`), never strings.
- One global filter maps errors to HTTP responses; services never build HTTP responses.
- The web shows catalog messages for codes; never raw messages or stack traces.
- Never swallow errors silently; log with context (`logger.warn({ visitId }, 'sync rejected: visit done')`).

### 16.7 Template — API controller (thin)
```ts
// apps/api/src/features/action-items/action-items.controller.ts
// HTTP entry points for action items. Validation and permissions here; all logic in the service.
@Controller({ path: 'action-items', version: '1' })
export class ActionItemsController {
  constructor(private readonly actionItems: ActionItemsService) {}

  /** Runs one workflow transition (assign, start, fix, longTerm, extend) on an action item. */
  @Post(':id/transitions/:transition')
  @Requires('actionItem.transition')            // fine-grained check happens in the service
  async runTransition(
    @Param('id') id: string,
    @Param('transition') transition: TransitionKey,
    @Body(new ZodPipe(transitionInputSchema)) input: TransitionInput,
    @CurrentUser() user: SignedInUser,
  ): Promise<ActionItemDto> {
    return this.actionItems.runTransition({ id, transition, input, user });
  }
}
```

### 16.8 Template — API service (orchestrates)
```ts
// apps/api/src/features/action-items/action-items.service.ts
// Use cases for action items. Reads the workflow registry; never contains SQL.
@Injectable()
export class ActionItemsService {
  constructor(
    private readonly repo: ActionItemsRepository,
    private readonly policies: ActionItemsPolicies,
    private readonly effects: ActionItemEffects,
    private readonly events: EventBus,
    private readonly db: Db,
  ) {}

  /** Applies a workflow transition after checking the state, the permission and the actor. */
  async runTransition({ id, transition, input, user }: RunTransitionArgs): Promise<ActionItemDto> {
    const item = await this.repo.getOrThrow(id);
    const rule = actionItemWorkflow.transitions[transition];

    this.policies.assertCanRun(user, item, rule);          // throws ACTION_ITEM_NOT_UNIT_FIXER etc.
    assertTransitionAllowed(item.status, rule);            // pure, from packages/shared

    return this.db.transaction(async (tx) => {
      const updated = await this.repo.applyTransition(tx, { item, rule, input, actorId: user.id });
      await this.effects.run(tx, rule.effects, { item: updated, input, actor: user });
      await this.events.publish(tx, new ActionItemStatusChanged(updated, transition, user.id));
      return toActionItemDto(updated);
    });
  }
}
```

### 16.9 Template — API repository (all database access)
```ts
// apps/api/src/features/action-items/action-items.repository.ts
// Every Prisma query for action items lives here, so services read like plain English.
@Injectable()
export class ActionItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Loads an action item or throws NOT_FOUND. */
  async getOrThrow(id: string): Promise<ActionItemRecord> {
    const item = await this.prisma.actionItem.findUnique({ where: { id }, include: ACTION_ITEM_INCLUDE });
    if (!item) throw new DomainError('NOT_FOUND');
    return item;
  }

  /** Items in the queue of a unit, past-deadline first, then soonest deadline. */
  listQueue(unitId: string): Promise<ActionItemRecord[]> {
    return this.prisma.actionItem.findMany({
      where: { assignedUnitId: unitId, state: 'SUBMITTED' },
      orderBy: [{ deadline: 'asc' }],
      include: ACTION_ITEM_INCLUDE,
    });
  }
}
```

### 16.10 Template — shared pure function, web page, form, hook and test
```ts
// packages/shared/src/features/visits/rules.ts
// Pure visit rules shared by the API and the web app.

/**
 * Where a visit is in its life: done, upcoming, due (back but not marked done) or in progress.
 * @example visitPhase({ status: 'OPEN', date: '2026-10-20', ... }, now) // 'upcoming'
 */
export function visitPhase(visit: VisitDates, now: Date): VisitPhase {
  if (visit.status === 'DONE') return 'done';
  if (startOf(visit) > now) return 'upcoming';
  const returnAt = returnOf(visit);
  if (returnAt && returnAt <= now) return 'due';
  return 'progress';
}
```
```tsx
// apps/web/src/features/action-items/pages/MyActionItemsPage.tsx
// "My action items": the signed-in user's action items, grouped by status, with search and filters.
export function MyActionItemsPage(): JSX.Element {
  const { t } = useMessages();
  const { groups, filter, setFilter, query, setQuery, isLoading } = useMyActionItemsPage();

  if (isLoading) return <PageSkeleton />;
  if (groups.total === 0) return <EmptyState text={t('actionItems.mine.empty')} />;

  return (
    <Page title={t('actionItems.mine.title')} description={t('actionItems.mine.description', { count: groups.total })}>
      <SearchBox value={query} onChange={setQuery} placeholder={t('actionItems.mine.search')} />
      <StatusFilterChips value={filter} onChange={setFilter} counts={groups.counts} />
      {groups.visible.map((group) => (
        <ActionItemGroup key={group.key} group={group} />
      ))}
    </Page>
  );
}
```
```ts
// apps/web/src/features/action-items/queries.ts
// TanStack Query hooks for action items. One hook per endpoint; keys from queryKeys.ts.

/** The signed-in fixer's unit queue. Refetches when a transition succeeds. */
export function useActionItemQueue() {
  return useQuery({ queryKey: queryKeys.actionItems.queue(), queryFn: () => api.actionItems.listQueue() });
}
```
```ts
// apps/api/src/features/action-items/__tests__/transitions.e2e.spec.ts
describe('action item transitions', () => {
  it('lets any fixer of the assigned unit start work', async () => { /* Given / When / Then */ });
  it('refuses a fixer from another unit with ACTION_ITEM_NOT_UNIT_FIXER', async () => { /* … */ });
  it('stops reminders once the item is marked long term', async () => { /* fake clock */ });
});
```

### 16.11 Glossary (use these words in code, docs and UI)
| Word | Meaning | Code name |
|---|---|---|
| Visit | A field visit registered by a staff member | `Visit` |
| Visit area | Division → District → Area of a visit | `division`, `district`, `area` |
| Planned offices | Offices selected when registering | `VisitOffice` |
| Entry | Anything recorded on a visit | `Entry` (base), per type below |
| Action item | A problem to fix (formerly "complaint") | `ActionItem` |
| Client interaction | Client feedback with ratings | `ClientInteraction` |
| Observation | Something observed (may be referred by BRAC staff) | `Observation` |
| Story | A post with likes, comments, share | `Story` |
| Office visit | One (visit, office) pair used by analytics | `OfficeVisitRecord` |
| Unit / Team | Routing unit for action items and its sub-group | `Unit`, `Team` |
| Fixer pool | All fixers of a unit | `unitFixers` |
| Department | An employee's department (not the unit) | `User.department` |
| Coverage | Branch visited within the target days | `coverageStatus` |
| Completeness | The 5-check information score | `completenessScore` |
| Feature switch | Admin on/off for a part of the app | `FeatureFlag` |

### 16.12 Readability review checklist (copy into every PR review)
- [ ] Could a new developer tell what each changed file does from its header and names alone?
- [ ] Every function ≤ 40 lines, one job, ≤ 3 params, ≤ 3 nesting levels, no nested ternaries.
- [ ] Names use the glossary; no abbreviations outside the allowed list.
- [ ] Business numbers/strings come from settings, registries or named constants.
- [ ] Pure logic lives in `packages/shared` with unit tests; services orchestrate; repositories hold queries.
- [ ] Exported functions have JSDoc; non-obvious decisions have a "why" comment with a spec reference.
- [ ] UI text via `t()`; errors via codes; empty/loading/error/offline states handled.
- [ ] The feature folder `README.md` and `docs/features/<x>.md` reflect the change.
- [ ] Tests read like a specification ("does X when Y").

