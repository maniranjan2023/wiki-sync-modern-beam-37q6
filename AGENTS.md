# Next.js React Frontend

## DO NOT EXPLORE — START BUILDING IMMEDIATELY

For FRESH BUILDS: Do NOT list directories or browse the file structure. Read ONLY `response_schemas/*.json` and `workflow.json` — then immediately start writing `app/page.tsx`. No exploring, no reading other files.

For ITERATIONS: Read `app/page.tsx` first to understand current state, then `response_schemas/*.json` for any updated response shapes.

---

## Import Rules

**Icons:** `lucide-react` ONLY — `react-icons` (all sub-packages) and `@radix-ui/react-icons` are BANNED and cause build failures. Replace any react-icons usage with lucide-react equivalents.
```tsx
import { Loader2, Send, X } from 'lucide-react'
```

**Components:** `@/components/ui/*` (shadcn only)
```tsx
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
```

**Agent Calls** — two kinds, dispatched by the workflow agent entry's `type`:
- Lyzr agents (have an `agent_id`) — `@/lib/aiAgent` (CLIENT COMPONENTS ONLY — has `'use client'`; calls pre-built `/api/agent` route — NEVER call from server components or server actions, NEVER create new routes)
```tsx
import { callAIAgent } from '@/lib/aiAgent'
// callAIAgent(message, agent_id) — ONLY way to call Lyzr agents. NEVER custom fetch.
```
- Git-native agents (`"type": "git_agent"`, have a `slug`, NO agent_id) — `@/lib/gitAgent` (CLIENT COMPONENTS ONLY; calls pre-built `/api/git-agent/chat` route, streams live via SSE)
```tsx
import { streamGitAgent } from '@/lib/gitAgent'
// streamGitAgent(message, slug, { onDelta, onToolEvent, onDone, onError }) — ONLY way to call git-native agents.
await streamGitAgent(message, slug, {
  onDelta: (text) => setResponse((r) => r + text),
  onDone: () => setLoading(false),
  onError: (msg) => setError(msg),
})
// slug is EXACTLY the workflow entry's slug (e.g. 'legal-office') — never append '-agent'.
```

---

## COMPONENT WHITELIST (CLOSED SET — nothing else exists)

**ONLY these components may be used in `app/page.tsx`.** If a name is not listed here, it does NOT exist. Define custom components inline as functions in page.tsx.

> **Design-system exception:** If the file `components/.design-system-manifest.md` exists, the active design system has pre-installed extra components. Every component listed in that manifest ALSO exists and MAY be imported and used (import by the path it gives; open the file to confirm exact exports before use). This is the ONLY exception to the closed set — do not treat any other unlisted name as real, and do not recreate or duplicate the manifest's components inline. (Design systems may also silently restyle the shadcn primitives below; use them exactly as normal — the restyling is automatic.)

> **Brand guidelines (`DESIGN.md`):** If a `DESIGN.md` file exists at the project root, the active design system ships its brand guidelines there — voice/tone, color-usage rules, typography, shape/elevation, layout, and component conventions. **Read `DESIGN.md` before building and follow it for every visual and copy decision**; it overrides generic defaults. It is guidance only (not a component source): design tokens still come from `globals.css` and extra components from the manifest above.

### shadcn/ui Components (import from `@/components/ui/<file>`)

