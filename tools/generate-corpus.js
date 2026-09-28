// node tools/generate-corpus.js > tools/corpus.tsv
// Emits one tab-separated line per audio entry: key \t text \t slow \t mode
// Keys and source text are derived from game.js data only (single source of truth):
//   SINGLES  -> one entry per syllable x tone, keyed '<syl><tone>', text = the hanzi for that tone
//   DOUBLES/TRIPLES -> keyed by the tone-number pinyin itself (e.g. 'zhong1guo2'), text = the hanzi
// mode: 'carrier' = synth with 好，X。 then trim (singles t1/t2/t4),
//        'skip'    = no pregen audio (singles t3, handled by browser TTS),
//        'direct'  = plain Piper synthesis (multi-syllable words are already in context).
// Slow duplicates exist because in-browser time-stretching flattens the tone contours.
const G = require('../game.js').Game;

const lines = [];
const add = (key, text, slow = 0, mode = 'direct') => lines.push(`${key}\t${text}\t${slow}\t${mode}`);

for (const s of G.singles) {
  for (let t = 1; t <= 4; t++) {
    const key = G.keyOf([s.syl], [t]);
    const mode = t === 3 ? 'skip' : 'carrier';
    add(key, s.chars[t - 1], 0, mode);
    add(key, s.chars[t - 1], 1, mode);
  }
}
for (const w of [...G.DOUBLE_WORDS, ...G.TRIPLE_WORDS]) {
  const key = G.keyOf(w.syls, w.tones);
  add(key, w.chars, 0, 'direct');
  add(key, w.chars, 1, 'direct');
}

console.log(lines.join('\n'));
