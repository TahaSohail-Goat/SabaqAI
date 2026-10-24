import type { Catalogue } from './catalogue-schema';

const cell=(s: string)=>s.replaceAll('|','\\|').replaceAll('\n',' ');
const pages=(from: number|null,to: number|null)=>from===null?'unknown':from===to?String(from):`${from}–${to??'unknown'}`;
export function renderCatalogue(data: Catalogue): string {
  const lines=[
    '# Class 9 Doubts/Ask demanding acceptance catalogue', '',
    `Created ${data.createdAt}; baseline implementation \`${data.baselineCommit}\`.`, '',
    `${data.books.length} local textbook collections, ${data.sources.length} actual chapter sources, ${data.cases.length} proposed cases. **No academic case has been executed.** Offline fixture/reference validation is not an Ask accuracy result.`, '',
    '## Inventory and identity limits', '', data.inventoryOrigin, '',
    'The database has chapter_sources UUIDs, not a book-wide edition table. Book keys below come from the existing manifest and are collection labels, not invented database IDs. All source UUIDs, chapter titles, OCR and page ranges come from direct relational reads, not retrieval results. Edition statements are manifest provenance only; no cover/edition verification is claimed. Papers are not substituted for missing textbooks. No provider, embedding, OCR or vector-search call was used to establish the gold references.', '',
    `Observed boards: ${data.availableBoards.join(', ')}. All cases are Class 9.`, '',
    ...data.unavailable.map(x=>`- Unavailable: ${x.board} Class ${x.classLevel} ${x.subject}: ${x.reason}`), '',
    'Stored page ranges below are section ranges, not a claim of line-level printed-page verification. No PDF bytes or visual page mapping were tested in this catalogue task. Urdu chapter titles remain generic, exactly as stored. Source identity does not establish clean concept boundaries.', '',
    '## Coverage', '',
    '| Book collection | Language | All chapters | Selected chapter numbers | Substantive / isolation cases | Evidence limitations |',
    '| --- | --- | ---: | --- | ---: | --- |',
  ];
  for(const b of data.books){const cases=data.cases.filter(c=>c.bookId===b.bookId);lines.push(`| ${b.bookId} | ${b.language} | ${b.discoveredChapterCount} | ${b.selectedChapterNumbers.join(', ')} | ${cases.filter(c=>!c.attack).length} / ${cases.filter(c=>c.attack).length} | ${cell(b.evidenceGaps.join(' '))} |`);}
  lines.push('', 'All books have at least three selected chapters and twenty substantive cases. Eight additional source-UUID attacks deliberately mismatch a verified source and curriculum while retaining shared chapter numbers. Their expected transport is HTTP 400/error/invalid_request, not HTTP 200/refused.', '',
    '### Chapter choices and OCR concerns', '');
  for(const b of data.books){lines.push(`- **${b.bookId}:** ${b.selectionRationale}`);for(const s of data.sources.filter(s=>s.bookId===b.bookId&&s.selected)){const count=data.cases.filter(c=>c.scope.sourceId===s.sourceId&&!c.attack).length;lines.push(`  - ${s.chapterNo}. ${s.chapterTitle}: ${count} substantive cases; ${s.chunkCount} stored chunks; pages ${pages(s.pageFrom,s.pageTo)}; source \`${s.sourceId}\`.`);}}
  lines.push('', '### Outcome expectations', '', '| Collection | Answer | Partial | Clarification | Refusal | Capability limitation |', '| --- | ---: | ---: | ---: | ---: | ---: |');
  for(const b of data.books){const cases=data.cases.filter(c=>c.bookId===b.bookId&&!c.attack);lines.push(`| ${b.bookId} | ${['answer','partial_answer','clarification','refusal','capability_limitation'].map(outcome=>cases.filter(c=>c.expectedOutcome===outcome).length).join(' | ')} |`);}
  lines.push('', 'Counts are authored expectations, not measured outcomes. The concentration of Urdu limitations reflects actual unreadable evidence; it must not be hidden with plausible standard Urdu answers.', '', '## Evaluation rules', '');
  for(const [name,value] of Object.entries(data.rubric))lines.push(`- **${name}:** ${value}`);
  lines.push('', 'Use these cases as an acceptance/review set. The production `/api/eval` question set and scorer are unchanged. For a future run, record actual status, original/normalized wording, selected source, retrieved IDs, gate decision, statement-to-evidence support, missing aspects, final citation metadata, stage durations and operational errors. An operational failure is not a successful academic refusal. Do not lower gate thresholds to force an expected answer.', '',
    'For answer cases, listed chunks establish independently inspected support rather than a mandatory exact retrieval ranking. Other same-source passages may qualify after human evidence review. A reviewer must judge meaning, not require an exact wording match or assume every listed chunk must be cited. A partial-answer case requires an independently useful supported core and explicit limitations. Capability cases can safely refuse or explain a supported subset while declaring the unavailable computation/transcription; a plain operational error does not satisfy them.', '',
    'Current checked arithmetic only supports V=I*R, R=V/I and I=V/R. Conceptual/symbolic explanations and accurately attributed already-stored examples are different from certifying fresh calculations. Numerical cases retain student givens and must never reuse a different printed example’s result. This records the implemented limit; it does not change application behavior.', '',
    '## Cases', '');
  for(const b of data.books){lines.push(`### ${b.label}`, '', `Collection key: \`${b.bookId}\`. Edition verification: **not established**. Manifest description: ${b.editionProvenance}`, '');
    for(const c of data.cases.filter(c=>c.bookId===b.bookId)){
      lines.push(`#### ${c.id} — ${c.expectedOutcome}${c.attack?' / invalid-scope request rejection':''}`, '', `**Question (${c.questionLanguage}):** ${c.question}`, '',
        `- **Selection:** ${c.scope.board}, Class ${c.scope.classLevel}, ${c.scope.subject}, textbook; chapter ${c.scope.chapterNo}: ${c.chapterTitle}; chapter ID \`${c.chapterId}\`; source ID \`${c.scope.sourceId}\`.`,
        `- **Interpretation:** ${c.expectedInterpretation.meaning} Equivalent wording allowed. Concepts: ${c.expectedInterpretation.keyConcepts.join('; ')}.`,
        `- **Expected outline:** ${c.answerOutline.join(' ')}`,
        `- **Allowed public status:** ${c.acceptedPublicStatuses.join(', ')}. **Execution:** not executed.`,
        `- **Evidence:** ${c.evidence.length?c.evidence.map(e=>`\`${e.chunkId}\`, stored pp. ${pages(e.pageFrom,e.pageTo)}, source \`${e.sourceId}\`, chapter ${e.chapterNo}, **${e.role}**`).join('; '):'No academic support reference; the case requests clarification or tests unavailable evidence.'}`,
        `- **Essential conditions:** ${c.essentialConditions.join(' ')}`,
        `- **Must not appear:** ${c.mustNotAppear.join(' ')}`,
        `- **Why difficult / failure detected:** ${c.difficulty} ${c.failureDetected!==c.difficulty?c.failureDetected:''}`,
        `- **Coverage tags:** ${c.tags.join(', ')}.`);
      if(c.evidenceGaps.length)lines.push(`- **Evidence gaps:** ${c.evidenceGaps.join(' ')}`);
      if(c.lexicalProbe)lines.push(`- **Synonym probe:** exact phrase “${c.lexicalProbe.phrase}” has ${c.lexicalProbe.occurrences} occurrences across the selected source’s stored OCR. This is not a claim that every question word is absent.`);
      if(c.negativeEvidenceAudit)lines.push(`- **Negative-evidence audit:** ${c.negativeEvidenceAudit.scannedChunks} stored chunks scanned; ${c.negativeEvidenceAudit.terms.map(t=>`“${t.term}”: ${t.occurrences}`).join('; ')}. ${c.negativeEvidenceAudit.method}`);
      if(c.attack)lines.push(`- **Attack mutation:** replace only sourceId with \`${c.attack.sourceId}\` (${c.attack.foreignBookId}, chapter ${c.attack.foreignChapterNo}); expect HTTP ${c.attack.expectedHttpStatus}, error code \`${c.attack.expectedCode}\`. The base selection above remains the authorized selection.`);
      lines.push('');
    }
  }
  lines.push('## Independently inspected evidence register', '', 'These are exact stored OCR fragments, including errors. Ellipses are not inserted into them. Excerpts may end mid-sentence; the complete chunk hash supports local revalidation. They are not generated answers or instructions. Missing wording must not be restored from memory.', '');
  for(const e of data.evidence){lines.push(`### ${e.chunkId}`, '', `${e.subject}; chapter ${e.chapterNo}; source \`${e.sourceId}\`; section \`${e.sectionId}\` (${e.sectionLabel}); stored pages ${pages(e.pageFrom,e.pageTo)}; quality: **${e.quality}**.`, '', e.reviewNote, '', `Full chunk SHA-256: \`${e.contentSha256}\`.`, '', ...[e.excerpt,...e.additionalExcerpts.map(x=>x.text)].flatMap(text=>['```text',text,'```','']));}
  lines.push('## Complete discovered source inventory', '', '| Collection | Ch. | Stored title | Language | Selected | Source UUID | Stored pages |', '| --- | ---: | --- | --- | --- | --- | --- |');
  for(const s of data.sources)lines.push(`| ${s.bookId} | ${s.chapterNo} | ${cell(s.chapterTitle)} | ${s.language} | ${s.selected?'yes':'no'} | ${s.sourceId} | ${pages(s.pageFrom,s.pageTo)} |`);
  lines.push('', '## Local validation and execution boundary', '',
    '`npm.cmd run test:ask` includes fixture structure, coverage, integrity and catalogue-render checks. It does not execute these academic cases against Ask.', '',
    '`node --require tsx/cjs scripts/validate-class9-ask-catalogue.ts --local-container supabase_db_sabaq-ask-review` reads only Class 9 textbook records through local PostgreSQL with a read-only connection; it checks all source identities, chunk hashes, excerpts and stored pages. It makes no provider or retrieval calls.', '',
    '`node --require tsx/cjs scripts/render-class9-ask-catalogue.ts --check` checks that this Markdown is derived from the JSON. Run without `--check` to regenerate after an intentional fixture update.', '',
    'No database changes, source uploads, new OCR, embedding work, branch merges or paid-API suite execution are part of this task. Real answer quality, retrieval recall, clarification quality, support-review decisions, latency and browser/PDF behavior remain unexecuted for these cases.', '');
  return lines.join('\n');
}
