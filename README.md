# WordFinder — Multiplayer Word Game

A browser-based multiplayer word game. Connect letters, form words, and compete with friends! Built with Node.js, Socket.IO, and vanilla JavaScript.

## 🎮 How to Play

1. Open the game URL in your browser.
2. Enter a **nickname** on the main menu.
3. **Create a lobby** (configure players, rounds, gems) or **join** an existing one via room code.
4. Once everyone's in, the host starts the game.
5. On your turn, connect adjacent letters to form words and hit **Submit**.
6. Valid words earn points — collect gems from special tiles to use power-ups!
7. The player with the highest score after all rounds wins! 🏆

## ✨ Features

- **1–6 Players** — real-time multiplayer via WebSocket (Socket.IO)
- **Turn-based** gameplay with per-player gem pools
- **5×5 Letter Board** — used letters are replaced with new random ones
- **Bonus Tiles** — 2x/3x Letter, 2x Word (reshuffled each turn)
- **Gem & Power-up System** — Shuffle, Swap, Hint
- **Server-side word validation** via [Free Dictionary API](https://dictionaryapi.dev/)
- **Reconnection support** — close your browser and come back within 5 minutes
- **Mid-game leave** — leave anytime, host transfers automatically
- **Sound effects** with mute toggle
- **Ranking table** at game over (🥇🥈🥉)

## 📁 Project Structure

```
wordfinder/
├── server.js          # Node.js + Socket.IO server (game logic, word validation)
├── package.json       # Dependencies (express, socket.io, cors)
├── .gitignore
└── public/            # Static frontend (served by Express)
    ├── index.html     # Menu, lobby, game, and game-over screens
    ├── styles.css     # Dark theme, responsive layout, animations
    ├── game.js        # Socket.IO client, UI rendering, tile interaction
    └── audio.js       # Sound effects (Web Audio API)
```

## ⚡ Power-ups

| Power-up | Cost | Effect |
|----------|------|--------|
| 🔀 Shuffle | 💎 3 | Rearranges all letters on the board |
| 🔄 Swap | 💎 2 | Swaps the position of two tiles |
| 💡 Hint | 💎 1 | Suggests a valid word from the board |

## 🚀 Deployment

Hosted on [Render](https://render.com):

1. Push to GitHub
2. Connect repo on Render → **Web Service** → Node runtime
3. Build: `npm install` / Start: `node server.js`
4. Your game is live at `https://your-app.onrender.com`

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
- **Hosting:** Render (Web Service)

Have fun! 🎮
