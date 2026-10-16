/**
 * Özel ad sözlüğü (kişi adları, il adları, ülke ve bölge adları).
 *
 * Bu liste "tam" olamaz ve olması da hedeflenmiyor; amaç resmî yazışmada
 * en sık geçen özel adları yüksek kesinlikle yakalamak. Listede olmayan bir
 * ad için kural sessiz kalır (yanlış negatif), yanlış işaretleme yapmaz.
 * Faz 5'te kullanıcı/kurum sözlüğü bu listeyi genişletecek.
 *
 * İki ayrıntı kritik:
 *  1. Birleşik görünen adlar ayrıca listelenir: "Emine" (Emin+e), "Nurdan"
 *     (Nur+dan), "Gülden", "Ayten", "Handan", "Cansu". Listede olmazlarsa
 *     "Emin'e", "Nur'dan" diye yanlış düzeltilirler.
 *  2. Cins isimle aynı yazılan adlar AMBIGUOUS'tadır: "Deniz", "Umut",
 *     "Barış", "Ordu", "Tokat", "Uşak"… Cümle başında bunlar büyük harfle
 *     başladığı için ad mı kelime mi ayırt edilemez ("Denizde yüzdük.");
 *     orada hiç işaretlenmez, cümle içinde yalnızca uyarı verilir.
 */

const KISI = `
Ahmet Mehmet Mustafa Ali Hasan Hüseyin İbrahim İsmail Osman Yusuf Murat Ömer Ramazan
Halil Süleyman Abdullah Mahmut Recep Salih Fatih Kadir Emre Hakan Adem Kemal Yaşar
Bayram Metin Serkan Burak Cem Can Cemal Cengiz Coşkun Doğan Engin Ercan Erdem Erkan
Ersin Erol Eren Ferhat Fikret Gökhan Hamza Harun Hayri Hikmet İlhan İlker İsa Kaan
Kenan Levent Mert Mesut Musa Nihat Oğuz Oğuzhan Okan Onur Orhan Ozan Özgür Rıza Sadık
Sami Sedat Selim Selçuk Serdar Sinan Soner Şükrü Tarık Tayfun Tuncay Turgut Uğur
Umut Volkan Yakup Yasin Yavuz Yılmaz Yunus Zafer Zeki Barış Berk Batuhan Emir Enes
Furkan Kerem Arda Alper Alp Necati Nuri Nusret Bülent Bekir Cahit Celal Cevdet Davut
Ekrem Emin Ender Erhan Ertan Fahri Faruk Ferit Fuat Galip Hakkı Haluk Hamdi Hilmi
Hulusi Hüsnü İhsan İlyas İrfan Kamil Kâmil Kazım Lütfi Mazhar Muhammet Muhammed
Muammer Nazım Necdet Nevzat Nurettin Nurullah Recai Remzi Rüştü Sabri Sait Semih Sezai
Şahin Şaban Şevket Şenol Tahsin Taner Talat Tamer Tekin Tevfik Ümit Vedat Veli Yalçın
Yücel Yüksel Zekeriya Ziya Atilla Aydın Ayhan Aziz Bahadır Baran Bora Cüneyt Çağlar
Çetin Deniz Durmuş Evren Fevzi Gürkan Güray Kadri Kürşat Mevlüt Muzaffer Niyazi
Oktay Polat Rasim Sefa Serhat Sertaç Suat Tolga Tuğrul Turan Yiğit Ege Efe Alperen
Ayaz Göktuğ Çınar Poyraz Eymen Atakan Batu Berkay Kutay Utku Koray Taylan Tunahan
Muharrem Nail Nazmi Necip Nedim Rahmi Refik Rıfat Saffet Sabahattin Sırrı Şerif Ünal
Ünsal Vahit Erdoğan Abdurrahman Abdülkadir Cafer Cumali Dursun Ethem Hacı Hayati
Hüsamettin İdris İskender Kerim Kudret Lokman Mithat Muhittin Nadir Nebi Nejat Oğuzcan
Özcan Özkan Rauf Reşat Sabri Sefer Selahattin Seyfettin Şenay Tuncer Ufuk Yücel Zihni

Ayşe Fatma Emine Hatice Zeynep Elif Meryem Merve Esra Özlem Yasemin Sultan Hacer Leyla
Zehra Hülya Dilek Sibel Derya Gül Gülsüm Hanife Havva Melek Nur Nurcan Nurdan Nurten
Nermin Neslihan Nesrin Nilgün Pınar Rabia Seda Selin Serap Sevda Sevgi Sevim Songül
Şerife Tuba Tuğba Ümran Yeliz Yıldız Zübeyde Aylin Ayla Aynur Aysel Aysun Aysu Ayten
Aydan Ayşegül Ayşen Arzu Asiye Aslı Aslıhan Bahar Banu Belgin Berna Betül Birsen Burcu
Büşra Canan Cansu Ceren Cemile Damla Defne Demet Didem Duygu Ebru Ece Eda Elçin Elvan
Emel Esin Esma Feride Fadime Figen Filiz Funda Gamze Gizem Gonca Gökçe Gülay Gülden
Gülten Gülşen Gülizar Gülsen Hande Handan Hilal İlknur İpek Kader Kevser Kübra Lale
Meltem Melike Melis Mine Müge Müzeyyen Naciye Nazlı Necla Nilay Nihal Oya Özge Pelin
Perihan Reyhan Saadet Saliha Selma Semra Serpil Sevil Sezen Sinem Süheyla Şükran Şule
Tülay Ülkü Yeşim Zerrin Zuhal Nazan Nebahat Nuray Nurhan Nursel Rukiye Safiye Sakine
Şeyma Irmak Ela Azra Eylül Ecrin Miray Nehir Duru Beyza Hira İrem Dilara Sude Ceylin
Medine Aliye Hayriye Melahat Muazzez Mukaddes Nilüfer Sema Sevinç Zeliha Zekiye Gülsu
Ayfer Aysel Behiye Cevriye Dürdane Emsal Fikriye Gülcan Gülhan Gülnur Hamiyet Hayat
Meral Mualla Nagihan Nazife Nevin Nezahat Nilüfer Nuran Raziye Remziye Semiha Sevgül
Şengül Şermin Türkan Ülfet Yurdagül Zekiye Zühre
`;

