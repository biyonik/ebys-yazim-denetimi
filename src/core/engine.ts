import type { Issue, Rule, Severity } from './types.ts';
import { tokenize } from './tokenizer.ts';
import { kesmeSayi } from './rules/kesme-sayi.ts';
import { kesmeOzelAd } from './rules/kesme-ozel-ad.ts';
import { ciftBosluk, noktalamaOncesiBosluk, noktalamaSonrasiBosluk } from './rules/bosluk-noktalama.ts';
import { kelimeTekrari } from './rules/tekrar.ts';
import { yayginYanlislar } from './rules/yaygin-yanlislar.ts';
import { birlesikFiil } from './rules/birlesik-fiil.ts';
import { baglacKurallari, miUyum } from './rules/baglac.ts';
import { buyukHarf } from './rules/buyuk-harf.ts';
import { capitalizeTr, isLowerLetter } from './turkish.ts';

export const DEFAULT_RULES: Rule[] = [
  yayginYanlislar,
  birlesikFiil,
  baglacKurallari,
  miUyum,
  kesmeOzelAd,
  kesmeSayi,
  noktalamaOncesiBosluk,
  noktalamaSonrasiBosluk,
  ciftBosluk,
  kelimeTekrari,
  buyukHarf,
];

const RANK: Record<Severity, number> = { hata: 0, uyari: 1, oneri: 2 };
const CAPITAL_RULE = 'buyuk-harf.cumle-basi';

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
    (a, b) => RANK[a.severity] - RANK[b.severity] || a.start - b.start || a.end - a.start - (b.end - b.start),
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
}

export const fingerprint = (i: Pick<Issue, 'ruleId' | 'text'>): string => `${i.ruleId}|${i.text}`;

export function check(text: string, opts: CheckOptions = {}): Issue[] {
  const tokens = tokenize(text);
  const ctx = { text, tokens };
  const all: Issue[] = [];
  for (const rule of opts.rules ?? DEFAULT_RULES) {
    try {
      all.push(...rule.check(ctx));
    } catch (err) {
      // Tek bir kuralın hatası tüm denetimi düşürmemeli
      console.warn(`[ebys-yazim] kural hatası: ${rule.id}`, err);
    }
  }
  const visible = opts.ignored ? all.filter((i) => !opts.ignored!.has(fingerprint(i))) : all;
  return resolveOverlaps(visible);
}
