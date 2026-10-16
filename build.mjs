// Build: node build.mjs [--dev]
//  --dev  → localhost adreslerini de ekler (test harness için)
import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const dev = process.argv.includes('--dev');
const cfg = JSON.parse(readFileSync('ebys.config.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const matches = [...cfg.origins, ...(dev ? cfg.devOrigins : [])];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

await build({
  entryPoints: { content: 'src/content/main.ts', bridge: 'src/bridge/main-world.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome111',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'warning',
});

// Ağ erişimi yasağı: paketlenmiş kodda hiçbir ağ API'si bulunmamalı.
// Bu, "metin dışarı çıkmaz" iddiasının makine tarafından doğrulanan hâlidir.
const FORBIDDEN = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection|importScripts)\b/;
for (const f of ['content.js', 'bridge.js']) {
  const src = readFileSync(`dist/${f}`, 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
  const m = FORBIDDEN.exec(src);
  if (m) {
    console.error(`HATA: dist/${f} içinde yasaklı ağ API'si bulundu: ${m[0]}`);
    process.exit(1);
  }
}

const manifest = {
  manifest_version: 3,
  name: 'EBYS Yazım Denetimi',
  version: pkg.version,
  description: 'EBYS evrak editöründe Türkçe yazım ve noktalama denetimi. Tamamen yerel çalışır; metin hiçbir yere gönderilmez.',
  // world: "MAIN" Chrome 111 ile geldi; Highlight API 105
  minimum_chrome_version: '111',
  permissions: [],
  content_scripts: [
    { matches, js: ['bridge.js'], all_frames: true, run_at: 'document_start', world: 'MAIN' },
    { matches, js: ['content.js'], all_frames: true, run_at: 'document_idle' },
  ],
};
writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
console.log(`dist/ hazır (${dev ? 'dev' : 'prod'}) — adresler: ${matches.join(', ')}`);
