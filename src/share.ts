/**
 * 共有URL
 *   キープ一覧: ?k=n123,w456&o=2,,0
 *   はしごコース: ?c=n123,w456&o=1,3
 * spotId は "osm:node/123" → "n123"（way=w, relation=r）に短縮。
 * o はお題index（odaiList 上の位置）。お題なしは空。
 */

export type ShareMode = "keep" | "course";
export type ShareItem = { spotId: string; odai: number | null };
export type SharePayload = { mode: ShareMode; items: ShareItem[] };

export const MAX_SHARE_ITEMS = 5;

const TYPE_TO_SHORT = { node: "n", way: "w", relation: "r" } as const;
const SHORT_TO_TYPE = { n: "node", w: "way", r: "relation" } as const;

export function shortenId(spotId: string): string {
  const m = spotId.match(/^osm:(node|way|relation)\/(\d+)$/);
  if (!m) throw new Error(`不正なspotId: ${spotId}`);
  return TYPE_TO_SHORT[m[1] as keyof typeof TYPE_TO_SHORT] + m[2];
}

export function expandId(short: string): string | null {
  const m = short.match(/^([nwr])(\d{1,15})$/);
  if (!m) return null;
  return `osm:${SHORT_TO_TYPE[m[1] as keyof typeof SHORT_TO_TYPE]}/${m[2]}`;
}

export function buildShareQuery(payload: SharePayload): string {
  const items = payload.items.slice(0, MAX_SHARE_ITEMS);
  const params = new URLSearchParams();
  params.set(payload.mode === "course" ? "c" : "k", items.map((i) => shortenId(i.spotId)).join(","));
  if (items.some((i) => i.odai !== null)) {
    params.set("o", items.map((i) => (i.odai === null ? "" : String(i.odai))).join(","));
  }
  // URLSearchParams はカンマを %2C にするので戻して短く読みやすくする
  return "?" + params.toString().replace(/%2C/g, ",");
}

export function buildShareUrl(base: string, payload: SharePayload): string {
  const url = new URL(base);
  return `${url.origin}${url.pathname}${buildShareQuery(payload)}`;
}

/** 共有URLのクエリを解析する。共有でなければ null。不正なIDは捨てる */
export function parseShareQuery(search: string): SharePayload | null {
  const params = new URLSearchParams(search);
  const course = params.get("c");
  const keep = params.get("k");
  const raw = course ?? keep;
  if (raw === null) return null;
  const mode: ShareMode = course !== null ? "course" : "keep";
  const odai = (params.get("o") ?? "").split(",");
  const items: ShareItem[] = [];
  raw.split(",").forEach((short, i) => {
    const spotId = expandId(short.trim());
    if (!spotId) return;
    const o = odai[i]?.trim() ?? "";
    const n = /^\d{1,3}$/.test(o) ? Number(o) : null;
    items.push({ spotId, odai: n });
  });
  if (items.length === 0) return null;
  return { mode, items: items.slice(0, MAX_SHARE_ITEMS) };
}
