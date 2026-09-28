# Tone Quest 声调

Retro pixel game for learning Mandarin tones. Plain static files: no build step, no dependencies.

- **Run locally:** open `index.html` directly, or `python3 -m http.server` then go to http://localhost:8000 (you need a server for offline mode).
- **Deploy to Vercel:** `npx vercel` in this folder (framework preset "Other", no build command), or push to GitHub and import the repo.
- **Offline:** after the first visit, the service worker caches everything. On a phone, use "Add to Home Screen" to get an app icon.
- **Audio:** pregenerated clips from [audio-cmn](https://github.com/hugolpz/audio-cmn) (CC-by-sa) — 96 human-recorded Mandarin syllables covering all tones + most HSK words. For the ~26 compound words not in that set, Piper (`zh_CN-xiao_ya-medium`, g2pW neural pinyin) fills in. Run `./tools/generate-audio.sh` to regenerate (needs Node.js + git; Piper fill-in needs Python 3.12 venv with `piper-tts[zh]` + torch). Output: `audio/*.mp3` + `audio/*.m4a` + `audio/manifest.json`, precached by the service worker. Slow mode uses runtime `playbackRate=0.7`. Voice button cycles **Studio** → **Device** (browser speechSynthesis; on Android install "Chinese" in Google TTS for offline use) → **Pixel hum** (synthesized pitch-contour hum, zero audio deps).
- **Tests:** `node test.js`

When you change files, bump `CACHE` in `sw.js` so returning players get a fresh cache. (It also revalidates in the background.)

## Audio attribution

- **audio-cmn** syllable + HSK recordings: Chen Wang, Yue Tan / [hugolpz/audio-cmn](https://github.com/hugolpz/audio-cmn) — CC-by-sa 4.0.
- **Piper** fill-in: zh_CN-xiao_ya-medium (OHF-Voice / rhasspy piper1-gpl) — CC-by-sa 4.0.
