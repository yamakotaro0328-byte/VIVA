# VIVA-MC サーバー詳細（プラグイン開発用）

> この文章は、AIにプラグインを作ってもらうときに、最初にまとめて貼り付けるための資料です。
> 作るプラグインは一般に公開する前提です（VIVA-MCで最初に動かし、ほかのサーバーでも使えるようにする）。
> 「【要確認】」と書いてある所は、まだ運営が確かめていない項目です。分かったら書き換えてください。
> 最終更新: 2026.10.10

---

## AIへのお願い（最初に読んでほしいこと）

あなたは、日本のMinecraftサーバー「VIVA-MC」の運営と一緒にプラグインを作る開発者です。
作るプラグインは **VIVA-MCで使うだけでなく、一般に公開（配布）する前提** です。
「VIVA-MCで最初に動かす。ほかのサーバーでもそのまま使える」ように作ってください。以下の条件を守ってください。

### 動作・品質

1. **Paper（26.2）用のプラグインとして作る。** Java 25 でビルドし、Maven を使う。
2. Paper の公開API（`paper-api`）だけを使う。**NMS・CraftBukkit の内部コードは使わない**（アップデートのたびに壊れるため）。
3. 他のプラグインと連携するときは、**入っていなくても落ちない**ようにする（`softdepend` にして、無ければその機能だけ止める）。
   お金は特定の経済プラグインに直接つながず、**Vault の Economy API** を通す（どの経済プラグインでも動くように）。
4. Bukkit API（ブロック・エンティティ・インベントリ・プレイヤー操作）は**メインスレッドだけ**で触る。重い処理（ファイル保存・HTTP・データベース）は非同期にする。
5. 毎tick動く処理や、全プレイヤー・全チャンクを回す処理は避ける。VIVA-MCは過去に **TPSの低下でサーバーを止めた**ことがあるので、軽さを最優先にする。
6. 統合版プレイヤーはクリック操作の多いGUIが使いにくいことがあるので、大事な操作はコマンドでもできるようにする（例: `/ok` のような短いコマンド）。
7. コマンドには Tab 補完をつけ、設定を読み直す `/<プラグイン名> reload` を用意する。

### 公開するための作り

8. **VIVA-MC専用のことをコードに書かない。** サーバーの名前・ワールド名・Velocity 上のサーバー名（`hub` など）・金額・通貨記号（`$`）・Discordのリンクなどは、すべて `config.yml` で変えられるようにする。初期値はVIVA-MCではなく、どのサーバーでも通じる値にする。
9. **メッセージは `messages.yml` などの別ファイルに出す。** 日本語（`ja`）と英語（`en`）を同梱し、`config.yml` の `language` で切り替えられるようにする。色やプレフィックスも変えられるようにする（MiniMessage 形式がおすすめ）。
10. **すべてのコマンド・機能に権限ノード**をつける（例: `<プラグイン名>.use`、`<プラグイン名>.admin`）。一般向けは `default: true`、管理用は `default: op`。
11. パスワード・APIキー・トークンなどの秘密は、**コードやリポジトリに書かない**（`config.yml` に空欄で用意し、各サーバーで入力してもらう）。
12. 外部への通信（アップデート確認・統計送信など）をするときは、`config.yml` でオフにできるようにし、README に何を送るか書く。
13. 設定ファイルに `config-version` を入れ、新しいバージョンで項目が増えても、古い設定を壊さずに足せるようにする。
14. バージョン番号は `1.0.0` のような形（メジャー.マイナー.パッチ）にする。
15. 他人のコードや素材を使うときは、ライセンスを確認して README に書く。

### 出してほしいもの

16. 完成したら、次をまとめて出す。
    - ソース一式・`plugin.yml`（または `paper-plugin.yml`）・`config.yml`・`messages.yml`（ja/en）・`pom.xml`
    - ビルド方法（GitHub Actions のワークフローも）
    - **README（日本語と英語）**: 何ができるか・対応バージョン・必要／連携プラグイン・インストール方法・コマンドと権限の一覧・設定の説明
    - 公開ページ（Modrinth・Hangar）に載せる短い紹介文（日本語・英語）
    - 更新履歴（CHANGELOG）

---

## 1. サーバーの概要

| 項目 | 内容 |
|---|---|
| サーバー名 | VIVA-MC |
| テーマ | プレイヤーが国をつくり、法律・経済・外交で国を運営するサーバー（領土・国家・戦争・経済） |
| アドレス | `viva-mc.net`（Java版 ポート25565 ／ 統合版 ポート19132） |
| 公式サイト | https://www.viva-mc.net |
| Discord | https://discord.gg/ECUTZeTZZV |
| 管理者 | kot0328 |
| 参加 | 無料・Java版と統合版（Bedrock）の両方から参加できる |
| 言語 | 日本語 |

## 2. バージョン・動作環境

