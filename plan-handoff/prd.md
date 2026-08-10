# Truewiki — Self-Maintaining Knowledge Base

## 1. Overview
Truewiki keeps a company wiki continuously in sync with reality. Connectors watch Slack, Google Drive, GitHub, Jira and Linear; a coordinated agent team compares recent source activity against each wiki section, flags drift, and drafts a redline with a rationale and a source citation. Nothing is ever auto-applied — every change lands in a ~10-minute review queue where the page owner approves, edits, or rejects it, and every decision is written to an immutable audit log.

## 2. User Stories
- As an **admin**, I want to connect Slack, Drive, GitHub, Jira and Linear and scope exactly which channels/repos/projects are watched, so ingestion stays relevant and permissioned.
- As an **admin**, I want to import existing wiki pages and assign an owner and re-check cadence per page, so accountability is explicit from day one.
- As a **doc owner**, I want a queue of proposed redlines with a side-by-side diff and the source snippet that triggered it, so I can approve or reject in under a minute.
- As a **doc owner**, I want a Slack DM when a page I own drifts, so I don't have to live in the dashboard.
- As anyone on the team, I want to ask a question and get an answer only from *verified* wiki content with a link to the page and its last-verified date.

## 2.a. User Types & Permissions

Three roles. Everyone signs in with email + password; every screen is gated.

| Capability | Admin | Owner | Viewer |
|---|---|---|---|
| Sign up / log in | ✅ | ✅ | ✅ | 
| Connect & disconnect sources (Slack, Drive, GitHub, Jira, Linear) | ✅ | ❌ | ❌ |
| Set watched scopes + authority rank per source | ✅ | ❌ | ❌ |
| Import wiki pages, assign owners, set cadence | ✅ | own pages only | ❌ |
| Run an on-demand drift scan | ✅ (all pages) | ✅ (own pages) | ❌ |
| See proposals in the Review Queue | ✅ (all) | ✅ (own pages only) | ❌ |
| Approve / Edit & Approve / Reject a proposal | ✅ (all) | ✅ (own pages only) | ❌ |
| Bulk approve | ✅ | ✅ (own pages) | ❌ |
| Edit wiki page content directly | ✅ | ✅ (own pages) | ❌ |
| Ask questions (verified answers) | ✅ | ✅ | ✅ |
| Read verified pages | ✅ | ✅ | ✅ (scope-permitted only) |
| Read pages in `drift_detected` / `stale` | ✅ | ✅ | ⚠️ read-only with a "may be outdated" banner |
| View Audit Log | ✅ (full) | ✅ (own pages) | ❌ |
| Invite users / change roles | ✅ | ❌ | ❌ |

**Escalation:** an admin is implicitly an owner of any page with no assigned owner, so nothing can sit unreviewed. Reassigning an owner moves that page's open proposals to the new owner's queue and writes an audit row.

## 3.a. Agent Architecture

**Pattern:** Hybrid — one Manager + six Sub-Agents (the drift loop, one shot) plus three Independent Agents (notify, serve, import).

**Reasoning:** Five distinct connectors must be scanned together in a single "Run Drift Scan" pass and their findings aggregated, which is a textbook manager/one-sub-per-data-source case. The pipeline is strictly **staged, not parallel**: source agents only normalize events and extract decision-bearing facts; the Coordinator deduplicates and aggregates findings; only then does the Proposal Drafter run, once per unique finding. Approval is a human breakpoint and is **deterministic** — no LLM runs on approve — so publishing, notifying and answering are separate independent triggers.

