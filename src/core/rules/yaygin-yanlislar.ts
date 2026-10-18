import type { Issue, Rule, Severity } from '../types.ts';
import { harmonyOf, lastVowel, matchCase, trLower } from '../turkish.ts';

/**
 * Sık yapılan yazım yanlışları sözlüğü.
 *
 * Bu, morfoloji motoru gelene kadar köprü bir çözümdür ve motor geldikten
 * sonra da "yüksek güvenli kısa yol" olarak kalır. Sınırı şudur: sözlük
 * çekimli biçimleri bilmez. Bunu kısmen "gövde eşleme" ile çözüyoruz:
 *
 *   orjinal → orijinal  ⇒  orjinalden → orijinalden  (güvenli)
 *   makina  → makine    ⇒  makinalar  → makineler    (ek de değişir!)
 *
 * İkinci örnekte son ünlü kalından inceye döndüğü için ek de değişmek
 * zorunda; gövde eşleme yanlış öneri üretir. Bu yüzden gövde eşleme yalnızca
 * son ünlünün uyum sınıfı ve son harf AYNIYSA otomatik açılır. Aksi hâlde
 * yalnızca tam biçim yakalanır. Çekimli biçimlerin doğru düzeltilmesi
 * morfoloji motorunun işidir.
 */

interface Entry {
  wrong: string;
  right: string[];
  severity?: Severity;
  note?: string;
  ref?: string;
}

const KIL = 'Kılavuz s.54, sık yanlış kullanılan kelimeler';
const KIL_AYRI = 'Kılavuz §13.6.1, ayrı yazılan birleşik kelimeler';

