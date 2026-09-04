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
  /** Opt-in retry/backoff for 429 (rate limit) responses — off by default (maxAttempts
   *  effectively 1), since a live question-embedding call (guardrail/retrieval) shouldn't add
   *  latency a waiting student feels for a failure that's usually rare at that low a call
   *  volume. The crawler's bulk ingestion calls pass this explicitly (crawler redesign,
   *  Phase 1 — a full re-crawl makes far more calls in a shorter window than any prior run). */
  retry?: { maxAttempts: number; baseDelayMs: number };
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

type EmbeddingBatchPayload = { data?: { embedding?: number[]; index?: number }[] };

/** Posts one batch, retrying only on HTTP 429 and only when options.retry says to — every
 *  other failure (4xx/5xx, network error) still throws immediately on the first attempt,
 *  unchanged from before this existed. */
async function fetchEmbeddingBatch(
  cfg: ReturnType<typeof config>,
  model: string,
  batch: string[],
  dimensions: number,
  options: EmbedOptions,
  batchIndex: number
): Promise<EmbeddingBatchPayload> {
  const maxAttempts = options.retry?.maxAttempts ?? 1;
  const baseDelayMs = options.retry?.baseDelayMs ?? 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(`${cfg.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: batch, dimensions, encoding_format: 'float' }),
      signal: options.signal,
    });

    if (response.ok) {
      return (await response.json()) as EmbeddingBatchPayload;
    }

    const canRetry = response.status === 429 && attempt < maxAttempts;
    if (!canRetry) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Embeddings failed (${response.status} ${response.statusText}) ` +
        `on batch ${batchIndex + 1}: ${detail.slice(0, 400)}`
      );
    }

    const delayMs = baseDelayMs * 2 ** (attempt - 1);
    console.error(`[embeddings] 429 rate-limited on batch ${batchIndex + 1}, attempt ${attempt}/${maxAttempts} — retrying in ${delayMs}ms.`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  // Unreachable — the loop above always either returns or throws — but keeps TS satisfied
  // that every code path returns a value.
  throw new Error('Embeddings retry loop exited without a result.');
}

/**
 * Embed many texts, in batches, preserving input order.
 * Throws on any failure — a silent embedding failure corrupts the whole index.
 */
export async function embedTexts(texts: string[], options: EmbedOptions = {}): Promise<number[][]> {
  if (texts.length === 0) return [];

  const cfg = config();
  const model = options.model ?? cfg.model;
  const dimensions = options.dimensions ?? cfg.dimensions;
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH);
    const payload = await fetchEmbeddingBatch(cfg, model, batch, dimensions, options, i / MAX_BATCH);

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
export async function embedText(text: string, options: EmbedOptions = {}): Promise<number[]> {
  const [vector] = await embedTexts([text], options);
  return vector;
}
