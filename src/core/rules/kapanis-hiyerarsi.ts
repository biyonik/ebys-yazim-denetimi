import type { Issue, Rule, Severity } from '../types.ts';
import { idareOf, metaFromText, senderOf, type Idare } from '../hiyerarsi.ts';
import { trLower } from '../turkish.ts';

/**
 * Metin sonu "arz / rica" — gönderen ile muhatapların hiyerarşisine göre (Yönetmelik m.16(12)(a)(b),
 * Kılavuz §13.1):
 *   alt makama                         → "… rica ederim."
 *   üst ya da AYNI düzeydeki makama    → "… arz ederim."
 *   üst/aynı ve alt makama birlikte    → "… arz ve rica ederim." / "… arz/rica ederim."
 *
 * Gönderen ve muhataplar editörün dışından gelir (EBYS başlığı, Gereği/Bilgi seçimleri; ctx.meta).
 * Bunlar yoksa editör metnine bakılır (başlık ve muhatap elle yazılmışsa). İkisinden biri bilinmiyorsa
 * kural sessiz kalır.
 *
 * Önem derecesi:
 *   hata  — üst/aynı düzeye "rica" ve tüm muhatapların düzeyi biliniyor (kullanıcının asıl sorduğu durum)
 *   uyarı — düzeyi bilinmeyen muhatap var ya da beklenen kalıp "arz ve rica"; sınıflandırma bir
 *           sezgidir, son söz kullanıcınındır. Hiçbiri "Tümünü düzelt"e girmez.
 */

const REF = 'Yönetmelik m.16(12), Kılavuz §13.1';

/** "Bilgilerinize", "Gereğini", "Bilgilerini ve gereğini", "Gereğini bilgilerinize" + arz/rica (+ " ederim") */
const CLOSING =
  /(?<![\p{L}])((?:[Bb]ilgilerini(?:ze)?|[Gg]ereğini)(?:\s+(?:ve\s+)?(?:bilgilerini(?:ze)?|gereğini))?\s+)?(arz ve rica|arz\/rica|arz|rica)(?=\s+ederim)/gu;

type Verb = 'arz' | 'rica' | 'arz ve rica';

/** Kılavuz §13.1 tablosundaki kalıplara çevirir: üst/aynı "Bilgilerinize arz", alt "Bilgilerini rica" */
function rewrite(prefix: string, target: Verb): string {
  const cap = /^[BG]/.test(prefix);
  let p = trLower(prefix).replace(/\s+/g, ' ');
  if (target === 'arz') {
    if (p === 'bilgilerini ') p = 'bilgilerinize ';
    else if (p === 'gereğini ') p = 'gereğini bilgilerinize ';
  } else {
    if (p === 'bilgilerinize ') p = 'bilgilerini ';
    else if (p === 'gereğini bilgilerinize ' || p === 'gereğini ve bilgilerinize ') p = 'gereğini ';
  }
  const s = p + target;
  return cap ? s[0]!.toLocaleUpperCase('tr-TR') + s.slice(1) : s;
}

const list = (xs: Idare[]) => {
  const names = [...new Set(xs.map((x) => x.label))];
  return names.slice(0, 2).join(', ') + (names.length > 2 ? ` ve ${names.length - 2} idare daha` : '');
};

export const kapanisHiyerarsi: Rule = {
  id: 'kapanis.hiyerarsi',
  check({ text, meta }) {
    // Kapanış yoksa (yazı henüz bitmedi) hiçbir şey okunmaz
    let last: RegExpExecArray | undefined;
    for (const m of text.matchAll(CLOSING)) last = m;
    if (!last) return [];

    const fromText = !meta?.sender?.length || !meta?.recipients?.length ? metaFromText(text) : undefined;
    const senderLines = meta?.sender?.length ? meta.sender : fromText?.sender;
    const recipients = meta?.recipients?.length ? meta.recipients : fromText?.recipients;
    const sender = senderLines ? senderOf(senderLines) : undefined;
    if (!sender || !recipients?.length) return [];

    const seen = new Set<string>();
    const known: Idare[] = [];
    let unknown = 0;
    for (const r of recipients) {
      const key = trLower(r.text).replace(/\s+/g, ' ').trim();
      if (!key || seen.has(key) || key === 'dağıtım yerlerine') continue;
      seen.add(key);
      const i = idareOf(r.text);
      if (i) known.push(i);
      else unknown++;
    }
    if (!known.length) return [];
    const up = known.filter((k) => k.level <= sender.level);
    const down = known.filter((k) => k.level > sender.level);

    const prefix = last[1] ?? '';
    const verb = last[2]!.toLowerCase() as Verb | 'arz/rica';
    const start = last.index!;
    const end = start + last[0].length;
    const mk = (severity: Severity, message: string, targets: Verb[]): Issue[] => [
      {
        ruleId: 'kapanis.hiyerarsi',
        start,
        end,
        text: last[0],
        message,
        severity,
        category: 'kural',
        suggestions: [...new Set(targets.map((t) => rewrite(prefix, t)))],
        autoFix: false,
        ref: REF,
      },
    ];
    const kind = up.every((k) => k.level < sender.level) ? 'üst makam' : up.every((k) => k.level === sender.level) ? 'aynı düzeydeki makam' : 'üst ya da aynı düzeydeki makam';
    const upTxt = `${kind} (${list(up)})`;
    const downTxt = `alt makam (${list(down)})`;

    if (verb === 'rica') {
      if (!up.length) return [];
      if (down.length) {
        return mk('hata', `Dağıtımda hem ${upTxt} hem ${downTxt} var: kapanış “arz ve rica ederim” ya da “arz/rica ederim” olur.`, ['arz ve rica']);
      }
      if (unknown) {
        return mk('uyari', `Muhatap ${upTxt}: “rica ederim” yalnızca alt makamlara yazılır. Dağıtımdaki diğer muhatap alt makamsa “arz ve rica ederim”.`, ['arz', 'arz ve rica']);
      }
      const why = kind === 'aynı düzeydeki makam' ? 'aynı düzeye de “arz ederim” yazılır' : 'kapanış “arz ederim” olur';
      return mk('hata', `Muhatap ${upTxt}: ${why}; “rica ederim” yalnızca alt makamlara yazılır.`, ['arz']);
    }
    if (verb === 'arz') {
      if (up.length && down.length) {
        return mk('uyari', `Dağıtımda ${downTxt} da var: üst/aynı ve alt makamlara birlikte giden yazı “arz ve rica ederim” ile biter.`, ['arz ve rica']);
      }
      if (!up.length && down.length && !unknown) {
        return mk('uyari', `Muhatap ${downTxt}: alt makamlara yazılan yazı “rica ederim” ile biter.`, ['rica']);
      }
      return [];
    }
    // "arz ve rica" / "arz/rica": karma dağıtım içindir
    if (unknown) return [];
    if (!down.length) return mk('uyari', `Dağıtımda alt makam yok (${list(up)}): kapanış “arz ederim” olur.`, ['arz']);
    if (!up.length) return mk('uyari', `Muhatapların hepsi alt makam (${list(down)}): kapanış “rica ederim” olur.`, ['rica']);
    return [];
  },
};
