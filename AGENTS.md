# AGENTS.md

## Project Mission

Build and harden a funeral home transport dispatch PWA for dispatcher and driver workflows. Treat this as sensitive operational software that handles decedent information, chain-of-custody records, driver locations, signatures, documents, and user roles.

This app may become one module in a larger funeral home operating platform with CRM and voice-AI customer service modules.

## Engineering Priorities

- Protect decedent, family, driver, and facility data.
- Keep authorization enforced by RLS, server functions, and database constraints, not only UI controls.
- Prefer clear domain workflows over generic CRUD.
- Preserve auditability for dispatch, status changes, signatures, user management, and documents.
- Avoid code paths that make future CRM or voice-agent integration harder.

## Stack

- React 19
- TanStack Start and TanStack Router
- TanStack Query
- Supabase Auth, Postgres, Storage, and Realtime
- Cloudflare Workers target
- PWA service worker

Do not introduce Node-only packages that break the Cloudflare/edge runtime.

## Security Rules

- Never commit `.env`, service-role keys, VAPID private keys, Supabase secrets, real customer data, real decedent data, recordings, documents, or signatures.
- Use `.env.example` for variable names only.
- Treat Supabase RLS as a primary security boundary and review policies for every schema change.
- Service-role Supabase clients must only be used in trusted server-side code.
- Keep browser-side operations constrained by RLS and minimal data selects.
- Use signed URLs for private storage; never make case documents public.

## Domain Rules

- Drivers should only see assigned cases.
- Drivers should only perform valid forward workflow transitions.
- Cancellation, deletion, reassignment, approval, and role changes should be dispatcher/admin controlled unless explicitly changed by product policy.
- Case document object paths must preserve case-level authorization expectations.
- Chain-of-custody signatures and status events must remain auditable.

## Testing Expectations

Add or update tests for meaningful changes to:

- RLS policies
- Role and approval behavior
- Driver case visibility
- Case state transitions
- Case assignment
- Document signed URL behavior
- Signature capture
- Push subscriptions
- Realtime subscriptions

When tests are not yet available, document the manual verification steps clearly.

## Review Priorities

Review code for:

- Broad RLS policies
- Client-only authorization assumptions
- Sensitive data in logs, notifications, realtime payloads, and printed output
- Missing audit records
- Unbounded realtime/location update behavior
- Multi-step operations that should be server functions or transactions
- Runtime incompatibility with Cloudflare Workers
- Missing error handling, retries, and user-safe failure states

## Documentation

Keep durable engineering notes in `docs/`.

Use `docs/audits/` for audit reports and hardening plans.
