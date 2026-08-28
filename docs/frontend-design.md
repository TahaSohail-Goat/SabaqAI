# Sabaq AI — Frontend Design

The single source of truth for what the UI looks like and where every visible value comes from.

**Governing inputs, in priority order:**
1. `supabase/migrations/0001_init.sql` — every piece of data the UI shows or collects maps to a
   table/column in this schema. The UI invents nothing.
2. `docs/SabaqAI_Colortheme.md` — every color, button, card, and status treatment.
3. `docs/api-spec.md` — every fetch the UI makes.
4. `public/assets/auth-illustration.png` — the login/signup illustration.
5. `AGENTS.md` — the UI invariants (citation is primary, refusal is calm,
   confidence is icon + label, Urdu gets `dir="rtl"`).

**Scope: web application only.** Desktop is the design target. No mobile-app patterns (bottom
tab bars, bottom sheets, mobile-first breakpoints) are designed here — this supersedes the
mobile-first convention in AGENTS.md for this phase. Pages should merely stay usable when the
browser window is narrowed.

When this doc and the code disagree, the code is stale — fix the code, then this doc.

---

## 1. Design tokens

Tailwind v4 — there is no `tailwind.config.js`. Tokens live in `@theme` inside
`src/app/globals.css`, named semantically (per colortheme §17–§18), never raw hex in components.

```css
@theme {
  /* Brand (Learning) */
  --color-brand:        #237A57;  /* primary buttons, active states, links, CTAs */
  --color-brand-dark:   #185C43;  /* hover */
  --color-brand-light:  #DDEFE7;  /* secondary buttons, selected backgrounds */
  --color-brand-mint:   #EEF7F3;  /* subtle green backgrounds */

  /* AI / RAG */
  --color-ai:           #2A8C82;  /* AI answers, RAG indicators, source references */
  --color-ai-light:     #E7F4F1;  /* AI card backgrounds */
  --color-ai-border:    #B9DDD6;  /* AI card borders */

  /* Quiz / Practice */
  --color-quiz:         #C58A35;
  --color-quiz-light:   #FBF3E5;
  --color-quiz-border:  #E8D1A7;

  /* Text (Navy = knowledge) */
  --color-navy:         #102A3A;  /* headings, primary text, "Sabaq" in wordmark */
  --color-navy-2:       #294454;
  --color-text-2:       #536773;  /* descriptions */
  --color-text-3:       #82929B;  /* placeholders, timestamps, metadata */

  /* Surfaces */
  --color-page:         #F8FAF9;  /* app background — never pure white */
  --color-surface:      #FFFFFF;  /* cards, modals, login panel */
  --color-surface-2:    #F0F6F3;  /* sidebars, secondary sections */

  /* Borders */
  --color-border:       #DCE5E1;
  --color-border-strong:#C5D3CD;

  /* Status — semantic use only */
  --color-success:      #237A57;
  --color-warning:      #C58A35;
  --color-error:        #C65353;
  --color-error-bg:     #FBECEC;
  --color-info:         #3B73B9;
  --color-info-bg:      #EAF1F8;

  /* Subject identifiers (chips/tags only, never navigation or buttons) */
  --color-subj-physics:   #7564B8;
  --color-subj-chemistry: #2A8C82;
  --color-subj-biology:   #4D956B;
  --color-subj-maths:     #3B73B9;
  --color-subj-cs:        #5367B8;
  --color-subj-english:   #C98345;
  --color-subj-urdu:      #B86473;

  --radius-card: 0.75rem;  /* consistent rounded corners everywhere */
}
```

**Dark mode** (colortheme §16 — students study at night): `dark` variant keyed off a
`data-theme="dark"` attribute on `<html>`, toggled in Settings and persisted per user
(`users.preferred_language`-style persistence; see §6.6 — needs API extension).

```text
dark background  #0E1B23   dark card        #182F3A
dark secondary   #142832   dark border      #29434B
dark text 1      #F1F7F4   dark text 2      #A8BBB4
dark brand       #4FA47F   dark brand hover #65B792
```

**Typography & shape:** system font stack (already in `globals.css`); Urdu text gets
`dir="rtl"` at the block level; headings navy, body navy, descriptions `--color-text-2`,
metadata `--color-text-3`; one radius (`--radius-card`) and one shadow
(`0 8px 24px rgba(16,42,58,0.08)`) for elevated cards.

