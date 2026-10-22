import { check, fingerprint } from '../core/engine.ts';
import { isAutoFixable, MAX_PASSES } from '../core/fix-all.ts';
import type { DocMeta, Issue } from '../core/types.ts';
import { metaKey, readDocMeta } from './doc-meta.ts';
import { CMD_EVENT, type BridgeCommand } from '../shared/protocol.ts';
import { Highlighter, isSupported } from './highlighter.ts';
import { TextIndex } from './text-index.ts';
import { EditorUi } from './ui.ts';

const DEBOUNCE_MS = 350;

/** Oturum boyunca yoksayılanlar; tüm editörler arasında ortak. Kalıcı değil (bkz. MIMARI.md, Faz 5). */
export const ignored = new Set<string>();

function send(cmd: BridgeCommand): void {
  document.dispatchEvent(new CustomEvent(CMD_EVENT, { detail: JSON.stringify(cmd) }));
}

/**
 * Tek bir CKEditor örneği için yaşam döngüsü.
 *
 * Kritik ayrıntı: CKEditor 4, setData() çağrısında ve kaynak modundan
 * dönüşte iframe belgesini YENİDEN YAZAR. Eski document/body referansları
 * ölü düğümlere işaret eder. Bu yüzden her denetim döngüsünde belge
 * kimliğini doğrular, değişmişse kendimizi yeniden bağlarız.
 */
export class EditorSession {
  readonly iframe: HTMLIFrameElement;
  readonly editorName: string;

  private doc: Document | null = null;
  private body: HTMLElement | null = null;
  private highlighter: Highlighter | null = null;
  private index: TextIndex | null = null;
  private issues: Issue[] = [];
  private timer: number | undefined;
  private detachFns: Array<() => void> = [];
  private readonly ui: EditorUi;
  /** Başlık ve dağıtım (Gereği/Bilgi) bilgisi: editörün dışından, her denetimde ve bekçide tazelenir */
  private meta: DocMeta = {};
  private metaSig = '';

  constructor(iframe: HTMLIFrameElement, editorName: string) {
    this.iframe = iframe;
    this.editorName = editorName;
    this.ui = new EditorUi(iframe.ownerDocument, () => this.togglePanel());
    this.ensureAttached();
  }

  /** Belge değiştiyse yeniden bağlanır. true: denetime hazır. */
  ensureAttached(): boolean {
    const doc = this.iframe.contentDocument;
    const body = doc?.body ?? null;
    if (!doc || !body || !body.isContentEditable) {
      this.detach();
      return false;
    }
    if (doc === this.doc && body === this.body) return true;

    this.detach();
    const win = doc.defaultView;
    if (!win || !isSupported(win)) return false;

    this.doc = doc;
    this.body = body;
    this.highlighter = new Highlighter(win);

    const onInput = () => this.schedule();
    const onMouseUp = () => setTimeout(() => this.onCaret(), 0);
    // Kullanıcı yazmaya devam ederse balon yolunu kesmesin
    const onKeyDown = () => {
      if (this.ui.isOpen) this.closePopover();
      if (this.ui.isPanelOpen) this.ui.hidePanel();
    };
    const onScroll = () => {
      this.closePopover();
      this.positionBadge();
    };
    doc.addEventListener('input', onInput, { passive: true });
    doc.addEventListener('mouseup', onMouseUp, { passive: true });
    doc.addEventListener('keydown', onKeyDown, { passive: true });
    win.addEventListener('scroll', onScroll, { passive: true });
    this.detachFns.push(() => {
      doc.removeEventListener('input', onInput);
      doc.removeEventListener('mouseup', onMouseUp);
      doc.removeEventListener('keydown', onKeyDown);
      win.removeEventListener('scroll', onScroll);
    });

    this.runNow();
    return true;
  }

  private detach(): void {
    this.detachFns.forEach((f) => f());
    this.detachFns = [];
    this.highlighter?.dispose();
    this.highlighter = null;
    this.doc = null;
    this.body = null;
    this.index = null;
    this.issues = [];
    this.closePopover();
  }

