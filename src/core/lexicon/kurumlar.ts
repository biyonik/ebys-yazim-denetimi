/**
 * Kurum adı sözlüğü — kurum adlarındaki yazım hatalarını yakalamak için (rules/kurum-adi.ts).
 *
 * Bu liste bir "resmî ad kaydı" değildir; amacı kurum adlarında geçen KELİMELERİ ve hangi
 * kelimelerin YAN YANA geldiğini öğretmektir:
 *   - kelime dağarcığı: "Bakanlğı" → "Bakanlığı", "Egitim" → "Eğitim" (sözlükte olmayan kelime)
 *   - ikili komşuluk:   "Mili Eğitim" → "Millî Eğitim" ("mili" sözlükte var; yanındaki "Eğitim"
 *                        ile birlikte kurulan ad bilindiği için şüphelidir)
 *   - kurum başı:       "Banlığı" → "Bakanlığı" (ban + -lık; sözlükte var, kurum başına çok yakın)
 *
 * Bu yüzden bir adın güncelliği (birim kapandı, adı değişti) yanlış alarm üretmez: eşleşme her zaman
 * bilinen bir kelimeye ÇOK yakın, ama ondan FARKLI bir yazım gerektirir. Eksik bir ad yalnızca o adın
 * yazım hatalarının yakalanmamasına yol açar.
 *
 * Yazım: Kılavuz'un başlık ve muhatap örneklerinde "Millî" ve "Milli" birlikte geçer;
 * eşleşme düzeltme işaretini (â, î, û) yok sayar, ikisi de doğru kabul edilir.
 *
 * Unvanlar ("Daire Başkanı", "Genel Müdür Yardımcısı") da listededir: imza bloğunda ve muhatapta
kurum adıyla aynı öbekte geçerler.

Ekleme kuralı: adı bir satıra, yalın hâliyle ("… Müdürlüğü", "… Başkanlığı") yazın. Virgül ve
 * "ve" serbesttir. Birim testleri bu listedeki her adın temiz geçtiğini doğrular.
 */
