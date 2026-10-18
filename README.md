# EBYS Yazım Denetimi

EBYS evrak editöründe (CKEditor 4) Türkçe yazım, noktalama ve kural denetimi yapan
Chrome eklentisi. **Tamamen yerel çalışır**: hiçbir izin istemez, ağ erişimi yoktur,
metin hiçbir yere gönderilmez.

- **Morfolojik yazım denetimi:** ~35 bin kök + Türkçe ek dizimi ve ses olayları; öneriler (`yapilacak` → `yapılacak`)
- **TDK yazım kuralları:** kesme işareti, de/da–ki–mi, bitişik/ayrı yazım, büyük harf, noktalama
- **Resmî Yazışma Yönetmeliği** (RG 10.06.2020/31151): Konu, Sayı, İlgi, Ek, tarih, tutar, kısaltma,
  kapanış, süreli yazı, imza, paragraflar arası boş satır — her işaret madde atfıyla
- **Resmî Yazışma Kuralları Kılavuzu** (Ocak 2023 baskısı): de/da ve kesme, virgül, kısaltma ekleri,
  sayılar, büyük harf, anlatım bozuklukları, şahsileştirilmiş anlatım, muhatap, tekit — § atfıyla;
  s.54 "sık yanlış kullanılan kelimeler" tablosunun tamamı

Mimari kararlar ve yol haritası: [docs/MIMARI.md](docs/MIMARI.md)

## Kurulum (geliştirme)

```bash
npm install
# 1) ebys.config.json → "origins" içine kendi EBYS adresini yaz
npm run build          # üretim: yalnızca EBYS adresi
npm run build:dev      # + localhost (test ortamı için)
```

Chrome → `chrome://extensions` → **Geliştirici modu** → **Paketlenmemiş öğe yükle** → `dist/` klasörü.

## Sözlük

Kök sözlüğü [Zemberek-NLP](https://github.com/ahmetaa/zemberek-nlp) sözlüklerinden derlenir
(Apache-2.0; bkz. `vendor/zemberek/`). Derlenmiş veri depoda hazırdır; sözlüğe ekleme yaptıysan
(`scripts/lexicon-supplement.txt`) yeniden üret:

```bash
node scripts/build-lexicon.mjs
```

Derlenen eklenti `THIRD_PARTY_LICENSES.txt` ile birlikte dağıtılır.

## Testler

```bash
npm test               # çekirdek kurallar, çözümleyici, yönetmelik, Kılavuz (node:test)
npm run typecheck
npm run test:e2e       # eklenti yüklü Chromium + gerçek CKEditor 4 (Playwright, Python)
```

E2E testi, gerçek EBYS sayfasındaki yapının birebir kopyası olan
`test/harness/index.html` üzerinde çalışır ve şunları doğrular: işaretleme, kaydedilen
içeriğin temizliği, düzeltme, geri al/yinele, biçim koruma, `setData`/kaynak modu
sonrası yeniden bağlanma, toplu düzeltme, tarayıcıda 5 sayfalık belgede süre ölçümü ve dış ağ
isteği olmaması. Geliştirme derlemesinde her denetimin süresi DevTools konsoluna yazılır.

## Kullanım

- Altı dalgalı kırmızı: **hata** · turuncu: **kontrol edin** (bağlama bağlı) · mavi noktalı: **öneri**
- İşaretli kelimeye tıkla → öneriyi seç ya da **Yoksay**. Balonun sağ altında kuralın dayanağı
  (TDK ya da Yönetmelik maddesi) yazar.
- Editörün sağ altındaki rozete tıkla → **sorun paneli**: tüm sorunların listesi ve **Tümünü düzelt**.
- **Tümünü düzelt** yalnızca tek doğru cevabı olan sorunlara dokunur (kırmızı hatalar, mavi biçim
  önerileri). Turuncu uyarılar ("hala/hâlâ", "bende/ben de") anlamı değiştirebileceği için hiçbir zaman
  otomatik uygulanmaz.
- Her düzeltme — toplu düzeltme dahil — CKEditor'ün geri al (Ctrl+Z) geçmişine **tek adım** olarak girer.

## Klasör yapısı

```
src/core/       DOM bilmeyen denetim çekirdeği (tokenizer, kurallar, motor)
src/core/morph/ biçimbilimsel çözümleyici ve öneri üretimi
src/core/rules/yonetmelik.ts   Resmî Yazışma Yönetmeliği kuralları
src/core/rules/kilavuz.ts      Resmî Yazışma Kuralları Kılavuzu (metin içi kurallar)
scripts/        sözlük derleyici
vendor/zemberek Zemberek sözlükleri (Apache-2.0)
src/content/    içerik betiği: keşif, metin indeksi, işaretleme, arayüz
src/bridge/     MAIN world köprüsü (CKEditor API'si)
src/shared/     köprü protokolü
test/unit/      çekirdek birim testleri
test/harness/   EBYS editör yapısının kopyası
test/e2e/       Playwright uçtan uca testi
```
