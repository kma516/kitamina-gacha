import "./styles.css";
import type { Genre, LatLon, Odai, Spot } from "./types";
import genreJson from "../data/genres.json";
import odaiJson from "../data/odai.json";
import spotsJson from "../data/spots.json";
import { AREAS } from "./areas";
import { canUseCurrentLocation, nearestArea, walkMinutes } from "./geo";
import {
  type Conditions,
  type Origin,
  type Relaxation,
  MAX_HOPS,
  filterSpots,
  nextHop,
  pick,
  pickOdai,
  rerollHop,
  suggestRelaxations,
  walkFrom,
} from "./gacha";
import { DEFAULT_FORM, type FormState, formToQuery, queryToForm } from "./conditions-url";
import { type SharePayload, buildShareUrl, parseShareQuery } from "./share";
import { $, h, prefersReducedMotion, replaceChildren } from "./ui/dom";
import { type Pulled, btn, missingCard, odaiText, spotCard, timeline } from "./ui/cards";

/* ---------- データ ---------- */

const genreList = genreJson as Genre[];
const genres = new Map(genreList.map((g) => [g.id, g]));
const odai = odaiJson as Odai;
const spots = (spotsJson as Spot[]).filter((s) => genres.get(s.genre)?.enabled);
const spotById = new Map(spots.map((s) => [s.id, s]));

const MAX_KEEPS = 5;
const RECENT_KEEP = 20;
/** はしごで、前の軒からこの分数を超えたら「少し遠め」と表示する */
const HOP_WALK_LIMIT = 10;

/* ---------- 状態（画面内メモリ。保存しない） ---------- */

const state = {
  form: { ...DEFAULT_FORM } as FormState,
  areaTouched: false,
  geo: null as LatLon | null,
  excluded: [] as string[],
  recent: [] as string[],
  result: null as Pulled | null,
  relax: null as Relaxation[] | null,
  course: [] as Pulled[],
  courseMessage: null as string | null,
  keeps: [] as Pulled[],
  keepMessage: null as string | null,
};

const rand = () => Math.random();

function conditions(): Conditions {
  const f = state.form;
  return {
    area: f.area,
    walk: f.walk,
    budget: f.budget,
    party: f.party,
    indoorOnly: f.indoorOnly,
    excludedGenres: state.excluded,
  };
}

function origin(): Origin {
  return state.form.origin === "current" && state.geo ? state.geo : null;
}

function originLabel(spot: Spot): string {
  return origin() ? "現在地" : AREAS[spot.area].station.name;
}

function remember(id: string) {
  state.recent = [...state.recent, id].slice(-RECENT_KEEP);
}

function newOdai(spot: Spot): number | null {
  return state.form.odai ? pickOdai(odai, spot.genre, rand) : null;
}

/* ---------- 条件フォーム ---------- */

