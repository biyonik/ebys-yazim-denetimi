/**
 * Çekirdek tipler. Bu katman DOM'u, tarayıcıyı ve CKEditor'ü bilmez:
 * yalnızca düz metin alır, sorun listesi döndürür. Böylece kurallar
 * Node üzerinde birim testiyle doğrulanabilir ve ileride WASM motoru
 * aynı sözleşmeye takılabilir.
 */

/** hata: kesin yanlış · uyari: bağlama bağlı, insan karar vermeli · oneri: üslup/biçim */
export type Severity = 'hata' | 'uyari' | 'oneri';

export type Category = 'yazim' | 'kural' | 'noktalama' | 'bicim';

export interface Issue {
  ruleId: string;
  /** Düz metin üzerinde [start, end) aralığı */
  start: number;
  end: number;
  /** Sorunun tespit edildiği andaki metin; uygulamadan önce bayatlık kontrolü için */
  text: string;
  message: string;
  severity: Severity;
  category: Category;
  suggestions: string[];
  /**
   * false: tek öneri olsa bile "Tümünü düzelt" uygulamaz. Tahmine dayalı
   * önerilerde (düzenleme mesafesi) kullanılır: "gönderilmş" için tek aday
   * bulunması, o adayın kastedilen kelime olduğunu garanti etmez.
   */
  autoFix?: boolean;
  /** Dayanak: "Yönetmelik m.16(7)", "Kılavuz §13.6", "TDK Yazım Kılavuzu" — balonda gösterilir */
  ref?: string;
}

export type TokenKind = 'word' | 'number' | 'punct' | 'space' | 'break' | 'other';

export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
}

/** Muhatap: EBYS'de "Gereği" / "Bilgi" alanında seçilen ya da hitap satırında görünen idare/birim */
export interface Recipient {
  text: string;
  role: 'gereği' | 'bilgi' | 'muhatap';
}

/**
 * Editörün DIŞINDAKİ belge bilgisi: EBYS sayfasının başlığından ve dağıtım alanlarından okunur
 * (content/doc-meta.ts). Çekirdek DOM'u bilmez; yalnızca bu düz metinleri alır.
 */
export interface DocMeta {
  /** Başlık satırları, T.C.'den sonra: ["KARESİ KAYMAKAMLIĞI", "İlçe Millî Eğitim Müdürlüğü"] */
  sender?: string[];
  recipients?: Recipient[];
}

export interface RuleContext {
  text: string;
  tokens: Token[];
  meta?: DocMeta;
}

export interface Rule {
  id: string;
  check(ctx: RuleContext): Issue[];
}

/**
 * Düz metindeki blok ayırıcıları. TextIndex bunları üretir, tokenizer
 * 'break' token'ına çevirir. Tablo hücresini paragraftan ayırmamızın
 * sebebi: hücre başındaki küçük harf ("adet", "kg") hata değildir.
 */
export const SEP_BLOCK = '\n';
export const SEP_CELL = '\t';
/** contenteditable=false parçalar (ör. EBYS etiket alanları) için yer tutucu */
export const OBJ_CHAR = '\uFFFC';
