import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { liveAskRetrieval } from '../../src/lib/ask/evidence';
import { readAskConfig } from '../../src/lib/ask/config';
import { scope, seed, neighbor } from './fixtures';

test('real retrieval adapter sends scoped RPC and bounded section/order reads to a fixture PostgREST server', async () => {
  const requests: { url: URL; body: Record<string, unknown> }[] = [];
  const joined = (chunk: typeof neighbor) => ({
    id: chunk.id, section_id: chunk.sectionId, chunk_index: chunk.chunkIndex, content: chunk.content,
    sections: { id: chunk.sectionId, source_id: chunk.sourceId, section_label: chunk.section, position: 4,
      page_from: chunk.pageFrom, page_to: chunk.pageTo,
      chapter_sources: { id: chunk.sourceId, chapter_id: chunk.chapterId, source_type: chunk.sourceType, language_code: 'en',
        chapters: { id: chunk.chapterId, board_code: scope.board, class_level: scope.classLevel, subject_code: scope.subject,
          chapter_no: seed.chapterNo, chapter_title: seed.chapterTitle } } },
  });
  const server = createServer(async (req, res) => {
    const pieces: Buffer[] = []; for await (const piece of req) pieces.push(Buffer.from(piece));
    const raw = Buffer.concat(pieces).toString();
    const url = new URL(req.url!, 'http://fixture');
    const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    requests.push({ url, body });
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/v1/embeddings') res.end(JSON.stringify({ data: [{ index: 0, embedding: Array.from({ length: 1024 }, () => 0) }] }));
    else if (url.pathname.endsWith('/rpc/match_content_chunks')) res.end(JSON.stringify([{
      id: seed.id, chapter_no: seed.chapterNo, chapter_title: seed.chapterTitle, section: seed.section,
      page_from: seed.pageFrom, page_to: seed.pageTo, source_type: seed.sourceType, content: seed.content, score: 0.700123456,
    }]));
    else res.end(JSON.stringify(url.searchParams.has('id') ? [joined(seed)] : [joined(seed), joined(neighbor)]));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const saved = { ...process.env };
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: root, SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key', EMBEDDING_API_KEY: 'fixture-embedding-key', EMBEDDING_BASE_URL: root + '/v1', EMBEDDING_DIM: '1024' });
  try {
    const signal = new AbortController().signal, config = readAskConfig({});
    const seeds = await liveAskRetrieval.seeds(requestQuestion, scope, config, signal);
    assert.equal(seeds[0].score, 0.700123456); assert.equal(seeds[0].sourceId, seed.sourceId);
    const neighbors = await liveAskRetrieval.neighbors(seeds, scope, config, signal);
    assert.equal(neighbors[0].score, null); assert.equal(neighbors[0].id, neighbor.id);
    const rpc = requests.find((r) => r.url.pathname.includes('/rpc/'))!;
    assert.equal(rpc.body.filter_board, scope.board); assert.equal(rpc.body.filter_class, scope.classLevel);
    assert.equal(rpc.body.filter_subject, scope.subject); assert.equal(rpc.body.filter_source_type, scope.sourceType);
    assert.equal(rpc.body.filter_chapter_no, scope.chapterNo);
    const embedding = requests.find((r) => r.url.pathname.endsWith('/embeddings'))!;
    assert.deepEqual(embedding.body.input, [requestQuestion]);
    const reads = requests.filter((r) => r.url.pathname.endsWith('/content_chunks'));
    assert.equal(reads.length, 2);
    for (const read of reads) {
      assert.equal(read.url.searchParams.get('sections.chapter_sources.chapters.board_code'), 'eq.FBISE');
      assert.equal(read.url.searchParams.get('sections.chapter_sources.chapters.class_level'), 'eq.10');
      assert.equal(read.url.searchParams.get('sections.chapter_sources.chapters.subject_code'), 'eq.physics');
      assert.equal(read.url.searchParams.get('sections.chapter_sources.source_type'), 'eq.textbook');
    }
    assert.equal(reads[1].url.searchParams.get('section_id'), `eq.${seed.sectionId}`);
    assert.equal(reads[1].url.searchParams.get('order'), 'chunk_index.asc');
    assert.equal(reads[1].url.searchParams.get('limit'), '3');
    assert.ok(reads[1].url.searchParams.getAll('chunk_index').includes('gte.1'));
    assert.ok(reads[1].url.searchParams.getAll('chunk_index').includes('lte.3'));
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
const requestQuestion = 'Why does a 0.05 A current require constant temperature in this relationship?';
