## What this changes

<!-- One or two sentences: what does this PR do, and why? -->

## Which step is this?

<!-- If this addresses one of the ordered steps in AGENTS.md / HANDOFF.md
     (provision → ingest → verify retrieval → recalibrate → fix near-miss leak →
     persist quizzes → voice input), name it. Otherwise: N/A. -->

## Checklist

- [ ] `npm run lint` passes locally
- [ ] `npm run build` passes locally
- [ ] This was run against real data/services, not just read and assumed correct (or N/A — doc-only change)
- [ ] `docs/project-status.md` updated if this made something real that was stubbed, or changed what's verified
- [ ] None of the invariants in `AGENTS.md` were weakened — in particular: the LLM is still never
      called on REFUSE, generation still refuses rather than fabricates on failure, and citations
      still come from the stored chunk row, never from model output

## Anything the reviewer should double-check

<!-- A known limitation, an assumption you made, a metric still on fallback/local data, etc. -->
