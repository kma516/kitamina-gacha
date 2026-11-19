import type { Genre, Spot } from "../src/types";
import genreList from "../data/genres.json";

export const genres = new Map((genreList as Genre[]).map((g) => [g.id, g]));

let seq = 1;
export function spot(p: Partial<Spot> & Pick<Spot, "genre" | "lat" | "lon">): Spot {
  const g = genres.get(p.genre)!;
  const id = p.id ?? `osm:node/${seq++}`;
  return {
    id,
    name: p.name ?? `spot-${id}`,
    area: "kita",
    indoor: g.indoor,
    priceLevel: g.priceLevel,
    priceText: g.priceText,
    priceSource: "genre",
    osmUrl: "",
    ...p,
  };
}

/** 決まった値を順番に返す乱数 */
export function seq01(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

/** 再現可能な疑似乱数（mulberry32） */
export function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
