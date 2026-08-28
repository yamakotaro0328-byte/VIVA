# VivaStatsAPI

VIVA-MC公式サイトの「プレイヤー統計」「接続履歴」を、実際に動くようにするための
Paperプラグインです。サイト側のコード（`api/get-stats.js` / `api/get-history.js`）は
このプラグインが `viva-mc.net:25566` でHTTP APIを公開している前提で書かれています。

## できること

- キル数（対プレイヤー／対Mob）、死亡数、プレイ時間を記録し、
  `GET /v1/player?player=<名前>` で返す
- 誰がいつ入った／抜けたかを直近50件（設定で変更可）記録し、
  `GET /v1/history` で返す

所持金（Vaultの残高）と所属タウン（Lands）は、まだこのプラグイン単体では
取得していません（`stats` に空の値を返します。サイト側は自動で「$0」
「未所属」と表示するので、エラーにはなりません）。将来つなぎ込む場合は
`ApiServer.java` の該当箇所を差し替えてください。

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
3. サーバーを再起動（またはプラグインをリロード）する
4. 初回起動時に `plugins/VivaStatsAPI/config.yml` が自動生成されます
5. ポート `25566` への接続が、外部（Vercel）から届くことを確認してください
   （ファイアウォール・ルーターのポート開放が必要な場合があります）

### 動作確認

サーバーと同じマシン、または外部から次のように叩いて、JSONが返ってくれば成功です。

```
curl "http://localhost:25566/v1/player?player=あなたのゲーマーID"
curl "http://localhost:25566/v1/history"
```

## 設定（config.yml）

| 項目 | 説明 |
| --- | --- |
| `port` | 待ち受けポート。変える場合は `api/get-stats.js` / `api/get-history.js` 側のポート番号も合わせて変更してください |
| `bind-address` | 通常は `0.0.0.0` のままで大丈夫です |
| `token` | 空欄なら認証なし。値を入れると `Authorization: Bearer <値>` が無いリクエストを拒否します。設定する場合は、Vercel側の環境変数 `VIVA_STATS_API_TOKEN` にも同じ値を入れてください |
| `history-limit` | 接続履歴として保持する件数 |
| `save-interval-seconds` | 何秒おきにディスクへ保存するか |

## セキュリティについて

このAPIは認証なしだと誰でも読める状態になります（今のサイトの「プレイヤー統計」
「接続履歴」がもともと公開情報として設計されているためです）。より厳しくしたい
場合は `token` を設定してください。