const form = $("conditions") as HTMLFormElement;
const radios = (name: string) => form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`);
const checkbox = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;

function setRadio(name: string, value: string) {
  radios(name).forEach((r) => (r.checked = r.value === value));
}

function writeForm() {
  const f = state.form;
  setRadio("area", f.area);
  setRadio("origin", f.origin);
  setRadio("walk", f.walk === null ? "any" : String(f.walk));
  setRadio("budget", f.budget === null ? "any" : String(f.budget));
  setRadio("party", f.party);
  checkbox("indoor").checked = f.indoorOnly;
  checkbox("odai").checked = f.odai;
}

function readForm(): FormState {
  const val = (name: string) => [...radios(name)].find((r) => r.checked)?.value ?? "";
  const walk = val("walk");
  const budget = val("budget");
  return {
    area: val("area") as FormState["area"],
    origin: val("origin") as FormState["origin"],
    walk: walk === "any" ? null : (Number(walk) as FormState["walk"]),
    budget: budget === "any" ? null : (Number(budget) as FormState["budget"]),
    party: val("party") as FormState["party"],
    indoorOnly: checkbox("indoor").checked,
    odai: checkbox("odai").checked,
  };
}

function syncUrl() {
  if (parseShareQuery(location.search)) return; // 共有表示中は触らない
  history.replaceState(null, "", location.pathname + formToQuery(state.form));
}

function setOriginNote(text: string) {
  $("origin-note").textContent = text;
}

form.addEventListener("change", (e) => {
  const target = e.target as HTMLInputElement;
  if (target.name === "area") state.areaTouched = true;
  state.form = readForm();
  if (target.name === "origin" && state.form.origin === "current") requestLocation();
  if (target.name === "origin" && state.form.origin === "station") setOriginNote("");
  syncUrl();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  spin();
});

/* ---------- 位置情報（ブラウザ内の計算だけに使う。外部送信しない） ---------- */

function fallbackToStation(reason: string) {
  state.geo = null;
  state.form.origin = "station";
  writeForm();
  syncUrl();
  setOriginNote(reason);
}

function requestLocation() {
  if (!("geolocation" in navigator)) {
    fallbackToStation("このブラウザでは位置情報が使えないので、駅から測ります");
    return;
  }
  setOriginNote("現在地を取得中…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      if (!canUseCurrentLocation(p)) {
        fallbackToStation("梅田・難波から2km以上離れているので、駅から測ります");
        return;
      }
      state.geo = p;
      state.form.origin = "current";
      if (!state.areaTouched && !new URLSearchParams(location.search).has("area")) {
        state.form.area = nearestArea(p).area;
      }
      writeForm();
      syncUrl();
      setOriginNote(`現在地から測ります（${AREAS[nearestArea(p).area].short}の近く）`);
    },
    () => fallbackToStation("位置情報が使えなかったので、駅から測ります"),
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
  );
}

/* ---------- ガチャ ---------- */

let revealToken = 0;

function spin() {
  state.form = readForm();
  state.course = [];
  state.courseMessage = null;
  const cands = filterSpots(spots, genres, conditions(), origin());
  const got = pick(cands, state.recent, rand);
  if (!got) {
    state.result = null;
    state.relax = suggestRelaxations(spots, genres, conditions(), origin());
    renderAll();
    focusResult();
    return;
  }
  remember(got.spot.id);
  state.result = { spot: got.spot, odai: newOdai(got.spot) };
  state.relax = null;
  renderAll({ animate: true });
}

function skipGenre(genreId: string) {
  if (!state.excluded.includes(genreId)) state.excluded = [...state.excluded, genreId];
  spin();
}

function unskipGenre(genreId: string) {
  state.excluded = state.excluded.filter((g) => g !== genreId);
  renderExcluded();
}

function applyRelaxation(r: Relaxation) {
  const { excludedGenres, ...formPatch } = r.patch;
  if (excludedGenres) state.excluded = excludedGenres;
  state.form = { ...state.form, ...formPatch };
  if ("area" in formPatch) state.areaTouched = true;
  writeForm();
  syncUrl();
  spin();
}

/* ---------- 候補（キープ） ---------- */

function keep(p: Pulled) {
  if (state.keeps.some((k) => k.spot.id === p.spot.id)) return;
  if (state.keeps.length >= MAX_KEEPS) {
    state.keepMessage = `候補は${MAX_KEEPS}件までです。どれかを外してください`;
  } else {
    state.keeps = [...state.keeps, p];
    state.keepMessage = null;
  }
  renderResult();
  renderKeeps();
}

function unkeep(id: string) {
  state.keeps = state.keeps.filter((k) => k.spot.id !== id);
  state.keepMessage = null;
  renderResult();
  renderKeeps();
}

/* ---------- はしご ---------- */

function scrollToCourse() {
  $("course").scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

function startCourse() {
  if (!state.result) return;
  state.course = [{ ...state.result }];
  state.result = null;
  addHop();
}

function addHop() {
  if (state.course.length >= MAX_HOPS) return;
  const got = nextHop(spots, genres, conditions(), state.course.map((c) => c.spot), state.recent, rand);
  if (!got) {
    state.courseMessage = "この近くには次がなかった";
  } else {
    remember(got.spot.id);
    state.course = [...state.course, { spot: got.spot, odai: newOdai(got.spot) }];
    state.courseMessage = null;
  }
  renderAll();
  scrollToCourse();
}

function rerollAt(index: number) {
  const got = rerollHop(spots, genres, conditions(), origin(), state.course.map((c) => c.spot), index, state.recent, rand);
  if (!got) {
    state.courseMessage = `${index + 1}軒目の代わりは見つからなかった`;
  } else {
    remember(got.spot.id);
    const course = [...state.course];
    course[index] = { spot: got.spot, odai: newOdai(got.spot) };
    state.course = course;
    state.courseMessage = null;
  }
  renderCourse();
}

/** はしごの途中で「このジャンルは今日はいい」。ジャンルを除外して、その軒だけ引き直す */
function skipGenreAt(index: number) {
  const genreId = state.course[index]?.spot.genre;
  if (!genreId) return;
  if (!state.excluded.includes(genreId)) state.excluded = [...state.excluded, genreId];
  renderExcluded();
  rerollAt(index);
}

/** 候補をはしごに入れる。徒歩が遠くても止めない（表示で「少し遠め」と出す） */
function addKeepToCourse(p: Pulled) {
  if (state.course.some((c) => c.spot.id === p.spot.id)) {
    state.courseMessage = `${p.spot.name}はもうはしごに入っています`;
    renderCourse();
    return;
  }
  if (state.course.length >= MAX_HOPS) {
    state.courseMessage = `はしごは${MAX_HOPS}軒までです`;
    renderCourse();
    return;
  }
  if (state.course.length === 0) state.result = null;
  state.course = [...state.course, { ...p }];
  state.courseMessage = null;
  renderAll();
  scrollToCourse();
}

/** はしごの軒を前後に動かす。動かした軒のボタンにフォーカスを戻す */
function moveHop(index: number, delta: -1 | 1) {
  const to = index + delta;
  if (to < 0 || to >= state.course.length) return;
  const course = [...state.course];
  [course[index], course[to]] = [course[to], course[index]];
  state.course = course;
  state.courseMessage = null;
  renderCourse();
  focusCourseButton(to, delta === -1 ? "up" : "down");
}

function focusCourseButton(index: number, act: "up" | "down") {
  const card = $("course").querySelectorAll(".course-cards > article")[index];
  const other = act === "up" ? "down" : "up";
  (card?.querySelector<HTMLElement>(`[data-act="${act}"]`) ?? card?.querySelector<HTMLElement>(`[data-act="${other}"]`))?.focus();
}

/** はしごから1軒外す。最後の1軒を外したらはしごを終える */
function removeHop(index: number) {
  if (state.course.length <= 1) {
    endCourse();
    return;
  }
  state.course = state.course.filter((_, i) => i !== index);
  state.courseMessage = null;
  renderCourse();
}

function endCourse() {
  state.course = [];
  state.courseMessage = null;
  renderAll();
  $("gacha-button").focus();
}

/* ---------- 共有 ---------- */

async function share(payload: SharePayload) {
  const url = buildShareUrl(location.href, payload);
  const title = payload.mode === "course" ? "はしごコース" : "行き先の候補";
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: `キタミナガチャ：${title}`, text: `${title}を送るね`, url });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
    }
  }
  openShareDialog(url);
}

let dialogReturnFocus: HTMLElement | null = null;

function openShareDialog(url: string) {
  const dialog = $("share-dialog");
  const input = $("share-url") as HTMLInputElement;
  input.value = url;
  ($("share-line") as HTMLAnchorElement).href = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`;
  $("share-status").textContent = "";
  dialogReturnFocus = document.activeElement as HTMLElement | null;
  dialog.hidden = false;
  $("share-copy").focus();
}

