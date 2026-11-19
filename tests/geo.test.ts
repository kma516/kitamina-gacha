import { describe, expect, it } from "vitest";
import { areaOf, canUseCurrentLocation, distanceM, distanceToBboxM, nearestArea, walkMinutes } from "../src/geo";
import { AREAS } from "../src/areas";

describe("distanceM", () => {
  it("同じ点は0", () => {
    expect(distanceM({ lat: 34.7, lon: 135.5 }, { lat: 34.7, lon: 135.5 })).toBe(0);
  });
  it("大阪駅〜なんば駅は約4.4km", () => {
    const d = distanceM(AREAS.kita.station, AREAS.minami.station);
    expect(d).toBeGreaterThan(4300);
    expect(d).toBeLessThan(4500);
  });
  it("緯度0.001度は約111m", () => {
    expect(distanceM({ lat: 34.7, lon: 135.5 }, { lat: 34.701, lon: 135.5 })).toBeCloseTo(111.2, 0);
  });
});

describe("walkMinutes", () => {
  it("直線距離×1.3÷80 を切り上げる", () => {
    const a = { lat: 34.7, lon: 135.5 };
    const b = { lat: 34.701, lon: 135.5 }; // 約111.2m → 144.6m → 1.8分 → 2分
    expect(walkMinutes(a, b)).toBe(2);
  });
  it("同じ点は0分", () => {
    expect(walkMinutes(AREAS.kita.station, AREAS.kita.station)).toBe(0);
  });
  it("大阪駅〜なんば駅は70分前後", () => {
    const m = walkMinutes(AREAS.kita.station, AREAS.minami.station);
    expect(m).toBeGreaterThanOrEqual(70);
    expect(m).toBeLessThanOrEqual(74);
  });
});

describe("エリア判定", () => {
  it("駅はそれぞれのエリアに入る", () => {
    expect(areaOf(AREAS.kita.station)).toBe("kita");
    expect(areaOf(AREAS.minami.station)).toBe("minami");
  });
  it("中崎町・日本橋がエリアに入る", () => {
    expect(areaOf({ lat: 34.7075, lon: 135.504 })).toBe("kita");
    expect(areaOf({ lat: 34.6585, lon: 135.506 })).toBe("minami");
  });
  it("bbox内の距離は0", () => {
    expect(distanceToBboxM(AREAS.kita.station, AREAS.kita.bbox)).toBe(0);
  });
  it("本町あたりはミナミに近く、2km以内なので現在地が使える", () => {
    const honmachi = { lat: 34.6823, lon: 135.4985 };
    expect(nearestArea(honmachi).area).toBe("minami");
    expect(canUseCurrentLocation(honmachi)).toBe(true);
  });
  it("京都駅からは現在地を使わない", () => {
    expect(canUseCurrentLocation({ lat: 34.9858, lon: 135.7588 })).toBe(false);
  });
});
