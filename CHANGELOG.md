# Changelog

## 0.5.0

- Claude writes it: `RIKROK_SCRIPT=claude` (the default when no local model is set and the CLI is installed) asks Claude Code headlessly to write each recap on your subscription. No local model needed.
- `rikrok hook install`: a Claude Code SessionEnd hook that builds the reel in the background when you leave a session with real work in it. `rikrok recap --transcript` is what it runs.
- `rikrok setup` now starts with "Claude or local?" and offers the hook.
- README reorganised around the three ways to run it.

## 0.4.0

- `rikrok voice serve`: installs and runs a local Qwen3-TTS cloning server (MLX on Apple Silicon, PyTorch elsewhere) in its own uv environment and points Rik Rok at it. `--fast` for the 0.6B model. `rikrok install` adds it as a login agent when in use. New and lightly tested: please report what breaks.
- `RIKROK_CLONE_API=voice-clone` for servers with a dedicated clone endpoint.

## 0.3.0

- Your own voice: `rikrok voice setup` records a 22-second clip (or takes one you have), stores it with its transcript, and switches narration to `clone`. Zero-shot, no training, nothing uploaded. Works with any speech server that accepts a reference clip on `/v1/audio/speech` (oMLX with Qwen3-TTS today).
- `rikrok setup`: guided path for first run. Finds Ollama, LM Studio or oMLX (or installs Ollama), picks a model, records your voice, renders the demo, offers the login install.
- `rikrok voice test` and `rikrok voice devices`.

## 0.2.0

- "How it moves" beat: when a session built or changed a flow (a tap reaching an API, data written somewhere, a job firing), the script returns nodes and edges and the reel animates them. `RIKROK_FLOW=off` to drop it.
- Continuity: the script sees the previous recap's next step for the same session or project and says whether it happened.
- The mark: an eighth rest as the back of a Baskerville Bold Italic R, cyan and red offset. Reels no longer use the offset effect.
- Spoken-form URLs in on-screen text are written back as URLs.
- `RIKROK_BROWSER` to point at your own Chrome.

## 0.1.0

First public release.

- Watcher recaps Claude Code sessions that go idle with meaningful work.
- Scripts from any OpenAI-compatible local LLM, with a template fallback so a reel always ships.
- Voices: macOS `say`, any OpenAI-compatible speech server, your own module, or silent captions.
- Remotion render, 1080x1920 H.264, Rik Rok look (black canvas, cyan and red offset).
- Swipe feed PWA with watched, archive and comments; comments can call a hook command.
- `rikrok doctor`, `demo`, `backfill`, `install` (launchd).
