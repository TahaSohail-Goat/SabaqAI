// Deliberately no provider, retrieval, admin-client or environment-file imports.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateCatalogue, validateAgainstSnapshot } from '../tests/ask/class9/catalogue-schema';
const data=validateCatalogue(JSON.parse(fs.readFileSync('tests/ask/class9/catalogue.json','utf8')));
const args=process.argv.slice(2);
if(args.length!==2||!['--snapshot','--local-container'].includes(args[0]))throw new Error('Use --snapshot <read-only-export.json> or --local-container <local-docker-container>. No provider calls are made.');
let snapshot: unknown;
if(args[0]==='--snapshot')snapshot=JSON.parse(fs.readFileSync(args[1],'utf8'));
else {
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(args[1]))throw new Error('Invalid local container name.');
  const sql=`select jsonb_build_object('chapters',coalesce(jsonb_agg(x order by x->>'subject',(x->>'chapterNo')::int),'[]'::jsonb)) from (
    select jsonb_build_object('board',ch.board_code,'classLevel',ch.class_level,'subject',ch.subject_code,'chapterId',ch.id,'chapterNo',ch.chapter_no,'chapterTitle',ch.chapter_title,'sourceId',cs.id,'language',cs.language_code,'storagePath',cs.storage_path,
      'sections',(select jsonb_agg(jsonb_build_object('id',s.id,'label',s.section_label,'position',s.position,'pageFrom',s.page_from,'pageTo',s.page_to,
        'chunks',(select jsonb_agg(jsonb_build_object('id',c.id,'index',c.chunk_index,'content',c.content,'contentHash',c.content_hash) order by c.chunk_index) from content_chunks c where c.section_id=s.id)) order by s.position) from sections s where s.source_id=cs.id)) x
    from chapters ch join chapter_sources cs on cs.chapter_id=ch.id where ch.class_level=9 and cs.source_type='textbook') q`;
  const raw=execFileSync('docker',['exec','-e','PGOPTIONS=-c default_transaction_read_only=on',args[1],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-c',sql],{encoding:'utf8',maxBuffer:32*1024*1024});
  snapshot=JSON.parse(raw);
}
console.log(JSON.stringify({...validateAgainstSnapshot(data,snapshot),validation:'reference_integrity_only',providerCalls:0,databaseWrites:0}));
