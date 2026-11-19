import type { AreaId, Genre, LatLon, Odai, PriceLevel, Spot } from "./types";
import { AREAS } from "./areas";
import { walkMinutes } from "./geo";

export type Rand = () => number;

export type WalkLimit = 5 | 10 | 15 | 20 | null;
/** 0=無料だけ, 1=〜¥, 2=〜¥¥, null=気にしない */
export type BudgetLimit = 0 | 1 | 2 | null;
export type Party = "solo" | "group";

export type Conditions = {
  area: AreaId | "any";
  walk: WalkLimit;
  budget: BudgetLimit;
  party: Party;
  indoorOnly: boolean;
  excludedGenres: string[];
};

/**
 * 起点。現在地なら座標、駅起点なら null（各スポットのエリアの起点駅から測る）
 */
export type Origin = LatLon | null;

export type Candidate = { spot: Spot; walk: number };

export const WALK_STEPS: Exclude<WalkLimit, null>[] = [5, 10, 15, 20];
export const RECENT_AVOID = 5;

export function originPoint(origin: Origin, spot: Spot): LatLon {
  return origin ?? AREAS[spot.area].station;
}

export function walkFrom(origin: Origin, spot: Spot): number {
  return walkMinutes(originPoint(origin, spot), spot);
}

const pickOne = <T>(arr: readonly T[], rand: Rand): T => arr[Math.floor(rand() * arr.length) % arr.length];

/** 条件に合うスポットと徒歩時間 */
export function filterSpots(
  spots: Spot[],
  genres: Map<string, Genre>,
  cond: Conditions,
  origin: Origin,
): Candidate[] {
  const excluded = new Set(cond.excludedGenres);
  const out: Candidate[] = [];
  for (const spot of spots) {
    const genre = genres.get(spot.genre);
    if (!genre || !genre.enabled) continue;
    if (excluded.has(spot.genre)) continue;
    if (cond.area !== "any" && spot.area !== cond.area) continue;
    if (cond.budget !== null && spot.priceLevel > cond.budget) continue;
    if (genre.group !== "both" && genre.group !== cond.party) continue;
    if (cond.indoorOnly && !spot.indoor) continue;
    const walk = walkFrom(origin, spot);
    if (cond.walk !== null && walk > cond.walk) continue;
    out.push({ spot, walk });
  }
  return out;
}

/**
 * ジャンルを均等に選び、その中からスポットを均等に選ぶ。
 * 直近に出たスポット（recentIds）は避ける。避けると0件になるなら避けない。
 */
export function pick(candidates: Candidate[], recentIds: readonly string[], rand: Rand): Candidate | null {
  if (candidates.length === 0) return null;
  const recent = new Set(recentIds.slice(-RECENT_AVOID));
  const fresh = candidates.filter((c) => !recent.has(c.spot.id));
  const pool = fresh.length > 0 ? fresh : candidates;

  const byGenre = new Map<string, Candidate[]>();
  for (const c of pool) {
    const list = byGenre.get(c.spot.genre);
    if (list) list.push(c);
    else byGenre.set(c.spot.genre, [c]);
  }
  const genreIds = [...byGenre.keys()].sort();
  const genreId = pickOne(genreIds, rand);
  return pickOne(byGenre.get(genreId)!, rand);
}

export type Relaxation = { label: string; count: number; patch: Partial<Conditions> };

const BUDGET_LABEL: Record<Exclude<BudgetLimit, null> | "null", string> = {
  0: "無料だけ",
  1: "〜¥",
  2: "〜¥¥",
  null: "気にしない",
};

/** 0件の時に、どの条件を緩めれば何件になるかを返す（件数の多い順ではなく、緩め方の小さい順） */
export function suggestRelaxations(
  spots: Spot[],
  genres: Map<string, Genre>,
  cond: Conditions,
  origin: Origin,
): Relaxation[] {
  const tries: { label: string; patch: Partial<Conditions> }[] = [];
  if (cond.walk !== null) {
    for (const w of WALK_STEPS.filter((w) => w > cond.walk!)) {
      tries.push({ label: `徒歩を${w}分にする`, patch: { walk: w } });
    }
    tries.push({ label: "徒歩を「気にしない」にする", patch: { walk: null } });
  }
  if (cond.budget !== null) {
    for (const b of [1, 2, null] as BudgetLimit[]) {
      if (b !== null && b <= cond.budget) continue;
      tries.push({ label: `予算を「${BUDGET_LABEL[String(b) as "null"]}」にする`, patch: { budget: b } });
    }
  }
  if (cond.indoorOnly) tries.push({ label: "屋内のみをオフにする", patch: { indoorOnly: false } });
  if (cond.area !== "any") tries.push({ label: "エリアを「どっちでも」にする", patch: { area: "any" } });
  tries.push({
    label: cond.party === "solo" ? "人数を「みんな」にする" : "人数を「ひとり」にする",
    patch: { party: cond.party === "solo" ? "group" : "solo" },
  });
  if (cond.excludedGenres.length > 0) {
    tries.push({ label: "除外中のジャンルを全部戻す", patch: { excludedGenres: [] } });
  }

  const out: Relaxation[] = [];
  const seenPatch = new Set<string>();
  for (const t of tries) {
    const count = filterSpots(spots, genres, { ...cond, ...t.patch }, origin).length;
    if (count === 0) continue;
    // 同じ種類の条件は一番小さい緩め方だけ出す
    const key = Object.keys(t.patch).join();
    if (seenPatch.has(key)) continue;
    seenPatch.add(key);
    out.push({ ...t, count });
  }
  return out;
}

