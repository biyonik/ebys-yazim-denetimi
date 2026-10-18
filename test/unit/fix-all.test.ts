import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyToText, fixAllText, isAutoFixable } from '../../src/core/fix-all.ts';
import { check } from '../../src/core/engine.ts';

const LONG =
  "orjinal evrakların Ahmetin masasında olduğunu bende biliyorum ama Balıkesir Valiliği'ne gönderilecek yazının saat 3de hazır olması gerekiyormu bilmiyorum , yanlız Mehmetten gelen bilgiye göre toplantı 2026da Ankarada yapılacak ve ve herkez katılacak.Bilgilerinize arzederim.";

test('uzun cümle: kesinler düzelir, bağlama bağlılar kalır', () => {
  const r = fixAllText(LONG);
  assert.equal(
    r.text,
    "Orijinal evrakların Ahmet'in masasında olduğunu bende biliyorum ama Balıkesir Valiliğine gönderilecek yazının saat 3'te hazır olması gerekiyor mu bilmiyorum, yalnız Mehmet'ten gelen bilgiye göre toplantı 2026'da Ankara'da yapılacak ve ve herkes katılacak. Bilgilerinize arz ederim.",
  );
  assert.equal(r.applied, 13);
  // Kalanlar: bağlama bağlı uyarılar + Kılavuz'un cümle sonu önerisi (üslup kararı, elle uygulanır)
  assert.deepEqual(
    r.remaining.map((i) => i.text),
    ['bende', 've ve', 'katılacak'],
  );
  assert.ok(r.remaining.every((i) => !isAutoFixable(i)));
  assert.deepEqual(r.remaining.at(-1)?.suggestions, ['katılacaktır']);
});

test('uyarı ve çok seçenekli öneri asla otomatik uygulanmaz', () => {
  const issues = check("Dosya hala gelmedi, toplam 6'ı bulmadı.");
  assert.ok(issues.length >= 2);
  assert.ok(issues.every((i) => !isAutoFixable(i)));
  assert.equal(fixAllText("Dosya hala gelmedi, toplam 6'ı bulmadı.").applied, 0);
});

test('sağdan sola uygulama ofsetleri korur (uzunluk değiştiren düzeltmeler)', () => {
  const text = 'hiç bir yerde 3de değil 2026da.';
  const fixes = check(text).filter(isAutoFixable);
  assert.equal(applyToText(text, fixes), "Hiçbir yerde 3'te değil 2026'da.");
});

test('bayat düzeltme atlanır', () => {
  const fixes = check('Bu yanlız olur.');
  assert.equal(applyToText('Bu yalnız olur.', fixes), 'Bu yalnız olur.');
});

test('idempotent: ikinci çalıştırma hiçbir şey değiştirmez', () => {
  const once = fixAllText(LONG).text;
  const twice = fixAllText(once);
  assert.equal(twice.applied, 0);
  assert.equal(twice.text, once);
});
