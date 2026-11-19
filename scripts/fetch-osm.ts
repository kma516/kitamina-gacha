/**
 * Overpass API から両エリアの遊び場を取得し、data/spots.json に書き出す。
 * 使い方: npm run fetch-osm [-- --force]
 *   --force: 件数が前回の半分未満でも書き出す
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AREAS, AREA_IDS } from "../src/areas";
import type { AreaId, Bbox, Genre, Spot } from "../src/types";
import { buildQuery, normalize, type OsmElement, type Override } from "./normalize";

const ENDPOINT = "https://overpass-api.de/api/interpreter";
const RETRY_WAIT_MS = 30_000;
const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

const repo = process.env.GITHUB_REPOSITORY
  ? `https://github.com/${process.env.GITHUB_REPOSITORY}`
  : (process.env.KITAMINA_REPO_URL ?? "local build");
const USER_AGENT = `kitamina-gacha (${repo})`;

async function overpass(query: string): Promise<OsmElement[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
      const json = (await res.json()) as { elements?: OsmElement[]; remark?: string };
      if (json.remark && /error|timed out/i.test(json.remark)) throw new Error(json.remark);
      return json.elements ?? [];
    } catch (err) {
      if (attempt >= 2) throw err;
      console.warn(`Overpass 取得失敗（${(err as Error).message}）。30秒後にリトライします`);
      await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
    }
  }
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(root(path), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function printTable(spots: Spot[], genres: Genre[]): string[] {
  const warnings: string[] = [];
  const rows = genres.map((g) => {
    const counts = AREA_IDS.map((a) => spots.filter((s) => s.genre === g.id && s.area === a).length);
    AREA_IDS.forEach((a, i) => {
      if (counts[i] === 0) warnings.push(`${g.name}（${g.id}）: ${AREAS[a].short} が0件`);
    });
    return { ジャンル: g.name, ...Object.fromEntries(AREA_IDS.map((a, i) => [AREAS[a].short, counts[i]])), 計: counts.reduce((x, y) => x + y, 0) };
  });
  rows.push({
    ジャンル: "合計",
    ...Object.fromEntries(AREA_IDS.map((a) => [AREAS[a].short, spots.filter((s) => s.area === a).length])),
    計: spots.length,
  });
  console.table(rows);
  return warnings;
}

async function main() {
  const force = process.argv.includes("--force");
  const genres = await readJson<Genre[]>("data/genres.json", []);
  const overrides = await readJson<Record<string, Override>>("data/overrides.json", {});
  const previous = await readJson<Spot[]>("data/spots.json", []);

  const elements = {} as Record<AreaId, OsmElement[]>;
  const bboxes = {} as Record<AreaId, Bbox>;
  for (const area of AREA_IDS) {
    bboxes[area] = AREAS[area].bbox;
    console.log(`${AREAS[area].name} を取得中…`);
    elements[area] = await overpass(buildQuery(AREAS[area].bbox));
    console.log(`  ${elements[area].length} 要素`);
  }

  const spots = normalize(elements, bboxes, genres, overrides);
  const warnings = printTable(spots, genres);
  for (const w of warnings) console.warn(`⚠ ${w}`);

  if (spots.length === 0) throw new Error("スポットが0件でした。書き出しを中止します");
  if (!force && previous.length > 0 && spots.length < previous.length / 2) {
    throw new Error(
      `件数が前回の半分未満です（前回 ${previous.length} → 今回 ${spots.length}）。書き出しを中止します（--force で強制）`,
    );
  }

  await writeFile(root("data/spots.json"), JSON.stringify(spots, null, 1) + "\n");
  console.log(`data/spots.json に ${spots.length} 件を書き出しました（前回 ${previous.length} 件）`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
