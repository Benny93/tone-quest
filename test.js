// node test.js
const assert = require('assert');
const G = require('./game.js').Game;

assert.equal(G.mark('ma', 3), 'mǎ');
assert.equal(G.mark('guo', 2), 'guó');
assert.equal(G.mark('mao', 4), 'mào');
assert.equal(G.mark('lou', 1), 'lōu');
assert.equal(G.mark('jie', 3), 'jiě');
assert.equal(G.mark('hui', 4), 'huì');
assert.equal(G.mark('lv', 4), 'lǜ');
assert.equal(G.pinyin(['zhong', 'guo'], [1, 2]), 'zhōng guó');

for (const s of G.singles) assert.equal(s.chars.length, 4, s.syl), assert.equal(s.gloss.length, 4, s.syl);
for (const w of [...G.DOUBLE_WORDS, ...G.TRIPLE_WORDS]) {
  assert.equal(w.syls.length, [...w.chars].length, w.chars);
  w.tones.forEach((t, i) => assert.ok(!(t === 3 && w.tones[i + 1] === 3), `3-3 sandhi in ${w.chars}`));
}
assert.ok(G.DOUBLE_WORDS.every(w => w.syls.length === 2) && G.TRIPLE_WORDS.every(w => w.syls.length === 3));

// Audio keys for tools/generate-audio.sh: unique per entry, so audio/<key>.m4a is unambiguous.
assert.equal(G.keyOf(['zhong', 'guo'], [1, 2]), 'zhong1guo2');
assert.equal(G.keyOf(['ma'], [4]), 'ma4');
const audioKeys = new Set();
for (const s of G.singles) for (let t = 1; t <= 4; t++) audioKeys.add(G.keyOf([s.syl], [t]));
for (const w of [...G.DOUBLE_WORDS, ...G.TRIPLE_WORDS]) audioKeys.add(G.keyOf(w.syls, w.tones));
assert.equal(audioKeys.size, G.singles.length * 4 + G.DOUBLE_WORDS.length + G.TRIPLE_WORDS.length, 'audio keys unique');

for (const id of G.MODES.map(m => m.id)) for (let r = 0; r < 50; r++) {
  const round = G.makeRound(id);
  assert.equal(round.length, G.ROUND);
  for (const q of round) {
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options.map(o => o.join())).size, 4, 'options unique');
    assert.equal(q.options.filter(o => G.same(o, q.tones)).length, 1, 'exactly one correct');
  }
}
assert.ok(G.makeRound('easy').every(q => ['ma', 'ba', 'da', 'yi', 'wu', 'tang'].includes(q.syls[0])));

assert.equal(G.prevDay('2026-03-01'), '2026-02-28');
assert.equal(G.prevDay('2026-01-01'), '2025-12-31');
let s = G.bumpStreak({}, '2026-09-25');
assert.deepEqual(s, { day: '2026-09-25', streak: 1, best: 1 });
s = G.bumpStreak(s, '2026-09-25'); assert.equal(s.streak, 1, 'same day no double count');
s = G.bumpStreak(s, '2026-09-26'); assert.equal(s.streak, 2);
assert.equal(G.liveStreak(s, '2026-09-27'), 2, 'still alive the next day');
assert.equal(G.liveStreak(s, '2026-09-28'), 0, 'broken after a missed day');
s = G.bumpStreak(s, '2026-09-28'); assert.deepEqual(s, { day: '2026-09-28', streak: 1, best: 2 });

assert.equal(G.stars(10), 3); assert.equal(G.stars(8), 2); assert.equal(G.stars(5), 1); assert.equal(G.stars(4), 0);
console.log('all tests passed');
