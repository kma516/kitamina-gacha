# キタミナガチャ

大阪のキタ（梅田）とミナミ（難波）で、大学生が暇な時間に行く遊び場をガチャで1件提案するWebアプリ。 無料で公開・運用することが絶対条件。有料サービス・有料APIは使わない。

## 前提と方針

- 想定ユーザー: 大阪の大学生。終電までの時間や休日に「どこ行こう」と迷っている  
- 対象: 遊び場のみ。**飲食店は含めない**  
- 営業時間は扱わない（絞り込み条件にしない）  
- 料金は「出せる範囲で目安を出す」。なくても動くこと  
- ゲーム要素（レア度・回数制限・図鑑）は入れない  
- 独自ドメインは使わない。`*.pages.dev` で公開する  
- UIはすべて日本語、スマホ縦画面が主。PCでも崩れないこと

## 技術構成

| 項目 | 採用 |
| :---- | :---- |
| フロント | Vite \+ TypeScript（フレームワークなし。複雑になったらPreactまで可） |
| ホスティング | Cloudflare Pages（Git連携で自動デプロイ） |
| データ | OpenStreetMap（Overpass API）をビルド前に取得し、静的JSONとして同梱 |
| データ更新 | GitHub Actions で週1回取得 → 差分があればコミット → Pagesが自動ビルド |
| テスト | Vitest（抽選・距離計算・フィルタ・共有URLのロジック） |
| 地図 | 埋め込まない。Googleマップへのリンクのみ（APIは使わない） |

- 実行時にAPIは一切呼ばない（位置情報はブラウザのGeolocation APIのみ。外部送信しない）  
- サーバー・DBなし（Phase 2の投票機能まで）  
- Cloudflare Pagesの無料枠はビルド月500回。Actionsの自動コミットは週1回までに抑える

## ディレクトリ構成（案）

```
/
├─ CLAUDE.md
├─ README.md            # 概要、ローカル起動手順、データのライセンス表記
├─ index.html
├─ src/
│  ├─ main.ts
│  ├─ gacha.ts          # 抽選ロジック
│  ├─ geo.ts            # 距離・徒歩時間計算、エリア判定
│  ├─ share.ts          # 共有URLの生成・解析
│  ├─ ui/               # 画面描画
│  └─ styles.css
├─ data/
│  ├─ genres.json       # ジャンル定義（手で管理）
│  ├─ odai.json         # お題（手で管理）
│  ├─ overrides.json    # スポットごとの手動補正（手で管理）
│  └─ spots.json        # 生成物（scripts/fetch-osm.ts が出力）
├─ scripts/
│  └─ fetch-osm.ts      # Overpassから取得 → 正規化 → spots.json
├─ tests/
└─ .github/workflows/update-spots.yml
```

## エリア定義

| id | 表示名 | 範囲（bbox: 南, 西, 北, 東） | 含む地域 | 起点駅（現在地が使えない時） |
| :---- | :---- | :---- | :---- | :---- |
| `kita` | キタ（梅田） | 34.690, 135.487, 34.712, 135.509 | 梅田、大阪駅、茶屋町、中崎町、北新地、中之島 | 大阪駅 34.7025, 135.4959 |
| `minami` | ミナミ（難波） | 34.655, 135.493, 34.680, 135.510 | 難波、心斎橋、道頓堀、アメ村、日本橋 | なんば駅 34.6627, 135.5016 |

bboxは目安。実データを見て中崎町・日本橋（でんでんタウン）が入っているか確認し、必要なら調整する。

## ジャンル定義（data/genres.json の初期値）

`price_level`: 1=¥（〜1,000円/人目安）、2=¥¥（〜3,000円）、3=¥¥¥（3,000円〜）、0=無料 `group`: `solo`\=ひとり向き、`group`\=みんな向き、`both`\=どちらでも

