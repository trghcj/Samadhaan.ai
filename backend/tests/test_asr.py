"""Tests for the speech stage and how the pipeline uses it.

Fixtures in tests/fixtures are SYNTHETIC text-to-speech clips (gTTS) re-encoded to WebM/Opus 48 kHz mono,
the container and codec the browser records. They prove the pipeline works on clean speech; they say
nothing about real speakers or noisy microphones (use research/eval_asr.py with real recordings for that).

Run from backend/:   python -m pytest tests -q          (add -m "not model" to skip the Whisper tests)
"""
import os
import wave

import av
import numpy as np
import pytest

import asr
import muril_classifier

FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
model_needed = pytest.mark.model


# ---------- helpers ----------
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


def tone(seconds, amp=0.3):
    t = np.arange(int(16000 * seconds)) / 16000
    return (amp * np.sin(2 * np.pi * 220 * t)).astype(np.float32)


# ---------- audio validation (no model needed) ----------
def test_empty_file_gives_clear_error(tmp_path):
    p = tmp_path / "a.webm"
    p.write_bytes(b"")
    with pytest.raises(asr.AudioError, match="empty"):
        asr.load_audio(str(p))


def test_missing_file_gives_clear_error(tmp_path):
    with pytest.raises(asr.AudioError, match="empty"):
        asr.load_audio(str(tmp_path / "nope.webm"))


def test_corrupted_file_gives_clear_error(tmp_path):
    p = tmp_path / "a.webm"
    p.write_bytes(os.urandom(5000))
    with pytest.raises(asr.AudioError, match="could not be read"):
        asr.load_audio(str(p))


def test_too_short_recording_rejected(tmp_path):
    p = tmp_path / "a.webm"
    write_webm(p, tone(0.2))
    with pytest.raises(asr.AudioError, match="too short"):
        asr.load_audio(str(p))


def test_silent_recording_rejected(tmp_path):
    p = tmp_path / "a.webm"
    write_webm(p, np.zeros(16000 * 2, dtype=np.float32))
    with pytest.raises(asr.AudioError, match="silent"):
        asr.load_audio(str(p))


def test_valid_webm_decodes_to_16k_mono_with_right_duration(tmp_path):
    p = tmp_path / "a.webm"
    write_webm(p, tone(2.0))
    x = asr.load_audio(str(p))
    assert x.dtype == np.float32 and x.ndim == 1
    assert abs(len(x) / asr.SAMPLE_RATE - 2.0) < 0.1  # resampled 48k -> 16k, not truncated or stretched


def test_wrong_extension_still_decodes(tmp_path):
    """The browser sends 'recording.webm' whatever it really recorded; the decoder must go by content."""
    p = tmp_path / "speech.webm"
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes((tone(1.5) * 32767).astype(np.int16).tobytes())
    assert len(asr.load_audio(str(p))) > 16000


# ---------- language choice and raw-transcript handling (fake model) ----------
class FakeSegment:
    def __init__(self, text, lp=-0.3, ns=0.05):
        self.text, self.avg_logprob, self.no_speech_prob = text, lp, ns


class FakeModel:
    def __init__(self, probs, text="आरा है"):
        self.probs, self.text, self.kwargs = probs, text, None

    def detect_language(self, audio, vad_filter=False):
        return max(self.probs, key=self.probs.get), 0.5, list(self.probs.items())

    def transcribe(self, audio, **kwargs):
        self.kwargs = kwargs
        return iter([FakeSegment(self.text)]), None


AUDIO = tone(2.0)


def test_auto_picks_hindi_even_when_other_languages_score_higher():
    m = FakeModel({"te": 0.45, "hi": 0.30, "en": 0.05})  # noisy Hindi mislabelled as Telugu by unrestricted detection
    r = asr.transcribe(m, AUDIO, asr.ASRConfig())
    assert r["language"] == "hi" and r["language_source"] == "detected"
    assert m.kwargs["language"] == "hi"


def test_auto_picks_english_for_english():
    m = FakeModel({"en": 0.8, "hi": 0.1})
    assert asr.transcribe(m, AUDIO, asr.ASRConfig())["language"] == "en"


def test_forced_language_is_respected_and_task_is_transcribe():
    m = FakeModel({"en": 0.9})
    r = asr.transcribe(m, AUDIO, asr.ASRConfig(language="hi", vad=False))
    assert r["language_source"] == "fixed" and m.kwargs["language"] == "hi"
    assert m.kwargs["task"] == "transcribe" and m.kwargs["vad_filter"] is False


def test_default_config_does_not_force_a_language(monkeypatch):
    for k in ("WHISPER_LANGUAGE", "WHISPER_LANGUAGES", "WHISPER_VAD", "WHISPER_PROMPT"):
        monkeypatch.delenv(k, raising=False)
    cfg = asr.ASRConfig.from_env()
    assert cfg.language == "auto" and cfg.languages == ("hi", "en") and cfg.vad and cfg.prompt == ""


def test_prompt_is_off_by_default_and_used_only_when_set():
    m = FakeModel({"hi": 0.9})
    asr.transcribe(m, AUDIO, asr.ASRConfig())
    assert "initial_prompt" not in m.kwargs
    asr.transcribe(m, AUDIO, asr.ASRConfig(prompt="x"))
    assert m.kwargs["initial_prompt"] == "x"


