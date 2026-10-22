import { fingerprint } from '../core/engine.ts';
import { isAutoFixable } from '../core/fix-all.ts';
import { checkKonu, fixAllKonu } from '../core/konu.ts';
import { parseRef, SOURCE_TITLES } from '../core/ref-links.ts';
import type { Issue, Severity } from '../core/types.ts';
import { openSource } from './sources.ts';

/**
 * EBYS "Konu" alanı (Belgenet, Evrak Oluştur → Bilgileri sekmesi):
 *   <textarea id="yeniGidenEvrakForm:evrakBilgileriList:3:konuTextArea" class="… metadataKonuTextArea …"
 *             onchange="PrimeFaces.ab(…)">
 *
 * Editörden farkları ve bunların sonuçları:
 *  - Düz <textarea>: içine işaret çizilemez (Highlight API yalnızca DOM metninde çalışır). Bu yüzden
 *    alanın sağına küçük bir sayaç, tıklanınca altında sorun listesi gösterilir.
 *  - Değer sunucuya PrimeFaces'in "change" olayıyla gider. Düzeltme sonrası "input" ve "change"
 *    olayları tetiklenir; satır içi onchange işleyicisi DOM olayına bağlı olduğu için dünyadan bağımsız
 *    çalışır. Böylece EBYS düzeltilmiş konuyu kendi modeline alır.
 */
export const KONU_SELECTOR = 'textarea.metadataKonuTextArea, textarea[id$=":konuTextArea"]';

const DEBOUNCE_MS = 250;
const SEV_COLOR: Record<Severity, string> = { hata: '#d93025', uyari: '#e37400', oneri: '#1a73e8' };
const show = (s: string) => (s === '' ? '⌫ sil' : s);

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.pill { position: fixed; z-index: 2147483646; display: none; align-items: center; gap: 6px; cursor: pointer;
  font: 600 11.5px/1 system-ui, "Segoe UI", Arial, sans-serif; padding: 4px 8px; border-radius: 999px;
  border: 1px solid #dadce0; background: #fff; color: #3c4043; box-shadow: 0 1px 3px rgba(0,0,0,.12); user-select: none; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; }
.card { position: fixed; z-index: 2147483647; width: 340px; background: #fff; color: #202124; border: 1px solid #dadce0;
  border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.18); font: 13px/1.45 system-ui, "Segoe UI", Arial, sans-serif; overflow: hidden; }
