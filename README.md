# キタミナガチャ

大阪のキタ（梅田）とミナミ（難波）で、暇な時間に行く遊び場をガチャで1件提案するWebアプリです。
飲食店は含みません。ログイン不要・サーバーなし・実行時に外部APIを呼びません。

## ローカルで動かす

Node.js 20.19 以上（`.nvmrc` は 24）。

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run build      # dist/ に出力
```

## スポットデータの更新

```bash
npm run fetch-osm            # Overpass API から取得して data/spots.json を書き出す
npm run fetch-osm -- --force # 件数が前回の半分未満でも書き出す
```

- 取得時にエリア×ジャンルの件数表を出し、0件のジャンルは警告します
- GitHub Actions（`.github/workflows/update-spots.yml`）が毎週月曜 4:00 JST に取得し、差分があればコミットします
- スポットごとの手直し（閉店・料金・重複の除外など）は `data/overrides.json` に書きます

```json
{
  "osm:way/123456": { "priceText": "1ゲーム 650円", "priceLevel": 2 },
  "osm:node/789":   { "exclude": true, "reason": "閉店" }
}
```

## デプロイ（Cloudflare Pages）

1. GitHub にリポジトリを作って push する
2. Cloudflare ダッシュボード → Workers & Pages → Pages → 「Git に接続」でリポジトリを選ぶ
3. ビルド設定
   - フレームワーク: なし（Vite）
   - ビルドコマンド: `npm run build`
   - 出力ディレクトリ: `dist`
   - 環境変数: `NODE_VERSION` = `24`
4. `*.pages.dev` で公開される。セキュリティヘッダーは `public/_headers` で付与

無料枠（ビルド月500回）を超えないよう、データ自動更新は週1回にしています。

## ライセンス

- コード: [MIT](./LICENSE)
- `data/spots.json`: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)。
  OpenStreetMap の派生データのため [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) で提供されます。
- 情報が古い・間違っている場合は OpenStreetMap で修正できます（各カードにリンクがあります）。
