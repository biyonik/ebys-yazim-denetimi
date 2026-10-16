import type { Issue, Rule } from '../types.ts';
import { spokenLastWord } from '../numbers.ts';
import { checkSuffix } from '../suffix.ts';
import { trLower } from '../turkish.ts';

/**
 * TDK: Rakamla yazılan sayılara getirilen ekler kesme işaretiyle ayrılır
 * ve ek, sayının OKUNUŞUNA uyar.
 *
 *   2026da    → 2026'da    (kesme eksik)
 *   saat 3'de → saat 3'te  (üç: sert ünsüz → t)
 *   1990'ler  → 1990'lar   (doksan: kalın ünlü)
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

const NUM_RE = /^([\p{N}]+(?:[.,:/][\p{N}]+)*)(['’]?)(\p{L}+)$/u;

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
      if (suffix !== trLower(suffix)) continue; // 2B, 4K: kod, ek değil

      const spoken = spokenLastWord(num);
      const sc = checkSuffix(spoken, suffix);
      if (apos && sc.isCorrect) continue;

      const parts: string[] = [];
      if (!apos) parts.push('Rakamla yazılan sayıya gelen ek kesme işaretiyle ayrılır.');
      if (!sc.isCorrect) parts.push(sc.note || `Ek, sayının okunuşuna (“${spoken}”) uymalıdır.`);
      issues.push({
        ruleId: 'kesme.sayi',
        start: t.start,
        end: t.end,
        text: t.text,
        message: parts.join(' '),
        severity: sc.candidates.length > 1 ? 'uyari' : 'hata',
        category: 'noktalama',
        suggestions: sc.candidates.map((s) => `${num}'${s}`),
      });
    }
    return issues;
  },
};
