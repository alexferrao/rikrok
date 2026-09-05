# Changelog

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
