// Deliberately conservative: uncertain transformations ask for a full rephrasing rather than
// silently changing a scientific problem. Semantic equivalence remains a model-review limit.
const fold = (s: string) => s.normalize('NFKC').replace(/[−–]/g, '-').replace(/[⁺]/g, '+').toLowerCase();
const numeric = (s: string) => s.includes('/') ? Number(s.split('/')[0]) / Number(s.split('/')[1]) : Number(s);
const isNumeric = (s: string) => /^[+-]?(?:\d|\.\d)/.test(s);
const canonicalUnit = (unit: string) => ({ volts: 'v', volt: 'v', amperes: 'a', ampere: 'a', ohms: 'ohm', 'ω': 'ohm', metres: 'm', meters: 'm' }[unit.toLowerCase()] ?? unit.toLowerCase());
const groups = [
  ['not', 'no', 'never', "don't", "doesn't", 'cannot', "can't", 'nahi', 'nahin', 'نہیں', 'نہ'],
  ['increase', 'increases', 'increasing', 'barhta', 'بڑھ'],
  ['decrease', 'decreases', 'decreasing', 'kam hota', 'kam hoti', 'کم'],
  ['before', 'pehle', 'پہلے'], ['after', 'baad', 'بعد'],
  ['constant', 'مستقل'], ['compare', 'comparison', 'difference', 'versus', 'vs', 'diffrence', 'فرق'],
  ['cause', 'causes', 'causing', 'سبب'], ['effect', 'effects', 'اثر'],
];
const has = (text: string, term: string) => /[a-z]/i.test(term)
  ? new RegExp(`(?<![a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`, 'i').test(text)
  : text.includes(term);

export function protectedSpans(input: string): string[] {
  const text = fold(input);
  const values = text.match(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+|\s*\/\s*\d+(?:\.\d+)?)?/g) ?? [];
  const symbols = text.match(/<=|>=|!=|≤|≥|≠|[<>=]/g) ?? [];
  // "ohms law" is a named law typo, not a claim about resistance units.
  const units = text.replace(/ohm['’]?s?\s+law/g, '').match(/(?<![a-z])(?:m\/s(?:\^?2)?|kg|cm|mm|km|mol|ohms?|volts?|amperes?|°c|kelvin)(?![a-z])/g) ?? [];
  const quantityUnits = [...text.matchAll(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?\s*(V|A|N|J|W|K|C|s|m|Hz|Ω)(?![a-z])/gi)].map((m) => m[1]);
  const quantityPairs = [...text.matchAll(/([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+|\s*\/\s*\d+(?:\.\d+)?)?)\s*(m\/s(?:\^?2)?|kg|cm|mm|km|mol|ohms?|volts?|amperes?|V|A|N|J|W|K|C|s|m|Hz|Ω)(?![a-z])/gi)]
    .map((m) => `quantity:${numeric(m[1])}:${canonicalUnit(m[2])}`);
  const chemicals = input.match(/\b(?:[A-Z][a-z]?\d*){2,}(?:\^?\d*[+-])?|\b[A-Z][a-z]?\d*\^?\d*[+-](?!\w)/g) ?? [];
  const names = input.match(/\b(?:Ohm(?:'s)?|Newton(?:'s)?|Drude|mitosis|meiosis|mitochondria|respiration|photosynthesis|evaporation|temperature|pressure|volume|resistance|voltage|current|DNA|RNA)\b/gi) ?? [];
  const eponyms = input.match(/\b[A-Z][a-z]+(?:['’]s)?\s+(?:law|model|principle|equation|theorem)\b/g) ?? [];
  const organisms = input.match(/\b[A-Z][a-z]+\s+(?:sapiens|coli|vulgaris|tigris|sativum|melanogaster)\b/g) ?? [];
  const quoted = [...input.matchAll(/["“]([^"”\n]{1,100})["”]/g)].map((m) => m[1]);
  const sentenceOpeners = new Set(['what', 'why', 'how', 'when', 'where', 'which', 'explain', 'compare', 'define', 'describe', 'calculate', 'find', 'give', 'does', 'do', 'is', 'are', 'if', 'use', 'for', 'at', 'the', 'a', 'an', 'please', 'can', 'state', 'assume', 'suppose', 'consider', 'tell', 'derive', 'prove', 'difference', 'given', 'show', 'write']);
  const capitalized = (input.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).filter((name) => !sentenceOpeners.has(name.toLowerCase()));
  const equations = input.match(/\b[A-Za-z]\s*=\s*[A-Za-z](?:\s*[*/×·+-]?\s*[A-Za-z])+(?![a-z])/g) ?? [];
  return [...values, ...symbols, ...[...units, ...quantityUnits].map((u) => `unit:${canonicalUnit(u)}`), ...quantityPairs, ...chemicals, ...names, ...eponyms, ...organisms, ...quoted, ...capitalized, ...equations.map((e) => e.replace(/\s/g, '')), ...groups.filter((g) => g.some((t) => has(text, t))).map((g) => `meaning:${g[0]}`)];
}

export function preservationFailures(original: string, rewritten: string): string[] {
  const target = fold(rewritten);
  const expected = protectedSpans(original);
  const actual = protectedSpans(rewritten);
  const lost = expected.filter((span) => {
    if (span.startsWith('meaning:')) return !actual.includes(span);
    if (span.startsWith('unit:') || span.startsWith('quantity:')) return !actual.includes(span);
    // Numeric equivalence permits scientific notation/decimal/fraction but never changes sign.
    if (isNumeric(span)) {
      return !actual.some((candidate) => isNumeric(candidate) && Number.isFinite(numeric(candidate)) && Math.abs(numeric(candidate) - numeric(span)) <= 1e-12 * Math.max(1, Math.abs(numeric(span))));
    }
    if (span.length === 1 && /[a-z]/i.test(span)) return !actual.map(fold).includes(fold(span));
    return !target.replace(/\s/g, '').includes(fold(span).replace(/\s/g, ''));
  });
  const invented = actual.filter((s) => isNumeric(s) && !expected.some((e) => isNumeric(e) && Math.abs(numeric(e) - numeric(s)) <= 1e-12 * Math.max(1, Math.abs(numeric(e)))));
  return [...lost, ...invented.map((s) => `invented quantity:${s}`)];
}

export function optionPreservationFailures(original: string, interpreted: string): string[] {
  // Ambiguous topics can be narrowed by explicit student selection, but choices may never
  // invent/alter numerical givens, substances, relations or the polarity of a premise.
  const expected = protectedSpans(original).filter((s) => /^[+\-\d.<>=≤≥≠]/.test(s) || /^(meaning|unit|quantity):/.test(s) || /\d|[+\-]$/.test(s));
  return preservationFailures(original, interpreted).filter((s) => expected.includes(s) || s.startsWith('invented quantity:'));
}
