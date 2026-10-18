import type { Issue, Rule, Severity, Token } from '../types.ts';
import { isSentenceStart } from '../tokenizer.ts';
import { isAbbreviation, isProperName, isValidWord, fold } from '../morph/analyzer.ts';
import { repairs, suggest } from '../morph/suggest.ts';
import { isUpperLetter, matchCase, trLower, trUpper, HARD_CONSONANTS } from '../turkish.ts';
import { ABBREVIATIONS } from './buyuk-harf.ts';
import { longestProperPrefix } from './kesme-ozel-ad.ts';
import { UNITS } from './kesme-sayi.ts';
import { PROPER_NOUNS } from '../lexicon/ozel-adlar.ts';
import { prevNonSpace } from '../tokenizer.ts';

/**
 * Sözlüğe dayalı yazım denetimi: kelime, kök sözlüğü + ek dizimiyle
 * kurulamıyorsa işaretlenir.
 *
 * ── Ne işaretlenmez (yanlış pozitif kalkanı) ────────────────────────────
 *  - Cümle içinde büyük harfle başlayan kelime: özel ad olabilir (Kocatepe, Gökalp)
 *  - Tamamı büyük harfli kelime: kısaltma ya da başlık (TBMM, DETSİS, KARAYOLLARI)
 *  - Noktayla biten bilinen kısaltma (vb., bkz., çev.) ve alan adı/e-posta parçaları
 *  - Kesmeli yazılmış kelimeler (özel ad kuralları ayrıca denetler)
 *
 * ── Bilinmeyen kelimede onarım sırası ───────────────────────────────────
 *  1. Bağlaç ayırma:  kitabıda → kitabı da   (bütün kelime geçersiz, gövde geçerli)
 *  2. İki kelimeye bölme: herşey → her şey
 *  3. Öneri: Türkçe karakter, sonra tek düzenleme
 *
 * Bir denetim turunda öneri hesaplamaya ayrılan süre sınırlıdır; aşılırsa
 * sorun önerisiz bildirilir ve öneriler sonraki turlarda önbellekten gelir.
 */

