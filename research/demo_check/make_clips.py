"""Make the demo check clips with text-to-speech (gTTS) from sentences.csv.

Run from the repo root:  python research/demo_check/make_clips.py
Needs gTTS (pip install gtts; set GTTS_PATH to a folder holding it if it is not installed) and internet access: gTTS sends
each sentence to Google's text-to-speech service. The sentences are made-up test text.
Voices: Hindi sentences use the Hindi voice; English and Hinglish (Roman-script Hindi) use the Indian-English voice.
Output: research/demo_check/clips/<id>.webm (Opus in WebM, 48 kHz mono, the same container the browser records).
"""
import csv
import os
import sys
import tempfile

import av
import numpy as np

if os.getenv("GTTS_PATH"):
    sys.path.insert(0, os.getenv("GTTS_PATH"))
from faster_whisper.audio import decode_audio
from gtts import gTTS

HERE = os.path.dirname(os.path.abspath(__file__))


def write_webm(path, samples16k):
    out = av.open(str(path), "w", format="webm")
    st = out.add_stream("libopus", rate=48000)
    st.layout = "mono"
    rs = av.AudioResampler(format="flt", layout="mono", rate=48000)
    fr = av.AudioFrame.from_ndarray(np.clip(samples16k, -1, 1).astype(np.float32)[None, :], format="flt", layout="mono")
    fr.sample_rate = 16000
    for f in rs.resample(fr) + rs.resample(None):
        for p in st.encode(f):
            out.mux(p)
    for p in st.encode(None):
        out.mux(p)
    out.close()


def main():
    os.makedirs(os.path.join(HERE, "clips"), exist_ok=True)
    with open(os.path.join(HERE, "sentences.csv"), encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        voice = {"lang": "hi"} if r["language_spoken"] == "hi" else {"lang": "en", "tld": "co.in"}
        with tempfile.TemporaryDirectory() as tmp:
            mp3 = os.path.join(tmp, "s.mp3")
            gTTS(r["sentence"], **voice).save(mp3)
            samples = decode_audio(mp3, sampling_rate=16000)
        write_webm(os.path.join(HERE, "clips", f"{r['id']}.webm"), samples)
        print(f"{r['id']:<36} {len(samples) / 16000:4.1f} s")
    print(f"{len(rows)} clips written to {os.path.join(HERE, 'clips')}")


if __name__ == "__main__":
    main()
