import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

/** public/_headers の "/*" ブロックを `vite preview` でも付ける（CSP違反をローカルで検出するため） */
function headersFromFile(): Record<string, string> {
  const text = readFileSync(new URL("./public/_headers", import.meta.url), "utf8");
  const block = text.split(/\n(?=\S)/).find((b) => b.startsWith("/*")) ?? "";
  return Object.fromEntries(
    block
      .split("\n")
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()]),
  );
}

export default defineConfig({
  preview: { headers: headersFromFile(), port: 4173 },
});