**Agent Flow:**
```
STAGE 0  INGEST        [cadence per page | "Run Drift Scan" | on-demand per page]
                       app reads source_cursors → fetches only events newer than cursor
STAGE 1  NORMALIZE     app maps every raw event to a canonical shape
                       {event_uid, source_kind, scope, author, ts, text, url}
                       event_uid = hash(source_kind + native_id + revision)
                       → source_events UPSERT (dedup: duplicate event_uid discarded)
STAGE 2  EXTRACT       → Drift Scan Coordinator (Manager) fans out, one agent per source
                            ├ Slack Signal Agent    ├ Jira Signal Agent
                            ├ Drive Signal Agent    └ Linear Signal Agent
                            └ GitHub Signal Agent
                       each returns decision-bearing FACTS only — no drift verdict, no prose
STAGE 3  DETECT        → Drift Detection Agent (sub) compares facts ⇄ page_sections
                       emits finding {section_id, kind, confidence, claim, evidence[]}
                       finding_key = hash(section_id + claim + evidence event_uids)
STAGE 4  AGGREGATE     Coordinator dedups by finding_key, drops confidence <0.6, and
                       resolves conflicting sources via source-authority rules (§3.h)
                       existing open finding with same key → merge evidence, DO NOT re-draft
STAGE 5  DRAFT         → Proposal Drafter Agent runs ONCE per new unique finding
                       (strictly downstream of Stage 4 — never parallel to source agents)
                       → proposal row written, state = pending_review, cursors advanced

STAGE 6  REVIEW        [Owner opens Review Queue] two-pane diff + evidence
         NOTIFY        ["Notify owners"] → Review Notifier Agent → Slack DM digest
STAGE 7  APPLY         [Approve] → DETERMINISTIC: the stored proposed_md is written
                       verbatim. No LLM call. (Edit & Approve = owner's text, verbatim.)
STAGE 8  VERSION+AUDIT new page_versions row + audit_log row, proposal → applied
STAGE 9  RE-INDEX      page re-indexed to Verified Wiki KB; cadence timer reset
STAGE 10 VERIFY        page → verified ONLY if zero unresolved findings remain
STAGE 11 SERVE         [Ask] → Verified Answer Agent: role/scope filter → verified-only
                       retrieval → citation validation → cited answer (or "not documented")

["Import & Index" on Wiki] → Wiki Import & Section Mapper → sections, suggested owner, scopes
```

**Data Sources Detected:** 6 — Slack, Google Drive, GitHub, Jira, Linear, plus the Verified Wiki knowledge base.

**Agents Table:**
| Agent Type | Agent Name | Description | Tools/Data Sources | Trigger | Provider | Model | Temp | Top_p |
|---|---|---|---|---|---|---|---|---|
| Manager | Drift Scan Coordinator | Routes a scan across every connected source sub-agent, aggregates flagged sections, hands each to the drafter, returns one proposal set | N/A | "Run Drift Scan" on Sources; Scheduled per-page cadence | Anthropic | anthropic/claude-sonnet-4-6 | 0.2 | 1 |
| Sub-Agent | Slack Signal Agent | Pulls recent messages from scoped channels and summarises decision-bearing statements | slack (composio) | Auto (via Manager) | Groq | groq/openai/gpt-oss-120b | 0.2 | 1 |
| Sub-Agent | Drive Signal Agent | Pulls recently modified docs in scoped folders and extracts changed factual claims | googledrive (composio) | Auto (via Manager) | Groq | groq/openai/gpt-oss-120b | 0.2 | 1 |
| Sub-Agent | GitHub Signal Agent | Reads merged PRs, commit messages and docs changes in scoped repos | github (composio) | Auto (via Manager) | Groq | groq/openai/gpt-oss-120b | 0.2 | 1 |
| Sub-Agent | Jira Signal Agent | Reads issue, status and description changes in scoped projects | jira (composio) | Auto (via Manager) | Groq | groq/openai/gpt-oss-120b | 0.2 | 1 |
| Sub-Agent | Linear Signal Agent | Reads issue and cycle updates in scoped teams since cursor; extracts decision-bearing facts only | linear (composio) | Auto (via Manager, Stage 2) | Groq | groq/openai/gpt-oss-120b | 0.2 | 1 |
| Sub-Agent | Drift Detection Agent | Compares aggregated normalized facts against page_sections and emits scored findings (contradiction / staleness / gap / confirmation). Never writes prose. Uses the **detect-knowledge-drift** skill | Page sections (app DB) | Auto (via Manager, Stage 3) | Groq | groq/openai/gpt-oss-120b | 0.1 | 1 |
| Sub-Agent | Proposal Drafter Agent | **Downstream of drift detection, not parallel to the source agents.** Runs once per deduplicated finding and turns it into a minimal redline, one-line rationale and validated citation. Uses the **draft-wiki-redline** skill | Findings (app DB) | Auto (via Manager, Stage 5) | Anthropic | anthropic/claude-sonnet-4-6 | 0.3 | 1 |
| Independent | Review Notifier Agent | Composes and DMs owners a digest of their pending proposals | slack (composio) | "Notify owners" on Review Queue | Groq | groq/meta-llama/llama-4-scout-17b-16e-instruct | 0.3 | 1 |
| Independent | Verified Answer Agent | Answers only from pages in state `verified` that the asker's role/source-scope permits; every citation is validated against a real page_version before the answer renders. Uses the **answer-from-verified-wiki** skill | Verified Wiki KB | "Ask" on Ask panel | Anthropic | anthropic/claude-sonnet-4-6 | 0.2 | 1 |
| Independent | Wiki Import & Section Mapper | Splits pasted/uploaded Markdown into sections, suggests an owner and source scopes per section | N/A | "Import & Index" on Wiki | Groq | groq/openai/gpt-oss-120b | 0.3 | 1 |