const YER = `
Adana Adıyaman Afyonkarahisar Afyon Ağrı Amasya Ankara Antalya Artvin Aydın Balıkesir
Bilecik Bingöl Bitlis Bolu Burdur Bursa Çanakkale Çankırı Çorum Denizli Diyarbakır
Edirne Elazığ Erzincan Erzurum Eskişehir Gaziantep Antep Giresun Gümüşhane Hakkâri
Hakkari Hatay Isparta Mersin İstanbul İzmir Kars Kastamonu Kayseri Kırklareli Kırşehir
Kocaeli Konya Kütahya Malatya Manisa Kahramanmaraş Maraş Mardin Muğla Muş Nevşehir
Niğde Ordu Rize Sakarya Samsun Siirt Sinop Sivas Tekirdağ Tokat Trabzon Tunceli
Şanlıurfa Urfa Uşak Van Yozgat Zonguldak Aksaray Bayburt Karaman Kırıkkale Batman
Şırnak Bartın Ardahan Iğdır Yalova Karabük Kilis Osmaniye Düzce
İzmit Adapazarı Antakya İskenderun Tarsus Alanya Bodrum Fethiye Marmaris Bandırma
Edremit Ayvalık Kuşadası Çorlu Gebze Ereğli

Türkiye Almanya Fransa İngiltere Amerika Rusya İtalya İspanya Yunanistan Bulgaristan
Azerbaycan İran Irak Suriye Mısır Japonya Çin Hindistan Kanada Hollanda Belçika İsviçre
Avusturya Polonya Ukrayna Gürcistan Ermenistan Kazakistan Özbekistan Türkmenistan
Kırgızistan Pakistan Afganistan Katar Libya Tunus Cezayir Fas İsrail Filistin Lübnan
Ürdün Kıbrıs Romanya Macaristan Sırbistan Bosna Arnavutluk Makedonya Kosova Portekiz
İsveç Norveç Danimarka Finlandiya Brezilya Arjantin Meksika Avustralya Moldova
Avrupa Asya Afrika Anadolu Trakya Kafkasya Karadeniz Akdeniz Ege Marmara Fırat Dicle
Kızılırmak Atatürk Ankara
`;

/** Cins isim olarak da kullanılan özel adlar */
const AMBIGUOUS = `
Umut Barış Deniz Can Gül Nur Bahar Yıldız Irmak Kader Lale Nilüfer Sevgi Sevinç Pınar
Doğan Yılmaz Çınar Poyraz Ege Defne Damla Duygu Hilal İpek Melek Sultan Ümit Uğur
Zafer Emel Demet Oya Gonca Nehir Ülkü Sefa Ozan Bayram Ramazan Recep Şaban Aydın
Ordu Van Batman Tokat Ağrı Uşak Mersin Bilecik Hayat Kudret Sema Ufuk Duru Efe Alp
Hacı Mine Ela Arzu Emir Eren Berk Bora Turan Fırat Hakkı
`;

export interface ProperNoun {
  display: string;
  ambiguous: boolean;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const lower = (s: string) => s.toLocaleLowerCase('tr-TR');

const amb = new Set(words(AMBIGUOUS).map(lower));

export const PROPER_NOUNS: ReadonlyMap<string, ProperNoun> = new Map(
  [...words(KISI), ...words(YER)].map((w) => [lower(w), { display: w, ambiguous: amb.has(lower(w)) }]),
);

/**
 * Kurum, kuruluş, kurul adlarının son kelimeleri. TDK: bu adlara gelen
 * ekler kesmeyle AYRILMAZ (Türk Dil Kurumuna, Balıkesir Valiliğine).
 * "Cumhurbaşkanlığı" gibi birleşikleri yakalamak için sona-eşleme yapılır.
 */
export const INSTITUTION_HEADS: readonly string[] = words(`
valiliği kaymakamlığı bakanlığı müdürlüğü başkanlığı belediyesi üniversitesi rektörlüğü
dekanlığı fakültesi enstitüsü yüksekokulu hastanesi okulu lisesi kurumu kurulu komisyonu
meclisi dairesi merkezi odası birliği derneği vakfı bankası şirketi sendikası
müsteşarlığı sekreterliği koordinatörlüğü şefliği amirliği komutanlığı savcılığı
başsavcılığı mahkemesi noterliği ajansı teşkilatı idaresi müftülüğü kütüphanesi
müzesi
`).map(lower);
