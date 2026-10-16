/**
 * Isolated world (içerik betiği) ↔ MAIN world (sayfa) köprü protokolü.
 *
 * Neden iki dünya?
 *  İçerik betikleri sayfanın DOM'unu görür ama JS nesnelerini GÖRMEZ:
 *  window.CKEDITOR isolated world'de undefined'dır. Geri alınabilir düzeltme
 *  için CKEditor API'si (saveSnapshot, updateElement) gerekir; bu yüzden MAIN
 *  world'de çok küçük bir köprü çalıştırıyoruz.
 *
 * Tasarım ilkeleri:
 *  - Köprü METİN TAŞIMAZ. Yalnızca editör adı ve komut adı gider. Belge
 *    içeriği hiçbir zaman sayfanın JS ortamına bizim aracılığımızla sızmaz.
 *  - Mesajlar CustomEvent ile ve detail = JSON string olarak gönderilir:
 *    dünyalar arası nesne paylaşımı tutarsızdır, string her zaman güvenlidir.
 *  - dispatchEvent eşzamanlıdır: "snapshot → değiştir → commit" sırası
 *    garanti altındadır, araya kullanıcı tuşu giremez.
 *  - Sayfa bu olayları taklit edebilir. Bu yüzden köprüden gelen olaylar
 *    yalnızca "yeniden denetle" tetikler; hiçbir zaman veri olarak güvenilmez.
 */

export const CMD_EVENT = 'ebys-yazim:cmd';
export const EVT_EVENT = 'ebys-yazim:evt';

export type BridgeCommand =
  | { op: 'snapshot'; editor: string }
  | { op: 'commit'; editor: string }
  | { op: 'focus'; editor: string }
  | { op: 'undo'; editor: string };

export type BridgeEvent =
  | { type: 'ready'; editor: string }
  | { type: 'contentDom'; editor: string }
  | { type: 'change'; editor: string }
  | { type: 'mode'; editor: string; mode: string };
