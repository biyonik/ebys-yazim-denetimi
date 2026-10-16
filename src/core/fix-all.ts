import type { Issue } from './types.ts';
import { check, type CheckOptions } from './engine.ts';

/**
 * "Tümünü düzelt" politikası.
 *
 * Resmî bir belgede toplu değişiklik yapıyoruz; ilke şudur:
 * makine yalnızca TEK DOĞRU CEVABI olan yerlere dokunur.
 *
 *   hata  + tek öneri   → uygulanır      (yanlız → yalnız, 3de → 3'te)
 *   öneri + tek öneri   → uygulanır      (çift boşluk, 5km → 5 km)
 *   uyari               → ASLA           (hala → hâlâ mı? bende → ben de mi?)
 *   birden çok öneri    → ASLA           (6'ı → 6'yı mı 6'sı mı?)
 *   tahmin (autoFix:false) → ASLA        (sözlükte olmayan kelimeye yakın aday)
 *
 * Uyarıları toplu uygulamak, yazanın kastettiği anlamı sessizce değiştirmek
 * demektir. "Dosya bende kalsın" cümlesi "Dosya ben de kalsın" olur ve
 * imzalanıp gönderilir.
 */
export function isAutoFixable(i: Issue): boolean {
  return i.severity !== 'uyari' && i.suggestions.length === 1 && i.autoFix !== false;
}

/**
 * Düzeltmeler SAĞDAN SOLA uygulanır: sondaki bir değişiklik öndeki
 * ofsetleri kaydırmaz. Soldan sağa uygulansaydı, "yanlız" → "yalnız" gibi
 * uzunluk değiştirmeyenler dışında her düzeltme sonrakilerin ofsetini bozardı.
 */
export function applyToText(text: string, fixes: Issue[]): string {
  let out = text;
  for (const f of [...fixes].sort((a, b) => b.start - a.start)) {
    if (out.slice(f.start, f.end) !== f.text) continue; // bayat; atla
    out = out.slice(0, f.start) + f.suggestions[0]! + out.slice(f.end);
  }
  return out;
}

/** Zincirleme düzeltmeler için kaç tur denenir (bir düzeltme yenisini doğurabilir) */
export const MAX_PASSES = 3;

export interface FixAllResult {
  text: string;
  applied: number;
  /** Kullanıcının kararına bırakılan (uyarı / çok seçenekli) sorunlar */
  remaining: Issue[];
}

/** DOM'suz referans uygulama: testlerde ve politika doğrulamasında kullanılır. */
export function fixAllText(text: string, opts: CheckOptions = {}): FixAllResult {
  let cur = text;
  let applied = 0;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const fixes = check(cur, opts).filter(isAutoFixable);
    if (fixes.length === 0) break;
    const next = applyToText(cur, fixes);
    if (next === cur) break;
    applied += fixes.length;
    cur = next;
  }
  return { text: cur, applied, remaining: check(cur, opts) };
}
