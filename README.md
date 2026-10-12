# Field Visit Tracker — local dev setup

Three React apps sharing one JSON-file "database":

- **Landing / sign-in** — `index.html` (served at `/`) → the one login
  screen for everyone, with an **Admin / User** picker up top. This is
  where every session starts now; there's no more plain link page.
- **Staff app** — `staff.html` → register a visit (only the date is needed
  up front), then record **complaints, client interactions, observations
  and stories**, each tied to one office (branch, VO, area or region office),
  each saved as a draft until it's submitted on its own, with photos and
  voice notes (see §3c). "Mark as done" closes the visit. It keeps working
  without signal and sends everything once the phone is back online (§6a).
  It also has a story feed, a "My Complaints" tab, and — for **Fixers** — a
  "Fixer Queue" tab right in the same app. **Management** users additionally
  get a **Details** tab (the management view, §3a) and a **Branch 360°
  profile** for every field office. Navigation is a sidebar on the left on
  laptops and a bottom tab bar on phones.
- **Admin console** — `admin.html` → assign complaints to each unit's
  fixer, set deadlines, see the **Network health** coverage view (admin-only
  for now), manage units & teams / employees, maintain the **field
  office master list** and the visit target (see §3b), set the **client
  rating questions** (§3d), and a Sent Emails log.

All three share one design system (`src/styles/brac.css`, see §8) styled
after brac.net — Helvetica Neue, brand magenta on deep forest green, pill
buttons, rounded white cards — with count-up numbers, staggered reveals, an
animated map and a mobile layout (bottom tab bar, sheets instead of modals,
tables that turn into cards). Animations switch off under
`prefers-reduced-motion`.

You never navigate to `staff.html`/`admin.html` directly with a browser
bookmark expecting a login form — both now redirect back to `/` if there's
no valid session, since signing in only happens on the landing page.

Both talk to a small local API server (`server/index.js`) that reads and
writes `server/db.json`. Every change is saved to that file, so data
survives a refresh or a restart.

## 1. Prerequisites

- **Node.js 18+** — https://nodejs.org (LTS). Check with `node -v`.

## 2. Install & run

```bash
npm install
npm run dev
```

This starts the API server (**http://localhost:4000**) and the Vite dev
server (**http://localhost:5173**) together. (If port 4000 is already taken,
run the API with `PORT=4100` and the dev server with `API_PORT=4100` so its
proxy follows.) Open:

- http://localhost:5173/ — **start here.** Sign-in page with the Admin /
  User picker; successful login forwards you to the right app.
- http://localhost:5173/staff.html — staff app (redirects to `/` if you're
  not signed in)
- http://localhost:5173/admin.html — admin console (same redirect rule)

## 3. Signing in

**PIN and password is the only way to sign in**, for everyone. The landing
page (`/`) has two tabs:

- **User** — PIN + password, plus the registration form. Every employee is
  tracked by a **unique PIN**. Registering asks for name, phone number,
  email, PIN, password, and a re-typed password, all required (the email is
  still used for assignment emails to fixers). New registrations land on
  this tab as a plain `field` employee.
- **Admin** — admin PIN + password against the `adminUsers` collection
  (a list, not a single shared login — see §9).

Email sign-in and the SSO placeholder button have been removed.

**Four kinds of user**:

| User type | Signs in to | Gets |
|---|---|---|
| **Base user** (`field`) | staff app | register visits; record complaints, client interactions, observations, stories; story feed; My complaints |
| **Fixer** (`fixer`) | staff app | everything a base user has, plus the **Fixer queue** (complaints assigned to them) |
| **Management** (`management`) | staff app | everything a base user has, plus the **Details** tab (the management view) and Branch 360°; can be picked as a supervisor, who receives escalations |
| **Admin** | admin console | complaints center, network health, units, employees, offices, client questions, emails, **admin accounts** |

An employee can be more than one of base user / fixer / management (they are
tags on the employee record, set in admin console → Employees). Admins are
separate accounts, listed and managed under **Employees → Admin accounts**.
The old `supervisor` tag became `management` in the data upgrade (§9a).

**Demo accounts** seeded in `server/db.json`:

