import { parseTemplate, type Phon, type Template } from './phonology.ts';
import { isVowel } from '../turkish.ts';

/**
 * Ek dizimi (morfotaktik): hangi ekin hangisinden sonra gelebileceği.
 *
 * Her durum bir "gövde türü"dür; geçişler ek şablonlarıdır. Çözümleyici
 * kelimeyi soldan sağa bu grafikte yürür. Bir kelime ancak sonlu (final)
 * bir durumda, bekleyen ses kısıtı kalmadan biterse geçerlidir.
 *
 * Kapsam (bilinçli olarak):
 *  - İsim çekimi: çokluk, iyelik, hâl, -ki, ek-fiil (kişi, -DIr, -(y)DI, -(y)mIş, -(y)sA, -(y)ken)
 *  - Sık yapım ekleri: -lI, -sIz, -lIk, -CI, -CIk, -CA, -DAş, -sAl; isimden fiil: -lA, -lAş, -lAn
 *  - Fiil: ettirgen, edilgen, olumsuzluk, yeterlik, tüm zaman/kip ekleri, emir, istek,
 *          sıfat-fiiller (-An, -DIk, -AcAk, -mIş), isim-fiiller (-mA, -mAk, -Iş), zarf-fiiller
 *  - Kapsam dışı: dönüşlü/işteş (sözlükte ayrı madde olarak var), nadir yapım ekleri.
 *    Kapsam dışı bir biçim "bilinmeyen kelime" olarak UYARI alır, hata değil.
 */

export type State =
  | 'N0' | 'NNUM' | 'NPL' | 'NPOSS' | 'NP3' | 'NC' | 'NCL' | 'NKI' | 'NCOMP'
  | 'NBARE' | 'NADV' | 'NPOSTP' | 'NQ' | 'NK' | 'NMAK' | 'NPRON'
  | 'COP' | 'CDIR' | 'FINK' | 'AFTERK' | 'FINZ' | 'AFTERP' | 'FINZ2'
  | 'V0' | 'VC' | 'VP' | 'VA' | 'VN' | 'VNAOR' | 'VOPT' | 'END';

/** Özel gerçekleşme kuralı olan ekler */
export type Special = 'AOR' | 'CAUS' | 'PASS';

export interface Transition {
  id: string;
  tpl: Template | Special;
  to: State;
  /** Sonu p/ç/t/k ise ünlüden önce yumuşar (-AcAk → -AcAğ, -lIk → -lIğ) */
  voic?: boolean;
  /** Ünlüyle bitiyorsa -Iyor'dan önce ünlüsü düşer (yapma → yapm-ıyor) */
  trunc?: boolean;
  cond?: (p: Phon) => boolean;
}

const t = (id: string, src: string, to: State, extra: Partial<Transition> = {}): Transition => ({
  id,
  tpl: parseTemplate(src),
  to,
  ...extra,
});

// ── İsim ekleri ──────────────────────────────────────────────────────────

const PL = t('PL', 'lAr', 'NPL');
const POSS12 = [t('P1sg', '(I)m', 'NPOSS'), t('P2sg', '(I)n', 'NPOSS'), t('P1pl', '(I)mIz', 'NPOSS'), t('P2pl', '(I)nIz', 'NPOSS')];
const P3 = t('P3sg', '(s)I', 'NP3');
const P3PL = t('P3pl', 'lArI', 'NP3');

const CASES = [
  t('Acc', '(y)I', 'NC'),
  t('Dat', '(y)A', 'NC'),
  t('Loc', 'DA', 'NCL'),
  t('Abl', 'DAn', 'NC'),
  t('Gen', '(n)In', 'NCL'),
  t('Ins', '(y)lA', 'NC'),
  // Eşitlik (yapan): idarelerce, Kurumumuzca, tarafınızca
  t('Equ', 'CA', 'NC'),
];
/** İyelik 3. kişiden ve -ki'den sonra zamir n'si: kitabı-n-ı, evdeki-n-e */
const CASES_N = [
  t('AccN', 'nI', 'NC'),
  t('DatN', 'nA', 'NC'),
  t('LocN', 'nDA', 'NCL'),
  t('AblN', 'nDAn', 'NC'),
  t('GenN', 'nIn', 'NCL'),
  t('InsN', '(y)lA', 'NC'),
  t('EquN', 'ncA', 'NC'),
];
const KI = [
  t('Ki', 'ki', 'NKI'),
  // dünkü, bugünkü, öbürkü — -ki'nin tek uyumlu istisnaları
  t('Kü', 'kü', 'NKI', { cond: (p) => !p.harm.back && p.harm.round }),
];

