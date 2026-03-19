// ===== WordFinder – Socket.IO Client =====

const LETTERS = {
    'E': 1, 'A': 1, 'I': 1, 'O': 1, 'N': 1, 'R': 1, 'T': 1, 'L': 1, 'S': 1, 'U': 1,
    'D': 2, 'G': 2, 'B': 3, 'C': 3, 'M': 3, 'P': 3, 'F': 4, 'H': 4, 'V': 4, 'W': 4,
    'Y': 4, 'K': 5, 'J': 8, 'X': 8, 'Q': 10, 'Z': 10
};

class SpellcastGame {
    constructor() {
        this.socket = io();
        this.token = sessionStorage.getItem('wf_token');
        this.myPlayerId = null;
        this.myName = '';
        this.currentLobbyCode = null;
        this.isHost = false;
        this.lobbySettings = { maxPlayers: 4, turnsPerPlayer: 5, startingGems: 5 };

        this.players = [];
        this.playerOrder = [];
        this.currentPlayerIndex = 0;
        this.currentTurn = 0;
        this.totalTurns = 0;
        this.isMyTurn = false;

        this.board = [];
        this.selectedTiles = [];
        this.currentWord = '';
        this.isSwapMode = false;
        this.swapFirstTile = null;

        // DOM
        this.screens = {
            mainMenu: document.getElementById('main-menu'),
            createLobby: document.getElementById('create-lobby-screen'),
            joinLobby: document.getElementById('join-lobby-screen'),
            lobbyRoom: document.getElementById('lobby-room-screen'),
            game: document.getElementById('game-screen'),
        };
        this.menuEls = { nicknameInput: document.getElementById('nickname-input'), createBtn: document.getElementById('create-lobby-btn'), joinBtn: document.getElementById('join-lobby-btn') };
        this.createEls = { backBtn: document.getElementById('back-from-create'), confirmBtn: document.getElementById('confirm-create-btn'), maxPlayersValue: document.getElementById('max-players-value'), maxPlayersDown: document.getElementById('max-players-down'), maxPlayersUp: document.getElementById('max-players-up'), roundsValue: document.getElementById('rounds-value'), roundsDown: document.getElementById('rounds-down'), roundsUp: document.getElementById('rounds-up'), gemsValue: document.getElementById('gems-value'), gemsDown: document.getElementById('gems-down'), gemsUp: document.getElementById('gems-up') };
        this.joinEls = { backBtn: document.getElementById('back-from-join'), codeInput: document.getElementById('room-code-input'), joinCodeBtn: document.getElementById('join-code-btn'), lobbyList: document.getElementById('lobby-list') };
        this.roomEls = { backBtn: document.getElementById('back-from-room'), codeDisplay: document.getElementById('room-code-display'), copyBtn: document.getElementById('copy-code-btn'), settingsInfo: document.getElementById('room-settings-info'), playerList: document.getElementById('room-players'), playerCount: document.getElementById('room-player-count'), startBtn: document.getElementById('room-start-btn') };
        this.elements = { board: document.getElementById('game-board'), currentWord: document.getElementById('current-word'), wordScore: document.getElementById('word-score'), wordValidation: document.getElementById('word-validation'), scoreboard: document.getElementById('scoreboard'), turnIndicator: document.getElementById('turn-indicator'), submitBtn: document.getElementById('submit-btn'), clearBtn: document.getElementById('clear-btn'), shuffleBtn: document.getElementById('shuffle-btn'), swapBtn: document.getElementById('swap-btn'), hintBtn: document.getElementById('hint-btn'), modal: document.getElementById('game-over-modal'), rankingTable: document.getElementById('ranking-table'), playAgainBtn: document.getElementById('play-again-btn'), swapIndicator: document.getElementById('swap-indicator'), cancelSwap: document.getElementById('cancel-swap'), muteBtn: document.getElementById('mute-btn'), toast: document.getElementById('toast') };

        this.bindEvents();
        this.setupSocket();
    }

