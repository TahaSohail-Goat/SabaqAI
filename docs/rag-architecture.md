# RAG — how it works (single-app version)

```
question
  → detect language (Urdu / Roman Urdu / English)
  → normalise (Roman Urdu → Urdu script)
  → embed
  → vector search (filtered by board + class + subject)
  → score
  → GUARDRAIL ── REFUSE → refusal response (LLM never called)
             └── PASS/BORDERLINE
                   → build prompt from retrieved chunks only
                   → LLM (returns JSON with chunk-ID citations)
                   → validate citations against retrieved chunks
                   → answer
```

## Chunking (in `scripts/ingest.ts`)

- Split on chapter/heading first, then paragraphs.
- ~400–700 words per chunk, small overlap.
- Never let a chunk cross a chapter boundary — a citation must point somewhere specific.
- Each chunk stores: board, class, subject, chapter number + title, section, page (if known),
  source type (textbook / past_paper), the text, and its embedding.

## Embeddings

- Use ONE model for both ingesting chunks and embedding questions. Mixing models silently
  destroys search quality.
- Urdu text embeds as-is. Roman Urdu questions are transliterated to Urdu script first (this is
  your hardest problem — see below).
- The vector dimension is fixed. If you change the embedding model later, you must re-embed
  everything.

## Retrieval

- Always filter by the student's board + class + subject. An unfiltered search is a bug — it
  breaks grounding by pulling in the wrong curriculum.
- Get the top ~20, keep the best ~6 after removing near-duplicates.
- Distance is cosine; score = 1 - distance.

## Citation validation

1. The LLM returns statements, each tagged with the chunk IDs it used.
2. Reject any chunk ID that wasn't in the retrieved set.
3. Drop statements left with no valid citation.
4. If more than half are dropped, refuse instead of shipping a half-grounded answer.
5. Build the displayed citation (chapter, page, excerpt) from the **database row**, never from
   the model's output. The model picks *which* chunk; it never writes *what the citation says*.

## Roman Urdu (your biggest risk)

Roman Urdu has no fixed spelling (*kya / kia / kiya*), and embedding it directly makes search
quality collapse. Simplest working approach:
1. Normalise common spelling variants with a small lookup map.
2. Transliterate to Urdu script with a rule-based mapper + a dictionary of physics/biology terms.
3. Then embed.

Measure it on Day 6 with a few Roman Urdu questions in your eval set. If it's bad, say so in your
demo and show it as a known limitation — that's more credible than hiding it.
