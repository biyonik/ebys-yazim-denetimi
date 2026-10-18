import {
  baseHarmony,
  HARD_CONSONANTS,
  harmonize2,
  harmonize4,
  harmonyOf,
  is2Way,
  is4Way,
  isVowel,
  lastVowel,
  trLower,
} from './turkish.ts';

/**
 * Bir gövdeye kesmeyle eklenen çekim ekini o gövdenin SESİNE göre doğrular.
 *
 * Gövde sayı ise sesi okunuşudur (3 → "üç"), özel ad ise kendisidir.
 * Uygulanan ses kuralları:
 *   - Büyük ünlü uyumu (2'li a/e, 4'lü ı/i/u/ü) — ek içinde zincirleme
 *   - Ünsüz benzeşmesi: sert ünsüzden sonra d → t   (Ahmet'te, 3'te)
 *   - Kaynaştırma: ünlüden sonra ünlüyle başlayan eke y/n/s (Ayşe'nin, 6'sı)
 *     ünsüzden sonra kaynaştırma olmaz             (Ahmet'nin → Ahmet'in)
 *   - Sıra sayı eki -(I)ncI
 *   - Uyuma girmeyen son ekler (-ki, -ken) zincirden ayrılır
 *
 * Uygulanmayan (bilinçli): özel adlarda yazımda ünsüz yumuşaması gösterilmez
 * (Ahmet'e, Ahmed'e değil); bu yüzden gövdeye hiç dokunulmaz.
 */

const INVARIANT_TAILS = ['ken', 'ki'] as const;

export function harmonizeSuffix(base: string, suffix: string): string {
  let body = trLower(suffix);
  let tail = '';
  // Yanlış uyumla yazılmış hâlleri de yakala: "-kı" → "-ki", "-kan" → "-ken"
  const tailRe = /(k[ıiuü]|k[ae]n)$/.exec(body);
  if (tailRe && body.length > tailRe[0].length) {
    tail = tailRe[0].length === 2 ? INVARIANT_TAILS[1] : INVARIANT_TAILS[0];
    body = body.slice(0, -tailRe[0].length);
  }

  const b = trLower(base);
  const lv = lastVowel(b);
  if (!lv) return trLower(suffix); // ünlüsüz gövde (kısaltma vb.): dokunma
  let prev = baseHarmony(b);
  let lastChar = b[b.length - 1]!;
  const endsWithVowel = isVowel(lastChar);
  let out = '';

  const ord = /^[ıiuü]?nc[ıiuü]/.exec(body);
  if (ord) {
    const v = harmonize4(prev);
    out = (endsWithVowel ? '' : v) + 'nc' + v;
    body = body.slice(ord[0].length);
    prev = harmonyOf(v);
    lastChar = v;
  }

  for (let i = 0; i < body.length; i++) {
    let ch = body[i]!;
    if (isVowel(ch)) {
      if (is2Way(ch)) ch = harmonize2(prev);
      else if (is4Way(ch)) ch = harmonize4(prev);
      prev = harmonyOf(ch);
    } else if (out.length === 0 && (ch === 'd' || ch === 't') && isVowel(body[i + 1] ?? '')) {
      ch = HARD_CONSONANTS.has(lastChar) ? 't' : 'd';
    }
    out += ch;
  }
  return out + tail;
}

export interface SuffixCheck {
  /** Doğru ek adayları (kesmesiz, küçük harf). Birden fazlaysa bağlama bağlıdır. */
  candidates: string[];
  /** Yazılan ek adaylardan biriyle zaten aynı mı? */
  isCorrect: boolean;
  note: string;
}

export function checkSuffix(base: string, suffix: string): SuffixCheck {
  const written = trLower(suffix);
  let s = harmonizeSuffix(base, suffix);
  const b = trLower(base);
  const endsWithVowel = isVowel(b[b.length - 1] ?? '');
  let note = '';
  let candidates: string[];

  if (!endsWithVowel) {
    // Ünsüzden sonra kaynaştırma ünsüzü olmaz: 'nin → 'in, 'ye → 'e, 'yle → 'le, 'si → 'i
    if (/^[yns][aeıiouü]/.test(s) && !/^nc/.test(s)) {
      s = s.slice(1);
      note = 'Ünsüzle biten gövdeden sonra kaynaştırma ünsüzü kullanılmaz.';
    } else if (/^yl[ae]/.test(s)) {
      s = s.slice(1);
      note = 'Ünsüzle biten gövdeden sonra kaynaştırma ünsüzü kullanılmaz.';
    }
    candidates = [s];
  } else if (/^[ıiuü]n(ki)?$/.test(s)) {
    candidates = ['n' + s]; // ilgi hâli: Ayşe'nin, 2'nin
    note = 'Ünlüyle biten gövdeye ilgi eki “-nin” biçiminde gelir.';
  } else if (/^[ae]$/.test(s) || /^l[ae]$/.test(s)) {
    candidates = ['y' + s]; // Ayşe'ye, Ayşe'yle
    note = 'Ünlüyle biten gövdeden sonra kaynaştırma ünsüzü “y” gelir.';
  } else if (/^[ıiuü]$/.test(s)) {
    candidates = ['y' + s, 's' + s]; // belirtme (6'yı) mı, iyelik (6'sı) mı? bağlama bağlı
    note = 'Ünlüyle biten gövdeden sonra kaynaştırma ünsüzü gerekir: belirtme hâli için “y”, iyelik için “s”.';
  } else {
    candidates = [s];
  }
  return { candidates, isCorrect: candidates.length === 1 && candidates[0] === written, note };
}
