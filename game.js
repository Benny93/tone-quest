// Pure game logic + word data. Loaded as a classic script (works from file://) and by test.js in node.
(function (root) {
  // syllable, chars for tones 1-4, glosses for tones 1-4
  const SINGLES = `
ma 妈麻马骂 mom/hemp/horse/scold
ba 八拔把爸 eight/pull/hold/dad
da 搭达打大 build/reach/hit/big
yi 一姨以意 one/aunt/use/meaning
wu 屋无五雾 house/none/five/fog
shi 诗十使是 poem/ten/make/to be
qi 七骑起气 seven/ride/rise/air
tang 汤糖躺烫 soup/sugar/lie down/hot
fei 飞肥匪费 fly/fat/bandit/fee
tong 通同统痛 through/same/unite/pain
guo 锅国果过 pot/country/fruit/pass
bao 包雹宝报 bag/hail/treasure/report
wan 弯玩晚万 bend/play/late/10,000
yan 烟盐眼宴 smoke/salt/eye/banquet
xi 西习洗细 west/study/wash/thin
mao 猫毛卯帽 cat/fur/rabbit hour/hat
hu 呼湖虎户 call/lake/tiger/door
di 低敌底地 low/enemy/bottom/ground
fang 方房访放 square/house/visit/put
jie 接节姐借 receive/festival/sister/borrow
tu 秃图土兔 bald/picture/soil/rabbit
chu 出除楚触 exit/remove/clear/touch
lao 捞劳老涝 scoop/labor/old/flood
yu 淤鱼雨玉 silt/fish/rain/jade`;

  // Curated to avoid tone sandhi (no 3-3 pairs, no 一/不) and neutral tones, so citation tones = spoken tones.
  const DOUBLES = `
zhong1guo2 中国 China
lao3shi1 老师 teacher
xue2sheng1 学生 student
dian4nao3 电脑 computer
fei1ji1 飞机 airplane
huo3che1 火车 train
mi3fan4 米饭 rice
he1cha2 喝茶 drink tea
ka1fei1 咖啡 coffee
jin1tian1 今天 today
ming2tian1 明天 tomorrow
zuo2tian1 昨天 yesterday
han4yu3 汉语 Chinese language
zhong1wen2 中文 Chinese
bei3jing1 北京 Beijing
shang4hai3 上海 Shanghai
xiong2mao1 熊猫 panda
gong1zuo4 工作 work
dian4hua4 电话 phone call
yi1sheng1 医生 doctor
yin1yue4 音乐 music
ping2guo3 苹果 apple
yin2hang2 银行 bank
xue2xiao4 学校 school
mian4tiao2 面条 noodles
zai4jian4 再见 goodbye
wan3an1 晚安 good night
zao3fan4 早饭 breakfast
shou3ji1 手机 mobile phone
hong2se4 红色 red
chun1jie2 春节 Spring Festival
shu1bao1 书包 schoolbag
qi4che1 汽车 car
di4tu2 地图 map
chang2cheng2 长城 Great Wall
tai4yang2 太阳 sun
tian1qi4 天气 weather
xia4yu3 下雨 to rain
mei3guo2 美国 USA
da4xue2 大学 university`;

  const TRIPLES = `
zhong1guo2ren2 中国人 Chinese person
da4xiong2mao1 大熊猫 giant panda
tu2shu1guan3 图书馆 library
huo3che1zhan4 火车站 train station
dian4shi4ji1 电视机 television
fei1ji1chang3 飞机场 airport
pu3tong1hua4 普通话 Mandarin
zi4xing2che1 自行车 bicycle
chu1zu1che1 出租车 taxi
xing1qi1tian1 星期天 Sunday
bei3jing1ren2 北京人 Beijinger
sheng4dan4jie2 圣诞节 Christmas
dong4wu4yuan2 动物园 zoo
bing1qi2lin2 冰淇淋 ice cream
xi1hong2shi4 西红柿 tomato
qiao3ke4li4 巧克力 chocolate
ji4suan4ji1 计算机 computer
zhong1qiu1jie2 中秋节 Mid-Autumn Festival
tai4ping2yang2 太平洋 Pacific Ocean
bo2wu4guan3 博物馆 museum
ka1fei1guan3 咖啡馆 café
da4xue2sheng1 大学生 college student
hong2lv4deng1 红绿灯 traffic light
wai4guo2ren2 外国人 foreigner
han4bao3bao1 汉堡包 hamburger`;

  const lines = s => s.trim().split('\n');

  const singles = lines(SINGLES).map(l => {
    const [syl, chars, ...rest] = l.split(' ');
    return { syl, chars: [...chars], gloss: rest.join(' ').split('/') };
  });

  const words = s => lines(s).map(l => {
    const [py, chars, ...gloss] = l.split(' ');
    const m = [...py.matchAll(/([a-z]+)(\d)/g)];
    return { syls: m.map(x => x[1]), tones: m.map(x => +x[2]), chars, gloss: gloss.join(' ') };
  });

  const MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', v: 'ǖǘǚǜ' };

  // Tone-mark placement: a/e win, "ou" marks o, otherwise the last vowel. "v" = ü.
  function mark(syl, tone) {
    let i = syl.search(/[ae]/);
    if (i < 0) i = syl.indexOf('ou');
    if (i < 0) for (let k = syl.length - 1; k >= 0; k--) if (MARKS[syl[k]]) { i = k; break; }
    const out = tone >= 1 && tone <= 4 && i >= 0 ? syl.slice(0, i) + MARKS[syl[i]][tone - 1] + syl.slice(i + 1) : syl;
    return out.replace(/v/g, 'ü');
  }

  const pinyin = (syls, tones) => syls.map((s, i) => mark(s, tones[i])).join(' ');

  const EASY = ['ma', 'ba', 'da', 'yi', 'wu', 'tang'];
  const MODES = [
    { id: 'easy', tier: 1, zh: '一', name: 'First Tones', desc: '6 simple syllables · tone hints', n: 1, hints: true },
    { id: 'single', tier: 1, zh: '字', name: 'All Syllables', desc: '24 syllables · no hints', n: 1 },
    { id: 'double', tier: 2, zh: '二', name: 'Two Syllables', desc: 'Everyday words', n: 2 },
    { id: 'triple', tier: 3, zh: '三', name: 'Three Syllables', desc: 'Long words', n: 3 },
  ];
  const TIERS = { 1: ['初级', 'Beginner'], 2: ['中级', 'Intermediate'], 3: ['高级', 'Advanced'] };
  const ROUND = 10, HEARTS = 3;

  function shuffle(a, rnd = Math.random) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // 3 distinct wrong tone sequences; up to 2 differ in only one syllable (the tricky ones).
  function distractors(tones, rnd = Math.random) {
    const key = t => t.join(''), seen = new Set([key(tones)]), out = [];
    const add = t => { if (!seen.has(key(t)) && out.length < 3) { seen.add(key(t)); out.push(t); } };
    const near = [];
    tones.forEach((t, i) => [1, 2, 3, 4].forEach(v => v !== t && near.push(tones.map((x, j) => (j === i ? v : x)))));
    shuffle(near, rnd).slice(0, 2).forEach(add);
    while (out.length < 3) add(tones.map(() => 1 + Math.floor(rnd() * 4)));
    return out;
  }

  function makeQuestion(item, mode, rnd = Math.random) {
    if (mode.n === 1) {
      // Singles: options are always the 4 tones in fixed order, like a tone chart.
      return { syls: [item.syl], tones: [item.tone], chars: item.chars[item.tone - 1], gloss: item.gloss[item.tone - 1],
        alts: item.chars, options: [[1], [2], [3], [4]] };
    }
    return { ...item, options: shuffle([item.tones, ...distractors(item.tones, rnd)], rnd) };
  }

  function makeRound(modeId, rnd = Math.random) {
    const mode = MODES.find(m => m.id === modeId);
    let pool;
    if (mode.n === 1) {
      const src = mode.hints ? singles.filter(s => EASY.includes(s.syl)) : singles;
      pool = src.flatMap(s => [1, 2, 3, 4].map(tone => ({ ...s, tone })));
    } else pool = mode.n === 2 ? DOUBLE_WORDS : TRIPLE_WORDS;
    return shuffle(pool, rnd).slice(0, ROUND).map(it => makeQuestion(it, mode, rnd));
  }

  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const points = combo => 100 + 20 * Math.min(combo, 5);
  const stars = (correct, total = ROUND) => (correct >= total ? 3 : correct >= total * 0.8 ? 2 : correct >= total * 0.5 ? 1 : 0);

  // Local-calendar day keys so the streak rolls over at the player's midnight, not UTC.
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const prevDay = key => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d - 1)); };

  function bumpStreak(s, today) {
    if (s.day === today) return s;
    const streak = s.day === prevDay(today) ? s.streak + 1 : 1;
    return { day: today, streak, best: Math.max(s.best || 0, streak) };
  }
  const liveStreak = (s, today) => (s.day === today || s.day === prevDay(today) ? s.streak : 0);

  const DOUBLE_WORDS = words(DOUBLES), TRIPLE_WORDS = words(TRIPLES);

  root.Game = { singles, DOUBLE_WORDS, TRIPLE_WORDS, MODES, TIERS, ROUND, HEARTS, mark, pinyin, shuffle, distractors,
    makeRound, same, points, stars, dayKey, prevDay, bumpStreak, liveStreak };
})(typeof module !== 'undefined' ? module.exports : window);
