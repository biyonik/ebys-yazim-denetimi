import { isValidLink, sourceUrlPath } from '../core/ref-links.ts';

/** Araç çubuğu penceresi: sürüm, dayanak belgeler ve geliştirici bilgisi. Ağ erişimi yok. */
const ver = document.getElementById('ver');
if (ver) ver.textContent = `Sürüm ${chrome.runtime.getManifest().version}`;

for (const b of document.querySelectorAll<HTMLButtonElement>('button.src')) {
  b.addEventListener('click', () => {
    const link = { doc: b.dataset['doc'], page: Number(b.dataset['page']) };
    if (!isValidLink(link)) return;
    void chrome.tabs.create({ url: chrome.runtime.getURL(sourceUrlPath(link)) }).then(() => window.close());
  });
}
