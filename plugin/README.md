# VivaStatsAPI

VIVA-MC公式サイトの「プレイヤー統計」「接続履歴」を、実際に動くようにするための
Paperプラグインです。サイト側のコード（`api/get-*.js`）は、このプラグインが
`viva-mc.net:45678` でHTTP APIを公開している前提で書かれています。

## できること

- キル数（対プレイヤー／対Mob）、死亡数、設置・破壊したブロック数、
  プレイ時間、参加回数、初参加日、最終参加日を記録し、
  `GET /v1/player?player=<名前>` で返す
- 誰がいつ入った／抜けたかを直近50件（設定で変更可）記録し、
  `GET /v1/history` で返す
- 上記の項目でランキングを作り、`GET /v1/ranking?type=<種類>` で返す
- 名前の部分一致検索・一覧を `GET /v1/players?query=<文字列>` で返す

所持金（Vaultの残高）と所属タウン（Lands）は、**Vault** と **Lands** が
サーバーに入っていれば自動で連携し、実際の値を返します。どちらか、または
両方が入っていない場合は、その項目だけ `0` / `""`（未所属）を返すだけで、
プラグイン自体はエラーにならず普通に動きます。

（LandsAPIはバージョンによってメソッド名が変わることがあるため、内部では
リフレクションで呼び出しています。手元のLandsのバージョンで所属タウンが
うまく取れない場合は、サーバーログに出る警告を確認したうえで
`LandsHook.java` の候補メソッド名を調整してください。）

## API一覧

### `GET /v1/player?player=<名前>`

```json
{
  "player": "Steve",
  "kill_data": {
    "player_kills_total": 3,
    "mob_kills_total": 128,
    "deaths_total": 5,
    "blocks_placed_total": 4200,
    "blocks_broken_total": 5310
  },
  "active_playtime": 3600000,
  "login_count": 42,
  "first_join": 1700000000000,
  "last_seen": 1750000000000,
  "stats": [
    { "name": "balance", "value": 12345 },
    { "tableName": "lands", "value": "王都" }
  ]
}
```

`active_playtime` / `first_join` / `last_seen` は epochミリ秒です。

### `GET /v1/history?limit=<件数>`

参加・退出のログを新しい順に返します。`limit` を省略すると `history-limit`（既定50）まで。

### `GET /v1/ranking?type=<種類>&limit=<件数>&order=desc|asc`

`type` に指定できる値:

| type | 内容 |
| --- | --- |
| `player_kills` | 対プレイヤーキル数（既定） |
| `mob_kills` | 対Mobキル数 |
| `deaths` | 死亡数 |
| `playtime` | プレイ時間（ミリ秒） |
| `blocks_placed` | 設置したブロック数 |
| `blocks_broken` | 破壊したブロック数 |
| `balance` | 所持金（Vault連携時のみ意味のある値） |

`limit` は既定10・最大100。`order=asc` を付けると昇順（値が小さい順）になります。

```json
{
  "type": "player_kills",
  "ranking": [
    { "rank": 1, "player": "Steve", "value": 42 },
    { "rank": 2, "player": "Alex", "value": 30 }
  ]
}
```

### `GET /v1/players?query=<文字列>&limit=<件数>&offset=<開始位置>`

名前の部分一致検索・一覧です。`query` を省略すると全員（名前順）。
`limit` は既定20・最大200、`offset` はページングに使います。

```json
{
  "total": 57,
  "players": [
    { "player": "Steve", "player_kills_total": 3, "mob_kills_total": 128,
      "deaths_total": 5, "blocks_placed_total": 4200, "blocks_broken_total": 5310,
      "active_playtime": 3600000, "last_seen": 1750000000000 }
  ]
}
```

## サイト側の中継（Vercel）

`api/` 以下の関数が、上記のHTTP APIをブラウザから直接呼べるように中継しています。

| Vercel側 | プラグイン側 |
| --- | --- |
| `api/get-stats.js` | `/v1/player` |
| `api/get-history.js` | `/v1/history` |
| `api/get-ranking.js` | `/v1/ranking` |
| `api/get-players.js` | `/v1/players` |

## jarファイルの入手方法

このリポジトリの **Actions** タブ → 「プラグインをビルド」ワークフロー →
最新の実行結果 → **Artifacts** から `VivaStatsAPI` をダウンロードすると、
中に `VivaStatsAPI.jar` が入っています。

（このリポジトリ内では、Paperの配布元へのアクセスが制限されていて
その場でビルドできないため、ネット制限のないGitHub Actions上で
自動ビルドしています。`plugin/` 以下を変更してpushするたびに、
自動で新しいjarが作られます。）

## 導入手順

1. 上記の方法で `VivaStatsAPI.jar` を入手する
2. サーバーの `plugins/` フォルダに置く
3. （所持金・所属タウンも取りたい場合は、Vault・Landsを先に入れておく）
4. サーバーを再起動（またはプラグインをリロード）する
5. 初回起動時に `plugins/VivaStatsAPI/config.yml` が自動生成されます
6. ポート `45678` への接続が、外部（Vercel）から届くことを確認してください
   （ファイアウォール・ルーターのポート開放が必要な場合があります）

### 動作確認

サーバーと同じマシン、または外部から次のように叩いて、JSONが返ってくれば成功です。

```
curl "http://localhost:45678/v1/player?player=あなたのゲーマーID"
curl "http://localhost:45678/v1/history"
curl "http://localhost:45678/v1/ranking?type=player_kills&limit=5"
curl "http://localhost:45678/v1/players?query=あ"
```

起動時のログに次のように出ていれば、Vault・Landsとの連携も成功しています。

```
[VivaStatsAPI] Vaultとの連携を有効化しました（所持金を取得します）。
[VivaStatsAPI] Landsとの連携を有効化しました（所属タウンを取得します）。
```

## 設定（config.yml）

| 項目 | 説明 |
| --- | --- |
| `port` | 待ち受けポート。変える場合は `api/get-*.js` 側のポート番号も合わせて変更してください |
| `bind-address` | 通常は `0.0.0.0` のままで大丈夫です |
| `token` | 空欄なら認証なし。値を入れると `Authorization: Bearer <値>` が無いリクエストを拒否します。設定する場合は、Vercel側の環境変数 `VIVA_STATS_API_TOKEN` にも同じ値を入れてください |
| `history-limit` | 接続履歴として保持する件数 |
| `save-interval-seconds` | 何秒おきにディスクへ保存するか |
| `track-blocks` | 設置・破壊したブロック数を数えるか（既定 true） |

## セキュリティについて

このAPIは認証なしだと誰でも読める状態になります（今のサイトの「プレイヤー統計」
「接続履歴」がもともと公開情報として設計されているためです）。より厳しくしたい
場合は `token` を設定してください。
