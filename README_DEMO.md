# Demo setup

New to the project? Read `TEAM_GUIDE.md` first. This file is only about running the demo.

Two ways to run the demo with the MuRIL model:

- **Local (recommended):** backend and website both run on this laptop, and you open `http://localhost:5173`.
  No tunnel, no Vercel. Run: `powershell -ExecutionPolicy Bypass -File start_demo.ps1 -Local`
- **Deployed site + tunnel:** the Vercel site's requests go to this laptop through a free tunnel. This only works
  if the Vercel site was built from code that includes the `?api=` override (`frontend/src/api.js`).
  Run: `powershell -ExecutionPolicy Bypass -File start_demo.ps1`

## One-time setup (both ways)

1. **Backend environment.** Keep it outside OneDrive (it is about 1 GB, mostly torch). `start_demo.ps1` looks in
   `%USERPROFILE%\.venvs\samadhaan` first, then `backend\venv`:
   ```
   python -m venv %USERPROFILE%\.venvs\samadhaan
   %USERPROFILE%\.venvs\samadhaan\Scripts\python.exe -m pip install -r backend\requirements.txt
   %USERPROFILE%\.venvs\samadhaan\Scripts\python.exe -m pip install -r backend\requirements-muril.txt
   ```
   (Already created on this laptop.)
2. **`backend\.env`** with the database address (copy `DATABASE_URL` from the Render service's Environment tab, so accounts and the dashboard match the deployed site). `GEMINI_API_KEY` is optional; it is only used as a fallback.
3. **MuRIL weights** (the 40-epoch model) in `research\outputs\final_e40\model\`: `config.json`, `model.safetensors`, `tokenizer.json`, `tokenizer_config.json` (about 0.95 GB, not in git; ask for them). The routing settings next to it, `router_config.json`, are in git. The older 20-epoch model in `research\outputs\muril\` is only a backup and is not used.
4. **For `-Local`: Node.js** (LTS, from https://nodejs.org), then open a new terminal and check `node -v`. The first run does `npm install` by itself.
   Put your Firebase settings in `frontend\.env.local`, next to the existing `VITE_API_URL=http://localhost:8000` line:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
   `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` (and optionally `VITE_FIREBASE_MEASUREMENT_ID`).
   Copy them from the Vercel project's Environment Variables or the Firebase console. `localhost` is already an authorized Firebase domain.
5. **For the tunnel way only: cloudflared** (free, no account): install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ (for example `winget install Cloudflare.cloudflared`), then open a new terminal and check `cloudflared --version`.
6. **Warm up once while online:** run the backend and submit one complaint, because Whisper downloads its model on first use.

## Each time

Local: `powershell -ExecutionPolicy Bypass -File start_demo.ps1 -Local` starts the backend and the website and opens `http://localhost:5173`.
Submit one rehearsal complaint before the demo (the first request is slower). Press Enter in the window to stop everything.

Tunnel way: `powershell -ExecutionPolicy Bypass -File start_demo.ps1` starts the backend and the tunnel, then prints and opens
`https://samadhaan-ai.vercel.app/?api=<tunnel address>`. A yellow "Demo mode" bar confirms the site is using the laptop.
To go back to the deployed backend: open `https://samadhaan-ai.vercel.app/?api=reset`.

## If something breaks

- Logs are in `.demo-logs\` (`backend.err.log`, `tunnel.err.log`).
- Fallback: open the site without `?api=`; it uses the Render backend (Gemini only, may take about a minute to wake).

## Temporary items to remove after the mentor review

- The "Confidence details (temporary, for review)" box (`ConfidenceDebug` in `frontend/src/pages/CitizenPortal.jsx`).
- The `?api=` override (`frontend/src/api.js`). It lets anyone craft a link that sends the site's requests to a tunnel they control, so it should not stay on a public site.

## Speech-to-text settings (`backend/.env`)

| Setting | Default | Meaning |
|---|---|---|
| `WHISPER_MODEL` | `tiny` (code), `small` (laptop `.env`) | Bigger is better for Hindi but slower and larger (`medium` is about 1.5 GB). |
| `WHISPER_LANGUAGE` | `auto` | `auto` chooses between Hindi and English from Whisper's own probabilities. `hi` or `en` forces one language; forcing `hi` turns English speech into nonsense. |
| `WHISPER_LANGUAGES` | `hi,en` | The languages `auto` may choose from. |
| `WHISPER_VAD` | `1` | Skips non-speech so noise is not decoded. Set `0` to compare. |
| `WHISPER_PROMPT` | off | `civic` sends a hint of common civic words (Hindi and English) in the chosen language; other text is used as the hint. Off by default: on this project's noisy laptop recordings the hint made Whisper 8-10 times slower on 3 of 7 clips and produced repetitive text (measured with `backend/benchmark_whisper.py`). If the output is only the hint's own words, it is transcribed again without the hint. |
| `PRELOAD_MODELS` | `1` | Loads Whisper and MuRIL when the server starts (in a thread, so the server answers at once; `GET /` shows `models_ready`). `0` loads on first use, for tiny hosts. |
| `KEEP_AUDIO` | unset | `1` keeps uploaded recordings in `backend/temp_audio` (one file per upload) for evaluation. Otherwise they are deleted after processing. |

## Whisper size on this laptop (CPU, int8, 4 threads; 11 clips, hint off)

Measured with `cd backend && python benchmark_whisper.py --clips tests/fixtures temp_audio` (3 synthetic clips and 8 real recordings, 1-10 s long). Seconds are per clip, after one warm-up run.

| size | disk | load | mean | slowest | under 8 s |
|---|---|---|---|---|---|
| small | 0.49 GB | 1.5 s | 2.5 s | 10.7 s (one noisy 10 s clip) | no |
| medium | 1.53 GB | 2.8 s | 5.0 s | 6.4 s | yes |
| large-v3-turbo | 1.62 GB | 3.3 s | 6.2 s | 7.3 s | yes |

On the three clips with known text, `small` wrote "आरा है" where `medium` and `large-v3-turbo` wrote "आ रहा है". Time per clip is almost constant (Whisper always works on a 30 s window), so a longer recording costs little more. Turbo is the largest size under 8 s, with a thin margin (0.7 s): another heavy program running at the same time can push it over. Set `WHISPER_MODEL=large-v3-turbo` in `backend/.env` to use it (first start downloads 1.6 GB; check free disk first).

Tests: `cd backend && python -m pytest -q` (add `-m "not model"` to skip the Whisper tests).
Evaluation on real recordings: see the header of `research/eval_asr.py`.
Microphone settings experiment: `research/mic_ab_test.html`.
