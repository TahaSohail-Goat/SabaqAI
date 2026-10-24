import { z } from 'zod';
import { createHash } from 'node:crypto';

const strings = z.array(z.string().min(1));
const page = z.number().int().nonnegative().nullable();
const uuid = z.uuid();
const scope = z.object({ board: z.string().min(1), classLevel: z.literal(9), subject: z.string().min(1), sourceType: z.literal('textbook'), sourceId: uuid, chapterNo: z.number().int().positive() }).strict();
const excerpt = z.object({ text: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const evidenceSchema = z.object({ chunkId: uuid, board: z.string(), classLevel: z.literal(9), subject: z.string(), sourceType: z.literal('textbook'), sourceId: uuid, chapterId: uuid, chapterNo: z.number().int().positive(), sectionId: uuid, sectionLabel: z.string(), pageFrom: page, pageTo: page, chunkIndex: z.number().int().positive(), storedContentHash: z.string().min(1), contentSha256: z.string().regex(/^[a-f0-9]{64}$/), excerpt: z.string().min(1), excerptSha256: z.string().regex(/^[a-f0-9]{64}$/), additionalExcerpts: z.array(excerpt), quality: z.enum(['readable','degraded','unreadable_for_requested_detail']), reviewNote: z.string().min(1) }).strict();
const sourceSchema = scope.extend({ bookId: z.string(), chapterId: uuid, chapterTitle: z.string(), language: z.string(), storagePath: z.string().nullable(), sectionCount: z.number().int().nonnegative(), chunkCount: z.number().int().nonnegative(), pageFrom: page, pageTo: page, selected: z.boolean(), contentInventorySha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const bookSchema = z.object({ bookId: z.string(), board: z.string(), classLevel: z.literal(9), subject: z.string(), language: z.string(), label: z.string(), identityBasis: z.string(), editionVerified: z.literal(false), editionProvenance: z.string(), provenanceFile: z.string(), discoveredChapterCount: z.number().int().positive(), selectedChapterNumbers: z.array(z.number().int().positive()), selectionRationale: z.string(), sourceIds: z.array(uuid), evidenceGaps: strings }).strict();
const term = z.object({ term: z.string(), occurrences: z.number().int().nonnegative() }).strict();
const caseSchema = z.object({
  id: z.string().regex(/^C9-(?:BIO|CHE|CSC|ENG|MAT|PAK|PHY|URD|ISO)-\d{3}$/), bookId: z.string(), scope, chapterId: uuid, chapterTitle: z.string(), question: z.string().min(15).max(1600), questionLanguage: z.enum(['en','ur','roman_ur']), answerLanguage: z.enum(['en','ur']), tags: strings.min(1),
  expectedInterpretation: z.object({ meaning: z.string().min(1), keyConcepts: strings.min(1), allowEquivalentWording: z.literal(true), preserveFalsePremiseUntilAnswer: z.boolean() }).strict(),
  expectedOutcome: z.enum(['answer','partial_answer','clarification','refusal','capability_limitation']), acceptedPublicStatuses: z.array(z.enum(['answered','refused','needs_clarification','error'])).min(1), answerOutline: strings.min(1),
  evidence: z.array(z.object({ chunkId: uuid, sourceId: uuid, chapterNo: z.number().int().positive(), pageFrom: page, pageTo: page, role: z.enum(['support','context_only','outside_scope','ocr_or_capability_witness']) }).strict()),
  essentialConditions: strings.min(1), mustNotAppear: strings.min(1), difficulty: z.string().min(1), failureDetected: z.string().min(1), evidenceGaps: strings, status: z.literal('not_executed'),
  lexicalProbe: z.object({ phrase: z.string().min(1), occurrences: z.literal(0) }).strict().optional(),
  negativeEvidenceAudit: z.object({ method: z.string(), scannedChunks: z.number().int().positive(), terms: z.array(term).min(1) }).strict().optional(),
  attack: z.object({ kind: z.literal('mismatched_source_id'), sourceId: uuid, foreignBookId: z.string(), foreignSubject: z.string(), foreignChapterNo: z.number().int().positive(), expectedHttpStatus: z.literal(400), expectedCode: z.literal('invalid_request') }).strict().optional(),
}).strict();
export const catalogueSchema = z.object({ schemaVersion: z.literal(1), createdAt: z.string(), baselineCommit: z.string().regex(/^[a-f0-9]{40}$/), inventoryOrigin: z.string(), snapshotCapturedAt: z.string(), scope: z.string(), availableBoards: strings, unavailable: z.array(z.object({ board: z.string(), classLevel: z.literal(9), subject: z.string(), reason: z.string() }).strict()), execution: z.object({ providerCalls: z.literal(0), retrievalCalls: z.literal(0), academicCasesExecuted: z.literal(0), note: z.string() }).strict(), rubric: z.record(z.string(),z.string()), books: z.array(bookSchema).min(1), sources: z.array(sourceSchema).min(1), evidence: z.array(evidenceSchema).min(1), cases: z.array(caseSchema).min(1) }).strict();
export type Catalogue = z.infer<typeof catalogueSchema>;
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const ensure: (ok: unknown, message: string) => asserts ok = (ok, message) => { if (!ok) throw new Error(message); };

export function validateCatalogue(value: unknown): Catalogue {
  const data = catalogueSchema.parse(value);
  const unique = <T,>(rows: T[], key: (row: T) => string, label: string) => ensure(new Set(rows.map(key)).size === rows.length, `Duplicate ${label}`);
  unique(data.books,b=>b.bookId,'book'); unique(data.sources,s=>s.sourceId,'source'); unique(data.evidence,e=>e.chunkId,'chunk'); unique(data.cases,c=>c.id,'case');
  const sources = new Map(data.sources.map(s=>[s.sourceId,s]));
  const evidence = new Map(data.evidence.map(e=>[e.chunkId,e]));
  const requiredTags=['conceptual','typo','synonym','why_how','comparison','negation','conditions','multi_part','misconception','ambiguity','keyword_trap','partial','outside_chapter','unsupported','injection','numerical','ocr_weakness'];
  for (const book of data.books) {
    const members=data.sources.filter(s=>s.bookId===book.bookId);
    ensure(members.length===book.discoveredChapterCount,`Incomplete source inventory ${book.bookId}`);
    ensure(JSON.stringify([...book.sourceIds].sort())===JSON.stringify(members.map(s=>s.sourceId).sort()),`Book source IDs ${book.bookId}`);
    ensure(members.every(s=>s.board===book.board&&s.subject===book.subject&&s.language===book.language),`Mixed book identity ${book.bookId}`);
    const chosen=members.filter(s=>s.selected);
    ensure(chosen.length>=Math.min(3,members.length),`Too few chapters ${book.bookId}`);
    ensure(JSON.stringify(chosen.map(s=>s.chapterNo).sort((a,b)=>a-b))===JSON.stringify([...book.selectedChapterNumbers].sort((a,b)=>a-b)),`Selected chapter disagreement ${book.bookId}`);
    const cases=data.cases.filter(c=>c.bookId===book.bookId&&!c.attack);
    ensure(cases.length>=15,`Too few substantive cases ${book.bookId}`);
    for(const source of chosen)ensure(cases.some(c=>c.scope.sourceId===source.sourceId),`Untested selected chapter ${source.sourceId}`);
    for(const tag of requiredTags)ensure(cases.some(c=>c.tags.includes(tag)),`Missing ${tag} coverage ${book.bookId}`);
  }
  for(const e of data.evidence){
    const source=sources.get(e.sourceId);
    ensure(source&&source.chapterId===e.chapterId&&source.chapterNo===e.chapterNo&&source.subject===e.subject&&source.board===e.board,`Wrong evidence source ${e.chunkId}`);
    ensure(e.pageFrom===null||e.pageTo===null||e.pageFrom<=e.pageTo,`Reversed pages ${e.chunkId}`);
    ensure(sha256(e.excerpt)===e.excerptSha256,`Changed evidence excerpt ${e.chunkId}`);
    for(const x of e.additionalExcerpts)ensure(sha256(x.text)===x.sha256,`Changed extra excerpt ${e.chunkId}`);
  }
  for(const c of data.cases){
    const source=sources.get(c.scope.sourceId);
    ensure(source&&source.selected&&source.bookId===c.bookId&&source.chapterId===c.chapterId&&source.chapterTitle===c.chapterTitle&&source.board===c.scope.board&&source.subject===c.scope.subject&&source.chapterNo===c.scope.chapterNo,`Wrong case selection ${c.id}`);
    for(const link of c.evidence){
      const e=evidence.get(link.chunkId);
      ensure(e&&e.sourceId===link.sourceId&&e.chapterNo===link.chapterNo&&e.pageFrom===link.pageFrom&&e.pageTo===link.pageTo,`Broken case evidence ${c.id}`);
      ensure((link.role==='outside_scope')===(link.sourceId!==c.scope.sourceId),`Evidence scope mislabeled ${c.id}`);
    }
    if(['answer','partial_answer'].includes(c.expectedOutcome))ensure(c.evidence.some(e=>e.role==='support'),`No positive support ${c.id}`);
    if(c.expectedOutcome==='partial_answer')ensure(c.tags.includes('partial')||c.evidenceGaps.length,`Missing partial limitation ${c.id}`);
    if(c.expectedOutcome==='capability_limitation')ensure(c.evidenceGaps.length&&c.evidence.length,`Missing capability witness ${c.id}`);
    if(c.attack){
      const foreign=sources.get(c.attack.sourceId);
      ensure(foreign&&foreign.bookId===c.attack.foreignBookId&&foreign.subject===c.attack.foreignSubject&&foreign.chapterNo===c.attack.foreignChapterNo&&foreign.subject!==c.scope.subject,`Invalid attack target ${c.id}`);
      ensure(c.acceptedPublicStatuses.length===1&&c.acceptedPublicStatuses[0]==='error',`Transport rejection mislabeled ${c.id}`);
    }
  }
  return data;
}

const snapshotSchema=z.object({chapters:z.array(z.object({board:z.string(),classLevel:z.literal(9),subject:z.string(),chapterId:uuid,chapterNo:z.number(),chapterTitle:z.string(),sourceId:uuid,language:z.string(),storagePath:z.string().nullable(),sections:z.array(z.object({id:uuid,label:z.string(),position:z.number(),pageFrom:page,pageTo:page,chunks:z.array(z.object({id:uuid,index:z.number(),content:z.string(),contentHash:z.string()})).nullable()}))}))});
export function validateAgainstSnapshot(data: Catalogue, value: unknown) {
  const snapshot=snapshotSchema.parse(value);
  ensure(snapshot.chapters.length===data.sources.length,'Live textbook inventory changed; review catalogue coverage');
  const byId=new Map(snapshot.chapters.map(c=>[c.sourceId,c]));
  for(const source of data.sources){
    const live=byId.get(source.sourceId);
    ensure(live&&live.board===source.board&&live.subject===source.subject&&live.chapterNo===source.chapterNo&&live.chapterId===source.chapterId&&live.chapterTitle===source.chapterTitle&&live.language===source.language&&live.storagePath===source.storagePath,`Live source identity drift ${source.sourceId}`);
    const inventory=live.sections.flatMap(s=>(s.chunks??[]).map(c=>[c.id,sha256(c.content),s.pageFrom,s.pageTo])).map(x=>JSON.stringify(x)).join('\n');
    ensure(sha256(inventory)===source.contentInventorySha256,`Live OCR/chunk/page drift ${source.sourceId}`);
    ensure(live.sections.length===source.sectionCount&&live.sections.flatMap(s=>s.chunks??[]).length===source.chunkCount,`Live counts drift ${source.sourceId}`);
  }
  for(const e of data.evidence){
    const ch=byId.get(e.sourceId)!;
    const section=ch.sections.find(s=>s.id===e.sectionId), chunk=section?.chunks?.find(c=>c.id===e.chunkId);
    ensure(chunk&&section&&chunk.index===e.chunkIndex&&chunk.contentHash===e.storedContentHash&&sha256(chunk.content)===e.contentSha256&&section.label===e.sectionLabel&&section.pageFrom===e.pageFrom&&section.pageTo===e.pageTo,`Live evidence mismatch ${e.chunkId}`);
    for(const text of [e.excerpt,...e.additionalExcerpts.map(x=>x.text)])ensure(chunk.content.includes(text),`Invented excerpt ${e.chunkId}`);
  }
  for(const c of data.cases){
    const live=byId.get(c.scope.sourceId)!;
    const text=live.sections.flatMap(s=>s.chunks??[]).map(x=>x.content).join('\n').toLowerCase();
    if(c.lexicalProbe)ensure(!text.includes(c.lexicalProbe.phrase.toLowerCase()),`Synonym phrase occurs in source ${c.id}`);
    if(c.negativeEvidenceAudit){
      ensure(c.negativeEvidenceAudit.scannedChunks===live.sections.flatMap(s=>s.chunks??[]).length,`Incomplete negative scan ${c.id}`);
      for(const t of c.negativeEvidenceAudit.terms)ensure(text.split(t.term.toLowerCase()).length-1===t.occurrences,`Negative audit drift ${c.id}`);
    }
  }
  return {books:data.books.length,sources:data.sources.length,evidence:data.evidence.length,cases:data.cases.length,academicCasesExecuted:0};
}
