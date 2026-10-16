import type { Issue, Rule, Severity } from '../types.ts';
import { harmonize2, harmonize4, harmonyOf, lastVowel, matchCase, trLower } from '../turkish.ts';

/**
 * Ayrı yazılması gereken bağlaç ve ekler: "de/da" bağlacı, "ki" bağlacı, "mi" soru eki.
 *
 * ── Asıl zorluk ──────────────────────────────────────────────────────────
 * Bu üçünün her biri aynı biçimdeki bir EKLE çakışır:
 *   de/da  ↔ bulunma hâli eki        evde, maddede, ifadede, adada
 *   ki     ↔ sıfat yapan -ki         evdeki, şimdiki, yarınki
 *   mi     ↔ iyelik + belirtme       resmi (resim+i), ismi, kısmı, elmamı
 *
 * "Sonu -de ile biten kelimede bağlaç ayrı yazılır" gibi bir kural
 * "maddede" ve "ifadede"yi de işaretler — resmî yazıda en sık geçen
 * kelimelerden ikisi. "Sonu -mi ile biten" kuralı "resmi yazı"yı işaretler.
 *
 * ── Bu dosyanın yaklaşımı: yalnızca kesin olduğumuz yerler ──────────────
 *  1. KAPALI SINIF gövdeler: zaten hâl eki almış zamirler (bana, onu, bunun),
 *     zarflar (şimdi, sonra, daha). Bunlara bulunma eki gelemez; sondaki -da
 *     ancak bağlaçtır.
 *  2. ÇEKİMLİ FİİL kalıpları: -yor, -mış, -acak, -malı ile biten bir gövdeye
 *     isim eki gelmez; ardından gelen ki/mi bağlaç veya soru ekidir.
 *  3. BELİRSİZ ama yaygın: bende/sende/bizde → "ben de" mi, "bende (bende
 *     kalsın)" mı? Anlam gerekir; yalnızca uyarı.
 *
 * Açık sınıf isimler ve fiiller ("kitabıda", "geldide") için bu dosya yetmez;
 * onları yazim-sozluk.ts çözer: kelime bütün hâliyle geçersiz, gövdesi
 * geçerliyse sondaki ek bağlaçtır.
 */

// ── de / da ─────────────────────────────────────────────────────────────

/** Bulunma eki alamayan gövdeler: sondaki -da/-de kesinlikle bağlaçtır */
const DE_CLOSED = new Set([
  // Zamirlerin yönelme / belirtme / ilgi hâlleri
  'bana', 'sana', 'ona', 'bize', 'size', 'onlara',
  'beni', 'seni', 'onu', 'bizi', 'sizi', 'onları',
  'benim', 'senin', 'onun', 'bizim', 'sizin', 'onların',
  'buna', 'şuna', 'bunu', 'şunu', 'bunun', 'şunun',
  'bunlara', 'şunlara', 'bunları', 'şunları', 'bunların', 'şunların',
  'kendine', 'kendini', 'kendinin', 'kendisine', 'kendisini', 'kendisinin',
  'birine', 'birini', 'herkese', 'herkesi', 'herkesin',
  // Zaten bulunma hâlinde olan zamirler: üstüne ikinci bulunma eki gelmez
  'burada', 'şurada', 'orada', 'nerede',
  // Zarf ve bağlaçlar
  'şimdi', 'sonra', 'önce', 'daha', 'hem', 'ama', 'fakat', 'ancak', 'yine', 'gene',
  'böyle', 'şöyle', 'öyle', 'hatta', 'belki', 'zaten', 'yani', 'ayrıca', 'üstelik',
  // Bilinçli olarak YOK: bugün/yarın/dün ("dünde kalmak" meşru bulunma hâli)
]);

/** Gerçekten iki anlamlı: "ben de geldim" ↔ "kitap bende" */
const DE_AMBIGUOUS = new Map([
  ['ben', 'bende'], ['sen', 'sende'], ['biz', 'bizde'], ['siz', 'sizde'], ['onlar', 'onlarda'],
]);

