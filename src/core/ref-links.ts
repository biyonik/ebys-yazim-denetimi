import {
  KILAVUZ_BOOK_OFFSET,
  KILAVUZ_PAGES,
  KILAVUZ_SECTIONS,
  YONETMELIK_ARTICLES,
  YONETMELIK_EXAMPLES,
  YONETMELIK_PAGES,
} from './ref-index.ts';

/**
 * Dayanak metnini ("Yönetmelik m.16(4), Kılavuz §31") tıklanabilir parçalara ayırır.
 *
 * Eklenti iki kaynağı PDF olarak kendi içinde taşır (ağ erişimi yok, sürüm sabit):
 *   kilavuz    — Resmî Yazışma Kuralları Kılavuzu, Ocak 2023 kurum baskısı
 *   yonetmelik — Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hakkında Yönetmelik (RG 31151, ekleriyle)
 * Hedef, Chrome'un PDF görüntüleyicisinin desteklediği "#page=N" ile açılır.
 *
 * Bilinmeyen bir bölüm numarası bir üst bölüme düşer (§13.6.5.1 yoksa §13.6.5);
 * hiçbiri bulunamazsa parça düz metin kalır — yanlış sayfaya götürmek, götürmemekten kötüdür.
 */

export type SourceDoc = 'kilavuz' | 'yonetmelik';

export interface SourceLink {
  doc: SourceDoc;
  page: number;
}

export interface RefPart {
  text: string;
  link?: SourceLink;
}

export const SOURCE_FILES: Readonly<Record<SourceDoc, string>> = {
  kilavuz: 'kaynak/kilavuz-2023.pdf',
  yonetmelik: 'kaynak/yonetmelik-2646.pdf',
};

export const SOURCE_TITLES: Readonly<Record<SourceDoc, string>> = {
  kilavuz: 'Resmî Yazışma Kuralları Kılavuzu (Ocak 2023)',
  yonetmelik: 'Resmî Yazışma Yönetmeliği (RG 10.06.2020/31151)',
};

const MAX_PAGES: Readonly<Record<SourceDoc, number>> = { kilavuz: KILAVUZ_PAGES, yonetmelik: YONETMELIK_PAGES };

export function kilavuzSectionPage(section: string): number | undefined {
  const parts = section.split('.');
  while (parts.length) {
    const p = KILAVUZ_SECTIONS[parts.join('.')];
    if (p) return p;
    parts.pop();
  }
  return undefined;
}

export function yonetmelikPage(article: string, paragraph?: string): number | undefined {
  return (paragraph && YONETMELIK_ARTICLES[`${article}(${paragraph})`]) || YONETMELIK_ARTICLES[article];
}

const REF_RE = /Kılavuz §(\d+(?:\.\d+)*)|Kılavuz s\.(\d+)|Yönetmelik m\.(\d+)(?:\((\d+)\))?(?:\([a-zçğıöşü]\))?|Örnek (\d+)/gu;

export function parseRef(ref: string): RefPart[] {
  const parts: RefPart[] = [];
  let last = 0;
  for (const m of ref.matchAll(REF_RE)) {
    let link: SourceLink | undefined;
    if (m[1]) {
      const page = kilavuzSectionPage(m[1]);
      if (page) link = { doc: 'kilavuz', page };
    } else if (m[2]) {
      link = { doc: 'kilavuz', page: Number(m[2]) + KILAVUZ_BOOK_OFFSET };
    } else if (m[3]) {
      const page = yonetmelikPage(m[3], m[4]);
      if (page) link = { doc: 'yonetmelik', page };
    } else if (m[5] && /Yönetmelik/.test(ref)) {
      const page = YONETMELIK_EXAMPLES[m[5]];
      if (page) link = { doc: 'yonetmelik', page };
    }
    if (!link) continue;
    if (m.index! > last) parts.push({ text: ref.slice(last, m.index) });
    parts.push({ text: m[0], link });
    last = m.index! + m[0].length;
  }
  if (last < ref.length) parts.push({ text: ref.slice(last) });
  return parts;
}

/** Köprüden gelen isteğin doğrulanması: yalnızca bilinen belge ve geçerli sayfa */
export function isValidLink(x: unknown): x is SourceLink {
  if (typeof x !== 'object' || x === null) return false;
  const { doc, page } = x as Record<string, unknown>;
  return (doc === 'kilavuz' || doc === 'yonetmelik') && Number.isInteger(page) && (page as number) >= 1 && (page as number) <= MAX_PAGES[doc];
}

export const sourceUrlPath = (l: SourceLink): string => `${SOURCE_FILES[l.doc]}#page=${l.page}`;

/** Kılavuzun "İçindekiler" sayfası: genel bağlantılar buraya açılır */
export const KILAVUZ_TOC_PAGE = 3;
