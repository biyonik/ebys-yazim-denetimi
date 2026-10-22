# Sürüm notları

## v0.5.0 — 22.10.2026

- **Konu alanı denetimi.** Evrak Oluştur → Bilgileri sekmesindeki Konu kutusu
  (`textarea.metadataKonuTextArea`) yazılırken denetlenir: kelimelerin baş harfi büyük (m.13(1)),
  sonda nokta yok, `hk. → Hakkında`, yazım hataları. Düz metin kutusunun içine çizgi çizilemediği için
  sorunlar alanın sağındaki sayaçta ve tıklayınca açılan listede gösterilir. Düzeltme sonrası `input` ve
  `change` olayları tetiklenir; EBYS (PrimeFaces) değeri kendi modeline alır.
- Kısaltmanın açık hâlini isteyen kural (m.16(11)) Konu’da uygulanmaz: açık hâl metinde verilir.
- Düzeltildi: `hk.` önerisi bir sonraki denetimde bayat sayılıyordu (işaretli metin ile aralık uyuşmuyordu).
- Düzeltildi: konu satırında `e-Yazışma` gibi `e-` önekli adlar büyük harf uyarısı almıyor.
- Deneme sayfası ve mağaza görselleri MEB EBYS düzenine uyarlandı: Sayı/Konu editör metninden çıkarıldı,
  Konu ayrı alan olarak eklendi.

## v0.4.2 — 22.10.2026

- Yanlış alarm giderildi: metinde “tekit” geçtiğinde “ilgi tutulmalı” uyarısı verilmiyor. MEB EBYS’de
  İlgi, Sayı ve Konu editörde değil ayrı form alanlarındadır; editör metninde “İlgi:” satırının olmaması
  bir eksiklik göstermez.

## v0.4.1 — 18.10.2026

- **Deneme sayfası:** https://biyonik.github.io/ebys-yazim-denetimi/demo/ — EBYS’ye girmeden denemek ve mağaza
  incelemesi için. Eklenti bu adreste de çalışır (`ebys.config.json` → `demoOrigins`).
- Gizlilik politikası sayfası ve proje sayfası (GitHub Pages, `docs/`)
- Araç çubuğu penceresine deneme sayfası bağlantısı
- Chrome Web Mağazası görselleri ve yayın bilgileri (`docs/MAGAZA.md`)

## v0.4.0 — 18.10.2026

İlk herkese açık sürüm. Hazır paket MEB EBYS (`https://ebys.meb.gov.tr`) için derlenmiştir.

**Denetimler**
- Biçimbilimsel yazım denetimi: ~35 bin kök, Türkçe ek dizimi ve ses olayları; öneri üretimi
- TDK yazım kuralları: de/da–ki–mi, kesme işareti, birleşik fiiller, büyük harf, noktalama
- Resmî Yazışma Yönetmeliği: Konu, Sayı, İlgi, Ek, tutar, tarih, kısaltma, kapanış, süreli yazı, imza,
  paragraflar arasında boş satır
- Resmî Yazışma Kuralları Kılavuzu (Ocak 2023): muhatap, “tarihli ve … sayılı”, virgül, kısaltma ekleri,
  sayılar, büyük harf, düzeltme işareti, anlatım bozuklukları, kişisel anlatım, tekit; “sık yanlış
  kullanılan kelimeler” tablosunun tamamı

**Arayüz**
- Öneri balonu, sorun paneli, **Tümünü düzelt** (tek Ctrl+Z ile geri alınır)
- Tıklanabilir dayanak: “Kılavuz §13.6.3”, “Yönetmelik m.16(4)” ilgili PDF sayfasını açar
- Araç çubuğu penceresi: işaretlerin anlamı, dayanak belgeler, geliştirici bilgisi

**Gizlilik**
- İzin yok, ağ erişimi yok (derlemede makine tarafından doğrulanır); metin hiçbir yere gönderilmez