function closeShareDialog() {
  $("share-dialog").hidden = true;
  dialogReturnFocus?.focus();
}

$("share-copy").addEventListener("click", async () => {
  const input = $("share-url") as HTMLInputElement;
  try {
    await navigator.clipboard.writeText(input.value);
    $("share-status").textContent = "コピーしました";
  } catch {
    input.select();
    $("share-status").textContent = "選択したのでコピーしてください";
  }
});
$("share-close").addEventListener("click", closeShareDialog);
$("share-dialog").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeShareDialog();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("share-dialog").hidden) closeShareDialog();
});

/* ---------- 描画 ---------- */

function renderExcluded() {
  const wrap = $("excluded");
  wrap.hidden = state.excluded.length === 0;
  replaceChildren(
    $("excluded-chips"),
    state.excluded.map((id) => {
      const g = genres.get(id);
      return h(
        "li",
        null,
        btn(`${g?.emoji ?? ""} ${g?.name ?? id} ✕`, () => unskipGenre(id), "chip", { "aria-label": `${g?.name ?? id}を戻す` }),
      );
    }),
  );
}

function resultCard(p: Pulled): HTMLElement {
  const kept = state.keeps.some((k) => k.spot.id === p.spot.id);
  const genre = genres.get(p.spot.genre);
  const actions = [
    btn("もう1回", spin),
    btn("このジャンルは今日はいい", () => skipGenre(p.spot.genre)),
    btn(kept ? "候補に入れた" : "候補に入れる", () => (kept ? unkeep(p.spot.id) : keep(p)), "btn", { "aria-pressed": String(kept) }),
    btn("はしごする", startCourse, "btn accent"),
  ];
  return spotCard(p.spot, {
    genre,
    odai: odaiText(odai, p),
    walkText: `${originLabel(p.spot)}から徒歩${walkFrom(origin(), p.spot)}分`,
    actions,
  });
}

