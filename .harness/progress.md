# Progress

- [x] `1` Create workflow structure and Truewiki agents (Manager + 5 Signal Agents + Drift Detection + Proposal Drafter + Review Notifier + Verified Answer + Wiki Import Mapper) with skills and response schemas _(high priority)_
- [x] `2` Design & provision Postgres database (users, sources, source_cursors, source_events, findings, pages, page_sections, page_versions, proposals, audit_log) _(high priority)_
- [x] `3` Build complete UI (Sources, Wiki, Review Queue, Ask, Audit Log, Settings) with auth _(high priority)_

## Notes
- schema.ts: user_profiles table holds role (admin/owner/viewer) + email + prefs, 1:1 via owner_user_id; first registrant auto-becomes admin in lib/roles.ts ensureProfile().
- Only 4 agents called from UI via callAIAgent: coordinator (Sources/Run Drift Scan), review_notifier (Review Queue/Notify owners), verified_answer (Ask, markdown), wiki_import (Wiki/Import&Index). All JSON responses parsed with stripFences() defensive helper.
- Approve/Edit&Approve/Reject in /api/proposals is pure DB transaction, no agent call — verified in code review.
- Verified: npm build clean, root page 200, register endpoint 200, unauthenticated API routes correctly 401.