.head { display: flex; justify-content: space-between; align-items: center; padding: 9px 12px 4px; font-weight: 650; }
.x { background: none; border: 0; font-size: 18px; line-height: 1; color: #5f6368; cursor: pointer; padding: 0 4px; }
.item { padding: 7px 12px; border-top: 1px solid #f1f3f4; }
.msg { margin: 2px 0 6px; color: #3c4043; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.from { font-weight: 600; }
button { font: inherit; cursor: pointer; border-radius: 6px; }
.sug { background: #e8f0fe; color: #174ea6; border: 1px solid #d2e3fc; padding: 2px 9px; font-weight: 600; }
.sug:hover, .sug:focus-visible { background: #d2e3fc; outline: none; }
.ref { margin-left: auto; color: #80868b; font-size: 11px; }
.ref-link { background: none; border: 0; padding: 0; color: #1a73e8; font-size: 11px; text-decoration: underline dotted; text-underline-offset: 2px; }
.fixall { display: block; width: calc(100% - 24px); margin: 8px 12px 10px; padding: 6px 10px; border: 0; background: #1a73e8; color: #fff; font-weight: 600; }
.fixall:hover { background: #1765cc; }
`;

export class KonuField {
  readonly field: HTMLTextAreaElement;
  private readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly pill: HTMLElement;
  private card: HTMLElement | null = null;
  private issues: Issue[] = [];
  private timer: number | undefined;
  private readonly ignored: Set<string>;
  private readonly off: Array<() => void> = [];

  constructor(field: HTMLTextAreaElement, ignored: Set<string>) {
    this.field = field;
    this.ignored = ignored;
    const doc = field.ownerDocument;
    this.host = doc.createElement('ebys-yazim-konu');
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = STYLE;
    this.pill = doc.createElement('div');
    this.pill.className = 'pill';
    this.pill.setAttribute('role', 'button');
    this.pill.setAttribute('tabindex', '0');
    this.pill.addEventListener('click', () => this.toggle());
    this.pill.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggle();
      }
    });
    this.root.append(style, this.pill);
    doc.documentElement.appendChild(this.host);

    const onInput = () => this.schedule();
    field.addEventListener('input', onInput, { passive: true });
    field.addEventListener('change', onInput, { passive: true });
    this.off.push(() => {
      field.removeEventListener('input', onInput);
      field.removeEventListener('change', onInput);
    });
    this.runNow();
  }

  schedule(): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.runNow(), DEBOUNCE_MS);
  }

  runNow(): void {
    clearTimeout(this.timer);
    this.issues = checkKonu(this.field.value, { ignored: this.ignored });
    this.renderPill();
    if (this.card) this.openCard(); // açıksa içeriğini tazele
  }

  /** Alan görünmüyorsa (başka sekme) sayaç da görünmez */
  position(): void {
    const r = this.field.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0 && this.issues.length > 0;
    this.pill.style.display = visible ? 'inline-flex' : 'none';
    if (!visible) {
      this.closeCard();
      return;
    }
    this.pill.style.left = `${Math.round(r.right + 6)}px`;
    this.pill.style.top = `${Math.round(r.top + (r.height - this.pill.offsetHeight) / 2)}px`;
    if (this.card) {
      const vw = this.field.ownerDocument.documentElement.clientWidth;
      this.card.style.left = `${Math.round(Math.max(8, Math.min(r.left, vw - this.card.offsetWidth - 8)))}px`;
      this.card.style.top = `${Math.round(r.bottom + 6)}px`;
    }
  }

  private renderPill(): void {
    const n = { hata: 0, uyari: 0, oneri: 0 };
    this.issues.forEach((i) => n[i.severity]++);
    this.pill.replaceChildren();
    (['hata', 'uyari', 'oneri'] as Severity[]).forEach((s) => {
      if (!n[s]) return;
      const dot = this.el('span', 'dot');
      dot.style.background = SEV_COLOR[s];
      this.pill.append(dot, this.field.ownerDocument.createTextNode(String(n[s])));
    });
    this.pill.title = 'Konu alanında yazım ve Yönetmelik m.13 denetimi — ayrıntı için tıklayın';
    this.position();
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = this.field.ownerDocument.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  private toggle(): void {
    if (this.card) this.closeCard();
    else this.openCard();
  }

  private closeCard(): void {
    this.card?.remove();
    this.card = null;
  }

  private openCard(): void {
    this.closeCard();
    if (this.issues.length === 0) return;
    const card = this.el('div', 'card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Konu denetimi');
    const head = this.el('div', 'head', 'Konu');
    const x = this.el('button', 'x', '×');
    x.setAttribute('aria-label', 'Kapat');
    x.addEventListener('click', () => this.closeCard());
    head.append(x);
    card.append(head);

    for (const is of this.issues) {
      const item = this.el('div', 'item');
      const row = this.el('div', 'row');
      const dot = this.el('span', 'dot');
      dot.style.background = SEV_COLOR[is.severity];
      row.append(dot, this.el('span', 'from', is.text.trim() || '·'));
      for (const s of is.suggestions) {
        const b = this.el('button', 'sug', show(s));
        b.addEventListener('click', () => this.apply(is, s));
        row.append(b);
      }
      const ign = this.el('button', 'ref-link', 'Yoksay');
      ign.addEventListener('click', () => {
        this.ignored.add(fingerprint(is));
        this.runNow();
      });
      row.append(ign);
      const ref = this.el('span', 'ref');
      for (const p of parseRef(is.ref ?? '')) {
        if (!p.link) {
          ref.append(this.field.ownerDocument.createTextNode(p.text));
          continue;
        }
        const link = p.link;
        const a = this.el('button', 'ref-link', p.text);
        a.title = `${SOURCE_TITLES[link.doc]} — sayfa ${link.page}`;
        a.addEventListener('click', () => openSource(link));
        ref.append(a);
      }
      item.append(row, this.el('div', 'msg', is.message), ref);
      card.append(item);
    }
    const auto = this.issues.filter(isAutoFixable).length;
    if (auto) {
      const fix = this.el('button', 'fixall', `Tümünü düzelt (${auto})`);
      fix.addEventListener('click', () => this.setValue(fixAllKonu(this.field.value, { ignored: this.ignored }).value));
      card.append(fix);
    }
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeCard();
    });
    this.root.append(card);
    this.card = card;
    this.position();
  }

  private apply(is: Issue, suggestion: string): void {
    const v = this.field.value;
    if (v.slice(is.start, is.end) !== is.text) return this.runNow(); // bayat
    this.setValue(v.slice(0, is.start) + suggestion + v.slice(is.end), is.start + suggestion.length);
  }

  /** Değeri yazar ve EBYS'ye (PrimeFaces onchange) bildirir */
  private setValue(value: string, caret?: number): void {
    if (value === this.field.value) return;
    this.field.value = value;
    this.field.dispatchEvent(new Event('input', { bubbles: true }));
    this.field.dispatchEvent(new Event('change', { bubbles: true }));
    if (caret !== undefined) {
      this.field.focus();
      this.field.setSelectionRange(caret, caret);
    }
    this.runNow();
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.off.forEach((f) => f());
    this.host.remove();
  }
}
