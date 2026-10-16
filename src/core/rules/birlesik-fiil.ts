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
  'temin', 'tercih', 'tasdik', 'tayin', 'ihmal', 'tahmin', 'tavzih', 'terfi',
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
