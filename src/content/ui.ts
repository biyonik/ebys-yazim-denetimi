import type { Category, Issue, Severity } from '../core/types.ts';
import { KILAVUZ_TOC_PAGE, parseRef, SOURCE_TITLES, type SourceLink } from '../core/ref-links.ts';
import { openSource } from './sources.ts';

/**
 * Arayüz: öneri balonu, sayaç rozeti, sorun paneli ve bildirim.
 *
 * Editörün iframe'ine değil, editörü barındıran belgeye; o belgede de
 * Shadow DOM içine yerleşir. Böylece:
 *  - EBYS'nin CSS'i bizi, bizim CSS'imiz EBYS'yi bozmaz,
 *  - editör içeriğine (kaydedilen belgeye) hiçbir şey eklenmez,
 *  - JSF form gönderiminde bizim düğümlerimiz yok sayılır (form alanı değiller).
 *
 * Güvenlik: belge metni (sorunlu kelime, öneri) arayüze YALNIZCA textContent
 * ile yazılır. innerHTML yalnızca bizim ürettiğimiz sabit işaretleme içindir.
 */

const SEV_LABEL: Record<Severity, string> = { hata: 'Hata', uyari: 'Kontrol edin', oneri: 'Öneri' };
/** Hata başlığı sorunun türünü söyler: yönetmelik ihlaline "Yazım hatası" demek yanıltır */
const CAT_LABEL: Record<Category, string> = { yazim: 'Yazım hatası', kural: 'Dil bilgisi', noktalama: 'Noktalama', bicim: 'Yazışma kuralı' };
const titleOf = (i: Issue) => (i.severity === 'hata' ? CAT_LABEL[i.category] : SEV_LABEL[i.severity]);
const SEV_COLOR: Record<Severity, string> = { hata: '#d93025', uyari: '#e37400', oneri: '#1a73e8' };
const SEV_ORDER: Severity[] = ['hata', 'uyari', 'oneri'];

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.card {
  position: fixed; z-index: 2147483647; background: #fff; color: #202124;
  border: 1px solid #dadce0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.18);
  font: 13px/1.45 system-ui, "Segoe UI", Arial, sans-serif;
}
.pop { min-width: 220px; max-width: 340px; padding: 10px 12px 8px; }
.sev { font-size: 11px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; margin-bottom: 4px; }
.msg { margin: 0 0 8px; }
.sugs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
button { font: inherit; cursor: pointer; border-radius: 6px; color: inherit; }
.sug { background: #e8f0fe; color: #174ea6; border: 1px solid #d2e3fc; padding: 4px 10px; font-weight: 600; }
.sug:hover, .sug:focus-visible { background: #d2e3fc; outline: none; }
.row { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f3f4; padding-top: 6px; }
.ghost { background: none; border: 0; color: #5f6368; padding: 2px 4px; }
.ghost:hover { color: #202124; text-decoration: underline; }
.rule { color: #80868b; font-size: 11px; text-align: right; max-width: 230px; }
.ref-link {
  background: none; border: 0; padding: 0; color: #1a73e8; font-size: inherit; border-radius: 2px;
  text-decoration: underline dotted; text-underline-offset: 2px;
}
.ref-link:hover, .ref-link:focus-visible { color: #174ea6; text-decoration-style: solid; outline: none; }
.ref-link:focus-visible { box-shadow: 0 0 0 2px #d2e3fc; }
.pf { display: flex; gap: 10px; align-items: center; padding: 7px 12px; border-top: 1px solid #f1f3f4; color: #80868b; font-size: 11px; }
.pf .ref-link { font-size: 11px; }

.badge {
  position: fixed; z-index: 2147483646; font: 600 12px/1 system-ui, "Segoe UI", Arial, sans-serif;
  padding: 5px 9px; border-radius: 999px; border: 1px solid #dadce0; background: #fff; color: #3c4043;
  box-shadow: 0 1px 3px rgba(0,0,0,.12); cursor: pointer; user-select: none;
}
.badge.ok { color: #188038; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; flex: none; }

.panel { width: 340px; display: flex; flex-direction: column; overflow: hidden; }
.ph { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px 6px; }
.ph h2 { font-size: 13px; font-weight: 650; margin: 0; }
.x { background: none; border: 0; font-size: 18px; line-height: 1; color: #5f6368; padding: 0 4px; }
.summary { padding: 0 12px 8px; color: #5f6368; font-size: 12px; }
.fixall {
  margin: 0 12px 6px; padding: 7px 10px; border: 0; background: #1a73e8; color: #fff; font-weight: 600;
}
.fixall:hover { background: #1765cc; }
.fixall:disabled { background: #e8eaed; color: #9aa0a6; cursor: default; }
.hint { padding: 0 12px 8px; color: #5f6368; font-size: 11.5px; border-bottom: 1px solid #f1f3f4; }
.list { overflow-y: auto; padding: 4px 0; }
.item {
  display: flex; align-items: center; gap: 2px; width: 100%; text-align: left; background: none;
  border: 0; border-radius: 0; padding: 6px 12px; min-height: 32px;
}
.item:hover, .item:focus-visible { background: #f1f3f4; outline: none; }
.from { text-decoration: line-through; text-decoration-color: rgba(0,0,0,.35); color: #5f6368;
  max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.arrow { color: #9aa0a6; margin: 0 6px; flex: none; }
.to { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.to.none { font-weight: 400; color: #80868b; font-style: italic; }
.empty { padding: 14px 12px; color: #188038; }

.toast {
  display: flex; align-items: center; gap: 14px; padding: 9px 12px; background: #323232; color: #fff;
  border: 0; max-width: 460px;
}
.toast button { background: none; border: 0; color: #8ab4f8; font-weight: 600; padding: 2px 4px; }
`;

export interface PopoverHandlers {
  onApply(issue: Issue, suggestion: string): void;
  onIgnore(issue: Issue): void;
  onClose(): void;
}

export interface PanelHandlers {
  onFixAll(): void;
  onPick(issue: Issue): void;
  onClose(): void;
}

/** Görünmez önerileri görünür kıl: silme ("") ve tek boşluk (" ") düğmede boş görünürdü */
const show = (s: string) => (s === '' ? '⌫ sil' : s.trim() === '' ? '␣ (tek boşluk)' : s);

export class EditorUi {
  private readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly badge: HTMLElement;
  private pop: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private toast: HTMLElement | null = null;
  private toastTimer: number | undefined;
  private current: Issue | null = null;

  constructor(doc: Document, onBadgeClick: () => void) {
    this.host = doc.createElement('ebys-yazim-ui');
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = STYLE;
    this.badge = doc.createElement('div');
    this.badge.className = 'badge';
    this.badge.setAttribute('role', 'button');
    this.badge.setAttribute('tabindex', '0');
    this.badge.setAttribute('aria-haspopup', 'dialog');
    this.badge.addEventListener('click', onBadgeClick);
    this.badge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onBadgeClick();
      }
    });
    this.root.append(style, this.badge);
    doc.documentElement.appendChild(this.host);
  }

  private get doc(): Document {
    return this.host.ownerDocument;
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = this.doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** Geliştirme derlemesinde son denetimin süresi (testler okur); üretimde çağrılmaz */
  setDebugTiming(info: string): void {
    this.host.setAttribute('data-son-denetim', info);
  }

  get isOpen(): boolean {
    return this.pop !== null;
  }

  get isPanelOpen(): boolean {
    return this.panel !== null;
  }

  get openIssue(): Issue | null {
    return this.current;
  }

  // ── Rozet ──────────────────────────────────────────────────────────────

  updateBadge(issues: Issue[], anchor: DOMRect): void {
    const n = { hata: 0, uyari: 0, oneri: 0 };
    issues.forEach((i) => n[i.severity]++);
    const parts: string[] = [];
    SEV_ORDER.forEach((s) => {
      if (n[s]) parts.push(`<span class="dot" style="background:${SEV_COLOR[s]}"></span>${n[s]}`);
    });
    this.badge.classList.toggle('ok', parts.length === 0);
    this.badge.innerHTML = parts.length ? parts.join('&nbsp;&nbsp;') : '✓ Yazım denetimi';
    this.badge.title = parts.length
      ? `${n.hata} hata, ${n.uyari} uyarı, ${n.oneri} öneri — listeyi açmak için tıklayın`
      : 'Sorun bulunamadı';
    const visible = anchor.width > 0 && anchor.height > 0;
    this.badge.style.display = visible ? '' : 'none';
    this.badge.style.left = `${Math.round(anchor.right - this.badge.offsetWidth - 10)}px`;
    this.badge.style.top = `${Math.round(anchor.bottom - this.badge.offsetHeight - 10)}px`;
  }

  // ── Balon ──────────────────────────────────────────────────────────────

  showPopover(issue: Issue, at: DOMRect, h: PopoverHandlers): void {
    this.hidePopover();
    const pop = this.el('div', 'card pop');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', titleOf(issue));

    const sev = this.el('div', 'sev', titleOf(issue));
    sev.style.color = SEV_COLOR[issue.severity];
    const msg = this.el('p', 'msg', issue.message);

    const sugs = this.el('div', 'sugs');
    issue.suggestions.forEach((s) => {
      const b = this.el('button', 'sug', show(s));
      b.addEventListener('click', () => h.onApply(issue, s));
      sugs.appendChild(b);
    });

    const row = this.el('div', 'row');
    const ignore = this.el('button', 'ghost', 'Yoksay');
    ignore.addEventListener('click', () => h.onIgnore(issue));
    const ref = this.el('span', 'rule');
    ref.title = issue.ruleId;
    this.renderRef(ref, issue.ref ?? issue.ruleId);
    row.append(ignore, ref);

    pop.append(sev, msg, sugs, row);
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') h.onClose();
    });
    this.root.appendChild(pop);

    // Kelimenin altına; sığmazsa üstüne
    const vw = this.doc.documentElement.clientWidth;
    const vh = this.doc.documentElement.clientHeight;
    const left = Math.max(8, Math.min(at.left, vw - pop.offsetWidth - 8));
    const top = at.bottom + 6 + pop.offsetHeight > vh ? at.top - pop.offsetHeight - 6 : at.bottom + 6;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(Math.max(8, top))}px`;

    this.pop = pop;
    this.current = issue;
  }

  /** Dayanak metni: Kılavuz/Yönetmelik atıfları tıklanabilir, gerisi düz metin (textContent) */
  private renderRef(into: HTMLElement, ref: string): void {
    for (const part of parseRef(ref)) {
      if (!part.link) {
        into.append(this.doc.createTextNode(part.text));
        continue;
      }
      into.append(this.sourceButton(part.text, part.link));
    }
  }

  private sourceButton(label: string, link: SourceLink): HTMLButtonElement {
    const b = this.el('button', 'ref-link', label);
    b.type = 'button';
    b.title = `${SOURCE_TITLES[link.doc]} — sayfa ${link.page} (yeni sekmede açılır)`;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSource(link);
    });
    return b;
  }

  hidePopover(): void {
    this.pop?.remove();
    this.pop = null;
    this.current = null;
  }

  // ── Panel ──────────────────────────────────────────────────────────────

  showPanel(issues: Issue[], autoFixable: number, anchor: DOMRect, h: PanelHandlers): void {
    this.hidePanel();
    this.hidePopover();
    const panel = this.el('div', 'card panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Yazım denetimi');

    const head = this.el('div', 'ph');
    const close = this.el('button', 'x', '×');
    close.setAttribute('aria-label', 'Kapat');
    close.addEventListener('click', () => h.onClose());
    head.append(this.el('h2', '', 'Yazım denetimi'), close);
    panel.appendChild(head);

    if (issues.length === 0) {
      panel.appendChild(this.el('div', 'empty', '✓ Sorun bulunamadı.'));
    } else {
      const manual = issues.length - autoFixable;
      panel.appendChild(
        this.el('div', 'summary', `${issues.length} sorun · ${autoFixable} tanesi otomatik düzeltilebilir`),
      );
      const fix = this.el('button', 'fixall', autoFixable ? `Tümünü düzelt (${autoFixable})` : 'Otomatik düzeltilecek sorun yok');
      fix.disabled = autoFixable === 0;
      fix.addEventListener('click', () => h.onFixAll());
      panel.appendChild(fix);
      panel.appendChild(
        this.el(
          'div',
          'hint',
          manual
            ? `${manual} sorun anlamı değiştirebileceği için size bırakılır. Tek Ctrl+Z ile tümü geri alınır.`
            : 'Tek Ctrl+Z ile tümü geri alınır.',
        ),
      );

      const list = this.el('div', 'list');
      list.setAttribute('role', 'list');
      for (const is of issues) {
        const item = this.el('button', 'item');
        item.setAttribute('role', 'listitem');
        item.title = is.message;
        const dot = this.el('span', 'dot');
        dot.style.background = SEV_COLOR[is.severity];
        item.append(
          dot,
          this.el('span', 'from', show(is.text)),
          this.el('span', 'arrow', '→'),
          is.suggestions.length === 0
            ? this.el('span', 'to none', 'açıklamaya bakın')
            : this.el('span', 'to', is.suggestions.map(show).join(' / ')),
        );
        item.addEventListener('click', () => h.onPick(is));
        list.appendChild(item);
      }
      panel.appendChild(list);
    }
    const foot = this.el('div', 'pf', 'Kaynaklar:');
    foot.append(this.sourceButton('Kılavuz', { doc: 'kilavuz', page: KILAVUZ_TOC_PAGE }), this.sourceButton('Yönetmelik', { doc: 'yonetmelik', page: 1 }));
    panel.appendChild(foot);

    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') h.onClose();
    });
    this.root.appendChild(panel);

    // Editörün sağ alt köşesine, rozetin hemen üstüne
    const vw = this.doc.documentElement.clientWidth;
    const maxH = Math.max(200, Math.min(440, anchor.height - 56));
    panel.style.maxHeight = `${Math.round(maxH)}px`;
    const left = Math.max(8, Math.min(anchor.right - panel.offsetWidth - 10, vw - panel.offsetWidth - 8));
    const top = Math.max(8, anchor.bottom - 46 - panel.offsetHeight);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    (panel.querySelector('.fixall:not(:disabled), .item, .x') as HTMLElement | null)?.focus();
    this.panel = panel;
  }

  hidePanel(): void {
    this.panel?.remove();
    this.panel = null;
  }

  // ── Bildirim ───────────────────────────────────────────────────────────

  showToast(text: string, anchor: DOMRect, action?: { label: string; run: () => void }): void {
    this.hideToast();
    const t = this.el('div', 'card toast');
    t.setAttribute('role', 'status');
    t.appendChild(this.el('span', '', text));
    if (action) {
      const b = this.el('button', '', action.label);
      b.addEventListener('click', () => {
        this.hideToast();
        action.run();
      });
      t.appendChild(b);
    }
    this.root.appendChild(t);
    t.style.left = `${Math.round(anchor.left + (anchor.width - t.offsetWidth) / 2)}px`;
    t.style.top = `${Math.round(anchor.bottom - t.offsetHeight - 14)}px`;
    this.toast = t;
    this.toastTimer = window.setTimeout(() => this.hideToast(), 10000);
  }

  hideToast(): void {
    clearTimeout(this.toastTimer);
    this.toast?.remove();
    this.toast = null;
  }

  dispose(): void {
    this.hideToast();
    this.host.remove();
  }
}
