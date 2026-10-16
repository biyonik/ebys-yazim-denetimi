import { OBJ_CHAR, SEP_BLOCK, SEP_CELL } from '../core/types.ts';

/**
 * DOM ↔ düz metin eşlemesi.
 *
 * Çekirdek düz metinle çalışır; işaretleme ve düzeltme DOM üzerinde yapılır.
 * Bu sınıf iki dünya arasındaki tek köprüdür ve şu iki garantiyi verir:
 *
 *  1. Düz metin, kullanıcının EKRANDA GÖRDÜĞÜ metindir:
 *     - HTML kaynağındaki boşluk/satır sonu dizileri tek boşluğa iner
 *       (CSS white-space: normal davranışı). Aksi hâlde editörün kaynağındaki
 *       girinti "çift boşluk" hatası gibi görünür.
 *     - &nbsp; boşluk olarak sayılır ve ASLA birleştirilmez; CKEditor kullanıcının
 *       bastığı ikinci boşluğu &nbsp; olarak saklar.
 *     - CKEditor'ün imleç dolgu karakterleri (U+200B dizisi) ve U+FEFF yok sayılır.
 *       Aksi hâlde "ev​de" iki kelime görünür.
 *  2. Her düz metin ofseti, geri dönüşte tam olarak bir (TextNode, ofset)
 *     çiftine karşılık gelir.
 */

const BLOCK = new Set([
  'P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'TBODY',
  'THEAD', 'TFOOT', 'TR', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
  'DL', 'DT', 'DD', 'CENTER', 'ADDRESS', 'HR', 'FIGURE', 'FIGCAPTION', 'CAPTION',
]);
const CELL = new Set(['TD', 'TH']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'SVG']);
const IGNORED_CHARS = /[​﻿]/;
const COLLAPSIBLE = /[ \t\n\r\f]/;

interface Segment {
  node: Text;
  start: number;
  end: number;
  /** map[k] = düz metindeki (start + k) karakterinin node içindeki ofseti */
  map: number[];
}

export class TextIndex {
  readonly text: string;
  private readonly segments: Segment[];
  private readonly byNode: Map<Text, Segment>;

  private constructor(text: string, segments: Segment[]) {
    this.text = text;
    this.segments = segments;
    this.byNode = new Map(segments.map((s) => [s.node, s]));
  }

  static build(root: Node): TextIndex {
    let out = '';
    const segments: Segment[] = [];

    const lastIsSpaceLike = () => {
      const c = out[out.length - 1];
      return c === undefined || c === ' ' || c === SEP_BLOCK || c === SEP_CELL;
    };
    /**
     * Art arda gelen ayırıcılar teke iner. Çakışmada:
     *  - hücreye girerken/çıkarken hücre ayırıcısı kazanır ("<td><p>adet" cümle başı değildir),
     *  - tablo kapanırken paragraf ayırıcısı kazanır (tablodan sonraki paragraf cümle başıdır).
     */
    const pushSep = (sep: string, override = false) => {
      if (out.length === 0) return;
      const c = out[out.length - 1];
      if (c === SEP_BLOCK || c === SEP_CELL) {
        if (sep === SEP_CELL || override) out = out.slice(0, -1) + sep;
        return;
      }
      // Ayırıcıdan önceki sondaki boşluk görünmez; at (map'li segmentten de düş)
      if (c === ' ') {
        const seg = segments[segments.length - 1];
        if (seg && seg.end === out.length && seg.map.length > 0) {
          seg.map.pop();
          seg.end--;
          if (seg.end === seg.start) segments.pop();
        }
        out = out.slice(0, -1);
      }
      out += sep;
    };

    const visit = (node: Node): void => {
      if (node.nodeType === 3) {
        const t = node as Text;
        const data = t.data;
        const start = out.length;
        const map: number[] = [];
        for (let i = 0; i < data.length; i++) {
          const ch = data[i]!;
          if (IGNORED_CHARS.test(ch)) continue;
          if (ch === ' ') {
            out += ' ';
            map.push(i);
          } else if (COLLAPSIBLE.test(ch)) {
            if (lastIsSpaceLike()) continue;
            out += ' ';
            map.push(i);
          } else {
            out += ch;
            map.push(i);
          }
        }
        if (map.length > 0) segments.push({ node: t, start, end: out.length, map });
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node as Element;
      const tag = el.tagName.toUpperCase();
      if (SKIP.has(tag)) return;
      // CKEditor yer imleri ve gizli düğümleri
      if (el.hasAttribute('data-cke-bookmark') || el.hasAttribute('data-cke-hidden-sel')) return;
      if (el.getAttribute('contenteditable') === 'false') {
        // EBYS etiket/alan widget'ları: içeriği denetlenmez ama kelime sınırı olarak kalır
        out += OBJ_CHAR;
        return;
      }
      if (tag === 'BR') {
        pushSep(SEP_BLOCK);
        return;
      }
      const isBlock = BLOCK.has(tag);
      const isCell = CELL.has(tag);
      if (isBlock) pushSep(SEP_BLOCK);
      if (isCell) pushSep(SEP_CELL);
      for (let c = el.firstChild; c; c = c.nextSibling) visit(c);
      if (isBlock) pushSep(SEP_BLOCK, tag === 'TABLE');
      if (isCell) pushSep(SEP_CELL);
    };

    visit(root);
    return new TextIndex(out, segments);
  }

  private segmentAt(flat: number, preferEnd: boolean): Segment | undefined {
    // İkili arama: flat'i içeren segment
    let lo = 0;
    let hi = this.segments.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = this.segments[mid]!;
      if (preferEnd ? flat <= s.start : flat < s.start) hi = mid - 1;
      else if (preferEnd ? flat > s.end : flat >= s.end) lo = mid + 1;
      else return s;
    }
    return undefined;
  }

