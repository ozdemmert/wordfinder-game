const { generateBoard, validatePath, calculateScore, refillUsedTiles, respawnBonuses, shuffleBoardLetters, findTwoLetterPairs } = require('./board');
const { isValidWord, wordCache } = require('./words');
const { generateToken, generateRoomCode, lobbyPayload, awardPeriodicGems, advanceTurn, removePlayerFromGame } = require('./lobby');

const RECONNECT_TIMEOUT = 5 * 60 * 1000;
const turnTimers = {};

function startTurnTimer(lobby, io, persist, remainingMs) {
    clearTurnTimer(lobby.code);
    if (!lobby.settings.turnTime || lobby.settings.turnTime <= 0) return;
    const ms = remainingMs || lobby.settings.turnTime * 1000;
    lobby.turnDeadline = Date.now() + ms;
    turnTimers[lobby.code] = setTimeout(() => {
        try {
            if (!lobby || lobby.status !== 'playing') return;
            advanceTurn(lobby);
            if (lobby.currentTurn >= lobby.totalTurns) {
                lobby.status = 'finished';
                clearTurnTimer(lobby.code);
            }
            awardPeriodicGems(lobby);
            if (lobby.status === 'playing') startTurnTimer(lobby, io, persist);
            persist.lobby(lobby.code);
            io.to(lobby.code).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
            io.to(lobby.code).emit('toast', { message: 'Time\'s up! Turn skipped.', type: 'error' });
        } catch (err) {
            console.error('[ERROR] Turn timer callback:', err.message);
        }
    }, ms);
}

function clearTurnTimer(code) {
    if (turnTimers[code]) {
        clearTimeout(turnTimers[code]);
        delete turnTimers[code];
    }
}

// Returns the lobby + validates it's the player's turn. Returns null if invalid.
function getActiveLobby(lobbies, session) {
    if (!session || !session.lobbyCode) return null;
    const lobby = lobbies[session.lobbyCode];
    if (!lobby || lobby.status !== 'playing') return null;
    return lobby;
}

function requireTurn(lobby, session) {
    return lobby.playerOrder[lobby.currentPlayerIndex] === session.playerId;
}

function removePFromLobby(lobbies, sess, socket, io, persist, token) {
    const code = sess.lobbyCode;
    const lobby = lobbies[code];
    if (!lobby) { sess.lobbyCode = null; return; }

    const playerName = sess.playerName;
    socket.leave(code);
    const result = removePlayerFromGame(lobby, sess.playerId);
    sess.lobbyCode = null;
    if (token) persist.session(token);

    if (result === 'delete') {
        delete lobbies[code];
    } else {
        io.to(code).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
        io.to(code).emit('toast', { message: `${playerName} left the game`, type: 'error' });
    }
    persist.lobby(code);
    io.emit('lobbiesChanged');
}

function removePFromLobbyByPid(lobbies, playerId, code, io, persist) {
    const lobby = lobbies[code];
    if (!lobby) return;
    const result = removePlayerFromGame(lobby, playerId);
    if (result === 'delete') {
        delete lobbies[code];
    } else {
        io.to(code).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
    }
    persist.lobby(code);
    io.emit('lobbiesChanged');
}

