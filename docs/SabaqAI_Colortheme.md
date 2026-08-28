# SabaqAI — UI/UX Color & Design System

## 1. Project Overview

**SabaqAI** is an AI-powered study companion designed around RAG (Retrieval-Augmented Generation).

Core student features:
- Search and ask questions from textbooks/books.
- Retrieve relevant information from a selected source.
- Generate quizzes.
- Generate practice questions.
- Explain topics.
- Keep answers within the scope of board examinations.
- Initially designed with Pakistani board students in mind, while keeping the product general and globally usable.

### Brand positioning

SabaqAI should feel:
- Educational
- Trustworthy
- Calm
- Modern
- Student-friendly
- AI-powered without looking like a generic AI chatbot

Avoid an overly bright, neon, or purple-heavy "AI startup" appearance.

---

# 2. Core Brand Identity

## Primary brand combination

| Element | Color | HEX |
|---|---|---|
| Sabaq text | Deep Navy | `#102A3A` |
| AI text | Primary Green | `#237A57` |
| Main brand color | Primary Green | `#237A57` |
| AI functionality | Teal | `#2A8C82` |

The wordmark should generally use:

```text
Sabaq → #102A3A
AI    → #237A57
```

---

# 3. Main Color Palette

## Brand

| Name | HEX | Usage |
|---|---|---|
| Primary Green | `#237A57` | Main buttons, active states, links, CTAs |
| Dark Green | `#185C43` | Hover states, emphasized green elements |
| Light Green | `#DDEFE7` | Secondary buttons, selected backgrounds |
| Mint | `#EEF7F3` | Very subtle green backgrounds |

## Navy

| Name | HEX | Usage |
|---|---|---|
| Deep Navy | `#102A3A` | Main headings, primary text, branding |
| Navy Secondary | `#294454` | Secondary dark elements |

## AI / RAG

| Name | HEX | Usage |
|---|---|---|
| AI Teal | `#2A8C82` | AI responses, RAG indicators, book intelligence |
| AI Light | `#E7F4F1` | AI/RAG backgrounds |
| AI Border | `#B9DDD6` | AI/RAG card borders |

---

# 4. Background Colors

Do not use pure white as the entire website background.

| Name | HEX | Usage |
|---|---|---|
| Main Background | `#F8FAF9` | Main website/app background |
| Secondary Background | `#F0F6F3` | Sections, sidebars, secondary areas |
| Surface | `#FFFFFF` | Cards, modals, login panels |
| Pure White | `#FFFFFF` | High-contrast surfaces |

Recommended:

```css
body {
    background: #F8FAF9;
}
```

---

# 5. Text Colors

| Name | HEX | Usage |
|---|---|---|
| Primary Text | `#102A3A` | Headings and important content |
| Secondary Text | `#536773` | Descriptions and supporting text |
| Muted Text | `#82929B` | Placeholder text, timestamps, metadata |
| Text on Green | `#FFFFFF` | Text placed on green buttons |

Example:

```css
.heading {
    color: #102A3A;
}

.description {
    color: #536773;
}

.placeholder {
    color: #82929B;
}
```

---

# 6. Green Scale

Use this scale when a component needs different shades of the brand green.

```text
Green 900    #185C43
Green 800    #1D694D
Green 700    #237A57   ← Primary
Green 600    #2F8C68
Green 500    #4FA47F
Green 400    #78BA9C
Green 300    #A8D4BF
Green 200    #CDE7DA
Green 100    #DDEFE7
Green 50     #EEF7F3
```

Most of the UI should rely primarily on:

```text
#237A57
#DDEFE7
#EEF7F3
```

Do not use every shade just because it exists.

---

# 7. Buttons

## Primary Button

```text
Background: #237A57
Text:       #FFFFFF
Hover:      #185C43
```

Example:

```css
.btn-primary {
    background: #237A57;
    color: #FFFFFF;
}

.btn-primary:hover {
    background: #185C43;
}
```

Use for:
- Login
- Sign Up
- Ask AI
- Generate Quiz
- Upload Book
- Save
- Main CTAs

## Secondary Button

```text
Background: #DDEFE7
Text:       #185C43
Hover:      #CDE7DA
```

## Outline Button

```text
Background: transparent
Border:     #237A57
Text:       #237A57
```

## Disabled Button

```text
Background: #E4E9E7
Text:       #9AA6A1
```

---

# 8. Inputs

Recommended input styling:

```text
Background:  #FFFFFF
Border:      #DCE5E1
Text:        #102A3A
Placeholder: #82929B
Focus:       #237A57
```

Example:

