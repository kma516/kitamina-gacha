import type { Area, AreaId } from "./types";

export const AREAS: Record<AreaId, Area> = {
  kita: {
    id: "kita",
    name: "キタ（梅田）",
    short: "キタ",
    bbox: [34.69, 135.487, 34.712, 135.509],
    station: { name: "大阪駅", lat: 34.7025, lon: 135.4959 },
  },
  minami: {
    id: "minami",
    name: "ミナミ（難波）",
    short: "ミナミ",
    bbox: [34.655, 135.493, 34.68, 135.51],
    station: { name: "なんば駅", lat: 34.6627, lon: 135.5016 },
  },
};

export const AREA_IDS: AreaId[] = ["kita", "minami"];