    // ===========================================================
    //  SOCKET.IO
    // ===========================================================
    setupSocket() {
        this.socket.on('connect', () => {
            this.socket.emit('authenticate', { token: this.token });
        });

        this.socket.on('authenticated', ({ token, reconnected, playerId, name }) => {
            this.token = token;
            sessionStorage.setItem('wf_token', token);
            if (playerId) this.myPlayerId = playerId;
            if (name) this.myName = name;
            if (reconnected && name) {
                this.menuEls.nicknameInput.value = name;
            }
        });

        this.socket.on('lobbyCreated', ({ code }) => {
            this.currentLobbyCode = code;
            this.isHost = true;
            this.roomEls.codeDisplay.textContent = code;
            this.showScreen('lobbyRoom');
        });

        this.socket.on('lobbyUpdate', ({ lobby }) => {
            this.handleLobbyUpdate(lobby);
        });

        this.socket.on('lobbiesList', ({ lobbies }) => {
            this.renderLobbyList(lobbies);
        });

        this.socket.on('wordResult', ({ valid, word, score }) => {
            const vEl = this.elements.wordValidation;
            if (!valid) {
                window.soundManager.play('invalid');
                this.showToast('Word not in dictionary!', 'error');
                vEl.textContent = '✗ Not a word'; vEl.className = 'word-validation invalid';
                this.elements.currentWord.classList.add('shake');
                setTimeout(() => this.elements.currentWord.classList.remove('shake'), 300);
                this.elements.submitBtn.disabled = false;
            } else {
                window.soundManager.play('submit');
                this.showToast(`+${score} points!`, 'success');
            }
        });

        this.socket.on('hintResult', ({ word, found }) => {
            this.elements.hintBtn.disabled = false;
            if (found) this.showToast(`💡 Hint: "${word}"`, 'success');
            else this.showToast('No word found, try again!', 'error');
        });

        this.socket.on('toast', ({ message, type }) => {
            this.showToast(message, type);
        });

        this.socket.on('error', ({ message }) => {
            this.showToast(message, 'error');
        });

        this.socket.on('disconnect', () => {
            this.showToast('Connection lost. Reconnecting...', 'error');
        });

        this.socket.on('reconnect', () => {
            this.showToast('Reconnected!', 'success');
        });
    }

    // ===========================================================
    //  LOBBY UPDATE HANDLER
    // ===========================================================
    handleLobbyUpdate(lobby) {
        this.currentLobbyCode = lobby.code;
        this.playerOrder = lobby.playerOrder;
        this.players = lobby.players;
        this.lobbySettings = lobby.settings;
        this.isHost = (lobby.host === this.myPlayerId);

        if (lobby.status === 'waiting') {
            // Show room screen
            if (this.screens.lobbyRoom.style.display === 'none' && this.screens.game.style.display === 'none') {
                this.roomEls.codeDisplay.textContent = lobby.code;
                this.showScreen('lobbyRoom');
            }
            this.renderRoom(lobby);
        } else if (lobby.status === 'playing') {
            this.handleGameState(lobby);
        } else if (lobby.status === 'finished') {
            this.handleGameState(lobby);
        }
    }

    renderRoom(lobby) {
        this.roomEls.settingsInfo.textContent = `${lobby.settings.maxPlayers} players · ${lobby.settings.turnsPerPlayer} rounds · 💎 ${lobby.settings.startingGems} gems`;
        const list = this.roomEls.playerList; list.innerHTML = '';
        lobby.players.forEach((p, i) => {
            const card = document.createElement('div');
            card.className = 'room-player-card' + (p.id === lobby.host ? ' host' : '') + (!p.connected ? ' disconnected' : '');
            card.innerHTML = `<span class="room-player-number">${i + 1}</span><span class="room-player-name">${p.name}${!p.connected ? ' (offline)' : ''}</span>${p.id === lobby.host ? '<span class="room-player-badge">HOST</span>' : ''}`;
            list.appendChild(card);
        });
        this.roomEls.playerCount.textContent = `${lobby.players.length}/${lobby.settings.maxPlayers} players`;
        this.roomEls.startBtn.style.display = this.isHost ? 'flex' : 'none';
        this.roomEls.startBtn.disabled = !this.isHost;
    }

