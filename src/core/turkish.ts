/**
 * Türkçeye özgü yardımcılar.
 *
 * Kritik nokta: 'i'.toUpperCase() === 'I' döner, Türkçede doğrusu 'İ'dir.
 * Projede büyük/küçük harf dönüşümü YALNIZCA bu fonksiyonlarla yapılır.
 */

/**
 * Türkçe büyük/küçük harf dönüşümü.
 *
 * toLocaleLowerCase('tr-TR') doğru ama yavaştır (her çağrıda yerel ayar
 * çözümlemesi) ve denetim her tuş vuruşunda binlerce kez çağırır. Türkçeye
 * özgü fark yalnızca I/ı ve İ/i'dir: bunları önce elle eşleyip ardından
 * yerel ayarsız dönüşümü kullanmak aynı sonucu ~10 kat hızlı verir.
 * Not: 'İ'.toLowerCase() → "i̇" (i + birleşik nokta) verir; bu yüzden İ önce eşlenir.
 */
export const trLower = (s: string): string =>
  (s.includes('I') || s.includes('İ') ? s.replace(/I/g, 'ı').replace(/İ/g, 'i') : s).toLowerCase();
export const trUpper = (s: string): string =>
  (s.includes('i') || s.includes('ı') ? s.replace(/i/g, 'İ').replace(/ı/g, 'I') : s).toUpperCase();

export function capitalizeTr(s: string): string {
  if (!s) return s;
  return trUpper(s[0]!) + s.slice(1);
}

export function isLowerLetter(ch: string): boolean {
  return ch !== trUpper(ch) && ch === trLower(ch);
}

export function isUpperLetter(ch: string): boolean {
  return ch !== trLower(ch) && ch === trUpper(ch);
}

/** Önerinin büyük/küçük harf biçimini kullanıcının yazdığına uydurur. */
export function matchCase(original: string, replacement: string): string {
  const letters = [...original].filter((c) => trLower(c) !== trUpper(c));
  if (letters.length > 1 && letters.every(isUpperLetter)) return trUpper(replacement);
  if (letters.length > 0 && isUpperLetter(letters[0]!)) return capitalizeTr(replacement);
  return replacement;
}

const VOWELS = 'aeıioöuüâîû';
const BACK = new Set(['a', 'ı', 'o', 'u', 'â', 'û']);
const ROUND = new Set(['o', 'ö', 'u', 'ü', 'û']);

const VOWEL_SET = new Set(VOWELS);
export const isVowel = (ch: string): boolean => VOWEL_SET.has(ch);

export function lastVowel(word: string): string | null {
  const w = trLower(word);
  for (let i = w.length - 1; i >= 0; i--) if (isVowel(w[i]!)) return w[i]!;
  return null;
}

export function firstVowelIndex(s: string): number {
  for (let i = 0; i < s.length; i++) if (isVowel(s[i]!)) return i;
  return -1;
}

export interface Harmony {
  back: boolean;
  round: boolean;
}

export function harmonyOf(vowel: string): Harmony {
  return { back: BACK.has(vowel), round: ROUND.has(vowel) };
}

/**
 * Son ünlüsü kalın olduğu hâlde ince ünlülü ek alan kelimeler (Arapça kökenli ince "l",
 * uzun "a"): saate, kontrolü, usulü, kabulde, hâle, Kemal'e. Yalnızca bu kelimelerin
 * kendileri; çözümleyici aynı bilgiyi sözlükteki işaretten alır, ek uyumu (kesme
 * işaretli ekler, bağlaç önerileri) ise bu listeden.
 */
const FRONT_HARMONY_WORDS = new Set([
  'saat', 'kontrol', 'protokol', 'usul', 'kabul', 'hal', 'rol', 'ihtimal', 'alkol', 'petrol', 'sembol', 'hayal',
  'misal', 'meal', 'kalp', 'gol', 'istiklal', 'emsal', 'sual', 'futbol', 'voleybol', 'basketbol', 'metropol',
  'idrak', 'iştirak', 'infilak', 'hakikat', 'dikkat', 'cemaat', 'mahsul', 'meşgul', 'menkul', 'hilal', 'helal',
  'kemal', 'cemal', 'celal', 'bilal', 'iclal', 'meal', 'ahval', 'ihmal', 'istikbal', 'ihtilal', 'iştial',
]);

/** Kelimeye gelecek ekin uyacağı ünlü: son ünlü, ince uyumlu alıntılar için ince */
export function baseHarmony(word: string): Harmony {
  const w = trLower(word);
  const h = harmonyOf(lastVowel(w) ?? 'e');
  return FRONT_HARMONY_WORDS.has(w) ? { back: false, round: h.round } : h;
}

/** Büyük ünlü uyumu: iki yönlü (a/e) */
export function harmonize2(prev: Harmony): string {
  return prev.back ? 'a' : 'e';
}

/** Dört yönlü (ı/i/u/ü) */
export function harmonize4(prev: Harmony): string {
  if (prev.back) return prev.round ? 'u' : 'ı';
  return prev.round ? 'ü' : 'i';
}

export const is2Way = (v: string): boolean => v === 'a' || v === 'e';
export const is4Way = (v: string): boolean => 'ıiuü'.includes(v);

/** Sert ünsüzler: "FıSTıKÇı ŞaHaP" */
export const HARD_CONSONANTS = new Set(['f', 's', 't', 'k', 'ç', 'ş', 'h', 'p']);
