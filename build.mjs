// Build: node build.mjs [--dev]
//  --dev  → localhost adreslerini de ekler (test harness için)
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const dev = process.argv.includes('--dev');
const cfg = JSON.parse(readFileSync('ebys.config.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const matches = [...cfg.origins, ...(dev ? cfg.devOrigins : [])];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

await build({
  entryPoints: {
    content: 'src/content/main.ts',
    bridge: 'src/bridge/main-world.ts',
    background: 'src/background/service-worker.ts',
    popup: 'src/popup/popup.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome111',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  define: { __DEV__: dev ? 'true' : 'false' },
  logLevel: 'warning',
});

// Ağ erişimi yasağı: paketlenmiş kodda hiçbir ağ API'si bulunmamalı.
// Bu, "metin dışarı çıkmaz" iddiasının makine tarafından doğrulanan hâlidir.
const FORBIDDEN = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection|importScripts)\b/;
for (const f of ['content.js', 'bridge.js', 'background.js', 'popup.js']) {
  const src = readFileSync(`dist/${f}`, 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
  const m = FORBIDDEN.exec(src);
  if (m) {
    console.error(`HATA: dist/${f} içinde yasaklı ağ API'si bulundu: ${m[0]}`);
    process.exit(1);
  }
}

// Statik dosyalar: simgeler, araç çubuğu penceresi, dayanak belgeler (PDF)
cpSync('assets/icons', 'dist/icons', { recursive: true, filter: (p) => !p.replaceAll('\\', '/').includes('/kaynak') });
cpSync('assets/kaynak', 'dist/kaynak', { recursive: true });
cpSync('src/popup/popup.html', 'dist/popup.html');
cpSync('LICENSE', 'dist/LICENSE');
cpSync('NOTICE', 'dist/NOTICE');

const ICONS = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' };
const manifest = {
  manifest_version: 3,
  name: 'EBYS Yazım Denetimi',
  version: pkg.version,
  // Chrome Web Mağazası sınırı 132 karakter
  description: 'EBYS’de resmî yazıları Türkçe yazım, noktalama ve Resmî Yazışma Kuralları’na göre denetler. Yerel çalışır, metin gönderilmez.',
  author: { email: 'ahmet.altun60@gmail.com' },
  homepage_url: 'https://biyonik.github.io',
  icons: ICONS,
  action: { default_title: 'EBYS Yazım Denetimi', default_icon: ICONS, default_popup: 'popup.html' },
  // Kaynak PDF'i yeni sekmede açmak için (chrome.tabs.create izin gerektirmez)
  background: { service_worker: 'background.js' },
  // world: "MAIN" Chrome 111 ile geldi; Highlight API 105
  minimum_chrome_version: '111',
  permissions: [],
  content_scripts: [
    { matches, js: ['bridge.js'], all_frames: true, run_at: 'document_start', world: 'MAIN' },
    { matches, js: ['content.js'], all_frames: true, run_at: 'document_idle' },
  ],
};
if (manifest.description.length > 132) throw new Error(`manifest açıklaması 132 karakteri aşıyor (${manifest.description.length})`);
writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));

// Apache-2.0: türetilmiş sözlük verisiyle birlikte lisans metni ve atıf dağıtılır
writeFileSync(
  'dist/THIRD_PARTY_LICENSES.txt',
  'Bu eklentinin Türkçe kök sözlüğü Zemberek-NLP sözlük dosyalarından türetilmiştir.\n' +
    'https://github.com/ahmetaa/zemberek-nlp — Copyright 2018 Ahmet A. Akın, Mehmet D. Akın\n\n' +
    readFileSync('vendor/zemberek/LICENSE', 'utf8'),
);
console.log(`dist/ hazır (${dev ? 'dev' : 'prod'}) — adresler: ${matches.join(', ')}`);
