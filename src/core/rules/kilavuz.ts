import type { Category, Issue, Rule, Severity, Token } from '../types.ts';
import { SEP_BLOCK, SEP_CELL } from '../types.ts';
import { isAbbreviation, isProperName, isValidWord } from '../morph/analyzer.ts';
import { checkSuffix } from '../suffix.ts';
import { distributiveWords } from '../numbers.ts';
import { isSentenceStart, nextNonSpace } from '../tokenizer.ts';
import { INSTITUTION_HEADS } from '../lexicon/ozel-adlar.ts';
import { baseHarmony, capitalizeTr, harmonize4, isLowerLetter, isUpperLetter, matchCase, trLower, trUpper } from '../turkish.ts';
import { PROPER_NOUNS } from '../lexicon/ozel-adlar.ts';
import { linesOf, type Line } from './yonetmelik.ts';

/**
 * Cumhurbaşkanlığı "Resmî Yazışma Kuralları" Kılavuzu (Ocak 2023 baskısı; kullanıcının
 * kurumunda dağıtılan sürüm) — metin, imla ve noktalama bölümleri.
 *
 * Yönetmelik kuralları (yonetmelik.ts) belgenin İSKELETİNİ denetler: Konu, Sayı, İlgi, Ek.
 * Buradakiler METNİN İÇİNİ denetler: §13.5 anlatım, §13.6 yazım ve noktalama, §11.4 muhatap,
 * §15 ek, §23 süreli yazı, §30 tekit.
 *
 * Önem derecesi seçimi (ayrıntı: docs/MIMARI.md):
 *   hata  — Kılavuz "kullanılmaz / yanlıştır" diyor ve tespit kesin (ör. "% 25", "hizmet te")
 *   uyari — kural kesin ama metinden doğru okuma bağlama bağlı (ör. "Konya İli" mi kurum adı mı)
 *   oneri — üslup önerisi (anlatım bozukluğu, şahsileştirilmiş anlatım)
 *
 * Bilinçli olarak alınmayanlar: cümle ögesi eksikliği, sıralama/anlam hataları (§13.5.3.3–4)
 * — sözdizimsel çözümleme gerektirir; kural tabanlı tahmin, yanlış alarmla güveni bozar.
 */

const K = (s: string) => `Kılavuz §${s}`;
const Y = (m: string) => `Yönetmelik m.${m}`;

function mk(
  src: string,
  ruleId: string,
  start: number,
  end: number,
  message: string,
  severity: Severity,
  category: Category,
  ref: string,
  suggestions: string[] = [],
  extra: Partial<Issue> = {},
): Issue {
  return { ruleId, start, end, text: src.slice(start, end), message, severity, category, suggestions, ref, ...extra };
}

// ── Ortak yardımcılar ───────────────────────────────────────────────────

/** Belgede ağırlıklı kullanılan kesme işareti: Word'den gelen metin ’, klavye ' */
let aposText = '';
let aposChar = "'";
function aposOf(text: string): string {
  if (text !== aposText) {
    aposChar = countApos(text);
    aposText = text;
  }
  return aposChar;
}
function countApos(text: string): string {
  let a = 0;
  let b = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x27) a++;
    else if (c === 0x2019) b++;
  }
  return b > a ? '’' : "'";
}

/** Ek uyumu: son ünlü; "saat", "kontrol", "Kemal" gibi ince uyumlu alıntılar dahil */
const isBack = (w: string): boolean => baseHarmony(w).back;
const daDe = (w: string) => (isBack(w) ? 'da' : 'de');
const v4 = (w: string) => harmonize4(baseHarmony(w));
const hasVowel = (w: string) => /[aeıioöuüâîû]/i.test(trLower(w));
const isWord = (t: Token | undefined): t is Token => t?.kind === 'word';
const hasApos = (s: string) => s.includes("'") || s.includes('’');
const isCap = (s: string) => isUpperLetter(s[0] ?? '');
/** En az iki büyük harf, hiç küçük harf yok (tek geçişli düzenli ifade; ayırma yapmaz) */
const isAllCaps = (s: string) => !/\p{Ll}/u.test(s) && /\p{Lu}[^]*\p{Lu}/u.test(s);

/** Fiil gövdesi mi: mastarı sözlükte çözümlenebiliyor mu (gid- → gitmek, ed- → etmek) */
function isVerbStem(x: string): boolean {
  if (x.length < 2 || !hasVowel(x)) return false;
  const inf = isBack(x) ? 'mak' : 'mek';
  if (isValidWord(x + inf)) return true;
  return x.endsWith('d') && isValidWord(x.slice(0, -1) + 't' + inf);
}

/** Tek boşlukla ayrılmış iki kelime: i, i+2 */
const spaced = (tokens: Token[], i: number) => tokens[i + 1]?.kind === 'space' && tokens[i + 1]!.text === ' ' && isWord(tokens[i + 2]);

interface Span {
  start: number;
  end: number;
}

/** Noktadan önce cümle sonu sayılmayan kısaltmalar ve tek büyük harf (ad baş harfi) */
const ABBR_BEFORE_DOT =
  /(?:^|[^\p{L}])(?:vb|vs|vd|bkz|No|no|Dr|Prof|Doç|Av|Alb|Gen|Sok|Mah|Cad|Bul|Yrd|Öğr|Gör|Arş|Uzm|Ltd|Şti|İng|Alm|Fr|Ar|çev|örn|md|a|\p{Lu})$/u;

let memoText = '';
let memoSpans: Span[] = [];

/** Cümle aralıkları: paragraf/hücre sınırı ya da . ! ? … + boşluk (son metin için önbellekli) */
export function sentenceSpans(text: string): Span[] {
  if (text !== memoText) {
    memoSpans = computeSentenceSpans(text);
    memoText = text;
  }
  return memoSpans;
}

function computeSentenceSpans(text: string): Span[] {
  const out: Span[] = [];
  let s = 0;
  const push = (e: number) => {
    let a = s;
    while (a < e && (text[a] === ' ' || text[a] === '\u00A0')) a++;
    if (a < e) out.push({ start: a, end: e });
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === SEP_BLOCK || c === SEP_CELL) {
      push(i);
      s = i + 1;
      continue;
    }
    if (c !== '.' && c !== '!' && c !== '?' && c !== '…') continue;
    let j = i + 1;
    while (j < text.length && '.!?…”"’)'.includes(text[j]!)) j++;
    const next = text[j];
    if (next !== undefined && next !== ' ' && next !== SEP_BLOCK && next !== SEP_CELL && next !== '\u00A0') continue;
    if (c === '.' && ABBR_BEFORE_DOT.test(text.slice(Math.max(0, i - 6), i))) continue;
    if (c === '.' && /\d/.test(text[i - 1] ?? '')) {
      // "5. madde": sıra sayısından sonra küçük harf → cümle bitmedi
      let k = j;
      while (text[k] === ' ') k++;
      if (k < text.length && isLowerLetter(text[k]!)) continue;
    }
    push(j);
    s = j;
    i = j - 1;
  }
  push(text.length);
  return out;
}

/** Aralıktaki token'lar (token dizisi sıralı; ikili arama) */
function tokensIn(tokens: Token[], span: Span): Token[] {
  let lo = 0;
  let hi = tokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid]!.start < span.start) lo = mid + 1;
    else hi = mid;
  }
  const out: Token[] = [];
  for (let i = lo; i < tokens.length && tokens[i]!.end <= span.end; i++) out.push(tokens[i]!);
  return out;
}

function lineFinder(lines: Line[]): (pos: number) => Line | undefined {
  return (pos) => {
    let lo = 0;
    let hi = lines.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const l = lines[mid]!;
      if (pos < l.start) hi = mid - 1;
      else if (pos > l.end) lo = mid + 1;
      else return l;
    }
    return undefined;
  };
}

