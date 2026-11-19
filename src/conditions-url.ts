import type { BudgetLimit, Conditions, Party, WalkLimit } from "./gacha";

/** 画面の条件（共有用の k / c / o とは別のキーを使う） */
export type FormState = {
  area: Conditions["area"];
  origin: "current" | "station";
  walk: WalkLimit;
  budget: BudgetLimit;
  party: Party;
  indoorOnly: boolean;
  odai: boolean;
};

export const DEFAULT_FORM: FormState = {
  area: "any",
  origin: "station",
  walk: 10,
  budget: null,
  party: "group",
  indoorOnly: false,
  odai: true,
};

const WALKS = ["5", "10", "15", "20"];

export function formToQuery(f: FormState): string {
  const p = new URLSearchParams();
  if (f.area !== DEFAULT_FORM.area) p.set("area", f.area);
  if (f.origin !== DEFAULT_FORM.origin) p.set("from", f.origin);
  if (f.walk !== DEFAULT_FORM.walk) p.set("walk", f.walk === null ? "any" : String(f.walk));
  if (f.budget !== DEFAULT_FORM.budget) p.set("budget", f.budget === null ? "any" : String(f.budget));
  if (f.party !== DEFAULT_FORM.party) p.set("party", f.party);
  if (f.indoorOnly) p.set("indoor", "1");
  if (!f.odai) p.set("odai", "0");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** URLにある条件だけを返す（なかったキーは含めない） */
export function queryToForm(search: string): Partial<FormState> {
  const p = new URLSearchParams(search);
  const f: Partial<FormState> = {};
  const area = p.get("area");
  if (area === "kita" || area === "minami" || area === "any") f.area = area;
  const from = p.get("from");
  if (from === "current" || from === "station") f.origin = from;
  const walk = p.get("walk");
  if (walk === "any") f.walk = null;
  else if (walk && WALKS.includes(walk)) f.walk = Number(walk) as WalkLimit;
  const budget = p.get("budget");
  if (budget === "any") f.budget = null;
  else if (budget === "0" || budget === "1" || budget === "2") f.budget = Number(budget) as BudgetLimit;
  const party = p.get("party");
  if (party === "solo" || party === "group") f.party = party;
  if (p.has("indoor")) f.indoorOnly = p.get("indoor") === "1";
  if (p.has("odai")) f.odai = p.get("odai") !== "0";
  return f;
}
