# Initial Engineering Audit

Date: 2026-06-03

## Scope

Initial audit of the Lovable-generated funeral home transport dispatch PWA after cloning from GitHub.

Focus areas:

- Repository hygiene
- Supabase RLS and database safety
- Auth and role boundaries
- Sensitive decedent data handling
- Driver workflow integrity
- Server function authorization
- Push notification handling
- Production-readiness gaps

## High-Level Assessment

The app is a credible MVP foundation, not just a throwaway demo. It already has several strong production-minded choices:

- Supabase RLS enabled across core tables.
- Separate `user_roles` table instead of storing roles on profiles.
- Admin-only server functions for user management.
- Private storage bucket for case documents.
- Signed URLs for document viewing.
- Route gates for approved users, dispatcher/admin/viewer, and driver surfaces.
- Realtime cleanup in major subscriptions.
- Clear README notes about review focus and sensitive decedent data.

The main concern is that some business-critical permissions were enforced too much by UI convention or broad RLS policies. Those should be hardened at the database and server-function layer before production.

## Changes Made In This Pass

### Repository Hygiene

- Removed `.env` from version control tracking.
- Added `.env` and `.env.*` to `.gitignore`.
- Added `.env.example` with safe placeholder variable names.

### Profile Approval Hardening

Added a migration that prevents non-admin users from updating protected profile fields:

- `approved`
- `approved_at`
- `approved_by`
- `id`
- `created_at`

Reason: route gates depend on `profiles.approved`; a broad self-update policy could otherwise allow a pending user to approve themselves by bypassing the UI.

The migration allows trusted Supabase `service_role` operations so server-side admin functions can still approve, unapprove, and manage users.

### Driver Status Transition Hardening

Added a migration that restricts driver case updates to approved workflow transitions:

- `new` -> `en_route_pickup`
- `assigned` -> `en_route_pickup`
- `en_route_pickup` -> `on_scene`
- `on_scene` -> `in_custody`
- `in_custody` -> `en_route_dropoff`
- `en_route_dropoff` -> `delivered`

Drivers can no longer set arbitrary statuses such as `cancelled`, `closed`, or backwards transitions by bypassing the UI.

### Driver UI Alignment

- Removed the driver-side cancel button and mutation.
- Cancellation should be a dispatcher/admin action unless the business explicitly decides otherwise.

### Role Cache Correctness

- `setAdminUserRole` now invalidates the role cache for the changed user.
- Admin audit filtering now includes `user_approved` and `user_unapproved`.

### User Management Consolidation

- Removed direct role management from the Settings page.
- Settings now points admins to the dedicated Users page.
- Role, approval, password, disable, and delete actions should run through audited server functions rather than direct client-side `user_roles` mutations.

## Remaining Findings

### P1: Deploy And Test New RLS Migration Carefully

The new database hardening should be applied in a staging Supabase project first. Test:

- Pending user cannot set `approved=true`.
- Normal user can still update allowed own profile fields.
- Admin can approve/unapprove users.
- Driver can advance through valid case states.
- Driver cannot cancel, close, jump ahead, or move backwards.
- Dispatcher/admin can still update case status as needed.

### P1: Storage Path Security Depends On Case-ID Folder Convention

Later migrations correctly scope driver storage access by extracting the first storage folder name as a case ID:

```sql
is_case_driver(auth.uid(), ((storage.foldername(name))[1])::uuid)
```

This is good, but the codebase should make the convention explicit and test it. All case document object paths must start with the case UUID.

Recommended next step:

- Add a document upload helper that constructs paths as `{case_id}/{document_id-or-filename}`.
- Avoid ad hoc storage paths in UI components.
- Add a test or migration comment for the storage path convention.

### P1: Client-Side Direct Mutations Should Be Reviewed

Most business operations are direct Supabase client mutations guarded by RLS. This is acceptable for an MVP if RLS is airtight, but production workflows may benefit from server functions for operations that require:

- Multi-table transactions
- Audit logging
- Business validation
- Push notifications
- Idempotency
- Conflict checks

Priority candidates:

- Case assignment
- Case status advancement
- Case cancellation
- Case document registration
- Signature capture
- Facility and vehicle deletion

### P2: Admin Password Reset Flow Needs Policy Review

Admins can set a user's new password directly. This may be acceptable for a small internal dispatch tool, but for production it is usually better to send reset links or temporary credentials with forced rotation.

Recommended next step:

- Decide whether direct password setting is acceptable.
- If kept, add stronger audit metadata and operational policy.

### P2: PII And Decedent Data Minimization Needs More Detail

The README correctly flags decedent data as sensitive. Before production, define which fields appear in:

- Push notification bodies
- Realtime payloads
- Printed run sheets
- Audit logs
- Error logs
- Driver mobile cards
- Reports

Current push notifications include decedent name and pickup location. That may be operationally useful, but should be a deliberate privacy decision.

### P2: Test Coverage Is Not Yet Visible

No test files were found in the initial inventory. Before production, add tests for:

- RLS policy behavior
- Role-based route behavior
- Case status transitions
- Case assignment edge cases
- Document signed URL behavior
- Signature capture
- Push subscription cleanup

### P2: Realtime Should Be Load-Tested

Realtime subscriptions are scoped in several UI paths, but scaling needs validation with multiple dispatchers, drivers, and active cases.

Recommended next step:

- Define expected active drivers/cases per tenant.
- Load test driver location updates and dispatcher map updates.
- Consider throttling or batching location updates.

## Rebuild Versus Refactor Recommendation

Do not throw this code away yet. The repo has enough structure to justify a serious refactor/hardening pass before deciding on a rebuild.

Recommended path:

1. Harden RLS and sensitive workflows.
2. Add tests around database policies and critical workflows.
3. Extract shared domain types and operation helpers.
4. Move high-risk multi-step operations into server functions.
5. Reassess maintainability after those changes.

If the data model or workflow assumptions prove wrong, then rebuild from this clarified model. If they hold, this codebase can likely become the dispatch module of the larger funeral home operating platform.