const SUGGEST_BUDGET_MS = 60;
const APOS = /['’]/;

function isAllCaps(s: string): boolean {
  return s === trUpper(s) && s !== trLower(s);
}

/** Alan adı / e-posta / URL parçası mı: kurum.gov.tr, ad@kurum.gov.tr, https://… */
function inUrlContext(tokens: Token[], i: number): boolean {
  const t = tokens[i]!;
  const prev = tokens[i - 1];
  const next = tokens[i + 1];
  const after = tokens[i + 2];
  const glued = (a?: Token, b?: Token) => !!a && !!b && a.end === b.start;
  if (prev && glued(prev, t) && ['.', '@', '/', ':', '_'].includes(prev.text)) return true;
  if (next && glued(t, next) && ['@', '/', '_'].includes(next.text)) return true;
  if (next?.text === '.' && glued(t, next) && after?.kind === 'word' && glued(next, after)) return true;
  return false;
}

function isAbbrevContext(tokens: Token[], i: number, lower: string): boolean {
  const next = tokens[i + 1];
  // "vb.", "çev." ve etiket biçimi "No:16", "Tel:"
  if ((next?.text !== '.' && next?.text !== ':') || next.start !== tokens[i]!.end) return false;
  return ABBREVIATIONS.has(lower) || isAbbreviation(fold(lower));
}

export const yazimSozluk: Rule = {
  id: 'yazim.sozluk',
  check({ tokens }) {
    const issues: Issue[] = [];
    const budget = { until: performance.now() + SUGGEST_BUDGET_MS };

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind !== 'word' || t.text.length < 2) continue;
      const raw = t.text;
      if (APOS.test(raw)) continue;
      if (isAllCaps(raw)) continue;
      const lower = trLower(raw);
      if (inUrlContext(tokens, i) || isAbbrevContext(tokens, i, lower)) continue;
      if (UNITS.has(raw) && prevNonSpace(tokens, i)?.kind === 'number') continue; // 5 cm, 25 kg
      // Mevzuat biçimi sıra sayı eki: "6 ncı maddesi", "4 üncü fıkra"
      if (/^[ıiuü]?nc[ıiuü]$/.test(lower) && prevNonSpace(tokens, i)?.kind === 'number') continue;
      // Tırnak ya da kesmeden sonra gelen ek: “Resmî Gazete”ye, …’ın
      const prevTok = tokens[i - 1];
      if (prevTok && prevTok.end === t.start && /^['’"”»…]$/.test(prevTok.text)) continue;

      const cap = isUpperLetter(raw[0]!);
      const atStart = isSentenceStart(tokens, i);
      if (isValidWord(raw, cap)) continue;
      if (cap && !atStart) continue; // cümle içi büyük harf: özel ad varsayılır
      if (cap && (isProperName(fold(lower)) || PROPER_NOUNS.has(lower) || longestProperPrefix(lower))) continue;
      // "Zeynep KARACA": resmî yazıda soyadı tamamen büyük yazılır; önündeki büyük harfli kelime addır
      const nx = tokens[i + 1]?.text === ' ' ? tokens[i + 2] : undefined;
      if (cap && nx?.kind === 'word' && nx.text.length >= 2 && isAllCaps(nx.text)) continue;

      // ── 1. Bağlaç ayırma ──
      const reps = repairs(lower);
      const conj = reps.find((r) => r.kind === 'de' || r.kind === 'ki' || r.kind === 'mi');
      if (conj && conj.kind !== 'split') {
        const split = `${conj.stem} ${conj.particle}`;
        const suggestions = [matchCase(raw, split)];
        // "gelmişde" → "gelmiş de" mi, "gelmişte" mi? Bulunma eki de olabiliyorsa iki aday
        if (conj.kind === 'de') {
          const hard = HARD_CONSONANTS.has(conj.stem.at(-1)!);
          const loc = conj.stem + (hard ? 't' : 'd') + conj.particle[1];
          if (loc !== lower && isValidWord(loc)) suggestions.push(matchCase(raw, loc));
        }
        const MSG = {
          de: '“de/da” bağlacı ayrı yazılır.',
          ki: '“ki” bağlacı ayrı yazılır.',
          mi: '“mi” soru eki ayrı yazılır.',
        } as const;
        issues.push({
          ruleId: `baglac.${conj.kind}.morf`,
          start: t.start,
          end: t.end,
          text: raw,
          message: MSG[conj.kind] + (suggestions.length > 1 ? ' Bulunma eki kastedildiyse ikinci öneriyi seçin.' : ''),
          severity: 'hata',
          category: 'kural',
          suggestions,
        });
        continue;
      }

      // ── 2. İki kelimeye bölme ──
      const split = reps.find((r) => r.kind === 'split');
      if (split && split.kind === 'split') {
        issues.push({
          ruleId: 'yazim.ayri',
          start: t.start,
          end: t.end,
          text: raw,
          message: 'Sözlükte bitişik biçimi yok; ayrı yazılmalıdır.',
          severity: 'hata',
          category: 'yazim',
          suggestions: reps.filter((r) => r.kind === 'split').map((r) => matchCase(raw, `${(r as { left: string }).left} ${(r as { right: string }).right}`)),
          autoFix: reps.length === 1,
        });
        continue;
      }

      // ── 3. Öneri ──
      const sugs = suggest(lower, budget);
      let severity: Severity = cap ? 'uyari' : 'hata';
      let message = 'Sözlükte bulunamadı.';
      let suggestions: string[] = [];
      let autoFix = false;
      if (sugs === null) {
        severity = 'uyari';
        message += ' Öneriler hazırlanıyor…';
      } else if (sugs.length === 0) {
        severity = 'uyari';
        message += ' Özel ad ya da terimse yoksayabilirsiniz.';
      } else {
        suggestions = sugs.map((s) => matchCase(raw, s.text));
        message += sugs[0]!.diacriticOnly ? ' Türkçe karakter eksik olabilir.' : ' Bunu mu demek istediniz?';
        autoFix = sugs.length === 1 && sugs[0]!.diacriticOnly && !cap;
      }
      issues.push({
        ruleId: 'yazim.sozluk',
        start: t.start,
        end: t.end,
        text: raw,
        message,
        severity,
        category: 'yazim',
        suggestions,
        autoFix,
      });
    }
    return issues;
  },
};
