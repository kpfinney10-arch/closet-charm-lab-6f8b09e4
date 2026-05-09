
# Mortuary Transport Dispatch — MVP Plan

A two-surface app for a funeral home / mortuary transport service:

1. **Dispatcher dashboard** (desktop-first web): create cases, assign drivers, watch a live map, manage queue.
2. **Driver app** (mobile-first web, installable as PWA): see my assigned runs, update status, capture chain-of-custody info, share live location.

Multi-user, single org. Goal in 1–2 months: your friend's company using it daily and paying for it.

---

## Core concept: a "Case"

The unit of work is a **Case** — one decedent, one transport job. A case has:

- Decedent info (name, DOB, sex, weight estimate, special handling notes)
- Pickup location (address, contact, facility type — hospital, residence, ME's office, nursing home)
- Dropoff location (your facility, crematory, embalmer, another funeral home)
- Assigned driver(s) (transports often need 2 people)
- Status timeline (see below)
- Authorizing party / next-of-kin contact
- Documents (release form, ID photo, body tag photo) — uploaded by driver
- Audit log (every status change, who, when, GPS coords)

**Status flow** (the heart of the app):
`New → Assigned → En route to pickup → On scene → In custody (body picked up) → En route to dropoff → Delivered → Closed`

Each transition is timestamped + geotagged. This becomes the chain-of-custody record.

---

## Surface 1: Dispatcher Dashboard

**Layout**: left sidebar (case queue filtered by status), center map (live driver pins + case pins), right panel (selected case detail).

Pages:
- `/` — Live dispatch board (map + active cases)
- `/cases` — All cases table with filters (status, date, driver, facility)
- `/cases/new` — Intake form
- `/cases/$id` — Full case detail + timeline + documents
- `/drivers` — Driver roster, on/off duty toggle, current assignment
- `/reports` — Daily run sheet, driver hours, case volume by facility (export CSV/PDF)
- `/settings` — Org settings, facilities directory, user management

Key dispatcher actions:
- Create case → assign to on-duty driver(s) → driver gets it instantly
- Drag driver pin from map onto case (or use assign button)
- See ETA based on driver's live location
- Reassign mid-run if needed
- Print run sheet for the day

---

## Surface 2: Driver App (mobile web / PWA)

Optimized for one-handed use in a vehicle/at a scene.

Pages:
- `/driver` — My queue (today's assigned runs in order)
- `/driver/run/$id` — Active run with big status buttons + map nav link
- `/driver/run/$id/custody` — Chain-of-custody capture (photo of body tag, signature from releasing party, decedent ID confirmation)
- `/driver/profile` — On/off duty toggle, vehicle assignment

Key driver actions:
- One-tap status updates (big buttons: "Arrived", "In custody", "Delivered")
- Tap address → opens Google/Apple Maps for navigation
- Background location sharing while on duty (with explicit consent)
- Capture photos + signature on pickup
- Add notes ("body in basement, narrow stairs", "family present")

---

## Roles

- **Owner / Admin**: everything, including user management & billing
- **Dispatcher**: create/assign/edit cases, view all
- **Driver**: see only their assigned runs, update status, upload custody docs
- **View-only** (optional, for funeral directors): read-only case status

Stored in a `user_roles` table (separate from profiles, per security best practice).

---

## MVP scope (what ships in ~6–8 weeks)

**In scope:**
- Auth (email/password + Google), org setup, role management
- Case CRUD + status workflow + audit log
- Dispatcher live map with driver locations
- Driver mobile web app w/ status buttons + photo capture + signature
- Live updates (driver action → dispatcher sees instantly)
- Daily run sheet PDF export
- Notifications: SMS or push to driver on new assignment

**Out of scope for MVP** (note for v2):
- Native iOS/Android apps (PWA covers it)
- Billing/invoicing to funeral homes
- Integration with case management software (e.g., Passare, Osiris)
- Multi-tenant / multi-org (your friend's company is the one tenant)
- HIPAA BAA-grade hosting (we'll design defensively but not pursue formal compliance yet — flag for v2)

---

## Build sequence (4 phases)

**Phase 1 — Foundation (week 1)**
- Enable Lovable Cloud (database, auth, storage, server functions)
- Schema: `profiles`, `user_roles`, `facilities`, `vehicles`, `cases`, `case_events`, `documents`
- RLS policies + role-check function
- Auth pages, role-gated layouts (`_authenticated`, `_dispatcher`, `_driver`)

**Phase 2 — Dispatcher core (weeks 2–3)**
- Case intake form
- Case list + filters
- Case detail page with timeline
- Driver roster + assignment
- Run sheet PDF/CSV export

**Phase 3 — Driver app + live tracking (weeks 4–5)**
- Mobile-optimized driver views
- Status update flow with geotagging
- Photo upload + signature capture (touch canvas)
- Live location sharing (browser Geolocation + interval write to DB)
- Realtime subscription so dispatcher map updates instantly

**Phase 4 — Polish + pilot (weeks 6–8)**
- Map view (Mapbox or Leaflet + OpenStreetMap)
- SMS notifications to drivers (Twilio) on new assignment
- Daily run sheet, basic reports
- Onboard your friend's company, iterate on feedback
- Pricing page + simple Stripe subscription ($X/driver/month)

---

## Technical details

**Stack**: TanStack Start (already set up), Lovable Cloud (Supabase under the hood) for DB/auth/storage/realtime, server functions for business logic, Tailwind + shadcn/ui for UI.

**Map**: Leaflet + OpenStreetMap (free, no API key) for MVP. Upgrade to Mapbox if styling matters more later.

**Live tracking**: Driver app calls `navigator.geolocation.watchPosition`, throttled to one DB write per 15–30 seconds while on duty. Dispatcher subscribes to a `driver_locations` table via Supabase Realtime.

**Signature**: HTML5 canvas → PNG → upload to Cloud Storage → store URL on the case event.

**Photos**: Native `<input type="file" capture="environment">` → Storage → URL on case_event.

**SMS**: Twilio via server function (one secret: `TWILIO_AUTH_TOKEN`). Skip if budget-sensitive; in-app push works too.

**PDF run sheets**: server function using `@react-pdf/renderer` or simple HTML-to-PDF.

**Sensitive data note**: Decedent info is sensitive. We'll use RLS aggressively, log every access, and store minimum necessary data. Formal HIPAA compliance is a v2 concern (BAA hosting, audit requirements) but we'll architect so it's reachable later.

---

## Open questions (we can decide as we build, not blockers)

1. Does your friend already use case management software (Passare, Osiris, FrontRunner)? If so, future integration becomes a selling point.
2. Single state/region, or do they pick up across state lines? Affects whether we need to track jurisdiction handoff.
3. How many drivers / cases per day at peak? Drives map performance assumptions.
4. Does the dispatcher work from a single workstation or also from phone? Affects how mobile-friendly the dashboard needs to be.

---

## What approving this plan kicks off

I'll start with **Phase 1**: enable Lovable Cloud, set up the schema, RLS, auth, and the role-gated layouts. That gives you a working signed-in shell with admin/dispatcher/driver routes within the first build session. Then we iterate on dispatcher screens next.