Drift comparison logic for every Signal Agent follows the shared **detect-knowledge-drift** skill.

**Knowledge Base:** *Verified Wiki KB* — every page whose status is `verified` is indexed for vector + full-text retrieval and attached to the Verified Answer Agent.

**Workflow Visualization:** The Input Node sits at the far left. The Drift Scan Coordinator connects to its right at the same level. Directly below the Coordinator, the five Signal Agents (Slack, Drive, GitHub, Jira, Linear) sit in one evenly-spaced horizontal row; the Coordinator connects downward to each. Below and centred under that row, the Drift Detection Agent forms a second tier fed by all five, and the Proposal Drafter Agent sits to the Drift Detection Agent's right on that same lower tier — making the staged order visually explicit: sources → detection → drafting. To the right of the Coordinator, at the Coordinator's own level, the Review Notifier Agent continues the horizontal flow. The Verified Answer Agent and Wiki Import & Section Mapper each connect from the Input Node as separate horizontal branches with their own triggers.

**Connection Summary:**
- Input → Drift Scan Coordinator: Right
- Coordinator → 5 Signal Agents: Bottom
- 5 Signal Agents → Drift Detection Agent: Bottom (converge)
- Drift Detection Agent → Proposal Drafter Agent: Right (staged, never parallel)
- Coordinator → Review Notifier Agent: Right
- Input → Verified Answer Agent: Right (independent branch)
- Input → Wiki Import & Section Mapper: Right (independent branch)

## 3.h. Reliability, State Machine & Conflict Rules

**Idempotency & deduplication**
- `event_uid = hash(source_kind + native_id + revision)` — a re-fetched or re-delivered event upserts and is never re-processed.
- `finding_key = hash(section_id + normalized_claim + sorted evidence event_uids)` — a finding already open, pending review, or previously rejected does NOT generate a second proposal; new evidence merges into the existing row instead.
- One open proposal per `(section_id)` at a time. A newer, higher-confidence finding supersedes the open one and marks it `superseded` in the audit log rather than stacking a duplicate.

**Sync cursors** — `source_cursors` stores one cursor per `(source_id, scope)`: last processed timestamp/ID, plus `last_run_at` and `last_status`. A scan reads from the cursor, and the cursor advances **only after** Stage 5 commits, so a mid-scan failure re-processes rather than skips. A failed scope is retried on the next sweep without blocking the others.

**Source-authority rules** — when two sources assert conflicting facts about the same claim: (1) explicit authority rank configured per section (e.g. GitHub > Jira > Linear > Drive > Slack for engineering pages; Slack > Jira for pricing/policy decisions) wins; (2) if rank ties, the newer `ts` wins; (3) if a formal record (merged PR, published Drive doc) conflicts with informal chat of the same recency, the formal record wins; (4) if still unresolved, the drafter emits `needs_human_input` and the proposal is queued as a **conflict** card showing both sources side by side — never a silent guess.

**Explicit state machine**

| Entity | States | Transition rule |
|---|---|---|
| finding | `detected` → `pending_review` → (`approved` \| `rejected` \| `superseded`) | `detected` on Stage 3; `pending_review` once a proposal exists |
| proposal | `pending_review` → `approved` → `applied` (or `rejected`) | `approved` is the human decision; `applied` is the deterministic write |
| page | `verified` \| `drift_detected` \| `stale` \| `applying` | page becomes **`verified` only when zero findings remain in `detected` or `pending_review`** and the cadence check has passed; any open finding forces `drift_detected`; cadence elapsed with no scan forces `stale` |