export const KURUM_ADLARI = `
Türkiye Cumhuriyeti
Cumhurbaşkanlığı
Başbakanlığı
Cumhurbaşkanlığı İdari İşler Başkanlığı
Cumhurbaşkanlığı Genel Sekreterliği
Cumhurbaşkanı Yardımcılığı
Türkiye Büyük Millet Meclisi Başkanlığı
Adalet Bakanlığı
Aile ve Sosyal Hizmetler Bakanlığı
Çalışma ve Sosyal Güvenlik Bakanlığı
Çevre, Şehircilik ve İklim Değişikliği Bakanlığı
Dışişleri Bakanlığı
Enerji ve Tabii Kaynaklar Bakanlığı
Gençlik ve Spor Bakanlığı
Hazine ve Maliye Bakanlığı
İçişleri Bakanlığı
Kültür ve Turizm Bakanlığı
Millî Eğitim Bakanlığı
Millî Savunma Bakanlığı
Sağlık Bakanlığı
Sanayi ve Teknoloji Bakanlığı
Tarım ve Orman Bakanlığı
Ticaret Bakanlığı
Ulaştırma ve Altyapı Bakanlığı
Strateji ve Bütçe Başkanlığı
Diyanet İşleri Başkanlığı
Devlet Denetleme Kurulu Başkanlığı
Millî İstihbarat Teşkilatı Başkanlığı
Millî Güvenlik Kurulu Genel Sekreterliği
Millî Saraylar İdaresi Başkanlığı
İletişim Başkanlığı
Dijital Dönüşüm Ofisi Başkanlığı
Siber Güvenlik Başkanlığı
Savunma Sanayii Başkanlığı
Yatırım Ofisi Başkanlığı
Finans Ofisi Başkanlığı
İnsan Kaynakları Ofisi Başkanlığı
Yükseköğretim Kurulu Başkanlığı
Ölçme, Seçme ve Yerleştirme Merkezi Başkanlığı
Sayıştay Başkanlığı
Danıştay Başkanlığı
Yargıtay Başkanlığı
Anayasa Mahkemesi Başkanlığı
Hâkimler ve Savcılar Kurulu
Yüksek Seçim Kurulu Başkanlığı
Kamu Denetçiliği Kurumu
Kamu İhale Kurumu
Kişisel Verileri Koruma Kurumu
Kamu Görevlileri Etik Kurulu
Basın İlan Kurumu
Türkiye Radyo ve Televizyon Kurumu
Türkiye İstatistik Kurumu
Türkiye İş Kurumu Genel Müdürlüğü
Sosyal Güvenlik Kurumu Başkanlığı
Gelir İdaresi Başkanlığı
Göç İdaresi Başkanlığı
Afet ve Acil Durum Yönetimi Başkanlığı
Emniyet Genel Müdürlüğü
Jandarma Genel Komutanlığı
Sahil Güvenlik Komutanlığı
Genelkurmay Başkanlığı
Kara Kuvvetleri Komutanlığı
Nüfus ve Vatandaşlık İşleri Genel Müdürlüğü
Tapu ve Kadastro Genel Müdürlüğü
Vakıflar Genel Müdürlüğü
Meteoroloji Genel Müdürlüğü
Karayolları Genel Müdürlüğü
Devlet Su İşleri Genel Müdürlüğü
Devlet Malzeme Ofisi Genel Müdürlüğü
Orman Genel Müdürlüğü
Kredi ve Yurtlar Genel Müdürlüğü
Gençlik Hizmetleri Genel Müdürlüğü
Spor Hizmetleri Genel Müdürlüğü
Sağlık Hizmetleri Genel Müdürlüğü
Halk Sağlığı Genel Müdürlüğü
Türkiye Bilimsel ve Teknolojik Araştırma Kurumu
Atatürk Kültür, Dil ve Tarih Yüksek Kurumu
Türk Dil Kurumu
Türk Tarih Kurumu
Atatürk Araştırma Merkezi
Yunus Emre Enstitüsü
Türkiye Maarif Vakfı
Türk Kızılay
Talim ve Terbiye Kurulu Başkanlığı
Teftiş Kurulu Başkanlığı
Rehberlik ve Denetim Başkanlığı
Maarif Müfettişleri Başkanlığı
Strateji Geliştirme Başkanlığı
Hukuk Hizmetleri Genel Müdürlüğü
Hukuk Müşavirliği
Basın ve Halkla İlişkiler Müşavirliği
Bakanlık Müşavirliği
İç Denetim Birimi Başkanlığı
Özel Kalem Müdürlüğü
Temel Eğitim Genel Müdürlüğü
Ortaöğretim Genel Müdürlüğü
Mesleki ve Teknik Eğitim Genel Müdürlüğü
Din Öğretimi Genel Müdürlüğü
Özel Eğitim ve Rehberlik Hizmetleri Genel Müdürlüğü
Hayat Boyu Öğrenme Genel Müdürlüğü
Özel Öğretim Kurumları Genel Müdürlüğü
Öğretmen Yetiştirme ve Geliştirme Genel Müdürlüğü
Yükseköğretim ve Yurt Dışı Eğitim Genel Müdürlüğü
Avrupa Birliği ve Dış İlişkiler Genel Müdürlüğü
Ölçme, Değerlendirme ve Sınav Hizmetleri Genel Müdürlüğü
Yenilik ve Eğitim Teknolojileri Genel Müdürlüğü
Erken Çocukluk Eğitimi Genel Müdürlüğü
Personel Genel Müdürlüğü
Destek Hizmetleri Genel Müdürlüğü
İnşaat ve Emlak Genel Müdürlüğü
İnşaat ve Emlak Dairesi Başkanlığı
Bilgi İşlem Genel Müdürlüğü
Bilgi İşlem Dairesi Başkanlığı
İdari ve Mali İşler Dairesi Başkanlığı
Personel Daire Başkanlığı
Sağlık, Kültür ve Spor Dairesi Başkanlığı
Öğrenci İşleri Dairesi Başkanlığı
Kütüphane ve Dokümantasyon Dairesi Başkanlığı
Yapı İşleri ve Teknik Daire Başkanlığı
Genel Müdür Yardımcılığı
Daire Başkanlığı
Şube Müdürlüğü
Grup Başkanlığı
Bölge Müdürlüğü
Proje Koordinatörlüğü
Ar-Ge Birimi
Valiliği
Kaymakamlığı
Belediye Başkanlığı
Büyükşehir Belediye Başkanlığı
İl Özel İdaresi
İl Genel Meclisi
Yatırım İzleme ve Koordinasyon Başkanlığı
Muhtarlığı
İl Millî Eğitim Müdürlüğü
İlçe Millî Eğitim Müdürlüğü
İl Sağlık Müdürlüğü
İlçe Sağlık Müdürlüğü
İl Emniyet Müdürlüğü
İlçe Emniyet Müdürlüğü
İl Jandarma Komutanlığı
İlçe Jandarma Komutanlığı
İl Müftülüğü
İlçe Müftülüğü
İl Defterdarlığı
Defterdarlık
Vergi Dairesi Başkanlığı
Vergi Dairesi Müdürlüğü
Mal Müdürlüğü
Muhasebe Müdürlüğü
Nüfus Müdürlüğü
Tapu Müdürlüğü
Kadastro Müdürlüğü
Gençlik ve Spor İl Müdürlüğü
Gençlik ve Spor İlçe Müdürlüğü
Aile ve Sosyal Hizmetler İl Müdürlüğü
Çalışma ve İş Kurumu İl Müdürlüğü
Sosyal Güvenlik İl Müdürlüğü
Tarım ve Orman İl Müdürlüğü
İl Kültür ve Turizm Müdürlüğü
Çevre, Şehircilik ve İklim Değişikliği İl Müdürlüğü
İl Afet ve Acil Durum Müdürlüğü
İl Göç İdaresi Müdürlüğü
Ticaret İl Müdürlüğü
Sanayi ve Teknoloji İl Müdürlüğü
Halk Kütüphanesi
İl Halk Kütüphanesi
Cumhuriyet Başsavcılığı
Asliye Hukuk Mahkemesi
Asliye Ceza Mahkemesi
İdare Mahkemesi
Vergi Mahkemesi
İş Mahkemesi
Bölge İdare Mahkemesi
Noterliği
Rehberlik ve Araştırma Merkezi
Halk Eğitimi Merkezi
Mesleki Eğitim Merkezi
Bilim ve Sanat Merkezi
Ölçme ve Değerlendirme Merkezi
Öğretmenevi ve Akşam Sanat Okulu
Hizmetiçi Eğitim Enstitüsü
Olgunlaşma Enstitüsü
Açık Öğretim Lisesi
Açık Öğretim Ortaokulu
Mesleki Açık Öğretim Lisesi
Anadolu Lisesi
Fen Lisesi
Sosyal Bilimler Lisesi
Güzel Sanatlar Lisesi
Spor Lisesi
Anadolu İmam Hatip Lisesi
İmam Hatip Ortaokulu
Mesleki ve Teknik Anadolu Lisesi
Çok Programlı Anadolu Lisesi
Özel Eğitim Uygulama Okulu
Özel Eğitim Meslek Okulu
Yatılı Bölge Ortaokulu
Ortaokulu
İlkokulu
Anaokulu
Uygulama Anaokulu
Okul Aile Birliği
Okul Müdürlüğü
Okulu Müdürlüğü
Lisesi Müdürlüğü
Ortaokulu Müdürlüğü
İlkokulu Müdürlüğü
Anaokulu Müdürlüğü
Merkezi Müdürlüğü
Üniversitesi Rektörlüğü
Fakültesi Dekanlığı
Eğitim Fakültesi Dekanlığı
Meslek Yüksekokulu Müdürlüğü
Enstitüsü Müdürlüğü
Hastanesi Başhekimliği
Devlet Hastanesi
Eğitim ve Araştırma Hastanesi
Toplum Sağlığı Merkezi
Aile Sağlığı Merkezi
Büyükelçiliği
Başkonsolosluğu
Konsolosluğu
Eğitim Müşavirliği
Eğitim Ataşeliği
Temsilciliği
Direktörlüğü
Saymanlığı
Şefliği
Amirliği
Müsteşarlığı
Koordinatörlüğü
Rektörlüğü
Dekanlığı
Cumhurbaşkanı Yardımcısı
Bakan Yardımcısı
Vali Yardımcısı
Kaymakam Vekili
Genel Müdürü
Genel Müdür Yardımcısı
Daire Başkanı
Daire Başkan Yardımcısı
Şube Müdürü
İl Millî Eğitim Müdürü
İlçe Millî Eğitim Müdürü
Okul Müdürü
Müdür Yardımcısı
Rektör Yardımcısı
Dekan Yardımcısı
Başkan Yardımcısı
Maarif Müfettişi
Hukuk Müşaviri
Strateji Geliştirme Başkanı
İdari İşler Başkanı
`;

