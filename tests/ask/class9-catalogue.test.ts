import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { catalogueSchema, validateCatalogue, validateAgainstSnapshot, sha256 } from './class9/catalogue-schema';
import { renderCatalogue } from './class9/render-catalogue';
import { askRequestSchema } from '../../src/lib/ask/contracts';
const load=()=>JSON.parse(fs.readFileSync('tests/ask/class9/catalogue.json','utf8')) as unknown;

test('every catalogue question builds the current Ask request without correction, truncation or client-controlled policy flags',()=>{
  const data=validateCatalogue(load());
  for(const c of data.cases){
    const input={...c.scope,question:c.question,language:c.answerLanguage};
    const parsed=askRequestSchema.parse(input);
    assert.equal(parsed.question,c.question);assert.equal(parsed.sourceId,c.scope.sourceId);
    if(c.attack)assert.ok(askRequestSchema.safeParse({...input,sourceId:c.attack.sourceId}).success,'attack is a valid-shaped request with invalid membership, not a malformed UUID');
  }
});

test('Class 9 catalogue is complete, strict, source-linked and explicitly unexecuted',()=>{
  const data=validateCatalogue(load());
  assert.equal(data.execution.academicCasesExecuted,0);
  assert.equal(data.execution.providerCalls,0);
  assert.ok(data.cases.every(c=>c.status==='not_executed'));
  assert.ok(data.books.every(b=>!b.editionVerified));
  assert.ok(data.unavailable.some(x=>x.subject==='islamiyat'));
});

test('Class 9 catalogue covers all discovered books, selected chapters and three input language forms',()=>{
  const data=validateCatalogue(load());
  assert.deepEqual(new Set(data.cases.map(c=>c.questionLanguage)),new Set(['en','ur','roman_ur']));
  for(const book of data.books){
    const cases=data.cases.filter(c=>c.bookId===book.bookId&&!c.attack);
    assert.ok(cases.length>=15);
    for(const number of book.selectedChapterNumbers)assert.ok(cases.filter(c=>c.scope.chapterNo===number).length>=3);
  }
});

test('catalogue refuses invented IDs, pages, wrong support scope and stale excerpt hashes',()=>{
  const original=catalogueSchema.parse(load());
  for(const corrupt of [
    (d: typeof original)=>{d.cases[0].scope.sourceId='00000000-0000-4000-8000-000000000001';},
    (d: typeof original)=>{d.cases[0].evidence[0].pageFrom=9999;},
    (d: typeof original)=>{d.evidence[0].excerpt+=' invented';},
    (d: typeof original)=>{d.cases[0].evidence[0].role='outside_scope';},
    (d: typeof original)=>{d.cases[1].id=d.cases[0].id;},
  ]){const changed=structuredClone(original);corrupt(changed);assert.throws(()=>validateCatalogue(changed));}
});

test('source-identity attacks use real foreign books with shared chapter numbers and explicit transport rejection',()=>{
  const data=validateCatalogue(load()),attacks=data.cases.filter(c=>c.attack);
  assert.ok(attacks.length>=4);
  for(const c of attacks){assert.equal(c.scope.chapterNo,c.attack!.foreignChapterNo);assert.notEqual(c.scope.subject,c.attack!.foreignSubject);assert.deepEqual(c.acceptedPublicStatuses,['error']);assert.equal(c.attack!.expectedHttpStatus,400);}
});

test('local snapshot validator detects OCR/page drift rather than trusting a fixture quotation',()=>{
  const data=validateCatalogue(load());
  assert.throws(()=>validateAgainstSnapshot(data,{chapters:[]}));
  // A tiny synthetic snapshot exercises corruption detection without shipping a second corpus.
  // Actual full-record validation is the explicit read-only CLI, never a default DB test.
  const e=structuredClone(data.evidence[0]),source=structuredClone(data.sources.find(s=>s.sourceId===e.sourceId)!);
  const text='SYNTHETIC reference-validator sample, not textbook evidence.';
  e.excerpt=text;e.excerptSha256=sha256(text);e.contentSha256=sha256(text);e.additionalExcerpts=[];
  source.sectionCount=1;source.chunkCount=1;
  source.contentInventorySha256=sha256(JSON.stringify([e.chunkId,sha256(text),e.pageFrom,e.pageTo]));
  const sample={...data,sources:[source],evidence:[e],cases:[]};
  const snapshot={chapters:[{board:source.board,classLevel:9,subject:source.subject,chapterId:source.chapterId,chapterNo:source.chapterNo,chapterTitle:source.chapterTitle,sourceId:source.sourceId,language:source.language,storagePath:source.storagePath,sections:[{id:e.sectionId,label:e.sectionLabel,position:1,pageFrom:e.pageFrom,pageTo:e.pageTo,chunks:[{id:e.chunkId,index:e.chunkIndex,content:text,contentHash:e.storedContentHash}]}]}]};
  assert.doesNotThrow(()=>validateAgainstSnapshot(sample,snapshot));
  const changed=structuredClone(snapshot);changed.chapters[0].sections[0].chunks[0].content+=' corruption';
  assert.throws(()=>validateAgainstSnapshot(sample,changed),/drift/);
  const wrongPage=structuredClone(snapshot);wrongPage.chapters[0].sections[0].pageFrom=999;
  assert.throws(()=>validateAgainstSnapshot(sample,wrongPage),/drift/);
  const invented=structuredClone(sample);invented.evidence[0].excerpt='Invented quotation';invented.evidence[0].excerptSha256=sha256('Invented quotation');
  assert.throws(()=>validateAgainstSnapshot(invented,snapshot),/Invented excerpt/);
});

test('readable catalogue stays generated from the machine fixture, with explicit non-execution and OCR gaps',()=>{
  const data=validateCatalogue(load()),markdown=fs.readFileSync('docs/ask-evolution/CLASS9_TEST_CATALOGUE.md','utf8');
  assert.equal(markdown,renderCatalogue(data));
  assert.match(markdown,/No academic case has been executed/);
  assert.match(markdown,/unreadable_for_requested_detail/);
});