  schedule(): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.runNow(), DEBOUNCE_MS);
  }

  runNow(): void {
    clearTimeout(this.timer);
    if (!this.ensureAttached() || !this.body || !this.highlighter) {
      this.positionBadge();
      return;
    }
    const t0 = performance.now();
    this.index = TextIndex.build(this.body);
    const t1 = performance.now();
    this.readMeta();
    this.issues = check(this.index.text, { ignored, meta: this.meta });
    const t2 = performance.now();
    this.highlighter.render(this.index, this.issues);
    if (__DEV__) {
      const words = this.index.text.split(/\s+/).length;
      const info = `${words} kelime · indeks ${(t1 - t0).toFixed(1)} ms · kurallar ${(t2 - t1).toFixed(1)} ms · işaretleme ${(performance.now() - t2).toFixed(1)} ms · ${this.issues.length} sorun`;
      console.debug(`[ebys-yazim] denetim: ${info}`);
      this.ui.setDebugTiming(info);
    }
    // Açık balonun sorunu artık yoksa kapat
    const open = this.ui.openIssue;
    if (open && !this.issues.some((i) => i.start === open.start && fingerprint(i) === fingerprint(open))) {
      this.closePopover();
    }
    this.positionBadge();
  }

  positionBadge(): void {
    this.ui.updateBadge(this.doc ? this.issues : [], this.iframe.getBoundingClientRect());
  }

  /** iframe içi koordinatları barındıran belgenin koordinatlarına çevirir. */
  private readMeta(): boolean {
    try {
      this.meta = readDocMeta(this.iframe);
    } catch {
      this.meta = {};
    }
    const sig = metaKey(this.meta);
    const changed = sig !== this.metaSig;
    this.metaSig = sig;
    return changed;
  }

  /**
   * Bekçiden çağrılır: kullanıcı Bilgileri sekmesinde Gereği/Bilgi seçince editör metni değişmez,
   * ama arz/rica kararı değişir. Bilgi değiştiyse yeniden denetle.
   */
  refreshMeta(): void {
    if (this.readMeta()) this.runNow();
  }

  private toHostRect(r: DOMRect): DOMRect {
    const f = this.iframe.getBoundingClientRect();
    const cs = getComputedStyle(this.iframe);
    const dx = f.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const dy = f.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
    return new DOMRect(r.left + dx, r.top + dy, r.width, r.height);
  }

  private onCaret(): void {
    if (!this.doc || !this.index) return;
    const sel = this.doc.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return this.closePopover();
    const pos = this.index.fromDomPoint(sel.anchorNode!, sel.anchorOffset);
    if (pos === null) return this.closePopover();
    const issue = this.issues.find((i) => i.start <= pos && pos <= i.end);
    if (!issue) return this.closePopover();
    this.openPopover(issue);
  }

  private openPopover(issue: Issue): void {
    if (!this.doc || !this.index || !this.highlighter) return;
    const range = this.index.toDomRange(this.doc, issue.start, issue.end);
    if (!range) return;
    this.highlighter.setActive(range);
    const rect = range.getBoundingClientRect();
    this.ui.showPopover(issue, this.toHostRect(rect), {
      onApply: (is, s) => this.apply(is, s),
      onIgnore: (is) => {
        ignored.add(fingerprint(is));
        this.closePopover();
        this.runNow();
        send({ op: 'focus', editor: this.editorName });
      },
      onClose: () => {
        this.closePopover();
        send({ op: 'focus', editor: this.editorName });
      },
    });
  }

  private closePopover(): void {
    this.highlighter?.setActive(null);
    this.ui.hidePopover();
  }

  /** Rozet: sorun panelini aç/kapat */
  private togglePanel(): void {
    if (this.ui.isPanelOpen) {
      this.ui.hidePanel();
      return;
    }
    this.closePopover();
    this.runNow();
    this.ui.showPanel(this.issues, this.issues.filter(isAutoFixable).length, this.iframe.getBoundingClientRect(), {
      onFixAll: () => {
        this.ui.hidePanel();
        this.applyAll();
      },
      onPick: (is) => {
        this.ui.hidePanel();
        this.reveal(is);
      },
      onClose: () => {
        this.ui.hidePanel();
        send({ op: 'focus', editor: this.editorName });
      },
    });
  }

  /** Sorunu görünür alana kaydırıp balonunu açar */
  private reveal(issue: Issue): void {
    if (!this.doc || !this.index) return;
    const r = this.index.toDomRange(this.doc, issue.start, issue.end);
    r?.startContainer.parentElement?.scrollIntoView({ block: 'center' });
    this.openPopover(issue);
  }

  /**
   * Tümünü düzelt.
   *
   * Politika core/fix-all.ts'tedir (yalnızca tek doğru cevabı olanlar).
   * Uygulama tek bir undo adımıdır: snapshot → N değişiklik → commit.
   * Ara adımlarda CKEditor'e snapshot aldırılmaz; kullanıcı Ctrl+Z'ye bir kez
   * bastığında belge toplu düzeltmeden önceki hâline döner.
   *
   * Düzeltmeler sağdan sola uygulanır. TextIndex'in ofset eşlemesi metin
   * düğümü içi konumlara dayandığı için, sondaki bir değişiklik aynı
   * düğümdeki öndeki konumları kaydırmaz; tek indeksle tüm turu bitiririz.
   */
  applyAll(): void {
    this.closePopover();
    if (!this.ensureAttached() || !this.body) return;
    send({ op: 'snapshot', editor: this.editorName });
    let applied = 0;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const idx = TextIndex.build(this.body);
      const fixes = check(idx.text, { ignored, meta: this.meta })
        .filter(isAutoFixable)
        .sort((a, b) => b.start - a.start);
      let n = 0;
      for (const f of fixes) {
        if (idx.text.slice(f.start, f.end) !== f.text) continue;
        if (idx.replaceMinimal(f.start, f.end, f.suggestions[0]!)) n++;
      }
      applied += n;
      if (n === 0) break; // zincirleme yeni düzeltme kalmadı
    }
    send({ op: 'commit', editor: this.editorName });
    send({ op: 'focus', editor: this.editorName });
    this.runNow();

    const left = this.issues.length;
    const text =
      applied === 0
        ? 'Otomatik düzeltilecek sorun bulunamadı.'
        : `${applied} düzeltme uygulandı.` + (left ? ` ${left} sorun kararınıza bırakıldı.` : '');
    this.ui.showToast(
      text,
      this.iframe.getBoundingClientRect(),
      applied
        ? {
            label: 'Geri al',
            run: () => {
              send({ op: 'undo', editor: this.editorName });
              requestAnimationFrame(() => this.runNow());
            },
          }
        : undefined,
    );
  }

  /**
   * Düzeltmeyi uygular. Sıra önemlidir ve eşzamanlıdır:
   *   snapshot (undo noktası) → metin düğümlerini değiştir → commit (yeni undo noktası + textarea senkronu)
   */
  private apply(issue: Issue, replacement: string): void {
    this.closePopover();
    if (!this.ensureAttached() || !this.body || !this.doc) return;
    // Bayatlık kontrolü: belge balon açıkken değişmiş olabilir
    const fresh = TextIndex.build(this.body);
    if (fresh.text.slice(issue.start, issue.end) !== issue.text) {
      this.runNow();
      return;
    }
    send({ op: 'snapshot', editor: this.editorName });
    const ok = fresh.replaceMinimal(issue.start, issue.end, replacement);
    send({ op: 'commit', editor: this.editorName });
    send({ op: 'focus', editor: this.editorName });
    this.runNow();
    if (ok && this.index && this.doc) {
      // İmleci düzeltilen metnin sonuna koy
      const caret = this.index.toDomRange(this.doc, issue.start, issue.start + replacement.length);
      const sel = this.doc.getSelection();
      if (caret && sel) {
        caret.collapse(false);
        sel.removeAllRanges();
        sel.addRange(caret);
      }
    }
  }

  get lastIssues(): readonly Issue[] {
    return this.issues;
  }

  dispose(): void {
    this.detach();
    this.ui.dispose();
  }
}
