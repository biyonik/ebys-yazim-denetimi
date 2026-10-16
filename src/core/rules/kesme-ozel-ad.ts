import type { Issue, Rule, Severity, Token } from '../types.ts';
import { INSTITUTION_HEADS, PROPER_NOUNS } from '../lexicon/ozel-adlar.ts';
import { checkSuffix } from '../suffix.ts';
import { isUpperLetter, matchCase, trLower } from '../turkish.ts';

/**
 * Özel adlar ve kesme işareti.
 *
 * TDK'nin üç kuralı birlikte uygulanır:
 *  1. Özel adlara gelen ÇEKİM ekleri kesmeyle ayrılır: Ahmet'in, Ankara'da.
 *  2. Özel adlara gelen YAPIM ekleri ayrılmaz: Ankaralı, Türkçe, Avrupalı.
 *     → Bu yüzden ek kısmı bir çekim eki beyaz listesine uymak zorunda.
 *  3. Kurum, kuruluş, kurul adlarına gelen ekler ayrılmaz: Valiliğine,
 *     Türk Dil Kurumuna. → Resmî yazıda sık yapılan "Valiliği'ne" hatası.
 */

/** Çekim ekleri (kesmesiz, küçük harf). Ünlü uyumu ayrıca denetlenir; burada yalnızca biçim. */
const INFLECTION =
  /^(?:n?[ıiuü]n|y?[ae]|[ys]?[ıiuü]|[dt][ae]|[dt][ae]n|y?l[ae]|[dt][ae]k[iıuü]|n?[ıiuü]nk[iıuü]|[dt][ıiuü]r)$/;

const APOS = /['’]/;

function isSentenceStart(tokens: Token[], i: number): boolean {
  for (let j = i - 1; j >= 0; j--) {
    const t = tokens[j]!;
    if (t.kind === 'space') continue;
    if (t.kind === 'break') return true;
    return t.kind === 'punct' && (t.text === '.' || t.text === '!' || t.text === '?' || t.text === ':');
  }
  return true;
}

/** Kelimenin başındaki en uzun özel adı bulur. */
function longestProperPrefix(w: string): { stem: string; rest: string } | null {
  for (let len = w.length - 1; len >= 2; len--) {
    const stem = w.slice(0, len);
    if (PROPER_NOUNS.has(stem)) return { stem, rest: w.slice(len) };
  }
  return null;
}

export const kesmeOzelAd: Rule = {
  id: 'kesme.ozel-ad',
  check({ tokens }) {
    const issues: Issue[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind !== 'word' || !isUpperLetter(t.text[0]!)) continue;
      const w = trLower(t.text);
      const atStart = isSentenceStart(tokens, i);

      // ── Kesmeli yazılmış: kurum adı mı, ek doğru mu? ──
      if (APOS.test(w)) {
        const [base, suffix] = w.split(APOS) as [string, string];
        const inst = INSTITUTION_HEADS.find((h) => base.endsWith(h));
        if (inst && suffix) {
          issues.push({
            ruleId: 'kesme.kurum',
            start: t.start,
            end: t.end,
            text: t.text,
            message: 'Kurum, kuruluş ve kurul adlarına gelen ekler kesme işaretiyle ayrılmaz.',
            severity: 'hata',
            category: 'noktalama',
            suggestions: [t.text.replace(APOS, '')],
          });
          continue;
        }
        const pn = PROPER_NOUNS.get(base);
        if (!pn || !suffix) continue;
        const sc = checkSuffix(base, suffix);
        if (sc.isCorrect) continue;
        issues.push({
          ruleId: 'kesme.ozel-ad.uyum',
          start: t.start,
          end: t.end,
          text: t.text,
          message: sc.note || 'Özel ada gelen ek, adın son ünlüsüne ve son sesine uymalıdır.',
          severity: sc.candidates.length > 1 ? 'uyari' : 'hata',
          category: 'noktalama',
          suggestions: sc.candidates.map((s) => matchCase(t.text, `${base}'${s}`)),
        });
        continue;
      }

      // ── Kesmesiz yazılmış: özel ad + çekim eki mi? ──
      if (PROPER_NOUNS.has(w)) continue; // "Emine", "Denizli": kendisi ad
      const hit = longestProperPrefix(w);
      if (!hit || !INFLECTION.test(hit.rest)) continue;
      const pn = PROPER_NOUNS.get(hit.stem)!;
      if (pn.ambiguous && atStart) continue; // "Denizde yüzdük." ayırt edilemez

      const sc = checkSuffix(hit.stem, hit.rest);
      let severity: Severity = 'hata';
      if (pn.ambiguous || hit.stem.length <= 3 || sc.candidates.length > 1) severity = 'uyari';

      const note = pn.ambiguous
        ? ` “${pn.display}” bir cins isim de olabilir; özel ad değilse bu uyarıyı yoksayın.`
        : '';
      issues.push({
        ruleId: 'kesme.ozel-ad',
        start: t.start,
        end: t.end,
        text: t.text,
        message: `Özel adlara gelen çekim ekleri kesme işaretiyle ayrılır.${note}`,
        severity,
        category: 'noktalama',
        suggestions: sc.candidates.map((s) => matchCase(t.text, `${hit.stem}'${s}`)),
      });
    }
    return issues;
  },
};