**Deterministic apply** — Approve performs a pure DB transaction: write `proposals.proposed_md` (or the owner's edited text) verbatim into the section, insert `page_versions`, insert `audit_log`, resolve the finding, reset cadence, re-index. **No LLM is invoked on approve**, so what the owner saw is byte-for-byte what ships.

**Permission & citation validation before answering** — the Verified Answer Agent's retrieval is filtered by the asker's role and source-scope permissions before the model sees anything; after generation, every citation is checked to resolve to a real, currently-verified `page_version`. Any unresolvable citation is stripped and, if that leaves the answer ungrounded, the agent returns "not documented in the verified wiki yet" instead.

## 3.f. Scheduler Configuration
| Agent | Frequency | Trigger Time | Description |
|---|---|---|---|
| Drift Scan Coordinator | Per-page cadence (daily / weekly / monthly) | User configurable per page | Re-verification sweep; scans sources for pages whose cadence has elapsed and queues proposals |

## 3.g. Database Configuration

**Database:** PostgreSQL (built-in Lyzr app database). **User Management:** Required — email/password signup + login; all screens gated.

| Table | Purpose | Key Columns |
|---|---|---|
| users | Accounts and roles | id, name, email, password_hash, role (admin/owner/viewer), created_at |
| sources | Connected tools and scope config | id, kind (slack/drive/github/jira/linear), display_name, scopes jsonb, authority_rank int, status, last_synced_at |
| source_cursors | Per-scope sync position so scans never miss or re-process | id, source_id → sources.id, scope_key, cursor_ts, cursor_native_id, last_run_at, last_status |
| source_events | Deduplicated, normalized events | id, event_uid (UNIQUE), source_id, scope_key, author, event_ts, text, url, ingested_at |
| findings | Drift findings before drafting | id, finding_key (UNIQUE), section_id → page_sections.id, kind, confidence, claim, evidence jsonb, state (detected/pending_review/approved/rejected/superseded), created_at |
| pages | Wiki pages | id, title, slug, body_md, status (verified/drift_detected/stale/applying), owner_user_id → users.id, cadence, last_verified_at, open_finding_count int, self_maintained bool |
| page_sections | Section-level units the agents compare | id, page_id → pages.id, heading, body_md, source_scope_ids jsonb, position |
| page_versions | Immutable version history | id, page_id, body_md, version_no, created_by, created_at |
| proposals | Drafted redlines awaiting review | id, finding_id → findings.id (UNIQUE while open), page_id, section_id, current_md, proposed_md, rationale, source_kind, source_url, source_snippet, conflict jsonb, state (pending_review/approved/applied/rejected/superseded), owner_user_id, created_at, resolved_at, applied_version_id |
| audit_log | Every state change | id, actor_user_id, entity_type, entity_id, action, detail jsonb, created_at |

**Roles:** admin, owner, viewer — full capability matrix in §2.a. Role is stored on `users.role`; owner scoping is enforced through `pages.owner_user_id`, and viewer read access is further filtered by source-scope permissions.

## 4. User Flow
```
1. App loads slightly blurred behind an auth modal (Sign Up default) → admin creates account
2. Onboarding wizard → connect Slack, Drive, GitHub, Jira, Linear → pick scopes per source
3. Wiki → "Import & Index" → paste/upload Markdown → Import & Section Mapper splits sections,
   suggests owner + source scopes → admin confirms → pages saved, verified pages indexed to KB
4. Scheduled cadence (or "Run Drift Scan") → events fetched from each source cursor →
   normalized + deduped → Coordinator fans out to the five Signal Agents (facts only) →
   Drift Detection Agent scores findings → Coordinator dedups by finding_key and applies
   source-authority rules → Proposal Drafter runs once per new finding →
   proposals land in Review Queue as `pending_review`, cursors advance
5. Owner clicks "Notify owners" (or gets the scheduled digest) → Review Notifier DMs owners in Slack
6. Owner opens Review Queue → two-pane diff + source snippet → Approve / Edit & Approve / Reject
7. Approve → deterministic apply (stored redline written verbatim, no LLM) → new page_version
   row, audit_log entry, finding resolved, cadence reset, KB re-indexed → page flips to
   `verified` only once no unresolved findings remain (otherwise stays `drift_detected`)
8. Anyone opens Ask → Verified Answer Agent responds with citation + last-verified date
```

## 5. Integrations Required
| Tool Name | Tool Source | Actions Required | Used By Agent | User Input Required |
|---|---|---|---|---|
| slack | composio | SLACK_FETCH_CONVERSATION_HISTORY, SLACK_LIST_ALL_CHANNELS, SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL | Slack Signal Agent; Review Notifier Agent | Channels to watch; owner Slack handle/channel for DMs |
| googledrive | composio | GOOGLEDRIVE_LIST_FILES, GOOGLEDRIVE_FIND_FILE, GOOGLEDRIVE_PARSE_FILE | Drive Signal Agent | Folder(s) to watch |
| github | composio | GITHUB_LIST_PULL_REQUESTS, GITHUB_LIST_COMMITS, GITHUB_GET_REPOSITORY_CONTENT | GitHub Signal Agent | Owner/repo list |
| jira | composio | JIRA_SEARCH_FOR_ISSUES_USING_JQL, JIRA_GET_ISSUE | Jira Signal Agent | Project keys |
| linear | composio | LINEAR_LIST_LINEAR_ISSUES, LINEAR_GET_ISSUE_BY_ID | Linear Signal Agent | Team/project IDs |

> **Scope notes (honest constraints):** there is no separate FastAPI service — REST/webhook receivers become scheduled polling via the Lyzr scheduler plus the on-demand "Run Drift Scan" CTA, which covers the same loop with a short latency delay. Vector search is provided by the Lyzr Knowledge Base rather than Atlas. Exposing an **outbound MCP endpoint** for Claude/IDEs is not something Architect provisions — plan it as a post-v1 addition (the in-app Ask panel and Slack digest cover the serve layer for v1). Object storage for attachments is out of v1 scope; imported content is stored as Markdown.

## 6. UI/UX Specification

### App Structure
Persistent left sidebar — **Sources · Wiki · Review Queue · Ask · Audit Log · Settings** — with a workspace switcher at the top and the signed-in user at the bottom. Slim top bar carries breadcrumbs, global search, a light/dark toggle, and a pending-review count badge. Content area is a single scroll column with generous gutters; dense tables use sticky headers.

### Design System
**Components:** status pill (verified / drift detected / stale), source chip with tool glyph, page card, two-pane diff viewer with word-level redline, review action bar, cadence selector, owner avatar chip, audit timeline row, empty-state panel, skeleton loaders, toast confirmations.
**Visual Hierarchy:** 8pt spacing grid, large semibold page titles, muted secondary metadata, hairline dividers instead of heavy borders.
**Information Density:** Linear-style compact rows — high density, low chrome, minimal empty space; the diff viewer is the only place that gets breathing room.

### Screens

**Screen 0 — Login.** Centered card: email, password, "Log In", link to Sign Up, inline invalid-credential error.
**Screen 0b — Sign Up.** Centered card: name, email, password, "Create Account", link to Log In, per-field validation.

**Screen 1 — Sources.** Grid of five connector cards showing connection state, watched scopes, cursor position / last successful sync, events ingested vs deduped, and an authority-rank selector used for conflict resolution. Each card opens a scope drawer (channel/folder/repo/project pickers). Primary CTA **"Run Drift Scan"**; secondary "Add scope". Empty state walks a new admin through connecting the first tool.

**Screen 2 — Wiki.** Left: page tree with status dots. Right: Markdown editor with section anchors, owner chip, cadence selector, verified badge and version history drawer with a diff view. CTA **"Import & Index"** opens a paste/upload modal.

**Screen 3 — Review Queue.** The core screen. Filterable list (owner, source, page, age, state) on top; selecting a proposal opens the two-pane view — **proposed change left, current wiki section right, source snippet with deep link at the bottom** — plus rationale line and a state chip (`pending_review` / `approved` / `applied`). Conflicting-source findings render as a **conflict card** showing both sources with their authority rank so the owner arbitrates explicitly. Action bar: **Approve**, **Edit & Approve**, **Reject**, with multi-select bulk approve and a **"Notify owners"** CTA. Empty state: "Nothing drifting. Last scan 12 min ago."

**Screen 4 — Ask.** Chat panel; each answer renders with the citing page, section anchor and last-verified date. CTA **"Ask"**.

**Screen 5 — Audit Log.** Reverse-chronological timeline of every proposal, approval, rejection, edit and connector change, filterable by actor, page and date.

**Screen 6 — Settings.** Members and roles (admin/owner/viewer), default cadence, notification preferences, theme.

### Component Specifications
**Inputs:** scope multi-selects, Markdown textarea + file upload, cadence dropdown, owner picker, search field.
**Display:** status pills, diff viewer, page tables, timeline rows, source snippet cards.
**Actions:** primary (Approve, Run Drift Scan, Import & Index), secondary (Edit, Reject, Notify owners), tertiary icon buttons (history, copy link).

### Complete User Journey
Sign Up → onboarding connects Slack/Drive/GitHub/Jira/Linear → Wiki import assigns owners → first drift scan runs → Review Queue fills with redlines → owner approves in the two-pane diff → page flips to verified, audit row written, cadence reset → teammate asks a question in Ask and gets the freshly verified answer with a citation. Failure states: connector auth expiry shows a re-connect banner on the source card; a failed scan surfaces a retry toast without losing prior proposals.

## 7. Artifacts & references
- `detect-knowledge-drift.skill.md` — used by the Drift Detection Agent (Stage 3); the five Signal Agents feed it normalized facts
- `draft-wiki-redline.skill.md` — used by the Proposal Drafter Agent
- `answer-from-verified-wiki.skill.md` — used by the Verified Answer Agent
- **App Mockup** (design file) — specifies the dashboard/Review Queue visual language the build should follow