    handleGameState(lobby) {
        this.currentPlayerIndex = lobby.currentPlayerIndex;
        this.currentTurn = lobby.currentTurn;
        this.totalTurns = lobby.totalTurns;
        const currentPid = lobby.playerOrder[this.currentPlayerIndex];
        this.isMyTurn = (currentPid === this.myPlayerId);

        if (lobby.board) {
            this.board = [];
            for (let r = 0; r < 5; r++) { this.board[r] = []; for (let c = 0; c < 5; c++) {
                const t = lobby.board[r][c];
                this.board[r][c] = { letter: t.letter, points: t.points, row: r, col: c, bonus: t.bonus || null, hasGem: t.hasGem || false, selected: false };
            }}
        }

        if (lobby.status === 'finished' || this.currentTurn >= this.totalTurns) {
            if (this.screens.game.style.display === 'none') this.showScreen('game');
            this.renderScoreboard(); this.renderBoard(); this.updateUI(); this.endGame(); return;
        }
        if (this.screens.game.style.display === 'none') this.showScreen('game');

        if (lobby.lastAction && lobby.lastAction.playerId !== this.myPlayerId)
            this.showToast(`${lobby.lastAction.playerName}: +${lobby.lastAction.score} pts (${lobby.lastAction.word})`, 'info');

        this.clearSelection(); this.renderScoreboard(); this.renderBoard(); this.updateUI(); this.updateWordDisplay(); this.applyTurnState();
    }

    applyTurnState() {
        const tiles = this.elements.board.querySelectorAll('.tile');
        if (!this.isMyTurn) {
            tiles.forEach(t => t.classList.add('disabled'));
            this.elements.submitBtn.disabled = true; this.elements.clearBtn.disabled = true;
            this.elements.shuffleBtn.disabled = true; this.elements.swapBtn.disabled = true; this.elements.hintBtn.disabled = true;
        } else {
            tiles.forEach(t => t.classList.remove('disabled'));
            this.elements.clearBtn.disabled = false; this.updatePowerupButtons();
        }
    }

    // ===========================================================
    //  SCREEN
    // ===========================================================
    showScreen(name) { Object.values(this.screens).forEach(s => s.style.display = 'none'); if (this.screens[name]) this.screens[name].style.display = 'flex'; }

