/**
 * MAIN world köprüsü. Sayfanın kendi JS bağlamında çalışır.
 *
 * Bu dosya bilinçli olarak küçük tutulur: sayfa bağlamında çalışan her satır
 * sayfanın kodu tarafından etkilenebilir (prototip değişiklikleri vb.) ve
 * güvenlik incelemesinde en çok sorgulanacak kısımdır.
 */
import { CMD_EVENT, EVT_EVENT, type BridgeCommand, type BridgeEvent } from '../shared/protocol.ts';

interface CkEditor {
  name: string;
  mode: string;
  fire(name: string, data?: unknown): unknown;
  on(name: string, fn: () => void): void;
  focus(): void;
  updateElement(): void;
  execCommand(name: string): boolean;
}
interface CkGlobal {
  instances: Record<string, CkEditor>;
  on(name: string, fn: (e: { editor: CkEditor }) => void): void;
}

(() => {
  const w = window as unknown as { CKEDITOR?: CkGlobal; __ebysYazimBridge?: boolean };
  if (w.__ebysYazimBridge) return;
  w.__ebysYazimBridge = true;

  const emit = (e: BridgeEvent) =>
    document.dispatchEvent(new CustomEvent(EVT_EVENT, { detail: JSON.stringify(e) }));

  const hooked = new WeakSet<CkEditor>();
  const hook = (ed: CkEditor) => {
    if (hooked.has(ed)) return;
    hooked.add(ed);
    ed.on('contentDom', () => emit({ type: 'contentDom', editor: ed.name }));
    ed.on('change', () => emit({ type: 'change', editor: ed.name }));
    ed.on('mode', () => emit({ type: 'mode', editor: ed.name, mode: ed.mode }));
    emit({ type: 'ready', editor: ed.name });
  };

  document.addEventListener(CMD_EVENT, (ev) => {
    let cmd: BridgeCommand;
    try {
      cmd = JSON.parse(String((ev as CustomEvent).detail)) as BridgeCommand;
    } catch {
      return;
    }
    const ed = w.CKEDITOR?.instances[cmd.editor];
    if (!ed) return;
    switch (cmd.op) {
      case 'snapshot':
        ed.fire('saveSnapshot');
        break;
      case 'commit':
        ed.fire('saveSnapshot');
        // JSF formu gizli <textarea> üzerinden gönderir; senkron tut
        ed.updateElement();
        break;
      case 'focus':
        ed.focus();
        break;
      case 'undo':
        // CKEditor'ün kendi undo'su: kullanıcının Ctrl+Z'siyle aynı yol
        ed.execCommand('undo');
        ed.updateElement();
        break;
    }
  });

  // CKEDITOR global'i EBYS betikleri yüklendikçe gelir; kısa süre bekle
  let tries = 0;
  const attach = () => {
    const C = w.CKEDITOR;
    if (!C) {
      if (++tries < 120) setTimeout(attach, 250);
      return;
    }
    Object.values(C.instances).forEach(hook);
    C.on('instanceReady', (e) => hook(e.editor));
  };
  attach();
})();