const TITLE_SMALL = new Set(['ve', 'veya', 'ile', 'ya', 'da', 'de', 'ki', 'yahut']);
/** Başlık biçimli satır: Konu satırı, imza bloğu, tablo başlığı — kelimelerin çoğu büyük harfle */
function isTitleLine(line: Line | undefined): boolean {
  if (!line) return false;
  const t = line.text.trim();
  if (/^Konu\s*:/.test(t) || isAllCaps(t)) return true;
  if (/[.!?]$/.test(t)) return false; // cümle: başlık değil
  const ws = t.match(/\p{L}[\p{L}'’]*/gu) ?? [];
  if (ws.length < 2 || ws.length > 14) return false;
  const content = ws.filter((w) => !TITLE_SMALL.has(w));
  return content.filter((w) => isCap(w)).length / content.length >= 0.75;
}

// ── §13.6.3 / §13.6.9.8 Kesme işareti: cins isim ve bağlaç ───────────────

const MEVZUAT = new Set(['kanun', 'tüzük', 'yönetmelik', 'yönerge', 'genelge', 'karar', 'kararname', 'tebliğ', 'talimat', 'anayasa', 'protokol']);
/** Birinci/ikinci çokluk iyelik: Başkanlığımız, Kurumunuz */
const POSS_12PL = /[ıiuü]?[mn][ıiuü]z$/;
/** İyelikli biçimi kurum adı yerine kullanılan sözler: Başkanlığımız, Kurumunuz, Müdürlüğümüz */
const INSTITUTION_NOUN = new Set([
  'başkanlık', 'bakanlık', 'müdürlük', 'valilik', 'kaymakamlık', 'rektörlük', 'dekanlık', 'kurum', 'kurul', 'birim',
  'idare', 'belediye', 'üniversite', 'fakülte', 'daire', 'şube', 'komisyon', 'sekreterlik', 'koordinatörlük',
  'komutanlık', 'savcılık', 'enstitü', 'okul', 'hastane', 'müsteşarlık', 'başkanlığ', 'merkez', 'ofis', 'ajans',
]);
function isInstitutionPossessive(lb: string): boolean {
  const stem = lb.replace(POSS_12PL, '');
  return INSTITUTION_NOUN.has(stem) || INSTITUTION_NOUN.has(stem.replace(/ğ$/, 'k'));
}
/** Token'ın kesme sandığımız ’ işareti aslında kapanan tek tırnak mı: ‘belge yönetimi’ne */
function closesSingleQuote(text: string, at: number): boolean {
  const open = text.lastIndexOf('‘', at);
  return open >= 0 && open > text.lastIndexOf('’', at - 1) && !text.slice(open, at).includes(SEP_BLOCK);
}
/** Okunuşu kendisinden farklı ölçü birimi kısaltmaları (§13.6.5.1: "kg'dan", "cm'yi") */
const UNIT_READING = new Map([
  ['km', 'kilometre'], ['m', 'metre'], ['cm', 'santimetre'], ['mm', 'milimetre'], ['kg', 'kilogram'],
  ['g', 'gram'], ['gr', 'gram'], ['mg', 'miligram'], ['lt', 'litre'], ['l', 'litre'], ['ml', 'mililitre'],
  ['ha', 'hektar'], ['sn', 'saniye'], ['dk', 'dakika'],
]);

const kesmeCins: Rule = {
  id: 'kilavuz.kesme',
  check({ text, tokens }) {
    const out: Issue[] = [];
    for (const t of tokens) {
      if (t.kind !== 'word' || !hasApos(t.text)) continue;
      const m = /^(\p{L}+)(['’])(\p{Ll}+)$/u.exec(t.text);
      if (!m) continue;
      const [, base, ap, suf] = m as unknown as [string, string, string, string];
      if (ap === '’' && closesSingleQuote(text, t.start)) continue;
      const lb = trLower(base);
      const isDa = /^[dt][ae]$/.test(suf);
      const loc = checkSuffix(lb, 'da').candidates[0]!;
      const both = [`${base} ${daDe(lb)}`, base + loc];

      if (isLowerLetter(base[0]!)) {
        if (lb.length < 3 || UNIT_READING.has(base) || isAbbreviation(lb) || !isValidWord(lb)) continue;
        if (isDa) {
          out.push(mk(text, 'kilavuz.kesme.baglac', t.start, t.end, 'Cins isme gelen ek kesmeyle ayrılmaz. Bağlaç olan “de/da” ise kelimeden ayrı yazılır; hangisi kastediliyorsa onu seçin.', 'hata', 'noktalama', K('13.6.3'), both));
        } else if (MEVZUAT.has(lb)) {
          out.push(mk(text, 'kilavuz.kesme.mevzuat', t.start, t.end, `Belli bir mevzuat kastediliyorsa büyük harfle ve kesmeyle yazılır (“${capitalizeTr(base)}${ap}${suf}”); genel anlamdaysa ek bitişik yazılır.`, 'hata', 'noktalama', K('13.6.9.8'), [capitalizeTr(base) + ap + suf, base + suf]));
        } else {
          out.push(mk(text, 'kilavuz.kesme.cins', t.start, t.end, 'Kesme işareti özel adlara, kısaltmalara ve sayılara gelen ekleri ayırır; cins isme gelen ek bitişik yazılır.', 'hata', 'noktalama', K('13.6.9.8'), [base + suf]));
        }
        continue;
      }
      // "Başkanlığımız'da": iyelikli cins isim + kesme + de (§13.6.3 örneği)
      if (isDa && !isAllCaps(base) && POSS_12PL.test(lb) && isInstitutionPossessive(lb) && !isProperName(lb)) {
        out.push(mk(text, 'kilavuz.kesme.baglac', t.start, t.end, 'Bağlaç olan “de/da” kelimeden kesmeyle ayrılmaz, ayrı yazılır (Başkanlığımız da). Bulunma eki kastediliyorsa bitişik yazılır (Başkanlığımızda).', 'hata', 'noktalama', K('13.6.3'), both));
      }
    }
    return out;
  },
};

// ── §13.6.9.8 Belli bir mevzuat: "Kanun'un", "Yönetmelik'in" ─────────────

/** Uzun (iyelikli) biçim önce: "Kanununa" → Kanunu + na; "Kanunun" → Kanun + un */
const MEVZUAT_BASES = ['kanunu', 'kanun', 'yönetmeliği', 'yönetmelik', 'tüzüğü', 'tüzük', 'yönergesi', 'yönerge', 'genelgesi', 'genelge', 'kararnamesi', 'kararname', 'tebliği', 'tebliğ', 'anayasası', 'anayasa'];
const CASE_TAIL = /^(?:n?[ıiuü]n|y?[ae]|n[ae]|[ys]?[ıiuü]|n[ıiuü]|[dt][ae]|n[dt][ae]|[dt][ae]n|n[dt][ae]n|y?l[ae]|[dt][ae]ki|n[dt][ae]ki|n?[ıiuü]nki)$/;

function splitMevzuat(lw: string): { base: string; rest: string } | null {
  for (const base of MEVZUAT_BASES) {
    let rest: string | null = null;
    if (lw.startsWith(base)) rest = lw.slice(base.length);
    else if (base.endsWith('k') && lw.startsWith(base.slice(0, -1) + 'ğ') && /^[aeıioöuü]/.test(lw.slice(base.length))) rest = lw.slice(base.length);
    if (rest === null) continue;
    if (rest === '') return null; // yalın ya da iyelikli ad: "Elektronik İmza Kanunu"
    if (CASE_TAIL.test(rest)) return { base, rest };
  }
  return null;
}

const mevzuatKesme: Rule = {
  id: 'kilavuz.kesme.mevzuat',
  check({ text, tokens }) {
    const out: Issue[] = [];
    const ap = aposOf(text);
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind !== 'word' || !'KkYyTtGgAa'.includes(t.text[0]!) || !isCap(t.text) || hasApos(t.text) || isAllCaps(t.text)) continue;
      const sp = splitMevzuat(trLower(t.text));
      if (!sp || isSentenceStart(tokens, i)) continue;
      const fixed = capitalizeTr(sp.base) + ap + sp.rest;
      out.push(mk(text, 'kilavuz.kesme.mevzuat', t.start, t.end, `Belli bir kanun, yönetmelik vb. kastedilerek büyük harfle yazıldığında ek kesmeyle ayrılır: “${fixed}”. (Mevzuat metinlerinin kendi yazım geleneği kesmesizdir; alıntıysa yoksayın.)`, 'uyari', 'noktalama', K('13.6.9.8'), [fixed]));
    }
    return out;
  },
};

// ── §13.6.3 "hizmet te" → "hizmet de" ───────────────────────────────────

/** "ta" pekiştirme edatı olarak da kullanılır: "ta kendisi", "ta başından", "ta ki" */
const TA_PARTICLE = new Set([
  'ki', 'kendisi', 'kendisine', 'kendisini', 'kendileri', 'başından', 'baştan', 'başında', 'oradan', 'oraya', 'orada',
  'buradan', 'buraya', 'en', 'uzaktan', 'uzaklardan', 'içine', 'içinden', 'dibine', 'dibinden', 'öbür', 'ötesine',
  'öteden', 'eskiden', 'ezelden', 'ilk', 'o', 'bu', 'şu', 'sonuna', 'yukarı', 'aşağı',
]);

const baglacTe: Rule = {
  id: 'kilavuz.baglac.te',
  check({ text, tokens }) {
    const out: Issue[] = [];
    const ap = aposOf(text);
    for (let i = 2; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind !== 'word' || (t.text !== 'te' && t.text !== 'ta')) continue;
      const w = tokens[i - 2];
      if (tokens[i - 1]?.text !== ' ' || !isWord(w) || /['’]/.test(w.text)) continue;
      const nx = nextNonSpace(tokens, i);
      if (isWord(nx) && TA_PARTICLE.has(trLower(nx.text))) continue;
      // Söz olarak anılıyor: "ta/te biçiminde", “te”
      if (tokens[i + 1]?.text === '/' || /[“"‘(]$/.test(text.slice(0, t.start).trimEnd())) continue;
      const lw = trLower(w.text);
      // "te/ta" yanlışı sert ünsüzden sonraki ses benzeşmesinden doğar (hizmet te, kitap ta);
      // ünlüden sonraki "ta" çoğunlukla pekiştirme edatıdır: "sorun ta 2010'dan beri"
      if (!/[fstkçşhp]$/.test(lw)) continue;
      if (t.text === 'ta' && nx && (nx.kind === 'number' || (isWord(nx) && isCap(nx.text)))) continue;
      const sugg = [`${w.text} ${daDe(lw)}`];
      const loc = checkSuffix(lw, 'da').candidates[0]!;
      if (loc.startsWith('t')) {
        // Ayrı yazılmış bulunma eki de olabilir: "kitap ta" → kitapta
        if (isCap(w.text) && !isValidWord(lw)) sugg.push(w.text + ap + loc);
        else if (isValidWord(lw + loc)) sugg.push(w.text + loc);
      }
      out.push(mk(text, 'kilavuz.baglac.te', w.start, t.end, 'Ayrı yazılan bağlaç “de/da” hiçbir zaman “te/ta” biçiminde yazılmaz. Bulunma eki kastediliyorsa kelimeye bitişik yazılır.', 'hata', 'kural', K('13.6.3'), sugg));
    }
    return out;
  },
};

// ── §13.6.9.2 Virgül ────────────────────────────────────────────────────

const VE = new Set(['ve', 'veya', 'yahut']);
/** Zaman/kip eki + şart: olursa, yapmazsa, yaptıysa, yapmışsa, yapacaksa, yapıyorsa (+ kişi) */
const COND = /(?:[aeıiuü]r|m[ae]z|[dt][ıiuü]y|m[ıiuü]ş|[ae]c[ae]k|yor)s[ae](?:k|n[ıiuü]z|n|l[ae]r)?$/;
const CONVERB = /(?:y?[ae]r[ae]k|y?[ıiuü]p|y?[ıiuü]nc[ae]|m[ae]d[ae]n)$/;

/** "hem … , hem de": aynı cümlede daha önce "hem"/"ne" geçmiş mi */
function repeatedBefore(tokens: Token[], i: number, word: string): boolean {
  for (let j = i - 1; j >= 0; j--) {
    const x = tokens[j]!;
    if (x.kind === 'break' || (x.kind === 'punct' && '.!?'.includes(x.text))) return false;
    if (x.kind === 'word' && trLower(x.text) === word) return true;
  }
  return false;
}

function isConverb(word: string): boolean {
  const lw = trLower(word);
  const m = CONVERB.exec(lw);
  return !!m && lw !== 'olup' && isVerbStem(lw.slice(0, m.index));
}

const virgul: Rule = {
  id: 'kilavuz.virgul',
  check({ text, tokens }) {
    const out: Issue[] = [];
    const sentenceEnd = (from: number) => {
      for (let j = from; j < tokens.length; j++) {
        const x = tokens[j]!;
        if (x.kind === 'break' || (x.kind === 'punct' && '.!?'.includes(x.text))) return j;
      }
      return tokens.length;
    };
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind !== 'punct' || t.text !== ',') continue;
      const prev = tokens[i - 1];
      const after = tokens[i + 1]?.kind === 'space' ? tokens[i + 2] : undefined;
      const remove = (id: string, msg: string, sev: Severity = 'hata', extra: Partial<Issue> = {}) =>
        out.push(mk(text, id, t.start, t.end, msg, sev, 'noktalama', K('13.6.9.2'), [''], extra));

      if (isWord(prev) && (prev.text === 'da' || prev.text === 'de') && tokens[i - 2]?.kind === 'space') {
        remove('kilavuz.virgul.baglac', 'Pekiştirme ve bağlama görevindeki “de/da” bağlacından sonra virgül kullanılmaz.');
      } else if (isWord(prev) && VE.has(prev.text) && tokens[i - 2]?.kind === 'space') {
        remove('kilavuz.virgul.ve', `Metin içinde “${prev.text}” bağlacından sonra virgül kullanılmaz.`);
      } else if (isWord(after) && VE.has(after.text)) {
        remove('kilavuz.virgul.ve', `Metin içinde “${after.text}” bağlacından önce virgül kullanılmaz.`);
      } else if (isWord(after) && after.text === 'ya' && tokens[i + 3]?.text === ' ' && tokens[i + 4]?.text === 'da') {
        remove('kilavuz.virgul.ve', '“Ya da” (“veya” anlamında) bağlacından önce virgül kullanılmaz.', 'oneri');
      } else if (
        isWord(after) &&
        (after.text === 'hem' || after.text === 'ne') &&
        tokens[i + 3]?.text === ' ' &&
        (tokens[i + 4]?.text === 'da' || tokens[i + 4]?.text === 'de') &&
        repeatedBefore(tokens, i, after.text)
      ) {
        remove('kilavuz.virgul.tekrarli', `Tekrarlı bağlaçlardan (${after.text} … ${after.text} ${tokens[i + 4]!.text}) önce virgül kullanılmaz.`);
      } else if (isWord(prev) && prev.text === 'olup') {
        // Ardından başka zarf-fiil geliyorsa virgül yerindedir (Kılavuz örneği: "olup, … yapılarak")
        const end = sentenceEnd(i + 1);
        let another = false;
        for (let j = i + 1; j < end && !another; j++) if (isWord(tokens[j]) && isConverb(tokens[j]!.text)) another = true;
        if (!another) remove('kilavuz.virgul.zarf-fiil', 'Zarf-fiil eki almış kelimeden (“olup”) sonra virgül kullanılmaz; yalnızca art arda zarf-fiiller sıralanıyorsa konur.', 'oneri', { autoFix: false });
      } else if (isWord(prev) && isLowerLetter(prev.text[0]!) && COND.test(prev.text) && isValidWord(prev.text) && isValidWord(prev.text.replace(/s[ae](?:k|n[ıiuü]z|n|l[ae]r)?$/, ''))) {
        remove('kilavuz.virgul.sart', 'Şart ekinden (-sa/-se) sonra virgül kullanılmaz.', 'oneri', { autoFix: false });
      }
    }
    return out;
  },
};

// ── §13.5.3 Anlatım: ve tekrarı, zincirlenme, gereksiz kelime ────────────

const HEAD_GEN = new RegExp(`(?:${[...INSTITUTION_HEADS, 'cumhurbaşkanlığı'].join('|')})n[ıiuü]n$`);
const CONNECT = new Set(['ve', 'ile', 'veya']);
const FIXED_PAIR = /^(?:kurum kuruluş|usul esas|hak yükümlülük|hak ödev)/;
/** Ucuz ön eleme: önce sonu ilgi eki mi, sonra ~50 seçenekli düzenli ifade */
const isHeadGen = (t: Token) => /[nN][ıiuüIİUÜ][nN]$/u.test(t.text) && HEAD_GEN.test(trLower(t.text));
/** Bir üst idarenin alt birimi olabilen adlar */
const SUBUNIT_GEN = /(?:müdürlüğü|başkanlığı|dekanlığı|şubesi|dairesi|birimi|koordinatörlüğü|sekreterliği|müdürlüğü|kurulu|enstitüsü|fakültesi|yüksekokulu)n[ıiuü]n$/;

const anlatim: Rule = {
  id: 'kilavuz.anlatim',
  check({ text, tokens }) {
    const out: Issue[] = [];
    const ref1 = K('13.5.3.1');

    // "ve" bir cümlede en fazla iki kez
    for (const sp of sentenceSpans(text)) {
      const ts = tokensIn(tokens, sp);
      let n = 0;
      for (let k = 0; k < ts.length; k++) {
        const t = ts[k]!;
        if (t.kind !== 'word' || t.text !== 've' || ts[k + 1]?.text === '/') continue;
        const a = ts[k - 2];
        const b = ts[k + 2];
        // Kalıp ve terim çiftleri: "tarihli ve … sayılı", "kurum ve kuruluş", "usul ve esas"
        if (isWord(a) && isWord(b) && (a.text === 'tarihli' || FIXED_PAIR.test(`${trLower(a.text)} ${trLower(b.text)}`))) continue;
        if (isWord(a) && isWord(b) && isCap(a.text) && isCap(b.text)) continue; // ad içinde: "Hazine ve Maliye"
        if (++n === 3) {
          out.push(mk(text, 'kilavuz.anlatim.ve', t.start, t.end, 'Aynı cümlede “ve” bağlacı ikiden fazla kullanılmamalıdır; virgül ya da “ile” ile çeşitlendirin veya cümleyi bölün.', 'oneri', 'kural', ref1));
        }
      }
    }

    // Zincirlenme: "… Başkanlığının … Genel Müdürlüğünün … Daire Başkanlığının çalışmaları"
    let run: Token[] = [];
    const flush = () => {
      const gens = run.filter(isHeadGen);
      for (let k = 0; k + 1 < gens.length; k++) {
        // Yalnızca üst idare → alt birim zinciri: "Başkanlığının Genel Müdürlüğünün". "Valiliğinin
        // Sağlık Bakanlığının talebi" gibi farklı görevdeki iki ilgi eki zincir değildir.
        if (!SUBUNIT_GEN.test(trLower(gens[k + 1]!.text))) continue;
        const g = gens[k]!;
        const fixed = g.text.replace(/[nN][ıiuüIİUÜ][nN]$/u, '');
        out.push(mk(text, 'kilavuz.anlatim.zincirleme', g.start, g.end, 'Hiyerarşik idare adlarında ilgi eki zincirlenmesi anlatımı ağırlaştırır; yalnızca son idare adı ilgi eki alır.', 'oneri', 'kural', ref1, [fixed], { autoFix: false }));
      }
      run = [];
    };
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind === 'space' && t.text === ' ') continue;
      if (t.kind === 'word' && isCap(t.text) && !/['’]/.test(t.text)) {
        run.push(t);
        continue;
      }
      // "Destek ve Mali Hizmetler": bağlaç adın içindeyse zincir sürer
      const last = run.at(-1);
      if (t.kind === 'word' && CONNECT.has(t.text) && last && !isHeadGen(last) && isWord(tokens[i + 2]) && isCap(tokens[i + 2]!.text)) continue;
      flush();
    }
    flush();

    // Gereksiz kelime (§13.5.3.2)
    const ref2 = K('13.5.3.2');
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind !== 'word' || !'gGhHkKyY'.includes(t.text[0]!) || !spaced(tokens, i)) continue;
      const w = trLower(t.text);
      const n = tokens[i + 2]!;
      const nl = trLower(n.text);
      if (w === 'geri' && nl.startsWith('iade')) {
        out.push(mk(text, 'kilavuz.anlatim.gereksiz', t.start, n.end, '“İade” geri göndermeyi zaten anlatır; “geri” gereksizdir.', 'oneri', 'kural', ref2, [matchCase(t.text, n.text)]));
      } else if ((w === 'halen' || w === 'hâlen') && nl.startsWith('yürürlük')) {
        out.push(mk(text, 'kilavuz.anlatim.gereksiz', t.start, n.end, '“Yürürlükte” bugün geçerli olmayı zaten anlatır; “hâlen” gereksizdir.', 'oneri', 'kural', ref2, [matchCase(t.text, n.text)]));
      } else if (w === 'karşılıklı' && nl.startsWith('yazışma')) {
        out.push(mk(text, 'kilavuz.anlatim.gereksiz', t.start, n.end, '“Yazışma” işin karşılıklı yapıldığını zaten anlatır; “karşılıklı” gereksizdir.', 'oneri', 'kural', ref2, [matchCase(t.text, n.text)]));
      } else if (w.startsWith('yazışma') && nl === 'karşılıklı' && spaced(tokens, i + 2) && trLower(tokens[i + 4]!.text) === 'olarak') {
        out.push(mk(text, 'kilavuz.anlatim.gereksiz', t.start, tokens[i + 4]!.end, '“Yazışma” işin karşılıklı yapıldığını zaten anlatır; “karşılıklı olarak” gereksizdir.', 'oneri', 'kural', ref2, [t.text]));
      }
    }
    for (let i = 0; i + 4 < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind !== 'word' || trLower(t.text) !== 'yaklaşık') continue;
      const num = tokens[i + 2];
      const adet = tokens[i + 4];
      if (tokens[i + 1]?.text !== ' ' || num?.kind !== 'number' || !/^\d+(?:\.\d{3})*$/.test(num.text) || tokens[i + 3]?.text !== ' ' || adet?.kind !== 'word' || trLower(adet.text) !== 'adet') continue;
      out.push(mk(text, 'kilavuz.anlatim.gereksiz', t.start, adet.end, '“Yaklaşık” ile kesin sayı ve “adet” birlikte mantık aykırılığı doğurur: kesin sayıysa “yaklaşık” ve “adet” çıkarılır.', 'oneri', 'kural', ref2, [num.text, `${t.text} ${num.text}`]));
    }
    return out;
  },
};

