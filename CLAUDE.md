# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Run the server (node server.js)
```

No build step, no linter, no test suite. The app runs directly with Node.js ≥ 18.

The server defaults to port 3001 unless `PORT` env var is set. Open `http://localhost:3001` to play.

## Architecture

**Stack:** Node.js + Express + Socket.IO (backend) + Vanilla JS/HTML/CSS (frontend, served as static files from `/public`).

**No framework, no bundler, no TypeScript.** The frontend is a single `index.html` with all screens toggled via CSS visibility. Client logic lives in `game.js` as a `WordFinderGame` class.

### State model

All authoritative game state lives in server memory:
- `lobbies[code]` — lobby objects (players, board, scores, gems, turn state)
- `sessions[token]` — token → player identity mapping (for reconnection)
- `socketMap[socketId]` → token
- `wordCache` — memoized word validation results (in-memory, cleared on restart)

There is no database. Restarting the server wipes all state. Clients save a `lastLobbySnapshot` in their JS class instance to handle server restarts via the `restoreLobby` socket event.

### Request/response flow

All game actions go through Socket.IO events, not HTTP. The only HTTP routes are:
- `GET /` — serves `public/index.html`
- `GET /health` — keep-alive endpoint for Render.com

Key socket event flow: `authenticate` → `createLobby`/`joinLobby` → `startGame` → `tileSelect`/`submitWord` → (power-ups) → game over broadcast.

### Word validation

Server-side only (anti-cheat). Checks `wordCache` first, then calls Free Dictionary API for English or Turkish. 4-second timeout on API calls. Results are cached indefinitely per server session.

### Board

5×5 grid generated server-side. Contains letter tiles with point values, bonus tiles (2× letter, 3× letter, 2× word), and gem tiles. Letter distributions differ by language (`LETTERS_EN` / `LETTERS_TR` in `server.js`).

### Power-ups / Gems

Players earn gems by landing on gem tiles. Gems buy power-ups: Shuffle, Hint, Swap, Change. All power-up logic is handled server-side; client emits events like `useShuffle`, `useHint`, etc.

### Reconnection

Clients store an auth token in `localStorage`. On reconnect, the token is sent via `authenticate`. The server restores the session if found; otherwise the client sends its `lastLobbySnapshot` via `restoreLobby` to rebuild state after a server crash.

### Frontend files

| File | Purpose |
|------|---------|
| `public/index.html` | All screens (menu, lobby, game, game-over modal) |
| `public/game.js` | `WordFinderGame` class — all client logic & Socket.IO handling |
| `public/styles.css` | Dark/light themes via CSS variables and `data-theme` on `<html>` |
| `public/audio.js` | `SoundManager` — Web Audio API synthesis, no audio files |
| `public/theme.js` | Theme manager — reads `localStorage`, respects `prefers-color-scheme` |

## Deployment

Deployed on Render.com (Node.js runtime). The `/health` endpoint is pinged to prevent cold starts. Socket.IO CORS is set to `origin: '*'`.