| User type | Name | PIN | Password |
|---|---|---|---|
| Base user | Ayaz Elahi | `1234` | `password123` |
| Base user | Nusrat Jahan | `6001` | `normal123` |
| Fixer | Tariqul Islam (Software) | `3001` | `fixer123` |
| Fixer | Marium Begum (Finance) | `3005` | `fixer123` |
| Management | Farzana Akter | `7001` | `mgmt123` |
| Management | Delwar Hossain | `7002` | `mgmt123` |
| Admin | Ayaz Elahi Mullick | `9001` | `admin123` |
| Admin | Rezwana Karim | `9002` | `admin456` |

Fixers and management users sign in through the *same* User tab as anyone
else — their extra tabs just appear once signed in.

**Staying signed in**: the staff/fixer/management session (which employee
is active) is remembered in the browser's `localStorage`, so a page reload
does not log you out — it re-resolves your id against the live employee
list, so if admin changes your user type or unit it takes effect without
needing to log out and back in. The admin session is remembered in
`sessionStorage` (survives a reload, clears when the tab is closed).
Signing out from either app sends you back to `/`.

Because PINs are the tracking key, they must be **unique across every
employee** — both the register screen and the admin console's manual
"Add Employee" form enforce this.

### 3a. Management: the Details tab & Network health

Management users get the normal dashboard (exactly what a base user sees)
plus a **Details** tab in the sidebar (bottom bar on phones) — the
management view. It is read-only and organization-wide (every submitted
entry on record, not just theirs). The separate **Network health** view
(below) is **admin-only for now**.

**Details** — four headline numbers (visits on record, visits this month,
open complaints, resolution rate) and two analytics tabs:

- **Visits** — visit density, visits and average rating by division /
  district, visits over time, the mix of visit reasons (onboarding,
  monitoring, training…) and **"Was the information gathered properly?"**
  — each office of a visit is scored on five equal checks (registered, an
  observation recorded, a client interaction rated, something recorded at
  that office, and descriptions, photos or voice notes captured), so thin
  visits are visible. Average ratings come from client interactions only;
  observations have no stars.
- **Complaints** — the whole path **from visit to resolution**: a funnel
  (filed → assigned → in progress → resolved), how long open complaints have
  waited, complaints by unit, resolution ratio per unit
  (Success = resolved without ever missing its deadline, Fail = escalated at
  least once), status by unit, urgency mix and the busiest
  **teams**.

Both share a Division → District → Area → Branch location filter and a date
filter (on the Visits tab they sit beside its map; Complaints has no map, so
its filters are a bar above the charts).

**Network health** — in the admin console, its own tab right after
"Complaints" (admins only, for now). It answers *are all field offices being
visited?*. Management users don't see it, and their Management view map is
visits-only: no Coverage switch, no status-coloured pins, no "% on track"
figures. To give it to management as well, set
`managementSeesNetworkCoverage: true` in `src/lib/features.js` — that adds a
"Network health" tab beside "My complaints" and restores coverage on their
visits map.

- a coverage ring plus headline KPIs: offices never visited, offices overdue
  (not visited within the visit target — 90 days by default, see §3b), visits
  this month, average rating, **information completeness** and the complaint
  resolution rate;
- an interactive **coverage map** of Bangladesh with its **filters right
  beside it** (above it on phones), sized to fit the screen together, so
  choosing a division / district / area / branch and watching the map zoom
  happen in one view. Tap a division to zoom in,
  then a district, then an area cluster, then a branch pin; drag to pan,
  Ctrl/⌘ + scroll or the +/− buttons to zoom. Division and district names
  appear as you zoom, thinned out by a collision-aware label planner so the
  map never gets crowded. Fills show coverage % (green ≥ 80%, amber 50–79%,
  red < 50%) or, via the toggle, visit volume. Pins are coded by **shape and
  colour** (green dot = visited recently, amber diamond = overdue, crossed
  red dot = never visited);
- a **Needs attention** list (never visited first, then longest overdue), a
  coverage breakdown chart, and a searchable, CSV-exportable table of every
  office.

Clicking any office — on the map, in a list or via **Ctrl/⌘ + K** quick
search — opens its **Branch 360° profile**: status, visit history (with the
details of the client / staff member when they were recorded), average ratings, open
complaints, information completeness and a one-click "Register a visit
here" (admins can open the profile too, without that button). Back returns
to whichever page you came from.

