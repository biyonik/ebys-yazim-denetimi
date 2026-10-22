import type { DocMeta, Issue, Rule, Severity } from './types.ts';
import { tokenize } from './tokenizer.ts';
import { kesmeSayi } from './rules/kesme-sayi.ts';
import { kesmeOzelAd } from './rules/kesme-ozel-ad.ts';
import { ciftBosluk, noktalamaOncesiBosluk, noktalamaSonrasiBosluk } from './rules/bosluk-noktalama.ts';
import { kelimeTekrari } from './rules/tekrar.ts';
import { yayginYanlislar } from './rules/yaygin-yanlislar.ts';
import { birlesikFiil, birlesikFiilBitisik } from './rules/birlesik-fiil.ts';
import { baglacKurallari, miUyum } from './rules/baglac.ts';
import { buyukHarf } from './rules/buyuk-harf.ts';
import { yazimSozluk } from './rules/yazim-sozluk.ts';
import { kurumAdi } from './rules/kurum-adi.ts';
import { kapanisHiyerarsi } from './rules/kapanis-hiyerarsi.ts';
import { YONETMELIK_RULES } from './rules/yonetmelik.ts';
import { KILAVUZ_RULES } from './rules/kilavuz.ts';
import { capitalizeTr, isLowerLetter } from './turkish.ts';

/**
 * Sıra, çakışma çözümünde eşitlik bozucudur: aynı aralık ve aynı önem derecesinde
 * önce gelen kural kazanır. Kılavuz kuralları en özgül olanlardır ("2şer" için
 * "2'şer" değil "ikişer"), bu yüzden başta.
 */
export const DEFAULT_RULES: Rule[] = [
  kapanisHiyerarsi,
  ...KILAVUZ_RULES,
  yayginYanlislar,
  birlesikFiil,
  birlesikFiilBitisik,
  baglacKurallari,
  miUyum,
  kesmeOzelAd,
  kesmeSayi,
  noktalamaOncesiBosluk,
  noktalamaSonrasiBosluk,
  ciftBosluk,
  kelimeTekrari,
  buyukHarf,
  kurumAdi,
  yazimSozluk,
  ...YONETMELIK_RULES,
];

/**
 * Kuralların dayanağı (balonda gösterilir). Kural kendi dayanağını vermişse
 * o kullanılır; vermemişse kimlik önekine göre buradan atanır.
 */
const REFS: Array<[prefix: string, ref: string]> = [
  ['bosluk.', 'Yönetmelik m.16(3)'],
  ['noktalama.', 'Yönetmelik m.16(3)'],
  ['kesme.kurum', 'TDK Yazım Kılavuzu; Kılavuz §13.5'],
  ['kesme.', 'TDK Yazım Kılavuzu (kesme işareti); Kılavuz §13.5'],
  ['baglac.', 'TDK Yazım Kılavuzu; Kılavuz §13.6'],
  ['yazim.birlesik-fiil', 'TDK Yazım Kılavuzu (birleşik fiiller); Kılavuz §13.6'],
  ['yazim.sozluk', 'TDK Güncel Türkçe Sözlük (Yönetmelik m.16(8))'],
  ['yazim.ayri', 'TDK Yazım Kılavuzu (bitişik/ayrı yazım)'],
  ['yazim.yaygin', 'TDK Güncel Türkçe Sözlük'],
  ['buyuk-harf.', 'TDK Yazım Kılavuzu (büyük harf)'],
  ['tekrar.', 'Yazım'],
];
function withRef(i: Issue): Issue {
  if (i.ref) return i;
  const hit = REFS.find(([p]) => i.ruleId.startsWith(p));
  return hit ? { ...i, ref: hit[1] } : i;
}

const RANK: Record<Severity, number> = { hata: 0, uyari: 1, oneri: 2 };
const CAPITAL_RULE = 'buyuk-harf.cumle-basi';

/** Genel sözlük kuralı, aynı yeri açıklayan özel bir kural varsa geri çekilir */
const GENERIC = new Set(['yazim.sozluk', 'yazim.ayri']);
const generic = (i: Issue) => (GENERIC.has(i.ruleId) || i.ruleId.endsWith('.morf') ? 1 : 0);

/**
 * Çakışan sorunlardan yalnızca biri gösterilir: aynı aralığa iki öneri
 * birden uygulanırsa ikincisi bayat ofsetlerle metni bozar. Öncelik:
 * daha ağır önem derecesi, sonra daha önce başlayan, sonra daha kısa.
 *
 * İstisna — birleştirme: cümle başındaki "orjinal" hem yazım hem büyük harf
 * sorunudur. Büyük harf uyarısı elenirse kazanan sorunun önerisi yine küçük
 * harfle başlar ve kullanıcı ikinci kez düzeltmek zorunda kalır. Bu yüzden
 * elenen büyük harf uyarısı, kazanan önerilere işlenir: "Orijinal".
 */
function resolveOverlaps(issues: Issue[]): Issue[] {
  const sorted = [...issues].sort(
    (a, b) =>
      generic(a) - generic(b) ||
      RANK[a.severity] - RANK[b.severity] ||
      a.start - b.start ||
      a.end - a.start - (b.end - b.start),
  );
  const kept: Issue[] = [];
  const dropped: Issue[] = [];
  for (const is of sorted) {
    if (kept.some((k) => is.start < k.end && k.start < is.end)) dropped.push(is);
    else kept.push(is);
  }
  for (const d of dropped) {
    if (d.ruleId !== CAPITAL_RULE) continue;
    const k = kept.find((x) => x.start === d.start);
    if (!k) continue;
    k.suggestions = k.suggestions.map((s) => (isLowerLetter(s[0] ?? '') ? capitalizeTr(s) : s));
    k.message += ' Ayrıca cümle büyük harfle başlar.';
  }
  return kept.sort((a, b) => a.start - b.start);
}

export interface CheckOptions {
  rules?: Rule[];
  /** "ruleId|metin" parmak izleri — kullanıcının yoksaydıkları */
  ignored?: ReadonlySet<string>;
  /** Editör dışındaki başlık ve dağıtım bilgisi (gönderen, Gereği/Bilgi) */
  meta?: DocMeta;
}

export const fingerprint = (i: Pick<Issue, 'ruleId' | 'text'>): string => `${i.ruleId}|${i.text}`;

export function check(text: string, opts: CheckOptions = {}): Issue[] {
  const tokens = tokenize(text);
  const ctx = { text, tokens, meta: opts.meta };
  const all: Issue[] = [];
  for (const rule of opts.rules ?? DEFAULT_RULES) {
    try {
      all.push(...rule.check(ctx));
    } catch (err) {
      // Tek bir kuralın hatası tüm denetimi düşürmemeli
      console.warn(`[ebys-yazim] kural hatası: ${rule.id}`, err);
    }
  }
  // Yoksayılan bir kelime, aynı metni işaretleyen genel kurallardan da düşer:
  // kullanıcı "yanlız"ı yoksaydıysa sözlük kuralı onu yeniden işaretlememeli.
  const ignoredTexts = new Set([...(opts.ignored ?? [])].map((f) => f.slice(f.indexOf('|') + 1)));
  const visible = opts.ignored
    ? all.filter((i) => !opts.ignored!.has(fingerprint(i)) && !(generic(i) && ignoredTexts.has(i.text)))
    : all;
  return resolveOverlaps(visible).map(withRef);
}
