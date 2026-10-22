import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../../src/core/engine.ts';
import { fixAllText } from '../../src/core/fix-all.ts';
import { kurumAdi } from '../../src/core/rules/kurum-adi.ts';
import { KURUM_ADLARI } from '../../src/core/lexicon/kurumlar.ts';
import { baseHarmony } from '../../src/core/turkish.ts';

const only = (t: string) => check(t, { rules: [kurumAdi] });
const hits = (t: string) => only(t).map((i) => [i.text, i.suggestions[0], i.severity]);

test('kurum adı: sözlük dışı kelime (büyük harf kalkanının arkasında kalanlar) — hata', () => {
  assert.deepEqual(hits('Yazı İlçe Millî Eğitim Müdürlügüne gönderilmiştir.'), [['Müdürlügüne', 'Müdürlüğüne', 'hata']]);
  assert.deepEqual(hits('Yazı Bakanlğımıza gönderilmiştir.'), [['Bakanlğımıza', 'Bakanlığımıza', 'hata']]);
  assert.deepEqual(hits('Temel Egitim Genel Müdürlüğü ile görüşülmüştür.'), [['Egitim', 'Eğitim', 'hata']]);
  assert.deepEqual(hits('Hayat Boyu Ögrenme Genel Müdürlüğüne'), [['Ögrenme', 'Öğrenme', 'hata']]);
  assert.deepEqual(hits('İl Sağlık Müdrlüğü toplantısı'), [['Müdrlüğü', 'Müdürlüğü', 'hata']]);
  assert.deepEqual(hits('Rehberlik ve Araştrma Merkezi'), [['Araştrma', 'Araştırma', 'hata']]);
  assert.deepEqual(hits('Karesi Kaymakamlıgı yazısı'), [['Kaymakamlıgı', 'Kaymakamlığı', 'hata']]);
  // eki ne olursa olsun: kök düzeltilir, ek korunur
  assert.deepEqual(hits('Balıkesir Valiliğne'), [['Valiliğne', 'Valiliğine', 'hata']]);
});

test('kurum adı: tamamı büyük harfli başlık ve ASCII yazım', () => {
  assert.deepEqual(hits('T.C. MİLLİ EĞTİM BAKANLIĞI'), [['EĞTİM', 'EĞİTİM', 'hata']]);
  assert.deepEqual(hits('MILLI EGITIM BAKANLIGI').map((h) => h[1]), ['MİLLİ', 'EĞİTİM', 'BAKANLIĞI']);
});

test('kurum adı: sözlükte VAR ama kurum adında yanlış (gerçek kelime hatası) — uyarı', () => {
  assert.deepEqual(hits('Milli Eğitim Banlığı ile yapılan yazışmalar'), [['Banlığı', 'Bakanlığı', 'uyari']]);
  assert.deepEqual(hits('Toplantı Milli Eğitim Banlığında yapılacaktır.'), [['Banlığında', 'Bakanlığında', 'uyari']]);
  assert.deepEqual(hits('Toplantı banlığımızda yapılacaktır.'), [['banlığımızda', 'bakanlığımızda', 'uyari']]);
  assert.deepEqual(hits('Altıeylül Kaymaklığına bilgi verilmiştir.'), [['Kaymaklığına', 'Kaymakamlığına', 'uyari']]);
  assert.deepEqual(hits('Talim ve Terbiye Kurlu Başkanlığı'), [['Kurlu', 'Kurulu', 'uyari']]);
  // "Mili" (mil + -i): ikili "Millî Eğitim" bilindiği için; iki yazım da önerilir
  const [mili] = only('İlçe Mili Eğitim Müdürlüğüne');
  assert.equal(mili?.text, 'Mili');
  assert.deepEqual(new Set(mili?.suggestions), new Set(['Milli', 'Millî']));
});

test('kurum adı: belgede hangi yazım kullanılıyorsa (Millî / Milli) o öne alınır', () => {
  assert.equal(only('Millî Savunma Bakanlığı ve İlçe Mili Eğitim Müdürlüğü')[0]?.suggestions[0], 'Millî');
  assert.equal(only('Milli Savunma Bakanlığı ve İlçe Mili Eğitim Müdürlüğü')[0]?.suggestions[0], 'Milli');
});

test('kurum adı: Tümünü düzelt yalnızca Türkçe karakter farkını düzeltir', () => {
  assert.equal(fixAllText('İlçe Millî Eğitim Müdürlügüne gönderilmiştir.').text, 'İlçe Millî Eğitim Müdürlüğüne gönderilmiştir.');
  assert.equal(fixAllText('MİLLİ EĞİTİM BAKANLIGINA').text, 'MİLLİ EĞİTİM BAKANLIĞINA');
  // gerçek kelime hatası ve harf eksikliği tahmindir: dokunulmaz
  for (const t of ['Millî Eğitim Banlığına yazı gönderilmiştir.', 'İl Sağlık Müdrlüğü toplantısı yapılmıştır.']) assert.equal(fixAllText(t).text, t);
});

test('kurum adı: yanlış alarm yok', () => {
  for (const t of [
    'Millî Eğitim Bakanlığı ile Milli Savunma Bakanlığı arasında.', // iki yazım da doğru
    'Başkanlığımıza ve Müftülüğe bildirildi. Dekanlığa ve Rektörlüğe yazıldı.',
    'Fatsa İlçe Milli Eğitim Müdürlüğü Dumlupınar İlkokulu',
    'Hasan Doğan Milli Takımlar Kamp ve Eğitim Tesisleri', // kişi adı ikili kanıtına girmez
    'Ali Banlı geldi. Başlığı değiştirdik. Anlık durum. Bakkallığı bıraktı. Sağlığı iyidir.',
    'Mülga Başbakanlığın genelgesi', // başbakan ⊄ başkan
    'Okul Veliliği görevi', // veli ile vali aynı uzunlukta: gerçek türetme
    'Ali Babalığı üstlendi.',
    'Ar-Ge Birimi kuruldu. Mehmet Akif Ersoy Anadolu Lisesi Müdürlüğüne',
    'Mühendislik Fakültesi Dekanlığına, Ankara Valiliğine (İl Milli Eğitim Müdürlüğü)',
    'İdari İşler Başkanı, Daire Başkanı, Genel Müdür Yardımcısı, Cumhurbaşkanı Yardımcısı’nın', // unvanlar
    'Eti Maden İşletmeleri Genel Müdürlüğü; Yazı İşleri ve Kararlar Dairesi Başkanlığı',
    'https://www.mevzuat.gov.tr/MevzuatMetin/Cumhurbaskanligi Genelgesi',
    'TBMM ve MEB ile YÖK arasında',
  ]) assert.deepEqual(hits(t), [], t);
});

test('kurum adı sözlüğündeki her ad temiz geçer (yalın, yönelme ekli, büyük harfli)', () => {
  for (const line of KURUM_ADLARI.split('\n').map((l) => l.trim()).filter(Boolean)) {
    assert.deepEqual(hits(line), [], line);
    assert.deepEqual(hits(line.toLocaleUpperCase('tr-TR')), [], line.toLocaleUpperCase('tr-TR'));
    // yönelme eki: ünlüyle bitene -nA ("Bakanlığına"), ünsüzle bitene -A ("Kızılay'a" değil; kesmesiz adlar)
    const back = baseHarmony(line).back;
    const dat = /[aeıioöuü]$/.test(line) ? `n${back ? 'a' : 'e'}` : back ? 'a' : 'e';
    if (!/[kpçt]$/.test(line)) assert.deepEqual(hits(`Yazı ${line}${dat} gönderilmiştir.`), [], line + dat);
  }
});
