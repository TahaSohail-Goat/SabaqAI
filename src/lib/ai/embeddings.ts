// Embeddings via any OpenAI-compatible embeddings API. Default: Jina AI
// `jina-embeddings-v3` (native 1024-dim, strong multilingual — matters for Urdu and
// Roman Urdu questions). DashScope's Qwen text-embedding-v3 remains a drop-in
// alternative: set EMBEDDING_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
// and EMBEDDING_MODEL=text-embedding-v3.
//
// ONE model embeds both the ingested chunks and the incoming questions. Mixing models silently
// destroys search quality — the vectors stop being comparable, retrieval degrades, and nothing
// throws. If you change EMBEDDING_MODEL you must also change the migration's vector(N),
// EMBEDDING_DIM, and re-embed every existing chunk.
//
// Plain fetch on the OpenAI-compatible /embeddings shape — no extra dependency.

const DEFAULT_BASE_URL = 'https://api.jina.ai/v1';
const DEFAULT_MODEL = 'jina-embeddings-v3';
const DEFAULT_DIM = 1024;
/** Small batches stay inside every compatible provider's limits and keep retries cheap. */
const MAX_BATCH = 10;

export interface EmbedOptions {
  model?: string;
  dimensions?: number;
  signal?: AbortSignal;
  /** Jina's asymmetric retrieval mode — 'retrieval.passage' for ingested chunks,
   *  'retrieval.query' for the incoming question. Previously omitted entirely, which silently
   *  fell back to a generic embedding mode: two texts that are genuinely related but phrased
   *  differently (a paraphrased or broader question vs. the textbook's exact wording) score
   *  a real cosine similarity lower than they should, which is what made retrieval look like
   *  it "only worked for keyword-matching questions." Required, not defaulted, so a caller
   *  can't silently fall back into the same bug — pick the right one explicitly. */
  task: 'retrieval.passage' | 'retrieval.query';
}

function config() {
  const apiKey = process.env.EMBEDDING_API_KEY;
  if (!apiKey) {
    throw new Error(
      'EMBEDDING_API_KEY is not set. Embeddings cannot run. See docs/setup.md step 3.'
    );
  }
  return {
    apiKey,
    baseUrl: (process.env.EMBEDDING_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    model: process.env.EMBEDDING_MODEL || DEFAULT_MODEL,
    dimensions: Number(process.env.EMBEDDING_DIM ?? DEFAULT_DIM),
  };
}

/**
 * Embed many texts, in batches, preserving input order.
 * Throws on any failure — a silent embedding failure corrupts the whole index.
 */
export async function embedTexts(texts: string[], options: EmbedOptions): Promise<number[][]> {
  if (texts.length === 0) return [];

  const cfg = config();
  const model = options.model ?? cfg.model;
  const dimensions = options.dimensions ?? cfg.dimensions;
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH);

    const response = await fetch(`${cfg.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: batch, dimensions, encoding_format: 'float', task: options.task }),
      signal: options.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Embeddings failed (${response.status} ${response.statusText}) ` +
        `on batch ${i / MAX_BATCH + 1}: ${detail.slice(0, 400)}`
      );
    }

    const payload = (await response.json()) as {
      data?: { embedding?: number[]; index?: number }[];
    };

    if (!payload.data || payload.data.length !== batch.length) {
      throw new Error(
        `Embedding provider returned ${payload.data?.length ?? 0} embeddings for ${batch.length} inputs.`
      );
    }

    // The API may return results out of order; `index` is authoritative.
    const ordered = [...payload.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    for (const item of ordered) {
      const vector = item.embedding;
      if (!Array.isArray(vector) || vector.length === 0) {
        throw new Error('Embedding provider returned an empty embedding.');
      }
      // Fail loudly on a dimension mismatch. This is the #1 silent failure in this project:
      // a wrong-sized vector is rejected by Postgres with an error that never mentions the model.
      if (vector.length !== dimensions) {
        throw new Error(
          `Embedding dimension mismatch: model "${model}" returned ${vector.length}, ` +
          `but EMBEDDING_DIM is ${dimensions} and the migration declares vector(${dimensions}). ` +
          `Fix all three before ingesting. See docs/setup.md.`
        );
      }
      out.push(vector);
    }
  }

  return out;
}

/** Embed a single text. Used per question at query time — one call, not one per chunk. */
export async function embedText(text: string, options: EmbedOptions): Promise<number[]> {
  const [vector] = await embedTexts([text], options);
  return vector;
}
