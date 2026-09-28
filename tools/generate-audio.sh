#!/usr/bin/env bash
# Build-time audio corpus from human recordings + Piper fill-in.
#
#   ./tools/generate-audio.sh              full regeneration
#   ./tools/generate-audio.sh --skip-clone  reuse existing /tmp/audio-cmn clone
#
# Sources:
#   1. audio-cmn (hugolpz/audio-cmn, CC-by-sa): 1707 human-recorded syllables + 8596 HSK words.
#      Provides all 96 single-syllable clips (including tone 3!) and most multi-syllable words.
#   2. Piper (zh_CN-xiao_ya-medium, g2pW neural pipeline): fills any HSK words not in audio-cmn.
#
# Slow mode: handled at runtime via playbackRate=0.7 (no separate slow files).
#
# Prerequisites:
#   - Node.js (to read game.js data)
#   - afconvert or ffmpeg (for Piper wav→m4a encoding)
#   - .venv-tts (Python 3.12 venv with piper-tts[zh] + torch, for fill-in words only)
#   - .piper-voices/ (zh_CN-xiao_ya-medium model)
set -uo pipefail
cd "$(dirname "$0")/.."
[ -d tools ] || { echo "run from repository root"; exit 1; }

CMN_REPO="https://github.com/hugolpz/audio-cmn.git"
CMN_DIR="${CMN_DIR:-/tmp/audio-cmn}"
CMN_QUALITY="64k"
SKIP_CLONE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-clone) SKIP_CLONE=1; shift ;;
    *) echo "unknown option: $1"; exit 1 ;;
  esac
done

# Encoder: prefer afconvert (macOS built-in), fall back to ffmpeg.
if command -v afconvert >/dev/null; then ENCODER=afconvert
elif command -v ffmpeg >/dev/null; then ENCODER=ffmpeg
else echo "need afconvert or ffmpeg"; exit 1; fi

# ---------- Step 1: ensure audio-cmn is available ----------
if [ "$SKIP_CLONE" -eq 0 ] || [ ! -d "$CMN_DIR/$CMN_QUALITY/syllabs" ]; then
  echo "==> cloning audio-cmn (sparse, $CMN_QUALITY only)"
  rm -rf "$CMN_DIR"
  git clone --depth 1 --filter=blob:none --sparse "$CMN_REPO" "$CMN_DIR"
  cd "$CMN_DIR" && git sparse-checkout set "$CMN_QUALITY/syllabs" "$CMN_QUALITY/hsk" && cd -
else
  echo "==> using existing audio-cmn at $CMN_DIR"
fi

# ---------- Step 2: copy matching clips into audio/ ----------
echo "==> copying clips from audio-cmn"
mkdir -p audio
node -e "
const G = require('./game.js').Game;
const fs = require('fs');
const CMN = '$CMN_DIR/$CMN_QUALITY';
let copied = 0, missing = [];

for (const s of G.singles) {
  for (let t = 1; t <= 4; t++) {
    const key = G.keyOf([s.syl], [t]);
    const src = CMN + '/syllabs/cmn-' + key + '.mp3';
    if (fs.existsSync(src)) { fs.copyFileSync(src, 'audio/' + key + '.mp3'); copied++; }
    else missing.push({ key, type: 'single' });
  }
}
for (const w of [...G.DOUBLE_WORDS, ...G.TRIPLE_WORDS]) {
  const key = G.keyOf(w.syls, w.tones);
  const src = CMN + '/hsk/cmn-' + w.chars + '.mp3';
  if (fs.existsSync(src)) { fs.copyFileSync(src, 'audio/' + key + '.mp3'); copied++; }
  else missing.push({ key, chars: w.chars, type: 'word' });
}
console.log(copied + ' copied, ' + missing.length + ' need Piper');
// Write fill-in TSV for Piper
const tsv = missing.filter(m => m.chars).map(m => m.key + '\t' + m.chars + '\t0\tdirect').join('\n');
if (tsv) fs.writeFileSync('audio/.fill-in.tsv', tsv + '\n');
"

# ---------- Step 3: Piper fill-in for missing words ----------
FILL=audio/.fill-in.tsv
if [ -s "$FILL" ]; then
  TTS_PY=".venv-tts/bin/python"
  [ -x "$TTS_PY" ] || TTS_PY="python3"
  [ -d .piper-voices ] && export PIPER_DATA_DIR=".piper-voices"
  echo "==> Piper fill-in: $(wc -l < "$FILL" | tr -d ' ') words"
  $TTS_PY tools/tts.py synth --corpus "$FILL" --out audio --length-scale 1.0 || true
  # Encode wav → m4a
  for f in audio/*.wav; do
    [ -f "$f" ] || break
    if [ "$ENCODER" = afconvert ]; then
      afconvert -f m4af -d aac -b 48000 "$f" "${f%.wav}.m4a"
    else
      ffmpeg -nostdin -loglevel error -y -i "$f" -ac 1 -ar 48000 -c:a aac -b:a 48k "${f%.wav}.m4a"
    fi
    rm -f "$f"
  done
  rm -f "$FILL"
fi

# ---------- Step 4: build manifest ----------
echo "==> audio/manifest.json + manifest.js"
node -e "
const fs = require('fs');
const files = fs.readdirSync('audio').filter(f => /\.(mp3|m4a)$/.test(f)).sort();
fs.writeFileSync('audio/manifest.json', JSON.stringify({ files }, null, 2) + '\n');
fs.writeFileSync('audio/manifest.js', 'window.AUDIO_MANIFEST=' + JSON.stringify(files) + ';\n');
console.log(files.length + ' clips, ' + (fs.readdirSync('audio').reduce((s,f)=>s+fs.statSync('audio/'+f).size,0)/1e6).toFixed(1) + ' MB');
"

echo "==> done. bump CACHE in sw.js and run: node test.js"