/* ---------- はしご ---------- */

export const HOP_WALK = 10;
export const HOP_WALK_WIDE = 15;
export const MAX_HOPS = 3;

/**
 * はしごの次の1軒。直前のスポットから徒歩10分以内（なければ15分）、コース内で既出のジャンル以外。
 * エリア・徒歩以外の条件（予算・人数・屋内・除外ジャンル）は引き継ぐ。
 */
export function nextHop(
  spots: Spot[],
  genres: Map<string, Genre>,
  cond: Conditions,
  course: Spot[],
  recentIds: readonly string[],
  rand: Rand,
): (Candidate & { widened: boolean }) | null {
  const prev = course[course.length - 1];
  const used = course.map((s) => s.genre);
  const base: Conditions = {
    ...cond,
    area: "any",
    excludedGenres: [...cond.excludedGenres, ...used],
  };
  for (const [limit, widened] of [[HOP_WALK, false], [HOP_WALK_WIDE, true]] as const) {
    const cands = filterSpots(spots, genres, { ...base, walk: limit }, prev);
    const got = pick(cands, recentIds, rand);
    if (got) return { ...got, widened };
  }
  return null;
}

/**
 * コースの index 軒目だけを引き直す。
 * 他の軒のジャンルは避け、前の軒（1軒目なら起点）からの条件と、次の軒まで徒歩15分以内を守る。
 */
export function rerollHop(
  spots: Spot[],
  genres: Map<string, Genre>,
  cond: Conditions,
  origin: Origin,
  course: Spot[],
  index: number,
  recentIds: readonly string[],
  rand: Rand,
): (Candidate & { widened: boolean }) | null {
  const current = course[index];
  const next = course[index + 1];
  const otherGenres = course.filter((_, i) => i !== index).map((s) => s.genre);
  const avoid = [...recentIds, current.id];
  const reachesNext = (c: Candidate) => !next || walkMinutes(c.spot, next) <= HOP_WALK_WIDE;
  const excluded = [...cond.excludedGenres, ...otherGenres];
  const notInCourse = (c: Candidate) => !course.some((s) => s.id === c.spot.id);

  if (index === 0) {
    const cands = filterSpots(spots, genres, { ...cond, excludedGenres: excluded }, origin)
      .filter(reachesNext)
      .filter(notInCourse);
    const got = pick(cands, avoid, rand);
    return got ? { ...got, widened: false } : null;
  }
  const prev = course[index - 1];
  for (const [limit, widened] of [[HOP_WALK, false], [HOP_WALK_WIDE, true]] as const) {
    const cands = filterSpots(spots, genres, { ...cond, area: "any", walk: limit, excludedGenres: excluded }, prev)
      .filter(reachesNext)
      .filter(notInCourse);
    const got = pick(cands, avoid, rand);
    if (got) return { ...got, widened };
  }
  return null;
}

/* ---------- お題 ---------- */

/** スポットのジャンルで使えるお題の一覧（ジャンル別 → 共通 の順。共有URLのindexはこの並び） */
export function odaiList(odai: Odai, genreId: string): string[] {
  return [...(odai[genreId] ?? []), ...odai.common];
}

/** ジャンル別7割・共通3割で1つ選び、odaiList上のindexを返す */
export function pickOdai(odai: Odai, genreId: string, rand: Rand, genreRatio = 0.7): number | null {
  const specific = odai[genreId] ?? [];
  const common = odai.common;
  if (specific.length === 0 && common.length === 0) return null;
  const useSpecific = specific.length > 0 && (common.length === 0 || rand() < genreRatio);
  if (useSpecific) return Math.floor(rand() * specific.length) % specific.length;
  return specific.length + (Math.floor(rand() * common.length) % common.length);
}

export function priceLabel(level: PriceLevel): string {
  return level === 0 ? "無料" : "¥".repeat(level);
}
