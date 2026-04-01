# WordFinder — Multiplayer Word Game

A browser-based multiplayer word game. Connect letters, form words, and compete with friends! Built with Node.js, Express, Socket.IO, and vanilla JavaScript.

## 🎮 How to Play

1. Open the game URL in your browser.
2. Enter a **nickname** on the main menu.
3. **Create a lobby** (configure players, rounds, starting gems, and turn timer) or **join** an existing one via room code.
4. Once everyone's in, the host starts the game.
5. On your turn, connect adjacent letters to form words and hit **Submit** before the time runs out.
6. Valid words earn points — collect gems from special tiles to use power-ups!
7. The player with the highest score after all rounds wins! 🏆

## ✨ Features
- **Turkish Language Support** — Added Turkish language support with Turkish word validation
- **1–10 Players** — real-time multiplayer via WebSocket (Socket.IO)
- **Turn-based gameplay** with per-player gem pools and a customizable **Turn Timer**
- **Power-up System** — Shuffle, Hint, Swap, and Change tile
- **Robust State Management**:
  - **Reconnection support** — close your browser and come back within 5 minutes without losing state
  - **Mid-game leave** — leave anytime; the host transfers automatically, and rounds adapt seamlessly
- **Sound effects** with mute toggle

## ⚡ Power-ups

| Power-up   | Cost | Effect                                                                 |
| ---------- | ---- | ---------------------------------------------------------------------- |
| 🔀 Shuffle | 💎 1 | Rearranges all letters on the board                                    |
| 💡 Hint    | 💎 2 | Suggests a valid 2-letter word from the board (shuffles if none found) |
| 🔄 Swap    | 💎 3 | Swaps the position of two tiles                                        |
| 💱 Change  | 💎 4 | Replaces a specific tile's letter with a new one                       |

## 📁 Project Structure

```text
wordfinder/
├── server.js          # Node.js + Socket.IO server (game logic, state, API validation)
├── package.json       # Dependencies (express, socket.io, cors)
├── .gitignore
└── public/            # Static frontend (served by Express)
    ├── index.html     # Menu, lobby, game, and game-over screens
    ├── styles.css     # Dark theme, responsive layout, animations
    ├── game.js        # Socket.IO client, UI rendering, tile interaction
    └── audio.js       # Sound effects (Web Audio API)
```

## 🚀 Deployment

Hosted on [Render](https://render.com):

1. Push to GitHub
2. Connect repo on Render → **Web Service** → Node runtime
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. Your game is live!

## 🛠️ Local Development

```bash
npm install
node server.js
```

Open `http://localhost:3001` in your browser.

## 📝 Tech Stack

- **Backend:** Node.js, Express, Socket.IO
- **Frontend:** Vanilla HTML/CSS/JS, Socket.IO Client
- **Word Validation:** [Free Dictionary API](https://dictionaryapi.dev/)

Have fun! 🎮