| 項目 | 内容 |
|---|---|
| Minecraft | **Java Edition 26.2**（プロトコル 776） |
| サーバーソフト | Paper 26.2 【要確認: Paper / Purpur などどれか、ビルド番号】 |
| Java | **Java 25**（26.2 の動作に必要） |
| プロキシ | **Velocity**（2026.08.27 から。最新の velocity-api は 4.2.0） |
| 統合版対応 | ポート19132 で接続できる 【要確認: Geyser + Floodgate を使っているか、どのサーバーに入っているか】 |
| リソースパック | VIVA-MC公式パック（pack format 88〜97 ＝ 26.2〜26.3 対応）。全アイテム・全ブロックを描き直したもの |

### プラグイン開発で使う依存関係（Maven）

```xml
<repositories>
    <repository>
        <id>papermc</id>
        <url>https://repo.papermc.io/repository/maven-public/</url>
    </repository>
</repositories>

<dependencies>
    <!-- Paper 26.2 の API。26.2 のビルドは「26.2.build.<番号>-stable」という形 -->
    <dependency>
        <groupId>io.papermc.paper</groupId>
        <artifactId>paper-api</artifactId>
        <version>26.2.build.133-stable</version>
        <scope>provided</scope>
    </dependency>
</dependencies>

<properties>
    <maven.compiler.release>25</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
</properties>
```

- Velocity 用のプラグインを作るときは `com.velocitypowered:velocity-api:4.2.0`（同じリポジトリ）。
- `plugin.yml` の `api-version` は、使う Paper に合わせる（26.2 なら `'26.2'`）。
  ※ 既存の VivaStatsAPI は古い設定（paper-api 1.21.4・Java 21・`api-version: '1.21'`）のままなので、作り直すときは上に合わせる。

## 3. サーバー構成（Velocityの下にあるサーバー）

| サーバー | 役割 | 行き方 |
|---|---|---|
| ロビー（hub） | 最初に入る場所。中央のポータルから市場・カジノへ。資源ワールド行きのNPCがいる | `/server hub` |
| メイン（サバイバル） | 国づくりの本番。Lands・Jobs・ショップ・経済が動いている | ロビーから 【要確認: サーバー名】 |
| 資源ワールド | みんなで掘る共有ワールド。**毎月15日 0時にリセット**。Lands や Jobs は働かない | ロビーのNPC |
| 建築サーバー | 建築専用。WorldGuard + WorldEdit で自分の建築を保護できる | `/server build` |
| イベントサーバー | イベント用（メモリ5GB） | 【要確認】 |

- 所持金がサーバー間で共有されているかどうか 【要確認】
- 各サーバーで入っているプラグインの違い 【要確認】

## 4. 導入しているプラグイン

| プラグイン | 役割 | 主なコマンド・連携のポイント |
|---|---|---|
| **Lands** | 土地保護・国家・外交・戦争。サーバーの中心 | `/lands` `/claim` `/land <土地名> ...` `/nations create` `/land <土地名> war declare` など。土地ごとの銀行・税金・維持費・貸し借りあり。API: `me.angeschossen:LandsAPI` |
| **EcoTP** | 所持金（通貨）とホーム・テレポート（2026.08.28 に EssentialsX から移行） | `/balance` `/pay` `/baltop` `/sethome` `/home` `/homes` `/delhome` `/spawn` `/tpa` `/tphere` `/accept` `/ok` `/tpdeny` `/tpacancel` `/menu`。テレポートは距離に応じて有料、動いたり敵Mob・戦闘で中断（中断時は無料） 【要確認: Vault の Economy として登録されているか】 |
| **Jobs Reborn** | 職業で稼ぐ | `/jobs browse` `/jobs join` `/jobs stats` など。職業: 採掘師・木こり・農家・狩人・建築家・漁師 |
| **QuickShop-Hikari** | チェストショップ（販売・買取） | `/qs price` `/qs mode buy/sell` |
| **Shopkeepers** | 村人の物々交換ショップ | — |
| **Villager Market** | 村人の市場に出店 | — |
| **GambleGate** | カジノ（スロット・ハイ＆ロー・クラッシュ・物理ルーレット）。入場パス制 | コマンド不要（椅子・ボタン・GUI） 【要確認: 自作か配布か】 |
| **DiscordSRV** | Discordとチャット連携・アカウントリンク | `/discord link` `/discord status` `/discord unlink` |
| **InfiniteVehicles** | 乗り物（専用リソースパックあり） | `/iv` |
| **WorldGuard / WorldEdit** | 建築サーバーの保護 | `//wand` `/rg define` `/rg addmember` など |
| **VivaStatsAPI**（自作） | 公式サイト用に統計をHTTPで公開 | ポート45678。下の「5」を参照 |
| /report の投票追放プラグイン | 荒らしをみんなの投票で追放 | `/report`（`/r`） 【要確認: プラグイン名】 |
| Vault | 経済の共通窓口 | 【要確認: 入っているか】 |
| 権限管理 | — | 【要確認: LuckPerms など】 |