function deBaglaci(tokens: { kind: string; text: string; start: number; end: number }[]): Issue[] {
  const issues: Issue[] = [];
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const w = trLower(t.text);
    const m = /^(.+?)([dt][ae])$/.exec(w);
    if (!m) continue;
    const stem = m[1]!;
    let severity: Severity | null = null;
    let message = '';

    if (DE_CLOSED.has(stem)) {
      severity = 'hata';
      message = '“de/da” bağlacı ayrı yazılır. Bu kelime bulunma eki alamayacağı için sondaki “-da/-de” bağlaçtır.';
    } else if (DE_AMBIGUOUS.has(stem) && DE_AMBIGUOUS.get(stem) === w) {
      severity = 'uyari';
      message = `“Dahi, bile” anlamındaysa ayrı yazılır: “${stem} de”. “${w}” (ör. “dosya ${w} kalsın”) anlamındaysa doğrudur.`;
    }
    if (!severity) continue;

    // Bağlaç "de" ünlü uyumuna uyar ama sertleşmez: "kitap da", "kitap ta" değil
    const lv = lastVowel(stem);
    const conj = 'd' + (lv ? harmonize2(harmonyOf(lv)) : 'e');
    const stemOrig = t.text.slice(0, stem.length);
    issues.push({
      ruleId: 'baglac.de',
      start: t.start,
      end: t.end,
      text: t.text,
      message,
      severity,
      category: 'kural',
      suggestions: [`${matchCase(stemOrig, stem)} ${conj}`],
    });
  }
  return issues;
}

// ── ki ──────────────────────────────────────────────────────────────────

const PERSON = '(?:[ıiuü]m|s[ıiuü]n|[ıiuü]z|s[ıiuü]n[ıiuü]z|l[ae]r|m|n|k|n[ıiuü]z)?';
/** Çekimli fiil gövdesi + ki. -yor/-mış/-acak/-malı ile biten bir isim gövdesi yoktur. */
const KI_VERB = new RegExp(`^(.+(?:yor|m[ıiuü]ş|[ae]c[ae]k|m[ae]l[ıi])${PERSON})k[iıuü]$`);
const KI_CLOSED = new Map([
  ['olurki', 'olur'], ['olmazki', 'olmaz'], ['derki', 'der'], ['değilki', 'değil'],
  ['varki', 'var'], ['yokki', 'yok'], ['gerekki', 'gerek'], ['gerekirki', 'gerekir'],
  ['şuki', 'şu'], ['bilki', 'bil'], ['dinleki', 'dinle'],
]);
/** Sıfat yapan -ki ile biten, kalıplara uyan meşru kelimeler */
const KI_EXCEPTIONS = new Set(['şimdiki', 'şimdikiler', 'ötekiki']);

function kiBaglaci(tokens: { kind: string; text: string; start: number; end: number }[]): Issue[] {
  const issues: Issue[] = [];
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const w = trLower(t.text);
    if (KI_EXCEPTIONS.has(w) || w.length < 5) continue;
    let stem = KI_CLOSED.get(w);
    const severity: Severity = 'hata';
    if (!stem) {
      const m = KI_VERB.exec(w);
      if (m && m[1]!.length >= 3) stem = m[1]!;
    }
    if (!stem) continue;
    issues.push({
      ruleId: 'baglac.ki',
      start: t.start,
      end: t.end,
      text: t.text,
      message: '“ki” bağlacı ayrı yazılır. (Bitişik yazılan “-ki” yalnızca sıfat yapan ektir: evdeki, şimdiki.)',
      severity,
      category: 'kural',
      suggestions: [`${matchCase(t.text.slice(0, stem.length), stem)} ki`],
    });
  }
  return issues;
}

// ── mi ──────────────────────────────────────────────────────────────────