const COP: Transition[] = [
  t('C1sg', '(y)Im', 'END'),
  t('C2sg', 'sIn', 'END'),
  t('C1pl', '(y)Iz', 'END'),
  t('C2pl', 'sInIz', 'END'),
  t('Dir', 'DIr', 'CDIR'),
  t('CPast', '(y)DI', 'FINK'),
  t('CNarr', '(y)mIş', 'FINZ2'),
  t('CCond', '(y)sA', 'FINK'),
  t('CWhile', '(y)ken', 'END'),
];
const PERS_Z = [t('A1sg', '(y)Im', 'AFTERP'), t('A2sg', 'sIn', 'AFTERP'), t('A1pl', '(y)Iz', 'AFTERP'), t('A2pl', 'sInIz', 'AFTERP'), t('A3pl', 'lAr', 'AFTERP')];
const PERS_K = [t('K1sg', 'm', 'AFTERK'), t('K2sg', 'n', 'AFTERK'), t('K1pl', 'k', 'AFTERK'), t('K2pl', 'nIz', 'AFTERK'), t('K3pl', 'lAr', 'AFTERK')];

const DERIV_N = [
  t('With', 'lI', 'N0'),
  t('Without', 'sIz', 'N0'),
  t('Ness', 'lIk', 'N0', { voic: true }),
  t('Agt', 'CI', 'N0'),
  t('Dim', 'CIk', 'N0', { voic: true }),
  t('Ly', 'CA', 'N0'),
  t('Fellow', 'DAş', 'N0'),
  t('Rel', 'sAl', 'N0'),
];
const DERIV_V = [
  t('Become', 'lA', 'V0', { trunc: true }),
  t('Become2', 'lAş', 'V0'),
  t('Acquire', 'lAn', 'V0'),
];

// ── Fiil ekleri ──────────────────────────────────────────────────────────

const CAUS: Transition = { id: 'Caus', tpl: 'CAUS', to: 'VC' };
const PASS: Transition = { id: 'Pass', tpl: 'PASS', to: 'VP' };
const AOR: Transition = { id: 'Aor', tpl: 'AOR', to: 'FINZ' };
/** Geniş zaman sıfatı → isim: sürdürülebilir-lik, okunabilir-lik */
const AORP: Transition = { id: 'AorPart', tpl: 'AOR', to: 'N0' };

const NEG = t('Neg', 'mA', 'VN', { trunc: true });
const NEGABLE = t('NegAble', '(y)AmA', 'VN', { trunc: true });
const ABLE = t('Able', '(y)Abil', 'VA');

const TENSES = [
  t('Prog', 'Iyor', 'FINZ', { cond: (p) => !isVowel(p.last) }),
  t('Prog2', 'mAktA', 'FINZ'),
  t('Past', 'DI', 'FINK'),
  t('Narr', 'mIş', 'FINZ'),
  t('Fut', '(y)AcAk', 'FINZ', { voic: true }),
  t('Neces', 'mAlI', 'FINZ'),
  t('Cond', 'sA', 'FINK'),
  t('Opt', '(y)A', 'VOPT'),
];
const IMP = [t('Imp3', 'sIn', 'END'), t('Imp3pl', 'sInlAr', 'END'), t('Imp2pl', '(y)In', 'END'), t('Imp2plF', '(y)InIz', 'END')];
const NONFIN = [
  t('PresPart', '(y)An', 'N0'),
  t('PastPart', 'DIk', 'N0', { voic: true }),
  t('FutPart', '(y)AcAk', 'N0', { voic: true }),
  t('NarrPart', 'mIş', 'N0'),
  t('Inf2', 'mA', 'N0'),
  t('Inf1', 'mAk', 'NMAK'),
  t('Inf3', '(y)Iş', 'N0'),
  t('Agent', '(y)IcI', 'N0'),
  t('ByDoing', '(y)ArAk', 'END'),
  t('AfterDoing', '(y)Ip', 'END'),
  t('When', '(y)IncA', 'END'),
  t('Without', 'mAdAn', 'END'),
  t('Since', '(y)AlI', 'END'),
  t('AsLongAs', 'DIkçA', 'END'),
  t('WithoutHaving', 'mAksIzIn', 'END'),
];

const VSTEM = [NEG, NEGABLE, ABLE, AOR, AORP, ...TENSES, ...NONFIN, ...IMP];

// ── Durum tablosu ────────────────────────────────────────────────────────