// ── §13 Şahsileştirilmiş anlatım ve -DIr ile bitmeyen cümle sonları ──────

interface Ending {
  msg: string;
  fix?: string;
}

/** Madde imli satır: "a) Yerinde denetim.", "1- Liste." — ad öbeği, yüklem değil */
const LIST_ITEM = /^\s*(?:[a-zçğıöşü]|\d{1,2})\s*[)\-.]\s/;
/** Fiil gövdesi + -DI gibi görünen ama cümle sonunda çoğunlukla ad olan kelimeler */
const NOUNLIKE_END = new Set(['kaydı', 'adı', 'yurdu', 'kurdu', 'ordu', 'kadı', 'katı', 'yatı', 'tadı', 'hattı', 'zammı', 'akdi', 'reddi', 'haddi', 'bendi', 'gelecek', 'içecek', 'yiyecek', 'giyecek', 'yemiş']);

const SAHSI = 'Metinde şahsileştirilmiş anlatımdan kaçınılır; cümle -dır/-dir ekiyle kurumsal biçimde bitirilir (Planladık → Planlanmıştır, Planlayacağız → Planlanacaktır).';

function sentenceEnding(word: string): Ending | null {
  const lw = trLower(word);
  if (lw.length < 4) return null;
  if (/[ıiuü]yor(?:um|uz|sun|sunuz|lar)?$/.test(lw)) {
    return { msg: 'Cümle sonları kurumsal anlatım için -dır/-dir ekiyle bitirilir: “Planlıyor” yerine “Planlanmaktadır”.' };
  }
  if (/[ae]c[ae]ğ[ıi][mz]$/.test(lw) || /m[ae]l[ıi](?:y[ıi][mz]|s[ıi]n(?:[ıi]z)?)$/.test(lw)) return { msg: SAHSI };
  let m = /[dt][ıiuü](?:m|k|n|n[ıiuü]z)$/.exec(lw);
  if (m && isVerbStem(lw.slice(0, m.index))) return { msg: SAHSI };
  if ((/[aeıiuü]r[ıiuü]z$/.test(lw) && (isVerbStem(lw.slice(0, -3)) || isVerbStem(lw.slice(0, -4)))) || (/m[ae]y[ıi]z$/.test(lw) && isVerbStem(lw.slice(0, -5)))) {
    return { msg: SAHSI };
  }
  // Ek-fiil (-DIr) eksik: yapılacak → yapılacaktır, yapılmakta → yapılmaktadır
  const addDir = (d: string): Ending => {
    const fix = word + d + v4(lw) + 'r';
    return { msg: `Cümle sonları -dır/-dir ekiyle bitirilir: “${fix}”.`, fix };
  };
  if ((m = /y?[ae]c[ae]k$/.exec(lw)) && isVerbStem(lw.slice(0, m.index))) return addDir('t');
  if ((m = /m[ae]kt[ae]$/.exec(lw)) && isVerbStem(lw.slice(0, m.index))) return addDir('d');
  if ((m = /m[ıiuü]ş$/.exec(lw)) && isVerbStem(lw.slice(0, m.index))) return addDir('t');
  if ((m = /m[ae]l[ıi]$/.exec(lw)) && isVerbStem(lw.slice(0, m.index))) return addDir('d');
  // Görülen geçmiş: yapıldı → yapılmıştır
  if ((m = /[dt][ıiuü]$/.exec(lw)) && isVerbStem(lw.slice(0, m.index))) {
    const x = word.slice(0, m.index);
    const v = v4(trLower(x));
    const fix = `${x}m${v}şt${v}r`;
    return { msg: `Cümle sonları -dır/-dir ekiyle bitirilir: “${fix}”.`, fix };
  }
  return null;
}

