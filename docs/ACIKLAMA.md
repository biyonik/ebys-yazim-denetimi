# EBYS Yazım Denetimi — Tanıtım metni

## Kısa açıklama (manifest, en fazla 132 karakter)

EBYS’de resmî yazıları Türkçe yazım, noktalama ve Resmî Yazışma Kuralları’na göre denetler. Yerel çalışır, metin gönderilmez.

## Uzun açıklama

**EBYS Yazım Denetimi**, resmî yazıları EBYS evrak editöründe yazarken Türkçe yazım, noktalama ve
resmî yazışma kurallarını denetleyen bir Chrome eklentisidir. Yazdıkça hatalı kelimelerin altını çizer,
tıklayınca doğrusunu önerir ve her uyarının dayanağını gösterir.

### Neyi denetler?

- **Yazım:** Türkçenin ek yapısını tanıyan bir sözlükle (yaklaşık 35 bin kök) yanlış yazılan kelimeleri
  bulur ve öneri sunar: *yapilacak → yapılacak*, *orjinal → orijinal*.
- **Dil bilgisi:** ayrı yazılan “de/da”, “ki” ve “mi” (*banada → bana da*), özel adlara ve sayılara gelen
  ekler (*Ahmetin → Ahmet’in*, *3de → 3’te*), birleşik fiiller (*arzederim → arz ederim*).
- **Resmî Yazışma Yönetmeliği:** Konu, Sayı, İlgi ve Ek bölümlerinin biçimi; tutarların yazımı, kısaltma,
  kapanış ifadesi, süreli yazı ibaresi, imza ve paragraflar arasındaki boş satır.
- **Resmî Yazışma Kuralları Kılavuzu:** kesme işareti, virgül, kısaltmalara gelen ekler, sayılar, büyük
  harf, düzeltme işareti, anlatım bozuklukları, kişisel anlatım, muhatap yazımı ve Kılavuz’un
  “sık yanlış kullanılan kelimeler” tablosunun tamamı.

### Nasıl çalışır?

- Kırmızı çizgi **hata**, turuncu **kontrol edin** (bağlama bağlı), mavi noktalı **öneri** anlamına gelir.
- Uyarı balonundaki “Kılavuz §13.6.3” ya da “Yönetmelik m.16(4)” gibi atıflara tıklayınca ilgili belge,
  eklentinin içinde taşıdığı PDF’ten doğru sayfasında açılır.
- **Tümünü düzelt** yalnızca tek doğru cevabı olan sorunları düzeltir; anlamı değiştirebilecek olanları
  size bırakır. Toplu düzeltme tek Ctrl+Z ile geri alınır.
- Belgenin biçimine (kalın, italik, tablo) dokunmaz; kaydedilen evraka hiçbir iz bırakmaz.

### Gizlilik

Eklenti tamamen bilgisayarınızda çalışır. Hiçbir izin istemez, ağa bağlanmaz; yazdığınız metin hiçbir
yere gönderilmez ve saklanmaz. Bu, derleme sırasında makine tarafından da denetlenir: paketlenmiş
kodda ağ erişimi sağlayan hiçbir tarayıcı işlevi bulunmaz.

### Sınırlar

Kural tabanlı bir denetleyicidir; cümlenin anlamını yorumlamaz. Bağlama bağlı durumlarda (“bende” mi,
“ben de” mi?) karar vermez, sizi uyarır. Son söz her zaman yazanındır.

### Kaynaklar

- Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hakkında Yönetmelik (RG 10.06.2020/31151)
- Resmî Yazışma Kuralları Kılavuzu (Ocak 2023 baskısı)
- Türk Dil Kurumu Yazım Kılavuzu ve Güncel Türkçe Sözlük
- Kök sözlüğü: Zemberek-NLP (Apache-2.0)

**Geliştirici:** Ahmet ALTUN · ahmet.altun60@gmail.com · https://biyonik.github.io
