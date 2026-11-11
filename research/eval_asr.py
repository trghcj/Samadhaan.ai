"""Raw speech-recognition evaluation, kept separate from complaint classification.

Reads a manifest CSV (columns: audio, reference, language) where `reference` is what the speaker
ACTUALLY said (write it down before looking at the model output), runs each recording through one or
more Whisper checkpoints with the app's own settings, and reports WER / CER on the raw transcript.
Raw transcripts are saved untouched so they can be fed to the classifier later (error propagation).

  python research/eval_asr.py --manifest research/asr_manifest.csv --models small,medium
  python research/eval_asr.py --manifest research/asr_manifest.csv --snr 30,20,10,5   # add white noise first

language column: hi | en | auto (auto = choose between Hindi and English from Whisper's language
probabilities, as the app does by default). Audio paths are relative to the manifest. Use --vad 0 to
switch voice-activity detection off for a before/after comparison.

Limits of WER on Hindi: it counts whole words, so spelling variants (नहीं / नही, रहा / रह) and
Roman-vs-Devanagari writing count as errors even when the meaning is right. Read CER next to WER and
look at the transcripts. Normalisation (NFC, lowercase, punctuation and danda removed) is applied to
reference and hypothesis identically and nothing else is "corrected".
"""
import argparse
import csv
import os
import re
import time
import unicodedata

import sys

import av
import jiwer
import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
import asr  # the app's own speech stage, so the evaluation measures the real code path


def normalize(text):
    t = unicodedata.normalize("NFC", text).lower()
    t = re.sub(r"[.,!?;:\"'()\[\]{}\-–—।॥…]", " ", t)
    return " ".join(t.split())


def error_rates(reference, hypothesis):
    ref, hyp = normalize(reference), normalize(hypothesis)
    if not ref:
        raise ValueError("empty reference")
    if not hyp:
        return 1.0, 1.0
    return jiwer.wer(ref, hyp), jiwer.cer(ref, hyp)


def add_noise(x, snr_db, rng):
    """White noise at snr_db relative to the clip's average power (pauses included)."""
    noise = rng.standard_normal(len(x)).astype(np.float32)
    noise *= np.sqrt(np.mean(x ** 2) / 10 ** (snr_db / 10) / np.mean(noise ** 2))
    return x + noise


def write_webm(samples16k, path):
    """WebM/Opus, 48 kHz mono: the container and codec the browser's MediaRecorder produces."""
    out = av.open(path, "w", format="webm")
    stream = out.add_stream("libopus", rate=48000)
    stream.layout = "mono"
    stream.bit_rate = 128000
    resampler = av.AudioResampler(format="flt", layout="mono", rate=48000)
    frame = av.AudioFrame.from_ndarray(np.clip(samples16k, -1, 1).astype(np.float32)[None, :], format="flt", layout="mono")
    frame.sample_rate = 16000
    for f in resampler.resample(frame) + resampler.resample(None):
        for packet in stream.encode(f):
            out.mux(packet)
    for packet in stream.encode(None):
        out.mux(packet)
    out.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--models", default="small")
    ap.add_argument("--snr", default="", help="comma-separated dB values; adds white noise to each clip first")
    ap.add_argument("--out", default="")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--vad", type=int, default=1)
    args = ap.parse_args()

    base = os.path.dirname(os.path.abspath(args.manifest))
    with open(args.manifest, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    snrs = [float(s) for s in args.snr.split(",") if s]
    rng = np.random.default_rng(0)
    tmp = os.path.join(base, "_noisy")
    results = []

    for size in args.models.split(","):
        model = WhisperModel(size, device="cpu", compute_type="int8", cpu_threads=args.threads)
        for r in rows:
            path = os.path.join(base, r["audio"])
            conditions = [("as recorded", path)]
            if snrs:
                os.makedirs(tmp, exist_ok=True)
                clean = decode_audio(path, sampling_rate=16000)
                conditions = []
                for snr in snrs:
                    p = os.path.join(tmp, f"{os.path.splitext(os.path.basename(path))[0]}_snr{snr:g}.webm")
                    write_webm(add_noise(clean, snr, rng), p)
                    conditions.append((f"SNR {snr:g} dB", p))
            lang = r.get("language") or "auto"
            cfg = asr.ASRConfig(language=lang, vad=bool(args.vad))
            for cond, p in conditions:
                t0 = time.time()
                info = asr.transcribe(model, asr.load_audio(p), cfg)
                hyp = info["text"]
                wer, cer = error_rates(r["reference"], hyp)
                results.append(dict(model=size, audio=r["audio"], condition=cond, language_setting=lang,
                                    detected=info["language"], reference=r["reference"], transcript=hyp,
                                    wer=round(wer, 3), cer=round(cer, 3), avg_logprob=info["avg_logprob"],
                                    est_snr_db=info["est_snr_db"], vad=int(args.vad),
                                    seconds=round(time.time() - t0, 1)))
                x = results[-1]
                print(f"{size:7s} {x['audio'][:22]:22s} {cond:12s} lang={lang:4s} WER {x['wer']:.2f} CER {x['cer']:.2f} | {hyp or '(nothing)'}")

    for size in args.models.split(","):
        for cond in dict.fromkeys(x["condition"] for x in results):
            sub = [x for x in results if x["model"] == size and x["condition"] == cond]
            if sub:
                print(f"MEAN {size:7s} {cond:12s} n={len(sub)} WER {np.mean([x['wer'] for x in sub]):.2f} CER {np.mean([x['cer'] for x in sub]):.2f}")

    out = args.out or os.path.join(base, "asr_results.csv")
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        w.writeheader()
        w.writerows(results)
    print(f"saved {out}")


if __name__ == "__main__":
    main()
