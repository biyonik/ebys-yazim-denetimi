import type { Issue, Rule } from '../types.ts';
import { trLower } from '../turkish.ts';

/**
 * Art arda yinelenen kelime ("ve ve").
 *
 * Türkçede ikilemeler (yavaş yavaş, ara ara, güzel güzel) dil bilgisel
 * olarak doğrudur; bu yüzden HER tekrarı işaretlemek ciddi yanlış pozitif
 * üretir. Yalnızca ikileme olamayan işlev kelimeleri denetlenir.
 */
const FUNCTION_WORDS = new Set([
  've', 'veya', 'ile', 'ya', 'yahut', 'ama', 'fakat', 'ancak', 'lakin', 'için',
  'gibi', 'kadar', 'göre', 'olarak', 'bu', 'şu', 'o', 'bir', 'de', 'da', 'ki',
  'mi', 'mı', 'mu', 'mü', 'ise', 'ile', 'en', 'daha', 'hem', 'ne', 'çünkü',
]);

export const kelimeTekrari: Rule = {
  id: 'tekrar.kelime',
  check({ tokens }) {
    const issues: Issue[] = [];
    for (let i = 0; i + 2 < tokens.length; i++) {
      const a = tokens[i]!;
      const sp = tokens[i + 1]!;
      const b = tokens[i + 2]!;
      if (a.kind !== 'word' || sp.kind !== 'space' || b.kind !== 'word') continue;
      const w = trLower(a.text);
      if (w !== trLower(b.text) || !FUNCTION_WORDS.has(w)) continue;
      // "o o" gibi nadir ama geçerli kurgular olabileceği için hata değil uyarı
      issues.push({
        ruleId: 'tekrar.kelime',
        start: a.start,
        end: b.end,
        text: a.text + sp.text + b.text,
        message: `“${a.text}” kelimesi art arda iki kez yazılmış.`,
        severity: 'uyari',
        category: 'yazim',
        suggestions: [a.text],
      });
    }
    return issues;
  },
};
