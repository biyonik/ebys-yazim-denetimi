/** Geliştirme derlemesi mi (build.mjs --dev). Üretimde false; ilgili kod derlemede silinir. */
declare const __DEV__: boolean;

/**
 * Kullandığımız chrome.* API yüzeyinin asgari tanımı. @types/chrome yerine bilinçli olarak dar
 * tutuldu: eklentinin hangi tarayıcı API'lerine dokunduğu tek bakışta görülsün (izin: yok).
 */
declare namespace chrome {
  namespace runtime {
    const id: string;
    function getURL(path: string): string;
    function getManifest(): { name: string; version: string; description?: string };
    function sendMessage(message: unknown): Promise<unknown>;
    interface MessageSender {
      id?: string;
      tab?: { id?: number; index: number; windowId: number };
    }
    const onMessage: {
      addListener(cb: (message: unknown, sender: MessageSender, sendResponse: (r?: unknown) => void) => boolean | void): void;
    };
  }
  namespace tabs {
    function create(p: { url: string; index?: number; openerTabId?: number; windowId?: number; active?: boolean }): Promise<unknown>;
  }
}
