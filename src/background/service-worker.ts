import { isValidLink, sourceUrlPath } from '../core/ref-links.ts';
import { OPEN_SOURCE } from '../shared/protocol.ts';

/**
 * Arka plan: tek görevi, uyarı balonundaki dayanağa tıklanınca kaynak PDF'i
 * (Kılavuz ya da Yönetmelik) ilgili sayfada yeni sekmede açmak.
 *
 * Neden içerik betiğinden doğrudan açılmıyor? Web sayfası bağlamından
 * chrome-extension:// adresine gitmek, dosyanın "web_accessible_resources"
 * olarak herkese açılmasını gerektirir; o zaman EBYS sayfası (ya da herhangi
 * bir site) eklentinin varlığını bu dosyalardan tespit edebilir. chrome.tabs.create
 * ise izin istemez ve dosyaları dışarı açmaz.
 */
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  const m = message as { type?: unknown; link?: unknown };
  if (m?.type !== OPEN_SOURCE || !isValidLink(m.link)) return;
  const tab = sender.tab;
  void chrome.tabs.create({
    url: chrome.runtime.getURL(sourceUrlPath(m.link)),
    ...(tab ? { index: tab.index + 1, windowId: tab.windowId, ...(tab.id !== undefined ? { openerTabId: tab.id } : {}) } : {}),
  });
});
