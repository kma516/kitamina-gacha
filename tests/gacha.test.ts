import { describe, expect, it } from "vitest";
import {
  type Conditions,
  filterSpots,
  nextHop,
  odaiList,
  pick,
  pickOdai,
  rerollHop,
  suggestRelaxations,
} from "../src/gacha";
import { walkMinutes } from "../src/geo";
import { AREAS } from "../src/areas";
import type { Odai } from "../src/types";
import { genres, seeded, seq01, spot } from "./fixtures";

const KITA = AREAS.kita.station;
const MINAMI = AREAS.minami.station;
/** 起点から北へ meters ずらした点 */
const north = (p: { lat: number; lon: number }, meters: number) => ({ lat: p.lat + meters / 111195, lon: p.lon });

const base: Conditions = {
  area: "any",
  walk: null,
  budget: null,
  party: "group",
  indoorOnly: false,
  excludedGenres: [],
};

describe("filterSpots", () => {
  const karaoke = spot({ genre: "karaoke", ...north(KITA, 300) }); // 5分
  const park = spot({ genre: "park", ...north(KITA, 900) }); // 15分
  const escape = spot({ genre: "escape_game", ...north(KITA, 100) });
  const books = spot({ genre: "books", ...north(KITA, 100) }); // solo
  const minamiArcade = spot({ genre: "arcade", area: "minami", ...north(MINAMI, 100) });
  const all = [karaoke, park, escape, books, minamiArcade];
  const ids = (c: Conditions, origin: Parameters<typeof filterSpots>[3] = null) =>
    filterSpots(all, genres, c, origin).map((x) => x.spot.id).sort();

  it("エリアで絞る", () => {
    expect(ids({ ...base, area: "minami" })).toEqual([minamiArcade.id]);
  });
  it("徒歩で絞る（駅起点は各スポットのエリアの駅から）", () => {
    expect(ids({ ...base, walk: 5 })).toEqual([karaoke.id, escape.id, minamiArcade.id].sort());
    expect(ids({ ...base, walk: 15 })).toContain(park.id);
  });
  it("現在地起点だとそこからの距離で測る", () => {
    // キタにいる時、ミナミのスポットは遠い
    expect(ids({ ...base, walk: 20 }, KITA)).not.toContain(minamiArcade.id);
  });
  it("予算で絞る", () => {
    expect(ids({ ...base, budget: 0 })).toEqual([park.id]); // books は solo なので group では出ない
    expect(ids({ ...base, budget: 1 })).not.toContain(escape.id);
  });
  it("人数で絞る（both はどちらでも出る）", () => {
    const solo = ids({ ...base, party: "solo" });
    expect(solo).toContain(books.id);
    expect(solo).toContain(karaoke.id);
    expect(solo).not.toContain(escape.id);
    expect(ids(base)).not.toContain(books.id);
  });
  it("屋内のみ", () => {
    expect(ids({ ...base, indoorOnly: true })).not.toContain(park.id);
  });
  it("除外ジャンル", () => {
    expect(ids({ ...base, excludedGenres: ["karaoke"] })).not.toContain(karaoke.id);
  });
  it("徒歩時間を返す", () => {
    const c = filterSpots([karaoke], genres, base, null)[0];
    expect(c.walk).toBe(walkMinutes(KITA, karaoke));
  });
});

describe("pick", () => {
  it("ジャンルを均等に選ぶ（件数の多いジャンルに偏らない）", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      spot: spot({ genre: "park", lat: 34.7 + i * 1e-5, lon: 135.5 }),
      walk: 1,
    }));
    const one = { spot: spot({ genre: "karaoke", lat: 34.7, lon: 135.5 }), walk: 1 };
    const rand = seeded(42);
    let karaoke = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) if (pick([...many, one], [], rand)!.spot.genre === "karaoke") karaoke++;
    expect(karaoke / N).toBeGreaterThan(0.45);
    expect(karaoke / N).toBeLessThan(0.55);
  });

  it("直近に出たスポットは避ける", () => {
    const a = { spot: spot({ genre: "park", lat: 34.7, lon: 135.5 }), walk: 1 };
    const b = { spot: spot({ genre: "park", lat: 34.7, lon: 135.5 }), walk: 1 };
    for (let i = 0; i < 20; i++) expect(pick([a, b], [a.spot.id], Math.random)!.spot.id).toBe(b.spot.id);
  });

  it("避けると0件なら避けない", () => {
    const a = { spot: spot({ genre: "park", lat: 34.7, lon: 135.5 }), walk: 1 };
    expect(pick([a], [a.spot.id], Math.random)!.spot.id).toBe(a.spot.id);
  });

  it("6回以上前に出たものは避けない", () => {
    const a = { spot: spot({ genre: "park", lat: 34.7, lon: 135.5 }), walk: 1 };
    const b = { spot: spot({ genre: "park", lat: 34.7, lon: 135.5 }), walk: 1 };
    const recent = [a.spot.id, "x1", "x2", "x3", "x4", "x5"];
    expect(pick([a, b], recent, seq01(0, 0))!.spot.id).toBe(a.spot.id);
  });

  it("候補0件なら null", () => {
    expect(pick([], [], Math.random)).toBeNull();
  });
});

