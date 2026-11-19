import type { AreaId, Bbox, Genre, PriceLevel, Spot } from "../src/types";
import { distanceM, inBbox } from "../src/geo";

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type Override = Partial<
  Pick<Spot, "name" | "genre" | "indoor" | "priceLevel" | "priceText" | "website">
> & { exclude?: boolean; reason?: string };

const FOOD_AMENITIES = new Set([
  "restaurant", "cafe", "fast_food", "bar", "pub", "izakaya", "food_court",
  "ice_cream", "biergarten", "bbq",
]);
const ADULT_AMENITIES = new Set([
  "nightclub", "stripclub", "love_hotel", "brothel", "swingerclub", "gambling", "casino",
]);
const ADULT_SHOPS = new Set(["erotic", "adult"]);
const FITNESS_SPORTS = /(^|;)\s*(fitness|yoga|pilates|aerobics|crossfit)\s*($|;)/;
const FITNESS_NAMES =
  /フィットネス|ジム|ヨガ|ピラティス|パーソナル|スポーツクラブ|スポーツオアシス|コナミスポーツ|ルネサンス|ティップネス|道場|fitness|gym|yoga|chocozap|エニタイム|カーブス/i;
const NOT_BATH_NAMES = /エステ|マッサージ|リラクゼーション/;

/** Overpass QL のフィルタ部分（エリアのbboxで絞る） */
export function buildQuery([s, w, n, e]: Bbox): string {
  const b = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:120];
