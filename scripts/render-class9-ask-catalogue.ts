import fs from 'node:fs';
import { validateCatalogue } from '../tests/ask/class9/catalogue-schema';
import { renderCatalogue } from '../tests/ask/class9/render-catalogue';
const data=validateCatalogue(JSON.parse(fs.readFileSync('tests/ask/class9/catalogue.json','utf8')));
const rendered=renderCatalogue(data), target='docs/ask-evolution/CLASS9_TEST_CATALOGUE.md';
if(process.argv.includes('--check')){
  if(fs.readFileSync(target,'utf8')!==rendered)throw new Error('Catalogue Markdown differs from JSON; regenerate it.');
  console.log('Catalogue Markdown matches the machine-readable fixture.');
} else {fs.writeFileSync(target,rendered);console.log(`Wrote ${target}`);}
