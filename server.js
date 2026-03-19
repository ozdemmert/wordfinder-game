// ===== WordFinder – Node.js + Socket.IO Server =====

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3001;
const RECONNECT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// ===== State =====
const lobbies = {};       // code -> lobby
const sessions = {};      // token -> session
const socketMap = {};     // socketId -> token

// ===== Letter Distribution (English Scrabble) =====
const LETTERS = {
    'E': { count: 12, points: 1 }, 'A': { count: 9, points: 1 },
    'I': { count: 9, points: 1 },  'O': { count: 8, points: 1 },
    'N': { count: 6, points: 1 },  'R': { count: 6, points: 1 },
    'T': { count: 6, points: 1 },  'L': { count: 4, points: 1 },
    'S': { count: 4, points: 1 },  'U': { count: 4, points: 1 },
    'D': { count: 4, points: 2 },  'G': { count: 3, points: 2 },
    'B': { count: 2, points: 3 },  'C': { count: 2, points: 3 },
    'M': { count: 2, points: 3 },  'P': { count: 2, points: 3 },
    'F': { count: 2, points: 4 },  'H': { count: 2, points: 4 },
    'V': { count: 2, points: 4 },  'W': { count: 2, points: 4 },
    'Y': { count: 2, points: 4 },  'K': { count: 1, points: 5 },
    'J': { count: 1, points: 8 },  'X': { count: 1, points: 8 },
    'Q': { count: 1, points: 10 }, 'Z': { count: 1, points: 10 }
};

// ===== Word Validation (Server-Side — no CORS issues) =====
const wordCache = new Map();

