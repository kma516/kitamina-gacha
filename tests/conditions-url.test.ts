import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, formToQuery, queryToForm } from "../src/conditions-url";

describe("条件のURL保存", () => {
  it("既定値ならクエリは空", () => {
    expect(formToQuery(DEFAULT_FORM)).toBe("");
  });
  it("往復で戻る", () => {
    const f = { ...DEFAULT_FORM, area: "kita" as const, walk: null, budget: 0 as const, party: "solo" as const, indoorOnly: true, odai: false };
    expect({ ...DEFAULT_FORM, ...queryToForm(formToQuery(f)) }).toEqual(f);
  });
  it("不正な値は無視", () => {
    expect(queryToForm("?area=tokyo&walk=7&budget=9&party=x")).toEqual({});
  });
});
