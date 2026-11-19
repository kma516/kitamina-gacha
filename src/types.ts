export type AreaId = "kita" | "minami";
export type PriceLevel = 0 | 1 | 2 | 3;
export type GroupFit = "solo" | "group" | "both";

export type LatLon = { lat: number; lon: number };

/** 南, 西, 北, 東 */
export type Bbox = [number, number, number, number];

export type Area = {
  id: AreaId;
  name: string;
  short: string;
  bbox: Bbox;
  station: LatLon & { name: string };
};

export type Genre = {
  id: string;
  name: string;
  emoji: string;
  indoor: boolean;
  priceLevel: PriceLevel;
  priceText: string;
  group: GroupFit;
  enabled: boolean;
};

export type Spot = {
  id: string;
  name: string;
  genre: string;
  area: AreaId;
  lat: number;
  lon: number;
  indoor: boolean;
  priceLevel: PriceLevel;
  priceText: string;
  priceSource: "osm" | "genre" | "manual";
  osmUrl: string;
  website?: string;
};

export type Odai = Record<string, string[]> & { common: string[] };
