import type { Issue, Severity } from '../core/types.ts';

/**
 * Arayüz: öneri balonu + sayaç rozeti.
 *
 * Editörün iframe'ine değil, editörü barındıran belgeye; o belgede de
 * Shadow DOM içine yerleşir. Böylece:
 *  - EBYS'nin CSS'i bizi, bizim CSS'imiz EBYS'yi bozmaz,
 *  - editör içeriğine (kaydedilen belgeye) hiçbir şey eklenmez,
 *  - JSF form gönderiminde bizim düğümlerimiz yok sayılır (form alanı değiller).
 */

const SEV_LABEL: Record<Severity, string> = { hata: 'Yazım hatası', uyari: 'Kontrol edin', oneri: 'Öneri' };
const SEV_COLOR: Record<Severity, string> = { hata: '#d93025', uyari: '#e37400', oneri: '#1a73e8' };

const STYLE = `
:host { all: initial; }
.pop {
  position: fixed; z-index: 2147483647; min-width: 220px; max-width: 340px;
  background: #fff; color: #202124; border: 1px solid #dadce0; border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.18); font: 13px/1.45 system-ui, "Segoe UI", Arial, sans-serif;
  padding: 10px 12px 8px;
}
.sev { font-size: 11px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; margin-bottom: 4px; }
.msg { margin: 0 0 8px; }
.sugs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
button { font: inherit; cursor: pointer; border-radius: 6px; }
.sug { background: #e8f0fe; color: #174ea6; border: 1px solid #d2e3fc; padding: 4px 10px; font-weight: 600; }
.sug:hover, .sug:focus-visible { background: #d2e3fc; outline: none; }
.row { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f3f4; padding-top: 6px; }
.ghost { background: none; border: 0; color: #5f6368; padding: 2px 4px; }
.ghost:hover { color: #202124; text-decoration: underline; }
.rule { color: #9aa0a6; font-size: 11px; }
.badge {
  position: fixed; z-index: 2147483646; font: 600 12px/1 system-ui, "Segoe UI", Arial, sans-serif;
  padding: 5px 9px; border-radius: 999px; border: 1px solid #dadce0; background: #fff; color: #3c4043;
  box-shadow: 0 1px 3px rgba(0,0,0,.12); cursor: pointer; user-select: none;
}
.badge.ok { color: #188038; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; vertical-align: 0; }
`;

export interface PopoverHandlers {
  onApply(issue: Issue, suggestion: string): void;
  onIgnore(issue: Issue): void;
  onClose(): void;
}

export class EditorUi {
  private readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly badge: HTMLElement;
  private pop: HTMLElement | null = null;
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
    this.badge.addEventListener('click', onBadgeClick);
    this.badge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') onBadgeClick();
    });
    this.root.append(style, this.badge);
    doc.documentElement.appendChild(this.host);
  }

  get isOpen(): boolean {
    return this.pop !== null;
  }

  get openIssue(): Issue | null {
    return this.current;
  }

  updateBadge(issues: Issue[], anchor: DOMRect): void {
    const n = { hata: 0, uyari: 0, oneri: 0 };
    issues.forEach((i) => n[i.severity]++);
    const parts: string[] = [];
    (['hata', 'uyari', 'oneri'] as Severity[]).forEach((s) => {
      if (n[s]) parts.push(`<span class="dot" style="background:${SEV_COLOR[s]}"></span>${n[s]}`);
    });
    this.badge.classList.toggle('ok', parts.length === 0);
    this.badge.innerHTML = parts.length ? parts.join('&nbsp;&nbsp;') : '✓ Yazım denetimi';
    this.badge.title = parts.length
      ? `${n.hata} hata, ${n.uyari} uyarı, ${n.oneri} öneri — sonrakine gitmek için tıklayın`
      : 'Sorun bulunamadı';
    const visible = anchor.width > 0 && anchor.height > 0;
    this.badge.style.display = visible ? '' : 'none';
    this.badge.style.left = `${Math.round(anchor.right - this.badge.offsetWidth - 10)}px`;
    this.badge.style.top = `${Math.round(anchor.bottom - this.badge.offsetHeight - 10)}px`;
  }

  showPopover(issue: Issue, at: DOMRect, h: PopoverHandlers): void {
    this.hidePopover();
    const doc = this.host.ownerDocument;
    const pop = doc.createElement('div');
    pop.className = 'pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', SEV_LABEL[issue.severity]);

    const sev = doc.createElement('div');
    sev.className = 'sev';
    sev.style.color = SEV_COLOR[issue.severity];
    sev.textContent = SEV_LABEL[issue.severity];

    const msg = doc.createElement('p');
    msg.className = 'msg';
    msg.textContent = issue.message;

    const sugs = doc.createElement('div');
    sugs.className = 'sugs';
    issue.suggestions.forEach((s) => {
      const b = doc.createElement('button');
      b.className = 'sug';
      // Boşluk önerisi görünmez olurdu; görünür hâle getir
      b.textContent = s.trim() === '' ? '␣ (tek boşluk)' : s;
      b.addEventListener('click', () => h.onApply(issue, s));
      sugs.appendChild(b);
    });

    const row = doc.createElement('div');
    row.className = 'row';
    const ignore = doc.createElement('button');
    ignore.className = 'ghost';
    ignore.textContent = 'Yoksay';
    ignore.addEventListener('click', () => h.onIgnore(issue));
    const rule = doc.createElement('span');
    rule.className = 'rule';
    rule.textContent = issue.ruleId;
    row.append(ignore, rule);

    pop.append(sev, msg, sugs, row);
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') h.onClose();
    });
    this.root.appendChild(pop);

    // Kelimenin altına; sığmazsa üstüne
    const vw = doc.documentElement.clientWidth;
    const vh = doc.documentElement.clientHeight;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const left = Math.max(8, Math.min(at.left, vw - pw - 8));
    const top = at.bottom + 6 + ph > vh ? at.top - ph - 6 : at.bottom + 6;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(Math.max(8, top))}px`;

    this.pop = pop;
    this.current = issue;
  }

  hidePopover(): void {
    this.pop?.remove();
    this.pop = null;
    this.current = null;
  }

  dispose(): void {
    this.host.remove();
  }
}
