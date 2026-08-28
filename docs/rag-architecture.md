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

**Model: Jina `jina-embeddings-v3` (1024-dim), through a provider-agnostic OpenAI-compatible
client.**

Chosen because it matches `vector(1024)` in the migration as written and needs no paid tier.
DashScope/Qwen `text-embedding-v3` remains a drop-in env-var alternative (also 1024-dim). Gemini
stays for generation.

- Use ONE model for both ingesting chunks and embedding questions. Mixing models silently
  destroys search quality.
- **Embed once, at ingest time.** Chunk embeddings are stored in `content_chunks.embedding`. Only
  the incoming question is embedded per request — one API call, not one per chunk.
- Urdu text embeds as-is. Roman Urdu questions are transliterated to Urdu script first (this is
  your hardest problem — see below).
- The vector dimension is fixed. If you change the embedding model later, you must change the
  migration, `EMBEDDING_DIM`, and re-embed everything.

## Retrieval

- Always filter by the student's board + class + subject. An unfiltered search is a bug — it
  breaks grounding by pulling in the wrong curriculum.
- Get the top ~20, keep the best ~6 after removing near-duplicates.
- Distance is cosine; score = 1 - distance.
- **Run the search server-side with the `service_role` key.** The RLS policy on `content_chunks`
  requires a `student_profiles` row that nothing currently creates — with the anon key, every query
  returns zero rows and the app refuses everything with no visible error. The explicit board/class/
  subject filter in code is what enforces correctness here; RLS stays on for `qa_log`, `quizzes`,
  and `quiz_attempts`, where it protects actual student data.

## Nearest chapters (on refusal)

When the gate refuses, the student is shown the chapters that came *closest*. These must be
computed from the actual retrieval scores for that question — the top distinct chapters below the
threshold. A fixed list is worse than showing nothing: it invites a judge to ask why a chemistry
question suggests Simple Harmonic Motion, and there is no good answer.

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
