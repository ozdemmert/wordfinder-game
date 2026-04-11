# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                  # Run the server directly (node server.js)
docker compose up --build  # Run via Docker (app + Redis + Caddy)
```

No build step, no linter, no test suite. The app runs directly with Node.js ≥ 18.

The server defaults to port 3001 unless `PORT` env var is set. Open `http://localhost:3001` to play locally.

## Architecture

**Stack:** Node.js + Express + Socket.IO (backend) + Vanilla JS/HTML/CSS (frontend, served as static files from `/public`).

**No framework, no bundler, no TypeScript.** The frontend is a single `index.html` with all screens toggled via CSS visibility. Client logic lives in `game.js` as a `WordFinderGame` class.

### Source modules (`src/`)

Server logic is split into focused modules:

| File | Responsibility |
|------|---------------|
| `src/letters.js` | Letter distributions (EN/TR), weighted random letter picker |
| `src/board.js` | Board generation, path validation, scoring, tile mutations (refill, respawn, shuffle) |
| `src/words.js` | Word validation, dictionary API calls, in-memory + Redis word cache |
| `src/lobby.js` | Lobby payload builder, player removal, gem awards, turn advance |
| `src/redis.js` | Redis connection, persist helpers (`persistLobby`, `persistSession`, `persistWordCache`), state loader |
| `src/handlers.js` | All Socket.IO event handlers, turn timer logic |
| `server.js` | Entry point — Express setup, rate limiting, HTTP routes, startup, cleanup interval |

### State model

In-memory state (also persisted to Redis on every mutation):
- `lobbies[code]` — lobby objects (players, board, scores, gems, turn state)
- `sessions[token]` — token → player identity mapping (for reconnection)
- `socketMap[socketId]` → token
- `wordCache` — memoized word validation results

On startup, `loadState()` in `src/redis.js` restores all state from Redis and reconstructs turn timers. Games survive server restarts. Without Redis, the server falls back to in-memory only.

### Request/response flow

All game actions go through Socket.IO events, not HTTP. HTTP routes:
- `GET /health` — returns status, lobby/session counts, memory usage
- `GET *` — serves `public/index.html`

Key socket event flow: `authenticate` → `createLobby`/`joinLobby` → `startGame` → `tileSelect`/`submitWord` → (power-ups) → game over broadcast.

### Word validation

Server-side only (anti-cheat). Checks `wordCache` first, then calls Free Dictionary API for English or Turkish. 4-second timeout on API calls. Results cached in memory and persisted to Redis.

### Board

5×5 grid generated server-side (`src/board.js`). Contains letter tiles with point values, bonus tiles (2× letter, 3× letter, 2× word), and gem tiles. Letter distributions differ by language (`LETTERS_EN` / `LETTERS_TR` in `src/letters.js`).

### Power-ups / Gems

Players earn gems by landing on gem tiles. Gems buy power-ups: Shuffle (1 gem), Hint (2 gems), Swap (3 gems), Change (4 gems). All power-up logic is handled server-side in `src/handlers.js`.

### Reconnection

Clients store an auth token in `localStorage` (`wf_token`). On reconnect, token is sent via `authenticate`. Server restores session from Redis if found. If server restarted without Redis, client sends `lastLobbySnapshot` via `restoreLobby` to rebuild state from client-side snapshot.

### Rate limiting

- HTTP: `express-rate-limit` — 200 requests per 15 minutes
- Socket.IO: per-socket counter — disconnects sockets sending >60 events per 10 seconds

### Analytics

Google Analytics GA4 is set up in `public/index.html`. Custom events tracked in `public/game.js` via `trackEvent()`:
- `lobby_created`, `game_start`, `game_finish`
- `word_submitted` (word length, score), `word_invalid`
- `powerup_used` (type: shuffle/hint/swap/change)

### Frontend files

| File | Purpose |
|------|---------|
| `public/index.html` | All screens (menu, lobby, game, game-over modal) + GA4 script |
| `public/game.js` | `WordFinderGame` class — all client logic & Socket.IO handling |
| `public/styles.css` | Dark/light themes via CSS variables and `data-theme` on `<html>` |
| `public/audio.js` | `SoundManager` — Web Audio API synthesis, no audio files |
| `public/theme.js` | Theme manager — reads `localStorage`, respects `prefers-color-scheme` |

### Responsive layout

Breakpoint: `768px`. Above → 3-panel horizontal layout (left: scores/word, center: board, right: power-ups). Below → single-column vertical layout.

**Important:** `.word-display` uses `width: 100%` on desktop and `width: 320px` on mobile (`@media (max-width: 768px)`). This fixed mobile width is intentional — using a percentage value on mobile causes the container to shrink when the placeholder text ("Select word...") is replaced by a shorter selected word, which cascades and shifts the entire layout.

## Deployment

Deployed on GCP e2-micro VM (us-central1-a) via Docker Compose. Three containers: `app` (Node.js), `redis` (Redis 7, 128 MB max), `caddy` (reverse proxy + auto SSL via Let's Encrypt).

```bash
# On the VM — deploy new changes
cd ~/wordfinder-game
git pull
docker compose up -d --build
```

Environment variables used by the server:
- `PORT` — defaults to `3001`
- `REDIS_HOST` — defaults to `127.0.0.1` (use `redis` inside Docker)
- `REDIS_PORT` — defaults to `6379`
