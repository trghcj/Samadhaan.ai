"""Speech-to-text stage (faster-whisper), kept separate from classification.

Returns the RAW transcript plus quality measurements. Nothing here corrects, rewrites or hides
recognition errors: whatever Whisper heard is what the classifier receives and what is stored.
The same functions are used by the app (ai_pipeline.py) and by research/eval_asr.py, so the
evaluation measures the real code path.
"""
import os
import re
from dataclasses import dataclass

import numpy as np
from faster_whisper.audio import decode_audio

SAMPLE_RATE = 16000
MIN_SECONDS = 0.5


# Vocabulary hint for Whisper: common civic words in Hindi and English. It is OFF by default (WHISPER_PROMPT=civic turns it
# on): on this project's real, noisy laptop-microphone recordings it made Whisper 8-10x slower on 3 of 7 clips and, without
# the temperature fallback, produced long repetitive output; on clean synthetic speech it changed nothing useful.
# If the output is nothing but the hint, transcribe() asks again without it (see _echoes_hint).
CIVIC_PROMPTS = {
    "hi": "पानी, बिजली, सड़क, कचरा, नाली, स्ट्रीट लाइट, water, electricity, road, garbage, drain, street light.",
    "en": "water, electricity, road, garbage, drain, street light, पानी, बिजली, सड़क, कचरा, नाली.",
}


class AudioError(ValueError):
    """The recording cannot be used. The message is safe to show to the user."""


@dataclass
class ASRConfig:
    language: str = "auto"       # "hi" / "en" force one language; "auto" picks between `languages` only
    languages: tuple = ("hi", "en")
    vad: bool = True             # drop non-speech so Whisper does not decode noise (and hallucinate on it)
    prompt: str = ""             # "" = no hint (default); "civic" = the civic-words hint above for the chosen language; other text = custom hint
    beam_size: int = 5

    @classmethod
    def from_env(cls):
        return cls(
            language=(os.getenv("WHISPER_LANGUAGE") or "auto").strip().lower(),
            languages=tuple(x.strip() for x in os.getenv("WHISPER_LANGUAGES", "hi,en").split(",") if x.strip()),
            vad=os.getenv("WHISPER_VAD", "1") != "0",
            prompt=cls.prompt_from_env(os.getenv("WHISPER_PROMPT")),
        )

    @staticmethod
    def prompt_from_env(value):
        value = (value or "").strip()
        if value.lower() in ("", "off", "none", "0"):
            return ""
        return "civic" if value.lower() in ("civic", "on", "1") else value

    def prompt_for(self, language):
        if self.prompt == "civic":
            return CIVIC_PROMPTS.get(language, CIVIC_PROMPTS["hi"])
        return self.prompt


def audio_stats(x):
    """Level measures of the decoded 16 kHz mono signal. est_snr_db compares the loudest and the quietest
    10% of 0.25 s frames: a rough speech-versus-background figure, not a calibrated SNR."""
    fr = SAMPLE_RATE // 4
    n = len(x) // fr
    stats = {"seconds": round(len(x) / SAMPLE_RATE, 2), "peak": round(float(np.abs(x).max()), 3),
             "rms": round(float(np.sqrt(np.mean(x ** 2))), 4), "est_snr_db": None}
    if n >= 4:
        power = np.sort(np.mean(x[: n * fr].reshape(n, fr) ** 2, axis=1))
        k = max(1, n // 10)
        stats["est_snr_db"] = round(float(10 * np.log10((power[-k:].mean() + 1e-12) / (power[:k].mean() + 1e-12))), 1)
    return stats


def load_audio(path):
    """Decode to 16 kHz mono float32, or raise AudioError with a clear reason."""
    if not os.path.isfile(path) or os.path.getsize(path) == 0:
        raise AudioError("The recording is empty. Please record again.")
    try:
        x = decode_audio(path, sampling_rate=SAMPLE_RATE)
    except Exception as e:
        raise AudioError("The recording could not be read (corrupted or unsupported audio format).") from e
    if len(x) < MIN_SECONDS * SAMPLE_RATE:
        raise AudioError("The recording is too short. Please speak for at least a second.")
    if float(np.abs(x).max()) < 1e-3:
        raise AudioError("The recording is silent. Please check the microphone.")
    return x


def pick_language(model, audio, cfg):
    """Choose between the allowed languages (default Hindi / English) from Whisper's own language
    probabilities. Unrestricted detection mislabels short noisy Hindi as other languages (Telugu, Nynorsk...)."""
    _, _, all_probs = model.detect_language(audio, vad_filter=cfg.vad)
    probs = {lang: p for lang, p in all_probs}
    best = max(cfg.languages, key=lambda lang: probs.get(lang, 0.0))
    return best, float(probs.get(best, 0.0))


def _echoes_hint(text, hint):
    """True when the transcript is made only of words from the hint: Whisper repeated the hint instead of the speech."""
    words = re.findall(r"\w+", text.lower())
    hint_words = set(re.findall(r"\w+", hint.lower()))
    return bool(words) and all(w in hint_words for w in words)


def transcribe(model, audio, cfg=None):
    """audio: float32 array from load_audio(). Returns the raw transcript and measurements."""
    cfg = cfg or ASRConfig.from_env()
    if cfg.language in ("", "auto"):
        language, lang_prob = pick_language(model, audio, cfg)
        source = "detected"
    else:
        language, lang_prob, source = cfg.language, None, "fixed"
    kwargs = {"beam_size": cfg.beam_size, "language": language, "task": "transcribe", "vad_filter": cfg.vad}
    hint = cfg.prompt_for(language)
    retried = False
    if hint:
        kwargs["initial_prompt"] = hint
    segments, _ = model.transcribe(audio, **kwargs)
    segments = list(segments)
    text = " ".join(s.text.strip() for s in segments).strip()
    if hint and _echoes_hint(text, hint):
        # The output is only the hint's own words: do not trust it. Transcribe again without the hint.
        kwargs.pop("initial_prompt")
        segments, _ = model.transcribe(audio, **kwargs)
        segments = list(segments)
        text = " ".join(s.text.strip() for s in segments).strip()
        retried = True
    return {
        "text": text,
        "prompt_used": bool(hint) and not retried,
        "prompt_retried_without": retried,
        "language": language,
        "language_probability": lang_prob,
        "language_source": source,
        "avg_logprob": round(float(np.mean([s.avg_logprob for s in segments])), 3) if segments else None,
        "max_no_speech_prob": round(float(max(s.no_speech_prob for s in segments)), 3) if segments else None,
        "vad": cfg.vad,
        **audio_stats(audio),
    }
