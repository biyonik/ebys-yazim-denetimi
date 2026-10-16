import type { Token, TokenKind } from './types.ts';

/**
 * Sıra önemlidir: önce URL ve e-posta (tek, dokunulmaz parça: içindeki
 * "gov", "tr", "MevzuatNo" kelime sayılmaz), sonra ayırıcı, sonra boşluk, sonra sayı (eki dahil),
 * sonra kelime (kesmeli eki dahil), en son tek karakterlik noktalama.
 *
 * Sayı grubu yalnızca ASCII rakamları kapsar (\p{N} "²", "½" gibi karakterleri de
 * içerir ve sayı okuma mantığını bozar). "2026da", "2026'da", "16.10.2026'da", "10:30", "2,5" gibi
 * biçimleri tek token olarak yakalar; böylece kesme kuralı sayıyı ve ekini
 * birlikte görür.
 *
 * Kesme işareti olarak hem ' (U+0027) hem ’ (U+2019) kabul edilir; Word'den
 * yapıştırılan metinlerde ikincisi çok yaygındır.
 */
const RE =
  /((?:https?:\/\/|www\.)[^\s<>"“”]+[^\s<>"“”.,;:!?)]|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,})|([\n\t])|([ \u00A0]+)|([0-9]+(?:[.,:/][0-9]+)*(?:['’]?\p{L}+)?)|(\p{L}[\p{L}\p{M}]*(?:['’]\p{L}[\p{L}\p{M}]*)*)|([^\s\p{L}\p{N}])|(\s)/gu;

const KINDS: TokenKind[] = ['other', 'break', 'space', 'number', 'word', 'punct', 'space'];

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(text)) !== null) {
    let kind: TokenKind = 'other';
    for (let g = 1; g <= KINDS.length; g++) {
      if (m[g] !== undefined) {
        kind = KINDS[g - 1]!;
        break;
      }
    }
    if (m[0] === '\uFFFC') kind = 'other';
    out.push({ kind, text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** Boşlukları atlayarak i'den sonraki/önceki anlamlı token */
export function nextNonSpace(tokens: Token[], i: number): Token | undefined {
  for (let j = i + 1; j < tokens.length; j++) if (tokens[j]!.kind !== 'space') return tokens[j];
  return undefined;
}

export function prevNonSpace(tokens: Token[], i: number): Token | undefined {
  for (let j = i - 1; j >= 0; j--) if (tokens[j]!.kind !== 'space') return tokens[j];
  return undefined;
}

/** i'deki token cümle (ya da paragraf) başında mı */
export function isSentenceStart(tokens: Token[], i: number): boolean {
  for (let j = i - 1; j >= 0; j--) {
    const t = tokens[j]!;
    if (t.kind === 'space') continue;
    if (t.kind === 'break') return true;
    return t.kind === 'punct' && (t.text === '.' || t.text === '!' || t.text === '?' || t.text === ':');
  }
  return true;
}
