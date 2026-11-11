# Demo setup

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
3. **MuRIL weights** in `research\outputs\muril\model\` (already there if you unzipped `model.zip`).
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
| `WHISPER_PROMPT` | empty | Optional vocabulary hint. Off by default: on hard audio Whisper repeats the hint words instead of what was said. |
| `KEEP_AUDIO` | unset | `1` keeps uploaded recordings in `backend/temp_audio` (one file per upload) for evaluation. Otherwise they are deleted after processing. |

Tests: `cd backend && python -m pytest -q` (add `-m "not model"` to skip the Whisper tests).
Evaluation on real recordings: see the header of `research/eval_asr.py`.
Microphone settings experiment: `research/mic_ab_test.html`.
