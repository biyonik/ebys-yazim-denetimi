import { analyzeRootLength } from './analyzer.ts';
import { harmonize2, harmonize4, harmonyOf, isVowel, lastVowel, trLower } from '../turkish.ts';

/**
 * Bilinmeyen kelime için öneri üretimi.
 *
 * Sıra, yanlışın en olası nedeninden en az olasına doğrudur:
 *   1. Türkçe karakter eksikliği (klavye/alışkanlık): yapilacak → yapılacak
 *   2. Tek düzenleme (silme, ekleme, değiştirme, yer değiştirme): gönderilmş → gönderilmiş
 *
 * ── Kaldığı yerden devam eden iş ────────────────────────────────────────
 * Tek düzenlemede ~600 aday denenir; uzun bir kelimede bu onlarca ms sürer.
 * Denetim her tuş vuruşunda (debounce sonrası) ana iş parçacığında çalıştığı
 * için tur başına bir zaman bütçesi vardır. Bütçe biterse iş KAYBOLMAZ:
 * aday listesi ve ilerleme kelime başına saklanır, sonraki tur kaldığı
 * yerden devam eder. Böylece hiçbir tur bütçeyi aşmaz ve her tur ilerler.
 */

const ALPHABET = 'abcçdefgğhıijklmnoöprsştuüvyz';
const PAIRS: Record<string, string> = { c: 'ç', ç: 'c', g: 'ğ', ğ: 'g', i: 'ı', ı: 'i', o: 'ö', ö: 'o', s: 'ş', ş: 's', u: 'ü', ü: 'u' };

export interface Suggestion {
  text: string;
  /** Yalnızca Türkçe karakter düzeltmesi mi (en güvenilir öneri türü) */
  diacriticOnly: boolean;
}

export interface Budget {
  until: number;
}

function diacriticVariants(w: string, maxChecks: number): string[] {
  const pos: number[] = [];
  for (let i = 0; i < w.length; i++) if (PAIRS[w[i]!]) pos.push(i);
  if (pos.length === 0) return [];
  // Değişen harf sayısına göre artan sırada dene (önce 1 değişiklik, sonra 2…)
  const found: string[] = [];
  let checks = 0;
  const maxK = Math.min(pos.length, 5);
  const combine = (start: number, k: number, chars: string[]): boolean => {
    if (k === 0) {
      if (++checks > maxChecks) return false;
      const cand = chars.join('');
      if (analyzeRootLength(cand) > 0) found.push(cand);
      return true;
    }
    for (let j = start; j <= pos.length - k; j++) {
      const i = pos[j]!;
      const orig = chars[i]!;
      chars[i] = PAIRS[orig]!;
      const ok = combine(j + 1, k - 1, chars);
      chars[i] = orig;
      if (!ok) return false;
    }
    return true;
  };
  for (let k = 1; k <= maxK && found.length === 0; k++) {
    if (!combine(0, k, [...w])) break;
  }
  return found;
}

interface Candidate {
  text: string;
  /** Düzenleme türüne göre olasılık puanı: en sık yazım hataları önde */
  bonus: number;
}

function editDistance1(w: string): Candidate[] {
  const seen = new Map<string, number>();
  const add = (text: string, bonus: number) => {
    if (text !== w && (seen.get(text) ?? -1) < bonus) seen.set(text, bonus);
  };
  for (let i = 0; i < w.length; i++) {
    // Silme: tekrarlanmış harfi silmek çok olası ("bilgilerinizz")
    add(w.slice(0, i) + w.slice(i + 1), w[i] === w[i + 1] || w[i] === w[i - 1] ? 3 : 0);
  }
  for (let i = 0; i < w.length - 1; i++) add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2), 3);
  for (let i = 0; i < w.length; i++) {
    for (const c of ALPHABET) if (c !== w[i]) add(w.slice(0, i) + c + w.slice(i + 1), PAIRS[w[i]!] === c ? 6 : 0);
  }
  for (let i = 0; i <= w.length; i++) {
    // Ekleme: unutulmuş ünlü en sık yazım hatası ("gönderilmş")
    for (const c of ALPHABET) add(w.slice(0, i) + c + w.slice(i), isVowel(c) ? 4 : 1);
  }
  return [...seen.entries()].map(([text, bonus]) => ({ text, bonus }));
}

interface Job {
  cands: Candidate[];
  next: number;
  scored: Array<{ text: string; score: number }>;
}

const cache = new Map<string, Suggestion[]>();
const jobs = new Map<string, Job>();

