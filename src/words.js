const wordCache = new Map();

// Pre-populate with common valid 2-letter words
const TWO_LETTER_EN = ['aa','ab','ad','ae','ag','ah','ai','al','am','an','ar','as','at','aw','ax','ay','ba','be','bi','bo','by','da','de','do','ed','ef','eh','el','em','en','er','es','et','ew','ex','fa','fe','go','ha','he','hi','hm','ho','id','if','in','is','it','jo','ka','ki','la','li','lo','ma','me','mi','mm','mo','mu','my','na','ne','no','nu','od','oe','of','oh','oi','ok','om','on','oo','op','or','os','ou','ow','ox','oy','pa','pe','pi','po','qi','re','sh','si','so','ta','ti','to','uh','um','un','up','us','ut','we','wo','xi','xu','ya','ye','yo','za'];
const TWO_LETTER_TR = ['ab','ac','ad','af','ah','ak','al','am','an','ar','as','a\u015F','at','av','ay','az','bu','da','de','el','en','er','es','et','ev','ey','ha','he','i\u00E7','il','im','in','ip','ir','is','i\u015F','it','iz','ki','ne','of','oh','ok','ol','on','op','ot','\u00F6\u00E7','\u00F6d','\u00F6f','\u00F6n','\u00F6z','su','\u015Fu','ta','\u00FC\u00E7','\u00FCs','\u00FCz','ya','ye'];

for (const w of TWO_LETTER_EN) wordCache.set(`en:${w}`, true);
for (const w of TWO_LETTER_TR) wordCache.set(`tr:${w}`, true);

let onPersist = null;

function setWordCachePersist(fn) {
    onPersist = fn;
}

async function isValidWord(word, language = 'en') {
    if (!word || word.length < 2) return false;
    const lower = language === 'tr' ? word.toLocaleLowerCase('tr-TR') : word.toLowerCase();
    const key = `${language}:${lower}`;
    if (wordCache.has(key)) return wordCache.get(key);
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const url = language === 'tr'
            ? `https://freedictionaryapi.com/api/v1/entries/tr/${encodeURIComponent(lower)}`
            : `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(lower)}`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        let valid;
        if (language === 'tr') {
            const data = await res.json();
            valid = data && Array.isArray(data.entries) && data.entries.length > 0;
        } else {
            valid = res.ok;
        }
        wordCache.set(key, valid);
        if (onPersist) onPersist(key, valid);
        return valid;
    } catch { return false; }
}

module.exports = { wordCache, isValidWord, setWordCachePersist };