function renderResult(animate = false) {
  const el = $("result");
  el.hidden = state.course.length > 0;
  if (state.course.length > 0) return;

  if (state.relax) {
    const list = state.relax.slice(0, 4);
    replaceChildren(
      el,
      h(
        "div",
        { class: "card empty" },
        h("h2", { class: "card-name" }, "条件に合うスポットがなかった"),
        list.length
          ? [
              h("p", null, "こうすると見つかります:"),
              h(
                "ul",
                { class: "relax" },
                list.map((r) => h("li", null, btn(`${r.label}（${r.count}件）`, () => applyRelaxation(r), "btn"))),
              ),
            ]
          : h("p", null, "条件を変えてみてください。"),
      ),
    );
    return;
  }
  if (!state.result) {
    replaceChildren(el);
    return;
  }
  const card = resultCard(state.result);
  const nodes: Node[] = [card];
  if (state.keepMessage) nodes.push(h("p", { class: "note warn", role: "status" }, state.keepMessage));

  const token = ++revealToken;
  if (animate && !prefersReducedMotion()) {
    replaceChildren(
      el,
      h("div", { class: "capsule-wrap" }, h("div", { class: "capsule", "aria-hidden": "true" }), h("p", { class: "sr" }, "ガチャ中…")),
    );
    setTimeout(() => {
      if (token !== revealToken) return;
      card.classList.add("reveal");
      replaceChildren(el, ...nodes);
      focusResult();
    }, 750);
  } else {
    replaceChildren(el, ...nodes);
    if (animate) focusResult();
  }
}