```css
.input {
    background: #FFFFFF;
    border: 1px solid #DCE5E1;
    color: #102A3A;
}

.input::placeholder {
    color: #82929B;
}

.input:focus {
    border-color: #237A57;
    outline: none;
}
```

Avoid very dark input borders.

---

# 9. Cards

## Standard Card

```text
Background: #FFFFFF
Border:     #E3EBE7
```

## Login / Signup Card

```text
Background: #FFFFFF
Border:     #DCE5E1
Shadow:     rgba(16, 42, 58, 0.08)
```

Example:

```css
.card {
    background: #FFFFFF;
    border: 1px solid #E3EBE7;
    box-shadow: 0 8px 24px rgba(16, 42, 58, 0.08);
}
```

Use rounded corners consistently throughout the app.

---

# 10. Borders

| Name | HEX | Usage |
|---|---|---|
| Normal Border | `#DCE5E1` | Inputs/cards |
| Strong Border | `#C5D3CD` | Important separators |
| Active Border | `#237A57` | Focus/selection |

Keep borders subtle.

---

# 11. AI / RAG Design Language

RAG is one of SabaqAI's defining features, so it should have its own visual treatment.

## AI

```text
Primary: #2A8C82
Background: #E7F4F1
Border: #B9DDD6
```

Use this for:
- AI-generated answers
- RAG retrieval indicators
- Source references
- Book intelligence
- AI explanations
- "Ask SabaqAI"
- Retrieved context

Example:

```text
┌─────────────────────────────────┐
│  AI Answer                      │
│                                 │
│  Based on your selected book... │
│                                 │
│  📖 Source: Physics — Ch. 4     │
└─────────────────────────────────┘
```

AI-related UI should not always be green. Use teal to visually separate AI/RAG functionality from normal actions.

---

# 12. Quiz Design

Quizzes should have a warm accent so students can recognize them immediately.

| Element | HEX |
|---|---|
| Quiz Primary | `#C58A35` |
| Quiz Background | `#FBF3E5` |
| Quiz Border | `#E8D1A7` |

Use for:
- Quiz mode
- Quiz cards
- Quiz progress
- Practice sessions
- Achievement indicators

Do not make the entire quiz interface orange.

---

# 13. Subject Colors

Use subject colors as secondary identifiers.

| Subject | HEX |
|---|---|
| Mathematics | `#3B73B9` |
| Physics | `#7564B8` |
| Chemistry | `#2A8C82` |
| Biology | `#4D956B` |
| Computer Science | `#5367B8` |
| English | `#C98345` |
| Urdu | `#B86473` |
| General | `#687984` |

Example:

```text
📘 Mathematics
```

could use:

```text
#3B73B9
```

Subject colors should not override the SabaqAI brand colors.

---

# 14. System / Status Colors

| Status | HEX |
|---|---|
| Success | `#237A57` |
| Warning | `#C58A35` |
| Error | `#C65353` |
| Error Background | `#FBECEC` |
| Information | `#3B73B9` |
| Information Background | `#EAF1F8` |

Use status colors only where their semantic meaning is required.

---

# 15. Optional Gradient

Gradients should be used sparingly.

Recommended SabaqAI gradient:

```css
background: linear-gradient(
    135deg,
    #185C43,
    #237A57,
    #2A8C82
);
```

Good uses:
- Special AI actions
- Premium features
- Progress bars
- Highlight cards

Do not make the entire website gradient-based.

---

# 16. Dark Mode

SabaqAI should support dark mode because students may study at night.

## Dark Colors

| Name | HEX |
|---|---|
| Dark Background | `#0E1B23` |
| Dark Secondary | `#142832` |
| Dark Card | `#182F3A` |
| Dark Border | `#29434B` |
| Dark Primary Text | `#F1F7F4` |
| Dark Secondary Text | `#A8BBB4` |
| Dark Green | `#4FA47F` |
| Dark Green Hover | `#65B792` |

Example:

```css
[data-theme="dark"] {
    --background: #0E1B23;
    --surface: #182F3A;
    --surface-secondary: #142832;
    --border: #29434B;

    --text-primary: #F1F7F4;
    --text-secondary: #A8BBB4;

    --primary: #4FA47F;
    --primary-hover: #65B792;
}
```

---

# 17. Recommended CSS Variables

Use centralized variables instead of hardcoding colors throughout components.