module.exports = function registerHandlers(io, lobbies, sessions, socketMap, persist) {
    io.on('connection', (socket) => {
        console.log(`[+] ${socket.id} connected`);
        let sessionToken = null;
        let session = null;

        // Socket-level rate limiting
        let msgCount = 0;
        const msgResetInterval = setInterval(() => { msgCount = 0; }, 10000);
        socket.use((packet, next) => {
            if (++msgCount > 60) { socket.disconnect(true); return; }
            next();
        });
        socket.on('disconnect', () => clearInterval(msgResetInterval));

        // ---------- AUTHENTICATE ----------
        socket.on('authenticate', ({ token }) => {
            if (token && sessions[token]) {
                session = sessions[token];
                sessionToken = token;
                session.socketId = socket.id;
                session.disconnectedAt = null;
                socketMap[socket.id] = token;
                persist.session(token);

                if (session.lobbyCode && lobbies[session.lobbyCode]) {
                    const lobby = lobbies[session.lobbyCode];
                    if (lobby.players[session.playerId]) {
                        lobby.players[session.playerId].connected = true;
                    }
                    socket.join(session.lobbyCode);
                    socket.emit('authenticated', { token, reconnected: true, playerId: session.playerId, name: session.playerName });
                    socket.to(session.lobbyCode).emit('toast', { message: `${session.playerName} reconnected`, type: 'info' });
                    io.to(session.lobbyCode).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
                    persist.lobby(lobby.code);
                } else {
                    session.lobbyCode = null;
                    socket.emit('authenticated', { token, reconnected: true, playerId: session.playerId, name: session.playerName });
                    persist.session(token);
                }
            } else {
                const newToken = generateToken();
                const playerId = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
                session = { playerId, playerName: '', lobbyCode: null, socketId: socket.id, disconnectedAt: null };
                sessions[newToken] = session;
                sessionToken = newToken;
                socketMap[socket.id] = newToken;
                persist.session(newToken);
                socket.emit('authenticated', { token: newToken, reconnected: false, playerId, serverRestarted: !!token });
            }
        });

        // ---------- RESTORE LOBBY ----------
        socket.on('restoreLobby', ({ lobbySnapshot: snap, oldPlayerId, playerName }) => {
            if (!session) return;
            try {
                if (!snap || !snap.code || !snap.board || !snap.players || !snap.playerOrder) return;
                session.playerName = playerName;

                if (lobbies[snap.code]) {
                    const lobby = lobbies[snap.code];
                    const existingPid = snap.playerOrder.find(pid =>
                        lobby.players[pid] && lobby.players[pid].name === playerName
                    );
                    if (existingPid) {
                        session.playerId = existingPid;
                        session.lobbyCode = snap.code;
                        lobby.players[existingPid].connected = true;
                        socket.join(snap.code);
                        socket.emit('authenticated', { token: sessionToken, reconnected: true, playerId: existingPid, name: playerName });
                        persist.lobby(snap.code);
                        persist.session(sessionToken);
                        io.to(snap.code).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
                        io.to(snap.code).emit('toast', { message: `${playerName} reconnected`, type: 'info' });
                        console.log(`[RESTORE] Player ${playerName} rejoined restored lobby ${snap.code}`);
                    }
                    return;
                }

                const restoredPlayers = {};
                for (const pid of snap.playerOrder) {
                    const p = snap.players.find(sp => sp.id === pid);
                    if (p) {
                        restoredPlayers[pid] = {
                            name: p.name, score: p.score || 0, gems: p.gems || 0,
                            wordsCount: p.wordsCount || 0, longestWord: p.longestWord || '',
                            connected: (pid === oldPlayerId)
                        };
                    }
                }

                const lobby = {
                    code: snap.code,
                    host: snap.playerOrder[0],
                    hostName: restoredPlayers[snap.playerOrder[0]]?.name || '?',
                    status: snap.status || 'playing',
                    settings: snap.settings || { maxPlayers: 4, turnsPerPlayer: 5, startingGems: 5, turnTime: 0, language: 'en' },
                    players: restoredPlayers,
                    playerOrder: snap.playerOrder,
                    board: snap.board,
                    currentPlayerIndex: snap.currentPlayerIndex || 0,
                    currentTurn: snap.currentTurn || 0,
                    totalTurns: snap.totalTurns || 0,
                    lastAction: null, lastActionId: 0, turnDeadline: null
                };

                lobbies[snap.code] = lobby;
                session.playerId = oldPlayerId;
                session.lobbyCode = snap.code;
                lobby.players[oldPlayerId].connected = true;
                if (lobby.host === oldPlayerId) lobby.hostName = playerName;

                socket.join(snap.code);
                socket.emit('authenticated', { token: sessionToken, reconnected: true, playerId: oldPlayerId, name: playerName });
                if (lobby.status === 'playing') startTurnTimer(lobby, io, persist);

                persist.lobby(snap.code);
                persist.session(sessionToken);
                io.to(snap.code).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
                console.log(`[RESTORE] Lobby ${snap.code} restored by ${playerName} with ${snap.playerOrder.length} players`);
            } catch (err) {
                console.error('[ERROR] restoreLobby:', err.message);
            }
        });

        // ---------- CREATE LOBBY ----------
        socket.on('createLobby', ({ name, settings }) => {
            if (!session) return;
            session.playerName = name;
            const code = generateRoomCode(lobbies);
            const turnTime = Math.min(120, Math.max(0, settings.turnTime || 0));
            const language = settings.language === 'tr' ? 'tr' : 'en';
            const lobby = {
                code, host: session.playerId, hostName: name, status: 'waiting',
                settings: {
                    maxPlayers: Math.min(6, Math.max(1, settings.maxPlayers || 4)),
                    turnsPerPlayer: Math.min(20, Math.max(1, settings.turnsPerPlayer || 5)),
                    startingGems: Math.min(15, Math.max(0, settings.startingGems || 5)),
                    turnTime, language
                },
                players: { [session.playerId]: { name, score: 0, gems: settings.startingGems || 5, wordsCount: 0, longestWord: '', connected: true } },
                playerOrder: [session.playerId],
                board: null, currentPlayerIndex: 0, currentTurn: 0, totalTurns: 0,
                lastAction: null, lastActionId: 0, turnDeadline: null
            };
            lobbies[code] = lobby;
            session.lobbyCode = code;
            socket.join(code);
            persist.lobby(code);
            persist.session(sessionToken);
            socket.emit('lobbyCreated', { code });
            socket.emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
            io.emit('lobbiesChanged');
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
            persist.lobby(code);
            persist.session(sessionToken);
            io.to(code).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
            socket.to(code).emit('toast', { message: `${name} joined`, type: 'info' });
            io.emit('lobbiesChanged');
        });

        // ---------- GET LOBBIES ----------
        socket.on('getLobbies', () => {
            const list = Object.values(lobbies)
                .filter(l => l.status === 'waiting')
                .map(l => ({
                    code: l.code, hostName: l.hostName,
                    playerCount: l.playerOrder.length, maxPlayers: l.settings.maxPlayers,
                    turnsPerPlayer: l.settings.turnsPerPlayer, language: l.settings.language
                }));
            socket.emit('lobbiesList', { lobbies: list });
        });

        // ---------- LEAVE ----------
        socket.on('leaveLobby', () => {
            if (!session || !session.lobbyCode) return;
            removePFromLobby(lobbies, session, socket, io, persist, sessionToken);
        });
        socket.on('leaveGame', () => {
            if (!session || !session.lobbyCode) return;
            removePFromLobby(lobbies, session, socket, io, persist, sessionToken);
        });

        // ---------- START GAME ----------
        socket.on('startGame', () => {
            if (!session || !session.lobbyCode) return;
            const lobby = lobbies[session.lobbyCode];
            if (!lobby || lobby.host !== session.playerId || lobby.status !== 'waiting') return;

            lobby.board = generateBoard(lobby.settings.language);
            lobby.status = 'playing';
            lobby.currentPlayerIndex = 0;
            lobby.currentTurn = 0;
            lobby.totalTurns = lobby.settings.turnsPerPlayer * lobby.playerOrder.length;
            lobby.lastAction = null;
            lobby.lastActionId = 0;

            for (const pid of lobby.playerOrder) {
                const p = lobby.players[pid];
                p.score = 0;
                p.gems = lobby.settings.startingGems;
                p.wordsCount = 0;
                p.longestWord = '';
            }

            startTurnTimer(lobby, io, persist);
            persist.lobby(session.lobbyCode);
            io.to(session.lobbyCode).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
            io.emit('lobbiesChanged');
        });

        // ---------- TILE SELECTION ----------
        socket.on('tileSelect', ({ tiles }) => {
            if (!session || !session.lobbyCode) return;
            socket.to(session.lobbyCode).emit('opponentSelection', {
                playerId: session.playerId, playerName: session.playerName, tiles: tiles || []
            });
        });

        // ---------- SUBMIT WORD ----------
        socket.on('submitWord', async ({ tiles }) => {
            const lobby = getActiveLobby(lobbies, session);
            if (!lobby) return;
            if (!requireTurn(lobby, session)) { socket.emit('error', { message: 'Not your turn!' }); return; }
            if (!validatePath(tiles)) { socket.emit('error', { message: 'Invalid tile path!' }); return; }

            const word = tiles.map(t => lobby.board[t.row][t.col].letter).join('');
            if (word.length < 2) { socket.emit('error', { message: 'Word too short!' }); return; }

            const lang = lobby.settings.language || 'en';
            const valid = await isValidWord(word, lang);
            if (!valid) { socket.emit('wordResult', { valid: false, word }); return; }

            clearTurnTimer(session.lobbyCode);

            const score = calculateScore(lobby.board, tiles);
            const player = lobby.players[session.playerId];
            player.score += score;

            // Collect consumed bonuses for respawn
            const usedBonuses = [];
            for (const { row, col } of tiles) {
                const bonus = lobby.board[row][col].bonus;
                if (bonus) usedBonuses.push(bonus);
            }

            // Collect gems
            let gemCount = 0;
            for (const { row, col } of tiles) {
                if (lobby.board[row][col].hasGem) {
                    gemCount++;
                    lobby.board[row][col].hasGem = false;
                }
            }
            player.gems = Math.min(15, player.gems + gemCount);

            player.wordsCount++;
            if (word.length > player.longestWord.length) player.longestWord = word;

            refillUsedTiles(lobby.board, tiles, lang);
            respawnBonuses(lobby.board, usedBonuses, gemCount);

            lobby.currentPlayerIndex = (lobby.currentPlayerIndex + 1) % lobby.playerOrder.length;
            lobby.currentTurn++;
            lobby.lastActionId = (lobby.lastActionId || 0) + 1;
            lobby.lastAction = { playerId: session.playerId, playerName: session.playerName, word, score };

            awardPeriodicGems(lobby);

            if (lobby.currentTurn >= lobby.totalTurns) {
                lobby.status = 'finished';
                clearTurnTimer(session.lobbyCode);
            } else {
                startTurnTimer(lobby, io, persist);
            }

            persist.lobby(session.lobbyCode);
            socket.emit('wordResult', { valid: true, word, score });
            io.to(session.lobbyCode).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
        });

        // ---------- POWER-UPS ----------
        socket.on('useShuffle', () => {
            const lobby = getActiveLobby(lobbies, session);
            if (!lobby || !requireTurn(lobby, session)) return;
            const player = lobby.players[session.playerId];
            if (player.gems < 1) { socket.emit('error', { message: 'Not enough gems!' }); return; }
            player.gems -= 1;
            shuffleBoardLetters(lobby.board, lobby.settings.language);
            persist.lobby(session.lobbyCode);
            io.to(session.lobbyCode).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
            io.to(session.lobbyCode).emit('toast', { message: `${session.playerName} shuffled the board`, type: 'info' });
        });

        socket.on('useSwap', ({ tile1, tile2 }) => {
            const lobby = getActiveLobby(lobbies, session);
            if (!lobby || !requireTurn(lobby, session)) return;
            const player = lobby.players[session.playerId];
            if (player.gems < 3) { socket.emit('error', { message: 'Not enough gems!' }); return; }
            if (!tile1 || !tile2 || tile1.row < 0 || tile1.row >= 5 || tile2.row < 0 || tile2.row >= 5) return;
            player.gems -= 3;
            const a = lobby.board[tile1.row][tile1.col], b = lobby.board[tile2.row][tile2.col];
            [a.letter, a.points, b.letter, b.points] = [b.letter, b.points, a.letter, a.points];
            persist.lobby(session.lobbyCode);
            io.to(session.lobbyCode).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
        });

        socket.on('useChange', ({ row, col, newLetter }) => {
            const lobby = getActiveLobby(lobbies, session);
            if (!lobby || !requireTurn(lobby, session)) return;
            const player = lobby.players[session.playerId];
            if (player.gems < 4) { socket.emit('error', { message: 'Not enough gems!' }); return; }
            if (row < 0 || row >= 5 || col < 0 || col >= 5) return;
            const { getLetters } = require('./letters');
            const letter = (newLetter || '').toUpperCase();
            const letterTable = getLetters(lobby.settings.language);
            if (!letterTable[letter]) return;
            player.gems -= 4;
            lobby.board[row][col].letter = letter;
            lobby.board[row][col].points = letterTable[letter].points;
            persist.lobby(session.lobbyCode);
            io.to(session.lobbyCode).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
            io.to(session.lobbyCode).emit('toast', { message: `${session.playerName} changed a tile`, type: 'info' });
        });

        socket.on('useHint', async () => {
            const lobby = getActiveLobby(lobbies, session);
            if (!lobby || !requireTurn(lobby, session)) return;
            const player = lobby.players[session.playerId];
            if (player.gems < 2) { socket.emit('error', { message: 'Not enough gems!' }); return; }

            let foundWord = null;
            const lang = lobby.settings.language || 'en';

            for (let attempt = 0; attempt <= 5; attempt++) {
                const pairs = findTwoLetterPairs(lobby.board);
                for (const w of pairs) {
                    const lowerW = lang === 'tr' ? w.toLocaleLowerCase('tr-TR') : w.toLowerCase();
                    if (wordCache.get(`${lang}:${lowerW}`)) { foundWord = w; break; }
                }
                if (foundWord) break;
                for (const w of pairs) {
                    const lowerW = lang === 'tr' ? w.toLocaleLowerCase('tr-TR') : w.toLowerCase();
                    if (wordCache.has(`${lang}:${lowerW}`)) continue;
                    if (await isValidWord(w, lang)) { foundWord = w; break; }
                }
                if (foundWord) break;
                shuffleBoardLetters(lobby.board, lang);
            }

            if (foundWord) {
                player.gems -= 2;
                persist.lobby(session.lobbyCode);
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
            persist.session(token);

            if (sess.lobbyCode && lobbies[sess.lobbyCode]) {
                const lobby = lobbies[sess.lobbyCode];
                if (lobby.players[sess.playerId]) lobby.players[sess.playerId].connected = false;
                persist.lobby(sess.lobbyCode);
                io.to(sess.lobbyCode).emit('lobbyUpdate', { lobby: lobbyPayload(lobby) });
                io.to(sess.lobbyCode).emit('toast', { message: `${sess.playerName} disconnected`, type: 'error' });
            }

            setTimeout(() => {
                if (sess.disconnectedAt && Date.now() - sess.disconnectedAt >= RECONNECT_TIMEOUT) {
                    if (sess.lobbyCode && lobbies[sess.lobbyCode]) {
                        removePFromLobbyByPid(lobbies, sess.playerId, sess.lobbyCode, io, persist);
                    }
                    delete sessions[token];
                    persist.session(token);
                }
            }, RECONNECT_TIMEOUT + 1000);
        });
    });

    return { startTurnTimer, clearTurnTimer };
};