**Wordmark:** `Sabaq` in `#102A3A`, `AI` in `#237A57` (colortheme §2). Replaces the current
slate/emerald treatment everywhere, including the سبق tile.

**The one gradient** (`135deg, #185C43 → #237A57 → #2A8C82`) is reserved for the quiz progress
bar and special AI highlight cards. Nothing else.

---

## 2. Data model → UI map (strict)

Every UI element below cites its source column. `«needs API»` marks values the schema supports
but no route exposes yet — building those screens requires a new route first (§8).

| UI element | Source | Notes |
|---|---|---|
| Board picker options | `boards.board_code`, `boards.board_name` | DB has **PCTB, FBISE only**. The current signup page offers Sindh/KPK — that invents rows that don't exist; removed. |
| Class picker options | `class_levels.class_level`, `class_levels.label` | 1–12 exist; MVP copy focuses 9–12 but options come from the table. |
| Subject picker / subject tags | `subjects.subject_code`, `subjects.subject_name` | Tag color from the subject-color map above; falls back to `#687984` (General). |
| Language toggle | `languages.language_code` | Ask flow sends `en`/`ur` (API contract). `roman_ur` is a stored fact about content, not a UI toggle. |
| User chip (header), settings | `users.display_name`, `users.preferred_language`, `users.role_code` | |
| Onboarding + settings form | `student_profiles.board_code`, `.class_level`, `.exam_date`; `student_subjects` (set) | `exam_date` renders as a countdown chip ("Board exams in N days"). |
| Ask answer card | `POST /api/ask` → `statements`, `citations` (each citation = a `content_chunks` row joined through `sections` → `chapter_sources` → `chapters`) | Chapter, page, section, excerpt are DB-rebuilt — the UI treats them as fact and renders them prominently. |
| Confidence badge | gate output (`gate_decisions`: PASS/BORDERLINE → "high"/"medium") | Icon + label, never color alone. |
| Refusal card | `ask` refusal body: `message`, `nearestChapters`, `suggestion` | `reason` (`refusal_reasons`) is diagnostic — **never rendered raw** (api-spec). |
| Quiz chapter picker | `chapters.chapter_no`, `chapters.chapter_title` (filtered by the student's profile) | Currently hardcoded to Ch 14/15 in `page.tsx` — replaced by real rows. |
| Quiz difficulty selector | `quiz_difficulties.difficulty` (easy/medium/hard) | `«needs API»` — `POST /api/quiz` takes no difficulty today. |
| Quiz questions + options | `quiz_questions.stem`, `quiz_options.option_text/.option_index` | Options are atomic rows; render order = `option_index`. |
| Quiz results | `POST /api/quiz/grade` → `score/total/answered`, per-question `correctIndex` + `explanation` (= `quiz_answer_keys` content, released only after submit) | The answer key never reaches the browser pre-submission — structural (no RLS policy), not conventional. |
| Quiz history + review | `quiz_attempts.score/total/answered/submitted_at`, `quiz_attempt_answers` | `«needs API»`. |
| Syllabus explorer | `content_chunks_expanded` view (chapters → sources → sections → chunks) | `/api/syllabus` reads the hardcoded array today — the screen is designed against the view; the route swap is backend work. |
| Question history | `qa_log` (own rows via `qa_log_own` RLS): `question_language`, `top1_score`, `gate_decision`, `created_at` | `«needs API»`. Never shows `qa_log_chunks` scores of other users. |
| Eval dashboard | `GET /api/eval` (live) | All metrics computed from the response — **no hardcoded figures anywhere** (AGENTS invariant 7). |

---

## 3. App shell & navigation

Routes: `/login`, `/signup`, `/onboarding`, then the authed shell at `/` with four primary
destinations and one internal one:

```text
Ask        — the product. Default destination.            (green)
Quiz       — practice.                                     (amber accents)
Syllabus   — corpus browser.                               (neutral/navy)
History    — my questions + my quiz attempts.              (neutral) «needs API»
Eval       — internal/judge surface, marked "internal".    (teal, lazy)
```

- **Header:** wordmark left, with the syllabus scope line under it (`{board} Class {classLevel}
  • Physics Syllabus Grounded`) driven by the header selectors — frontend state today; persisting
  it to `student_profiles` is «needs API». Right side = language toggle (EN / اردو), user chip
  (`users.display_name`, fallback email prefix) with logout. (Dark-mode toggle lands with the
  dark palette.)
- **Nav row:** horizontal tabs on the left — active tab is a `--color-brand` label + 2px
  underline, never a filled pill. **Board and class selectors sit on the right of this row**
  (they moved out of signup); they scope every `/api/ask` request. Board options are limited to
  rows that exist in `boards` (PCTB, FBISE).
- **Auth guard:** unauthenticated → `/login`. Authenticated but no `student_profiles` row →
  `/onboarding` (the RLS trap in AGENTS.md: without the profile row, retrieval returns zero rows
  and the app refuses everything with no visible error).
- **Demo mode:** when `/api/auth/user` returns `isDemo: true`, a persistent slim banner under the
  header says demo data is active (info colors, dismissible per session). Auth "working" in demo
  mode must never be mistaken for real.

---

## 4. Auth screens (login / signup / onboarding)

Per colortheme §19 and the supplied illustration. **Auth pages are always light** — the
illustration is a light image; dark mode starts after login.

**Layout:** the illustration is the full-page background (`object-cover`, softened with
`opacity-40` plus a `bg-white/70` scrim so the form stays the focus), and the white form card
sits centered **on top of it** (`#FFFFFF`, border `#DCE5E1`, shadow `rgba(16,42,58,0.08)`),
wordmark above the card. No split panel, no DOM text overlaid on the artwork — the image
already carries the logo, tagline, and feature cards.

**Login form:** email + password, primary button `Sign in` (`#237A57` → hover `#185C43`),
link to signup. Error text `#C65353` on `#FBECEC`; success `#237A57`. Inputs per colortheme §8
(white bg, `#DCE5E1` border, `#237A57` focus, `#82929B` placeholder).

**Signup form:** full name (`users.display_name`), email, password — nothing else. Board and
class are **not** collected here; they live as selectors inside the app (nav row, §3), and the
signup route defaults the profile to PCTB / Class 10 until the student changes them. Subjects
and exam date remain onboarding material «needs API».

**Onboarding (`/onboarding`, first login):** «needs API» — still required for subjects and exam
date, as two short steps on one card:
1. **Subjects** — multi-select chips from `subjects`, writes one `student_subjects` row per
   pick (it's a set, not an array column — the UI mirrors that). At least one required: the RLS
   policy needs it.
2. **Exam date & language** — optional `student_profiles.exam_date` date picker (renders later
   as the countdown chip) and `users.preferred_language`.

(Board & class are no longer an onboarding step — they're adjustable any time from the app
header.) Persisting any of this needs a `POST/PATCH /api/profile` route that upserts as the
authed user (RLS owner policies already allow it).

---

## 5. Ask (the core screen)

Two-column (`7 / 5`). The citation inspector sits beside the answer so a student can
read a statement and verify its source without scrolling or opening anything.

```text
┌────────────────────────────────┬──────────────────────┐
│ Question card (white surface)  │ Citation inspector   │
│  · textarea + [🎙] + Ask btn   │ (teal-tinted card)   │
│  · sample questions (chips)    │  chapter/section/    │
│  · gate status line            │  pages + excerpt     │
│ Answer card (AI teal family)   │                      │
│  · confidence badge            │                      │
│  · statements + citation chips │                      │
│  · citations bar (primary)     │                      │
└────────────────────────────────┴──────────────────────┘
```

**Question card.** White surface. Textarea with the Ask button inline (primary green); mic
button beside it (`«future»` — Groq whisper, remaining-work item 7; text input stays visible at
all times). Sample-question chips are neutral (`--color-surface-2` bg); off-syllabus demo chips
are tagged with a small info label, **not** red — refusal is not an error.

**Answered state.** The answer card uses the **AI teal family** (`#E7F4F1` bg, `#B9DDD6`
border, teal iconography) — per colortheme §11, AI output is teal, not green; green is for
actions. Header row: `CheckCircle2` icon + the words "Grounded answer — high confidence" (or
"medium confidence — borderline support"); the numeric detail (`top1`, `support`) sits in a
small monospace chip to the right, styled as metadata, not a scoreboard. Statements render as
flowing prose, each followed by its **citation chips** — `[Ch 14 · p. 95]` — which are primary
interactive elements (AGENTS.md: "the citation is a primary element, not a footnote"). Clicking
a chip loads the citation into the inspector. Urdu answers render in a `dir="rtl"` block.

**Citation inspector (right column / bottom sheet).** Teal-tinted card showing chapter number +
title, section label, page range, and the DB excerpt in quotes. Footer line: source type
(`chapter_sources.source_type` → "Official textbook"). This is the trust surface — it is never
collapsed by default on desktop.

**Refusal state.** Calm and neutral: white card, navy heading "Outside your syllabus", a
`HelpCircle` icon in navy — **never red, never an error icon, never the word "error"**
(AGENTS.md). Body shows the API's `message`, then nearest chapters as small neutral cards
(chapter no + title from `chapters`), then the reformulation hint in an info-tinted strip
(`#EAF1F8` / `#3B73B9`). A thin caption notes the answer was not generated; it does not say
"LLM skipped" in student-facing copy — that phrasing stays in the eval screen.

**States:** loading = two-line progress caption ("searching your syllabus…" / "checking
confidence…"), skeleton cards, no spinner-only screens; empty = the sample chips; fetch failure
= a single inline retry banner (error colors — a failed fetch *is* an error, unlike a refusal).

---

## 6. Quiz

Amber identity (`#C58A35` / `#FBF3E5` / `#E8D1A7`) so students recognize practice mode
instantly — but only as accents (colortheme §12: "do not make the entire quiz interface
orange").

### 6.1 Setup bar
Chapter picker: chips built from `chapters` rows for the student's profile (replacing the
hardcoded Ch 14/15). Difficulty selector (easy/medium/hard from `quiz_difficulties`) —
`«needs API»` on `POST /api/quiz`; until then it renders disabled with the default `medium`
(from `quizzes.difficulty`'s column default).

### 6.2 Taking the quiz
One card per question: stem (navy, medium weight), the source chip (`p. N` + section) as
metadata, options as a 2-col grid rendered in `option_index` order.
Selected option: brand-light background + brand border. A slim progress bar (the one allowed
gradient) shows `answered/total` from local state mirroring `quiz_attempts.answered/total`.
Submit button (primary green — it's an action, not quiz-colored) is disabled at 0 answers and
shows `Submit · N/M answered`.

### 6.3 Review (post-grade)
After `POST /api/quiz/grade`: score header (`score / total`, large, navy), then each question
card shows correct option in success green with a check icon and the student's wrong pick marked
with a neutral outline + × icon (legible but not alarmist), followed by the **explanation card**
— `quiz_answer_keys.explanation` + its chunk's section/page, in the AI-teal family, since it is
grounded content. This is the only screen where answer-key data ever appears, and only after
submission.

### 6.4 History
`«needs API»` — list of `quiz_attempts` (chapter title via `chapter_id`, score/total,
`submitted_at` formatted relative, e.g. "2 days ago"), tap to review that attempt's
`quiz_attempt_answers`.

---

## 7. Syllabus explorer

A drill-down over `content_chunks_expanded`, rooted at the student's profile
(board → class → subject come from `student_profiles`, not from a free picker — an unfiltered
browse is the same bug as an unfiltered search).

- **Chapter list:** one row per `chapters` row — chapter no in a navy numeral tile, title,
  chunk count, source-type tag (`textbook` / `past_paper` / `marking_scheme` from
  `source_types`), language tag when `language_code = 'ur'`.
- **Chapter detail:** sections in `position` order; each section shows `section_label`,
  `page_from–page_to`, and a quoted excerpt from its first chunk (`--color-text-2` body).
- **Empty corpus:** honest empty state ("no chapters ingested yet for your board/class") —
  never a fabricated preview. `/api/syllabus` currently serves a hardcoded array; until the
  route reads the view, the screen shows whatever the route returns, labeled as sample data
  (info chip).

---

## 8. History & settings

**History** `«needs API»` — two tabs:
- *Questions:* own `qa_log` rows, newest first — question language tag, gate decision as an
  icon+label badge (`gate_decisions`), relative `created_at`. Scores stay in monospace metadata.
- *Quizzes:* as §6.4.

**Settings (`/settings`)** — one white card per group, all PATCHing the profile route:
- Profile: `users.display_name`, `users.preferred_language`.
- Study: `student_profiles.board_code`, `.class_level`, `.exam_date`; `student_subjects` chips
  editor (same component as onboarding step 2).
- Appearance: light/dark toggle (writes `data-theme`; persisted per user — `«needs API»` for
  cross-device, localStorage acceptable for MVP).
- Session: sign out.

---

## 9. Eval dashboard (internal)

Same content as today's eval tab, restyled: metric cards are white surfaces with navy numerals
(status color only on the numeral, never the whole card), the per-question table keeps its
PASS/BORDERLINE/REFUSE badges as icon + label + tinted text. Two behavior changes required by
api-spec/AGENTS:

1. **Manual trigger only.** The current tab auto-runs `GET /api/eval` on open — that route runs
   retrieval per question and burns embedding quota. The screen shows a "Run evaluation" button
   and a cost note; nothing fires on mount.
2. **"Internal" marking.** Labeled as a development/judge surface, not a student feature.

No metric is ever hardcoded; an empty/loading eval shows placeholders, not numbers.

---

## 10. Component inventory

| Component | Spec |
|---|---|
| `Button` | variants: primary (`#237A57`/white, hover `#185C43`), secondary (`#DDEFE7`/`#185C43`, hover `#CDE7DA`), outline (transparent, `#237A57` border+text), disabled (`#E4E9E7`/`#9AA6A1`) |
| `Input` / `Select` / `Textarea` | white bg, `#DCE5E1` border, `#237A57` focus ring, `#82929B` placeholder (colortheme §8) |
| `Card` | white, `1px #E3EBE7`, radius token; elevated variant adds the navy-8% shadow |
| `Chip` / `Badge` | metadata pills; status badges always icon + label, never color alone |
| `CitationChip` | `[Ch N · p. M]`, teal family, primary interactive element in answer text |
| `ConfidenceBadge` | icon + "high confidence" / "medium confidence" text; numeric chip separate |
| `SubjectTag` | subject color from §1 map; chip only, never a button or nav item |
| `RefusalCard` | §5 refusal spec — neutral, calm, no error styling |
| `QuizOption` | §6.2/6.3 state matrix (idle/selected/correct/missed) |
| `ProgressBar` | the single permitted gradient |
| `EmptyState` | icon (navy, 40% opacity) + one line of `--color-text-2` copy + optional action |
| `Skeleton` | `--color-surface-2` blocks, pulse, replaces spinner-only waits |
| `Banner` | info (`#EAF1F8`/`#3B73B9`) for demo mode, sample-data labels; error (`#FBECEC`/`#C65353`) only for genuine failures |

File layout when implemented: `src/components/ui/*` for the inventory, `src/components/ask/*`,
`src/components/quiz/*` etc. per screen, with `page.tsx` reduced to composition. No new
dependency, no component library — Tailwind only (AGENTS.md conventions).

---

## 11. Cross-cutting rules (restated so they survive implementation)

1. **Web application only.** Desktop layout is the design target; generous click targets and
   readable type, but no mobile-specific patterns.
2. **Refusal is calm.** Never red, never an error icon, HTTP-200 body rendered as a normal
   outcome with next steps.
3. **Confidence is icon + label.** Color is decoration, never the carrier of meaning.
4. **Urdu gets `dir="rtl"`** at the block level; numerals and page chips stay LTR inside it.
5. **Nothing a student reads as fact comes from model output** — citations, pages, sections are
   DB-rendered. The UI never synthesizes a citation from streaming text.
6. **No hardcoded metrics or "verified" labels.** Every number on screen is from a live response
   in this session.
7. **The answer key never renders pre-submit.** Not in the DOM, not in a data attribute, not in
   a network response the UI asked for.
8. **Boards/classes/subjects come from the database.** The UI never offers an option the schema
   can't back (today: PCTB + FBISE only).
9. **Refusals, empty corpora, and missing profiles are first-class screens**, designed here, not
   improvised in code.

---

## 12. Build order

1. **Tokens + shell** — `@theme` in `globals.css`, layout reskin (light-first), header/nav,
   wordmark. Pure restyle, no behavior change.
2. **Auth screens** — login/signup reskin with the illustration; move the PNG to
   `public/assets/`; remove invented board options.
3. **Ask** — restyle to this spec (teal answer card, calm refusal, citation inspector, bottom
   sheet on mobile).
4. **Quiz + Syllabus** — restyle; chapter picker wired to real `chapters` rows via the API.
5. **Eval** — restyle + manual trigger (behavior fix).
6. **Profile API + onboarding + settings** — `«needs API»` items: `POST/PATCH /api/profile`,
   then quiz history + question history routes.
7. **Dark mode** — token flip via `data-theme`, after the light theme is stable.

Steps 1–5 are frontend-only against existing routes. Step 6 adds routes; step 7 is tokens only.