| id | 表示名 | OSMタグ | 屋内 | price\_level | 料金目安テキスト | group |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| karaoke | カラオケ | `amenity=karaoke_box` | ○ | 1 | 1人 500〜1,500円/時間 | both |
| arcade | ゲーセン | `leisure=amusement_arcade` | ○ | 1 | 〜1,000円 | both |
| bowling | ボウリング | `leisure=bowling_alley` | ○ | 2 | 1ゲーム 600〜800円 | group |
| billiards\_darts | ビリヤード・ダーツ | `sport=billiards` / `sport=darts`（nwr全般） | ○ | 2 | 1人 1,000円前後/時間 | group |
| escape\_game | 脱出ゲーム | `leisure=escape_game` | ○ | 3 | 1人 3,000円前後 | group |
| cinema | 映画館 | `amenity=cinema` | ○ | 2 | 学生 1,500円前後 | both |
| manga\_cafe | 漫画・ネットカフェ | `amenity=internet_cafe` | ○ | 1 | 3時間パック 1,000円前後 | solo |
| museum | 美術館・博物館 | `tourism=museum` / `tourism=gallery` | ○ | 1 | 無料〜1,500円 | both |
| planetarium | プラネタリウム | `amenity=planetarium` | ○ | 1 | 〜1,000円 | both |
| music\_venue | ライブハウス | `amenity=music_venue` | ○ | 2 | 当日券 2,000〜4,000円 | both |
| theatre | 劇場・寄席 | `amenity=theatre` | ○ | 3 | 2,000円〜 | both |
| climbing | ボルダリング | `sport=climbing` | ○ | 2 | 初回 2,000円前後（レンタル込） | both |
| sports | スポーツ施設 | `leisure=sports_centre`（`sport` が climbing 以外。fitness系は除外） | ○ | 2 | 施設による | group |
| bath | 銭湯・スパ | `amenity=public_bath` | ○ | 1 | 銭湯 520円前後 | both |
| books | 本屋 | `shop=books` | ○ | 0 | 見るだけ無料 | solo |
| subculture | サブカル・ホビー | `shop=anime` / `shop=games` / `shop=video_games` / `shop=model` | ○ | 0 | 見るだけ無料 | both |
| vintage | 古着屋 | `shop=second_hand` | ○ | 0 | 見るだけ無料 | both |
| park | 公園 | `leisure=park` | × | 0 | 無料 | both |
| spot | 観光スポット | `tourism=attraction` / `tourism=viewpoint` | × | 0 | 無料〜（展望台は有料あり） | both |

- 料金目安テキストは一般的な相場の仮置き。実装時に手直ししてよい  
- 本屋・サブカル・古着屋は「買い物」寄りなので、ジャンル定義に `enabled` フラグを持たせて一括でオンオフできるようにする

## スポットデータ（data/spots.json）

```ts
type Spot = {
  id: string;            // "osm:node/123456" 形式
  name: string;
  genre: string;         // genres.json の id
  area: "kita" | "minami";
  lat: number;
  lon: number;
  indoor: boolean;       // ジャンル既定値。overridesで上書き可
  priceLevel: 0 | 1 | 2 | 3;
  priceText: string;
  priceSource: "osm" | "genre" | "manual";
  osmUrl: string;        // https://www.openstreetmap.org/node/123456
  website?: string;
};
```

### 取得・正規化ルール（scripts/fetch-osm.ts）

- Overpass API: `https://overpass-api.de/api/interpreter`。エリアごとに1クエリ、`out tags center;` でway/relationは中心座標を使う  
- リクエストには `User-Agent: kitamina-gacha (GitHubリポジトリURL)` を付ける。失敗時は30秒待って1回だけリトライ  
- `name`（または `name:ja`）がないものは捨てる  
- 同一名称で50m以内に重複があれば1件にまとめる  
- 飲食店（`amenity=restaurant|cafe|fast_food|bar|pub|izakaya` 等）は、別ジャンルのタグを併せ持っていても除外する  
- 成人向け施設は除外する（`amenity=nightclub|stripclub|love_hotel`、`shop=erotic` 等）  
- 料金: OSMに `fee` / `charge` があれば `priceSource: "osm"` で使う（`fee=no` は無料扱い）。なければジャンルの既定値で `priceSource: "genre"`  
- `overrides.json` を最後に適用する（下記）  
- ジャンル別件数をログに出す（エリア×ジャンルの表）。件数が0のジャンルは警告

### 手動補正（data/overrides.json）

```json
{
  "osm:way/123456": { "priceText": "1ゲーム 650円", "priceLevel": 2 },
  "osm:node/789":   { "exclude": true, "reason": "閉店" }
}
```

適用した項目は `priceSource: "manual"` にする。

## お題（data/odai.json）

ジャンルごとの配列＋共通。未成年もいる前提なのでお酒の話は入れない。初期データ:

