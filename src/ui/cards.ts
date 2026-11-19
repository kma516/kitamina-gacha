import type { Genre, Odai, Spot } from "../types";
import { AREAS } from "../areas";
import { odaiList, priceLabel } from "../gacha";
import { h } from "./dom";

export type Pulled = { spot: Spot; odai: number | null };

export function mapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

const OSM_PREFIX = "https://www.openstreetmap.org/";

export function odaiText(odai: Odai, p: Pulled): string | null {
  if (p.odai === null) return null;
  return odaiList(odai, p.spot.genre)[p.odai] ?? null;
}

function priceNode(spot: Spot): Node[] {
  const out: Node[] = [];
  if (spot.priceLevel > 0) out.push(h("span", { class: "price-level" }, priceLabel(spot.priceLevel)), document.createTextNode(" "));
  const suffix = spot.priceSource === "genre" && spot.priceLevel > 0 ? "（目安）" : "";
  out.push(document.createTextNode(spot.priceText + suffix));
  return out;
}

const ext = (href: string, text: string, cls?: string) =>
  h("a", { href, class: cls, target: "_blank", rel: "noopener noreferrer" }, text);

export type CardOpts = {
  genre: Genre | undefined;
  odai: string | null;
  walkText: string | null;
  actions?: Node[];
  headingLevel?: 2 | 3;
  badge?: string;
};

export function spotCard(spot: Spot, o: CardOpts): HTMLElement {
  const heading = h(o.headingLevel === 3 ? "h3" : "h2", { class: "card-name" }, spot.name);
  const foot = h("p", { class: "card-foot" });
  if (spot.osmUrl.startsWith(OSM_PREFIX)) foot.append(ext(spot.osmUrl, "OpenStreetMapで見る・直す"));
  if (spot.website?.startsWith("https://")) foot.append(" ・ ", ext(spot.website, "公式サイト"));

  return h(
    "article",
    { class: "card" },
    o.badge ? h("p", { class: "card-badge" }, o.badge) : null,
    h("p", { class: "card-genre" }, h("span", { "aria-hidden": "true" }, o.genre?.emoji ?? "📍"), " ", o.genre?.name ?? spot.genre),
    heading,
    h(
      "ul",
      { class: "card-meta" },
      h("li", null, h("span", { "aria-hidden": "true" }, "📍"), h("span", { class: "sr" }, "エリア:"), " ", AREAS[spot.area].short),
      o.walkText ? h("li", null, h("span", { "aria-hidden": "true" }, "🚶"), " ", o.walkText) : null,
      h("li", null, h("span", { "aria-hidden": "true" }, "💴"), h("span", { class: "sr" }, "料金:"), " ", ...priceNode(spot)),
    ),
    o.odai ? h("p", { class: "odai" }, h("span", { class: "odai-label" }, "お題"), o.odai) : null,
    h("div", { class: "card-actions" }, ext(mapsUrl(spot.lat, spot.lon), "Googleマップで開く", "btn primary"), ...(o.actions ?? [])),
    foot,
  );
}

export function missingCard(headingLevel: 2 | 3 = 3): HTMLElement {
  return h(
    "article",
    { class: "card missing" },
    h(headingLevel === 3 ? "h3" : "h2", { class: "card-name" }, "見つからなかった"),
    h("p", { class: "note" }, "データ更新でなくなったスポットのようです。"),
  );
}

/** 1軒目 → 徒歩◯分 → 2軒目 … */
export function timeline(names: string[], walks: number[]): HTMLElement {
  const ol = h("ol", { class: "timeline", "aria-label": "はしごコース" });
  names.forEach((n, i) => {
    if (i > 0) ol.append(h("li", { class: "tl-walk" }, h("span", { "aria-hidden": "true" }, "→ 🚶"), `徒歩${walks[i]}分`, h("span", { "aria-hidden": "true" }, " →")));
    ol.append(h("li", { class: "tl-stop" }, h("span", { class: "tl-no" }, `${i + 1}軒目`), " ", n));
  });
  return ol;
}

export function btn(label: string, onclick: () => void, cls = "btn", extra: Record<string, string> = {}): HTMLButtonElement {
  return h("button", { type: "button", class: cls, onclick: onclick as EventListener, ...extra }, label);
}