    // ===========================================================
    //  EVENTS
    // ===========================================================
    bindEvents() {
        this.menuEls.createBtn.addEventListener('click', () => this.goToCreateLobby());
        this.menuEls.joinBtn.addEventListener('click', () => this.goToJoinLobby());
        this.menuEls.nicknameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.goToCreateLobby(); });
        this.createEls.backBtn.addEventListener('click', () => this.showScreen('mainMenu'));
        this.createEls.confirmBtn.addEventListener('click', () => this.createLobby());
        this.createEls.maxPlayersDown.addEventListener('click', () => this.stepSetting('maxPlayers', -1, 1, 6));
        this.createEls.maxPlayersUp.addEventListener('click', () => this.stepSetting('maxPlayers', 1, 1, 6));
        this.createEls.roundsDown.addEventListener('click', () => this.stepSetting('turnsPerPlayer', -1, 1, 20));
        this.createEls.roundsUp.addEventListener('click', () => this.stepSetting('turnsPerPlayer', 1, 1, 20));
        this.createEls.gemsDown.addEventListener('click', () => this.stepSetting('startingGems', -1, 0, 15));
        this.createEls.gemsUp.addEventListener('click', () => this.stepSetting('startingGems', 1, 0, 15));
        this.joinEls.backBtn.addEventListener('click', () => this.showScreen('mainMenu'));
        this.joinEls.joinCodeBtn.addEventListener('click', () => this.joinByCode());
        this.joinEls.codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.joinByCode(); });
        this.roomEls.backBtn.addEventListener('click', () => this.leaveLobby());
        this.roomEls.startBtn.addEventListener('click', () => { this.socket.emit('startGame'); });
        this.roomEls.copyBtn.addEventListener('click', () => this.copyRoomCode());
        this.elements.submitBtn.addEventListener('click', () => { window.soundManager.play('click'); this.submitWord(); });
        this.elements.clearBtn.addEventListener('click', () => { window.soundManager.play('click'); this.clearSelection(); });
        this.elements.shuffleBtn.addEventListener('click', () => { window.soundManager.play('click'); this.socket.emit('useShuffle'); });
        this.elements.swapBtn.addEventListener('click', () => { window.soundManager.play('click'); this.startSwapMode(); });
        this.elements.hintBtn.addEventListener('click', () => { window.soundManager.play('click'); this.elements.hintBtn.disabled = true; this.showToast('Searching...', 'info'); this.socket.emit('useHint'); });
        this.elements.playAgainBtn.addEventListener('click', () => { window.soundManager.play('click'); this.backToMenu(); });
        this.elements.cancelSwap.addEventListener('click', () => { window.soundManager.play('click'); this.cancelSwapMode(); });
        this.elements.muteBtn.addEventListener('click', () => { const m = window.soundManager.toggleMute(); this.elements.muteBtn.textContent = m ? '🔇' : '🔊'; });
        document.addEventListener('keydown', (e) => {
            if (this.screens.game.style.display === 'none') return;
            if (e.key === 'Enter') this.submitWord(); else if (e.key === 'Escape') { if (this.isSwapMode) this.cancelSwapMode(); else this.clearSelection(); }
        });
    }

    // ===========================================================
    //  MAIN MENU
    // ===========================================================
    validateNickname() {
        const name = this.menuEls.nicknameInput.value.trim();
        if (!name) { this.showToast('Please enter a nickname!', 'error'); return null; } return name;
    }

    goToCreateLobby() {
        const name = this.validateNickname(); if (!name) return;
        this.myName = name; this.lobbySettings = { maxPlayers: 4, turnsPerPlayer: 5, startingGems: 5 };
        this.updateSettingsDisplay(); this.showScreen('createLobby');
    }

    goToJoinLobby() {
        const name = this.validateNickname(); if (!name) return;
        this.myName = name; this.joinEls.codeInput.value = '';
        this.socket.emit('getLobbies');
        this.showScreen('joinLobby');
    }

    // ===========================================================
    //  CREATE / JOIN
    // ===========================================================
    stepSetting(key, delta, min, max) { this.lobbySettings[key] = Math.max(min, Math.min(max, this.lobbySettings[key] + delta)); this.updateSettingsDisplay(); }
    updateSettingsDisplay() { this.createEls.maxPlayersValue.textContent = this.lobbySettings.maxPlayers; this.createEls.roundsValue.textContent = this.lobbySettings.turnsPerPlayer; this.createEls.gemsValue.textContent = this.lobbySettings.startingGems; }

    createLobby() { this.socket.emit('createLobby', { name: this.myName, settings: this.lobbySettings }); }

    joinByCode() {
        const code = this.joinEls.codeInput.value.trim().toUpperCase();
        if (code.length !== 4) { this.showToast('Enter a 4-character code!', 'error'); return; }
        this.socket.emit('joinLobby', { name: this.myName, code });
    }

    renderLobbyList(lobbies) {
        const list = this.joinEls.lobbyList; list.innerHTML = '';
        if (lobbies.length === 0) { list.innerHTML = '<div class="empty-lobbies">No open lobbies found</div>'; return; }
        lobbies.forEach(l => {
            const card = document.createElement('div'); card.className = 'lobby-list-card';
            card.innerHTML = `<div class="lobby-list-info"><span class="lobby-list-host">${l.hostName}'s Lobby</span><span class="lobby-list-meta">${l.playerCount}/${l.maxPlayers} players · ${l.turnsPerPlayer} rounds</span></div><span class="lobby-list-code">${l.code}</span>`;
            card.addEventListener('click', () => { this.socket.emit('joinLobby', { name: this.myName, code: l.code }); });
            list.appendChild(card);
        });
    }

    leaveLobby() { this.socket.emit('leaveLobby'); this.currentLobbyCode = null; this.showScreen('mainMenu'); }
    copyRoomCode() { navigator.clipboard.writeText(this.currentLobbyCode).then(() => this.showToast('Code copied!', 'success')).catch(() => this.showToast(this.currentLobbyCode, 'info')); }

    // ===========================================================
    //  RENDER
    // ===========================================================
    renderBoard() {
        this.elements.board.innerHTML = '';
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
            const tile = this.board[r][c], el = document.createElement('div');
            el.className = 'tile'; if (tile.bonus) el.classList.add(tile.bonus); if (tile.hasGem) el.classList.add('has-gem');
            el.innerHTML = `<span class="tile-letter">${tile.letter}</span><span class="tile-points">${tile.points}</span>`;
            el.addEventListener('click', () => this.handleTileClick(r, c));
            this.elements.board.appendChild(el);
        }
    }

    renderScoreboard() {
        const sb = this.elements.scoreboard; sb.innerHTML = '';
        this.players.forEach((p, i) => {
            const card = document.createElement('div');
            card.className = 'player-card' + (i === this.currentPlayerIndex ? ' active' : '') + (!p.connected ? ' disconnected' : '');
            card.id = `player-card-${i}`;
            card.innerHTML = `<span class="p-name">${p.name}${p.id === this.myPlayerId ? ' (You)' : ''}${!p.connected ? ' ⚠️' : ''}</span><span class="p-score">${p.score}</span><span class="p-gems">💎 ${p.gems}</span>`;
            sb.appendChild(card);
        });
    }

    // ===========================================================
    //  TILE INTERACTION (local only, sent on submit)
    // ===========================================================
    handleTileClick(row, col) {
        if (!this.isMyTurn) return;
        const tile = this.board[row][col];
        if (this.isSwapMode) { this.swapTile(row, col); return; }
        if (tile.selected) { const last = this.selectedTiles[this.selectedTiles.length - 1]; if (last && last.row === row && last.col === col) { window.soundManager.play('pop'); this.unselectTile(row, col); } return; }
        if (this.selectedTiles.length === 0 || this.isAdjacent(row, col)) { window.soundManager.play('pop'); this.selectTile(row, col); }
    }

    isAdjacent(row, col) { if (this.selectedTiles.length === 0) return true; const l = this.selectedTiles[this.selectedTiles.length - 1]; const rd = Math.abs(l.row - row), cd = Math.abs(l.col - col); return rd <= 1 && cd <= 1 && !(rd === 0 && cd === 0); }
    isAdjacentTo(r1, c1, r2, c2) { const rd = Math.abs(r1 - r2), cd = Math.abs(c1 - c2); return rd <= 1 && cd <= 1 && !(rd === 0 && cd === 0); }

    selectTile(row, col) { const t = this.board[row][col]; t.selected = true; this.selectedTiles.push(t); this.currentWord += t.letter; this.updateTileUI(row, col, true); this.updateWordDisplay(); this.highlightAdjacentTiles(); }
    unselectTile(row, col) { const t = this.board[row][col]; t.selected = false; this.selectedTiles.pop(); this.currentWord = this.currentWord.slice(0, -1); this.updateTileUI(row, col, false); this.updateWordDisplay(); this.highlightAdjacentTiles(); }

    updateTileUI(row, col, selected) {
        const el = this.elements.board.children[row * 5 + col];
        if (selected) { el.classList.add('selected'); const s = document.createElement('span'); s.className = 'selection-order'; s.textContent = this.selectedTiles.length; el.appendChild(s); }
        else { el.classList.remove('selected'); const s = el.querySelector('.selection-order'); if (s) s.remove(); }
    }

    highlightAdjacentTiles() {
        const tiles = this.elements.board.querySelectorAll('.tile');
        tiles.forEach(t => t.classList.remove('adjacent-hint', 'disabled'));
        if (this.selectedTiles.length === 0) return;
        const last = this.selectedTiles[this.selectedTiles.length - 1];
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
            if (this.board[r][c].selected) continue;
            const el = tiles[r * 5 + c];
            if (this.isAdjacentTo(r, c, last.row, last.col)) el.classList.add('adjacent-hint'); else el.classList.add('disabled');
        }
    }

    // ===========================================================
    //  WORD DISPLAY & SCORING (local preview)
    // ===========================================================
    updateWordDisplay() {
        const wEl = this.elements.currentWord, sEl = this.elements.wordScore;
        this.elements.wordValidation.textContent = ''; this.elements.wordValidation.className = 'word-validation';
        if (this.currentWord.length === 0) { wEl.textContent = this.isMyTurn ? 'Select word...' : 'Waiting...'; wEl.classList.remove('has-word'); sEl.classList.remove('visible'); this.elements.submitBtn.disabled = true; return; }
        wEl.textContent = this.currentWord; wEl.classList.add('has-word');
        sEl.textContent = `+${this.calculateScore()}`; sEl.classList.add('visible'); this.elements.submitBtn.disabled = false;
    }

    calculateScore() {
        let score = 0, wm = 1;
        for (const t of this.selectedTiles) { let ls = t.points; if (t.bonus === 'double-letter') ls *= 2; else if (t.bonus === 'triple-letter') ls *= 3; else if (t.bonus === 'double-word') wm *= 2; score += ls; }
        score *= wm; if (this.currentWord.length >= 6) score += 10; return score;
    }

    // ===========================================================
    //  SUBMIT → Server (tiles only)
    // ===========================================================
    submitWord() {
        if (!this.isMyTurn || this.selectedTiles.length < 2) {
            if (this.selectedTiles.length < 2) { this.showToast('Word too short!', 'error'); this.elements.currentWord.classList.add('shake'); setTimeout(() => this.elements.currentWord.classList.remove('shake'), 300); }
            return;
        }
        this.elements.wordValidation.textContent = 'Checking...'; this.elements.wordValidation.className = 'word-validation';
        this.elements.submitBtn.disabled = true;
        const tiles = this.selectedTiles.map(t => ({ row: t.row, col: t.col }));
        this.socket.emit('submitWord', { tiles });
    }

    // ===========================================================
    //  SWAP (local UI + server event)
    // ===========================================================
    startSwapMode() {
        if (!this.isMyTurn) return;
        const myP = this.players.find(p => p.id === this.myPlayerId);
        if (!myP || myP.gems < 2) { this.showToast('Not enough gems!', 'error'); return; }
        this.isSwapMode = true; this.swapFirstTile = null; this.clearSelection();
        this.elements.swapIndicator.classList.add('active'); this.showToast('Select first tile', 'info');
    }

    cancelSwapMode() { this.isSwapMode = false; this.swapFirstTile = null; this.elements.swapIndicator.classList.remove('active'); this.elements.board.querySelectorAll('.tile').forEach(t => t.classList.remove('swap-selected')); }

    swapTile(row, col) {
        if (!this.isMyTurn) return;
        const el = this.elements.board.children[row * 5 + col];
        if (!this.swapFirstTile) { this.swapFirstTile = { row, col }; el.classList.add('swap-selected'); this.showToast('Select second tile', 'info'); }
        else {
            if (this.swapFirstTile.row === row && this.swapFirstTile.col === col) { this.showToast('Pick a different tile!', 'error'); return; }
            this.socket.emit('useSwap', { tile1: this.swapFirstTile, tile2: { row, col } });
            this.isSwapMode = false; this.swapFirstTile = null; this.elements.swapIndicator.classList.remove('active');
        }
    }

    // ===========================================================
    //  SELECTION
    // ===========================================================
    clearSelection() {
        for (const t of this.selectedTiles) { t.selected = false; this.updateTileUI(t.row, t.col, false); }
        this.selectedTiles = []; this.currentWord = '';
        this.elements.board.querySelectorAll('.tile').forEach(t => t.classList.remove('adjacent-hint', 'disabled'));
        this.updateWordDisplay();
    }

    // ===========================================================
    //  UI
    // ===========================================================
    updateUI() {
        const player = this.players[this.currentPlayerIndex]; if (!player) return;
        const round = Math.floor(this.currentTurn / this.players.length) + 1;
        if (this.isMyTurn) {
            this.elements.turnIndicator.textContent = `Your Turn! — Round ${round}/${this.lobbySettings.turnsPerPlayer}`;
            this.elements.turnIndicator.style.borderColor = 'rgba(16,185,129,0.4)'; this.elements.turnIndicator.style.color = 'var(--success)'; this.elements.turnIndicator.style.background = 'rgba(16,185,129,0.1)';
        } else {
            this.elements.turnIndicator.textContent = `${player.name}'s Turn — Round ${round}/${this.lobbySettings.turnsPerPlayer}`;
            this.elements.turnIndicator.style.borderColor = ''; this.elements.turnIndicator.style.color = ''; this.elements.turnIndicator.style.background = '';
        }
        this.players.forEach((p, i) => { const card = document.getElementById(`player-card-${i}`); if (!card) return; card.querySelector('.p-score').textContent = p.score; card.querySelector('.p-gems').textContent = `💎 ${p.gems}`; card.classList.toggle('active', i === this.currentPlayerIndex); });
        this.updatePowerupButtons();
    }

    updatePowerupButtons() {
        if (!this.isMyTurn) { this.elements.shuffleBtn.disabled = true; this.elements.swapBtn.disabled = true; this.elements.hintBtn.disabled = true; return; }
        const myP = this.players.find(p => p.id === this.myPlayerId);
        const gems = myP?.gems || 0;
        this.elements.shuffleBtn.disabled = gems < 3; this.elements.swapBtn.disabled = gems < 2; this.elements.hintBtn.disabled = gems < 1;
    }

    // ===========================================================
    //  GAME OVER
    // ===========================================================
    endGame() {
        window.soundManager.play('win');
        const ranking = [...this.players].sort((a, b) => b.score - a.score);
        const table = this.elements.rankingTable; table.innerHTML = '';
        const medals = ['🥇', '🥈', '🥉', '4', '5', '6'];
        ranking.forEach((p, i) => {
            const row = document.createElement('div');
            row.className = 'ranking-row' + (i === 0 ? ' winner' : '');
            row.innerHTML = `<span class="ranking-position">${medals[i] || i + 1}</span><span class="ranking-name">${p.name}${p.id === this.myPlayerId ? ' (You)' : ''}</span><div class="ranking-stats"><span class="ranking-score">${p.score} pts</span><span class="ranking-words">${p.wordsCount} words</span></div>`;
            table.appendChild(row);
        });
        this.elements.modal.classList.add('active');
    }

    backToMenu() {
        this.elements.modal.classList.remove('active');
        this.socket.emit('leaveLobby');
        this.currentLobbyCode = null;
        this.showScreen('mainMenu');
    }

    showToast(message, type = 'info') { const t = this.elements.toast; t.textContent = message; t.className = `toast active ${type}`; setTimeout(() => t.classList.remove('active'), 2500); }
}

document.addEventListener('DOMContentLoaded', () => { window.game = new SpellcastGame(); });
