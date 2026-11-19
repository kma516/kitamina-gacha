import { describe, expect, it } from "vitest";
import { applyOverrides, classify, dedupe, normalize, priceFromTags } from "../scripts/normalize";
import type { Genre } from "../src/types";
import genreList from "../data/genres.json";
import spotsJson from "../data/spots.json";
import { spot } from "./fixtures";

describe("classify", () => {
  it("基本のタグ", () => {
    expect(classify({ amenity: "karaoke_box" })).toBe("karaoke");
    expect(classify({ leisure: "amusement_arcade" })).toBe("arcade");
    expect(classify({ shop: "anime" })).toBe("subculture");
    expect(classify({ shop: "clothes", second_hand: "only" })).toBe("vintage");
    expect(classify({ shop: "clothes" })).toBeNull();
    expect(classify({ tourism: "viewpoint" })).toBe("spot");
  });
  it("飲食店は他ジャンルのタグがあっても除外", () => {
    expect(classify({ amenity: "bar", sport: "darts" })).toBeNull();
    expect(classify({ leisure: "amusement_arcade", cuisine: "coffee_shop" })).toBeNull();
  });
  it("成人向けは除外", () => {
    expect(classify({ amenity: "nightclub" })).toBeNull();
    expect(classify({ shop: "erotic" })).toBeNull();
  });
  it("sports_centre は climbing と fitness を分ける", () => {
    expect(classify({ leisure: "sports_centre", sport: "climbing" })).toBe("climbing");
    expect(classify({ leisure: "sports_centre", sport: "fitness" })).toBeNull();
    expect(classify({ leisure: "sports_centre", name: "エニタイムフィットネス梅田" })).toBeNull();
    expect(classify({ leisure: "sports_centre", sport: "table_tennis" })).toBe("sports");
  });
  it("登山用品店の sport=climbing はボルダリングにしない", () => {
    expect(classify({ shop: "outdoor", sport: "climbing" })).toBeNull();
  });
});

describe("priceFromTags", () => {
  it("fee=no は無料", () => {
    expect(priceFromTags({ fee: "no" })).toEqual({ priceLevel: 0, priceText: "無料" });
  });
  it("charge の金額からレベルを出す", () => {
    expect(priceFromTags({ charge: "490 JPY" })).toEqual({ priceLevel: 1, priceText: "490円" });
    expect(priceFromTags({ charge: "2,500円" })?.priceLevel).toBe(2);
  });
  it("情報がなければ null", () => {
    expect(priceFromTags({ fee: "yes" })).toBeNull();
    expect(priceFromTags({})).toBeNull();
  });
});

describe("dedupe / overrides", () => {
  it("同名で50m以内は1件に", () => {
    const a = spot({ genre: "karaoke", name: "X", lat: 34.7, lon: 135.5 });
    const b = spot({ genre: "arcade", name: "X", lat: 34.7003, lon: 135.5 }); // 33m
    const c = spot({ genre: "arcade", name: "X", lat: 34.71, lon: 135.5 }); // 1km
    expect(dedupe([a, b, c])).toHaveLength(2);
  });
  it("overrides で除外・上書きし、priceSource を manual に", () => {
    const a = spot({ genre: "karaoke", lat: 34.7, lon: 135.5 });
    const b = spot({ genre: "karaoke", lat: 34.7, lon: 135.5 });
    const out = applyOverrides([a, b], {
      [a.id]: { exclude: true, reason: "閉店" },
      [b.id]: { priceText: "1時間 500円", priceLevel: 1 },
    });
    expect(out).toEqual([{ ...b, priceText: "1時間 500円", priceLevel: 1, priceSource: "manual" }]);
  });
  it("名前なしは捨てる", () => {
    const out = normalize(
      { kita: [{ type: "node", id: 1, lat: 34.7, lon: 135.5, tags: { amenity: "karaoke_box" } }], minami: [] },
      { kita: [34.69, 135.48, 34.72, 135.51], minami: [0, 0, 0, 0] },
      genreList as Genre[],
      {},
    );
    expect(out).toEqual([]);
  });
});

describe("生成済み data/spots.json", () => {
  const genreIds = new Set((genreList as Genre[]).map((g) => g.id));
  it("名前があり、ジャンルが定義済み", () => {
    for (const s of spotsJson) {
      expect(s.name.trim()).not.toBe("");
      expect(genreIds.has(s.genre)).toBe(true);
    }
  });
  it("IDが重複していない", () => {
    expect(new Set(spotsJson.map((s) => s.id)).size).toBe(spotsJson.length);
  });
});
