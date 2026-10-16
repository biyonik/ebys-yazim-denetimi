import type { Issue, Rule } from '../types.ts';
import { matchCase, trLower } from '../turkish.ts';

/**
 * TDK: "etmek, edilmek, eylemek, olmak, olunmak" yardımcı fiilleriyle kurulan
 * birleşik fiiller, kaynaşma sırasında ses düşmesi ya da türemesi YOKSA
 * ayrı yazılır:  arz etmek, rica etmek, kabul etmek, teşekkür etmek.
 *
 * Ses olayı VARSA bitişik yazılır: affetmek, hissetmek, kaybetmek,
 * kaydetmek, reddetmek, seyretmek. Bunlar aşağıdaki listede bilinçli olarak
 * yoktur; listeye yalnızca ses olayına girmeyen ve resmî yazışmada sık
 * geçen kökler alınmıştır.
 *
 * Eşleme kuralı: kök + (et|ed|ol|eyle) ile başlayan bitişik kelime.
 * "teminat", "tercihen", "iadeten", "teslimat" gibi meşru türevler
 * yardımcı fiil kalıbıyla başlamadığı için yakalanmaz.
 */
const ROOTS = [
  'arz', 'rica', 'kabul', 'teşekkür', 'tebliğ', 'tahsis', 'talep', 'teslim',
  'tespit', 'ilan', 'iade', 'iptal', 'kontrol', 'takdim', 'tavsiye', 'teklif',
  'temin', 'tercih', 'tasdik', 'tayin', 'ihmal', 'tahmin', 'tavzih', 'terfi', 'sevk',
];
const AUX = /^(et|ed|ol|eyle)/;

const ROOTS_BY_LEN = [...ROOTS].sort((a, b) => b.length - a.length);

export const birlesikFiil: Rule = {
  id: 'yazim.birlesik-fiil',
  check({ tokens }) {
    const issues: Issue[] = [];
    for (const t of tokens) {
      if (t.kind !== 'word') continue;
      const w = trLower(t.text);
      for (const root of ROOTS_BY_LEN) {
        if (!w.startsWith(root)) continue;
        const rest = w.slice(root.length);
        if (!AUX.test(rest)) continue;
        const fixed = matchCase(t.text, `${root} ${rest}`);
        issues.push({
          ruleId: 'yazim.birlesik-fiil',
          start: t.start,
          end: t.end,
          text: t.text,
          message: `Ses olayı olmayan birleşik fiiller ayrı yazılır: “${root} ${rest}”.`,
          severity: 'hata',
          category: 'kural',
          suggestions: [fixed],
        });
        break;
      }
    }
    return issues;
  },
};

/**
 * Ters yön: ses olayı VARSA bitişik yazılır (TDK; Kılavuz tablosu).
 *   kayıt etmek → kaydetmek, fesih etmek → feshetmek, red etmek → reddetmek
 * Anahtar: ayrı yazılmış isim, değer: bitişik yazımda aldığı gövde.
 */
const FUSED: Record<string, string> = {
  kayıt: 'kayded', fesih: 'feshed', lağv: 'lağved', derc: 'dercet', red: 'redded', ret: 'redded',
  af: 'affed', his: 'hissed', kayıp: 'kaybed', seyir: 'seyred', zan: 'zanned', hal: 'halled',
  keşif: 'keşfed', nakil: 'nakled', emir: 'emred', hüküm: 'hükmed', şükür: 'şükred', sabır: 'sabred',
};

export const birlesikFiilBitisik: Rule = {
  id: 'yazim.birlesik-fiil-bitisik',
  check({ tokens }) {
    const issues: Issue[] = [];
    for (let i = 0; i + 2 < tokens.length; i++) {
      const a = tokens[i]!;
      const sp = tokens[i + 1]!;
      const b = tokens[i + 2]!;
      if (a.kind !== 'word' || sp.kind !== 'space' || b.kind !== 'word') continue;
      const stem = FUSED[trLower(a.text)];
      if (!stem) continue;
      // "etmek / edilmek / eyle" çekimleri: et-, ed-
      const bw = trLower(b.text);
      const m = /^(et|ed)(.*)$/.exec(bw);
      if (!m) continue;
      // Gövde ünsüzle bitiyorsa (kayded-) ünlüyle başlayan ek doğrudan gelir; "et" → "ed" yumuşaması korunur
      const rest = m[1] === 'et' ? 'et' + m[2] : 'ed' + m[2];
      const fused = stem.slice(0, -2) + rest;
      issues.push({
        ruleId: 'yazim.birlesik-fiil-bitisik',
        start: a.start,
        end: b.end,
        text: a.text + sp.text + b.text,
        message: `Kaynaşma sırasında ses olayı olduğu için bitişik yazılır: “${matchCase(a.text, fused)}”.`,
        severity: 'hata',
        category: 'kural',
        suggestions: [matchCase(a.text, fused)],
        ref: 'TDK Yazım Kılavuzu; Kılavuz s.54',
      });
    }
    return issues;
  },
};
