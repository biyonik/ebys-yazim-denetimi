import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkKonu, fixAllKonu } from '../../src/core/konu.ts';
import { fingerprint } from '../../src/core/engine.ts';

const ids = (v: string) => checkKonu(v).map((i) => i.ruleId);

test('Konu: boş değer denetlenmez', () => {
  assert.deepEqual(checkKonu(''), []);
  assert.deepEqual(checkKonu('   '), []);
});

test('Konu: konumlar alan değerine göredir ("Konu: " öneki düşülür)', () => {
  const v = 'Eğitim programı.';
  for (const i of checkKonu(v)) assert.equal(v.slice(i.start, i.end), i.text);
  assert.ok(checkKonu(v).length >= 2, 'küçük harf ve sondaki nokta');
});

test('Konu: tümünü düzelt — büyük harf, nokta, kısaltma', () => {
  assert.equal(fixAllKonu('Eğitim programı.').value, 'Eğitim Programı');
  assert.equal(fixAllKonu('Toplantı hk.').value, 'Toplantı Hakkında');
  assert.equal(fixAllKonu('öğretmen norm kadro çalışması').value, 'Öğretmen Norm Kadro Çalışması');
});

test('Konu: doğru yazımlarda yanlış alarm yok', () => {
  assert.deepEqual(ids('e-Yazışma Projesi'), []);
  assert.deepEqual(ids('2025-2026 Eğitim Öğretim Yılı LGS Takvimi'), []);
  assert.deepEqual(ids('Hizmet İçi Eğitim Faaliyetleri'), []);
});

test('Konu: kısaltmanın açık hâli konuda istenmez (m.16(11) metin içindir)', () => {
  assert.ok(!ids('LGS Takvimi').includes('yonetmelik.kisaltma.tanim'));
});

test('Konu: yoksayılan sorun tekrar gelmez', () => {
  const [first] = checkKonu('Toplantı hk.');
  assert.ok(first);
  const ignored = new Set<string>();
  ignored.add(fingerprint(first));
  assert.equal(checkKonu('Toplantı hk.', { ignored }).length, checkKonu('Toplantı hk.').length - 1);
});