const ENTRIES: Entry[] = [
  { wrong: 'yanlız', right: ['yalnız'] },
  { wrong: 'yalnış', right: ['yanlış'] },
  { wrong: 'herkez', right: ['herkes'] },
  { wrong: 'malesef', right: ['maalesef'] },
  { wrong: 'birşey', right: ['bir şey'] },
  { wrong: 'herşey', right: ['her şey'] },
  { wrong: 'hiçbirşey', right: ['hiçbir şey'] },
  { wrong: 'hiçkimse', right: ['hiç kimse'] },
  { wrong: 'herbiri', right: ['her biri'] },
  { wrong: 'hergün', right: ['her gün'] },
  { wrong: 'herzaman', right: ['her zaman'] },
  { wrong: 'herhangibir', right: ['herhangi bir'] },
  { wrong: 'pekçok', right: ['pek çok'] },
  { wrong: 'yada', right: ['ya da'] },
  { wrong: 'yinede', right: ['yine de'] },
  { wrong: 'öyleki', right: ['öyle ki'] },
  { wrong: 'tabiki', right: ['tabii ki'] },
  { wrong: 'çünki', right: ['çünkü'] },
  { wrong: 'orjinal', right: ['orijinal'] },
  { wrong: 'laboratuar', right: ['laboratuvar'] },
  { wrong: 'makina', right: ['makine'] },
  { wrong: 'şöför', right: ['şoför'] },
  { wrong: 'egzos', right: ['egzoz'] },
  { wrong: 'rasgele', right: ['rastgele'] },
  { wrong: 'süpriz', right: ['sürpriz'] },
  { wrong: 'entellektüel', right: ['entelektüel'] },
  { wrong: 'profösör', right: ['profesör'] },
  { wrong: 'antranör', right: ['antrenör'] },
  { wrong: 'aşşağı', right: ['aşağı'] },
  { wrong: 'döküman', right: ['doküman'] },
  { wrong: 'dökümantasyon', right: ['dokümantasyon'] },
  { wrong: 'klavuz', right: ['kılavuz'] },
  { wrong: 'müsade', right: ['müsaade'] },
  { wrong: 'müracat', right: ['müracaat'] },
  { wrong: 'mütahit', right: ['müteahhit'] },
  { wrong: 'müteahit', right: ['müteahhit'] },
  { wrong: 'tasaruf', right: ['tasarruf'] },
  { wrong: 'traş', right: ['tıraş'] },
  { wrong: 'katogori', right: ['kategori'] },
  { wrong: 'kordinasyon', right: ['koordinasyon'] },
  { wrong: 'kordinatör', right: ['koordinatör'] },
  { wrong: 'provakasyon', right: ['provokasyon'] },
  { wrong: 'prosödür', right: ['prosedür'] },
  { wrong: 'metod', right: ['metot'] },
  { wrong: 'zerafet', right: ['zarafet'] },
  { wrong: 'bilimum', right: ['bilumum'] },
  {
    wrong: 'ünvan',
    right: ['unvan'],
    ref: KIL,
    note: 'Doğru yazımı: “unvan” (TDK; Kılavuz Ocak 2023 tablosu da “Ünvan → Unvan” der). Not: Kılavuzun Şubat 2025 baskısı bu satırı tersine çevirmiştir; Yönetmelik m.16(8) TDK’yi esas aldığı için “unvan” korunur.',
  },
  // ── Kılavuz tablosu (Ocak 2023 baskısı, s.54; Şubat 2025 baskısıyla aynı, tek fark "unvan") ──
  // "Direk → Direkt" aşağıda UYARI olarak: "direk" sütun anlamıyla doğru bir kelimedir.
  ...[
    ['acenta', 'acente'], ['ardarda', 'art arda'], ['askari', 'asgari'], ['asvalt', 'asfalt'],
    ['ahçı', 'aşçı'], ['aşcı', 'aşçı'], ['ayrıyeten', 'ayrıca'], ['ayrıyetten', 'ayrıca'],
    ['azerbeycan', 'Azerbaycan'], ['burda', 'burada'], ['deyinmek', 'değinmek'], ['diyaspora', 'diaspora'],
    ['döndermek', 'döndürmek'], ['erezyon', 'erozyon'], ['harfiyat', 'hafriyat'], ['hastahane', 'hastane'],
    ['hizmetiçi', 'hizmet içi'], ['hukuğu', 'hukuku'], ['insiyatif', 'inisiyatif'], ['işbirliği', 'iş birliği'],
    ['itibariyle', 'itibarıyla'], ['izalasyon', 'izolasyon'], ['kırahathane', 'kıraathane'], ['krathane', 'kıraathane'],
    ['kominikasyon', 'komünikasyon'], ['komünükasyon', 'komünikasyon'], ['küsür', 'küsur'], ['labratuvar', 'laboratuvar'],
    ['labaratuar', 'laboratuvar'], ['mataryel', 'materyal'], ['mebla', 'meblağ'], ['method', 'metot'],
    ['mezkür', 'mezkûr'], ['meskür', 'mezkûr'], ['muhattap', 'muhatap'], ['mütevazi', 'mütevazı'],
    ['mühled', 'mühlet'], ['mütaakip', 'müteakip'], ['nufüs', 'nüfus'], ['ortadoğu', 'Orta Doğu'],
    ['öğe', 'öge'], ['parağraf', 'paragraf'], ['parakende', 'perakende'], ['proğram', 'program'],
    ['rakkam', 'rakam'], ['satınalma', 'satın alma'], ['sebeb', 'sebep'], ['seyehat', 'seyahat'],
    ['sezeryan', 'sezaryen'], ['şifai', 'şifahi'], ['sözkonusu', 'söz konusu'], ['sipiker', 'spiker'],
    ['tahüt', 'taahhüt'], ['taktir', 'takdir'], ['tasviye', 'tasfiye'], ['tastik', 'tasdik'],
    ['tebli', 'tebliğ'], ['tebellü', 'tebellüğ'], ['tensib', 'tensip'], ['tesbit', 'tespit'],
    ['teşfik', 'teşvik'], ['taşaron', 'taşeron'], ['ultimatom', 'ültimatom'], ['ültümaton', 'ültimatom'],
    ['ünüverste', 'üniversite'], ['ünversite', 'üniversite'], ['uslup', 'üslup'], ['üzre', 'üzere'],
    ['yeralmak', 'yer almak'], ['yövmiye', 'yevmiye'], ['yurtiçi', 'yurt içi'], ['yurtdışı', 'yurt dışı'],
    ['yasadışı', 'yasa dışı'], ['gecekondu', 'gecekondu'],
  ]
    .filter(([w, r]) => w !== r)
    .map(([wrong, right]): Entry => ({ wrong: wrong!, right: [right!], ref: KIL })),
  { wrong: 'tekrardan', right: ['tekrar'], severity: 'uyari', note: '"Tekrardan" yerine "tekrar" yeterlidir.', ref: KIL },
  { wrong: 'evraklar', right: ['evrak'], severity: 'uyari', note: '"Evrak" zaten çokluk bildirir; çokluk eki gereksizdir.', ref: KIL },
  { wrong: 'mevzuatlar', right: ['mevzuat'], severity: 'uyari', note: '"Mevzuat" zaten çokluk bildirir; çokluk eki gereksizdir.', ref: KIL },
  { wrong: 'personeller', right: ['personel'], severity: 'uyari', note: '"Personel" topluluk adıdır; çokluk eki gereksizdir.', ref: KIL },
  { wrong: 'yükseköğrenim', right: ['yükseköğretim'], severity: 'uyari', note: 'Kurum ve mevzuat adlarında "Yükseköğretim" kullanılır.', ref: KIL },
  { wrong: 'direk', right: ['direkt'], severity: 'uyari', note: '“Doğrudan” anlamında “direkt” yazılır (ya da “doğrudan” tercih edilir). “Sütun” anlamındaysa “direk” doğrudur.', ref: KIL },
  // "yeralmak" çekimleri: gövde eşleme "yeraltı"nı da yakalayacağı için tek tek
  ...['yeralan', 'yeralanlar', 'yeralır', 'yeralmaktadır', 'yeralmıştır', 'yeralacaktır', 'yeraldı', 'yeraldığı', 'yeralması', 'yeralmasına', 'yeralmayan', 'yeralacak'].map(
    (w): Entry => ({ wrong: w, right: ['yer ' + w.slice(3)], ref: KIL }),
  ),
  // ── §13.6.1 Ayrı yazılan birleşik kelimeler (dış, iç, sıra; alt, üst, ön, art, arka, yan, karşı …) ──
  ...[
    ['olağandışı', 'olağan dışı'], ['kanundışı', 'kanun dışı'], ['çağdışı', 'çağ dışı'], ['ahlakdışı', 'ahlak dışı'],
    ['haftaiçi', 'hafta içi'], ['yanısıra', 'yanı sıra'], ['ardısıra', 'ardı sıra'], ['peşisıra', 'peşi sıra'],
    ['önyargı', 'ön yargı'], ['artniyet', 'art niyet'], ['arkaplan', 'arka plan'], ['yanetki', 'yan etki'],
    ['karşıgörüş', 'karşı görüş'], ['karşıoy', 'karşı oy'], ['dışborç', 'dış borç'], ['dışhat', 'dış hat'],
    ['ortanokta', 'orta nokta'], ['altkurul', 'alt kurul'], ['üstkurul', 'üst kurul'], ['önsöz', 'ön söz'],
    ['peşinhüküm', 'peşin hüküm'], ['büyükdefter', 'büyük defter'], ['küçükharf', 'küçük harf'],
  ].map(([wrong, right]): Entry => ({ wrong: wrong!, right: [right!], ref: KIL_AYRI })),
  { wrong: 'içtüzük', right: ['iç tüzük'], severity: 'uyari', note: 'Genel anlamda ayrı yazılır: “iç tüzük”. Mevzuattaki özel adlarda (TBMM İçtüzüğü) tescilli yazım korunur.', ref: KIL_AYRI },
  { wrong: 'anadili', right: ['ana dili'], severity: 'uyari', note: 'TDK ve Kılavuz: “ana dili” ayrı yazılır. Mevzuattan alıntıysa olduğu gibi bırakılabilir.', ref: KIL_AYRI },
  // Bağlama bağlı: iki anlamlı kelimeler — kesin hata değil
  {
    wrong: 'hala',
    right: ['hâlâ'],
    severity: 'uyari',
    note: '“Henüz, şimdiye kadar” anlamındaysa şapkalı yazılır: hâlâ. Akrabalık adı (babanın kız kardeşi) ise doğrudur.',
  },
  {
    wrong: 'tabi',
    right: ['tabii'],
    severity: 'uyari',
    note: '“Elbette, doğal olarak” anlamındaysa “tabii” yazılır. “Bağımlı, uyan” anlamındaysa “tabi” doğrudur.',
  },
];