function focusResult() {
  const heading = $("result").querySelector<HTMLElement>(".card-name");
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  $("result").scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

function courseWalks(items: Spot[]): number[] {
  return items.map((s, i) => (i === 0 ? walkFrom(origin(), s) : walkMinutes(items[i - 1], s)));
}

function renderCourse() {
  const el = $("course");
  el.hidden = state.course.length === 0;
  if (state.course.length === 0) {
    replaceChildren(el);
    return;
  }
  const items = state.course.map((c) => c.spot);
  const walks = courseWalks(items);
  const last = state.course.length - 1;
  const cards = state.course.map((c, i) => {
    const actions: Node[] = [];
    if (i > 0) {
      actions.push(btn("↑ 上へ", () => moveHop(i, -1), "btn", { "aria-label": `${i + 1}軒目を上へ`, "data-act": "up" }));
    }
    if (i < last) {
      actions.push(btn("↓ 下へ", () => moveHop(i, 1), "btn", { "aria-label": `${i + 1}軒目を下へ`, "data-act": "down" }));
    }
    actions.push(
      btn("この軒を引き直す", () => rerollAt(i), "btn", { "aria-label": `${i + 1}軒目を引き直す` }),
      btn("このジャンルは今日はいい", () => skipGenreAt(i), "btn", { "aria-label": `${i + 1}軒目のジャンルは今日はいい` }),
      btn("はしごから外す", () => removeHop(i), "btn ghost", { "aria-label": `${i + 1}軒目をはしごから外す` }),
    );
    return spotCard(c.spot, {
      genre: genres.get(c.spot.genre),
      odai: odaiText(odai, c),
      headingLevel: 3,
      badge: `${i + 1}軒目`,
      walkText:
        i === 0
          ? `${originLabel(c.spot)}から徒歩${walks[0]}分`
          : `${i}軒目から徒歩${walks[i]}分${walks[i] > HOP_WALK_LIMIT ? "（少し遠め）" : ""}`,
      actions,
    });
  });
  const actions = h(
    "div",
    { class: "course-actions" },
    state.course.length < MAX_HOPS && !state.courseMessage?.includes("次がなかった")
      ? btn("はしごする", addHop, "btn accent")
      : null,
    btn("コースを友達に送る", () =>
      share({ mode: "course", items: state.course.map((c) => ({ spotId: c.spot.id, odai: c.odai })) }), "btn primary"),
    btn("はしごをやめる", endCourse, "btn ghost"),
  );
  replaceChildren(
    el,
    h("h2", { id: "course-title", class: "section-title" }, "はしごコース"),
    timeline(items.map((s) => s.name), walks),
    state.courseMessage ? h("p", { class: "note warn", role: "status" }, state.courseMessage) : null,
    h("div", { class: "course-cards" }, cards),
    actions,
  );
}

function renderKeeps() {
  const el = $("keeps");
  el.hidden = state.keeps.length === 0;
  if (state.keeps.length === 0) {
    replaceChildren(el);
    return;
  }
  replaceChildren(
    el,
    h("h2", { id: "keeps-title", class: "section-title" }, `候補（${state.keeps.length}/${MAX_KEEPS}）`),
    h(
      "ul",
      { class: "keep-list" },
      state.keeps.map((k) => {
        const g = genres.get(k.spot.genre);
        return h(
          "li",
          { class: "keep-item" },
          h("span", { class: "keep-emoji", "aria-hidden": "true" }, g?.emoji ?? "📍"),
          h("span", { class: "keep-name" }, k.spot.name, h("small", null, ` ${g?.name ?? ""}・${AREAS[k.spot.area].short}`)),
          btn("はしごに入れる", () => addKeepToCourse(k), "btn small", { "aria-label": `${k.spot.name}をはしごに入れる` }),
          btn("外す", () => unkeep(k.spot.id), "btn small ghost", { "aria-label": `${k.spot.name}を候補から外す` }),
        );
      }),
    ),
    btn("友達に送る", () =>
      share({ mode: "keep", items: state.keeps.map((k) => ({ spotId: k.spot.id, odai: k.odai })) }), "btn primary wide"),
  );
}

function renderAll(opts: { animate?: boolean } = {}) {
  renderExcluded();
  renderCourse();
  renderResult(opts.animate);
  renderKeeps();
}

/* ---------- 共有URLを開いた人の画面 ---------- */

function renderShared(payload: SharePayload) {
  const el = $("shared-view");
  const found = payload.items.map((i) => ({ item: i, spot: spotById.get(i.spotId) ?? null }));
  const isCourse = payload.mode === "course";
  const present = found.filter((f): f is { item: typeof f.item; spot: Spot } => f.spot !== null);
  const walks = courseWalks(present.map((f) => f.spot));

  const cards = found.map((f, i) => {
    if (!f.spot) return missingCard(3);
    const p: Pulled = { spot: f.spot, odai: f.item.odai };
    // お題indexがそのジャンルの範囲外なら出さない
    const text = odaiText(odai, p);
    const idx = present.findIndex((x) => x.spot.id === f.spot!.id);
    return spotCard(f.spot, {
      genre: genres.get(f.spot.genre),
      odai: text,
      headingLevel: 3,
      badge: isCourse ? `${i + 1}軒目` : undefined,
      walkText: isCourse && idx > 0 ? `前の軒から徒歩${walks[idx]}分` : null,
    });
  });

  replaceChildren(
    el,
    h("h2", { id: "shared-title", class: "section-title" }, isCourse ? "友達からのはしごコース" : "友達からの候補"),
    isCourse && present.length > 1 ? timeline(present.map((f) => f.spot.name), walks) : null,
    h("div", { class: "course-cards" }, cards),
    btn("自分もガチャを回す", leaveShared, "btn accent wide"),
  );
  el.hidden = false;
  $("gacha-view").hidden = true;
}

function leaveShared() {
  history.replaceState(null, "", location.pathname);
  $("shared-view").hidden = true;
  replaceChildren($("shared-view"));
  $("gacha-view").hidden = false;
  $("gacha-button").focus();
}

/* ---------- 起動 ---------- */

function init() {
  const shared = parseShareQuery(location.search);
  state.form = { ...DEFAULT_FORM, ...queryToForm(location.search) };
  if (new URLSearchParams(location.search).has("area")) state.areaTouched = true;
  writeForm();

  if (shared) renderShared(shared);

  // 現在地: URLで指定されているか、すでに許可済みの時だけ取得する（勝手にダイアログを出さない）
  if (state.form.origin === "current") {
    requestLocation();
  } else if (navigator.permissions?.query) {
    navigator.permissions
      .query({ name: "geolocation" })
      .then((s) => {
        if (s.state === "granted") requestLocation();
      })
      .catch(() => {});
  }
  renderAll();
}

init();