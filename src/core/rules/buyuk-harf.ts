import type { Issue, Rule } from '../types.ts';
import { SEP_CELL } from '../types.ts';
import { capitalizeTr, isLowerLetter, trLower } from '../turkish.ts';

/**
 * Cümle ve paragraf başı büyük harf.
 *
 * "Uyarı" düzeyindedir, çünkü sayısız meşru istisnası vardır:
 *  - Kısaltma sonrası nokta cümle bitirmez: "vb. belgeler", "Prof. Dr."
 *  - Sıra sayı noktası: "3. madde", "1. kat"
 *  - Üç nokta devam bildirir: "ve... sonra"
 *  - Tablo hücresi başı ("adet", "kg") cümle başı değildir
 *  - Madde imleri: "a) Toplantı", "b. Rapor"
 */
export const ABBREVIATIONS = new Set([
  'vb', 'vs', 'bkz', 'hk', 'örn', 'dr', 'prof', 'doç', 'av', 'sn', 'no', 'nu', 'md', 'mad',
  's', 'sy', 'sf', 'yy', 'yb', 'ltd', 'şti', 'alb', 'yzb', 'bşk', 'gn', 'gnl', 'müd',
  'uzm', 'öğr', 'gör', 'mah', 'cad', 'sok', 'apt', 'bul', 'tel', 'fax', 'faks', 'vd',
  'mr', 'mrs', 'st', 'inc', 'ord', 'yrd', 'ar', 'arş', 'mim', 'müh', 'hz', 'krş', 'çev', 'haz',
]);

export const buyukHarf: Rule = {
  id: 'buyuk-harf.cumle-basi',
  check({ tokens }) {
    const issues: Issue[] = [];
    let atStart = true; // metin başı paragraf başıdır

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind === 'space') continue;
      if (t.kind === 'break') {
        atStart = t.text !== SEP_CELL;
        continue;
      }
      if (t.kind === 'punct' && (t.text === '.' || t.text === '!' || t.text === '?')) {
        const prev = tokens[i - 1];
        const prev2 = tokens[i - 2];
        const next = tokens[i + 1];
        const isEllipsis = t.text === '.' && (prev?.text === '.' || next?.text === '.');
        const afterAbbr = t.text === '.' && prev?.kind === 'word' && ABBREVIATIONS.has(trLower(prev.text));
        const afterInitial = t.text === '.' && prev?.kind === 'word' && prev.text.length === 1;
        const afterOrdinal = t.text === '.' && prev?.kind === 'number';
        const insideDotted = t.text === '.' && prev2?.text === '.' && prev?.kind === 'word' && prev.text.length <= 3;
        // Cümle ancak ardından boşluk/satır geliyorsa biter ("kurum.gov.tr" değil)
        const followedBySpace = next === undefined || next.kind === 'space' || next.kind === 'break';
        atStart = followedBySpace && !isEllipsis && !afterAbbr && !afterInitial && !afterOrdinal && !insideDotted;
        continue;
      }
      if (atStart && t.kind === 'word') {
        const first = t.text[0]!;
        const next = tokens[i + 1];
        const isListMarker = t.text.length === 1 && (next?.text === ')' || next?.text === '.');
        // e-Yazışma, e-imza, e-posta: tek harfli ön ek
        const isPrefix = t.text.length === 1 && next?.text === '-' && next.start === t.end;
        if (isLowerLetter(first) && !isListMarker && !isPrefix) {
          issues.push({
            ruleId: 'buyuk-harf.cumle-basi',
            start: t.start,
            end: t.end,
            text: t.text,
            message: 'Cümle ve paragraf büyük harfle başlar.',
            severity: 'uyari',
            category: 'kural',
            suggestions: [capitalizeTr(t.text)],
          });
        }
      }
      atStart = false;
    }
    return issues;
  },
};