The map's boundary data — `src/lib/bd-divisions.geojson.json` (8 divisions)
and `src/lib/bd-districts.geojson.json` (64 districts, simplified from ~1.5MB
down to ~250KB with `@turf/simplify` so it doesn't bloat the bundle) — comes
from [geoBoundaries](https://www.geoboundaries.org) (ADM1/ADM2 Bangladesh,
CC0 / public domain) and is rendered client-side with `d3-geo` — no external
map tiles or API calls, so it works fully offline. **Note for anyone
re-fetching this data**: geoBoundaries' exports had every polygon ring wound
backwards for `d3-geo`'s purposes (it uses ring winding to know which side of
a boundary is "inside" a shape) — if you replace either file, re-run the
same fix: for every ring, if `d3.geoArea` on it comes out above 2π, reverse
the ring's point order.

Unlike `fixer`, there's no one-per-unit limit on `management` — check
it on as many employees as should see the dashboard.

### 3b. The field office master list & visit target

Coverage can only be measured against a list of *all* offices, so the app
keeps one: the `offices` collection (78 seeded branches across all 8
divisions). It drives three things — the Division → District → Area →
Branch dropdowns when registering a visit, the coverage maths, and the map pins.

In the admin console's **Offices** tab an admin can:

- **Add / edit offices** (division, district, area office, branch name and
  optional latitude/longitude). Without coordinates a pin is drawn
  approximately inside its district. Renaming or moving an office relinks its
  past visits automatically; an office that has visit history can't be
  deleted — **Retire** it instead (it stops counting toward coverage but its
  records stay).
- **Import / export CSV** — columns `Branch, Area, District, Division,
  Latitude, Longitude, Active`. Import only adds new offices (existing
  district + branch pairs are skipped) and accepts either "Chattogram" or
  "Chittagong".
- Set the **visit target** — the number of days after which an unvisited
  office is flagged **Overdue** (default 90, stored in the `settings`
  collection as `{ "visitTargetDays": 90 }`). Changing it updates the
  dashboard, map and branch profiles immediately.

### 3c. Registering a visit, and filling it in over time

There is no step-by-step wizard. A visit is registered with only its date;
everything else — where it is, the offices on the route, the times, where
you're staying — can be added or changed later, and entries can be added in
any order, on the day or on the way back.

1. **Register** (New visit) — the same fields as before, in the same order:
   - **Where you're going** *(optional, can be added later)*: Division →
     **Region** → Area (from the office master list, §3b), then the
     branches on the route like stops on a ride (**Add another branch**; the
     selected Area's branches are listed first, then the other areas in the
     same Region). **Visiting an Area/Region Office or Village Organisation
     too?** adds one of those: area offices are limited to the selected
     Region (or Division), region offices to the selected Region / Division,
     and VOs to those under the branches already on the route.
   - **Reason** — choosing **Other** asks you to type the reason (required).
   - **When** — the visiting date (the only required field), visiting time,
     returning date and time, and the calculated duration. Times are picked
     on a **clock face** (Material Design's time picker: tap the hour, it
     moves on to the minutes, AM/PM beside it; tapping a minute lands on the
     nearest 5, dragging picks any minute; the keyboard button switches to
     typing the time).
   - **Where you're staying** *(optional)* — hidden behind **Add where you're
     staying**, the way a hotel is an optional part of a trip request. Pick
     a **BRAC Learning Centre (BLC)** from the list (or type another BLC), a
     hotel, guest house, BRAC office or other place, with check-in /
     check-out dates and notes (room, contact). Several stays can be added.
