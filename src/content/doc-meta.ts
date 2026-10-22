import type { DocMeta, Recipient } from '../core/types.ts';

/**
 * Editörün dışındaki belge bilgisini EBYS (Belgenet) sayfasından okur. Yalnızca OKUR; hiçbir alana
 * yazmaz, hiçbir yere göndermez.
 *
 * Gönderen — editörün üstündeki başlık (PrimeFaces "inplace" alanları):
 *   <td id="kurumHeaderSatir1"> … <span class="ui-inplace-display">T.C.</span>
 *   <td id="kurumHeaderSatir2"> … KARESİ KAYMAKAMLIĞI
 *   <td id="kurumHeaderSatir3"> … İlçe Millî Eğitim Müdürlüğü
 *
 * Muhataplar — üç kaynak, hangisi doluysa:
 *   - Bilgileri sekmesindeki seçimler: [id$=":geregiLov:LovSecilenTable_data"] / ":bilgiLov:" satırları
 *   - Editör sayfasındaki dağıtım önizlemesi: .geregiTable / .bilgiTable
 *   - Hitap satırı: .hitap ("BALIKESİR VALİLİĞİNE" ya da "DAĞITIM YERLERİNE")
 *
 * Bir sayfada birden çok evrak penceresi olabilir (window1, window11…). Kimlikler pencereler arasında
 * tekrarlandığı için arama yalnızca editörün kendi formunda yapılır.
 */

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function inplaceText(el: Element | null): string {
  if (!el) return '';
  return clean((el.querySelector('.ui-inplace-display') ?? el).textContent);
}

/** Bir kapsayıcıdaki boş olmayan metin düğümleri: her biri bir muhatap satırıdır */
function leafTexts(root: Element): string[] {
  const out: string[] = [];
  const doc = root.ownerDocument;
  const w = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) {
    const t = clean(n.nodeValue);
    if (t && !/^(?:Gereği|Bilgi|Dağıtım)\s*:?$/i.test(t)) out.push(t);
  }
  return out;
}

export function readDocMeta(iframe: HTMLIFrameElement): DocMeta {
  const doc = iframe.ownerDocument;
  // Editörün formu yoksa (sade sayfa) tüm belge; varsa yalnızca o form: başka pencerenin seçimleri karışmasın
  const scope: ParentNode = iframe.closest('form') ?? doc;
  const first = (sel: string): Element | null => scope.querySelector(sel);
  const all = (sel: string): Element[] => [...scope.querySelectorAll(sel)];

  const sender = [2, 3].map((n) => inplaceText(first(`[id="kurumHeaderSatir${n}"]`))).filter(Boolean);

  const recipients: Recipient[] = [];
  const add = (text: string, role: Recipient['role']) => {
    if (text) recipients.push({ text, role });
  };
  for (const [lov, role] of [['geregiLov', 'gereği'], ['bilgiLov', 'bilgi']] as const) {
    for (const tr of all(`[id$=":${lov}:LovSecilenTable_data"] > tr:not(.ui-datatable-empty-message)`)) {
      add(clean(tr.querySelector('td')?.textContent ?? tr.textContent), role);
    }
  }
  for (const [cls, role] of [['geregiTable', 'gereği'], ['bilgiTable', 'bilgi']] as const) {
    for (const box of all(`.${cls}`)) for (const t of leafTexts(box)) add(t, role);
  }
  add(clean(first('.hitap')?.textContent), 'muhatap');

  return { sender, recipients };
}

/** Değişiklik tespiti için kararlı anahtar */
export const metaKey = (m: DocMeta): string =>
  JSON.stringify([m.sender ?? [], (m.recipients ?? []).map((r) => `${r.role}:${r.text}`).sort()]);
