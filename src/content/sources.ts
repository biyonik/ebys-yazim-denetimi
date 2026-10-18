import type { SourceLink } from '../core/ref-links.ts';
import { OPEN_SOURCE, type OpenSourceMessage } from '../shared/protocol.ts';

/** Kaynak belgeyi arka plan aracılığıyla yeni sekmede açar */
export function openSource(link: SourceLink): void {
  const msg: OpenSourceMessage = { type: OPEN_SOURCE, link };
  try {
    void chrome.runtime.sendMessage(msg).catch(() => {});
  } catch {
    // Eklenti güncellendiyse eski içerik betiğinin bağlamı geçersizdir; sayfa yenilenince düzelir
    console.warn('[ebys-yazim] Kaynak açılamadı: eklenti yeniden yüklenmiş, sayfayı yenileyin.');
  }
}
