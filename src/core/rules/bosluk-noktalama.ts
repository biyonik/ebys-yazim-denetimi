import type { Issue, Rule, Token } from '../types.ts';
import { trLower } from '../turkish.ts';

/**
 * Boşluk ve noktalama kuralları. Hepsi deterministik; morfoloji gerektirmez.
 *
 * Bilinçli istisnalar:
 *  - Satır başı girintisi (EBYS'de paragraf başına boşluk basmak yaygın) işaretlenmez.
 *  - Resmî yazı başlık satırlarında ("Sayı  :", "Konu  :") iki nokta öncesi
 *    boşluk şablon gereğidir; işaretlenmez.
 *  - Nokta sonrası bitişiklik kontrolü kısaltma (T.C., vb.) ve alan adı
 *    (kurum.gov.tr) yüzünden yalnızca büyük harfle başlayan kelime için yapılır.
 */

const HEADER_LABELS = new Set(['sayı', 'konu', 'ilgi', 'ek', 'ekler', 'dağıtım', 'gereği', 'bilgi', 'tarih', 'kimden', 'kime', 'not']);

const PUNCT_NO_SPACE_BEFORE = new Set([',', '.', ';', ':', '!', '?', ')', ']']);

function lineFirstWord(tokens: Token[], i: number): string | null {
  for (let j = i; j >= 0; j--) {
    if (tokens[j]!.kind === 'break') {
      const w = tokens.slice(j + 1, i).find((t) => t.kind === 'word');
      return w ? trLower(w.text) : null;
    }
  }
  const w = tokens.slice(0, i).find((t) => t.kind === 'word');
  return w ? trLower(w.text) : null;
}

export const ciftBosluk: Rule = {
  id: 'bosluk.cift',
  check({ tokens }) {
    const issues: Issue[] = [];
    for (let i = 1; i < tokens.length - 1; i++) {
      const t = tokens[i]!;
      if (t.kind !== 'space' || t.text.length < 2) continue;
      const prev = tokens[i - 1]!;
      const next = tokens[i + 1]!;
      if (prev.kind === 'break' || next.kind === 'break') continue;
      // "Sayı      :" gibi hizalama boşlukları
      if (next.text === ':' && HEADER_LABELS.has(lineFirstWord(tokens, i) ?? '')) continue;
      issues.push({
        ruleId: 'bosluk.cift',
        start: t.start,
        end: t.end,
        text: t.text,
        message: 'Kelimeler arasında birden fazla boşluk var.',
        severity: 'oneri',
        category: 'bicim',
        suggestions: [' '],
      });
    }
    return issues;
  },
};

export const noktalamaOncesiBosluk: Rule = {
  id: 'noktalama.oncesi-bosluk',
  check({ tokens }) {
    const issues: Issue[] = [];
    for (let i = 1; i < tokens.length - 1; i++) {
      const sp = tokens[i]!;
      const p = tokens[i + 1]!;
      const prev = tokens[i - 1]!;
      if (sp.kind !== 'space' || p.kind !== 'punct' || !PUNCT_NO_SPACE_BEFORE.has(p.text)) continue;
      if (prev.kind !== 'word' && prev.kind !== 'number') continue;
      // "ve ..." üç nokta: devam/eksiltme anlamında boşluklu kullanılabilir
      if (p.text === '.' && tokens[i + 2]?.text === '.') continue;
      if (p.text === ':' && HEADER_LABELS.has(lineFirstWord(tokens, i) ?? '')) continue;
      issues.push({
        ruleId: 'noktalama.oncesi-bosluk',
        start: sp.start,
        end: p.end,
        text: sp.text + p.text,
        message: `“${p.text}” işaretinden önce boşluk bırakılmaz.`,
        severity: p.text === ':' ? 'oneri' : 'hata',
        category: 'noktalama',
        suggestions: [p.text],
      });
    }
    return issues;
  },
};

export const noktalamaSonrasiBosluk: Rule = {
  id: 'noktalama.sonrasi-bosluk',
  check({ tokens }) {
    const issues: Issue[] = [];
    for (let i = 1; i < tokens.length - 1; i++) {
      const p = tokens[i]!;
      const next = tokens[i + 1]!;
      const prev = tokens[i - 1]!;
      if (p.kind !== 'punct' || next.kind !== 'word') continue;
      if (prev.kind !== 'word' && prev.kind !== 'number') continue;

      let applies = false;
      // Tek harfli liste: (B,C), A,B ve C
      const singleLetters = prev.kind === 'word' && prev.text.length === 1 && next.text.length === 1;
      if ((p.text === ',' || p.text === ';') && !singleLetters) applies = true;
      else if (p.text === ':') applies = true; // "https://" → ':' sonrası '/' gelir, kelime değil
      else if (p.text === '.' || p.text === '!' || p.text === '?') {
        // Kısaltma zinciri (T.C., A.Ş.) ve alan adı (kurum.gov.tr) hariç
        const prevIsInitial = prev.kind === 'word' && prev.text.length === 1;
        const nextIsCapital = next.text[0] !== trLower(next.text[0]!);
        const nextIsInitial = next.text.length === 1 && tokens[i + 2]?.text === '.';
        applies = !prevIsInitial && nextIsCapital && !nextIsInitial;
      }
      if (!applies) continue;
      issues.push({
        ruleId: 'noktalama.sonrasi-bosluk',
        start: p.start,
        end: next.end,
        text: p.text + next.text,
        message: `“${p.text}” işaretinden sonra boşluk bırakılır.`,
        severity: 'hata',
        category: 'noktalama',
        suggestions: [`${p.text} ${next.text}`],
      });
    }
    return issues;
  },
};
