import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../../src/core/engine.ts';

type Exp = [text: string, rule: string, suggestion: string];
const only = (text: string, prefix: string) => check(text).filter((i) => i.ruleId.startsWith(prefix));
const sug = (text: string, prefix: string) => only(text, prefix).map((i) => [i.text, i.suggestions[0]]);
const noneOf = (texts: string[], prefix: string) => {
  for (const t of texts) assert.deepEqual(only(t, prefix).map((i) => i.text), [], `yanlış pozitif: ${t}`);
};

test('kullanıcı örneği: "orjinal Ahmetin banada ona da 3te 5te"', () => {
  const got = check('orjinal Ahmetin banada ona da 3te 5te').map((i) => [i.text, i.suggestions[0]]);
  assert.deepEqual(got, [
    ['orjinal', 'Orijinal'], // yazım + cümle başı birleştirildi
    ['Ahmetin', "Ahmet'in"],
    ['banada', 'bana da'],
    ['3te', "3'te"],
    ['5te', "5'te"],
  ]);
});

test('de/da bağlacı: kapalı sınıf gövdeler', () => {
  const cases: Exp[] = [
    ['Banada verdiler.', 'baglac.de', 'Bana da'],
    ['Onuda çağırın.', 'baglac.de', 'Onu da'],
    ['Bizimde görüşümüz.', 'baglac.de', 'Bizim de'],
    ['Buradada sorun var.', 'baglac.de', 'Burada da'],
    ['Şimdide bekliyoruz.', 'baglac.de', 'Şimdi de'],
    ['Hemde hızlı.', 'baglac.de', 'Hem de'],
  ];
  for (const [t, r, s] of cases) assert.equal(only(t, r)[0]?.suggestions[0], s, t);
});

test('de/da: bulunma hâli asla bağlaç sanılmaz', () => {
  noneOf(
    ['Maddede belirtildi.', 'İfadede yer alır.', 'Adada kaldık.', 'Evde çalışır.', 'Dedede kaldı.', 'Kitapta yazar.', 'Dünde kalmak.'],
    'baglac.de',
  );
});

test('de/da: "bende" bağlama bağlı → uyarı', () => {
  const [is] = only('Bende geldim.', 'baglac.de');
  assert.equal(is?.severity, 'uyari');
  assert.equal(is?.suggestions[0], 'Ben de');
});

test('ki bağlacı', () => {
  assert.deepEqual(sug('Biliyorumki gelecek.', 'baglac.ki'), [['Biliyorumki', 'Biliyorum ki']]);
  assert.deepEqual(sug('Öyle olacakki herkes şaşıracak.', 'baglac.ki'), [['olacakki', 'olacak ki']]);
  assert.deepEqual(sug('Değilki bilsin.', 'baglac.ki'), [['Değilki', 'Değil ki']]);
  noneOf(['Evdeki kitap.', 'Şimdiki durum.', 'Yarınki toplantı.', 'Mademki geldin.', 'Halbuki biliyordu.', 'Sanki yağmur.', 'Belki gelir.', 'Öteki dosya.'], 'baglac.ki');
});

test('mi soru eki', () => {
  assert.deepEqual(sug('Geliyormusun?', 'baglac.mi'), [['Geliyormusun', 'Geliyor musun']]);
  assert.deepEqual(sug('Varmı?', 'baglac.mi'), [['Varmı', 'Var mı']]);
  assert.deepEqual(sug('Uygunmudur?', 'baglac.mi'), [['Uygunmudur', 'Uygun mudur']]);
  assert.deepEqual(sug('Gelmişmiydi?', 'baglac.mi'), [['Gelmişmiydi', 'Gelmiş miydi']]);
  assert.deepEqual(sug('Geliyor mi?', 'baglac.mi'), [['mi', 'mu']]);
  // Ünlü düşmesi (resim → resmi), iyelik, rivayet: hiçbiri soru eki değil
  noneOf(['Resmi yazı.', 'İsmi geçti.', 'Kısmı eksik.', 'Gelecekmiş.', 'Varmış.', 'Doğrumuz bu.', 'Elmamı yedi.'], 'baglac.mi');
});

test('özel ad + çekim eki', () => {
  assert.deepEqual(sug('Dosyayı Ankaraya gönderin.', 'kesme.ozel-ad'), [['Ankaraya', "Ankara'ya"]]);
  assert.deepEqual(sug('Türkiyenin geleceği.', 'kesme.ozel-ad'), [['Türkiyenin', "Türkiye'nin"]]);
  assert.deepEqual(sug('Atatürkün ilkeleri.', 'kesme.ozel-ad'), [['Atatürkün', "Atatürk'ün"]]);
  assert.deepEqual(sug('Konu Mehmetten soruldu.', 'kesme.ozel-ad'), [['Mehmetten', "Mehmet'ten"]]);
  assert.deepEqual(sug('ANKARADA toplantı.', 'kesme.ozel-ad'), [['ANKARADA', "ANKARA'DA"]]);
});

test('özel ad: ek uyumu ve kaynaştırma', () => {
  assert.deepEqual(sug("Ayşe'in kitabı.", 'kesme.ozel-ad'), [["Ayşe'in", "Ayşe'nin"]]);
  assert.deepEqual(sug("Ahmet'ye verildi.", 'kesme.ozel-ad'), [["Ahmet'ye", "Ahmet'e"]]);
  assert.deepEqual(sug("Ahmet'nin dosyası.", 'kesme.ozel-ad'), [["Ahmet'nin", "Ahmet'in"]]);
  assert.deepEqual(sug("Ahmet'de kaldı.", 'kesme.ozel-ad'), [["Ahmet'de", "Ahmet'te"]]);
  noneOf(["Ahmet'in, Ayşe'nin, Ankara'da, Mehmet'ten, İzmir'e."], 'kesme.ozel-ad');
});

test('özel ad: yapım ekleri ve birleşik görünen adlar işaretlenmez', () => {
  noneOf(
    ['Ankaralı Türkçe Avrupalı İstanbullu Balıkesirli.', 'Emine Nurdan Gülden Handan Cansu Aliye.', 'Denizli ve Aydın.'],
    'kesme.ozel-ad',
  );
});

test('özel ad: cins isimle aynı adlar', () => {
  noneOf(['Denizde yüzdük.', 'Umuda yolculuk.', 'Barışa giden yol.'], 'kesme.ozel-ad');
  const [is] = only('Toplantıya Umutun katılımı.', 'kesme.ozel-ad');
  assert.equal(is?.severity, 'uyari');
});

test('kurum adlarına gelen ekler kesmesiz', () => {
  assert.deepEqual(sug("Balıkesir Valiliği'ne gönderildi.", 'kesme.kurum'), [["Valiliği'ne", 'Valiliğine']]);
  assert.deepEqual(sug("Türk Dil Kurumu'nun görüşü.", 'kesme.kurum'), [["Kurumu'nun", 'Kurumunun']]);
  assert.deepEqual(sug("Cumhurbaşkanlığı'na sunuldu.", 'kesme.kurum'), [["Cumhurbaşkanlığı'na", 'Cumhurbaşkanlığına']]);
  noneOf(['Balıkesir Valiliğine gönderildi.', "TBMM'ye sunuldu."], 'kesme.kurum');
});

test('sayı: kaynaştırma ünsüzü ilgi hâlinde "n"', () => {
  assert.deepEqual(sug("2'in yarısı.", 'kesme.sayi'), [["2'in", "2'nin"]]);
});
