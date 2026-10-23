import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { liveAskRetrieval } from '../../src/lib/ask/evidence';
import { readAskConfig } from '../../src/lib/ask/config';
import { scope, seed, neighbor } from './fixtures';
import { NextRequest } from 'next/server';
import { GET as getOptions } from '../../src/app/api/ask/options/route';
import { GET as getDocument } from '../../src/app/api/ask/document/route';

test('hybrid adapter embeds the full question once, verifies identity, and sends bounded scoped reads', async () => {
  const requests: { url: URL; body: Record<string, unknown> }[] = [];
  const sourceId = '00000000-0000-4000-8000-000000000001';
  let mode = 'normal';
  const joined = (chunk: typeof neighbor) => ({
    id: chunk.id, section_id: chunk.sectionId, chunk_index: chunk.chunkIndex, content: chunk.content,
    sections: { id: chunk.sectionId, source_id: sourceId, section_label: chunk.section, position: 4,
      page_from: chunk.pageFrom, page_to: chunk.pageTo,
      chapter_sources: { id: mode === 'foreign-source' ? 'different-source' : sourceId, chapter_id: chunk.chapterId, source_type: chunk.sourceType, language_code: 'en',
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
    else if (url.pathname.endsWith('/chapters')) res.end(JSON.stringify([{ chapter_no: seed.chapterNo, chapter_title: seed.chapterTitle,
      chapter_sources: [{ id: sourceId, source_type: 'textbook', language_code: 'en', storage_path: null, sections: [{ page_from: 12 }] },
        { id: '00000000-0000-4000-8000-000000000002', source_type: 'textbook', language_code: 'ur', storage_path: null, sections: [{ page_from: 31 }] }] }]));
    else if (url.pathname.endsWith('/chapter_sources')) res.end(JSON.stringify(mode === 'missing-source' ? [] : mode === 'ambiguous-source' ? [{ id: sourceId }, { id: sourceId }] : [{ id: sourceId }]));
    else if (url.pathname.endsWith('/rpc/search_ask_hybrid')) res.end(JSON.stringify([{ id: seed.id, score: 0.700123456, retrieval_rank: 1 }]));
    else res.end(JSON.stringify(url.searchParams.has('id') ? [joined(seed)] : [joined(seed), joined(neighbor)]));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const saved = { ...process.env };
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: root, SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key', EMBEDDING_API_KEY: 'fixture-embedding-key', EMBEDDING_BASE_URL: root + '/v1', EMBEDDING_DIM: '1024' });
  try {
    const signal = new AbortController().signal, config = readAskConfig({});
    const durations: Record<string, number> = {};
    const seeds = await liveAskRetrieval.seeds(requestQuestion, scope, config, signal, { concepts: ['current', 'constant temperature'], durations });
    assert.equal(seeds[0].score, 0.700123456); assert.equal(seeds[0].sourceId, sourceId);
    const neighbors = await liveAskRetrieval.neighbors(seeds, scope, config, signal);
    assert.equal(neighbors[0].score, null); assert.equal(neighbors[0].id, neighbor.id);
    const rpc = requests.find((r) => r.url.pathname.includes('/rpc/'))!;
    assert.equal(rpc.body.filter_board, scope.board); assert.equal(rpc.body.filter_class, scope.classLevel);
    assert.equal(rpc.body.filter_subject, scope.subject); assert.equal(rpc.body.filter_source_type, scope.sourceType);
    assert.equal(rpc.body.filter_chapter_no, scope.chapterNo);
    assert.equal(rpc.body.filter_source_id, '00000000-0000-4000-8000-000000000001');
    assert.ok((rpc.body.search_terms as string[]).includes('temperature'));
    assert.deepEqual(Object.keys(durations).sort(), ['embedding', 'hybrid_search', 'hydration', 'source_validation']);
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
    assert.equal(reads[0].url.searchParams.get('sections.source_id'), `eq.${sourceId}`);
    assert.equal(reads[1].url.searchParams.get('sections.source_id'), `eq.${sourceId}`);
    const optionsResponse = await getOptions(new NextRequest('http://fixture/api/ask/options?board=FBISE&classLevel=10&subject=physics'));
    const options = await optionsResponse.json();
    const units = options.sources.find((s: { sourceType: string }) => s.sourceType === 'textbook').units;
    assert.equal(units.length, 2, 'do not collapse different language/document identities');
    assert.deepEqual(units.map((u: { sourceLanguage: string }) => u.sourceLanguage), ['en', 'ur']);
    assert.deepEqual(units.map((u: { pageFrom: number }) => u.pageFrom), [12, 31]);
    const document = await getDocument(new NextRequest(`http://fixture/api/ask/document?board=FBISE&classLevel=10&subject=physics&sourceType=textbook&chapterNo=14&sourceId=${sourceId}`));
    assert.equal(document.status, 200);
    assert.equal((await document.json()).sections[0].chunks[0].id, seed.id);
    assert.equal(requests.filter((r) => r.url.pathname.endsWith('/content_chunks')).at(-1)!.url.searchParams.get('sections.source_id'), `eq.${sourceId}`);
    const embeddingCount = () => requests.filter((r) => r.url.pathname.endsWith('/embeddings')).length;
    for (const failure of ['missing-source', 'ambiguous-source']) {
      mode = failure;
      const before = embeddingCount();
      await assert.rejects(liveAskRetrieval.seeds(requestQuestion, scope, config, signal), (e: unknown) => (e as { code: string }).code === 'invalid_request');
      assert.equal(embeddingCount(), before, 'invalid identity fails before embedding');
    }
    mode = 'foreign-source';
    await assert.rejects(liveAskRetrieval.seeds(requestQuestion, scope, config, signal), (e: unknown) => (e as { code: string }).code === 'invalid_output');
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
const requestQuestion = 'Why does a 0.05 A current require constant temperature in this relationship?';