| File | Exports |
|------|---------|
| accordion | `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` |
| alert | `Alert`, `AlertTitle`, `AlertDescription` |
| alert-dialog | `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel` |
| aspect-ratio | `AspectRatio` |
| avatar | `Avatar`, `AvatarImage`, `AvatarFallback` |
| badge | `Badge` |
| breadcrumb | `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator` |
| button | `Button` |
| calendar | `Calendar` |
| card | `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardDescription`, `CardContent` |
| carousel | `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext` |
| chart | `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent` |
| checkbox | `Checkbox` |
| collapsible | `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` |
| command | `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandShortcut`, `CommandSeparator` |
| context-menu | `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuLabel`, `ContextMenuSeparator` |
| dialog | `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose` |
| drawer | `Drawer`, `DrawerTrigger`, `DrawerContent`, `DrawerHeader`, `DrawerFooter`, `DrawerTitle`, `DrawerDescription`, `DrawerClose` |
| dropdown-menu | `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuGroup` |
| empty | `Empty`, `EmptyHeader`, `EmptyTitle`, `EmptyDescription`, `EmptyContent`, `EmptyMedia` |
| form | `Form`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `FormField` |
| hover-card | `HoverCard`, `HoverCardTrigger`, `HoverCardContent` |
| input | `Input` |
| input-group | `InputGroup`, `InputGroupAddon`, `InputGroupButton`, `InputGroupText` |
| input-otp | `InputOTP`, `InputOTPGroup`, `InputOTPSlot`, `InputOTPSeparator` |
| label | `Label` |
| menubar | `Menubar`, `MenubarMenu`, `MenubarTrigger`, `MenubarContent`, `MenubarItem`, `MenubarSeparator` |
| navigation-menu | `NavigationMenu`, `NavigationMenuList`, `NavigationMenuItem`, `NavigationMenuContent`, `NavigationMenuTrigger`, `NavigationMenuLink` |
| pagination | `Pagination`, `PaginationContent`, `PaginationItem`, `PaginationLink`, `PaginationNext`, `PaginationPrevious` |
| popover | `Popover`, `PopoverTrigger`, `PopoverContent` |
| progress | `Progress` |
| radio-group | `RadioGroup`, `RadioGroupItem` |
| resizable | `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` |
| scroll-area | `ScrollArea`, `ScrollBar` |
| select | `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`, `SelectGroup`, `SelectLabel` |
| separator | `Separator` |
| sheet | `Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`, `SheetClose` |
| sidebar | `Sidebar`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupContent`, `SidebarGroupLabel`, `SidebarHeader`, `SidebarMenu`, `SidebarMenuButton`, `SidebarMenuItem`, `SidebarProvider`, `SidebarTrigger` |
| skeleton | `Skeleton` |
| slider | `Slider` |
| sonner | `Toaster` |
| spinner | `Spinner` |
| switch | `Switch` |
| table | `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption` |
| tabs | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| textarea | `Textarea` |
| toggle | `Toggle` |
| toggle-group | `ToggleGroup`, `ToggleGroupItem` |
| tooltip | `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` |

### lucide-react Icons (commonly used)

```
Search, Send, X, Plus, Minus, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Loader2, Menu, Settings, User, Users,
Home, Mail, Phone, Calendar, Clock, Star, Heart, Trash2, Edit, Copy, Download,
Upload, File, FileText, Image, Camera, Mic, MicOff, Volume2, VolumeX, Play, Pause,
Square, Circle, AlertCircle, AlertTriangle, Info, HelpCircle, ExternalLink, Link,
Eye, EyeOff, Lock, Unlock, Shield, Zap, RefreshCw, RotateCcw, Filter, SortAsc,
MapPin, Globe, Bookmark, Tag, Hash, AtSign, MessageSquare, MessageCircle, Bot,
Sparkles, Wand2, Palette, Layout, Grid, List, BarChart3, PieChart, TrendingUp
```

Any lucide-react icon name is valid — check https://lucide.dev/icons for the full set. The list above is for convenience.

### HALLUCINATION BLACKLIST (these DO NOT exist — never use them)

| Hallucinated Name | Use Instead |
|---|---|
| `SectionCard` | `Card` + `CardHeader` + `CardContent` |
| `DiscoverScreen` | Plain `<div>` or `Card` |
| `FeatureCard` | `Card` + `CardContent` — or define inline: `function FeatureCard(...)` |
| `ActionButton` | `Button` |
| `IconButton` | `Button` with `variant="ghost" size="icon"` |
| `TextInput` | `Input` |
| `SearchInput` | `Input` with a Search icon |
| `NavBar` / `Navbar` | `<nav>` with Tailwind — or define inline |
| `Container` | `<div className="max-w-7xl mx-auto px-4">` |
| `Hero` / `HeroSection` | Plain `<section>` with Tailwind |
| `Footer` | `<footer>` with Tailwind |
| `Modal` | `Dialog` |
| `Dropdown` | `DropdownMenu` or `Select` |
| `Toast` | `Toaster` from sonner |
| `Chip` | `Badge` |
| `Tag` | `Badge` |
| `Spinner` (from wrong path) | `Spinner` from `@/components/ui/spinner` or `Loader2` with `animate-spin` |
| `Box` / `Stack` / `Flex` | Plain `<div>` with Tailwind flex/grid classes |

**Rule:** If you need a component that isn't in the whitelist above, **define it as a function** in `page.tsx`:

```tsx
// CORRECT — define custom components inline
function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent><p>{desc}</p></CardContent>
    </Card>
  )
}
```

---

## callAIAgent Response (GUARANTEED CONTRACT)

```tsx
const result = await callAIAgent(message, AGENT_ID)
```

| Field | Type | Meaning |
|---|---|---|
| `result.success` | `boolean` | Did the API call succeed (network + auth)? |
| `result.response.status` | `'success' \| 'error'` | Did the agent itself succeed? |
| `result.response.result` | `Record<string, any>` | **The agent's parsed output, passed through verbatim.** Read your schema fields here. |
| `result.response.message` | `string \| undefined` | A best-effort display string derived from `result`. For toast/preview text only. |
| `result.module_outputs` | `{ artifact_files?: [...] }` | Files/images emitted by the agent. |

### Reading agent fields (CRITICAL)

1. Read `response_schemas/<agent_name>.json` to find the exact field names.
2. Access them on `result.response.result.<schema_field>`. **Period.**
3. Do **not** re-parse `raw_response`. It is not present on success responses.
4. Do **not** add multi-path fallbacks like `parsed.message ?? parsed.text ?? parsed.summary ?? ...`. If a schema field is missing, that is a real bug — let it surface as an error state, do not paper over it.

```tsx
if (!result.success || result.response.status !== 'success') {
  setError(result.response.message ?? 'Request failed')
  return
}

