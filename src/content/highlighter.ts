import type { Issue, Severity } from '../core/types.ts';
import type { TextIndex } from './text-index.ts';

/**
 * İşaretleme: CSS Custom Highlight API.
 *
 * Neden <span class="hata"> ile sarmıyoruz?
 *  - CKEditor 4 kendi DOM'unu model kabul eder; araya giren span'ler
 *    getData() çıktısına, yani KAYDEDİLEN/İMZALANAN belgeye sızabilir.
 *  - Geri al (undo) geçmişi bizim span'lerimizle dolar.
 *  - Kullanıcı yazarken span sınırları imleci bozar.
 *
 * Highlight API yalnızca Range nesneleri tutar; DOM'a tek bir düğüm eklemez.
 * Stil de <style> etiketi ile değil, adoptedStyleSheets ile verilir; böylece
 * iframe belgesinde serileştirilebilecek hiçbir iz kalmaz (fullPage modunda
 * bile).
 *
 * Dikkat: Highlight ve CSSStyleSheet nesneleri iframe'in KENDİ penceresinin
 * kurucularıyla oluşturulmalıdır; üst pencereninkiyle oluşturulan nesneler
 * iframe belgesine bağlanamaz.
 */

export const HIGHLIGHT_NAMES: Record<Severity, string> = {
  hata: 'ebys-yazim-hata',
  uyari: 'ebys-yazim-uyari',
  oneri: 'ebys-yazim-oneri',
};
const ACTIVE = 'ebys-yazim-aktif';

const CSS = `
::highlight(${HIGHLIGHT_NAMES.hata}) {
  text-decoration: underline wavy #d93025;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 3px;
}
::highlight(${HIGHLIGHT_NAMES.uyari}) {
  text-decoration: underline wavy #e37400;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 3px;
}
::highlight(${HIGHLIGHT_NAMES.oneri}) {
  text-decoration: underline dotted #1a73e8;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}
::highlight(${ACTIVE}) {
  background-color: rgba(26, 115, 232, 0.16);
}
`;

type HWindow = Window & typeof globalThis & {
  Highlight: new (...ranges: Range[]) => { add(r: Range): void; priority: number };
  CSS: { highlights: Map<string, unknown> };
};

export function isSupported(win: Window): boolean {
  const w = win as HWindow;
  return typeof w.Highlight === 'function' && !!w.CSS?.highlights;
}

export class Highlighter {
  private readonly win: HWindow;
  private readonly doc: Document;
  private sheet: CSSStyleSheet | null = null;

  constructor(win: Window) {
    this.win = win as HWindow;
    this.doc = win.document;
    this.installStyles();
  }

  private installStyles(): void {
    const Sheet = this.win.CSSStyleSheet;
    const sheet = new Sheet();
    sheet.replaceSync(CSS);
    this.doc.adoptedStyleSheets = [...this.doc.adoptedStyleSheets, sheet];
    this.sheet = sheet;
  }

  render(index: TextIndex, issues: Issue[]): void {
    const groups: Record<Severity, Range[]> = { hata: [], uyari: [], oneri: [] };
    for (const is of issues) {
      const r = index.toDomRange(this.doc, is.start, is.end);
      if (r) groups[is.severity].push(r);
    }
    const reg = this.win.CSS.highlights;
    (Object.keys(groups) as Severity[]).forEach((sev, i) => {
      const h = new this.win.Highlight(...groups[sev]);
      h.priority = 3 - i; // hata en üstte
      reg.set(HIGHLIGHT_NAMES[sev], h);
    });
  }

  setActive(range: Range | null): void {
    const reg = this.win.CSS.highlights;
    if (range) reg.set(ACTIVE, new this.win.Highlight(range));
    else reg.delete(ACTIVE);
  }

  dispose(): void {
    try {
      const reg = this.win.CSS.highlights;
      Object.values(HIGHLIGHT_NAMES).forEach((n) => reg.delete(n));
      reg.delete(ACTIVE);
      if (this.sheet) this.doc.adoptedStyleSheets = this.doc.adoptedStyleSheets.filter((s) => s !== this.sheet);
    } catch {
      // Belge zaten yok edilmiş olabilir (setData/kaynak modu); sessizce geç
    }
  }
}
