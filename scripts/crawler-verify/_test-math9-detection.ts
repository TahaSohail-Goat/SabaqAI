import fs from 'node:fs';
import { detectTableOfContents, identifyFrontMatterPages } from '../../src/lib/crawler/structure/toc';
import { detectChapters } from '../../src/lib/crawler/structure/textbook-chapters';
import { crossCheckChapters } from '../../src/lib/crawler/structure/crosscheck';

const pages = JSON.parse(fs.readFileSync('data/.ocr-cache/ee83974f81be8605537c4c07a899f4852e4206bf13c744bf4c36ab8d2c345a88.json', 'utf8'));

const toc = detectTableOfContents(pages);
console.log('ToC detected:', toc ? `${toc.entries.length} entries on page(s) ${toc.tocPageNumbers.join(',')}` : 'null');
if (toc) {
  toc.entries.forEach((e) => console.log(`  hint ch.${e.chapterNoHint} "${e.titleRaw}" (page hint ${e.pageHint})`));
}

const frontMatter = identifyFrontMatterPages(toc);
console.log('Front matter pages excluded:', [...frontMatter].sort((a, b) => a - b));

const { chapters, headerCandidateTexts } = detectChapters(pages, frontMatter);
console.log(`\nDetected ${chapters.length} chapter(s):`);
chapters.forEach((c) => console.log(`  Ch.${c.chapterNo} "${c.chapterTitle}" — pages ${c.pageFrom}-${c.pageTo}`));
console.log(`(${headerCandidateTexts.length} header candidate texts total)`);

const crossCheck = crossCheckChapters(chapters, toc?.entries ?? null);
console.log('\nCross-check:', JSON.stringify(crossCheck, null, 2));
