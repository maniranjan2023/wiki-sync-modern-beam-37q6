# Progress

- [x] `1` Verify the app in a browser (automated feature test) _(high priority)_

## Notes
- schema.ts: user_profiles table holds role (admin/owner/viewer) + email + prefs, 1:1 via owner_user_id; first registrant auto-becomes admin in lib/roles.ts ensureProfile().
- Only 4 agents called from UI via callAIAgent: coordinator (Sources/Run Drift Scan), review_notifier (Review Queue/Notify owners), verified_answer (Ask, markdown), wiki_import (Wiki/Import&Index). All JSON responses parsed with stripFences() defensive helper.
- Approve/Edit&Approve/Reject in /api/proposals is pure DB transaction, no agent call — verified in code review.
- Verified: npm build clean, root page 200, register endpoint 200, unauthenticated API routes correctly 401.