const data = result.response.result          // shape matches response_schemas/<agent>.json
setVariants(data.variants ?? [])
setEscalation(data.escalation_reason)
setSummary(data.message)
```

**NEVER use static fallback strings like `'Analysis complete.'`** — show an error state when the response is empty.

### Why no `raw_response` fallback?

The `/api/agent` route guarantees `result.response.result` is the agent's parsed output. There is no scenario where re-parsing a raw string would be more correct than reading `response.result`. If they ever disagree, fix the route — don't defend against it in every UI.

### Complete Usage Example
```tsx
'use client'
import { useState } from 'react'
import { callAIAgent } from '@/lib/aiAgent'

export default function MyPage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    const result = await callAIAgent(userMessage, AGENT_ID)

    if (result.success && result.response.status === 'success') {
      setData(result.response.result)        // shape from response_schemas/<agent>.json
    } else {
      setError(result.response.message ?? 'Request failed')
    }

    setLoading(false)
  }

  // ... rest of component
}
```

---

## CRITICAL: EVERYTHING IS PRE-BUILT — NEVER RECREATE

This template is a complete, wired-up app. NEVER recreate, rewrite, or duplicate any existing file.

### API Routes (NEVER create new `route.ts` files — exception: Database apps create auth + data routes, see Database & Auth section)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/agent` | POST | Call AI agent |
| `/api/upload` | POST | Upload files for AI analysis |
| `/api/rag` | POST/PATCH/DELETE | RAG knowledge base operations |
| `/api/scheduler` | GET/POST/DELETE | Schedule management operations |
| `/api/lyzr-config` | GET | Get API key (utility) |

