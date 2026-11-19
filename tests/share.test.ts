import { describe, expect, it } from "vitest";
import { buildShareQuery, buildShareUrl, expandId, parseShareQuery, shortenId } from "../src/share";

describe("ID短縮", () => {
  it("node/way/relation を n/w/r に", () => {
    expect(shortenId("osm:node/123")).toBe("n123");
    expect(shortenId("osm:way/456")).toBe("w456");
    expect(shortenId("osm:relation/7")).toBe("r7");
  });
  it("往復で元に戻る", () => {
    for (const id of ["osm:node/1", "osm:way/9876543210", "osm:relation/42"]) {
      expect(expandId(shortenId(id))).toBe(id);
    }
  });
  it("不正な短縮IDは null", () => {
    expect(expandId("x1")).toBeNull();
    expect(expandId("n")).toBeNull();
    expect(expandId("n12a")).toBeNull();
  });
});

describe("共有URL", () => {
  it("キープ一覧を k= と o= にする", () => {
    const q = buildShareQuery({
      mode: "keep",
      items: [
        { spotId: "osm:node/1", odai: 2 },
        { spotId: "osm:way/2", odai: null },
        { spotId: "osm:node/3", odai: 0 },
      ],
    });
    expect(q).toBe("?k=n1,w2,n3&o=2,,0");
  });
  it("お題がひとつもなければ o= を付けない", () => {
    expect(buildShareQuery({ mode: "keep", items: [{ spotId: "osm:node/1", odai: null }] })).toBe("?k=n1");
  });
  it("はしごは c=", () => {
    expect(
      buildShareQuery({ mode: "course", items: [{ spotId: "osm:node/1", odai: 1 }, { spotId: "osm:way/2", odai: 3 }] }),
    ).toBe("?c=n1,w2&o=1,3");
  });
  it("buildShareUrl は既存のクエリやハッシュを捨てる", () => {
    expect(
      buildShareUrl("https://x.pages.dev/?k=n9#a", { mode: "keep", items: [{ spotId: "osm:node/1", odai: null }] }),
    ).toBe("https://x.pages.dev/?k=n1");
  });
  it("生成→解析で同じ内容に戻る", () => {
    const payload = {
      mode: "course" as const,
      items: [
        { spotId: "osm:node/10", odai: 4 },
        { spotId: "osm:way/20", odai: null },
        { spotId: "osm:relation/30", odai: 0 },
      ],
    };
    expect(parseShareQuery(buildShareQuery(payload))).toEqual(payload);
  });
  it("%2C でエンコードされていても読める", () => {
    expect(parseShareQuery("?k=n1%2Cw2")?.items.map((i) => i.spotId)).toEqual(["osm:node/1", "osm:way/2"]);
  });
  it("共有でないクエリは null", () => {
    expect(parseShareQuery("")).toBeNull();
    expect(parseShareQuery("?foo=1")).toBeNull();
    expect(parseShareQuery("?k=")).toBeNull();
  });
  it("不正なIDとお題は捨てる", () => {
    expect(parseShareQuery("?k=n1,zzz,w2&o=1,x,abc")).toEqual({
      mode: "keep",
      items: [
        { spotId: "osm:node/1", odai: 1 },
        { spotId: "osm:way/2", odai: null },
      ],
    });
  });
  it("最大5件", () => {
    expect(parseShareQuery("?k=n1,n2,n3,n4,n5,n6,n7")?.items).toHaveLength(5);
  });
});
