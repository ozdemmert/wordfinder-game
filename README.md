# WordFinder — Multiplayer Word Game

Discord'daki Spellcast oyunundan esinlenilmiş, tarayıcı tabanlı çok oyunculu kelime oyunu.

## Nasıl Oynanır?

1. **`index.html`** dosyasını tarayıcınızda açın.
2. **Lobby** ekranında nickname girerek oyuncu ekleyin (1–6 kişi).
3. **Start Game** ile oyunu başlatın.
4. Sıranız geldiğinde bitişik harfleri birleştirerek kelimeler oluşturun.
5. **Submit** ile kelimeyi gönderin — geçerliyse puan kazanırsınız, değilse seçiminiz kalır.
6. Her oyuncu 5 tur oynar, oyun sonunda en yüksek skorlu oyuncu kazanır!

## Özellikler

- **1–6 Oyuncu** desteği (tek kişi de oynanabilir)
- **Sıra tabanlı** oyun — her oyuncunun kendi gem havuzu
- **5×5 Harf Tablosu** — kullanılan harfler yeni rastgele harflerle dolar
- **Bonus Taşlar** — 2x/3x Harf, 2x Kelime (her turda karışır)
- **Gem & Power-up** sistemi (Shuffle, Swap, Hint)
- **~10.000 kelimelik** İngilizce sözlük
- **Ses efektleri** ve sessiz modu
- **Sıralama tablosu** ile oyun sonu (🥇🥈🥉)

## Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `index.html` | Lobby, oyun ekranı ve game-over modal |
| `styles.css` | Karanlık tema, lobby, scoreboard, bonus stilleri |
| `game.js` | Oyun mantığı, lobby, sıra sistemi, power-up'lar |
| `words.js` | İngilizce kelime veritabanı (~10k) |
| `audio.js` | Ses efektleri (Web Audio API) |

## Power-up'lar

| Power-up | Maliyet | Etki |
|----------|---------|------|
| 🔀 Shuffle | 💎 3 | Tahtadaki harfleri karıştırır |
| 🔄 Swap | 💎 2 | İki taşın yerini değiştirir |
| 💡 Hint | 💎 1 | Geçerli bir kelime önerir |

İyi eğlenceler! 🎮
