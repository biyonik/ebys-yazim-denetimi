import type { DocMeta, Recipient } from './types.ts';
import { fold } from './morph/analyzer.ts';
import { trLower } from './turkish.ts';
import { linesOf } from './rules/yonetmelik.ts';

/**
 * İdarelerin hiyerarşi düzeyi — metin sonundaki "arz / rica" seçimi için (Yönetmelik m.16(12),
 * Kılavuz §13.1).
 *
 *   1  Cumhurbaşkanlığı, TBMM
 *   2  Bakanlıklar ve merkez birimleri (… Bakanlığı, … Genel Müdürlüğü)
 *   3  Valilik ve il birimleri (İl Millî Eğitim Müdürlüğü, … İl Müdürlüğü, Defterdarlık)
 *   4  Kaymakamlık ve ilçe birimleri (İlçe Millî Eğitim Müdürlüğü, Mal Müdürlüğü)
 *   5  Okul ve kurumlar (… Ortaokulu, … Lisesi, … Merkezi), muhtarlık
 *
 * Küçük sayı üst makamdır. Tanınmayan idare (üniversite, belediye, tüzel kişi, gerçek kişi) düzeysizdir
 * ve hiçbir karara katılmaz: Kılavuz, ast-üst ilişkisi net olmayan durumda "arz ederim"i uygun bulur,
 * kamu niteliği olmayan tüzel kişilere ise "rica ederim" yazılır — ikisini metinden ayıramayız.
 *
 * Muhatapta parantez varsa ("BALIKESİR VALİLİĞİNE (İl Millî Eğitim Müdürlüğü)") birinci satırdaki idare
 * esas alınır (m.16(12)(c)). Seçim listesindeki yol biçimli metinlerde ("… / … / İlçe Millî Eğitim
 * Müdürlüğü") son parça birimdir.
 */

export interface Idare {
  level: 1 | 2 | 3 | 4 | 5;
  /** Kullanıcıya gösterilecek ad (parantezsiz, kısaltılmış) */
  label: string;
}

const PATTERNS: Array<[Idare['level'], RegExp]> = [
  [1, /cumhurbaşkanlığ|cumhurbaşkanı yardımcılığ|türkiye büyük millet meclis|(?:^|\s)tbmm(?:\s|$)/],
  [2, /bakanlığ|(?<!bölge\s)genel müdürlüğ|genel sekreterliğ/],
  [3, /valiliğ|(?:^|\s)il\s|defterdarlığ/],
  [4, /kaymakamlığ|(?:^|\s)ilçe\s|(?:^|\s)mal müdürlüğ/],
  [5, /(?:okulu|lisesi|ortaokulu|ilkokulu|anaokulu|merkezi|muhtarlığı|muhtarlığ\p{Ll}*|kursu)(?:\s|$)/u],
];

export function idareOf(raw: string): Idare | undefined {
  let t = raw.replace(/\([^)]*\)?/g, ' ');
  const parts = t.split(/\s[/>»|]\s|\s[-–]\s/).map((p) => p.trim()).filter(Boolean);
  t = parts.at(-1) ?? '';
  const n = fold(trLower(t)).replace(/\s+/g, ' ').trim();
  if (!n || /^dağıtım yerlerine$/.test(n)) return undefined;
  for (const [level, re] of PATTERNS) if (re.test(n)) return { level, label: t.replace(/\s+/g, ' ').trim() };
  return undefined;
}

/**
 * Gönderenin düzeyi: başlıktaki idare (satır 2). Birim satırı bir okul/kurumsa (satır 3) düzey odur:
 * okul müdürlüğünün yazısında Kaymakamlık üst makamdır; İlçe Millî Eğitim Müdürlüğü ise Kaymakamlık adına yazar.
 */
export function senderOf(lines: readonly string[]): Idare | undefined {
  const [idare, birim] = lines.map((l) => l.trim()).filter((l) => l && !/^T\.\s?C\.$/.test(l));
  const a = idare ? idareOf(idare) : undefined;
  if (!a) return undefined;
  const b = birim ? idareOf(birim) : undefined;
  return b && b.level === 5 ? b : a;
}

const isUpperLine = (s: string) => /\p{Lu}/u.test(s) && !/\p{Ll}/u.test(s.replace(/\([^)]*\)/g, ''));

/**
 * Editör metninden yedek okuma — başlık ve muhatap editöre elle yazılmışsa (EBYS'nin kendi alanları
 * kullanılmamışsa ya da başka bir kurumun düzeninde):
 *   gönderen: "T.C." satırından sonraki iki satır
 *   muhatap:  tamamı büyük harfli, yönelme ekiyle biten satır ("BALIKESİR VALİLİĞİNE")
 *   dağıtım:  "Dağıtım:" başlığından sonraki "Gereği:" / "Bilgi:" satırları
 */
export function metaFromText(text: string): DocMeta {
  const lines = linesOf(text).map((l) => l.text.trim());
  const out: DocMeta = { recipients: [] };
  const tc = lines.findIndex((l) => /^T\.\s?C\.$/.test(l));
  if (tc >= 0) out.sender = lines.slice(tc + 1).filter(Boolean).slice(0, 2);
  let role: Recipient['role'] | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (!l) {
      if (role) role = null;
      continue;
    }
    const head = /^(Dağıtım|Gereği|Bilgi)\s*:\s*(.*)$/i.exec(l);
    if (head) {
      const h = trLower(head[1]!);
      role = h === 'bilgi' ? 'bilgi' : 'gereği';
      if (head[2]) out.recipients!.push({ text: head[2], role });
      continue;
    }
    if (role) {
      out.recipients!.push({ text: l.replace(/^[-–•]\s*/, ''), role });
      continue;
    }
    if (i > tc + 2 && isUpperLine(l) && /(?:N|Y)[AE]$/u.test(l.replace(/\s*\([^)]*\)\s*$/, '')) && idareOf(l)) {
      const next = lines[i + 1] ?? '';
      out.recipients!.push({ text: /^\(.*\)$/.test(next) ? `${l} ${next}` : l, role: 'muhatap' });
    }
  }
  return out;
}
