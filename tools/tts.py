#!/usr/bin/env python3
"""Piper Mandarin synthesis with carrier-phrase tone enhancement.

Subcommands:
  synth    --corpus TSV --out DIR [--length-scale 1.0]   synthesize full corpus
  analyze  --files F1 F2 F3 F4                           pass/fail 4 wavs on F0 contour (exit 0/1)
  audition --out DIR                                     quick tone check for xiao_ya (t1/t2/t4 only)

Tone-3 singles are skipped (mode='skip' in corpus.tsv); browser speechSynthesis handles them.

Piper setup (Python 3.12, since g2pW needs torch):
  python3.12 -m venv .venv-tts && .venv-tts/bin/pip install 'piper-tts[zh]' torch requests
  .venv-tts/bin/python -m piper.download_voices zh_CN-xiao_ya-medium --data-dir .piper-voices
"""
import argparse, array, os, subprocess, sys, wave

SETUP_FAIL = 90

# ---------- configuration ----------

PIPER_BIN = os.environ.get("PIPER_BIN")  # auto-detect below
PIPER_MODEL = os.environ.get("PIPER_MODEL", "zh_CN-xiao_ya-medium")
PIPER_DATA_DIR = os.environ.get("PIPER_DATA_DIR", ".piper-voices")

# Carrier cascade: try each in order until energy segmentation finds >=2 segments.
CARRIERS = ["好，{}。", "听，{}。", "来，{}。"]


# ---------- piper helpers ----------

def piper_cmd():
    """Return base command to invoke piper (CLI or python -m)."""
    exe = PIPER_BIN or os.environ.get("PYTHON", sys.executable)
    if PIPER_BIN and os.path.isfile(PIPER_BIN):
        return [PIPER_BIN]
    return [exe, "-m", "piper"]


