# Sabaq AI — Premium Frontend Design Specification

The single source of truth for what the UI looks like, how it behaves dynamically, and where every visible value comes from. This specification focuses on **premium aesthetics, dynamic micro-interactions, glassmorphism, and responsive modern design** while strictly preserving the existing semantic color system and all product invariants.

**Governing inputs, in priority order:**
1. `supabase/migrations/0001_init.sql` — every piece of data the UI shows or collects maps to a table/column in this schema. The UI invents nothing.
2. `docs/SabaqAI_Colortheme.md` and this document for all styling, animations, and behaviors.
3. `docs/api-spec.md` — every fetch the UI makes.
4. `public/assets/auth-illustration.png` — the login/signup illustration.
5. `AGENTS.md` — the UI invariants (citation is primary, refusal is calm, confidence is icon + label, Urdu gets `dir="rtl"`).

**Scope: Modern Web Application.** Desktop is the primary design target, prioritizing rich aesthetics (blur effects, smooth transitions, hover-states). Pages should dynamically adjust (responsive grids, fluid typography) but no mobile-app exclusive patterns (bottom sheets, mobile-first breakpoints) are forced on desktop.

When this doc and the code disagree, the code is stale — fix the code, then this doc.

---

## 1. Design Tokens & Core Aesthetics

Tailwind v4 — there is no `tailwind.config.js`. Tokens live in `@theme` inside `src/app/globals.css`. Colors are strictly preserved from the original semantic spec.

### Color Theme

```css
@theme {
  /* Brand (Learning) */
  --color-brand:        #237A57;
  --color-brand-dark:   #185C43;
  --color-brand-light:  #DDEFE7;
  --color-brand-mint:   #EEF7F3;

  /* AI / RAG */
  --color-ai:           #2A8C82;
  --color-ai-light:     #E7F4F1;
  --color-ai-border:    #B9DDD6;

  /* Quiz / Practice */
  --color-quiz:         #C58A35;
  --color-quiz-light:   #FBF3E5;
  --color-quiz-border:  #E8D1A7;

  /* Text (Navy = knowledge) */
  --color-navy:         #102A3A;
  --color-navy-2:       #294454;
  --color-text-2:       #536773;
  --color-text-3:       #82929B;

  /* Surfaces */
  --color-page:         #F8FAF9;
  --color-surface:      #FFFFFF;
  --color-surface-2:    #F0F6F3;

  /* Borders */
  --color-border:       #DCE5E1;
  --color-border-strong:#C5D3CD;

  /* Status */
  --color-success:      #237A57;
  --color-warning:      #C58A35;
  --color-error:        #C65353;
  --color-error-bg:     #FBECEC;
  --color-info:         #3B73B9;
  --color-info-bg:      #EAF1F8;

  /* Subject identifiers */
  --color-subj-physics:   #7564B8;
  --color-subj-chemistry: #2A8C82;
  --color-subj-biology:   #4D956B;
  --color-subj-maths:     #3B73B9;
  --color-subj-cs:        #5367B8;
  --color-subj-english:   #C98345;
  --color-subj-urdu:      #B86473;

  --radius-card: 1rem; /* Slightly larger for a premium, modern feel */
}
```

### Dynamic Design & Rich Aesthetics (NEW)

1. **Glassmorphism:** Use `backdrop-blur-md` or `backdrop-blur-lg` with semi-transparent background colors (e.g., `bg-white/80` or `bg-surface/70`) for sticky headers, modal overlays, and floating citation inspectors. This creates depth without clutter.
2. **Smooth Transitions:** EVERY interactive element must have a transition (`transition-all duration-300 ease-in-out`).
3. **Hover States & Micro-animations:**
   - Cards: Subtle lift (`hover:-translate-y-1 hover:shadow-lg`) on actionable cards.
   - Buttons: Active press effects (`active:scale-95`), slight glow on primary brand buttons.
   - Citation Chips: Expand or highlight smoothly when hovered to indicate they are primary trust elements.
4. **Shadows:** Use diffused, soft shadows (`shadow-sm` for standard cards, `shadow-xl shadow-navy/5` for floating elements) rather than harsh outlines.
5. **Gradients:** The single permitted gradient (`135deg, #185C43 → #237A57 → #2A8C82`) is used for the quiz progress bar, special AI highlight borders, and subtle loading shimmer effects.

### Typography
- **Fonts:** System fonts (Inter/San Francisco/Roboto) are retained. Use tight tracking (`tracking-tight`) on headings for a sleek look, and relaxed leading (`leading-relaxed`) on body text (especially excerpts) for readability.
- **Urdu Text:** Must be `dir="rtl"` at the block level.

---

## 2. App Shell & Navigation (Premium Redesign)

The app shell transitions from a basic structural layout to a cohesive, fluid workspace.

