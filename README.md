# Tone Quest 声调

Retro pixel game for learning Mandarin tones. Plain static files: no build step, no dependencies.

- **Run locally:** open `index.html` directly, or `python3 -m http.server` then go to http://localhost:8000 (you need a server for offline mode).
- **Deploy to Vercel:** `npx vercel` in this folder (framework preset "Other", no build command), or push to GitHub and import the repo.
- **Offline:** after the first visit, the service worker caches everything. On a phone, use "Add to Home Screen" to get an app icon.
- **Audio:** uses your device's built-in Chinese voice when it has one (iOS always does; on Android install "Chinese" in Google TTS for offline use). Otherwise it falls back to a synthesized "pixel hum" that follows the tone's pitch contour. You can switch with the Voice button.
- **Tests:** `node test.js`

When you change files, bump `CACHE` in `sw.js` so returning players get a fresh cache. (It also revalidates in the background.)
