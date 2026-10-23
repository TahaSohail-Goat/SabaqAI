// Lexical hints augment the full-question vector; they never replace it or authorize an answer.
const stop = new Set('why what how when where which does do did is are was were the a an of to in on at for and or with we you it this that during even keep explain please'.split(' '));
export function searchTerms(question: string, concepts: string[]): string[] {
  const tokens = (text: string) => text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  return [...new Set([...concepts.flatMap(tokens), ...tokens(question)].filter((t) => !stop.has(t)))].slice(0, 48);
}

export async function timed<T>(durations: Record<string, number> | undefined, name: string, action: () => PromiseLike<T>): Promise<T> {
  const start = performance.now();
  try { return await action(); }
  finally { if (durations) durations[name] = (durations[name] ?? 0) + performance.now() - start; }
}
