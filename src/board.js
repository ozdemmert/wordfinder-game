const { getLetters, weightedRandomLetter } = require('./letters');

const BOARD_SIZE = 5;

function generateBoard(lang = 'en') {
    const board = [];
    const letters = getLetters(lang);
    const bonusPos = generateBonusPositions();
    const gemPos = generateGemPositions();
    for (let r = 0; r < BOARD_SIZE; r++) {
        board[r] = [];
        for (let c = 0; c < BOARD_SIZE; c++) {
            const letter = weightedRandomLetter(lang);
            const key = `${r}-${c}`;
            board[r][c] = {
                letter, points: letters[letter].points,
                row: r, col: c,
                bonus: bonusPos[key] || null,
                hasGem: gemPos.has(key)
            };
        }
    }
    return board;
}

function allPositions() {
    const p = [];
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++)
            p.push(`${r}-${c}`);
    return p;
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function generateBonusPositions() {
    const positions = shuffleArray(allPositions());
    return {
        [positions[0]]: 'double-letter',
        [positions[1]]: 'double-letter',
        [positions[2]]: 'triple-letter',
        [positions[3]]: 'triple-letter',
        [positions[4]]: 'double-word'
    };
}

function generateGemPositions() {
    const positions = allPositions();
    const gems = new Set();
    for (let i = 0; i < 3; i++) {
        gems.add(positions.splice(Math.floor(Math.random() * positions.length), 1)[0]);
    }
    return gems;
}

function validatePath(tiles) {
    if (!tiles || tiles.length === 0) return false;
    const seen = new Set();
    for (let i = 0; i < tiles.length; i++) {
        const { row, col } = tiles[i];
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return false;
        const key = `${row}-${col}`;
        if (seen.has(key)) return false;
        seen.add(key);
        if (i > 0) {
            const rd = Math.abs(row - tiles[i - 1].row);
            const cd = Math.abs(col - tiles[i - 1].col);
            if (rd > 1 || cd > 1 || (rd === 0 && cd === 0)) return false;
        }
    }
    return true;
}

function calculateScore(board, tiles) {
    let score = 0, wordMultiplier = 1;
    for (const { row, col } of tiles) {
        const tile = board[row][col];
        let letterScore = tile.points;
        if (tile.bonus === 'double-letter') letterScore *= 2;
        else if (tile.bonus === 'triple-letter') letterScore *= 3;
        else if (tile.bonus === 'double-word') wordMultiplier *= 2;
        score += letterScore;
    }
    score *= wordMultiplier;
    if (tiles.length >= 6) score += 10;
    return score;
}

function refillUsedTiles(board, tiles, lang = 'en') {
    const letters = getLetters(lang);
    for (const { row, col } of tiles) {
        const nl = weightedRandomLetter(lang);
        board[row][col].letter = nl;
        board[row][col].points = letters[nl].points;
        board[row][col].hasGem = false;
        board[row][col].bonus = null;
    }
}

function respawnBonuses(board, usedBonuses, usedGemCount) {
    const getEmpty = () => {
        const avail = [];
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (!board[r][c].bonus && !board[r][c].hasGem) avail.push({ r, c });
        return avail;
    };
    for (const bonus of usedBonuses) {
        const avail = getEmpty();
        if (avail.length > 0) {
            const p = avail[Math.floor(Math.random() * avail.length)];
            board[p.r][p.c].bonus = bonus;
        }
    }
    for (let i = 0; i < usedGemCount; i++) {
        const avail = getEmpty();
        if (avail.length > 0) {
            const p = avail[Math.floor(Math.random() * avail.length)];
            board[p.r][p.c].hasGem = true;
        }
    }
}

function shuffleBoardLetters(board, lang = 'en') {
    const letterTable = getLetters(lang);
    const ltrs = [];
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++)
            ltrs.push(board[r][c].letter);
    shuffleArray(ltrs);
    let idx = 0;
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++) {
            board[r][c].letter = ltrs[idx];
            board[r][c].points = letterTable[ltrs[idx]].points;
            idx++;
        }
}

function findTwoLetterPairs(board) {
    const pairs = new Set();
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++)
            for (let dr = -1; dr <= 1; dr++)
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr, nc = c + dc;
                    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
                    pairs.add(board[r][c].letter + board[nr][nc].letter);
                }
    return [...pairs];
}

module.exports = {
    generateBoard, validatePath, calculateScore,
    refillUsedTiles, respawnBonuses,
    shuffleBoardLetters, findTwoLetterPairs
};