```json
{
  "common": [
    "ここで全員で1枚写真を撮る",
    "着くまでしりとり。負けた人が次のガチャを回す",
    "一番テンション低い人が次の行き先を決める",
    "ここでの思い出を一言ずつLINEに送る"
  ],
  "karaoke": ["最初の1曲は全員が知ってる曲縛り", "点数最下位がジュースを奢る", "誰かの十八番を全員で歌う", "生まれ年の曲しか入れちゃダメ"],
  "arcade": ["プリクラで全員変顔", "UFOキャッチャーは300円まで。取れたら勝ち", "音ゲーで一番低かった人が次の行き先を決める", "メダルゲームで一番増やした人が勝ち"],
  "bowling": ["スコア最下位がジュースを奢る", "利き手じゃない方で1フレーム", "ストライクを出したら全員でハイタッチ"],
  "billiards_darts": ["負けた人が次のガチャを回す", "1ゲームごとにチームを組み替える"],
  "escape_game": ["ヒントは1回まで", "脱出できたら記念写真"],
  "cinema": ["観る映画はその場で一番近い上映時刻のもの", "観終わったら全員で一言レビュー"],
  "manga_cafe": ["読んだことない漫画の1巻を読む", "おすすめの1冊を交換する"],
  "museum": ["一番気に入った作品を1つ選んで発表", "作品にタイトルをつけ直す大喜利"],
  "planetarium": ["寝たら負け", "見つけた星座を1つ覚えて帰る"],
  "music_venue": ["知らないバンドの日に行ってみる", "物販で1つ何か買う"],
  "theatre": ["当日券で一番安い席", "終わったら一番笑ったところを言い合う"],
  "climbing": ["初心者課題を全員クリアするまで帰らない", "一番登れた人が次の行き先を決める"],
  "sports": ["負けチームがジュースを奢る", "全員初めての種目をやる"],
  "bath": ["一番長くサウナにいた人の勝ち", "風呂上がりの牛乳は必須"],
  "books": ["1,000円以内で相手に本を選んでプレゼント", "表紙だけで1冊選ぶ"],
  "subculture": ["1,000円以内で一番いいものを見つけた人が勝ち", "知らない作品のグッズを1つ調べる"],
  "vintage": ["3,000円以内で全身コーデを組み合う", "一番変な服を見つけた人が勝ち"],
  "park": ["ベンチで10分だけ何もしない", "全員の写真を1枚ずつ撮り合う"],
  "spot": ["観光客になりきって写真を撮る", "ここの由来を調べて誰かが解説する"]
}
```

お題は `common` とジャンル別を混ぜて抽選する（ジャンル別7割、共通3割程度）。

## 画面と機能

1ページ構成。状態はURLのクエリと画面内メモリで持つ。

### 1\. 条件入力（トップ）

- エリア: キタ / ミナミ / どっちでも（初期値: 現在地に近い方。位置情報なしなら「どっちでも」）  
- 起点: 現在地 / 駅（現在地を許可していない、または両エリアのbboxから2km以上離れている場合は自動で駅）  
- 徒歩: 5 / 10 / 15 / 20分以内 / 気にしない（初期値10分）  
- 予算: 無料だけ / 〜¥ / 〜¥¥ / 気にしない  
- 人数: ひとり / みんな（`group` で絞る。`both` はどちらでも出る）  
- 屋内のみ: オン/オフ  
- お題をつける: オン/オフ（初期オン）  
- 「ガチャを回す」ボタン（大きく）

### 2\. 結果カード

- ジャンル名（アイコン or 絵文字）、スポット名、エリア、起点からの徒歩◯分、料金目安  
- お題（オンの時）  
- ボタン: 「Googleマップで開く」「もう1回」「このジャンルは今日はいい」「キープ」「はしごする」  
- Googleマップのリンク: `https://www.google.com/maps/search/?api=1&query={lat},{lon}`（名前も渡すなら `query=名前` を併用）  
- カードを引く時に軽い演出（カプセルが開く程度、1秒以内）。`prefers-reduced-motion` なら省略

### 3\. はしごガチャ

- 「はしごする」で、今のスポットを1軒目として確定し、そこを起点に次を引く  
- 2軒目以降は、直前のスポットから**徒歩10分以内**、かつ**コース内で既出のジャンル以外**から抽選  
- 候補が0件なら15分まで広げ、それでもなければ「この近くには次がなかった」と表示  
- 最大3軒。画面上部に「1軒目 → 徒歩◯分 → 2軒目 → …」のタイムラインを表示  
- 各軒のお題も表示。途中の軒を引き直せる

### 4\. ジャンル除外して引き直し

- 「このジャンルは今日はいい」で、そのジャンルを除外リストに入れて即再抽選  
- 除外中のジャンルは条件エリアにチップで表示し、タップで解除できる  
- 除外リストはタブを閉じたら消えてよい（保存しない）

### 5\. キープと共有（投票の代わり／MVP）

- 結果カードを「キープ」できる（最大5件）。キープ一覧を画面下に表示  
- 「友達に送る」で、キープ一覧（またははしごコース）を共有URLにする  
  - 形式: `/?k=<spotId>,<spotId>,...&o=<お題index>,...`（はしごの場合は `?c=` で順序付き）  
  - spotIdは短縮してよい（例: `n123`\=node/123, `w456`\=way/456）  
- 共有はWeb Share APIを優先。非対応ならURLをコピー＋LINE共有リンク（`https://social-plugins.line.me/lineit/share?url=`）  
- 共有URLを開いた人には、候補一覧（またはコース）を表示し、各カードからGoogleマップに飛べる。下に「自分もガチャを回す」ボタン  
- 共有URLのスポットがデータ更新で消えていたら、その1件だけ「見つからなかった」と表示

