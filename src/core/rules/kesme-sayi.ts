import type { Issue, Rule } from '../types.ts';
import { spokenLastWord } from '../numbers.ts';
import {
  HARD_CONSONANTS,
  harmonize2,
  harmonize4,
  harmonyOf,
  is2Way,
  is4Way,
  isVowel,
  lastVowel,
  trLower,
} from '../turkish.ts';

/**
 * TDK: Rakamla yazılan sayılara getirilen ekler kesme işaretiyle ayrılır
 * ve ek, sayının OKUNUŞUNA uyar.
 *
 *   2026da   → 2026'da     (kesme eksik)
 *   saat 3'de → saat 3'te  (üç: sert ünsüz → t)
 *   1990'ler → 1990'lar    (doksan: kalın ünlü)
 *
 * Kapsam dışı (bilinçli): büyük harfle biten kodlar (2B, 4K, H2O),
 * çünkü bunlar ek değil, ad parçasıdır.
 */

/** Sayıyla birleşik yazıldığında "ek" değil "birim" olan kısaltmalar */
const UNITS = new Set([
  'km', 'm', 'cm', 'mm', 'kg', 'g', 'mg', 'gr', 'lt', 'l', 'ml', 'cc',
  'TL', 'tl', 'kb', 'KB', 'mb', 'MB', 'gb', 'GB', 'tb', 'TB',
  'sn', 'dk', 'ha', 'kW', 'kw', 'kwh', 'kWh', 'mw', 'MW',
  // Bilinçli olarak YOK: 'da' (dekar) → -da ekiyle çakışır; 'A','V','W' → "4A" gibi
  // madde/bent kodlarıyla çakışır.
]);

/** Ünlü uyumuna girmeyen son ekler; zincirden önce ayrılır */
const INVARIANT_TAILS = ['ken', 'ki'];

const NUM_RE = /^([\p{N}]+(?:[.,:/][\p{N}]+)*)(['’]?)(\p{L}+)$/u;

/** Okunuşa göre doğru eki üretir (ünlü uyumu, d/t benzeşmesi, sıra sayı eki). */
export function correctNumberSuffix(spoken: string, suffix: string): string {
  let body = trLower(suffix);
  let tail = '';
  // Yanlış uyumla yazılmış hâlleri de yakala: "-kı" → "-ki", "-kan" → "-ken"
  const tailRe = /(k[ıiuü]|k[ae]n)$/.exec(body);
  if (tailRe && body.length > tailRe[0].length) {
    tail = tailRe[0].length === 2 ? INVARIANT_TAILS[1]! : INVARIANT_TAILS[0]!;
    body = body.slice(0, -tailRe[0].length);
  }

  const base = trLower(spoken);
  let prev = harmonyOf(lastVowel(base)!);
  let lastChar = base[base.length - 1]!;
  const endsWithVowel = isVowel(lastChar);
  let out = '';

  // Sıra sayı eki: -(I)ncI  → 1'inci, 3'üncü, 6'ncı
  const ord = /^[ıiuü]?nc[ıiuü]/.exec(body);
  if (ord) {
    const v = harmonize4(prev);
    out = (endsWithVowel ? '' : v) + 'nc' + v;
    body = body.slice(ord[0].length);
    prev = harmonyOf(v);
    lastChar = v;
  }

  for (let i = 0; i < body.length; i++) {
    let ch = body[i]!;
    if (isVowel(ch)) {
      if (is2Way(ch)) ch = harmonize2(prev);
      else if (is4Way(ch)) ch = harmonize4(prev);
      prev = harmonyOf(ch);
    } else if (out.length === 0 && (ch === 'd' || ch === 't') && isVowel(body[i + 1] ?? '')) {
      ch = HARD_CONSONANTS.has(lastChar) ? 't' : 'd';
    }
    out += ch;
  }
  return out + tail;
}

export const kesmeSayi: Rule = {
  id: 'kesme.sayi',
  check({ tokens }) {
    const issues: Issue[] = [];
    for (const t of tokens) {
      if (t.kind !== 'number') continue;
      const m = NUM_RE.exec(t.text);
      if (!m) continue;
      const [, num, apos, suffix] = m as unknown as [string, string, string, string];

      if (!apos && UNITS.has(suffix)) {
        issues.push({
          ruleId: 'kesme.sayi.birim',
          start: t.start,
          end: t.end,
          text: t.text,
          message: 'Sayı ile ölçü birimi arasında boşluk bırakılır.',
          severity: 'oneri',
          category: 'noktalama',
          suggestions: [`${num} ${suffix}`],
        });
        continue;
      }
      // Büyük harfli kod (2B, 4K, 3G): ek değil
      if (suffix !== trLower(suffix)) continue;

      const spoken = spokenLastWord(num);
      const endsWithVowel = isVowel(spoken[spoken.length - 1]!);
      let fixed = correctNumberSuffix(spoken, suffix);

      // Kaynaştırma ünsüzü: ünlüyle biten okunuş + ünlüyle başlayan ek (2'i → 2'yi)
      let bufferNote = '';
      const startsWithVowel = isVowel(fixed[0]!);
      const ordinal = /^[ıiuü]?nc/.test(fixed);
      const alts: string[] = [];
      if (endsWithVowel && startsWithVowel && !ordinal) {
        alts.push('y' + fixed);
        if (is4Way(fixed[0]!) && fixed.length === 1) alts.push('s' + fixed);
        bufferNote = ' Ünlüyle biten okunuşa ünlüyle başlayan ek gelirken kaynaştırma ünsüzü kullanılır.';
      } else if (!endsWithVowel && fixed.startsWith('y') && isVowel(fixed[1] ?? '')) {
        fixed = fixed.slice(1);
        bufferNote = ' Ünsüzle biten okunuşta kaynaştırma ünsüzü kullanılmaz.';
      }

      const candidates = (alts.length ? alts : [fixed]).map((s) => `${num}'${s}`);
      const needsChange = !apos || alts.length > 0 || trLower(suffix) !== fixed;
      if (!needsChange) continue;

      const parts: string[] = [];
      if (!apos) parts.push('Rakamla yazılan sayıya gelen ek kesme işaretiyle ayrılır.');
      if (trLower(suffix) !== fixed && alts.length === 0)
        parts.push(`Ek, sayının okunuşuna (“${spoken}”) uymalıdır.`);
      issues.push({
        ruleId: 'kesme.sayi',
        start: t.start,
        end: t.end,
        text: t.text,
        message: (parts.join(' ') + bufferNote).trim(),
        severity: alts.length ? 'uyari' : 'hata',
        category: 'noktalama',
        suggestions: candidates,
      });
    }
    return issues;
  },
};