### Client Libraries (NEVER write custom `fetch()` calls)

| Library | Import | Use for |
|---------|--------|---------|
| `@/lib/aiAgent` | `callAIAgent`, `uploadFiles`, `extractText` | Agent calls, file uploads — **Client Components only** (`'use client'`) |
| `@/hooks/useAgent` | `useAgent`, `callAgentAPI` | React hook wrapper for agent calls — **Client Components only** |
| `@/lib/ragKnowledgeBase` | `getDocuments`, `uploadAndTrainDocument`, `deleteDocuments`, `crawlWebsite`, `validateFile`, `isFileTypeSupported`, `useRAGKnowledgeBase` | RAG/knowledge base operations |
| `@/lib/scheduler` | `listSchedules`, `getSchedule`, `getSchedulesForAgent`, `getScheduleLogs`, `getRecentExecutions`, `createSchedule`, `pauseSchedule`, `resumeSchedule`, `triggerScheduleNow`, `deleteSchedule`, `cronToHuman`, `useScheduler` | Schedule management |
| `@/lib/clipboard` | `copyToClipboard`, `useCopyToClipboard` | Clipboard operations |
| `@/lib/jsonParser` | `parseLLMJson` | JSON parsing |
| `@/lib/utils` | `cn` | Class name merging |

### Tool Parameter Forms (for agents with tools)

**If your agent uses external tools (Gmail, Slack, Calendar, etc.), create input forms to collect required parameters BEFORE calling the agent.**

Example for Gmail send email:
```tsx
const [emailForm, setEmailForm] = useState({ recipient: '', subject: '', body: '' })

<Input 
  placeholder="Recipient" 
  value={emailForm.recipient}
  onChange={(e) => setEmailForm(prev => ({ ...prev, recipient: e.target.value }))}
/>
<Button 
  onClick={() => callAIAgent(`Send email to ${emailForm.recipient}...`, AGENT_ID)}
  disabled={!emailForm.recipient || !emailForm.subject}
>
  Send Email
</Button>
```

See `TOOL_PARAMETER_FORMS_GUIDE.md` for complete patterns and examples.

### Components (NEVER create files in `components/`)

All shadcn/ui components are installed at `@/components/ui/*`. See COMPONENT WHITELIST above. Define custom components inline in `page.tsx`.

### Providers (already in `layout.tsx` — NEVER recreate)

`ErrorBoundary` · `AgentInterceptorProvider` · `IframeLoggerInit` · `KnowledgeBaseUpload` · `SSOGuard`

**If it exists in the template, import it. Do not rebuild it.**

### Pre-configured infrastructure — DO NOT MODIFY

- `app/layout.tsx` — contains the `SSOGuard` auth gate and all providers. Never modify this file.
- `app/api/sso-config/` — SSO config proxy route. Never modify or delete this route.
- `components/SSOGuard.tsx` — Keycloak SSO guard. Never modify this file.

**NEVER modify `components/ClientProviders.tsx`** — it is infrastructure. Do not add `AuthProvider` or any other provider to it. `AuthProvider` belongs in `app/page.tsx` only (see Database & Auth section).

---

## UI Code Location

**CRITICAL:**
- ALL UI code goes in `app/page.tsx`
- Define components inline or import from `@/components/ui/`
- NEVER create files in `components/` (reserved for shadcn/ui)

```tsx
// app/page.tsx

// Define inline components
const ChatMessage = ({ message }: { message: string }) => (
  <div className="p-4 bg-muted rounded-lg">{message}</div>
)

// Main page component
export default function Page() {
  return (
    <div>
      <ChatMessage message="Hello" />
    </div>
  )
}
```

---

## Sections (for parallel builds)