**削除済み（使っていない）:** EssentialsX（→EcoTPへ移行）、Nova / Nova-FarmersDelight（2026.09.16 削除）

### 経済について

- 通貨の表示は **`$`**（例: `$1,000,000`）。すべてゲーム内通貨。
- 稼ぎ方: Jobs Reborn、チェストショップ、村人ショップ。
- 使い道: ショップ、ホーム・テレポート代、土地の保護費・税金・維持費、カジノ。
- **リアルマネートレード（RMT）は禁止**。現金や現実のお金と交換できる仕組みは作らない。

## 5. 自作プラグイン VivaStatsAPI（既存）

公式サイトの「プレイヤー統計」「接続履歴」用。ソースはこのリポジトリの `plugin/`。

- パッケージ: `net.vivamc.statsapi`、メインクラス `VivaStatsAPI`
- HTTPサーバー（ポート `45678`）で JSON を返す
  - `GET /v1/player?player=<名前>` … キル数・死亡数・設置/破壊ブロック数・プレイ時間・所持金・所属タウンなど
  - `GET /v1/history` … 直近の入退室
  - `GET /v1/ranking?type=<種類>` … ランキング
  - `GET /v1/players?query=<文字列>` … 名前検索
- Vault（所持金）と Lands（所属）は `softdepend`。Lands はバージョン差に備えてリフレクションで呼んでいる
- Bukkit API は `callSyncMethod` でメインスレッドから呼んでいる
- GitHub Actions（`.github/workflows/build-plugin.yml`）で `mvn -B package` → `VivaStatsAPI.jar` を作成

新しいプラグインも、同じ作り方（Maven・GitHub Actions でビルド・softdepend）にそろえると管理しやすい。
ただし VivaStatsAPI はVIVA-MC専用なので、メッセージの多言語化などはしていない。公開するプラグインは「AIへのお願い」の条件に合わせる。

## 6. 公開（配布）について

| 項目 | 内容 |
|---|---|
| 作者名 | VIVA-MC 【要確認: 個人名（kot0328）にするか、チーム名にするか】 |
| パッケージ名 | `net.vivamc.<プラグイン名>`（例: `net.vivamc.nationtop`）。全部小文字 |
| 公開先 | Modrinth と Hangar（PaperMC公式）がおすすめ。ソースは GitHub 【要確認】 |
| ライセンス | 【要確認】おすすめは **MIT**（だれでも自由に使える）。改造版にもソース公開を求めたいなら **GPL-3.0** |
| 対応バージョン | 26.2 以上（動作確認したバージョンを README と公開ページに書く） |
| 言語 | 日本語と英語（`messages.yml` を同梱） |
| 動作確認 | まず VIVA-MC のテスト環境で確かめてから公開する |
| 配布するファイル | GitHub Actions でビルドした `.jar`（バージョン番号入りのファイル名。例: `NationTop-1.0.0.jar`） |

- 公開するプラグインには、VIVA-MCの中だけの情報（内部のサーバー名・管理者用のアドレスなど）を入れない。
- Minecraft・Mojang の名前やロゴを、公式のように見える使い方をしない。

## 7. VIVA-MCで使うときの決まりごと（プラグインに関係するルール）

公開版の初期設定には入れず、**VIVA-MC側の `config.yml` で合わせる**ものです。

- **荒らしの禁止は「領土内」のみ。** 領土の外は保護されていない（Landsで保護するのが前提）。
- 荒らし被害などの対応は、**Discordのチケット**で受け付ける。
- **RMT禁止**、**ラグマシン禁止**、X-Ray などの不正クライアントは一発BAN。現金と交換する機能は作らない。
- 資源ワールドは毎月リセットされるので、資源ワールドにデータを残す機能はオフにできるようにする。
- 利用規約・プライバシーポリシーは公式サイト（`terms.html` / `privacy.html`）。プレイヤーの情報を新しく外部に出す機能を作るときは、プライバシーポリシーの更新が必要。

## 8. 作ってほしいプラグインの書き方（テンプレ）

AIに頼むときは、この資料のあとに下を埋めて貼ってください。

```
【プラグインの名前】
（例: NationTop　※公開するので、ほかと重ならない英語の名前）

【作りたいもの】
（例: 国ごとの人口ランキングを /nationtop で見られるようにしたい）

【誰が使うか】
（全員 ／ 運営だけ ／ 国のリーダーだけ など）

【どのサーバーに入れるか】
（メイン ／ ロビー ／ 建築 ／ イベント ／ Velocity）

【連携したいプラグイン】
（Lands ／ Vault（お金） ／ Jobs ／ DiscordSRV ／ なし など。どれも「入っていなくても動く」ようにする）

【お金を使う・もらう？】
（使う場合はいくら、どこから払うか）

【その他の希望】
（GUIがいい、統合版でも使いやすく、など）
```