const sahsi: Rule = {
  id: 'kilavuz.sahsi',
  check({ text, tokens }) {
    const out: Issue[] = [];
    for (const sp of sentenceSpans(text)) {
      const s = text.slice(sp.start, sp.end);
      if (!/[.!]$/.test(s) || /[“”"‘]/.test(s) || /\bederi[mz]\b|\bederiz\b|saygı/i.test(s) || isAllCaps(s)) continue;
      const ts = tokensIn(tokens, sp);
      let k = ts.length - 1;
      while (k >= 0 && ts[k]!.kind === 'punct') k--;
      const w = ts[k];
      if (!isWord(w) || /['’]/.test(w.text) || isAllCaps(w.text) || !/^[.!]+$/.test(text.slice(w.end, sp.end))) continue;
      if (LIST_ITEM.test(s) || NOUNLIKE_END.has(trLower(w.text))) continue;
      if (ts.filter((t) => t.kind === 'word').length < 2) continue; // tek kelimelik satır
      const e = sentenceEnding(w.text);
      if (!e) continue;
      out.push(
        // Cümle sonunu değiştirmek üslup kararıdır: toplu düzeltmede kendiliğinden uygulanmaz
        mk(text, 'kilavuz.sahsi', w.start, w.end, e.msg, 'oneri', 'kural', K('13'), e.fix ? [e.fix] : [], { autoFix: false }),
      );
    }
    return out;
  },
};

// ── §13.6.1–13.6.2 Bitişik yazılan birleşik kelimeler (ayrı yazılmışsa) ──

interface Join {
  first: string;
  /** İkinci kelimenin gövdesi; ardından gelebilecek ekler */
  second: string;
  tail: RegExp;
  severity: Severity;
  note?: string;
  /** Yalnızca iki kelime de büyük harfle başlıyorsa (kurum adı) */
  capOnly?: boolean;
  /** Ardından gelmesi gereken kelime */
  nextWord?: RegExp;
}

const EV_TAIL = /^(?:|i|e|de|den|le|ler\p{L}*|in(?:e|de|den|i|in)?|imiz\p{L}*|iniz\p{L}*|i(?:ne|nde|nden|ni|nin))$/u;
const ANY_TAIL = /^\p{Ll}{0,8}$/u;
const JOINS: Join[] = [
  ...['savcı', 'müfettiş', 'hemşire', 'komutan', 'kent', 'çavuş', 'yazar', 'kahraman', 'hekim'].map(
    (s): Join => ({ first: 'baş', second: s, tail: ANY_TAIL, severity: 'hata' }),
  ),
  ...['aş', 'bakım', 'basım', 'yayın'].map((f): Join => ({ first: f, second: 'ev', tail: EV_TAIL, severity: 'hata' })),
  // "öğretmen evine taziye ziyareti": kişinin evi de olabilir → uyarı
  ...['konuk', 'ordu', 'öğretmen', 'huzur'].map(
    (f): Join => ({ first: f, second: 'ev', tail: EV_TAIL, severity: 'uyari', note: `Kurum anlamında bitişik yazılır: “${f}evi”. Bir kişinin evi kastediliyorsa ayrı yazım doğrudur.` }),
  ),
  { first: 'doğum', second: 'ev', tail: EV_TAIL, severity: 'uyari', note: 'Kurum anlamında (doğum kliniği) bitişik yazılır: “doğumevi”. “Doğduğu ev” anlamında ayrı yazım doğrudur.' },
  { first: 'polis', second: 'ev', tail: EV_TAIL, severity: 'uyari', note: 'Kurum anlamında bitişik yazılır: “polisevi”.' },
  { first: 'beyan', second: 'name', tail: ANY_TAIL, severity: 'hata' },
  { first: 'kanun', second: 'name', tail: ANY_TAIL, severity: 'hata' },
  { first: 'yazı', second: 'hane', tail: ANY_TAIL, severity: 'hata' },
  ...['deprem', 'afet', 'sel', 'kaza'].map((f): Join => ({ first: f, second: 'zede', tail: ANY_TAIL, severity: 'hata' })),
  { first: 'iç', second: 'işleri', tail: ANY_TAIL, severity: 'hata', capOnly: true },
  { first: 'dış', second: 'işleri', tail: ANY_TAIL, severity: 'hata', capOnly: true },
  { first: 'genel', second: 'kurmay', tail: ANY_TAIL, severity: 'hata', capOnly: true },
  // Kılavuz örneği "Açıköğretim Fakültesi"; MEB'in "Açık Öğretim Lisesi" adı tescilli olarak ayrıdır
  { first: 'açık', second: 'öğretim', tail: ANY_TAIL, severity: 'hata', capOnly: true, nextWord: /^Fakülte/ },
];
const JOIN_BY_FIRST = new Map<string, Join[]>();
for (const j of JOINS) JOIN_BY_FIRST.set(j.first, [...(JOIN_BY_FIRST.get(j.first) ?? []), j]);

const bitisik: Rule = {
  id: 'kilavuz.bitisik',
  check({ text, tokens }) {
    const out: Issue[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind !== 'word' || !spaced(tokens, i)) continue;
      const cands = JOIN_BY_FIRST.get(trLower(t.text));
      if (!cands) continue;
      const n = tokens[i + 2]!;
      const nl = trLower(n.text);
      for (const j of cands) {
        if (!nl.startsWith(j.second) || !j.tail.test(nl.slice(j.second.length))) continue;
        if (j.capOnly && !(isCap(t.text) && isCap(n.text))) continue;
        if (j.nextWord && !(tokens[i + 3]?.text === ' ' && j.nextWord.test(tokens[i + 4]?.text ?? ''))) continue;
        if (isCap(t.text) && !j.capOnly && PROPER_NOUNS.has(trLower(t.text))) continue; // "Ordu evlerinde": il adı
        const joined = isAllCaps(t.text) ? t.text + n.text : t.text + trLower(n.text);
        out.push(
          mk(text, 'kilavuz.bitisik', t.start, n.end, j.note ?? `Bu birleşik kelime bitişik yazılır: “${joined}”.`, j.severity, 'yazim', K(j.capOnly ? '13.6.2 (kuruluş adları)' : '13.6.2'), [joined]),
        );
        i += 2;
        break;
      }
    }
    return out;
  },
};

// ── §13.6.4 / §13.5.1 Büyük harf ────────────────────────────────────────

const CURRENCY = /^(?:lira|kuruş|avro|euro|dolar|dinar|liret|sterlin|frank|ruble|manat)(?:sı|ları|ların|lık|lar|ın|nın|yı|ya|dan|tan|da|ta|a|e|ı|i|u|ü|ya|ye)?$/;
/** Para birimi adının önündeki ülke sıfatı: "Türk lirası", "ABD doları" */
const CURRENCY_OWNER = new Set(['türk', 'abd', 'amerikan', 'kanada', 'avustralya', 'isviçre', 'kuveyt', 'irak', 'ürdün', 'libya', 'tunus', 'cezayir', 'rus', 'ingiliz', 'japon', 'sırp', 'makedon', 'bahreyn']);
const PLACE_TAMLAMA = /^(?:ili|ilçesi|beldesi|köyü)(?:n(?:e|de|den|in|i))?$/;
const STREET = /^(mahallesi|caddesi|sokağı|bulvarı|meydanı)(\p{Ll}*)$/u;
const KURUM_PART = new Set(['genel', 'daire', 'il', 'ilçe', 'bölge', 'şube', 'grup']);
/**
 * Küçük harfle kalmış kurum adı sonu. INSTITUTION_HEADS'ten daha dar: "teşkilatı", "birliği",
 * "idaresi", "merkezi" gibi sözler cins ad olarak da çok geçer ("Taşra teşkilatı bulunan").
 */
const KURUM_HEAD = /^(?:valiliği|kaymakamlığı|bakanlığı|müdürlüğü|başkanlığı|belediyesi|üniversitesi|rektörlüğü|dekanlığı|fakültesi|enstitüsü|yüksekokulu|hastanesi|lisesi|müsteşarlığı|sekreterliği|koordinatörlüğü|komutanlığı|savcılığı|başsavcılığı|mahkemesi|noterliği|müftülüğü)\p{Ll}*$/u;
const NAME_TAIL = /^(taslağı|toplantısı|projesi|ihalesi|alımı|çalıştayı|kongresi|sempozyumu|festivali|yarışması)(\p{Ll}*)$/u;
const TAIL_MOD = new Set(['hizmet', 'mal', 'yapım', 'malzeme', 'danışmanlık', 'eğitim', 'değerlendirme', 'koordinasyon']);
const MONTHS = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
const DAYS = ['pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi', 'pazar'];
const AMBIGUOUS_MONTH = new Set(['ocak', 'ekim', 'aralık']);
const MONTH_RE = new RegExp(`^(${MONTHS.join('|')})(['’]?)(\\p{Ll}*)$`, 'u');
const DAY_RE = new RegExp(`^(${DAYS.join('|')})(['’]?)(\\p{Ll}*)$`, 'u');
const GEN_OR_POSS = /(?:n[ıiuü]n|[ıiuü]m[ıiuü]z\p{Ll}*|[ıiuü]n[ıiuü]z\p{Ll}*)$/u;

const buyukHarf: Rule = {
  id: 'kilavuz.buyuk-harf',
  check({ text, tokens }) {
    const out: Issue[] = [];
    const ap = aposOf(text);
    const lineOf = lineFinder(linesOf(text));
    const titleMemo = new Map<number, boolean>();
    const ref = K('13.6.4');
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind === 'number') {
        // "29 ekim", "17 Aralıkta", "27 Kasım 2019 Cumaya"
        if (!/^(?:0?[1-9]|[12]\d|3[01])$/.test(t.text) || tokens[i + 1]?.text !== ' ' || !isWord(tokens[i + 2])) continue;
        const mw = tokens[i + 2]!;
        const mm = MONTH_RE.exec(trLower(mw.text));
        if (!mm) continue;
        const [, month, mAp, rest] = mm as unknown as [string, string, string, string];
        const proper = capitalizeTr(month) + (rest ? ap + rest : '');
        const yr0 = tokens[i + 4];
        const dated = tokens[i + 3]?.text === ' ' && ((yr0?.kind === 'number' && /^\d{4}/.test(yr0.text)) || (isWord(yr0) && /^(?:tarih|gün)/.test(trLower(yr0.text))));
        // "12 ocak", "2 ekim makinesi", "1 aralık": ay adı ancak tarih bağlamında
        if (AMBIGUOUS_MONTH.has(month) && !dated && !mAp && isLowerLetter(mw.text[0]!)) continue;
        if (isLowerLetter(mw.text[0]!)) {
          out.push(mk(text, 'kilavuz.buyuk-harf.ay', mw.start, mw.end, 'Belirli bir tarih bildiren ay adı büyük harfle başlar.', 'hata', 'yazim', ref, [proper]));
        } else if (rest && !mAp) {
          out.push(mk(text, 'kilavuz.kesme.ay', mw.start, mw.end, 'Belirli bir tarih bildiren ay adına gelen ek kesmeyle ayrılır.', 'hata', 'noktalama', K('13.6.9.8'), [proper]));
        }
        // ardından yıl ve gün adı: "27 Kasım 2019 Cumaya"
        const yr = tokens[i + 4];
        const dw = tokens[i + 6];
        if (tokens[i + 3]?.text === ' ' && yr?.kind === 'number' && /^\d{4}$/.test(yr.text) && tokens[i + 5]?.text === ' ' && isWord(dw)) {
          const dm = DAY_RE.exec(trLower(dw.text));
          if (dm && dm[3] && !dm[2] && isCap(dw.text)) {
            out.push(mk(text, 'kilavuz.kesme.ay', dw.start, dw.end, 'Belirli bir tarih bildiren gün adına gelen ek kesmeyle ayrılır.', 'hata', 'noktalama', K('13.6.9.8'), [capitalizeTr(dm[1]!) + ap + dm[3]]));
          }
        }
        continue;
      }
      if (t.kind !== 'word') continue;
      const prev = tokens[i - 1]?.text === ' ' ? tokens[i - 2] : undefined;
      // Hızlı eleme: yalnızca büyük harfli kelimeler ve büyük harfli kelimeden sonraki küçük harfliler
      if (!isCap(t.text) && !(isWord(prev) && isCap(prev.text))) continue;
      const lw = trLower(t.text);
      const line = lineOf(t.start);
      if (line) {
        let title = titleMemo.get(line.start);
        if (title === undefined) titleMemo.set(line.start, (title = isTitleLine(line)));
        if (title) continue;
      }
      const next = tokens[i + 1]?.text === ' ' ? tokens[i + 2] : undefined;
      const atStart = isSentenceStart(tokens, i);

      if (isCap(t.text) && !atStart && !isAllCaps(t.text)) {
        // Para birimi: "1.500 Lira", "Türk Lirası" → küçük (ad zincirinin içindeyse dokunma)
        const amountBefore = prev?.kind === 'number' || (isWord(prev) && CURRENCY_OWNER.has(trLower(prev.text)));
        if (CURRENCY.test(lw) && amountBefore && !(isWord(next) && isCap(next.text)) && !/['’]/.test(t.text)) {
          out.push(mk(text, 'kilavuz.buyuk-harf.para', t.start, t.end, 'Para birimleri büyük harfle başlamaz (lira, kuruş, avro, dolar; “Türk lirası”).', 'hata', 'yazim', ref, [lw]));
          continue;
        }
        // "Konya İli", "Etimesgut İlçesi": özel ada dâhil olmayan tamlama sözü küçük
        if (PLACE_TAMLAMA.test(lw) && isWord(prev) && isCap(prev.text) && !(isWord(next) && isCap(next.text))) {
          out.push(mk(text, 'kilavuz.buyuk-harf.yer', t.start, t.end, 'Özel ada dâhil olmayıp tamlama kuran il, ilçe, belde, köy sözleri küçük harfle başlar (Konya ili, Etimesgut ilçesi). Kurum adının parçasıysa (… İlçesi Müftülüğü) doğrudur.', 'uyari', 'yazim', ref, [lw]));
          continue;
        }
      }
      if (!isLowerLetter(t.text[0]!) || !isWord(prev) || !isCap(prev.text) || prev.text.length < 2) continue;
      const prevStart = isSentenceStart(tokens, i - 2);
      const prevIsName = !prevStart || !isValidWord(trLower(prev.text));
      if (!prevIsName || /['’]/.test(prev.text)) continue;

      // "Göksu mahallesi" → "Göksu Mahallesi"
      const st = STREET.exec(lw);
      if (st) {
        const fixed = capitalizeTr(st[1]!) + (st[2] ? ap + st[2] : '');
        out.push(mk(text, 'kilavuz.buyuk-harf.cadde', t.start, t.end, 'Mahalle, cadde, sokak, bulvar ve meydan adlarında bu sözler de büyük harfle başlar (Göksu Mahallesi, Atatürk Bulvarı).', 'uyari', 'yazim', ref, [fixed]));
        continue;
      }
      if (GEN_OR_POSS.test(trLower(prev.text))) continue; // "Bakanlığının genel müdürlüğü": cins ad
      if (isAllCaps(prev.text) || trLower(tokens[i - 4]?.text ?? '') === 'bir') continue; // "Ali YILMAZ genel müdürlüğü", "bir Alman üniversitesi"
      // "Bilgi ve Belge Yönetimi daire başkanlığı" → "Daire Başkanlığı"
      if (KURUM_PART.has(lw) || KURUM_HEAD.test(lw)) {
        let j = i;
        while (KURUM_PART.has(trLower(tokens[j]!.text)) && tokens[j + 1]?.text === ' ' && isWord(tokens[j + 2])) j += 2;
        const head = tokens[j]!;
        if (head.kind === 'word' && KURUM_HEAD.test(trLower(head.text)) && isLowerLetter(head.text[0]!)) {
          const span = text.slice(t.start, head.end);
          const fixed = span.replace(/(^|\s)(\p{Ll})/gu, (_m, s: string, c: string) => s + trUpper(c));
          out.push(mk(text, 'kilavuz.buyuk-harf.kurum', t.start, head.end, 'Kurum ve birim adının her kelimesi büyük harfle başlar.', 'oneri', 'yazim', K('13.5.1'), [fixed]));
          i = j;
          continue;
        }
      }
      // "Sıfır Atık projesinde" → "Sıfır Atık Projesi'nde" (§13.5.1): yalnızca en az iki büyük harfli kelimeden sonra
      // "Personel Servisi hizmet alımının" → "Hizmet Alımı'nın": tek bir niteleyici kelimeye izin ver
      const prev2 = tokens[i - 3]?.text === ' ' ? tokens[i - 4] : undefined;
      if (!isWord(prev2) || !isCap(prev2.text)) continue;
      let tail = t;
      let mod = '';
      if (TAIL_MOD.has(lw) && spaced(tokens, i)) {
        tail = tokens[i + 2]!;
        mod = capitalizeTr(t.text) + ' ';
      }
      const nt = NAME_TAIL.exec(trLower(tail.text));
      if (nt) {
        const fixed = mod + capitalizeTr(nt[1]!) + (nt[2] ? ap + nt[2] : '');
        out.push(mk(text, 'kilavuz.buyuk-harf.ad', t.start, tail.end, 'Toplantı, proje, ihale vb. adlarının devamındaki kelime özel ada dâhildir: büyük harfle başlar, eki kesmeyle ayrılır.', 'oneri', 'yazim', K('13.5.1'), [fixed], { autoFix: false }));
        if (tail !== t) i += 2;
      }
    }
    return out;
  },
};

// ── §13.6.5 Kısaltmalar ─────────────────────────────────────────────────

const LETTER_NAME: Record<string, string> = {
  A: 'a', B: 'be', C: 'ce', Ç: 'çe', D: 'de', E: 'e', F: 'fe', G: 'ge', Ğ: 'ge', H: 'he', I: 'ı', İ: 'i', J: 'je',
  K: 'ke', L: 'le', M: 'me', N: 'ne', O: 'o', Ö: 'ö', P: 'pe', R: 're', S: 'se', Ş: 'şe', T: 'te', U: 'u', Ü: 'ü',
  V: 've', Y: 'ye', Z: 'ze', Q: 'kü', W: 've', X: 'iks',
};
const ROMAN = /^(?=[IVXLCDM]+$)M*(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$/;
const fits = (spoken: string, suf: string) => checkSuffix(spoken, suf).candidates.includes(trLower(suf));

const kisaltma: Rule = {
  id: 'kilavuz.kisaltma',
  check({ text, tokens }) {
    const out: Issue[] = [];
    const ref = K('13.6.5.1');
    for (const t of tokens) {
      if (t.kind !== 'word' || !hasApos(t.text)) continue;
      // Büyük harfli kısaltma + ek: TDK'den (ke), TL'nin (le), NATO'dan (okunuş)
      let m = /^(\p{Lu}{2,})(['’])(\p{Ll}+)$/u.exec(t.text);
      if (m) {
        const [, base, ap, suf] = m as unknown as [string, string, string, string];
        if (ROMAN.test(base) && (/^[IVXL]+$/.test(base) || /^[ıiuü]?nc/.test(suf))) continue; // XX'nci; CD'ye kısaltmadır
        const letter = LETTER_NAME[base.at(-1)!];
        if (!letter) continue;
        const asWord = hasVowel(base) ? trLower(base) : null;
        if (fits(letter, suf) || (asWord && fits(asWord, suf))) continue;
        const cands = [...(asWord ? checkSuffix(asWord, suf).candidates : []), ...checkSuffix(letter, suf).candidates];
        const sugg = [...new Set(cands)].map((c) => base + ap + c);
        const msg = asWord
          ? `Kısaltmaya gelen ek, kısaltmanın okunuşuna uyar: harf harf okunuyorsa son harfin okunuşuna (“${letter}”), kelime gibi okunuyorsa kendisine (NATO'dan, ASELSAN'da).`
          : `Büyük harfli kısaltmaya gelen ek, son harfin okunuşuna (“${letter}”) uyar: TDK'den, TL'nin, THY'de.`;
        out.push(mk(text, 'kilavuz.kisaltma.ek', t.start, t.end, msg, 'hata', 'noktalama', ref, sugg));
        continue;
      }
      // Ölçü birimi + ek: kg'dan (kilogram), cm'yi (santimetre)
      m = /^(\p{Ll}{1,2})(['’])(\p{Ll}+)$/u.exec(t.text);
      if (m && UNIT_READING.has(m[1]!)) {
        const reading = UNIT_READING.get(m[1]!)!;
        if (fits(reading, m[3]!)) continue;
        const sugg = checkSuffix(reading, m[3]!).candidates.map((c) => m![1]! + m![2]! + c);
        out.push(mk(text, 'kilavuz.kisaltma.ek', t.start, t.end, `Küçük harfli kısaltmaya gelen ek, kelimenin okunuşuna (“${reading}”) uyar: kg'dan, cm'yi, mm'den.`, 'hata', 'noktalama', ref, sugg));
      }
    }
    // Noktalı büyük harf kısaltma: T.B.M.M. → TBMM (T.C. gelenekseldir)
    const ap = aposOf(text);
    for (const m of text.matchAll(/(?<![\p{L}.])((?:\p{Lu}\.){3,})(?:(['’])(\p{Ll}+))?/gu)) {
      const letters = m[1]!.replace(/\./g, '');
      const after = text[m.index! + m[0].length];
      // Son nokta cümle sonu da olabilir: satır sonundaysa korunur, büyük harften önceyse iki seçenek
      const atEnd = after === undefined || after === SEP_BLOCK || after === SEP_CELL;
      const maybeEnd = after === ' ' && isUpperLetter(text[m.index! + m[0].length + 1] ?? '');
      const sugg = m[3] ? [letters + (m[2] ?? ap) + m[3]] : atEnd ? [letters + '.'] : maybeEnd ? [letters, letters + '.'] : [letters];
      out.push(mk(text, 'kilavuz.kisaltma.nokta', m.index!, m.index! + m[0].length, 'Tamamı büyük harfle yapılan kısaltmalarda nokta kullanılmaz (T.B.M.M. değil TBMM); yalnızca “T.C.” gelenekseldir. Nokta aynı zamanda cümle sonuysa ikinci öneriyi seçin.', 'hata', 'noktalama', K('13.6.5'), sugg));
    }
    // Sonunda nokta ya da üs işareti olan kısaltmaya gelen ek kesmeyle ayrılmaz: vb.leri, No.lu, cm³e
    for (const m of text.matchAll(/(?<![\p{L}])(?:vb|vs|vd|bkz|Alm|İng|Fr|Ar|No|Dr|Prof|Doç|Sok|Mah|Cad|çev|md)\.(['’])(?=\p{Ll})|([²³])(['’])(?=\p{Ll})/gu)) {
      const at = m.index! + m[0].length - 1;
      out.push(mk(text, 'kilavuz.kisaltma.kesme', at, at + 1, 'Sonunda nokta bulunan kısaltmalarla üs işaretli kısaltmalara gelen ekler kesmeyle ayrılmaz: vb.leri, No.lu, cm³e.', 'hata', 'noktalama', K('13.6.5.1, Not 2'), ['']));
    }
    return out;
  },
};

// ── §13.6.7 Sayılar ─────────────────────────────────────────────────────

const NUMBER_WORDS = ['milyon', 'milyar', 'seksen', 'doksan', 'yetmiş', 'altmış', 'sekiz', 'dokuz', 'yirmi', 'otuz', 'kırk', 'elli', 'dört', 'altı', 'yedi', 'bir', 'iki', 'üç', 'beş', 'yüz', 'bin', 'on'];
const NUMBER_TAILS = new Set([
  '', 'ncı', 'nci', 'ncu', 'ncü', 'ıncı', 'inci', 'uncu', 'üncü', 'er', 'ar', 'şer', 'şar', 'i', 'ı', 'u', 'ü', 'si', 'sı', 'su', 'sü',
  'e', 'a', 'ye', 'ya', 'de', 'da', 'te', 'ta', 'den', 'dan', 'ten', 'tan', 'in', 'ın', 'un', 'ün', 'nin', 'nın', 'nun', 'nün',
  'lik', 'lık', 'luk', 'lük', 'li', 'lı', 'lu', 'lü', 'lerce', 'larca', 'ler', 'lar',
]);

/** "ikiyüzelli" → ["iki","yüz","elli"] + ek; en az iki sayı kelimesi */
function segmentNumber(w: string, pos = 0, parts: string[] = []): { parts: string[]; tail: string } | null {
  if (parts.length >= 2 && NUMBER_TAILS.has(w.slice(pos))) return { parts, tail: w.slice(pos) };
  for (const nw of NUMBER_WORDS) {
    if (!w.startsWith(nw, pos)) continue;
    const r = segmentNumber(w, pos + nw.length, [...parts, nw]);
    if (r) return r;
  }
  return null;
}

const sayilar: Rule = {
  id: 'kilavuz.sayi',
  check({ text, tokens }) {
    const out: Issue[] = [];
    const ref = K('13.6.7');
    for (const m of text.matchAll(/%[ \u00A0]+(?=\d)/g)) {
      out.push(mk(text, 'kilavuz.sayi.yuzde', m.index!, m.index! + m[0].length, 'Yüzde ve binde işaretiyle sayı arasında boşluk bırakılmaz: %25.', 'hata', 'noktalama', ref, ['%']));
    }
    for (const m of text.matchAll(/(?<![\d.,])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)[ \u00A0]?%(?![\d\p{L}])/gu)) {
      out.push(mk(text, 'kilavuz.sayi.yuzde', m.index!, m.index! + m[0].length, 'Türkçede yüzde işareti sayıdan önce yazılır: %25.', 'hata', 'noktalama', ref, ['%' + m[1]]));
    }
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind === 'number') {
        // Üleştirme: 2'şer → ikişer
        const m = /^(\d{1,3}(?:\.\d{3})+|\d+)['’]?(şer|şar|er|ar)$/.exec(t.text);
        if (!m) continue;
        const n = Number(m[1]!.replace(/\./g, ''));
        const words = distributiveWords(n);
        if (!words) continue;
        // Para tutarı rakamla yazılır (§13.6.7): "2.500'er TL" dokunulmaz
        const unit = tokens[i + 1]?.text === ' ' ? tokens[i + 2] : undefined;
        if (isWord(unit) && /^(?:tl|lira|kuruş|avro|euro|dolar)/i.test(unit.text)) continue;
        out.push(mk(text, 'kilavuz.sayi.ulestirme', t.start, t.end, 'Üleştirme sayıları rakamla değil yazıyla belirtilir: 2’şer değil ikişer, 100’er değil yüzer.', n >= 1000 ? 'uyari' : 'hata', 'yazim', ref, [words]));
        continue;
      }
      if (t.kind !== 'word' || !isLowerLetter(t.text[0]!) || t.text.length < 5) continue;
      const lw = trLower(t.text);
      const seg = segmentNumber(lw);
      if (!seg || isValidWord(lw)) continue;
      // Çek/senet gibi ticari belgelerde ayraç içindeki tutar bitişik yazılır (§13.6.7)
      const before = text.slice(Math.max(0, t.start - 40), t.start);
      if (/\([^)]*$/.test(before)) continue;
      out.push(mk(text, 'kilavuz.sayi.ayri', t.start, t.end, 'Birden fazla kelimeden oluşan sayılar ayrı yazılır: iki yüz, bin iki yüz elli bir.', 'hata', 'yazim', ref, [seg.parts.join(' ') + seg.tail]));
    }
    return out;
  },
};

// ── §13.6.8 Nispet î'si ─────────────────────────────────────────────────

const NISPET = new Set(['resmi', 'askeri', 'dini', 'ilmi', 'milli']);
const FUNCTION_WORD = new Set(['ve', 'ile', 'veya', 'ya', 'de', 'da', 'ki', 'mi', 'gibi', 'kadar', 'için', 'bu', 'şu', 'o']);
const FINITE = /(?:[dt][ıiuü]r|m[ıiuü]şt[ıiuü]r|[dt][ıiuü]|yor\p{Ll}*|c[ae]k(?:t[ıi]r)?|m[ae]l[ıi](?:d[ıi]r)?|m[ae]kt[ae]d[ıi]r)$/u;

const nispet: Rule = {
  id: 'kilavuz.nispet',
  check({ text, tokens }) {
    const out: Issue[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind !== 'word') continue;
      const lw = trLower(t.text);
      if (!NISPET.has(lw)) continue;
      const atStart = isSentenceStart(tokens, i);
      if (!spaced(tokens, i)) continue;
      const n = tokens[i + 2]!;
      // Resmî Gazete: adının yazımı düzeltme işaretlidir
      if (lw === 'resmi' && isCap(t.text) && n.text.startsWith('Gazete')) {
        out.push(mk(text, 'kilavuz.nispet', t.start, t.end, 'Gazetenin adı “Resmî Gazete” biçiminde yazılır.', 'oneri', 'yazim', K('13.6.8'), ['Resmî']));
        continue;
      }
      if (isCap(t.text) && !atStart) continue; // "Milli Eğitim Bakanlığı": kurumun tescilli adı
      const nl = trLower(n.text);
      if (!isLowerLetter(n.text[0]!) || FUNCTION_WORD.has(nl) || FINITE.test(nl) || /['’]/.test(n.text)) continue;
      // "Atatürk'ün resmi", "Türk askeri", "İslam dini": iyelik okuması
      const p = tokens[i - 1]?.text === ' ' ? tokens[i - 2] : undefined;
      // Önceki büyük harfli kelime ad mı ("Türk askeri", "İslam dini") yoksa yalnızca cümle başı mı ("Tüm askeri birlikler")
      const pIsName = isWord(p) && isCap(p.text) && (!isSentenceStart(tokens, i - 2) || !isValidWord(trLower(p.text)) || PROPER_NOUNS.has(trLower(p.text)));
      if (!atStart && isWord(p) && (/['’]/.test(p.text) || pIsName || /n?[ıiuü]n$/.test(trLower(p.text)))) continue;
      out.push(
        mk(text, 'kilavuz.nispet', t.start, t.end, `Nispet eki, iyelik ve belirtme ekiyle karışmasın diye düzeltme işaretiyle yazılır: “${lw.slice(0, -1)}î” (ör. resmî yazı, askerî okul). “Onun resmi” anlamındaysa yoksayın.`, 'oneri', 'yazim', K('13.6.8'), [t.text.slice(0, -1) + 'î'], { autoFix: false }),
      );
    }
    return out;
  },
};

// ── §13.6.9.6 Tırnaktan sonra kesme ─────────────────────────────────────

const tirnak: Rule = {
  id: 'kilavuz.tirnak',
  check({ text }) {
    const out: Issue[] = [];
    for (const m of text.matchAll(/[”"](['’])(?=\p{Ll})/gu)) {
      const at = m.index! + 1;
      out.push(mk(text, 'kilavuz.tirnak.kesme', at, at + 1, 'Tırnak içine alınan sözlerden sonra gelen ekler kesmeyle ayrılmaz: “Devlet Memurları Kanunu”na.', 'hata', 'noktalama', K('13.6.9.6'), ['']));
    }
    return out;
  },
};

// ── Belge düzeni: İlgi kalıbı, kapanış, muhatap, ek, süreli yazı, tekit, imza ──

const DATIVE = /(?:[IİUÜ]N[AE]|[AEIİOÖUÜ]Y[AE]|\.Y[AE])$/u;
/** Belgede açıkça istenen cevap süresi (ACELE ile çelişir) */
const NUM_WORD = '(?:\\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|on beş|yirmi|otuz|kırk|elli|altmış|doksan)';
const DEADLINE = new RegExp(
  `en geç|tarihine kadar|tarihe kadar|\\d{4}['’]?y?[ae] kadar|sonuna kadar|${NUM_WORD}\\s*(?:\\(\\p{L}+\\)\\s*)?(?:iş\\s+)?(?:gün|hafta|ay)(?:ü|lük|lık)?\\s+(?:içinde|içerisinde)`,
  'iu',
);
/** GÜNLÜDÜR için daha geniş: herhangi bir süre anıştırması yeterli */
const DEADLINE_ANY = new RegExp(`${DEADLINE.source}|süre(?:si)?\\s+içinde|(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)['’]\\p{Ll}*\\s+kadar`, 'iu');
/** ACELE ile çelişen süre bir CEVAP süresidir: yakınında cevap fiili olmalı, dönem anlatımı olmamalı */
const REPLY = /gönderil|bildiril|iletil|cevap|yanıt|sunul/i;

const belge: Rule = {
  id: 'kilavuz.belge',
  check({ text }) {
    const out: Issue[] = [];
    const ap = aposOf(text);
    const lines = linesOf(text);

    // §12.1: "… tarihli ve … sayılı" — "ve" eksik
    for (const m of text.matchAll(/(?<![\p{L}])(tarihli)(?=\s+(?:[EZO]-\d|\d+\s+sayılı))/gu)) {
      out.push(mk(text, 'kilavuz.ilgi.tarihli-ve', m.index!, m.index! + 7, 'Kalıp “… tarihli ve … sayılı …” biçimindedir.', 'hata', 'bicim', `${Y('15(7)')}, ${K('12.1')}`, ['tarihli ve']));
    }
    // §13.1: "rica" alt düzeye; "bilgilerinize" üst düzeye hitaptır
    for (const m of text.matchAll(/(?<![\p{L}])((?:[Gg]ereğini\s+)?)([Bb]ilgilerinize)(\s+)rica(?=\s+ederim)/gu)) {
      const fixed = m[1] ? `${m[1][0] === 'G' ? 'Bilgilerini' : 'bilgilerini'} ve gereğini${m[3]}rica` : `${m[2]![0] === 'B' ? 'Bilgilerini' : 'bilgilerini'}${m[3]}rica`;
      out.push(mk(text, 'kilavuz.kapanis.bilgi', m.index!, m.index! + m[0].length, '“Rica ederim” alt düzeye yazılır; bu durumda kalıp “Bilgilerini rica ederim.” / “Bilgilerini ve gereğini rica ederim.” biçimindedir. (“Bilgilerinize” üst ve aynı düzeyde “arz ederim” ile kullanılır.)', 'oneri', 'bicim', K('13.1'), [fixed]));
    }
    // §13.2: metin içinde ilgi gösterimi "İlgi (a)’da", "İlgi’de"
    for (const m of text.matchAll(/(?<![\p{L}])ilgi(?=\s*\([a-zçğıöşü](?:\s*(?:[-,]|ve)\s*\(?[a-zçğıöşü])*\))/gu)) {
      out.push(mk(text, 'kilavuz.ilgi.gosterim', m.index!, m.index! + 4, 'Metin içinde ilgiye atıf “İlgi (a)’da kayıtlı yazı” biçiminde yazılır.', 'oneri', 'bicim', K('13.2'), ['İlgi']));
    }
    for (const m of text.matchAll(/(?<![\p{L}])[İi]lgi\s*(\([a-zçğıöşü](?:\s*(?:[-,]|ve)\s*\(?[a-zçğıöşü])*\))(\p{Ll}+)/gu)) {
      const at = m.index! + m[0].length - m[2]!.length;
      out.push(mk(text, 'kilavuz.ilgi.gosterim', at, at + m[2]!.length, 'Ayraçtan sonra gelen ek kesmeyle ayrılır: “İlgi (a)’da”.', 'oneri', 'bicim', K('13.2'), [ap + m[2]]));
    }
    for (const m of text.matchAll(/(?<![\p{L}])([İi]lgi)(de|deki)(?=\s+(?:kayıtlı|kayıtla))/gu)) {
      out.push(mk(text, 'kilavuz.ilgi.gosterim', m.index!, m.index! + m[0].length, 'Tek ilgiye atıf “İlgi’de kayıtlı yazı” biçiminde yazılır.', 'oneri', 'bicim', K('13.2'), ['İlgi' + ap + m[2]]));
    }
    // §13.3: "Ek’te yer alan", "Ek-1’de"
    for (const m of text.matchAll(/(?<![\p{L}-])([Ee]k)(te|teki)(?=\s+yer\s+al)/gu)) {
      out.push(mk(text, 'kilavuz.ek.gosterim', m.index!, m.index! + m[0].length, 'Metinde tek eke atıf “Ek’te yer alan” biçiminde yazılır.', 'oneri', 'bicim', K('13.3'), ['Ek' + ap + m[2]]));
    }
    for (const m of text.matchAll(/(?<![\p{L}])Ek[ \u00A0]+(\d+)(?=['’](?![ıiuü]?nc)\p{Ll})/gu)) {
      out.push(mk(text, 'kilavuz.ek.gosterim', m.index!, m.index! + m[0].length, 'Birden fazla ekte atıf “Ek-1’de belirtilen” biçiminde yazılır.', 'oneri', 'bicim', K('13.3'), [`Ek-${m[1]}`]));
    }

    // §11.4 Muhatap
    const nonEmpty = lines.map((l, k) => ({ l, k })).filter(({ l }) => l.text.trim() !== '');
    for (let x = 0; x < nonEmpty.length; x++) {
      const cur = nonEmpty[x]!.l;
      const nxt = nonEmpty[x + 1]?.l;
      const t = cur.text.trim();
      const lead = cur.text.length - cur.text.trimStart().length;
      if (t === 'T.C.' && nxt && isAllCaps(nxt.text) && DATIVE.test(nxt.text.trim())) {
        out.push(mk(text, 'kilavuz.muhatap.tc', cur.start + lead, cur.start + lead + 4, 'Muhatap bilgisinde “T.C.” ibaresine yer verilmez; muhatap, başlık gibi yazılmaz.', 'hata', 'bicim', K('11.4'), ['']));
      }
      if (!nxt) continue;
      const nt = nxt.text.trim();
      const nLead = nxt.text.length - nxt.text.trimStart().length;
      const paren = /^\((.+)\)$/.exec(nt);
      if (!paren || !isAllCaps(t)) continue;
      const inner = paren[1]!;
      if (DATIVE.test(t)) {
        // Parantez içinde birim zinciri: "(İdari İşler Başkanlığı - Hukuk ve Mevzuat Genel Müdürlüğü)"
        const dash = /\s[-–]\s/.exec(inner);
        const lastWordLower = (x: string) => trLower(/(\S+)\s*$/.exec(x)?.[1] ?? '');
        if (dash && KURUM_HEAD.test(lastWordLower(inner.slice(0, dash.index))) && KURUM_HEAD.test(lastWordLower(inner))) {
          const at = nxt.start + nLead + 1 + dash.index;
          out.push(mk(text, 'kilavuz.muhatap.zincir', at, at + dash[0].length, 'Muhatapta parantez içinde birim zinciri yazılmaz: bağlı idare ilk satıra alınır, parantez içinde yalnızca birimi yazılır (ör. CUMHURBAŞKANLIĞI İDARİ İŞLER BAŞKANLIĞINA / (Hukuk ve Mevzuat Genel Müdürlüğü)).', 'uyari', 'bicim', K('11.4')));
        }
      } else if (/[ıiuü]n[ae]$/.test(inner) && !isAllCaps(inner) && /[IİUÜ]$/.test(t)) {
        // Yönelme eki parantezdeki birime değil ilk satırdaki idareye
        const naAt = nxt.start + nLead + 1 + inner.length - 2;
        out.push(mk(text, 'kilavuz.muhatap.yonelme', naAt, naAt + 2, 'Muhatapta yönelme hâl eki ilk satırdaki idare adına getirilir; parantez içindeki birim yalın yazılır.', 'hata', 'bicim', K('11.4'), ['']));
        const lastWord = /(\S+)\s*$/.exec(cur.text)!;
        const wAt = cur.start + lastWord.index;
        out.push(mk(text, 'kilavuz.muhatap.yonelme', wAt, wAt + lastWord[1]!.length, 'Muhatabın ilk satırı yönelme hâl ekiyle biter (… BAKANLIĞINA).', 'hata', 'bicim', K('11.4'), [lastWord[1]! + (isBack(trLower(lastWord[1]!)) ? 'NA' : 'NE')]));
      }
    }
    // Gerçek kişi muhataba yönelme eki konmaz: "Sayın Ahmet YILMAZ'A"
    for (const m of text.matchAll(/Sayın[ \u00A0]+[^\n\t]*?\p{Lu}{2,}(['’]Y?[AE])(?![\p{L}])/gu)) {
      const at = m.index! + m[0].length - m[1]!.length;
      out.push(mk(text, 'kilavuz.muhatap.kisi', at, at + m[1]!.length, 'Muhatap gerçek kişiyse yönelme hâl ekine yer verilmez: “Sayın Ahmet YILMAZ”.', 'hata', 'bicim', K('11.4'), ['']));
    }

    for (const ln of lines) {
      const m = /^(\s*Sayın\s+(?:\p{Lu}\p{Ll}+\s+)+)(\p{Lu}{4,}?)(Y?[AE])\s*$/u.exec(ln.text);
      if (!m || !isValidWord(trLower(m[2]!))) continue;
      const at = ln.start + m[1]!.length;
      out.push(mk(text, 'kilavuz.muhatap.kisi', at, at + m[2]!.length + m[3]!.length, 'Muhatap gerçek kişiyse yönelme hâl ekine yer verilmez: “Sayın Ahmet YILMAZ”. Soyadın kendisi bu harfle bitiyorsa yoksayın.', 'uyari', 'bicim', K('11.4'), [m[2]!]));
    }

    // §15 Ek: niteliğine göre sayısal bilgi "(2 Sayfa)", "(1 Adet)", "(20 Kişi)"
    for (let k = 0; k < lines.length; k++) {
      const head = /^(\s*Ek(?:ler)?\s*:\s*)(.*)$/.exec(lines[k]!.text);
      if (!head) continue;
      const items: Array<{ start: number; text: string }> = [];
      if (head[2]!.trim()) items.push({ start: lines[k]!.start + head[1]!.length, text: head[2]!.trimEnd() });
      for (let j = k + 1; j < lines.length && /^\s*\d+\s*-/.test(lines[j]!.text); j++) {
        const m = /^(\s*\d+\s*-\s*)(.*)$/.exec(lines[j]!.text)!;
        items.push({ start: lines[j]!.start + m[1]!.length, text: m[2]!.trimEnd() });
      }
      for (const it of items) {
        if (!it.text || /\([^)]*\d/.test(it.text) || /\d+\s*(?:Sayfa|Adet|Kişi|Dosya|Klasör|Kutu|Nüsha|Takım|CD|DVD)/i.test(it.text) || /(?:Ek|Dağıtım)\s+Listesi/i.test(it.text)) continue;
        out.push(mk(text, 'kilavuz.ek.sayi', it.start, it.start + it.text.length, 'Ekin niteliğine göre sayısal bilgi verilir: “(2 Sayfa)”, “(1 Adet)”, kişi listesinde “(20 Kişi)”.', 'oneri', 'bicim', `${Y('18')}, ${K('15')}`));
      }
    }

    // §23 Süreli yazı
    const ibare = /(?<![\p{L}])(ACELE|GÜNLÜDÜR)(?![\p{L}])/u.exec(text);
    if (ibare) {
      const at = ibare.index;
      const word = ibare[1]!;
      const ref = `${Y('26')}, ${K('23')}`;
      if (/(?:^|\n)\s*OLUR\s*(?:\n|$)/.test(text)) {
        out.push(mk(text, 'kilavuz.sureli.olur', at, at + word.length, 'Olur belgelerinde “ACELE” veya “GÜNLÜDÜR” ibaresi kullanılmaz: oluru alınacak makama talimat veriliyormuş gibi anlam oluşur.', 'uyari', 'bicim', ref));
      } else if (word === 'GÜNLÜDÜR' && !DEADLINE_ANY.test(text)) {
        out.push(mk(text, 'kilavuz.sureli.sure', at, at + word.length, '“GÜNLÜDÜR” ibareli belgede cevap verilmesi gereken süre ya da tarih metin içinde belirtilir (ör. “… tarihine kadar”, “15 gün içinde”).', 'uyari', 'bicim', ref));
      } else if (word === 'ACELE' && DEADLINE.test(text)) {
        const d = DEADLINE.exec(text)!;
        const around = text.slice(Math.max(0, d.index - 60), d.index + d[0].length + 80);
        if (!REPLY.test(around) || /tarihinden|itibaren/.test(around)) return out;
        out.push(mk(text, 'kilavuz.sureli.sure', d.index, d.index + d[0].length, '“ACELE” ibareli belgede süre belirtilmez; belirli bir süre isteniyorsa “GÜNLÜDÜR” ibaresi kullanılır.', 'uyari', 'bicim', ref));
      }
    }

    // §30 Tekit yazısı
    const tekit = /(?<![\p{L}])[Tt]eki[td]\p{Ll}*/u.exec(text);
    if (tekit) {
      const ref = `${Y('34')}, ${K('30')}`;
      if (!/(?:^|\n)\s*İlgi\s*:/.test(text)) {
        out.push(mk(text, 'kilavuz.tekit.ilgi', tekit.index, tekit.index + tekit[0].length, 'Tekit yazısında daha önce gönderilen yazının ilgi tutulması zorunludur.', 'uyari', 'bicim', ref));
      }
      const arz = /(?<![\p{L}])[Aa]rz ederim/u.exec(text);
      if (arz && !/rica ederim/i.test(text)) {
        out.push(mk(text, 'kilavuz.tekit.duzey', arz.index, arz.index + arz[0].length, 'Kılavuz: tekit yazıları amacı itibarıyla alt idarelere yazılır, üst seviyedeki kurumlara yazılmaz. “Arz ederim” üst ya da aynı düzeye işaret eder; muhatap üst düzeydeyse tekit yerine yeni bir talep yazısı düşünün. (Şubat 2025 baskısı aynı düzeyi açıkça sayar.)', 'oneri', 'bicim', ref));
      }
    }

    // §14.2 İmza ve §11.3 muhatap: ad kısaltılmaz ("Mehmet A. YILMAZ", "Sayın M. YILMAZ")
    for (const ln of lines) {
      const m = /^(\s*(?:Sayın\s+)?(?:\p{Lu}\p{Ll}+\s+)?)(\p{Lu}\.)\s+(?:\p{Lu}\p{Ll}+\s+)?\p{Lu}{2,}\s*$/u.exec(ln.text);
      if (!m) continue;
      const at = ln.start + m[1]!.length;
      out.push(mk(text, 'kilavuz.imza.ad', at, at + 2, 'Ad ve soyad kısaltılmadan açık yazılır (yalnızca akademik unvan ve askerî rütbe kısaltılabilir).', 'uyari', 'bicim', `${Y('17')}, ${K('14.2')}`));
    }
    return out;
  },
};

// ── m.16(4) Paragraflar arasında satır boşluğu ──────────────────────────

/** Belge altındaki e-imza doğrulama notu metin paragrafı değildir */
const E_IMZA_NOTE = /^Bu belge,? güvenli elektronik imza/;
const NOT_BODY = /^(?:(?:Sayı|Konu|İlgi|Ek|Ekler|Dağıtım|Gereği|Bilgi|Not)\s*:|[a-zçğıöşü]\)\s)/;
function isBodyParagraph(t: string): boolean {
  if (t.length < 40 || !/[.;]$/.test(t) || NOT_BODY.test(t) || E_IMZA_NOTE.test(t)) return false;
  return t.split(' ').length >= 6 && /\p{Ll}/u.test(t.slice(0, 80)); // tamamı büyük harf satır: başlık/muhatap
}

/**
 * Boş paragraf, TextIndex'te iki ardışık blok ayırıcısı ("\n\n") olarak görünür.
 * Başlık, muhatap, ilgi ve imza blokları arasındaki boşluk olağandır; yalnızca
 * iki METİN paragrafı arasındaki boşluk işaretlenir.
 */
const bosParagraf: Rule = {
  id: 'kilavuz.paragraf',
  check({ text }) {
    const out: Issue[] = [];
    for (const m of text.matchAll(/\n(?:[ \u00A0]*\n)+/g)) {
      const prevStart = text.lastIndexOf('\n', m.index! - 1) + 1;
      const prev = text.slice(prevStart, m.index!).trim();
      const nStart = m.index! + m[0].length;
      let nEnd = text.indexOf('\n', nStart);
      if (nEnd < 0) nEnd = text.length;
      const next = text.slice(nStart, nEnd);
      if (prev.includes(SEP_CELL) || next.includes(SEP_CELL) || !isBodyParagraph(prev) || !isBodyParagraph(next.trim())) continue;
      const w = /\S+/.exec(next)!;
      const at = nStart + w.index;
      out.push(mk(text, 'kilavuz.paragraf.bosluk', at, at + w[0].replace(/[.,;:]$/, '').length, 'Metin paragrafları arasında satır boşluğu bırakılmaz; bu paragraftan önceki boş satırı silin.', 'uyari', 'bicim', `${Y('16(4)')}, ${K('31')}`));
    }
    return out;
  },
};

export const KILAVUZ_RULES: Rule[] = [kesmeCins, mevzuatKesme, baglacTe, virgul, anlatim, sahsi, bitisik, buyukHarf, kisaltma, sayilar, nispet, tirnak, belge, bosParagraf];