### 6\. フッター

- `© OpenStreetMap contributors`（[https\://www\.openstreetmap.org/copyright](https://www.openstreetmap.org/copyright) へリンク）  
- 「情報が古い・間違っている場合はOpenStreetMapで修正できます」＋各カードに `osmUrl` へのリンク（小さく）

## 抽選ロジック

1. 条件（エリア・徒歩・予算・人数・屋内・除外ジャンル）でスポットを絞る  
2. 残ったスポットが属するジャンルから**ジャンルを均等に**1つ選び、その中からスポットを均等に1つ選ぶ（カラオケや公園など件数の多いジャンルばかり出ないようにするため）  
3. 直近5回に出たスポットは避ける（候補が足りなければ避けない）  
4. 0件なら、どの条件を緩めればいいか（例:「徒歩を15分にすると12件あります」）を表示する

徒歩時間 \= 直線距離（ハバーサイン）× 1.3 ÷ 80m/分、切り上げ。

## データ更新（.github/workflows/update-spots.yml）

- `schedule`: 週1回（例: 月曜 4:00 JST \= 日曜 19:00 UTC）＋ `workflow_dispatch`  
- `npm ci` → `npm run fetch-osm` → `spots.json` に差分があればコミット＆push  
- 取得失敗時や件数が前回の半分未満になった時は、コミットせずに失敗させる（データ消失防止）

## 完成の基準（MVP）

- [ ] `npm run fetch-osm` で両エリアの spots.json が生成され、ジャンル×エリアの件数表が出る  
- [ ] 飲食店・成人向け施設・名前なしのスポットが含まれていない  
- [ ] 条件を変えてガチャを回すと、条件に合うスポットだけが出る  
- [ ] 位置情報を拒否しても駅起点で動く  
- [ ] はしごで3軒のコースが作れ、2軒目以降が直前から徒歩10分以内・ジャンル重複なし  
- [ ] ジャンル除外と解除ができる  
- [ ] キープ→共有URL→別ブラウザで開くと同じ候補が表示される  
- [ ] スマホ幅（375px）で崩れない。Lighthouseのアクセシビリティ90以上  
- [ ] 抽選・徒歩計算・共有URLのテストが通る  
- [ ] Cloudflare Pagesにデプロイされ、`*.pages.dev` で開ける  
- [ ] OSMのクレジットがフッターにある

## やらないこと（MVP）

- 飲食店、営業時間、レア度、回数制限、図鑑、ログイン、地図の埋め込み、独自ドメイン、広告

## Phase 2（使われ始めたら）

- 簡易投票: 共有URLを開いた人が候補にタップで投票し、票数が見える  
  - Cloudflare Pages Functions \+ D1（無料枠: 1日10万リクエスト）  
  - 投票ルームはランダムIDで発行、24時間で自動失効。個人情報は持たない

## セキュリティ

ログイン・サーバー保存・秘密情報はないが、OSMは誰でも編集できるデータなので「外から入ってくる文字列」は信用しない。

- **XSS対策**: スポット名・料金テキストなどデータ由来の文字列は `textContent` で表示する。`innerHTML` / `insertAdjacentHTML` / `outerHTML` は使わない（`src/ui/dom.ts` の要素ビルダー経由で描画する）  
- **URLの検証**: `website` は `https://` で始まるものだけ通す（取得時と表示時の両方でチェック）。`osmUrl` は `https://www.openstreetmap.org/` 始まりのみ。リンクには `rel="noopener noreferrer"`  
- **共有URL**: `k` / `c` は `n|w|r` ＋数字の形式だけ受け付け、spots.json に存在するIDだけ表示する。お題は数字indexのみ。URLの文字列そのものは画面に出さない  
- **位置情報**: Geolocation APIの値はブラウザ内の距離計算だけに使う。URL・ストレージ・外部に出さない。現在地は「現在地」を選んだ時だけ要求する  
- **依存パッケージ**: 実行時の依存はゼロ（devDependenciesのみ）を保つ。Dependabot（npm / GitHub Actions）を有効にする  
- **GitHub Actions**: `permissions: contents: write` だけに絞る。サードパーティActionはできるだけ使わない  
- **セキュリティヘッダー**: `public/_headers` でCSP（`default-src 'self'`、インラインスクリプト禁止）、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`（geolocationはself のみ）、`frame-ancestors 'none'` を付ける  
- **公開リポジトリ**: コミットのメールアドレスは個人用（またはGitHubの `noreply`）にする。社内の情報・認証情報をコミットしない

## ライセンス

- コード: MIT（変更可）  
- `data/spots.json` はOpenStreetMapの派生データのため ODbL。READMEに明記する