  /** [start, end) düz metin aralığını DOM Range'ine çevirir. */
  toDomRange(doc: Document, start: number, end: number): Range | null {
    if (end <= start) return null;
    const a = this.segmentAt(start, false);
    const b = this.segmentAt(end - 1, false);
    if (!a || !b) return null;
    const r = doc.createRange();
    r.setStart(a.node, a.map[start - a.start]!);
    r.setEnd(b.node, b.map[end - 1 - b.start]! + 1);
    return r;
  }

  /** DOM noktasını (genelde imleç) düz metin ofsetine çevirir. */
  fromDomPoint(node: Node, offset: number): number | null {
    if (node.nodeType !== 3) return null;
    const s = this.byNode.get(node as Text);
    if (!s) return null;
    for (let k = 0; k < s.map.length; k++) if (s.map[k]! >= offset) return s.start + k;
    return s.end;
  }

  /**
   * Yalnızca FARKLI olan kısmı değiştirir: "orjinal" → "orijinal" için
   * kelimenin tamamı değil, "or" sonrasına "i" eklenir. Böylece kelimenin
   * içindeki biçimlendirme (or<b>jin</b>al) korunur, undo farkı da asgari olur.
   */
  replaceMinimal(start: number, end: number, replacement: string): boolean {
    const old = this.text.slice(start, end);
    let p = 0;
    while (p < old.length && p < replacement.length && old[p] === replacement[p]) p++;
    let s = 0;
    while (
      s < old.length - p &&
      s < replacement.length - p &&
      old[old.length - 1 - s] === replacement[replacement.length - 1 - s]
    )
      s++;
    if (p === old.length && p === replacement.length) return true; // değişiklik yok
    return this.replace(start + p, end - s, replacement.slice(p, replacement.length - s));
  }

  /**
   * [start, end) aralığını `replacement` ile değiştirir; yalnızca metin
   * düğümlerinin `data`sını değiştirir. Eleman yapısına (kalın, altı çizili,
   * span stilleri) dokunmaz: kelime kalın bir parçayla bölünmüşse yeni metin
   * ilk parçaya yazılır, diğerlerinden ilgili kısım silinir.
   *
   * Aralık blok sınırını geçiyorsa (ayırıcı içeriyorsa) reddeder.
   */
  replace(start: number, end: number, replacement: string): boolean {
    const slice = this.text.slice(start, end);
    if (slice.includes(SEP_BLOCK) || slice.includes(SEP_CELL) || slice.includes(OBJ_CHAR)) return false;

    if (start === end) {
      // Saf ekleme: önceki karakterin hemen arkasına (yoksa sonrakinin önüne)
      const before = start > 0 ? this.segmentAt(start - 1, false) : undefined;
      const s = before ?? this.segmentAt(start, false);
      if (!s) return false;
      const at = before ? s.map[start - 1 - s.start]! + 1 : s.map[start - s.start]!;
      s.node.data = s.node.data.slice(0, at) + replacement + s.node.data.slice(at);
      return true;
    }

    const touched = this.segments.filter((s) => s.start < end && start < s.end);
    if (touched.length === 0) return false;
    // Arada eşlemesi olmayan (atılmış) karakter varsa da güvenli: map sınırlarını kullanıyoruz
    touched.forEach((s, idx) => {
      const from = Math.max(start, s.start) - s.start;
      const to = Math.min(end, s.end) - s.start;
      const nodeFrom = s.map[from]!;
      const nodeTo = s.map[to - 1]! + 1;
      const data = s.node.data;
      s.node.data = data.slice(0, nodeFrom) + (idx === 0 ? replacement : '') + data.slice(nodeTo);
    });
    return true;
  }
}