2. **The visit page** (open a visit from the dashboard or Visits):
   - **Where** — the Division › Region › Area path and the planned offices,
     shown compactly. **Change** opens the same route editor right there
     (branches, add another branch, area/region office or VO) and saves as
     you go.
   - **Visit details** — when, reason, where you're staying; **Edit** opens
     the full form (also reachable from "Add return" / "Add where you're
     staying").
   - **Four tiles: Complaint, Client interaction, Observation, Story** —
     each shows how many drafts and submitted entries it has. Tap a tile to
     see its entries (**drafts first, then submitted**); tap **+** (or **New**)
     to add one.
   - **Mark as done** — closes the visit (data entry for it is complete). It
     only needs the visiting and returning dates; nothing else is required.
     If drafts remain, you can submit the ones that are ready in the same
     step; incomplete drafts stay on the visit unsent. A done visit is
     read-only.
3. **The forms** — description first (with **Record a voice note**, §5; a
   voice note counts as the description and can be written up later), the
   office it's about last:
   - **Complaint**: description → urgency → photo → **Assign to** (a
     **Unit**, then one of its **Teams**; **Undefined** when you're not
     sure — the admin routes it) → who it's from (optional) → consent.
   - **Client interaction**: what the client said → **1–5 stars on each
     question the admin has set** (§3d; any can be skipped) → **Client
     information**, always open (name, phone, member number, VO code,
     **Branch code**, **Project code** — all optional) → optional photo.
   - **Observation**: description → photo → **Was this observation from
     staff?** — ticking it asks for the staff member's details (optional).
   - **Story**: a photo and a caption for the story feed.
   - **Which office is this about?** — every entry belongs to **one office**:
     Division → Region → Area → Office (the region office, the area office or
     a branch) → optionally a **VO** under that branch. It starts from what
     the visit already has (e.g. down to the Area), and the planned offices
     are offered as one-tap chips. The office is needed to submit.
   Details left empty are saved as "Not mention".
4. **Draft or submit, per entry** — anything not submitted is a **draft**:
   **Save draft**, or just close the form (it's kept as a draft). **Submit**
   asks **"Are you sure you want to submit?"**; a submitted entry can't be
   edited (it opens read-only). **A complaint reaches the admin as soon as it
   is submitted**, and client interactions, observations and stories count
   in the analytics from then on.

Each visit moves through **Upcoming** (registered for a later date) →
**In progress** → **Back, not marked done** (the returning time has passed)
→ **Done**. Visit cards show the stage, where and when, the planned offices,
where you're staying, the entry counts and how many drafts are unsent.

### 3d. Client rating questions

Admin console → **Client questions**: add, reword, reorder or switch off
the questions clients are asked to rate. Each switched-on question gets 1–5
stars and a client's overall rating is the average (that's what the
analytics and Branch 360° show). A question that already has answers can
only be switched off, not deleted, and every answer stores the wording it
was given with, so rewording a question doesn't change old answers. Stored
in `settings.clientRatingQuestions`.

## 4. The complaint workflow, end to end

1. A field employee records a complaint during a visit (staff app), choosing
   a **unit**, then one of its **teams** (every unit with teams requires
   one; **Undefined** — for when they're not sure — has none), and
   optionally attaching a real photo (taken or picked from the device —
   resized client-side before it's stored) or a voice note, and the office
   it is about. It reaches the admin's queue, as "Open", **as soon as it is
   submitted** (not when the visit is marked done).
2. In the admin console's **Complaints** tab, an "Open" complaint is
   assigned: if it was filed as "Undefined", the admin picks the real
   unit (and, optionally, a team); otherwise the unit and team are already
   known. Either way, the
   admin sets how many days the assignee gets, and clicks **Confirm
   assignment & set deadline** — this is the one admin action that:
   - assigns it to **that unit's one fixer** (each unit has
     exactly one — see §4a),
   - sets the deadline,
   - generates an **assignment email** (logged, not actually sent — see §7).
3. **Reminder**: 24 hours before the deadline (or 48 hours, if more than 2
   days were given), a reminder email is generated for the assignee.
4. **Escalation**: if the deadline passes and the complaint isn't resolved,
   an escalation email is generated automatically to the assignee's
   **supervisor** — no admin action needed. The complaint shows up under
   "Escalated — awaiting extension" in the admin console.
5. Once the supervisor (in real life) tells the admin how much extra time
   to grant, the admin opens that complaint and clicks **Grant Extension**
   with the number of days (the complaint's detail view also shows a
   Filed → Assigned → Being fixed → Resolved progress strip and its full
   activity timeline). This resets the deadline and the whole
   reminder/escalation cycle repeats against the new deadline.
6. The assigned fixer sees the complaint in their **Fixer Queue** tab
   (staff app) — in progress first, resolved last — with the full timeline,
   photo, its unit/team and **who raised it and how to reach them**
   (the staff member's or member's details, if given; a complaint whose
   source declined follow-up is flagged "No consent to follow up"). The
   fixer marks it **Resolved** themselves when it's done. Admin sees the
   same details in the Complaints tab (and can search by them), and they are
   included in the assignment email.

Units and employees (name, number, email, PIN, password, unit,
supervisor, and user type: Base user `field` / Fixer `fixer` / Management
`management`) are all managed from the admin console — no code changes
needed to add either. An admin turns any existing employee into a fixer (or
a management user) just by ticking it on their record; the corresponding tab
appears the next time they load the staff app. Supervisors are picked from
Management. Admin accounts are managed in the same tab (Admin accounts).

### 4a. One fixer per unit

Each unit has **exactly one** fixer — there's no round robin or
queueing between multiple people. Checking the `fixer` role on an employee
(admin console → Employees) automatically un-checks it on whoever held it
before for that same unit, so the invariant always holds. Assigning
a complaint always goes straight to that one person.

## 5. Photos and voice notes

**Voice notes** are recorded in the browser (`MediaRecorder`, up to 5
minutes each) for complaints, client interactions and observations. A
recording is kept on the phone (IndexedDB) until the visit syncs, then uploaded with `POST /api/uploads` and stored as a file in
`server/uploads/`; the entry keeps `{ blobId, url, dur, mime }`. Browsers
only allow the microphone on **HTTPS or localhost** — on a phone testing
against a plain `http://192.168…` address, recording won't start. Like
db.json, `server/uploads/` is local disk: on hosts with a temporary disk
(e.g. Render without a persistent disk) the files are lost on redeploy.

**Photo** capture is real: `<input type="file" accept="image/*" capture>` →
the image is drawn onto a canvas and downscaled (max ~1000px, JPEG ~72%
quality) client-side → stored as a data URL directly on the entry, which
also means a photo taken offline is simply part of the visit saved on the
phone. There's no separate file server for photos, so:
- Photos live inside `server/db.json` itself (as base64 strings) — fine
  for demoing, but will bloat that file with heavy use. Swap in real
  object storage (S3, Cloudinary, etc.) before this sees production
  traffic.
- The resize step keeps individual photos reasonably small, but there's
  no cap on *how many* photos accumulate over time.

## 6a. Working without signal

Field staff often finish reports in the car on the way back, so the staff
app keeps working offline once it has been opened online:

- **Visits** are kept on the phone (IndexedDB). Every change shows at once
  and is queued; the queue is sent when the phone is back online (and every
  20 seconds while anything is waiting). The visit page and the dashboard
  show **"Saved on this phone · sends when online"** until it's sent.
  Each visit is sent on its own (`PUT /api/visits/:id`), so a phone that
  syncs late never overwrites anyone else's visits.
- **Reference data** (employees without passwords, units, offices,
  settings) is copied to `localStorage` after each successful load, so you
  stay signed in and the forms still have their lists. A device copy is
  read-only: it is never written back to the server.
- **The app itself** opens offline thanks to a service worker
  (`public/sw.js`, production builds only — `npm run dev` doesn't register
  it).
- Things that need the server (signing in for the first time, the fixer's
  "Mark resolved", liking a story) say so when there's no connection.

## 6. Reminders/escalations without anyone logged in

The server runs a background check every 5 minutes
(`DEADLINE_CHECK_INTERVAL_MS` in `server/index.js`) that generates any
reminder/escalation emails that are due — independent of whether the
admin console is open.

**Caveat for Render's free tier**: the service sleeps after a period of
inactivity, so the 5-minute timer only runs while the service is awake.
For demos, use the **"Run deadline check"** button in the admin
console's Complaints tab to trigger the same check on demand.

## 7. About the emails — this is a log, not real delivery

Every email the system "sends" (assignment / reminder / escalation /
extension) is generated as a record in the `emailLog` collection and shown
in the admin console's **Sent Emails** tab — full subject and body,
searchable. **No real email is dispatched.** To wire in real delivery,
add an SMTP or transactional-email API call (e.g. Nodemailer, Resend,
SendGrid) inside `pushEmail()` in `server/logic.js`, using environment
variables for credentials — never hardcode them.

## 8. Dark / light mode

Every app has a theme toggle in its nav bar. The choice is saved per
browser (`localStorage`, key `fvt-theme`) via `src/lib/theme.js`. The page's
default browser margin/background is reset to the theme's own background
colour, so there's no stray white edge in dark mode.

**Design system.** All styling lives in one file, `src/styles/brac.css`,
built from CSS variables (colour, radius, shadow, motion) with a light and a
dark set. To re-skin the product — e.g. to the official BRAC palette or
logo — change the variables at the top of that file (the brand mark in
`src/lib/AppShell.jsx` is a generic pin icon; drop the official logo asset in
there). Shared building blocks: `AppShell` (left sidebar on laptops; top bar +
bottom tab bar on phones),
`ui.jsx` (count-up numbers, scroll-reveal, sparkline, delta chips, progress
ring, CSV download), `charts.jsx` (self-sizing SVG charts),
`InteractiveMap.jsx` and `CommandPalette.jsx`. On phones: a floating bottom
tab bar with a raised "New visit" button, forms become bottom sheets, wide
tables become stacked cards (add `data-label` to each `<td>` and the class
`stack` to a `ctable`), and inputs are 16 px so iOS doesn't zoom.

## 9. Data model

`server/db.json` collections:

```
employees        — every staff-app user: base users, fixers, management
                    (the tags can overlap — e.g. a base user can also be
                    management). `pin` is unique across every employee (it's
                    the login key). { id, name, phone, pin, email, password,
                    departmentId, supervisorId, roles: ["field"|"fixer"|"management"] }
visits           — one record per visit; every complaint, client interaction,
                    observation and story is nested in it, each tied to the
                    office it is about (see below).
departments      — { id, name, units: [{ id, name }] }, managed in the admin
                    console's **Units** tab (**Teams** panel). NOTE the
                    wording: the interface calls a stored *department* a
                    **Unit** and a department's stored *unit* a **Team**
                    (see src/lib/terms.js) — the keys kept their original
                    names. A complaint is assigned to a Unit and one of its
                    Teams; the seeded names are placeholders — replace them with
                    the real ones there.
offices          — the field office master list (see §3b):
                    { id, name, type: "branch", division, district, area,
                    lat, lng, active }. A visit is linked to its office by
                    district + branch name.
settings         — { visitTargetDays, clientRatingQuestions: [{ id, text, active }] }
                    — the "Overdue after N days" target and the client
                    rating questions (§3d).
adminUsers       — [{ id, name, email, pin, password }, ...] — admin console
                    logins (PIN + password), managed in admin console →
                    Employees → Admin accounts; each is a full admin.
emailLog         — every generated email (see §7).
```

A visit:

```json
{
  "id": "V-XXXXXX", "schema": 3, "employeeId": "...", "employeeName": "...",
  "division": "...", "region": "...", "area": "...",          // all optional
  "stops": [ { "kind": "branch|office|vo", "name": "Mirpur Branch", "division": "...", "region": "...", "area": "..." } ],
  "reason": "Monitoring|…|Other", "reasonOther": "typed reason when Other",
  "date": "2026-10-12", "visitTime": "10:30", "returnDate": "", "returnTime": "",
  "stays": [ { "id": "SY-…", "type": "BRAC Learning Centre (BLC)|Hotel|Guest house|BRAC office|Other",
               "name": "BLC Khulna (Khalishpur)", "checkIn": "2026-10-12", "checkOut": "2026-10-13", "notes": "" } ],
  "status": "open|done", "doneAt": null,
  "complaints":   [ { …see below… } ],
  "interactions": [ { "id": "CI-…", "place": {…}, "state": "draft|submitted", "submittedAt": null,
                      "description": "...", "voice": null,
                      "ratings": [ { "questionId": "RQ-…", "question": "wording at the time", "stars": 4 } ],
                      "person": { "name": "…", "branchCode": "…", "projectCode": "…" }, "photoUrl": null, "time": "..." } ],
  "observations": [ { "id": "OB-…", "place": {…}, "state": "draft|submitted", "description": "...", "voice": null,
                      "photoUrl": null, "fromStaff": true, "staff": { "name": "…", "pin": "…" }, "time": "..." } ],
  "stories":      [ { "id": "ST-…", "place": {…}, "state": "draft|submitted", "caption": "...", "photoUrl": null, "likes": 0, "time": "..." } ],
  "lastPlace": { … }                                 // the office the next new entry starts at
}
```

Every entry's `place` is the office it is about:
`{ "division", "region", "area", "office": "VO-142 · Mirpur Branch", "officeKind": "branch|vo|area|region", "branch": "Mirpur Branch" }`.

The analytics, coverage map and Branch 360° still work in one-office
records: `expandVisits()` (`src/lib/visits.js`) turns each visit into one
record per office — the planned offices of done visits, plus every office
with **submitted** entries. Drafts never reach the analytics or the admin.

A complaint, nested inside its visit's `complaints` array, carries:

```json
{
  "id": "FC-XXXXXX",
  "place": { "office": "Dhanmondi Branch", "officeKind": "branch", "...": "..." },   // the office it is about
  "state": "draft|submitted", "submittedAt": "...",
  "department": "Construction",   // shown as the Unit ("Undefined" when the filer wasn't sure)
  "unit": "Civil Works",             // shown as the Team
  "voice": null,                     // { blobId, url, dur, mime } when recorded
  "source": "staff|member",
  "person": { "name": "…", "pin": "…" },   // optional; staff: name/pin/designation/department/contact, member: name/phone/memberNumber/voCode/branchCode/projectCode
  "description": "...", "urgency": "Medium", "status": "Open|In Progress|Resolved",   // status is added on submit
  "photoUrl": null,
  "filedBy": "...", "filedDate": "...",
  "assignedEmployeeId": null, "assignedTo": null, "assignedEmployeeEmail": null,
  "supervisorId": null, "supervisor": null, "supervisorEmail": null,
  "deadline": null, "deadlineSetAt": null, "deadlineDays": null,
  "deadlineHistory": [],
  "reminderSent": false, "escalated": false, "escalatedAt": null,
  "resolvedAt": null, "resolvedBy": null,
  "log": [ { "label": "...", "time": "..." } ]
}
```

### 9a. The data upgrades

On start, `server/index.js` runs `server/migrate.js`, which upgrades any
older visit, one step at a time, and changes nothing on a second run:

- **Schema 1 → 2** (single location + four-step wizard → a route of stops):
  the location becomes a one-stop route, staff/member feedback becomes
  observations (an old member star rating is kept as an answer to "Overall
  rating (before rating questions)"), the story becomes a story entry,
  registered visits become submitted, and empty wizard drafts are dropped.
- **Schema 2 → 3** (per-entry drafts, offices and "Mark as done"): submitted
  visits become **done** and their entries **submitted**; entries of open
  visits become **drafts**; client feedback becomes **client
  interactions**; staff feedback becomes **observations** marked "from
  staff" (with the staff member's details); every entry's stop becomes its
  `place`.
- It also renames the "Other" unit to "Undefined", seeds the client rating
  questions, gives admin accounts a PIN, and turns the old `supervisor` tag
  into `management`.

The file as it was before each upgrade is kept once, as
`server/db.backup-v1.json` / `server/db.backup-v2.json`.

## 10. How the persistence works

**Visits in the staff app** go through `src/lib/useVisitStore.js`: saved
one visit at a time (`PUT /api/visits/:id`, `DELETE /api/visits/:id`) and
queued on the phone while offline (§6a). On every save the server keeps its
own copy of each **submitted** entry (so a late phone can't undo the
admin's assignment, the fixer's progress or story likes, and can't delete a
submitted entry), stamps newly submitted complaints for the admin's queue,
and refuses any change once the visit is **done** (HTTP 409).

Everything else uses `src/lib/usePersistedCollection.js`, which fetches a
collection on mount and PUTs the whole array back to the server on every
change (it also exposes a
`loaded` flag as a third return value, used to avoid flashing the login
screen while a saved session is still being resolved). The four workflow
actions (assign / extend / resolve / run-deadline-check) are the exception
— they're server-side business logic (`server/logic.js`) reached via
`POST /api/actions/*`, since they have to run atomically and on a timer
independent of any browser tab. After calling one, the app
re-reads `visits` and `emailLog` (read only, never written back) to pick up what the server
changed.

This is intentionally simple (JSON file, no real auth hashing, single
shared admin account, photos as inline base64) — built for prototyping,
not production traffic.

## 11. Project structure

```
field-visit-tracker/
├── package.json
├── vite.config.js          # multi-page build (index/staff/admin) + /api and /uploads proxy
├── index.html / staff.html / admin.html
├── public/sw.js            # service worker: opens the app offline (production builds)
├── server/
│   ├── index.js             # Express API: /api/:collection, /api/visits/:id, /api/uploads, /api/actions/*
│   ├── logic.js              # complaint assignment, deadline math, email generation, the visit save/merge rules
│   ├── migrate.js            # upgrades of db.json to the current visit shape (§9a)
│   ├── uploads/              # voice notes (runtime data, not committed)
│   └── db.json                 # the database
└── src/
    ├── styles/brac.css       # the whole design system (tokens, components, motion, mobile)
    ├── lib/
    │   ├── usePersistedCollection.js
    │   ├── useVisitStore.js   # the staff app's visits: per-visit saves + offline queue
    │   ├── offline.js          # IndexedDB helpers (visit cache, queue, voice recordings)
    │   ├── visits.js           # visit stages, entry types, drafts, offices, expandVisits() for the analytics
    │   ├── registerSW.js
    │   ├── ids.js             # makeId(), todayStr()
    │   ├── theme.js            # dark/light mode hook (per-browser)
    │   ├── ThemeToggle.jsx
    │   ├── AppShell.jsx        # left sidebar (laptop), top bar + bottom tab bar (phone) — staff + admin
    │   ├── Portal.jsx          # renders dialogs straight into <body>
    │   ├── AuthScreen.jsx      # shared login/register (PIN + password)
    │   ├── ui.jsx              # CountUp, Reveal, Sparkline, DeltaChip, Ring, downloadCsv…
    │   ├── charts.jsx          # dependency-free, self-sizing SVG charts
    │   ├── InteractiveMap.jsx  # zoomable choropleth + pins + label planner (d3-geo)
    │   ├── CommandPalette.jsx  # Ctrl/⌘ + K quick search
    │   ├── BdOutline.jsx       # decorative Bangladesh outline (sign-in + hero)
    │   ├── features.js         # feature switches (e.g. who sees Network health / coverage)
    │   ├── PersonInfo.jsx      # optional staff / client details (interactions, observations, complaints)
    │   ├── offices.js          # office tree, coverage / completeness maths, name aliases
    │   ├── bd-divisions.geojson.json  # Bangladesh's 8 divisions (see §3a)
    │   └── bd-districts.geojson.json  # Bangladesh's 64 districts, for the zoomed-in map
    ├── landing/  (main.jsx, App.jsx)   — the "/" sign-in page: Admin/User picker, PIN + password
    ├── staff/    (main.jsx, App.jsx, Analytics.jsx, NetworkHealth.jsx, BranchProfile.jsx, analytics/*)
    │             — dashboard, Details (management), Network health tab,
    │               Branch 360°, My Complaints, Fixer Queue
    │   └── visits/  RegisterVisit, VisitHub (the visit page), EntrySheet (the forms + read-only view),
    │                Places (route editor + office picker), TimePicker (clock dial), Confirm,
    │                VisitCard, VoiceNote, PhotoUpload, SyncPill
    └── admin/    (main.jsx, App.jsx, OfficesTab.jsx, QuestionsTab.jsx)
                  — complaints center, network health, units (+ teams), employees (+ admin accounts),
                    offices, client questions, sent emails
```

## 12. Deploying to Render

Same as before — one web service:
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Render assigns `PORT` automatically; `server/index.js` already reads
  `process.env.PORT`.
- Free tier sleeps after inactivity — see §6 for what that means for the
  automatic deadline check.

## 13. Common issues

- **"Could not load ... from the server" warning** — the API server isn't
  running. Run `npm run dev` (or `npm run dev:server`).
- **Assign button disabled / "no fixer set up"** — that unit has no
  employee tagged with the `fixer` role yet. Add the role under the admin
  console's Employees tab (only one employee per unit can hold it).
- **Fixer queue / Details tab doesn't show up** — the signed-in employee
  isn't ticked as Fixer / Management on their employee record (admin
  console → Employees). Network health is in the admin console (see §3a for
  the switch that also shows it to management).
- **An office is missing from the visit form / map / coverage** — it isn't on
  the master list, or it was retired. Check admin console → Offices.
- **Data you changed on disk (or via a script) reverts** — every open browser
  tab holds its own copy of each collection and writes the whole thing back
  when something changes (last write wins). After editing `server/db.json` by
  hand or re-seeding, refresh any tab that was already open.
- **Keep bouncing back to the login page** — `staff.html`/`admin.html` only
  render once there's a session `localStorage`/`sessionStorage` recognizes;
  sign in from `/` rather than opening those files directly.
- **Changes don't seem to save** — check the Network tab for a failing
  `PUT` or `POST /api/actions/*` request. In the staff app, a visit that
  says "Saved on this phone · sends when online" is still queued on that
  device; it's sent once the API server is reachable again.
- **"Record a voice note" does nothing / says the microphone was blocked**
  — the page must be on HTTPS or `localhost`, and the browser must be
  allowed to use the microphone.
- **An entry can't be changed** — it has been submitted (complaints are with
  the admin). **A whole visit can't be changed** — it has been marked as done.
- **A complaint isn't in the admin's queue** — it's still a draft; open it
  from the visit and Submit it.
- **Want a clean slate?** Stop the server and edit `server/db.json`
  directly, or reset `visits`/`emailLog` to `[]`.
