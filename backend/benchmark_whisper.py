"""Time Whisper sizes on this machine with the same code path as the app (asr.load_audio + asr.transcribe).

Run from the backend folder:
    python benchmark_whisper.py                          # small, medium, large-v3-turbo on the test clips
    python benchmark_whisper.py --sizes small medium --clips tests/fixtures temp_audio --repeats 3

Reports, per size: load time, model size on disk, and seconds per clip (mean over --repeats, after one untimed warm-up
run). Language is fixed per clip (hi_/en_ in the file name; otherwise --language), as the citizen's choice does in the portal.
A size that is not cached is downloaded first (large-v3-turbo is about 1.6 GB). Transcripts are printed only with --show-text,
because the clips can be real complaints.
"""
import argparse
import glob
import os
import shutil
import time

import asr

AUDIO_EXT = (".webm", ".wav", ".mp3", ".m4a", ".ogg", ".mp4", ".flac")


def clip_list(paths):
    out = []
    for p in paths:
        out += sorted(glob.glob(os.path.join(p, "*"))) if os.path.isdir(p) else [p]
    return [c for c in out if c.lower().endswith(AUDIO_EXT)]


def language_of(path, default):
    name = os.path.basename(path).lower()
    return "en" if name.startswith("en_") else "hi" if name.startswith("hi_") else default


def cached_size_gb(size):
    """Size of the cached model folder in GB (resolves the faster-whisper alias to its Hugging Face repo)."""
    from faster_whisper.utils import _MODELS
    from huggingface_hub import scan_cache_dir

    repo = _MODELS.get(size, size)
    for r in scan_cache_dir().repos:
        if r.repo_id == repo:
            return r.size_on_disk / 1e9
    return float("nan")


def free_gb(path="."):
    return shutil.disk_usage(os.path.abspath(path)).free / 1e9


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sizes", nargs="+", default=["small", "medium", "large-v3-turbo"])
    ap.add_argument("--clips", nargs="+", default=[os.path.join(os.path.dirname(os.path.abspath(__file__)), "tests", "fixtures")])
    ap.add_argument("--language", default="hi", help="language for clips whose name does not start with hi_ or en_")
    ap.add_argument("--repeats", type=int, default=2)
    ap.add_argument("--compute", default=os.getenv("WHISPER_COMPUTE", "int8"))
    ap.add_argument("--threads", type=int, default=int(os.getenv("WHISPER_THREADS", "4")))
    ap.add_argument("--show-text", action="store_true")
    args = ap.parse_args()

    from faster_whisper import WhisperModel
    import dataclasses

    clips = clip_list(args.clips)
    if not clips:
        raise SystemExit("no audio clips found")
    audio = {c: asr.load_audio(c) for c in clips}
    print(f"{len(clips)} clips, compute={args.compute}, threads={args.threads}, free disk before: {free_gb():.1f} GB")
    for c in clips:
        print(f"   {os.path.basename(c)[:40]:<40} {len(audio[c]) / asr.SAMPLE_RATE:5.1f} s  language {language_of(c, args.language)}")

    summary = []
    for size in args.sizes:
        free_before = free_gb()
        t0 = time.time()
        model = WhisperModel(size, device="cpu", compute_type=args.compute, cpu_threads=args.threads)
        load_s = time.time() - t0
        disk = cached_size_gb(size)
        asr.transcribe(model, audio[clips[0]], dataclasses.replace(asr.ASRConfig.from_env(), language=language_of(clips[0], args.language)))  # warm-up
        per_clip = []
        for c in clips:
            cfg = dataclasses.replace(asr.ASRConfig.from_env(), language=language_of(c, args.language))
            times = []
            for _ in range(args.repeats):
                t = time.time()
                r = asr.transcribe(model, audio[c], cfg)
                times.append(time.time() - t)
            per_clip.append((c, sum(times) / len(times), r["text"]))
        secs = [t for _, t, _ in per_clip]
        summary.append((size, load_s, disk, sum(secs) / len(secs), max(secs), free_before - free_gb()))
        print(f"\n== {size}: load {load_s:.1f}s, {disk:.2f} GB on disk")
        for c, t, text in per_clip:
            print(f"   {os.path.basename(c)[:40]:<40} {t:5.2f} s" + (f"   {text}" if args.show_text else ""))
        del model

    print(f"\n{'size':<16}{'load (s)':>10}{'disk (GB)':>11}{'mean s/clip':>13}{'slowest s':>11}{'fits < 8 s':>12}")
    for size, load_s, disk, mean_s, worst, _ in summary:
        print(f"{size:<16}{load_s:>10.1f}{disk:>11.2f}{mean_s:>13.2f}{worst:>11.2f}{('yes' if worst < 8 else 'no'):>12}")
    print(f"free disk after: {free_gb():.1f} GB")


if __name__ == "__main__":
    main()