(
  nwr["amenity"~"^(karaoke_box|cinema|internet_cafe|planetarium|music_venue|theatre|public_bath)$"]${b};
  nwr["leisure"~"^(amusement_arcade|bowling_alley|escape_game|sports_centre|park)$"]${b};
  nwr["sport"~"billiards|darts|climbing"]${b};
  nwr["tourism"~"^(museum|gallery|attraction|viewpoint)$"]${b};
  nwr["shop"~"^(books|anime|games|video_games|model|second_hand)$"]${b};
  nwr["shop"="clothes"]["second_hand"~"^(only|yes)$"]${b};
);
out tags center;`;
}

const hasSport = (tags: Record<string, string>, sport: string) =>
  (tags.sport ?? "").split(";").map((s) => s.trim()).includes(sport);

/** 除外対象（飲食店・成人向け）なら理由を返す */
export function exclusionReason(tags: Record<string, string>): string | null {
  if (tags.amenity && FOOD_AMENITIES.has(tags.amenity)) return "food";
  if (tags.cuisine) return "food";
  if (tags.amenity && ADULT_AMENITIES.has(tags.amenity)) return "adult";
  if (tags.shop && ADULT_SHOPS.has(tags.shop)) return "adult";
  if (tags.leisure === "adult_gaming_centre") return "adult";
  if (tags.tourism === "hotel" || tags.tourism === "love_hotel") return "adult";
  if (tags.access === "private" || tags.access === "no") return "private";
  return null;
}

/** タグからジャンルIDを判定する。該当しなければ null */
export function classify(tags: Record<string, string>): string | null {
  if (exclusionReason(tags)) return null;
  const { amenity, leisure, tourism, shop } = tags;

  // 登山用品店などの shop に sport=climbing が付いていることがあるので、shop は対象外
  if (!shop && hasSport(tags, "climbing")) return "climbing";
  if (!shop && (hasSport(tags, "billiards") || hasSport(tags, "darts"))) return "billiards_darts";

  switch (amenity) {
    case "karaoke_box": return "karaoke";
    case "cinema": return "cinema";
    case "internet_cafe": return "manga_cafe";
    case "planetarium": return "planetarium";
    case "music_venue": return "music_venue";
    case "theatre": return "theatre";
    case "public_bath":
      return NOT_BATH_NAMES.test(tags["name:ja"] ?? tags.name ?? "") ? null : "bath";
  }
  switch (leisure) {
    case "amusement_arcade": return "arcade";
    case "bowling_alley": return "bowling";
    case "escape_game": return "escape_game";
    case "sports_centre": {
      if (FITNESS_SPORTS.test(tags.sport ?? "")) return null;
      const name = tags["name:ja"] ?? tags.name ?? "";
      if (FITNESS_NAMES.test(name)) return null;
      return "sports";
    }
  }
  if (tourism === "museum" || tourism === "gallery") return "museum";
  switch (shop) {
    case "books": return "books";
    case "anime": case "games": case "video_games": case "model": return "subculture";
    case "second_hand": return "vintage";
    case "clothes":
      if (tags.second_hand === "only" || tags.second_hand === "yes") return "vintage";
  }
  if (leisure === "park") return "park";
  if (tourism === "attraction" || tourism === "viewpoint") return "spot";
  return null;
}

export function priceLevelFromYen(yen: number): PriceLevel {
  if (yen <= 0) return 0;
  if (yen <= 1000) return 1;
  if (yen <= 3000) return 2;
  return 3;
}

/** fee / charge から料金を出す。使えなければ null */
export function priceFromTags(
  tags: Record<string, string>,
): { priceLevel: PriceLevel; priceText: string } | null {
  const charge = tags.charge?.trim();
  if (charge) {
    const m = charge.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
    if (m) {
      const yen = Number(m[1]);
      const text = charge
        .replace(/(\d[\d,]*)\s*(JPY|yen|円)/gi, (_, n) => `${Number(n.replace(/,/g, "")).toLocaleString("ja-JP")}円`)
        .trim();
      return { priceLevel: priceLevelFromYen(yen), priceText: text };
    }
  }
  if (tags.fee === "no") return { priceLevel: 0, priceText: "無料" };
  return null;
}

export function spotName(tags: Record<string, string>): string | null {
  const name = (tags["name:ja"] ?? tags.name ?? "").trim();
  return name || null;
}

export function toSpot(el: OsmElement, area: AreaId, genres: Map<string, Genre>): Spot | null {
  const tags = el.tags ?? {};
  const name = spotName(tags);
  if (!name) return null;
  const genreId = classify(tags);
  if (!genreId) return null;
  const genre = genres.get(genreId);
  if (!genre) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;

  const osmPrice = priceFromTags(tags);
  const website = tags.website ?? tags["contact:website"] ?? tags.url;
  const spot: Spot = {
    id: `osm:${el.type}/${el.id}`,
    name,
    genre: genreId,
    area,
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
    indoor: genre.indoor,
    priceLevel: osmPrice?.priceLevel ?? genre.priceLevel,
    priceText: osmPrice?.priceText ?? genre.priceText,
    priceSource: osmPrice ? "osm" : "genre",
    osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
  };
  if (website && /^https:\/\/[^\s]+$/.test(website)) spot.website = website;
  return spot;
}

/**
 * 同一名称で50m以内の重複を1件にまとめる（websiteありを優先）。
 * 商店街のように長い通りが複数wayに分かれるケースのため、同名・同ジャンルなら sameGenreRadiusM まで広げる。
 */
export function dedupe(spots: Spot[], radiusM = 50, sameGenreRadiusM = 400): Spot[] {
  const sorted = [...spots].sort(
    (a, b) => Number(!!b.website) - Number(!!a.website) || a.id.localeCompare(b.id),
  );
  const kept: Spot[] = [];
  for (const s of sorted) {
    const dup = kept.some((k) => {
      if (k.name !== s.name) return false;
      const d = distanceM(k, s);
      return d <= radiusM || (k.genre === s.genre && d <= sameGenreRadiusM);
    });
    if (!dup) kept.push(s);
  }
  return kept;
}

export function applyOverrides(spots: Spot[], overrides: Record<string, Override>): Spot[] {
  const out: Spot[] = [];
  for (const s of spots) {
    const o = overrides[s.id];
    if (!o) {
      out.push(s);
      continue;
    }
    if (o.exclude) continue;
    const { exclude: _e, reason: _r, ...fields } = o;
    out.push({ ...s, ...fields, priceSource: "manual" });
  }
  return out;
}

export function normalize(
  elementsByArea: Record<AreaId, OsmElement[]>,
  bboxes: Record<AreaId, Bbox>,
  genreList: Genre[],
  overrides: Record<string, Override>,
): Spot[] {
  const genres = new Map(genreList.map((g) => [g.id, g]));
  const seen = new Set<string>();
  const spots: Spot[] = [];
  for (const area of Object.keys(elementsByArea) as AreaId[]) {
    for (const el of elementsByArea[area]) {
      const spot = toSpot(el, area, genres);
      if (!spot || seen.has(spot.id)) continue;
      if (!inBbox(spot, bboxes[area])) continue;
      seen.add(spot.id);
      spots.push(spot);
    }
  }
  return applyOverrides(dedupe(spots), overrides).sort((a, b) => a.id.localeCompare(b.id));
}