/** İki kelimelik yanlışlar: token dizisi olarak eşlenir */
const PHRASES: Entry[] = [
  { wrong: 'hiç bir', right: ['hiçbir'] },
  { wrong: 'her hangi', right: ['herhangi'] },
  { wrong: 'bir kaç', right: ['birkaç'] },
  { wrong: 'bir biri', right: ['birbiri'] },
  { wrong: 'tabi ki', right: ['tabii ki'] },
  { wrong: 'alt yapı', right: ['altyapı'], ref: KIL },
  { wrong: 'baş hekim', right: ['başhekim'], ref: KIL },
  { wrong: 'gece kondu', right: ['gecekondu'], ref: KIL },
  { wrong: 'milletler arası', right: ['milletlerarası'], ref: KIL },
  { wrong: 'olağan üstü', right: ['olağanüstü'], ref: KIL },
  { wrong: 'suç üstü', right: ['suçüstü'], ref: KIL },
  { wrong: 've ya', right: ['veya'], ref: KIL },
  { wrong: 'yüksek öğretim', right: ['yükseköğretim'], ref: KIL },
  { wrong: 'bir takım', right: ['birtakım'], severity: 'uyari', note: '"Bazı, birkaç" anlamındaysa bitişik: "birtakım". "Bir takım oyuncu" anlamında ayrı yazım doğrudur.', ref: KIL },
  { wrong: 'bu gün', right: ['bugün'], severity: 'uyari', note: '"İçinde bulunulan gün" anlamında bitişik yazılır: "bugün".', ref: KIL },
  { wrong: 'göz altı', right: ['gözaltı'], severity: 'uyari', note: 'Hukuki terim anlamında bitişik yazılır: "gözaltı".', ref: KIL },
  {
    wrong: 'bir çok',
    right: ['birçok'],
    severity: 'uyari',
    note: '“Pek çok” anlamındaki “birçok” bitişik yazılır.',
  },
];