def piper_synth(text, out_wav, length_scale=1.0):
    """Run Piper; raises RuntimeError on failure or empty output."""
    cmd = piper_cmd() + [
        "-m", PIPER_MODEL,
        "--data-dir", PIPER_DATA_DIR,
        "--length_scale", str(length_scale),
        "-f", out_wav,
    ]
    try:
        r = subprocess.run(cmd, input=text.encode(), capture_output=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise RuntimeError(f"piper not runnable: {e}")
    if not os.path.exists(out_wav) or os.path.getsize(out_wav) < 200:
        err = r.stderr.decode(errors="replace").strip().splitlines()
        msg = err[-1][:200] if err else "empty audio"
        raise RuntimeError(f"piper failed ({msg})")


# ---------- energy-based segmentation ----------

def read_wav_mono(path):
    """Read a mono 16-bit wav; returns (sample_rate, samples as list of floats -1..1)."""
    with wave.open(path, "rb") as w:
        sr = w.getframerate()
        n = w.getnframes()
        frames = w.readframes(n)
    return sr, [v / 32768 for v in array.array("h", frames)]


def write_wav_mono(path, sr, samples):
    pcm = array.array("h", [max(-32768, min(32767, int(s * 32768))) for s in samples])
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def find_segments(sr, samples, thresh_frac=0.04, min_dur_ms=80):
    """Return list of (start_sample, end_sample) for voiced segments separated by silence."""
    frame = max(1, int(sr * 0.02))  # 20ms window
    n_frames = max(0, (len(samples) - frame) // frame + 1)
    if n_frames < 2:
        return []
    rms = []
    for i in range(n_frames):
        seg = samples[i * frame : i * frame + frame]
        rms.append(sum(v * v for v in seg) ** 0.5 / (len(seg) or 1))
    peak = max(rms) if rms else 0
    if peak == 0:
        return []
    thresh = peak * thresh_frac
    segments = []
    in_seg = False
    start = 0
    for i, v in enumerate(rms):
        voiced = v > thresh
        if voiced and not in_seg:
            start = i
            in_seg = True
        elif not voiced and in_seg:
            if (i - start) * 20 >= min_dur_ms:
                segments.append((start * frame, i * frame))
            in_seg = False
    if in_seg and (n_frames - start) * 20 >= min_dur_ms:
        segments.append((start * frame, n_frames * frame))
    return segments


def trim_carrier(path, out_path):
    """Trim raw carrier audio to the last voiced segment (the target syllable).
    Returns True on success, False if segmentation found <2 parts."""
    sr, samples = read_wav_mono(path)
    segments = find_segments(sr, samples)
    if len(segments) < 2:
        return False
    # Take the last segment with a small pad
    s, e = segments[-1]
    pad = int(sr * 0.04)
    s = max(0, s - pad)
    e = min(len(samples), e + pad)
    write_wav_mono(out_path, sr, samples[s:e])
    return True


# ---------- carrier synthesis with cascade ----------

def synth_carrier(text, out_wav, length_scale, tmp_dir):
    """Synthesize via carrier cascade: try each carrier, trim to target."""
    raw = os.path.join(tmp_dir, "_carrier_raw.wav")
    for carrier in CARRIERS:
        phrase = carrier.format(text)
        piper_synth(phrase, raw, length_scale)
        if trim_carrier(raw, out_wav):
            return True
    # All carriers failed to segment: write raw (contains carrier, not ideal but usable)
    subprocess.run(["cp", raw, out_wav], check=False)
    return False


# ---------- main synthesis entry points ----------

def synth_line(key, text, slow, mode, out_dir, length_scale, tmp_dir):
    """Synthesize one corpus entry. Returns output path or None if skipped."""
    if mode == "skip":
        return None
    wav = os.path.join(out_dir, f"{key}~slow.wav" if slow else f"{key}.wav")
    ls = length_scale * (1.6 if slow else 1.0)
    if mode == "carrier":
        ok = synth_carrier(text, wav, ls, tmp_dir)
        if not ok:
            print(f"WARN {key}: all carriers merged, using untrimmed", file=sys.stderr)
    else:  # direct
        piper_synth(text, wav, ls)
    return wav


# ---------- F0 analysis (kept for debugging / audition) ----------

def f0_contour(path, fmin=90.0, fmax=400.0):
    sr, samples = read_wav_mono(path)
    win, hop = int(sr * 0.03), int(sr * 0.01)
    lag_lo, lag_hi = int(sr / fmax), int(sr / fmin)
    out = []
    for start in range(0, len(samples) - win, hop):
        fr = samples[start : start + win]
        rms = sum(v * v for v in fr) ** 0.5
        if rms < 0.015:
            continue
        mean = sum(fr) / len(fr)
        fr = [v - mean for v in fr]
        ac = [sum(fr[i] * fr[i - lag] for i in range(lag, len(fr))) for lag in range(lag_lo, lag_hi)]
        if not ac:
            continue
        best = max(range(len(ac)), key=lambda i: ac[i])
        if ac[best] < 0.35 * (sum(v * v for v in fr) or 1):
            continue
        out.append(sr / (lag_lo + best))
    return out


def tone_checks(c):
    lo, hi = min(c), max(c)
    rng = (hi - lo) / hi if hi else 0
    head = sum(c[: max(1, len(c) // 4)]) / max(1, len(c) // 4)
    tail = sum(c[-3:]) / 3
    return {
        1: rng < 0.18 and head / hi > 0.72,
        2: tail / head > 1.15 and tail / hi > 0.75,
        4: head / hi > 0.72 and tail / hi < 0.75,
    }


def analyze(files, verbose=True):
    """Check tones 1, 2, 4 (tone 3 skipped by design). Exit 0 = pass."""
    contours = [f0_contour(f) for f in files]
    ok = True
    for i, c in enumerate(contours, 1):
        if i == 3:
            continue  # tone 3 is browser-handled
        if len(c) < 6:
            if verbose: print(f"tone {i}: only {len(c)} voiced frames - inaudible")
            ok = False
            continue
        checks = tone_checks(c)
        if i in checks and not checks[i]:
            if verbose: print(f"tone {i}: shape BAD")
            ok = False
        elif verbose:
            print(f"tone {i}: ok")
    return ok


def audition(out_dir):
    """Synthesize 妈麻骂 with carrier and check t1/t2/t4 pass. (tone 3 马 skipped.)"""
    os.makedirs(out_dir, exist_ok=True)
    tmp = os.path.join(out_dir, "_tmp")
    os.makedirs(tmp, exist_ok=True)
    tones = [(1, "妈"), (2, "麻"), (4, "骂")]
    files = []
    for t, ch in tones:
        wav = os.path.join(out_dir, f"audition_t{t}.wav")
        try:
            ok = synth_carrier(ch, wav, 1.4, tmp)
            files.append(wav)
        except RuntimeError as e:
            print(f"audition FAIL: {e}", file=sys.stderr)
            return False
    # Check tone 1, 2, 4 contours (files[0]=t1, files[1]=t2, files[2]=t4)
    # Reorder to match analyze expecting 4 files: pass t3 as t4 duplicate
    result = analyze([files[0], files[1], files[2], files[2]], verbose=True)
    # cleanup
    for f in files:
        try: os.remove(f)
        except OSError: pass
    import shutil; shutil.rmtree(tmp, ignore_errors=True)
    return result


# ---------- CLI ----------

def main():
    ap = argparse.ArgumentParser(description="Piper Mandarin TTS with carrier enhancement")
    ap.add_argument("cmd", choices=["synth", "audition", "analyze"])
    ap.add_argument("--out", required=True, help="output directory")
    ap.add_argument("--corpus", help="TSV file (key\\ttext\\tslow\\tmode)")
    ap.add_argument("--files", nargs="*", metavar="WAV", help="for analyze: wav files to check")
    ap.add_argument("--length-scale", type=float, default=1.0)
    a = ap.parse_args()

    if a.cmd == "audition":
        sys.exit(0 if audition(a.out) else 1)

    if a.cmd == "analyze":
        if not a.files or len(a.files) < 3:
            print("analyze requires --files with at least 3 wavs (t1, t2, t4)", file=sys.stderr)
            sys.exit(2)
        sys.exit(0 if analyze(a.files) else 1)

    # synth: full corpus from TSV
    if not a.corpus:
        print("synth requires --corpus", file=sys.stderr)
        sys.exit(2)
    tmp_dir = os.path.join(a.out, "_carrier_tmp")
    os.makedirs(a.out, exist_ok=True)
    os.makedirs(tmp_dir, exist_ok=True)
    n = skips = fails = 0
    for line in open(a.corpus, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line:
            continue
        parts = line.split("\t")
        key, text, slow = parts[0], parts[1], int(parts[2])
        mode = parts[3] if len(parts) > 3 else "direct"
        try:
            result = synth_line(key, text, slow, mode, a.out, a.length_scale, tmp_dir)
            if result is None:
                skips += 1
            else:
                n += 1
        except RuntimeError as e:
            fails += 1
            print(f"WARN {key}: {e}", file=sys.stderr)
        if (n + fails) % 40 == 0 and n > 0:
            print(f"{n} synthesized...", file=sys.stderr)
    import shutil; shutil.rmtree(tmp_dir, ignore_errors=True)
    print(f"{n} ok, {skips} skipped, {fails} failed", file=sys.stderr)
    sys.exit(0 if n and not fails else 1 if n else SETUP_FAIL)


if __name__ == "__main__":
    main()