export const STATES: Record<State, Transition[]> = {
  N0: [PL, ...POSS12, P3, P3PL, ...CASES, ...DERIV_N, ...DERIV_V, ...COP, ...KI.map((k) => ({ ...k, cond: (p: Phon) => !!p.time && (k.cond?.(p) ?? true) }))],
  NNUM: [
    PL, ...POSS12, P3, ...CASES, ...COP, ...DERIV_N,
    t('Ord', '(I)ncI', 'N0'),
    t('Dist', '(ş)Ar', 'N0'),
  ],
  NPL: [...POSS12, P3, ...CASES, ...COP],
  NPOSS: [...CASES, ...COP],
  NP3: [...CASES_N, ...COP],
  NC: [...COP],
  NCL: [...KI, ...COP],
  NKI: [PL, ...CASES_N, ...COP],
  NCOMP: [PL, ...POSS12],
  NBARE: [],
  NADV: [...KI, t('Ness', 'lIk', 'N0', { voic: true }), ...COP],
  NPOSTP: [...COP, ...KI],
  NQ: [...COP],
  NK: [...COP],
  // -mAk'tan sonra yalnızca ünsüzle başlayan ekler: yapmakta, yapmaktan, yapmakla, sağlamaktır
  NMAK: [t('Loc', 'DA', 'NCL'), t('Abl', 'DAn', 'NC'), t('Ins', '(y)lA', 'NC'), t('Without', 'sIzIn', 'END'),
    t('Dir', 'DIr', 'CDIR'), t('CPast', '(y)DI', 'FINK'), t('CNarr', '(y)mIş', 'FINZ2'), t('CCond', '(y)sA', 'FINK')],
  NPRON: [...KI, ...COP],

  COP: COP,
  CDIR: [t('Dir3pl', 'lAr', 'END')],
  FINK: [...PERS_K, t('CCond', '(y)sA', 'END')],
  AFTERK: [t('CCond', '(y)sA', 'END')],
  FINZ: [
    ...PERS_Z,
    t('Dir', 'DIr', 'CDIR'),
    t('CPast', '(y)DI', 'FINK'),
    t('CNarr', '(y)mIş', 'FINZ2'),
    t('CCond', '(y)sA', 'FINK'),
    t('CWhile', '(y)ken', 'END'),
  ],
  AFTERP: [t('Dir', 'DIr', 'END'), t('CPast', '(y)DI', 'END'), t('CNarr', '(y)mIş', 'END'), t('CCond', '(y)sA', 'END')],
  FINZ2: [...PERS_Z],

  V0: [CAUS, PASS, ...VSTEM],
  VC: [CAUS, PASS, ...VSTEM],
  // "n" edilgeninden sonra ikinci edilgen yaygın ve sözlükte yer alır: de-n-il-mektedir, iste-n-il-en
  VP: [{ ...PASS, cond: (p) => p.last === 'n' }, ...VSTEM],
  VA: [NEG, AOR, AORP, ...TENSES, ...NONFIN],
  VN: [
    ...TENSES.filter((x) => x.id !== 'Opt'),
    t('Opt', '(y)A', 'VOPT'),
    t('NegAor', 'z', 'VNAOR'),
    t('NegAor1sg', 'm', 'END'),
    t('NegAor1pl', '(y)Iz', 'END'),
    t('WithoutN', 'dAn', 'END'),
    ...NONFIN.filter((x) => x.id !== 'Without'),
    ...IMP,
  ],
  VNAOR: [
    t('A2sg', 'sIn', 'END'), t('A2pl', 'sInIz', 'END'), t('A3pl', 'lAr', 'AFTERP'),
    t('CPast', '(y)DI', 'FINK'), t('CNarr', '(y)mIş', 'FINZ2'), t('CCond', '(y)sA', 'FINK'),
    t('CWhile', '(y)ken', 'END'), t('Dir', 'DIr', 'END'),
    // Olumsuz geniş zaman sıfatı: "değişmez kural", "vazgeçilmezlik"
    t('Ness', 'lIk', 'N0', { voic: true }),
  ],
  VOPT: [t('O1sg', '(y)Im', 'END'), t('O1pl', 'lIm', 'END'), t('O2sg', 'sIn', 'END'), t('O2pl', 'sInIz', 'END'), t('O3pl', 'lAr', 'END')],
  END: [],
};

/** Kelimenin bu durumda bitmesine izin verilir mi */
export const FINAL = new Set<State>([
  'N0', 'NNUM', 'NPL', 'NPOSS', 'NP3', 'NC', 'NCL', 'NKI', 'NBARE', 'NADV', 'NPOSTP', 'NQ', 'NK', 'NMAK', 'NPRON',
  'CDIR', 'FINK', 'AFTERK', 'FINZ', 'AFTERP', 'FINZ2',
  'V0', 'VC', 'VP', 'VN', 'VNAOR', 'VOPT', 'END',
]);