function stemSafe(e: Entry): boolean {
  if (e.right.length !== 1 || e.wrong.length < 5) return false;
  const r = e.right[0]!;
  const lw = lastVowel(e.wrong);
  const lr = lastVowel(r);
  if (!lw || !lr) return false;
  const hw = harmonyOf(lw);
  const hr = harmonyOf(lr);
  return hw.back === hr.back && hw.round === hr.round && e.wrong.at(-1) === r.at(-1);
}

const EXACT = new Map(ENTRIES.map((e) => [e.wrong, e]));
const STEMS = ENTRIES.filter((e) => !e.severity && stemSafe(e)).sort((a, b) => b.wrong.length - a.wrong.length);
const PHRASE_MAP = new Map(PHRASES.map((e) => [e.wrong, e]));
/** İlk harfe göre indeks: her kelimede tüm gövdeleri taramamak için */
const STEMS_BY_INITIAL = new Map<string, Entry[]>();
for (const e of STEMS) {
  const k = e.wrong[0]!;
  STEMS_BY_INITIAL.set(k, [...(STEMS_BY_INITIAL.get(k) ?? []), e]);
}

function makeIssue(start: number, end: number, text: string, e: Entry, rights: string[]): Issue {
  return {
    ruleId: 'yazim.yaygin',
    start,
    end,
    text,
    message: e.note ?? `Doğru yazımı: “${rights[0]}”.`,
    severity: e.severity ?? 'hata',
    category: 'yazim',
    suggestions: rights.map((r) => matchCase(text, r)),
    ...(e.ref ? { ref: e.ref } : {}),
  };
}

export const yayginYanlislar: Rule = {
  id: 'yazim.yaygin',
  check({ tokens }) {
    const issues: Issue[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind !== 'word') continue;
      const w = trLower(t.text);

      // İki kelimelik kalıplar
      const sp = tokens[i + 1];
      const t2 = tokens[i + 2];
      if (sp?.kind === 'space' && sp.text === ' ' && t2?.kind === 'word') {
        const ph = PHRASE_MAP.get(`${w} ${trLower(t2.text)}`);
        if (ph) {
          const text = t.text + sp.text + t2.text;
          issues.push(makeIssue(t.start, t2.end, text, ph, ph.right));
          i += 2;
          continue;
        }
      }

      const exact = EXACT.get(w);
      if (exact) {
        issues.push(makeIssue(t.start, t.end, t.text, exact, exact.right));
        continue;
      }

      // Kesme işaretli özel ad eki ("Orjinal'den") gövdeyi ayırır; yalnızca gövdeye bak
      for (const e of STEMS_BY_INITIAL.get(w[0]!) ?? []) {
        if (!w.startsWith(e.wrong)) continue;
        const rest = w.slice(e.wrong.length);
        if (rest.length === 0 || rest.length > 10 || !/^['’]?\p{Ll}+$/u.test(rest)) continue;
        const restOrig = t.text.slice(t.text.length - rest.length);
        issues.push(makeIssue(t.start, t.end, t.text, e, [e.right[0]! + restOrig]));
        break;
      }
    }
    return issues;
  },
};