async function isValidWord(word) {
    if (!word || word.length < 2) return false;
    const lower = word.toLowerCase();
    if (wordCache.has(lower)) return wordCache.get(lower);
    try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${lower}`);
        const valid = res.ok;
        wordCache.set(lower, valid);
        return valid;
    } catch { return false; }
}

// ===== Helpers =====
function generateToken() { return crypto.randomUUID(); }

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (lobbies[code]) return generateRoomCode();
    return code;
}

function createLetterPool() {
    const pool = [];
    for (const [l, d] of Object.entries(LETTERS)) for (let i = 0; i < d.count; i++) pool.push(l);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool;
}

function generateBoard() {
    const board = [], pool = createLetterPool();
    const bonusPos = generateBonusPositions(), gemPos = generateGemPositions();
    for (let r = 0; r < 5; r++) { board[r] = []; for (let c = 0; c < 5; c++) {
        const idx = Math.floor(Math.random() * pool.length);
        const letter = pool.splice(idx, 1)[0];
        const key = `${r}-${c}`;
        board[r][c] = { letter, points: LETTERS[letter].points, row: r, col: c, bonus: bonusPos[key] || null, hasGem: gemPos.has(key) };
    }} return board;
}

function generateBonusPositions() {
    const b = {}, p = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) p.push(`${r}-${c}`);
    for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    b[p[0]] = 'double-letter'; b[p[1]] = 'double-letter'; b[p[2]] = 'triple-letter'; b[p[3]] = 'triple-letter'; b[p[4]] = 'double-word';
    return b;
}

function generateGemPositions() {
    const g = new Set(), p = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) p.push(`${r}-${c}`);
    for (let i = 0; i < 3; i++) g.add(p.splice(Math.floor(Math.random() * p.length), 1)[0]);
    return g;
}

function validatePath(tiles) {
    if (!tiles || tiles.length === 0) return false;
    const seen = new Set();
    for (let i = 0; i < tiles.length; i++) {
        const { row, col } = tiles[i];
        if (row < 0 || row >= 5 || col < 0 || col >= 5) return false;
        const key = `${row}-${col}`;
        if (seen.has(key)) return false;
        seen.add(key);
        if (i > 0) {
            const rd = Math.abs(row - tiles[i - 1].row), cd = Math.abs(col - tiles[i - 1].col);
            if (rd > 1 || cd > 1 || (rd === 0 && cd === 0)) return false;
        }
    }
    return true;
}

function calculateScore(board, tiles) {
    let score = 0, wm = 1;
    for (const { row, col } of tiles) {
        const t = board[row][col];
        let ls = t.points;
        if (t.bonus === 'double-letter') ls *= 2;
        else if (t.bonus === 'triple-letter') ls *= 3;
        else if (t.bonus === 'double-word') wm *= 2;
        score += ls;
    }
    score *= wm;
    if (tiles.length >= 6) score += 10;
    return score;
}

function refillUsedTiles(board, tiles) {
    const keys = Object.keys(LETTERS);
    for (const { row, col } of tiles) {
        const nl = keys[Math.floor(Math.random() * keys.length)];
        board[row][col].letter = nl;
        board[row][col].points = LETTERS[nl].points;
        board[row][col].hasGem = Math.random() < 0.1;
        board[row][col].bonus = null;
    }
}

function shuffleLetterBonuses(board) {
    const bonuses = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        const t = board[r][c];
        if (t.bonus === 'double-letter' || t.bonus === 'triple-letter') { bonuses.push(t.bonus); t.bonus = null; }
    }
    const avail = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (board[r][c].bonus !== 'double-word') avail.push({ r, c });
    for (let i = avail.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [avail[i], avail[j]] = [avail[j], avail[i]]; }
    for (let i = 0; i < bonuses.length && i < avail.length; i++) board[avail[i].r][avail[i].c].bonus = bonuses[i];
}

function addNewDoubleWordBonus(board) {
    const avail = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!board[r][c].bonus) avail.push({ r, c });
    if (avail.length > 0) { const p = avail[Math.floor(Math.random() * avail.length)]; board[p.r][p.c].bonus = 'double-word'; }
}

function shuffleBoardLetters(board) {
    const letters = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) letters.push(board[r][c].letter);
    for (let i = letters.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [letters[i], letters[j]] = [letters[j], letters[i]]; }
    let idx = 0;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        board[r][c].letter = letters[idx]; board[r][c].points = LETTERS[letters[idx]].points; idx++;
    }
}

// ===== DFS Hint (Server-Side) =====
function findAllCandidates(board) {
    const results = new Set();
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) dfsCandidates(board, r, c, '', new Set(), results);
    return [...results];
}

function dfsCandidates(board, row, col, word, visited, results) {
    const key = `${row}-${col}`;
    if (visited.has(key) || row < 0 || row >= 5 || col < 0 || col >= 5) return;
    const nw = word + board[row][col].letter;
    if (nw.length > 7 || results.size > 200) return;
    if (nw.length >= 3) results.add(nw);
    const nv = new Set(visited); nv.add(key);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        dfsCandidates(board, row + dr, col + dc, nw, nv, results);
    }
}

// ===== Build lobby payload for clients =====
function lobbyPayload(lobby) {
    return {
        code: lobby.code,
        host: lobby.host,
        hostName: lobby.hostName,
        status: lobby.status,
        settings: lobby.settings,
        players: lobby.playerOrder.map(pid => ({
            id: pid,
            name: lobby.players[pid]?.name || '?',
            score: lobby.players[pid]?.score || 0,
            gems: lobby.players[pid]?.gems || 0,
            wordsCount: lobby.players[pid]?.wordsCount || 0,
            longestWord: lobby.players[pid]?.longestWord || '',
            connected: lobby.players[pid]?.connected !== false
        })),
        playerOrder: lobby.playerOrder,
        board: lobby.board || null,
        currentPlayerIndex: lobby.currentPlayerIndex || 0,
        currentTurn: lobby.currentTurn || 0,
        totalTurns: lobby.totalTurns || 0,
        lastAction: lobby.lastAction || null
    };
}

// ===== Socket.IO =====
io.on('connection', (socket) => {
    console.log(`[+] ${socket.id} connected`);
    let sessionToken = null;
    let session = null;

    // ---------- AUTHENTICATE ----------
    socket.on('authenticate', ({ token }) => {
        if (token && sessions[token]) {
            // Reconnect
            session = sessions[token];
            sessionToken = token;
            session.socketId = socket.id;
            session.disconnectedAt = null;
            socketMap[socket.id] = token;

            if (session.lobbyCode && lobbies[session.lobbyCode]) {
                const lobby = lobbies[session.lobbyCode];
                if (lobby.players[session.playerId]) {
                    lobby.players[session.playerId].connected = true;
                }
                socket.join(session.lobbyCode);
                socket.emit('authenticated', { token, reconnected: true, playerId: session.playerId, name: session.playerName });
                socket.emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
                socket.to(session.lobbyCode).emit('toast', { message: `${session.playerName} reconnected`, type: 'info' });
                io.to(session.lobbyCode).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
            } else {
                session.lobbyCode = null;
                socket.emit('authenticated', { token, reconnected: true, playerId: session.playerId, name: session.playerName });
            }
        } else {
            // New session
            const newToken = generateToken();
            const playerId = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
            session = { playerId, playerName: '', lobbyCode: null, socketId: socket.id, disconnectedAt: null };
            sessions[newToken] = session;
            sessionToken = newToken;
            socketMap[socket.id] = newToken;
            socket.emit('authenticated', { token: newToken, reconnected: false, playerId });
        }
    });

    // ---------- CREATE LOBBY ----------
    socket.on('createLobby', ({ name, settings }) => {
        if (!session) return;
        session.playerName = name;
        const code = generateRoomCode();
        const lobby = {
            code, host: session.playerId, hostName: name, status: 'waiting',
            settings: { maxPlayers: Math.min(6, Math.max(1, settings.maxPlayers || 4)), turnsPerPlayer: Math.min(20, Math.max(1, settings.turnsPerPlayer || 5)), startingGems: Math.min(15, Math.max(0, settings.startingGems || 5)) },
            players: { [session.playerId]: { name, score: 0, gems: settings.startingGems || 5, wordsCount: 0, longestWord: '', connected: true } },
            playerOrder: [session.playerId],
            board: null, currentPlayerIndex: 0, currentTurn: 0, totalTurns: 0, lastAction: null
        };
        lobbies[code] = lobby;
        session.lobbyCode = code;
        socket.join(code);
        socket.emit('lobbyCreated', { code });
        socket.emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
    });

    // ---------- JOIN LOBBY ----------
    socket.on('joinLobby', ({ name, code }) => {
        if (!session) return;
        code = (code || '').toUpperCase();
        const lobby = lobbies[code];
        if (!lobby) { socket.emit('error', { message: 'Lobby not found!' }); return; }
        if (lobby.status !== 'waiting') { socket.emit('error', { message: 'Game already in progress!' }); return; }
        if (lobby.playerOrder.length >= lobby.settings.maxPlayers) { socket.emit('error', { message: 'Lobby is full!' }); return; }
        const names = Object.values(lobby.players).map(p => p.name.toLowerCase());
        if (names.includes(name.toLowerCase())) { socket.emit('error', { message: 'Nickname already taken!' }); return; }

        session.playerName = name;
        session.lobbyCode = code;
        lobby.players[session.playerId] = { name, score: 0, gems: lobby.settings.startingGems, wordsCount: 0, longestWord: '', connected: true };
        lobby.playerOrder.push(session.playerId);
        socket.join(code);
        io.to(code).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
        socket.to(code).emit('toast', { message: `${name} joined`, type: 'info' });
    });

    // ---------- GET LOBBIES ----------
    socket.on('getLobbies', () => {
        const list = Object.values(lobbies)
            .filter(l => l.status === 'waiting')
            .map(l => ({ code: l.code, hostName: l.hostName, playerCount: l.playerOrder.length, maxPlayers: l.settings.maxPlayers, turnsPerPlayer: l.settings.turnsPerPlayer }));
        socket.emit('lobbiesList', { lobbies: list });
    });

    // ---------- LEAVE LOBBY ----------
    socket.on('leaveLobby', () => {
        if (!session || !session.lobbyCode) return;
        removePFromLobby(session, socket);
    });

    // ---------- START GAME ----------
    socket.on('startGame', () => {
        if (!session || !session.lobbyCode) return;
        const lobby = lobbies[session.lobbyCode];
        if (!lobby || lobby.host !== session.playerId || lobby.status !== 'waiting') return;

        lobby.board = generateBoard();
        lobby.status = 'playing';
        lobby.currentPlayerIndex = 0;
        lobby.currentTurn = 0;
        lobby.totalTurns = lobby.settings.turnsPerPlayer * lobby.playerOrder.length;
        lobby.lastAction = null;

        for (const pid of lobby.playerOrder) {
            lobby.players[pid].score = 0;
            lobby.players[pid].gems = lobby.settings.startingGems;
            lobby.players[pid].wordsCount = 0;
            lobby.players[pid].longestWord = '';
        }

        io.to(session.lobbyCode).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
    });

    // ---------- SUBMIT WORD ----------
    socket.on('submitWord', async ({ tiles }) => {
        if (!session || !session.lobbyCode) return;
        const lobby = lobbies[session.lobbyCode];
        if (!lobby || lobby.status !== 'playing') return;

        const currentPid = lobby.playerOrder[lobby.currentPlayerIndex];
        if (currentPid !== session.playerId) { socket.emit('error', { message: 'Not your turn!' }); return; }
        if (!validatePath(tiles)) { socket.emit('error', { message: 'Invalid tile path!' }); return; }

        const word = tiles.map(t => lobby.board[t.row][t.col].letter).join('');
        if (word.length < 2) { socket.emit('error', { message: 'Word too short!' }); return; }

        const valid = await isValidWord(word);
        if (!valid) { socket.emit('wordResult', { valid: false, word }); return; }

        const score = calculateScore(lobby.board, tiles);
        const player = lobby.players[session.playerId];
        player.score += score;

        let usedDW = false;
        for (const { row, col } of tiles) if (lobby.board[row][col].bonus === 'double-word') usedDW = true;

        let gc = 0;
        for (const { row, col } of tiles) if (lobby.board[row][col].hasGem) { gc++; lobby.board[row][col].hasGem = false; }
        player.gems = Math.min(15, player.gems + gc);

        player.wordsCount++;
        if (word.length > player.longestWord.length) player.longestWord = word;

        refillUsedTiles(lobby.board, tiles);
        shuffleLetterBonuses(lobby.board);
        if (usedDW) addNewDoubleWordBonus(lobby.board);

        lobby.currentPlayerIndex = (lobby.currentPlayerIndex + 1) % lobby.playerOrder.length;
        lobby.currentTurn++;
        lobby.lastAction = { playerId: session.playerId, playerName: session.playerName, word, score };

        if (lobby.currentTurn >= lobby.totalTurns) lobby.status = 'finished';

        socket.emit('wordResult', { valid: true, word, score });
        io.to(session.lobbyCode).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
    });

    // ---------- SHUFFLE ----------
    socket.on('useShuffle', () => {
        if (!session || !session.lobbyCode) return;
        const lobby = lobbies[session.lobbyCode];
        if (!lobby || lobby.status !== 'playing') return;
        if (lobby.playerOrder[lobby.currentPlayerIndex] !== session.playerId) return;
        const player = lobby.players[session.playerId];
        if (player.gems < 3) { socket.emit('error', { message: 'Not enough gems!' }); return; }
        player.gems -= 3;
        shuffleBoardLetters(lobby.board);
        io.to(session.lobbyCode).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
        io.to(session.lobbyCode).emit('toast', { message: `${session.playerName} shuffled the board`, type: 'info' });
    });

    // ---------- SWAP ----------
    socket.on('useSwap', ({ tile1, tile2 }) => {
        if (!session || !session.lobbyCode) return;
        const lobby = lobbies[session.lobbyCode];
        if (!lobby || lobby.status !== 'playing') return;
        if (lobby.playerOrder[lobby.currentPlayerIndex] !== session.playerId) return;
        const player = lobby.players[session.playerId];
        if (player.gems < 2) { socket.emit('error', { message: 'Not enough gems!' }); return; }
        if (!tile1 || !tile2 || tile1.row < 0 || tile1.row >= 5 || tile2.row < 0 || tile2.row >= 5) return;

        player.gems -= 2;
        const a = lobby.board[tile1.row][tile1.col], b = lobby.board[tile2.row][tile2.col];
        const [tl, tp] = [a.letter, a.points];
        a.letter = b.letter; a.points = b.points;
        b.letter = tl; b.points = tp;
        io.to(session.lobbyCode).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
    });

    // ---------- HINT ----------
    socket.on('useHint', async () => {
        if (!session || !session.lobbyCode) return;
        const lobby = lobbies[session.lobbyCode];
        if (!lobby || lobby.status !== 'playing') return;
        if (lobby.playerOrder[lobby.currentPlayerIndex] !== session.playerId) return;
        const player = lobby.players[session.playerId];
        if (player.gems < 1) { socket.emit('error', { message: 'Not enough gems!' }); return; }

        let foundWord = null, shuffles = 0;
        while (!foundWord && shuffles <= 5) {
            const candidates = findAllCandidates(lobby.board);
            candidates.sort((a, b) => b.length - a.length);
            const top = candidates.slice(0, 15);
            const validPromises = top.map(async w => ({ word: w, valid: await isValidWord(w) }));
            const results = await Promise.allSettled(validPromises);
            for (const r of results) if (r.status === 'fulfilled' && r.value.valid) { foundWord = r.value.word; break; }
            if (!foundWord) { shuffles++; if (shuffles <= 5) shuffleBoardLetters(lobby.board); }
        }

        if (foundWord) {
            player.gems -= 1;
            io.to(session.lobbyCode).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
            socket.emit('hintResult', { word: foundWord, found: true });
        } else {
            socket.emit('hintResult', { word: null, found: false });
        }
    });

    // ---------- DISCONNECT ----------
    socket.on('disconnect', () => {
        console.log(`[-] ${socket.id} disconnected`);
        const token = socketMap[socket.id];
        delete socketMap[socket.id];
        if (!token || !sessions[token]) return;

        const sess = sessions[token];
        sess.socketId = null;
        sess.disconnectedAt = Date.now();

        if (sess.lobbyCode && lobbies[sess.lobbyCode]) {
            const lobby = lobbies[sess.lobbyCode];
            if (lobby.players[sess.playerId]) lobby.players[sess.playerId].connected = false;
            io.to(sess.lobbyCode).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
            io.to(sess.lobbyCode).emit('toast', { message: `${sess.playerName} disconnected`, type: 'error' });
        }

        // Auto-remove after timeout
        setTimeout(() => {
            if (sess.disconnectedAt && Date.now() - sess.disconnectedAt >= RECONNECT_TIMEOUT) {
                if (sess.lobbyCode && lobbies[sess.lobbyCode]) {
                    removePFromLobbyByPid(sess.playerId, sess.lobbyCode);
                }
                delete sessions[token];
            }
        }, RECONNECT_TIMEOUT + 1000);
    });
});

// ===== Remove player from lobby =====
function removePFromLobby(sess, socket) {
    const code = sess.lobbyCode;
    const lobby = lobbies[code];
    if (!lobby) { sess.lobbyCode = null; return; }

    socket.leave(code);
    delete lobby.players[sess.playerId];
    lobby.playerOrder = lobby.playerOrder.filter(id => id !== sess.playerId);
    sess.lobbyCode = null;

    if (lobby.playerOrder.length === 0) {
        delete lobbies[code];
    } else {
        if (lobby.host === sess.playerId) {
            lobby.host = lobby.playerOrder[0];
            lobby.hostName = lobby.players[lobby.playerOrder[0]]?.name || '?';
        }
        io.to(code).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
    }
}

function removePFromLobbyByPid(playerId, code) {
    const lobby = lobbies[code];
    if (!lobby) return;
    delete lobby.players[playerId];
    lobby.playerOrder = lobby.playerOrder.filter(id => id !== playerId);
    if (lobby.playerOrder.length === 0) {
        delete lobbies[code];
    } else {
        if (lobby.host === playerId) {
            lobby.host = lobby.playerOrder[0];
            lobby.hostName = lobby.players[lobby.playerOrder[0]]?.name || '?';
        }
        io.to(code).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
    }
}

// ===== Health Check =====
app.get('/health', (req, res) => {
    res.json({ status: 'ok', lobbies: Object.keys(lobbies).length, sessions: Object.keys(sessions).length });
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`🎮 WordFinder server running on port ${PORT}`);
});