describe("suggestRelaxations", () => {
  it("徒歩を何分にすれば何件あるか教える", () => {
    const s = [spot({ genre: "karaoke", ...north(KITA, 900) })]; // 15分
    const r = suggestRelaxations(s, genres, { ...base, walk: 5 }, null);
    expect(r[0]).toMatchObject({ label: "徒歩を15分にする", count: 1, patch: { walk: 15 } });
  });
  it("予算・屋内・除外も候補になる", () => {
    const s = [spot({ genre: "park", ...north(KITA, 100), priceLevel: 0 })];
    const r = suggestRelaxations(s, genres, { ...base, indoorOnly: true, excludedGenres: ["park"] }, null);
    expect(r).toEqual([]); // どちらか片方だけ緩めても出ない
    const r2 = suggestRelaxations(s, genres, { ...base, indoorOnly: true }, null);
    expect(r2.map((x) => x.label)).toEqual(["屋内のみをオフにする"]);
  });
});

describe("nextHop（はしご）", () => {
  const first = spot({ genre: "karaoke", ...north(KITA, 0) });
  it("直前から徒歩10分以内・既出ジャンル以外から選ぶ", () => {
    const sameGenre = spot({ genre: "karaoke", ...north(KITA, 100) });
    const near = spot({ genre: "arcade", ...north(KITA, 300) });
    const far = spot({ genre: "cinema", ...north(KITA, 1500) });
    for (let i = 0; i < 20; i++) {
      const r = nextHop([first, sameGenre, near, far], genres, base, [first], [], Math.random);
      expect(r?.spot.id).toBe(near.id);
      expect(r?.widened).toBe(false);
    }
  });
  it("10分以内になければ15分まで広げる", () => {
    const mid = spot({ genre: "arcade", ...north(KITA, 800) }); // 13分
    const r = nextHop([first, mid], genres, base, [first], [], Math.random);
    expect(r?.spot.id).toBe(mid.id);
    expect(r?.widened).toBe(true);
  });
  it("15分以内にもなければ null", () => {
    const far = spot({ genre: "arcade", ...north(KITA, 1500) });
    expect(nextHop([first, far], genres, base, [first], [], Math.random)).toBeNull();
  });
  it("エリア条件は無視して直前から測る（エリアをまたいでもよい）", () => {
    const r = nextHop(
      [first, spot({ genre: "arcade", area: "minami", ...north(KITA, 200) })],
      genres,
      { ...base, area: "kita" },
      [first],
      [],
      Math.random,
    );
    expect(r).not.toBeNull();
  });
  it("3軒目は1軒目・2軒目のジャンルを両方避ける", () => {
    const second = spot({ genre: "arcade", ...north(KITA, 100) });
    const c1 = spot({ genre: "karaoke", ...north(KITA, 200) });
    const c2 = spot({ genre: "arcade", ...north(KITA, 200) });
    const c3 = spot({ genre: "cinema", ...north(KITA, 200) });
    const r = nextHop([c1, c2, c3], genres, base, [first, second], [], Math.random);
    expect(r?.spot.id).toBe(c3.id);
  });
});

describe("rerollHop", () => {
  it("途中の軒を、他の軒のジャンルを避けて引き直す", () => {
    const a = spot({ genre: "karaoke", ...north(KITA, 0) });
    const b = spot({ genre: "arcade", ...north(KITA, 200) });
    const c = spot({ genre: "cinema", ...north(KITA, 400) });
    const altSameAsA = spot({ genre: "karaoke", ...north(KITA, 250) });
    const alt = spot({ genre: "museum", ...north(KITA, 250) });
    const farFromC = spot({ genre: "park", ...north(KITA, -580) }); // aから10分以内だがcまで15分超
    for (let i = 0; i < 20; i++) {
      const r = rerollHop([a, b, c, altSameAsA, alt, farFromC], genres, base, null, [a, b, c], 1, [], Math.random);
      expect(r?.spot.id).toBe(alt.id);
    }
  });
  it("候補がなければ null", () => {
    const a = spot({ genre: "karaoke", ...north(KITA, 0) });
    const b = spot({ genre: "arcade", ...north(KITA, 200) });
    expect(rerollHop([a, b], genres, base, null, [a, b], 1, [], Math.random)).toBeNull();
  });
});

describe("お題", () => {
  const odai: Odai = { common: ["c0", "c1"], karaoke: ["k0", "k1", "k2"] };
  it("odaiList はジャンル別→共通の順", () => {
    expect(odaiList(odai, "karaoke")).toEqual(["k0", "k1", "k2", "c0", "c1"]);
    expect(odaiList(odai, "park")).toEqual(["c0", "c1"]);
  });
  it("ジャンル別7割・共通3割", () => {
    const rand = seeded(7);
    let specific = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) if (pickOdai(odai, "karaoke", rand)! < 3) specific++;
    expect(specific / N).toBeGreaterThan(0.66);
    expect(specific / N).toBeLessThan(0.74);
  });
  it("ジャンル別がなければ共通から", () => {
    const i = pickOdai(odai, "park", Math.random)!;
    expect(odaiList(odai, "park")[i]).toMatch(/^c/);
  });
});
