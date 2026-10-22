# Sürüm notları

## v0.6.1 — 22.10.2026

- Arz / rica: Gereği/Bilgi seçim satırları EBYS'nin gerçek yapısıyla okunuyor (başlık + DETSİS hiyerarşi yolu).
  Düzey artık yoldan çıkarılıyor: “…,Balıkesir Valiliği,Karesi Kaymakamlığı,Karesi İlçe Milli Eğitim
  Müdürlüğü,Karesi Anaokulu Müdürlüğü” → alt makam. Düzeltildi: v0.6.0 satırın düz metnini okuduğu için
  yoldaki “Valiliği” bir okulu üst makam sayabiliyordu.
- Uyarıda muhatabın yalın adı gösteriliyor (“Balıkesir İl Milli Eğitim Müdürlüğü”).
- Deneme sayfası gerçek satır yapısıyla, kurgusal kurum adlarıyla güncellendi.

## v0.6.0 — 22.10.2026

- **Arz / rica denetimi, seçilen muhataba göre.** Eklenti evrakın başlığındaki gönderen idareyi
  (“KARESİ KAYMAKAMLIĞI / İlçe Millî Eğitim Müdürlüğü”) ve Gereği/Bilgi alanlarında seçilen muhatapları
  okur. Üst ya da aynı düzeydeki bir makama (Valilik, Bakanlık, başka bir Kaymakamlık) “… rica ederim”
  yazılmışsa **hata** verir ve Kılavuz §13.1 kalıbını önerir (“Gereğini bilgilerinize arz ederim”). Karma
  dağıtımda “arz ve rica ederim”, yalnız alt makamlara (okullar) “rica ederim” beklenir. Seçim değişince
  editöre dokunmadan karar güncellenir. Başlık ve muhatap editöre elle yazılmışsa metinden okunur.
  Dayanak: Yönetmelik m.16(12), Kılavuz §13.1.
- **Millî.** Kurum adında düzeltme işaretsiz yazım (“Milli Eğitim”, “MİLLİ EĞİTİM”, “Hakimler ve Savcılar
  Kurulu”) öneri olarak bildirilir; resmî ad “Millî Eğitim”dir. “Tümünü düzelt” uygular.
- Gizlilik metni güncellendi: Konu alanı, gönderen idare ve muhatap adları da yalnızca tarayıcıda işlenir.

## v0.5.1 — 22.10.2026

- **Kurum adlarında yazım denetimi** (`yazim.kurum`). Genel sözlük kuralı büyük harfle başlayan kelimeyi özel ad
  sayıp atladığı için kurum adlarındaki yanlışlar görünmüyordu. Artık:
  - sözlük dışı kelime kurum adı içindeyse **hata**: `Müdürlügüne → Müdürlüğüne`, `MİLLİ EĞTİM → EĞİTİM`,
    `Bakanlğımıza → Bakanlığımıza` (yalnızca Türkçe karakter farkı olanlar "Tümünü düzelt"e girer);
  - sözlükte bulunan ama kurum adında yanlış olan kelime **uyarı**: `Milli Eğitim Banlığı → Bakanlığı`
    (ban + -lık), `İlçe Mili Eğitim → Milli / Millî`, `Altıeylül Kaymaklığına → Kaymakamlığına`; küçük harfle
    yazılmış `banlığımızda` da yakalanır.
- Kurum adı sözlüğü: bakanlıklar, Cumhurbaşkanlığına bağlı kurumlar, MEB merkez ve taşra birimleri, okul türleri,
  unvanlar (`src/core/lexicon/kurumlar.ts`). “Milli” ve “Millî” ikisi de doğru kabul edilir; öneride belgenin
  kendi kullandığı yazım öne alınır.
- Ayrıntı ve ölçümler: `docs/MIMARI.md` § 5d.

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