- `app/sections/*.tsx` — max 4 files, page-level sections only
- Each: `'use client'`, one `export default function`, typed props
- Same import rules as page.tsx (shadcn/ui, lucide-react, @/lib/*)
- `components/` still reserved for shadcn/ui — NEVER create files there
- Simple apps (1 agent, no special features): skip sections, use monolithic page.tsx

## Write Tool Fallback

If the Write tool fails for any file (`app/page.tsx` or `app/sections/*.tsx`):
1. Write a minimal version first (imports + one component)
2. Use Edit to append remaining components one at a time
3. Never retry the same failed Write — always switch to incremental Edit

---

## File Upload with AI Analysis

```tsx
'use client'
import { uploadFiles, callAIAgent } from '@/lib/aiAgent'

const handleFileUpload = async (file: File) => {
  // 1. Upload file
  const uploadResult = await uploadFiles(file)

  if (uploadResult.success) {
    // 2. Call agent with asset IDs
    const result = await callAIAgent('Analyze this document', AGENT_ID, {
      assets: uploadResult.asset_ids
    })
  }
}
```

---

## RAG Knowledge Base

```tsx
'use client'
import {
  getDocuments,
  uploadAndTrainDocument,
  deleteDocuments,
  useRAGKnowledgeBase
} from '@/lib/ragKnowledgeBase'

// Using hook
const { documents, loading, fetchDocuments, uploadDocument, removeDocuments } = useRAGKnowledgeBase()

// Or direct functions
const docs = await getDocuments('rag-id')
await uploadAndTrainDocument('rag-id', file)
await deleteDocuments('rag-id', ['doc.pdf'])
```

---

## Environment Variables

**Server-side (in `.env.local`):**
```
LYZR_API_KEY=your-api-key
```

**Client-side access (if needed):**
```tsx
// Only NEXT_PUBLIC_ prefixed vars are exposed to client
const publicVar = process.env.NEXT_PUBLIC_SOME_VAR
```

---

## Bundler

Both dev and build are pinned to webpack:
```bash
npm run dev    # next dev --webpack -p 3333
npm run build  # next build --webpack
```

Next 16 defaults `dev` and `build` to Turbopack when no bundler flag is set, and
Turbopack's PostCSS worker is not yet stable against this project's Tailwind v3
plus `postcss.config.js` setup — it crashes mid-compile and takes the preview
with it. Dropping `--turbopack` is NOT enough to avoid it; you have to ask for
webpack by name. Keep both scripts on the same bundler so the preview predicts
the production build.

Don't pass `--turbopack` and `--webpack` together: Next exits 1 on conflicting
bundler flags.

---

## Next.js 16 Breaking Changes (CRITICAL)

### Dynamic Route Params are a Promise

In Next.js 16, `params` in dynamic route handlers (`[id]/route.ts`) and page components is a **Promise** — accessing it synchronously returns `undefined`.

**ALWAYS await params before reading any field:**

```ts
// app/api/todos/[id]/route.ts
import { authMiddleware } from 'lyzr-architect-pg'
import { NextResponse } from 'next/server'

export const PATCH = authMiddleware(async (req: Request, ctx: any) => {
  const { id } = await ctx.params  // ← MUST await, not ctx.params.id directly
  if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
  // ...
})

export const DELETE = authMiddleware(async (req: Request, ctx: any) => {
  const { id } = await ctx.params  // ← same here
  // ...
})
```

```tsx
// app/posts/[id]/page.tsx — server component
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params  // ← await in page components too
  // ...
}
```

**Anti-pattern (breaks in Next.js 16):**
```ts
// ❌ WRONG — ctx.params.id is undefined, ctx.params is still a Promise
const id = ctx?.params?.id
```

### `searchParams` is also a Promise

```tsx
// ❌ WRONG
export default function Page({ searchParams }) {
  const q = searchParams.q
}

// ✅ CORRECT
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
}
```

---

## Available shadcn/ui Components (All Prebuilt)

All these components are prebuilt in `@/components/ui/` — import directly, no installation needed:

```
accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb,
button, button-group, calendar, card, carousel, chart, checkbox, collapsible,
command, context-menu, dialog, drawer, dropdown-menu, empty, field, form,
hover-card, input, input-group, input-otp, item, kbd, label, menubar,
navigation-menu, pagination, popover, progress, radio-group, resizable,
scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner,
spinner, switch, table, tabs, textarea, toggle, toggle-group, tooltip
```

---

## IFRAME-BLOCKED APIs (CRITICAL!)

This app runs in an iframe. These browser APIs are BLOCKED and will throw errors:

### Clipboard - USE UTILITY!
```tsx
// BANNED - Will throw NotAllowedError:
navigator.clipboard.writeText(text)  // BLOCKED!

// CORRECT - Use safe utility:
import { copyToClipboard } from '@/lib/clipboard'

const handleCopy = async () => {
  const success = await copyToClipboard(text)
  if (success) setCopied(true)
}
```

### Other Blocked APIs
- `navigator.geolocation` - blocked
- `navigator.share()` - blocked
- `window.open()` - may be blocked

---

## Database & Auth — `lyzr-architect-pg` Package (PostgreSQL + Drizzle)

**See the database skill for full provisioning flow, schema templates, migration workflow, auth routes, and anti-localStorage rules.**

When the app has a database (`DATABASE_URL` env var is set) and `DATABASE_PROVIDER=postgres` (the default for all new apps), use the **`lyzr-architect-pg`** package + **Drizzle** for ALL database operations. Both are pre-installed — do NOT install them manually.

> **Legacy apps:** if `DATABASE_PROVIDER=mongodb`, this is an older Mongo-backed app — skip this section and follow the LEGACY subsection at the end instead.

> **Auth is OPTIONAL.** Only add login/register/auth UI if the user explicitly asks for it. Many apps just need a database without user accounts — a todo app, a notes app, a dashboard do NOT need auth unless the user says so.

**CRITICAL RULES:**
- **NEVER use `localStorage` or `sessionStorage` for application data** (tasks, notes, records, user data). localStorage is ONLY for UI preferences (theme, sidebar). All persistent data MUST go through API routes backed by the database.
- NEVER add auth/login/register unless explicitly requested by the user
- NEVER write custom JWT, bcrypt, session, or cookie auth code
- NEVER import `mongoose`, `mongodb`, `pg`, or `@prisma/*` — use `lyzr-architect-pg` + drizzle
- NEVER access the `_users` table directly — use the auth API handlers
- **After ANY edit to `lib/db/schema.ts`, run `npm run db:generate` then `npm run db:migrate`.** Tables do not exist until migrations run.
- NEVER edit the generated SQL files in `drizzle/` by hand

### 1. Schema — `lib/db/schema.ts` + migrations

All tables are defined in ONE file: `lib/db/schema.ts`. Import column builders from `lyzr-architect-pg/schema` (it re-exports all of drizzle's pg-core plus helpers).

```ts
// lib/db/schema.ts
export { users } from 'lyzr-architect-pg/schema'  // auth table — keep this line
import { pgTable, text, boolean, integer, jsonb, index, timestamps, ownerUserId, generateId } from 'lyzr-architect-pg/schema'

// App WITH auth: include owner_user_id + index (rows are scoped per user)
export const tasks = pgTable('tasks', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  title: text('title').notNull(),
  status: text('status').notNull().default('pending'),   // 'pending' | 'done'
  priority: integer('priority').notNull().default(0),
  owner_user_id: ownerUserId(),
  ...timestamps,                                          // created_at, updated_at
}, (t) => [index('tasks_owner_idx').on(t.owner_user_id)])

// App WITHOUT auth: omit owner_user_id — data is shared app-wide
export const notes = pgTable('notes', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  body: text('body').notNull(),
  ...timestamps,
})
```

Then apply it (the platform already injected `DATABASE_URL`):

```bash
npm run db:generate   # writes SQL migration into ./drizzle
npm run db:migrate    # applies it to the app database
```

### 2. Data Access

**App WITH auth → `scopedRepo`** (auto-scopes every query to the logged-in user):

```ts
import { scopedRepo } from 'lyzr-architect-pg'
import { tasks } from '@/lib/db/schema'

const repo = scopedRepo(tasks)
const rows = await repo.findMany({ orderBy: { created_at: 'desc' } })  // only this user's rows
const [row] = await repo.insert({ title: 'hello' })  // owner_user_id force-stamped
await repo.update(eq(tasks.id, id), { status: 'done' })  // no-op if not owned by user
await repo.delete(eq(tasks.id, id))                       // no-op if not owned by user
```

`scopedRepo` **throws if called outside `authMiddleware`** ("No auth context"). Cron/seed/system paths use `scopedRepo(tasks).system()` (unscoped — be deliberate).

**App WITHOUT auth → plain drizzle via `getDb()`:**

```ts
import { getDb } from 'lyzr-architect-pg'
import { notes } from '@/lib/db/schema'
import { eq, desc } from 'lyzr-architect-pg/schema'

const db = getDb()
const rows = await db.select().from(notes).orderBy(desc(notes.created_at))
await db.insert(notes).values({ body: 'hi' })
```

### 3. Auth Routes — Pre-built Handlers (ONLY if user requests auth)

**Do NOT add these unless the user explicitly asks for login/register/user accounts.** Identical to before — only the import changes:

```ts
// app/api/auth/register/route.ts
import { handleRegister } from 'lyzr-architect-pg'
export const POST = handleRegister  // Body: { email, password, name? }

// app/api/auth/login/route.ts
import { handleLogin } from 'lyzr-architect-pg'
export const POST = handleLogin  // Body: { email, password }

// app/api/auth/logout/route.ts
import { handleLogout } from 'lyzr-architect-pg'
export const POST = handleLogout

// app/api/auth/me/route.ts
import { handleMe } from 'lyzr-architect-pg'
export const dynamic = 'force-dynamic'
export const GET = handleMe  // Returns { user } or { user: null }
```

The `_users` table comes from the `export { users }` line in `lib/db/schema.ts` — it is created by your first migration. Never define your own users table.

### 4. API Routes

**Apps WITH auth: every route that touches user-owned tables MUST be wrapped in `authMiddleware` (401 when not logged in). `scopedRepo` throws without it.** Apps without auth: plain route handlers with `getDb()` are fine.

All API routes MUST use `try/catch` and return `{ success, data/error }` format.

```ts
import { authMiddleware, scopedRepo } from 'lyzr-architect-pg'
import { tasks } from '@/lib/db/schema'
import { eq } from 'lyzr-architect-pg/schema'
import { NextRequest, NextResponse } from 'next/server'

export const GET = authMiddleware(async (req: NextRequest) => {
  try {
    const rows = await scopedRepo(tasks).findMany({ orderBy: { created_at: 'desc' } })
    return NextResponse.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[API] GET /api/tasks error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const POST = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const [row] = await scopedRepo(tasks).insert({ title: body.title })  // owner auto-stamped
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err: any) {
    console.error('[API] POST /api/tasks error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})
```

### 5. Client Components — Auth UI (ONLY if user requests auth)

**Do NOT add `AuthProvider`, `LoginForm`, `RegisterForm`, `ProtectedRoute`, or `UserMenu` unless the user explicitly asks for user accounts or login.**

If auth IS requested: `AuthProvider` MUST live in `app/page.tsx` — never in `layout.tsx`, `ClientProviders.tsx`, or any other file. Placing it outside `page.tsx` breaks React context across the RSC boundary and causes a permanent loading screen.

```tsx
// app/page.tsx  ← AuthProvider goes HERE, nowhere else
'use client'
import { AuthProvider, LoginForm, RegisterForm, UserMenu, ProtectedRoute } from 'lyzr-architect-pg/client'

// Auth screen with login/register toggle
function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true)
  return isLogin
    ? <LoginForm onSwitchToRegister={() => setIsLogin(false)} />
    : <RegisterForm onSwitchToLogin={() => setIsLogin(true)} />
}

// Wrap app in AuthProvider, use ProtectedRoute with unauthenticatedFallback
export default function Page() {
  return (
    <AuthProvider>
      <ProtectedRoute unauthenticatedFallback={<AuthScreen />}>
        <header><UserMenu /></header>
        <Dashboard />
      </ProtectedRoute>
    </AuthProvider>
  )
}

// Do NOT manually check `if (!user)` — ProtectedRoute handles it
// Do NOT use window.location.reload() — AuthProvider auto-updates state
// Do NOT put AuthProvider in ClientProviders.tsx or layout.tsx
```

### 6. How Owner Scoping Works

- `authMiddleware(handler)` extracts the JWT → sets the auth context with `userId`
- `scopedRepo(table)` ANDs `owner_user_id = userId` onto every find/update/delete/count
- On `insert`, `owner_user_id` is force-set to the logged-in user (spoofed values in the body are stripped)
- No context = `scopedRepo` throws (deny-by-default)
- The auth tables (`_users`) are refused by `scopedRepo` — use the auth handlers
- `.system()` is the deliberate escape hatch for cron/seed/admin paths

### 7. Env Vars (Auto-set, DO NOT hardcode)

```
DATABASE_PROVIDER=postgres        # Engine marker (set by platform)
DATABASE_URL=postgresql://...     # Per-app credential (set by platform)
APP_JWT_SECRET=...                # JWT signing secret (set by platform)
```

### LEGACY — apps with `DATABASE_PROVIDER=mongodb`

Older apps were built on a MongoDB stack (`lyzr-architect`/Mongoose) that the platform no longer supports. These apps keep **running**, but their database layer is **frozen**:
- Do NOT modify their models, DB queries, or auth wiring; do NOT swap in drizzle/lyzr-architect-pg (the platform cannot provision or manage Mongo databases anymore).
- Non-database changes (UI, styling, agent prompts) are fine.
- If the user asks for database changes on such an app, tell them the app must be rebuilt on the current PostgreSQL stack first.

---

## Anti-Hallucination Checklist

Before writing UI code:
- [ ] Read workflow.json for agent_ids?
- [ ] Read response_schemas/*.json for field names?
- [ ] Interfaces match schema exactly?
- [ ] Using optional chaining (?.)?
- [ ] Loading/error states handled?
- [ ] Only lucide-react icons?
- [ ] Only shadcn/ui components?
- [ ] 'use client' directive for client components? (`callAIAgent`, hooks, event handlers — all need it)
- [ ] `callAIAgent` only called from 'use client' components? (calling from server = runtime crash)
- [ ] No navigator.clipboard? (use @/lib/clipboard)
- [ ] Database code uses `lyzr-architect-pg` + drizzle (never mongoose/pg/prisma; legacy mongo apps use `lyzr-architect`)?
- [ ] Auth uses pre-built handlers (not custom JWT/bcrypt)?
- [ ] Tables defined in `lib/db/schema.ts` and `npm run db:generate` + `npm run db:migrate` run after every schema edit?
- [ ] User-owned tables have `owner_user_id: ownerUserId()` + index, and are accessed via `scopedRepo` inside `authMiddleware`? (scopedRepo outside authMiddleware = "No auth context" crash)
- [ ] Auth UI (`LoginForm`, `AuthProvider`, `ProtectedRoute`) only added if user explicitly requested it?
- [ ] Dynamic route params awaited? (`const { id } = await ctx.params` — NOT `ctx.params.id`)
- [ ] `searchParams` awaited in page components?
- [ ] All API routes wrapped in `try/catch`?
- [ ] Error responses use `{ success: false, error: message }` format?
- [ ] UI shows API errors (not silent failures)?
- [ ] No hand-edited SQL in `drizzle/`?
- [ ] ZERO localStorage/sessionStorage for application data? (only UI preferences like theme)
- [ ] Data fetched from API routes (not from localStorage)?
