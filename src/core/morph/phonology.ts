import {
  HARD_CONSONANTS,
  harmonize2,
  harmonize4,
  harmonyOf,
  isVowel,
  type Harmony,
} from '../turkish.ts';

/**
 * Ek şablonu dili (arşifonemler):
 *   A  → a / e            (iki yönlü ünlü uyumu)
 *   I  → ı / i / u / ü    (dört yönlü ünlü uyumu)
 *   D  → d / t            (sert ünsüzden sonra t)
 *   C  → c / ç            (sert ünsüzden sonra ç)
 *   (y) (n) (s) (ş)       yalnızca ÜNLÜDEN sonra beliren kaynaştırma ünsüzü
 *   (I)                   yalnızca ÜNSÜZDEN sonra beliren bağlantı ünlüsü
 *
 *   "(y)AcAk" → okuyacak, gelecek, yapacak
 *   "(I)mIz"  → evimiz, arabamız
 *   "DIr"     → gereklidir, yoktur
 */

/** Bir önceki yüzeyin ses durumu: bir sonraki ekin biçimini bu belirler. */
export interface Phon {
  /** Son ünlünün uyum sınıfı (ters uyumlu köklerde ince sayılır: saat → saati) */
  harm: Harmony;
  /** Yüzeyin son harfi */
  last: string;
  /** Gövdenin hece sayısı (ettirgen ekinin seçimi için: oku-t, otur-t, yap-tır) */
  syl: number;
  /** Fiil gövdesinin geniş zaman türü */
  aor: 'A' | 'I';
  /** Zaman adı mı (yarınki, sonraki: -ki doğrudan gelir) */
  time?: boolean;
}

export interface Template {
  opt: '' | 'y' | 'n' | 's' | 'ş' | 'I';
  body: string;
  src: string;
}

export function parseTemplate(src: string): Template {
  const m = /^\(([ynsşI])\)(.*)$/.exec(src);
  return m ? { opt: m[1] as Template['opt'], body: m[2]!, src } : { opt: '', body: src, src };
}

export function realize(t: Template, p: Phon): string {
  let out = '';
  let h = p.harm;
  let prev = p.last;
  const ev = isVowel(p.last);
  if (t.opt === 'I') {
    if (!ev) {
      const v = harmonize4(h);
      out += v;
      h = harmonyOf(v);
      prev = v;
    }
  } else if (t.opt && ev) {
    out += t.opt;
    prev = t.opt;
  }
  for (const ch of t.body) {
    let c = ch;
    if (ch === 'A') c = harmonize2(h);
    else if (ch === 'I') c = harmonize4(h);
    else if (ch === 'D') c = HARD_CONSONANTS.has(prev) ? 't' : 'd';
    else if (ch === 'C') c = HARD_CONSONANTS.has(prev) ? 'ç' : 'c';
    if (isVowel(c)) h = harmonyOf(c);
    out += c;
    prev = c;
  }
  return out;
}

/** Ünsüz yumuşaması: kitap → kitab-, renk → reng-, ağaç → ağac-, gerek → gereğ- */
export function voice(s: string): string | null {
  const last = s.at(-1);
  const before = s.at(-2);
  switch (last) {
    case 'p':
      return s.slice(0, -1) + 'b';
    case 'ç':
      return s.slice(0, -1) + 'c';
    case 't':
      return s.slice(0, -1) + 'd';
    case 'k':
      return s.slice(0, -1) + (before === 'n' ? 'g' : 'ğ');
    case 'g':
      return s.slice(0, -1) + 'ğ';
    default:
      return null;
  }
}

export const countVowels = (s: string): number => {
  let n = 0;
  for (const c of s) if (isVowel(c)) n++;
  return n;
};

export function lastVowelOf(s: string): string | null {
  for (let i = s.length - 1; i >= 0; i--) if (isVowel(s[i]!)) return s[i]!;
  return null;
}

/** Yüzeyden sonraki ses durumu */
export function after(surface: string, p: Phon): Phon {
  const lv = lastVowelOf(surface);
  return {
    harm: lv ? harmonyOf(lv) : p.harm,
    last: surface.at(-1) ?? p.last,
    syl: p.syl + countVowels(surface),
    aor: 'I', // eklenmiş her fiil gövdesi çok hecelidir → -Ir
  };
}
