/**
 * Türkçeye özgü yardımcılar.
 *
 * Kritik nokta: 'i'.toUpperCase() === 'I' döner, Türkçede doğrusu 'İ'dir.
 * Projede büyük/küçük harf dönüşümü YALNIZCA bu fonksiyonlarla yapılır.
 */

export const trLower = (s: string): string => s.toLocaleLowerCase('tr-TR');
export const trUpper = (s: string): string => s.toLocaleUpperCase('tr-TR');

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

export const isVowel = (ch: string): boolean => VOWELS.includes(ch);

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