- **Header:** Sticky with glassmorphism (`bg-surface/80 backdrop-blur-md border-b border-white/20`).
  - Left: Logo + "Sabaq AI" wordmark (`Sabaq` in `#102A3A`, `AI` in `#237A57`). Beautiful typography hierarchy.
  - Middle/Right: Smooth, pill-shaped segmented controls for Tabs (Ask, Quiz, Eval, Syllabus) featuring a sliding active indicator (or at least rounded active pills with brand color and soft shadow, replacing the old underline).
  - Far Right: Scope selectors (Board + Class) as styled dropdowns with custom chevron icons. Language toggle (EN / UR) as an elegant pill toggle. User profile chip with a subtle hover dropdown or expansion.
- **Background:** The body uses `--color-page` (`#F8FAF9`), providing a calm, premium canvas for the bright white cards.

---

## 3. Ask Flow & Citation Inspector (The Core Experience)

The layout remains two-column (7 / 5), but the execution is significantly upgraded.

### Question Card
- Large, inviting, auto-resizing textarea.
- The card itself has a soft border (`border-border`) but features an inner shadow or focus-ring glow (`focus-within:ring-2 focus-within:ring-brand/20`) when active.
- Primary CTA ("Ask Sabaq") features the brand gradient on hover and a micro-interaction arrow animation (`group-hover:translate-x-1`).
- Sample queries are rendered as sleek pill tags that scale up slightly on hover.

### Answer Card (AI State)
- **AI Teal Identity:** Uses `--color-ai-light` with `--color-ai-border`.
- **Confidence Badge:** Smooth fade-in. Icon + Label (e.g., "High Confidence").
- **Citations as Primary Elements:** Citations (`[Ch 14, p. 95]`) inline in the text look like sleek interactive badges (`bg-brand-mint text-brand-dark hover:bg-brand-light hover:ring-1 hover:ring-brand/50`). Clicking them triggers a smooth state update in the Citation Inspector.

### Citation Inspector (Right Column)
- Acts as a sticky, floating trust panel.
- Styled with subtle glassmorphism if it overlays anything, or a solid crisp white card with a deep, soft shadow.
- The excerpt text is beautifully formatted with a subtle left-border (block-quote style) in `--color-brand`.
- If empty, displays a beautifully crafted empty state with a 40% opacity SVG illustration (or Lucide icon) and calm typography.

### Refusal State (Invariant 2)
- **MUST BE CALM.** White card. Navy heading. `HelpCircle` icon in warning amber (`#C58A35`). **Never red.**
- Animations should be soft fades. Nearest chapter suggestions are rendered as elegant mini-cards that look clickable/explorable.

---

## 4. Quiz & Syllabus

### Quiz (Amber Accents)
- Setup bar uses amber accents sparingly (e.g., selection rings).
- The quiz card uses a clean, distraction-free reading layout.
- Options are large, touch-friendly blocks. When selected, the block gets a subtle amber or brand border and a checkmark smoothly transitions in.
- The progress bar utilizes the permitted green-teal gradient, smoothly filling the width `transition-[width] duration-500`.

### Syllabus Explorer
- The `/ask` scope picker (subject → source type → chapter/paper dropdowns) with **no question
  box**, beside a source-PDF reader that scrolls top-to-bottom.
- Reader controls: zoom in/out, and "expand" → a fullscreen modal (portalled above the app
  shell; dismissed by ✕, Esc, or backdrop click).
- Source dropdown shows an honest "nothing ingested yet" for empty categories.

---

## 5. Evaluation Dashboard (Internal)
- Retains the "Internal" marking.
- Metric cards are styled as premium dashboard widgets: large navy numerals, crisp borders, and subtle shadow depth.
- No metrics are hardcoded. A skeleton loader (`animate-pulse` over `--color-surface-2`) is shown until data arrives.

---

## 6. Component Inventory Summary

| Component | Premium Execution Spec |
|---|---|
| `Button` | Active state scaling (`active:scale-[0.98]`), hover gradients or glow, smooth transitions. |
| `Input`/`Textarea` | Smooth focus rings (`focus:ring-2 focus:ring-brand/30 focus:border-brand`), soft inner shadows. |
| `Card` | `bg-white`, `border border-border/50`, `shadow-sm`, `rounded-2xl` (`1rem`). |
| `GlassPanel` (New)| `bg-white/70`, `backdrop-blur-lg`, `border border-white/50`, `shadow-md`. |
| `CitationChip` | Primary interactive. Teal family. Hover state triggers a subtle lift and highlight. |
| `Skeleton` | Shimmer effect using a linear gradient mask over `--color-surface-2`. |

---

## 7. Compliance with AGENTS.md Invariants

1. **No Mobile First:** Designed specifically for desktop with robust, complex layouts.
2. **Refusal is Calm:** Warning/neutral styling only. No error colors for off-syllabus.
3. **No Generated Citations:** All citations and pages are purely rendered from DB facts.
4. **No Hardcoded Metrics:** The Eval dashboard calculates everything live.
5. **Urdu is RTL:** Proper `dir="rtl"` applied strictly to Urdu blocks.