/**
 * @param word küçük harf
 * @returns öneriler; bütçe bu turda yetmediyse null (iş saklanır, sonraki tur devam eder)
 */
export function suggest(word: string, budget: Budget, max = 4): Suggestion[] | null {
  const hit = cache.get(word);
  if (hit) return hit;
  if (performance.now() > budget.until) return null;

  let job = jobs.get(word);
  if (!job) {
    const dia = diacriticVariants(word, 512);
    if (dia.length > 0) {
      const res = dia.slice(0, max).map((text) => ({ text, diacriticOnly: true }));
      cache.set(word, res);
      return res;
    }
    job = { cands: editDistance1(word), next: 0, scored: [] };
    jobs.set(word, job);
  }

  while (job.next < job.cands.length) {
    if ((job.next & 31) === 0 && performance.now() > budget.until) return null;
    const c = job.cands[job.next++]!;
    const rl = analyzeRootLength(c.text);
    // Puan: köke dayanan kısım uzunsa (sözlüğe daha çok dayanıyorsa) ve düzenleme türü sıksa daha olası
    if (rl > 0) job.scored.push({ text: c.text, score: rl * 2 + c.bonus });
  }
  jobs.delete(word);
  job.scored.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text, 'tr'));
  const res = job.scored.slice(0, max).map((s) => ({ text: s.text, diacriticOnly: false }));
  cache.set(word, res);
  return res;
}

// ── Onarımlar: bağlaç ayırma, iki kelimeye bölme ─────────────────────────

export type Repair =
  | { kind: 'de' | 'ki' | 'mi'; stem: string; particle: string }
  | { kind: 'split'; left: string; right: string };

const MI_RE = /^(.+?)(m[ıiuü](?:y[ıiuü]m|s[ıiuü]n|y[ıiuü]z|s[ıiuü]n[ıiuü]z|d[ıiuü]r|y[ıiuü]d[ıiuü][mnk]?|yd[ıiuü]|ym[ıiuü]ş)?)$/;

/** İlk parçası serbest kelime olarak çok sık ayrı yazılan sözcükler */
const SPLIT_FIRST = new Set(['her', 'bir', 'hiç', 'pek', 'çok', 'ya', 'ne', 'şu', 'bu', 'o', 'iş', 'söz', 'yurt', 'yer', 'arz', 'rica', 'kabul', 'sevk', 'göz', 'ön', 'alt', 'üst', 'yan', 'iç', 'dış', 'hafta', 'satın']);

export function repairs(word: string): Repair[] {
  const w = trLower(word);
  const out: Repair[] = [];

  let m = /^(.+)([dt][ae])$/.exec(w);
  if (m && m[1]!.length >= 2 && analyzeRootLength(m[1]!) > 0) {
    const lv = lastVowel(m[1]!);
    out.push({ kind: 'de', stem: m[1]!, particle: 'd' + (lv ? harmonize2(harmonyOf(lv)) : 'e') });
  }
  m = /^(.+)k[iıuü]$/.exec(w);
  if (m && m[1]!.length >= 2 && analyzeRootLength(m[1]!) > 0) out.push({ kind: 'ki', stem: m[1]!, particle: 'ki' });
  m = MI_RE.exec(w);
  if (m && m[1]!.length >= 2 && analyzeRootLength(m[1]!) > 0) {
    const lv = lastVowel(m[1]!);
    let prev = lv ? harmonyOf(lv) : harmonyOf('e');
    let p = '';
    for (const ch of m[2]!) {
      if ('ıiuü'.includes(ch)) {
        const v = harmonize4(prev);
        p += v;
        prev = harmonyOf(v);
      } else p += ch;
    }
    out.push({ kind: 'mi', stem: m[1]!, particle: p });
  }
  if (out.length) return out;

  // İki kelimeye bölme: YALNIZCA sık ayrı yazılan ilk parçalarla (herşey → her şey).
  // Genel bölme denendi ve vazgeçildi: "Kriptografik" → "Kripto grafik",
  // "metodların" → "met odların" gibi anlamsız ama biçimce geçerli bölmeler üretiyor.
  const splits: Repair[] = [];
  for (let i = 1; i <= w.length - 2; i++) {
    const left = w.slice(0, i);
    if (!SPLIT_FIRST.has(left)) continue;
    const right = w.slice(i);
    if (analyzeRootLength(left) > 0 && analyzeRootLength(right) > 0) splits.push({ kind: 'split', left, right });
  }
  return splits.slice(0, 2);
}
