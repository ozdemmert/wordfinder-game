const crypto = require('crypto');

function generateToken() {
    return crypto.randomUUID();
}

function generateRoomCode(lobbies) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (lobbies[code]) return generateRoomCode(lobbies);
    return code;
}

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
        lastAction: lobby.lastAction || null,
        lastActionId: lobby.lastActionId || 0,
        turnTimeRemaining: lobby.turnDeadline
            ? Math.max(0, (lobby.turnDeadline - Date.now()) / 1000)
            : null
    };
}

function awardPeriodicGems(lobby) {
    if (lobby.status !== 'playing') return;
    for (const pid of lobby.playerOrder) {
        lobby.players[pid].gems = Math.min(15, lobby.players[pid].gems + 1);
    }
}

function advanceTurn(lobby) {
    lobby.currentPlayerIndex = (lobby.currentPlayerIndex + 1) % lobby.playerOrder.length;
    lobby.currentTurn++;
    lobby.lastAction = null;
    lobby.lastActionId = (lobby.lastActionId || 0) + 1;
}

function removePlayerFromGame(lobby, playerId) {
    const wasPlaying = lobby.status === 'playing';
    const leavingIdx = lobby.playerOrder.indexOf(playerId);

    delete lobby.players[playerId];
    lobby.playerOrder = lobby.playerOrder.filter(id => id !== playerId);

    if (lobby.playerOrder.length === 0) return 'delete';

    if (lobby.host === playerId) {
        lobby.host = lobby.playerOrder[0];
        lobby.hostName = lobby.players[lobby.playerOrder[0]]?.name || '?';
    }

    if (wasPlaying && lobby.playerOrder.length > 0) {
        lobby.totalTurns = lobby.settings.turnsPerPlayer * lobby.playerOrder.length;

        if (leavingIdx >= 0) {
            if (leavingIdx < lobby.currentPlayerIndex) {
                lobby.currentPlayerIndex--;
            }
            if (lobby.currentPlayerIndex >= lobby.playerOrder.length) {
                lobby.currentPlayerIndex = 0;
            }
        }

        if (lobby.playerOrder.length <= 1) {
            lobby.status = 'finished';
        }
    }

    return 'updated';
}

module.exports = {
    generateToken, generateRoomCode, lobbyPayload,
    awardPeriodicGems, advanceTurn, removePlayerFromGame
};
