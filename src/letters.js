const LETTERS_EN = {
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

const LETTERS_TR = {
    'A': { count: 12, points: 1 }, 'E': { count: 8, points: 1 },
    '\u0130': { count: 7, points: 1 },  'K': { count: 7, points: 1 },
    'L': { count: 7, points: 1 },  'N': { count: 7, points: 1 },
    'R': { count: 6, points: 1 },  'T': { count: 5, points: 1 },
    'I': { count: 4, points: 2 },  'M': { count: 4, points: 2 },
    'O': { count: 3, points: 2 },  'S': { count: 3, points: 2 },
    'U': { count: 3, points: 2 },
    'B': { count: 2, points: 3 },  'D': { count: 4, points: 3 },
    '\u015E': { count: 3, points: 3 },  '\u00DC': { count: 3, points: 3 },
    'Y': { count: 3, points: 3 },
    'C': { count: 2, points: 4 },  '\u00C7': { count: 2, points: 4 },
    'Z': { count: 2, points: 4 },
    'G': { count: 2, points: 5 },  'H': { count: 1, points: 5 },
    'P': { count: 1, points: 5 },
    'F': { count: 1, points: 7 },  '\u00D6': { count: 1, points: 7 },
    'V': { count: 1, points: 7 },
    'J': { count: 1, points: 10 }
};

const LETTERS_BY_LANG = { en: LETTERS_EN, tr: LETTERS_TR };
const TOTAL_WEIGHT_EN = Object.values(LETTERS_EN).reduce((sum, d) => sum + d.count, 0);
const TOTAL_WEIGHT_TR = Object.values(LETTERS_TR).reduce((sum, d) => sum + d.count, 0);

function getLetters(lang) {
    return LETTERS_BY_LANG[lang] || LETTERS_EN;
}

function weightedRandomLetter(lang = 'en') {
    const letters = getLetters(lang);
    const totalWeight = lang === 'tr' ? TOTAL_WEIGHT_TR : TOTAL_WEIGHT_EN;
    let r = Math.random() * totalWeight;
    for (const [letter, data] of Object.entries(letters)) {
        r -= data.count;
        if (r <= 0) return letter;
    }
    return lang === 'tr' ? 'A' : 'E';
}

module.exports = { LETTERS_EN, LETTERS_TR, getLetters, weightedRandomLetter };