/**
 * Kurum adının BAŞI (son kelimesi) olabilen kelimeler. Bir büyük harfli öbekte bunlardan biri varsa
 * öbek kurum adı sayılır ve içindeki sözlük dışı kelimeler kurum sözlüğüne göre denetlenir.
 * "-lığı/-liği" ile bitenlerin kökü (bakan, müdür, vali…) ayrıca "ban + -lık" türü gerçek kelime
 * hatalarını yakalamak için kullanılır.
 */
export const KURUM_BASLARI = `
bakanlığı başkanlığı cumhurbaşkanlığı müdürlüğü valiliği kaymakamlığı rektörlüğü dekanlığı
müsteşarlığı sekreterliği koordinatörlüğü komutanlığı savcılığı başsavcılığı müftülüğü noterliği
şefliği amirliği müşavirliği başhekimliği temsilciliği büyükelçiliği başkonsolosluğu konsolosluğu
defterdarlığı saymanlığı direktörlüğü muhtarlığı yardımcılığı ataşeliği müfettişliği
kurulu kurumu üniversitesi fakültesi enstitüsü yüksekokulu okulu ortaokulu ilkokulu anaokulu lisesi
merkezi dairesi idaresi teşkilatı ajansı odası birliği vakfı derneği belediyesi hastanesi mahkemesi
kütüphanesi müzesi ofisi federasyonu konseyi komisyonu meclisi
`;
