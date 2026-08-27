# Source content

Put your syllabus documents here as `.json` files (e.g. `pctb-10-physics-ch14.json`).
**Not committed** — see `.gitignore`.

**Before ingesting:** make sure you have the right to use the material. For the demo, past papers
or openly available notes are the safe choice if the textbook licence isn't cleared. This is the
one issue you can't fix after a public demo.

## Format

`npm run ingest` reads every `.json` file in this folder and expects this shape
(`SourceDocument` in `src/lib/ingest/chunker.ts`):

```json
{
  "board": "PCTB",
  "classLevel": 10,
  "subject": "physics",
  "chapterNo": 14,
  "chapterTitle": "Current Electricity",
  "sourceType": "textbook",
  "language": "en",
  "sections": [
    {
      "section": "14.1 Electric Current",
      "pageFrom": 91,
      "pageTo": 92,
      "content": "Electric current is defined as the rate of flow of electric charge…"
    },
    {
      "section": "14.3 Ohm's Law and Resistance",
      "pageFrom": 95,
      "pageTo": 97,
      "content": "Ohm's Law states that the current passing through a conductor…"
    }
  ]
}
```

**One file per chapter.** Chunks are generated per section and never cross a chapter boundary, so a
citation always points somewhere specific.

| Field | Notes |
| --- | --- |
| `board`, `classLevel`, `subject` | Must match what the app queries with, exactly. Retrieval filters on these. |
| `chapterNo`, `chapterTitle` | Shown on the citation chip and in the refusal card's nearest chapters. |
| `sourceType` | `textbook`, `past_paper`, or `marking_scheme`. |
| `language` | `en` or `ur`. |
| `sections[].section` | The heading a student would recognise, e.g. `"14.3 Ohm's Law and Resistance"`. |
| `sections[].pageFrom` / `pageTo` | Optional but **strongly recommended** — the page number is the thing a student verifies against their own book. Without it the citation is much weaker. |
| `sections[].content` | The plain text. Paragraph breaks (`\n\n`) help the chunker split cleanly. |

## Getting from a PDF to this

1. Extract text per chapter, keeping page numbers as you go.
2. Split it into sections at the textbook's own headings.
3. Clean up hard-wrapped lines, headers/footers, and page-number artifacts — these pollute
   embeddings and show up inside citation excerpts, where a student will see them.
4. Write one JSON file per chapter.

## Check your chunking before spending API quota

```bash
npm run ingest -- --dry-run
```

This chunks everything and reports counts and average chunk size without calling any API or
writing anything. Tune chunk size in `src/lib/ingest/chunker.ts` until sections split sensibly,
then run for real.

Re-running ingestion is safe — chunks are keyed by content hash and existing ones are skipped.
