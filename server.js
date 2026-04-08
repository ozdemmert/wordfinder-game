const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const { loadState, persistLobby, persistSession, persistWordCache } = require('./src/redis');
const { wordCache, setWordCachePersist } = require('./src/words');
const { advanceTurn } = require('./src/lobby');
const registerHandlers = require('./src/handlers');

// ===== Express + Socket.IO =====
const app = express();
app.use(cors());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true }));
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    pingInterval: 15000,
    pingTimeout: 10000
});

const PORT = process.env.PORT || 3001;

// ===== Crash Protection =====
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled Rejection:', reason);
});

// ===== State =====
const lobbies = {};
const sessions = {};
const socketMap = {};

// ===== Persistence wrappers (bind state objects) =====
const persist = {
    lobby: (code) => persistLobby(lobbies, code),
    session: (token) => persistSession(sessions, token),
};
setWordCachePersist(persistWordCache);

// ===== Register Socket.IO handlers =====
const { startTurnTimer, clearTurnTimer } = registerHandlers(io, lobbies, sessions, socketMap, persist);

// ===== HTTP routes =====
app.get('/health', (req, res) => {
    const activeSessions = Object.values(sessions).filter(s => s.socketId).length;
    const activeGames = Object.values(lobbies).filter(l => l.status === 'playing').length;
    const waitingLobbies = Object.values(lobbies).filter(l => l.status === 'waiting').length;
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        lobbies: { total: Object.keys(lobbies).length, playing: activeGames, waiting: waitingLobbies },
        sessions: { total: Object.keys(sessions).length, online: activeSessions },
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== Lobby cleanup (every 10 minutes) =====
setInterval(() => {
    const now = Date.now();
    for (const [code, lobby] of Object.entries(lobbies)) {
        const allDisconnected = lobby.playerOrder.every(pid => !lobby.players[pid]?.connected);
        const isStale = (lobby.status === 'finished') || (lobby.status === 'waiting' && allDisconnected);
        if (isStale) {
            if (!lobby._staleAt) { lobby._staleAt = now; continue; }
            if (now - lobby._staleAt > 30 * 60 * 1000) {
                console.log(`[CLEANUP] Removing stale lobby ${code} (status: ${lobby.status})`);
                delete lobbies[code];
                persist.lobby(code);
            }
        } else {
            lobby._staleAt = null;
        }
    }
}, 10 * 60 * 1000);

// ===== Start =====
loadState(lobbies, sessions, wordCache).then(() => {
    // Reconstruct turn timers for playing lobbies
    for (const lobby of Object.values(lobbies)) {
        if (lobby.status === 'playing' && lobby.turnDeadline) {
            const remaining = lobby.turnDeadline - Date.now();
            if (remaining > 0) {
                startTurnTimer(lobby, io, persist, remaining);
            } else {
                advanceTurn(lobby);
                if (lobby.currentTurn >= lobby.totalTurns) {
                    lobby.status = 'finished';
                } else {
                    startTurnTimer(lobby, io, persist);
                }
                persist.lobby(lobby.code);
            }
        }
    }
    server.listen(PORT, () => {
        console.log(`🎮 WordFinder server running on port ${PORT}`);
    });
}).catch(() => {
    server.listen(PORT, () => {
        console.log(`🎮 WordFinder server running on port ${PORT} (no Redis)`);
    });
});

setInterval(() => {
    console.log(`[HEARTBEAT] ${new Date().toISOString()} | Lobbies: ${Object.keys(lobbies).length} | Sessions: ${Object.keys(sessions).length}`);
}, 5 * 60 * 1000);
