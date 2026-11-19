import type { AreaId, Bbox, LatLon } from "./types";
import { AREAS, AREA_IDS } from "./areas";

const EARTH_RADIUS_M = 6371008.8;
/** 直線距離を道のりに換算する係数 */
export const DETOUR_FACTOR = 1.3;
/** 徒歩の速さ（m/分） */
export const WALK_SPEED_M_PER_MIN = 80;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** ハバーサイン距離（m） */
export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 徒歩時間（分）= 直線距離 × 1.3 ÷ 80m/分、切り上げ */
export function walkMinutes(a: LatLon, b: LatLon): number {
  return Math.ceil((distanceM(a, b) * DETOUR_FACTOR) / WALK_SPEED_M_PER_MIN);
}

export function inBbox(p: LatLon, [s, w, n, e]: Bbox): boolean {
  return p.lat >= s && p.lat <= n && p.lon >= w && p.lon <= e;
}

/** bboxまでの最短距離（m）。中にいれば0 */
export function distanceToBboxM(p: LatLon, bbox: Bbox): number {
  const [s, w, n, e] = bbox;
  const nearest = {
    lat: Math.min(Math.max(p.lat, s), n),
    lon: Math.min(Math.max(p.lon, w), e),
  };
  return distanceM(p, nearest);
}

/** 現在地がどのエリアに属するか（bbox内）。どちらでもなければ null */
export function areaOf(p: LatLon): AreaId | null {
  return AREA_IDS.find((id) => inBbox(p, AREAS[id].bbox)) ?? null;
}

/** 現在地に近い方のエリアと、そのbboxまでの距離 */
export function nearestArea(p: LatLon): { area: AreaId; distanceM: number } {
  let best: { area: AreaId; distanceM: number } | null = null;
  for (const id of AREA_IDS) {
    const d = distanceToBboxM(p, AREAS[id].bbox);
    if (!best || d < best.distanceM) best = { area: id, distanceM: d };
  }
  return best!;
}

/** 現在地を起点に使えるか（どちらかのbboxから2km未満） */
export const MAX_ORIGIN_DISTANCE_M = 2000;
export function canUseCurrentLocation(p: LatLon): boolean {
  return nearestArea(p).distanceM < MAX_ORIGIN_DISTANCE_M;
}
