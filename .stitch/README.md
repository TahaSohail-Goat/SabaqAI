# Stitch design workflow

How screens get designed and built for this app.

1. **Design in Stitch.** Use `.stitch/design-brief.md` as the standing context for the app, and
   the relevant file in `.stitch/screen-specs/` as the spec for whichever screen you're designing
   (e.g. `ask.md` for the Ask screen).
2. **Export and paste here.** When a screen's design is ready, export it from Stitch and paste the
   result into (or alongside) its spec file in `.stitch/screen-specs/`. This folder is the handoff
   point — nothing here gets built automatically.
3. **Hand it to Claude to implement.** Ask Claude to implement the pasted spec. Implementation
   rules:
   - Code goes in `src/app/` (and `src/lib/` for any supporting logic), matching how the app is
     already structured.
   - Use the existing Tailwind setup already in the project — don't add a new component library,
     CSS framework, or design system.
   - Match the data shapes the app already uses (see `src/lib/types.ts`) rather than inventing new
     ones — a screen spec describes states and layout, not new API contracts.

This folder holds specs only. No UI is generated from these files automatically — treat it as the
drop point for design work before it becomes code.
