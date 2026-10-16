/**
 * İçerik betiği girişi (isolated world).
 *
 * Editör keşfi DOM üzerinden yapılır; CKEDITOR global'ine ihtiyaç duymaz:
 *   <div id="cke_{editörAdı}" class="cke ..."> … <iframe class="cke_wysiwyg_frame">
 * Editör adı = kapsayıcı id'sinden "cke_" öneki atılmış hâli
 * (ör. "yeniGidenEvrakForm:ckeditorInstance_window1").
 *
 * Üç tetikleyici birlikte çalışır; her biri diğerinin kaçırdığını yakalar:
 *   1. MutationObserver — yeni açılan evrak pencereleri (window1, window2…)
 *   2. Köprü olayları — contentDom/mode: CKEditor belgeyi yeniden yazdı
 *   3. Bekçi (1 sn) — yukarıdakilerin hiçbirinin görmediği durumlar
 *      (ör. editör DOM'dan sessizce kaldırıldı)
 */
import { EVT_EVENT, type BridgeEvent } from '../shared/protocol.ts';
import { EditorSession } from './session.ts';
import { warmUp } from '../core/morph/analyzer.ts';

const sessions = new Map<HTMLIFrameElement, EditorSession>();

function editorNameOf(iframe: HTMLIFrameElement): string | null {
  const container = iframe.closest<HTMLElement>('.cke[id^="cke_"]');
  return container ? container.id.slice(4) : null;
}

function scan(): void {
  document.querySelectorAll<HTMLIFrameElement>('iframe.cke_wysiwyg_frame').forEach((f) => {
    if (sessions.has(f)) return;
    const name = editorNameOf(f);
    if (!name) return;
    sessions.set(f, new EditorSession(f, name));
  });
  for (const [f, s] of sessions) {
    if (!f.isConnected) {
      s.dispose();
      sessions.delete(f);
    }
  }
}

function sessionByName(name: string): EditorSession | undefined {
  for (const s of sessions.values()) if (s.editorName === name) return s;
  return undefined;
}

document.addEventListener(EVT_EVENT, (ev) => {
  let e: BridgeEvent;
  try {
    e = JSON.parse(String((ev as CustomEvent).detail)) as BridgeEvent;
  } catch {
    return;
  }
  if (e.type === 'ready' || e.type === 'contentDom' || e.type === 'mode') {
    scan();
    // contentDom anında body henüz hazır olmayabilir; bir sonraki kareye bırak
    requestAnimationFrame(() => sessionByName(e.editor)?.runNow());
  } else if (e.type === 'change') {
    sessionByName(e.editor)?.schedule();
  }
});

let scanQueued = false;
new MutationObserver(() => {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(() => {
    scanQueued = false;
    scan();
  });
}).observe(document.documentElement, { childList: true, subtree: true });

setInterval(() => {
  scan();
  for (const s of sessions.values()) {
    s.ensureAttached(); // belge değiştiyse yeniden bağlanır ve denetler
    s.positionBadge();
  }
}, 1000);

const reposition = () => sessions.forEach((s) => s.positionBadge());
window.addEventListener('resize', reposition, { passive: true });
window.addEventListener('scroll', reposition, { passive: true, capture: true });

scan();

// Sözlüğü (~35 bin kök) sayfa boştayken yükle: ilk denetim kullanıcıyı bekletmesin.
// Editör yoksa hiç yükleme — eklenti EBYS'nin editörsüz sayfalarında iz bırakmaz.
const idle = (cb: () => void) =>
  'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 500);
idle(() => {
  if (document.querySelector('iframe.cke_wysiwyg_frame')) warmUp();
});
