/**
 * 安全なDOM生成。文字列は必ず textContent / setAttribute で入れる（innerHTML は使わない）。
 */

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (typeof value === "function") {
        el.addEventListener(key.replace(/^on/, ""), value);
      } else if (key === "href" || key === "src") {
        const safe = safeHttpUrl(String(value));
        if (safe) el.setAttribute(key, safe);
      } else {
        el.setAttribute(key, value === true ? "" : String(value));
      }
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: (Child | Child[])[]) {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

/** 子要素を入れ替える */
export function replaceChildren(el: Element, ...children: (Child | Child[])[]) {
  el.replaceChildren();
  append(el, children);
}

/**
 * href に使ってよいURLだけ返す。https: と、同一オリジンの相対パス（/ 始まり、? 始まり）だけ許可。
 * javascript: や data: などは null。
 */
export function safeHttpUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^\/(?!\/)/.test(trimmed) || trimmed.startsWith("?")) return trimmed;
  try {
    const u = new URL(trimmed);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} がない`);
  return el;
}

export const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
