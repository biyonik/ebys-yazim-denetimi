/**
 * Rakamla yazılmış bir sayının okunuşundaki SON kelimeyi bulur.
 *
 * Neden gerekli: sayıya gelen ekin ünlüsü ve ünsüzü yazılışa değil
 * okunuşa uyar. "3'te" (üç → sert ç → t), "40'ta" (kırk), "100'de" (yüz),
 * "2026'da" (altı), "1.000'den" (bin).
 */

const UNITS = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const SCALES = ['', 'bin', 'milyon', 'milyar', 'trilyon', 'katrilyon'];

function lastWordOfInteger(digits: string): string {
  const d = digits.replace(/^0+/, '');
  if (d === '') return 'sıfır';
  const at = (fromRight: number): number => {
    const i = d.length - 1 - fromRight;
    return i >= 0 ? d.charCodeAt(i) - 48 : 0;
  };
  if (at(0) !== 0) return UNITS[at(0)]!;
  if (at(1) !== 0) return TENS[at(1)]!;
  if (at(2) !== 0) return 'yüz';
  for (let g = 1; g < SCALES.length; g++) {
    for (let k = 0; k < 3; k++) if (at(g * 3 + k) !== 0) return SCALES[g]!;
  }
  return 'sıfır';
}

/**
 * Sayı gövdesinin ("16.10.2026", "1.000", "2,5", "10:30") okunuşundaki
 * son kelime.
 */
export function spokenLastWord(numberBody: string): string {
  const groups = numberBody.split(/[.,:/]/);
  const seps = numberBody.match(/[.,:/]/g) ?? [];

  // Binlik ayırıcı: yalnızca nokta ve ilk grup dışındaki tüm gruplar 3 hane → tek sayı
  const isThousands =
    groups.length > 1 &&
    seps.every((s) => s === '.') &&
    groups.slice(1).every((g) => g.length === 3) &&
    groups[0]!.length <= 3;

  if (isThousands) return lastWordOfInteger(groups.join(''));
  // Saat: sondaki sıfır grubu okunmaz — 11.00 "on bir", 10:00 "on" (11.00'de, 10:00'da)
  const last = groups[groups.length - 1]!;
  if (groups.length > 1 && /^0+$/.test(last) && (seps.at(-1) === '.' || seps.at(-1) === ':')) {
    return lastWordOfInteger(groups[groups.length - 2]!);
  }
  // Tarih (16.10.2026), ondalık (2,5), saat (10:30): son grup okunur
  return lastWordOfInteger(last);
}

/**
 * Tam sayının yazıyla okunuşu (TDK: kelimeler ayrı yazılır): 1250 → "bin iki yüz elli".
 * Üleştirme sayıları ve "ikiyüz" gibi bitişik yazımların düzeltmesi için kullanılır.
 * 1 milyardan büyük sayılar için null (resmî yazıda üleştirme olarak geçmez).
 */
export function integerToWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n >= 1_000_000_000) return null;
  if (n === 0) return 'sıfır';
  const below1000 = (x: number): string[] => {
    const out: string[] = [];
    const h = Math.floor(x / 100);
    const t = Math.floor((x % 100) / 10);
    const u = x % 10;
    if (h) out.push(...(h === 1 ? ['yüz'] : [UNITS[h]!, 'yüz']));
    if (t) out.push(TENS[t]!);
    if (u) out.push(UNITS[u]!);
    return out;
  };
  const words: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (millions) words.push(...below1000(millions), 'milyon');
  // "bin", "bir bin" değil
  if (thousands) words.push(...(thousands === 1 ? [] : below1000(thousands)), 'bin');
  words.push(...below1000(rest));
  return words.join(' ');
}

/**
 * Üleştirme sayısı: 2 → "ikişer", 9 → "dokuzar", 4 → "dörder", 100 → "yüzer".
 * Ünlüyle biten sayıya -şAr, ünsüzle bitene -Ar gelir; "dört" yumuşar.
 */
export function distributiveWords(n: number): string | null {
  if (n < 1 || n >= 1_000_000) return null;
  const words = integerToWords(n);
  if (!words) return null;
  const parts = words.split(' ');
  let last = parts.pop()!;
  const vowels = last.match(/[aeıioöuü]/g)!;
  const back = 'aıou'.includes(vowels[vowels.length - 1]!);
  const a = back ? 'a' : 'e';
  if (/[aeıioöuü]$/.test(last)) last += 'ş' + a + 'r';
  else last = (last === 'dört' ? 'dörd' : last) + a + 'r';
  return [...parts, last].join(' ');
}
