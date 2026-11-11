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
