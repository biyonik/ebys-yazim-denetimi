import { check, type CheckOptions } from './engine.ts';
import { fixAllText } from './fix-all.ts';
import type { Issue } from './types.ts';

/**
 * EBYS'nin "Konu" alanı (Belgenet: textarea.metadataKonuTextArea) editörden ayrı, tek satırlık
 * bir form alanıdır. Konu kuralları (Yönetmelik m.13: kelimelerin baş harfi büyük, sonda noktalama
 * yok, "hk." yerine "Hakkında") editör için "Konu:" satırını tanıyarak çalışır. Aynı kuralları ve
 * yazım denetimini tekrar yazmak yerine alan değerinin önüne bu öneki koyup motoru çalıştırırız;
 * ofsetleri geri kaydırır, önekin üzerindeki sorunları atarız.
 */
const PREFIX = 'Konu: ';

/** Konu alanında anlamsız kurallar: kısaltmanın açık hâli metinde verilir, konuda değil (m.16(11)) */
const NOT_FOR_KONU = new Set(['yonetmelik.kisaltma.tanim']);

export function checkKonu(value: string, opts: CheckOptions = {}): Issue[] {
  if (!value.trim()) return [];
  return check(PREFIX + value, opts)
    .filter((i) => i.start >= PREFIX.length && !NOT_FOR_KONU.has(i.ruleId))
    .map((i) => ({ ...i, start: i.start - PREFIX.length, end: i.end - PREFIX.length }));
}

/** Konu alanında "Tümünü düzelt": yalnızca tek doğru cevabı olan sorunlar */
export function fixAllKonu(value: string, opts: CheckOptions = {}): { value: string; applied: number } {
  const r = fixAllText(PREFIX + value, opts);
  return { value: r.text.startsWith(PREFIX) ? r.text.slice(PREFIX.length) : value, applied: r.applied };
}