/** Soru ekinin kendi çekimi: mi, misin, miyim, miyiz, misiniz, midir, miydi… */
const MI_TAIL = '(m[ıiuü](?:y[ıiuü]m|s[ıiuü]n|y[ıiuü]z|s[ıiuü]n[ıiuü]z|d[ıiuü]r|y[ıiuü]d[ıiuü](?:m|n|k|n[ıiuü]z|l[ae]r)?|yd[ıiuü]|ym[ıiuü]ş)?)';
const MI_VERB = new RegExp(`^(.+(?:yor|m[ıiuü]ş|[ae]c[ae]k|m[ae]l[ıi])${PERSON})${MI_TAIL}$`);
const MI_CLOSED_STEMS = new Set([
  'var', 'yok', 'değil', 'olur', 'olmaz', 'tamam', 'doğru', 'öyle', 'böyle', 'şöyle',
  'mümkün', 'gerek', 'lazım', 'uygun', 'yeterli', 'gerekli',
]);
const MI_ONLY = new RegExp(`^${MI_TAIL}$`);
const MI_CLOSED = new RegExp(`^(${[...MI_CLOSED_STEMS].join('|')})${MI_TAIL}$`);

/** Soru eki çekimine biçimce uyan ama gerçek kelime olanlar */
const MI_LOOKALIKES = new Set(['müdür', 'mısır', 'misin']);

/** Soru ekinin ünlüsünü gövdeye uydurur: "geliyormi" → "geliyor mu" */
function harmonizeParticle(stem: string, particle: string): string {
  const lv = lastVowel(stem);
  if (!lv) return particle;
  let prev = harmonyOf(lv);
  let out = '';
  for (const ch of particle) {
    if ('ıiuü'.includes(ch)) {
      const v = harmonize4(prev);
      out += v;
      prev = harmonyOf(v);
    } else out += ch;
  }
  return out;
}

function miSoruEki(tokens: { kind: string; text: string; start: number; end: number }[]): Issue[] {
  const issues: Issue[] = [];
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const w = trLower(t.text);
    const m = MI_CLOSED.exec(w) ?? MI_VERB.exec(w);
    if (!m) continue;
    const stem = m[1]!;
    const particle = harmonizeParticle(stem, m[m.length - 1]!);
    issues.push({
      ruleId: 'baglac.mi',
      start: t.start,
      end: t.end,
      text: t.text,
      message: '“mi” soru eki her zaman ayrı yazılır; ünlüsü kendinden önceki kelimeye uyar.',
      severity: 'hata',
      category: 'kural',
      suggestions: [`${matchCase(t.text.slice(0, stem.length), stem)} ${particle}`],
    });
  }
  return issues;
}

export const baglacKurallari: Rule = {
  id: 'baglac',
  check({ tokens }) {
    return [...deBaglaci(tokens), ...kiBaglaci(tokens), ...miSoruEki(tokens)];
  },
};

/** Ayrı yazılmış soru ekinin ünlü uyumu: "geliyor mi" → "geliyor mu" */
export const miUyum: Rule = {
  id: 'baglac.mi-uyum',
  check({ tokens }) {
    const issues: Issue[] = [];
    for (let i = 0; i + 2 < tokens.length; i++) {
      const a = tokens[i]!;
      const sp = tokens[i + 1]!;
      const b = tokens[i + 2]!;
      if (a.kind !== 'word' || sp.kind !== 'space' || b.kind !== 'word') continue;
      const p = trLower(b.text);
      // "Genel Müdür": müdür = "mü + dür" biçimine de uyar; büyük harfli kelime soru eki olamaz
      if (b.text[0] !== p[0] || MI_LOOKALIKES.has(p)) continue;
      if (!MI_ONLY.test(p)) continue;
      const fixed = harmonizeParticle(trLower(a.text), p);
      if (fixed === p) continue;
      issues.push({
        ruleId: 'baglac.mi-uyum',
        start: b.start,
        end: b.end,
        text: b.text,
        message: `Soru eki, kendinden önceki kelimenin ünlüsüne uyar: “${a.text} ${fixed}”.`,
        severity: 'hata',
        category: 'kural',
        suggestions: [matchCase(b.text, fixed)],
      });
    }
    return issues;
  },
};
