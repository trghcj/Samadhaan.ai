"""Upload endpoint tests (FastAPI TestClient, throw-away SQLite database from conftest.py).

The browser side (microphone -> MediaRecorder -> FormData 'file' named recording.webm) is not driven here;
these tests send the same multipart request the frontend sends and read back what the frontend polls.
"""
import os

import pytest
from fastapi.testclient import TestClient

FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")


@pytest.fixture(scope="module")
def client():
    import main

    return TestClient(main.app)


def post_audio(client, path, filename="recording.webm", **form):
    with open(path, "rb") as f:
        r = client.post("/api/upload", files={"file": (filename, f, "audio/webm")}, data=form)
    assert r.status_code == 200
    return r.json()["task_id"]


def test_empty_upload_returns_understandable_error(client, tmp_path):
    empty = tmp_path / "e.webm"
    empty.write_bytes(b"")
    task = post_audio(client, empty)
    s = client.get(f"/api/status/{task}").json()
    assert s["status"] == "error" and "empty" in s["error"].lower()


def test_corrupted_upload_returns_understandable_error(client, tmp_path):
    bad = tmp_path / "b.webm"
    bad.write_bytes(os.urandom(4000))
    s = client.get(f"/api/status/{post_audio(client, bad)}").json()
    assert s["status"] == "error" and "could not be read" in s["error"]


def test_client_filename_cannot_escape_temp_dir_and_audio_is_removed(client, tmp_path):
    import main

    bad = tmp_path / "b.webm"
    bad.write_bytes(os.urandom(4000))
    before = set(os.listdir("temp_audio"))
    post_audio(client, bad, filename="../../escape.webm")
    assert not os.path.exists(os.path.join("..", "escape.webm"))
    assert set(os.listdir("temp_audio")) == before  # uploaded audio deleted after processing (KEEP_AUDIO unset)


def test_language_choice_is_validated_and_passed_to_the_pipeline(client, monkeypatch, tmp_path):
    import main

    seen = {}
    monkeypatch.setattr(main, "process_audio_task", lambda *a, **kw: seen.update(kw) or {"transcript": "t"})
    tiny = tmp_path / "e.webm"
    tiny.write_bytes(b"x")
    for form, expected in (({"language": "en"}, "en"), ({"language": "HI"}, "hi"), ({"language": "auto"}, None), ({}, None)):
        seen.clear()
        s = client.get(f"/api/status/{post_audio(client, tiny, **form)}").json()
        assert s["status"] == "success" and seen["language"] == expected, (form, seen)
    with open(tiny, "rb") as f:
        r = client.post("/api/upload", files={"file": ("r.webm", f, "audio/webm")}, data={"language": "fr"})
    assert r.status_code == 400


def test_typed_text_endpoint_rejects_empty_and_too_long(client):
    assert client.post("/api/submit-text", data={"text": "   "}).status_code == 400
    assert client.post("/api/submit-text", data={"text": "x" * 1001}).status_code == 400
    assert client.post("/api/submit-text", data={}).status_code == 422


def test_typed_text_is_routed_and_saved_like_a_spoken_complaint(client, monkeypatch):
    import muril_classifier

    fake = {"prediction_set": "Water", "confidence_level": "High", "confidence_score": 0.9, "route": "auto", "priority": "Medium"}
    monkeypatch.setattr(muril_classifier, "classify", lambda text: dict(fake))
    r = client.post("/api/submit-text", data={"text": "  paani nahi aa raha  ", "location": "ward 4", "language": "hi"})
    assert r.status_code == 200
    s = client.get(f"/api/status/{r.json()['task_id']}").json()
    assert s["status"] == "success", s
    res = s["ai_result"]
    assert res["transcript"] == "paani nahi aa raha" and res["input"] == "text" and res["prediction_set"] == "Water" and "id" in res


def test_models_are_preloaded_at_startup_and_can_be_switched_off(monkeypatch):
    import asyncio

    import ai_pipeline
    import main
    import muril_classifier

    calls = []
    monkeypatch.setattr(ai_pipeline, "get_whisper_model", lambda cb=None: calls.append("speech") or object())
    monkeypatch.setattr(muril_classifier, "is_available", lambda: True)
    monkeypatch.setattr(muril_classifier, "warm_up", lambda: calls.append("classifier") or True)
    monkeypatch.setenv("CLASSIFIER", "muril")
    main.preload_models()
    assert calls == ["speech", "classifier"] and main.models_ready == {"speech": True, "classifier": True}

    started = []

    class FakeThread:
        def __init__(self, **kw):
            self.name = kw["name"]

        def start(self):
            started.append(self.name)

    monkeypatch.setattr(main.threading, "Thread", FakeThread)
    monkeypatch.setenv("PRELOAD_MODELS", "0")
    asyncio.run(main.start_preload())
    assert started == []
    monkeypatch.setenv("PRELOAD_MODELS", "1")
    asyncio.run(main.start_preload())
    assert started == ["preload-models"]


@pytest.mark.model
def test_valid_hindi_upload_is_transcribed_and_routed(client):
    task = post_audio(client, os.path.join(FIX, "hi_paani_tts.webm"), location="test")
    s = client.get(f"/api/status/{task}").json()
    assert s["status"] == "success", s
    r = s["ai_result"]
    assert r["transcript"] and r["transcript"] != "[Inaudible / Empty Audio]"
    assert r["asr"]["language"] == "hi"
    assert r["confidence_level"] in ("High", "Medium", "Low") and r["prediction_set"]
    assert "id" in r  # saved to the (test) database