```css
:root {
    /* Brand */
    --primary: #237A57;
    --primary-dark: #185C43;
    --primary-light: #DDEFE7;

    /* AI */
    --ai: #2A8C82;
    --ai-light: #E7F4F1;
    --ai-border: #B9DDD6;

    /* Background */
    --background: #F8FAF9;
    --surface: #FFFFFF;
    --surface-secondary: #F0F6F3;

    /* Text */
    --text-primary: #102A3A;
    --text-secondary: #536773;
    --text-muted: #82929B;

    /* Borders */
    --border: #DCE5E1;
    --border-strong: #C5D3CD;

    /* Status */
    --success: #237A57;
    --warning: #C58A35;
    --error: #C65353;
    --info: #3B73B9;

    /* Quiz */
    --quiz: #C58A35;
    --quiz-light: #FBF3E5;
}
```

---

# 18. Tailwind Configuration Reference

If using Tailwind, map the colors to semantic names rather than repeatedly using raw HEX values.

Example:

```js
colors: {
    brand: {
        DEFAULT: "#237A57",
        dark: "#185C43",
        light: "#DDEFE7",
    },

    ai: {
        DEFAULT: "#2A8C82",
        light: "#E7F4F1",
        border: "#B9DDD6",
    },

    navy: {
        DEFAULT: "#102A3A",
        secondary: "#294454",
    },

    surface: {
        DEFAULT: "#FFFFFF",
        secondary: "#F0F6F3",
    },

    page: "#F8FAF9",

    text: {
        primary: "#102A3A",
        secondary: "#536773",
        muted: "#82929B",
    },

    quiz: {
        DEFAULT: "#C58A35",
        light: "#FBF3E5",
    },

    error: "#C65353",
    info: "#3B73B9",
}
```

---

# 19. Login / Signup Page

The current SabaqAI login/signup concept uses a light educational illustration.

Recommended colors:

```text
Page Background       #F8FAF9
Logo "Sabaq"          #102A3A
Logo "AI"             #237A57
Heading               #102A3A
Feature Icons         #237A57
Feature Cards         #FFFFFF
Feature Card Border   #E3EBE7
Login Card            #FFFFFF
Input Border           #DCE5E1
Input Focus            #237A57
Primary Button         #237A57
Button Hover           #185C43
Secondary Text        #536773
Placeholder           #82929B
```

The background illustration should remain soft and low-contrast so the login/signup form remains the visual focus.

---

# 20. UI Hierarchy

Use color to establish hierarchy.

### Highest importance

```text
#102A3A  → Main text/headings
#237A57  → Primary actions
```

### Medium importance

```text
#536773  → Secondary text
#2A8C82  → AI/RAG
```

### Low importance

```text
#82929B  → Metadata/placeholders
#DCE5E1  → Borders
#EEF7F3  → Subtle backgrounds
```

Avoid making everything colorful. Color should communicate meaning.

---

# 21. Design Rules

## DO

- Use navy for major text.
- Use green for primary actions.
- Use teal for AI/RAG functionality.
- Use amber for quizzes/practice.
- Keep backgrounds light and calm.
- Use white cards against the off-white page background.
- Use subtle borders and shadows.
- Keep subject colors secondary.
- Maintain consistent border radius.
- Support dark mode.

## DON'T

- Don't use neon green.
- Don't use bright purple as the main brand color.
- Don't use pure black for normal text.
- Don't make every card colorful.
- Don't use gradients everywhere.
- Don't mix several unrelated accent colors.
- Don't use subject colors for primary navigation/buttons.
- Don't make the UI look like a generic AI chatbot.

---

# 22. Suggested Visual Language

SabaqAI should communicate:

```text
                    SABAQAI
                       │
          ┌────────────┼────────────┐
          │            │            │
       Learning       AI/RAG      Practice
          │            │            │
        Green         Teal        Amber
          │            │            │
       #237A57       #2A8C82      #C58A35
```

Overall:

```text
        TRUST
          ↓
      Deep Navy
          +
       LEARNING
          ↓
    Primary Green
          +
        AI/RAG
          ↓
        Teal
          +
       PRACTICE
          ↓
        Amber
```

---

# 23. Quick Reference

If you forget everything else while coding, use this:

```text
PRIMARY GREEN    #237A57
DARK GREEN       #185C43
LIGHT GREEN      #DDEFE7

AI TEAL          #2A8C82
AI LIGHT         #E7F4F1

NAVY             #102A3A
SECONDARY TEXT   #536773
MUTED TEXT       #82929B

BACKGROUND       #F8FAF9
SURFACE          #FFFFFF
SECONDARY BG     #F0F6F3

BORDER           #DCE5E1

QUIZ             #C58A35
ERROR            #C65353
INFO             #3B73B9
```

## Brand rule of thumb

**Navy = Knowledge**  
**Green = SabaqAI / Actions**  
**Teal = AI / RAG**  
**Amber = Quiz / Practice**  
**Off-white = Learning environment**
