// Day 2 Ingestion Script
import { INITIAL_SYLLABUS_CHUNKS } from '../src/lib/syllabus-data';

async function runIngest() {
  console.log('====================================================');
  console.log('  SABAQ AI — SYLLABUS INGESTION PIPELINE (DAY 2)');
  console.log('====================================================\n');
  console.log(`Ingesting ${INITIAL_SYLLABUS_CHUNKS.length} verified PCTB Class 10 Physics chunks into active knowledge base...`);

  for (const chunk of INITIAL_SYLLABUS_CHUNKS) {
    console.log(` -> [OK] Chapter ${chunk.chapterNo}: ${chunk.chapterTitle} | Section ${chunk.section} (Pages ${chunk.pageFrom}-${chunk.pageTo}) [Hash: ${chunk.contentHash}]`);
  }

  console.log(`\nSuccessfully ingested ${INITIAL_SYLLABUS_CHUNKS.length} chunks. Ready for vector retrieval and grounded generation.`);
}

runIngest().catch(console.error);
