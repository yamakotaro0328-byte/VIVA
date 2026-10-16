// api/discord-news.js — Discordの「お知らせ」チャンネルの投稿を、サイトにも載せる
//
// しくみ:
//   Discordのボットで、お知らせチャンネルの最新の投稿を読み、サイト用に整えて返す。
//   5分ごとに読み直すので、Discordに書けば少し待つだけでサイトにも出る。
//
// Vercel の環境変数:
//   DISCORD_BOT_TOKEN       … 必須。Discord Developer Portal で作ったボットのトークン
//   DISCORD_NEWS_CHANNEL_ID … 必須。お知らせチャンネルのID（チャンネルを右クリック →「IDをコピー」）
//
// ボット側の準備:
//   - ボットをサーバーに招待し、お知らせチャンネルの「チャンネルを見る」「メッセージ履歴を読む」を許可する
//   - Developer Portal の Bot 設定で「MESSAGE CONTENT INTENT」をオンにする（本文を読むため）

const API = "https://discord.com/api/v10";
const LIMIT = 15;

function clean(text) {
  return String(text || "")
    .replace(/<a?:(\w+):\d+>/g, ":$1:")       // カスタム絵文字
    .replace(/<@!?\d+>/g, "@メンバー")          // 個人へのメンション
    .replace(/<@&\d+>/g, "")                   // ロールへのメンション
    .replace(/@(everyone|here)/g, "")
    .replace(/<#\d+>/g, "#チャンネル")
    .replace(/<t:(\d+)(:\w)?>/g, (m, t) => new Date(Number(t) * 1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }))
    .trim()
    .slice(0, 2000);
}

export default async function handler(req, res) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channel = process.env.DISCORD_NEWS_CHANNEL_ID;
  if (!token || !channel) {
    res.setHeader("Cache-Control", "public, s-maxage=300");
    return res.status(200).json({ available: false, posts: [] });
  }
  if (!/^\d{5,25}$/.test(channel)) {
    return res.status(500).json({ available: false, posts: [], error: "bad channel id" });
  }

  try {
    const r = await fetch(`${API}/channels/${channel}/messages?limit=${LIMIT}`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) {
      console.error("discord error", r.status, (await r.text()).slice(0, 300));
      res.setHeader("Cache-Control", "public, s-maxage=60");
      return res.status(502).json({ available: true, posts: [], error: "discord" });
    }
    const messages = await r.json();
    const posts = (Array.isArray(messages) ? messages : [])
      .filter((m) => m && (m.type === 0 || m.type === 19))
      .map((m) => {
        const images = (m.attachments || [])
          .filter((a) => /^image\//.test(a.content_type || "") || /\.(png|jpe?g|gif|webp)$/i.test(a.filename || ""))
          .slice(0, 4)
          .map((a) => ({ url: a.proxy_url || a.url, width: a.width || 0, height: a.height || 0 }));
        const embeds = (m.embeds || [])
          .filter((e) => e.title || e.description)
          .slice(0, 2)
          .map((e) => ({ title: clean(e.title).slice(0, 200), text: clean(e.description).slice(0, 800) }));
        return {
          id: m.id,
          time: Date.parse(m.timestamp) || 0,
          author: (m.author && (m.author.global_name || m.author.username)) || "",
          text: clean(m.content),
          images,
          embeds,
        };
      })
      .filter((p) => p.text || p.images.length || p.embeds.length);

    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=1200");
    return res.status(200).json({ available: true, posts });
  } catch (e) {
    console.error("discord-news failed", e);
    res.setHeader("Cache-Control", "public, s-maxage=60");
    return res.status(502).json({ available: true, posts: [], error: "network" });
  }
}