def test_raw_transcript_is_returned_unmodified():
    """No correction layer: a wrong transcript must stay wrong so it can be measured."""
    m = FakeModel({"hi": 0.9}, text="पानी नहीं आरा है")
    assert asr.transcribe(m, AUDIO)["text"] == "पानी नहीं आरा है"


# ---------- pipeline (stubbed model and database) ----------
class FakeDB:
    saved = None

    def add(self, o):
        FakeDB.saved = o

    def commit(self):
        pass

    def refresh(self, o):
        o.id = 1

    def close(self):
        pass


@pytest.fixture
def pipeline(monkeypatch, tmp_path):
    import ai_pipeline

    monkeypatch.setattr(ai_pipeline, "SessionLocal", FakeDB)
    monkeypatch.setenv("CLASSIFIER", "gemini")
    monkeypatch.setattr(ai_pipeline, "GEMINI_API_KEY", "")
    p = tmp_path / "a.webm"
    write_webm(p, tone(2.0))
    return ai_pipeline, str(p)


def test_pipeline_keeps_raw_transcript_and_exposes_asr_measurements(pipeline, monkeypatch):
    ai_pipeline, path = pipeline
    monkeypatch.setattr(ai_pipeline, "get_whisper_model", lambda cb=None: FakeModel({"hi": 0.9}, text="पानी नहीं आरा है"))
    r = ai_pipeline.process_audio_task(path)
    assert r["transcript"] == "पानी नहीं आरा है"
    assert r["asr"]["language"] == "hi" and "avg_logprob" in r["asr"]
    assert FakeDB.saved.transcript == "पानी नहीं आरा है"  # stored raw


def test_pipeline_sends_nothing_heard_to_a_human_not_a_department(pipeline, monkeypatch):
    ai_pipeline, path = pipeline

    class Mute(FakeModel):
        def transcribe(self, audio, **kw):
            return iter([]), None

    monkeypatch.setattr(ai_pipeline, "get_whisper_model", lambda cb=None: Mute({"hi": 0.9}))
    r = ai_pipeline.process_audio_task(path)
    assert (r["prediction_set"], r["confidence_level"]) == ("Unclear", "Low")


def test_pipeline_reports_missing_model_instead_of_hiding_it(pipeline, monkeypatch):
    ai_pipeline, path = pipeline
    monkeypatch.setattr(ai_pipeline, "get_whisper_model", lambda cb=None: None)
    with pytest.raises(RuntimeError, match="could not be loaded"):
        ai_pipeline.process_audio_task(path)


def test_pipeline_reports_failed_transcription(pipeline, monkeypatch):
    ai_pipeline, path = pipeline

    class Broken(FakeModel):
        def transcribe(self, audio, **kw):
            raise OSError("boom")

    monkeypatch.setattr(ai_pipeline, "get_whisper_model", lambda cb=None: Broken({"hi": 0.9}))
    with pytest.raises(RuntimeError, match="Speech recognition failed"):
        ai_pipeline.process_audio_task(path)


def test_pipeline_rejects_empty_recording(pipeline, tmp_path):
    ai_pipeline, _ = pipeline
    empty = tmp_path / "e.webm"
    empty.write_bytes(b"")
    with pytest.raises(asr.AudioError):
        ai_pipeline.process_audio_task(str(empty))


# ---------- existing routing behaviour is unchanged ----------
def test_routing_levels_still_follow_thresholds():
    th = {"t_high": 0.355, "t_low": 0.325, "score_map": [{"max_conf": 1.0, "est_accuracy": 0.9}]}
    probs = lambda top: np.array([top, 0.2, 0.1, 0.1, 0.1, 0.1, 1 - top - 0.6])
    assert muril_classifier.build_result(probs(0.40), th)["confidence_level"] == "High"
    mid = muril_classifier.build_result(probs(0.34), th)
    assert mid["confidence_level"] == "Medium" and "clarifying_question" in mid
    low = muril_classifier.build_result(probs(0.30), th)
    assert low["confidence_level"] == "Low" and low["alternative_departments"]


# ---------- real Whisper on the synthetic clips (skipped if the model is not cached) ----------
@pytest.fixture(scope="module")
def whisper():
    from faster_whisper import WhisperModel

    try:
        return WhisperModel(os.getenv("WHISPER_MODEL", "small"), device="cpu", compute_type="int8", cpu_threads=4,
                            local_files_only=True)
    except Exception as e:  # model not downloaded
        pytest.skip(f"Whisper model not available offline: {e}")


@model_needed
def test_hindi_paani_nahi_aa_raha_hai_semantics(whisper):
    r = asr.transcribe(whisper, asr.load_audio(os.path.join(FIX, "hi_paani_tts.webm")), asr.ASRConfig())
    assert r["text"], "empty transcript"
    assert r["language"] == "hi"
    # Not an exact match: spelling/spacing vary ("आरा" for "आ रहा"). The key content words must be there.
    assert "पानी" in r["text"] and "नहीं" in r["text"]


@model_needed
def test_english_still_supported(whisper):
    r = asr.transcribe(whisper, asr.load_audio(os.path.join(FIX, "en_water_tts.webm")), asr.ASRConfig())
    assert r["language"] == "en"
    assert "water" in r["text"].lower()
