// api/push.js — VIVA Portal の通知（「サーバーが開いた」「戦争が始まった」）
//
// しくみ:
//   1. VIVA Portal で通知をオンにすると、ブラウザの「送り先」をここに登録する（Upstash Redis に保存）
//   2. サーバー（VivaStatsAPI）が起動したときや宣戦布告があったときに、ここへ知らせが来る
//   3. 登録されている端末に、まとめて通知を送る
//
// Vercel の環境変数:
//   KV_REST_API_URL / KV_REST_API_TOKEN … 必須。Vercel の Storage から Upstash（Redis）をつなぐと自動で入る
//     （UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN という名前でも可）
//   VIVA_STATS_API_TOKEN … 必須（通知を送らせるため）。プラグインの config.yml の token と同じ値
//
// 送り主の鍵（VAPID）は最初に使ったときに自動で作り、Redis にしまっておく。
//
//   GET  /api/push?action=key                         … 通知が使えるか・公開鍵
//   POST /api/push?action=subscribe   {subscription, topics}
//   POST /api/push?action=unsubscribe {endpoint}
//   POST /api/push?action=test        {endpoint}       … その端末にだけ試しの通知
//   POST /api/push?action=notify      {topic, title, body, url}（Authorization: Bearer <token>）

import crypto from "node:crypto";
import { generateVapidKeys, isPushEndpoint, sendPush } from "./_webpush.js";

const REDIS_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const SUBS = "viva:push:subs";
const VAPID = "viva:push:vapid";
const TOPICS = ["open", "war"];
const MAX_SUBS = 5000;

async function redis(...cmd) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(5000),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.result;
}

let vapidCache = null;
async function vapidKeys() {
  if (vapidCache) return vapidCache;
  let raw = await redis("GET", VAPID);
  if (!raw) {
    // 同時に2つ作られても、先に保存された方を使う
    await redis("SET", VAPID, JSON.stringify(generateVapidKeys()), "NX");
    raw = await redis("GET", VAPID);
  }
  vapidCache = JSON.parse(raw);
  return vapidCache;
}

const idOf = (endpoint) => crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 32);

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    return {};
  }
}

function sameToken(given, expected) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const testLimit = new Map();

export default async function handler(req, res) {
  const action = String(req.query.action || "");
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(action === "key" ? 200 : 503).json({ available: false, error: "通知は準備中です。" });
  }

  try {
    if (action === "key" && req.method === "GET") {
      const keys = await vapidKeys();
      res.setHeader("Cache-Control", "public, s-maxage=3600");
      return res.status(200).json({ available: true, publicKey: keys.publicKey, topics: TOPICS });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const body = readBody(req);

    if (action === "subscribe") {
      const sub = body.subscription || {};
      if (!isPushEndpoint(sub.endpoint) || !sub.keys || typeof sub.keys.p256dh !== "string" || typeof sub.keys.auth !== "string"
          || sub.keys.p256dh.length > 120 || sub.keys.auth.length > 60) {
        return res.status(400).json({ error: "この端末の通知の登録に失敗しました。" });
      }
      const topics = (Array.isArray(body.topics) ? body.topics : []).filter((t) => TOPICS.includes(t));
      const id = idOf(sub.endpoint);
      if (!topics.length) {
        await redis("HDEL", SUBS, id);
        return res.status(200).json({ ok: true, topics: [] });
      }
      if ((await redis("HLEN", SUBS)) >= MAX_SUBS && !(await redis("HEXISTS", SUBS, id))) {
        return res.status(503).json({ error: "登録がいっぱいです。運営に知らせてください。" });
      }
      await redis("HSET", SUBS, id, JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, topics, at: Date.now() }));
      return res.status(200).json({ ok: true, topics });
    }

    if (action === "unsubscribe") {
      if (typeof body.endpoint === "string") await redis("HDEL", SUBS, idOf(body.endpoint));
      return res.status(200).json({ ok: true });
    }

    if (action === "test") {
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
      const last = testLimit.get(ip) || 0;
      if (Date.now() - last < 30000) return res.status(429).json({ error: "少し待ってから試してください。" });
      testLimit.set(ip, Date.now());
      if (typeof body.endpoint !== "string") return res.status(400).json({ error: "bad request" });
      const raw = await redis("HGET", SUBS, idOf(body.endpoint));
      if (!raw) return res.status(404).json({ error: "この端末はまだ登録されていません。" });
      const status = await sendPush(JSON.parse(raw), {
        title: "VIVA Portal", body: "通知は正しく届いています。サーバーが開いたら、ここでお知らせします。", url: "/portal.html", tag: "viva-test",
      }, await vapidKeys());
      return res.status(status < 300 ? 200 : 502).json({ ok: status < 300 });
    }

    if (action === "notify") {
      const token = process.env.VIVA_STATS_API_TOKEN || "";
      const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (!token || !sameToken(auth, token)) return res.status(401).json({ error: "unauthorized" });
      const topic = TOPICS.includes(body.topic) ? body.topic : "";
      if (!topic) return res.status(400).json({ error: "unknown topic" });

      // 同じ種類の通知を短い間に何度も送らない（サーバーの再起動が続いたときなど）
      const gap = topic === "open" ? 600 : 60;
      if (!(await redis("SET", `viva:push:last:${topic}`, String(Date.now()), "NX", "EX", gap))) {
        return res.status(200).json({ ok: true, skipped: "too soon" });
      }
      const payload = {
        title: String(body.title || "VIVA-MC").slice(0, 80),
        body: String(body.body || "").slice(0, 200),
        url: /^\/[\w\-./?=&%#]*$/.test(String(body.url || "")) ? body.url : "/portal.html",
        tag: `viva-${topic}`,
      };
      const all = (await redis("HGETALL", SUBS)) || [];
      const keys = await vapidKeys();
      const targets = [];
      for (let i = 0; i < all.length; i += 2) {
        try {
          const s = JSON.parse(all[i + 1]);
          if ((s.topics || []).includes(topic)) targets.push([all[i], s]);
        } catch {
          // 壊れた登録は飛ばす
        }
      }
      let sent = 0, gone = 0;
      for (let i = 0; i < targets.length; i += 25) {
        await Promise.all(targets.slice(i, i + 25).map(async ([id, s]) => {
          try {
            const status = await sendPush(s, payload, keys);
            if (status === 404 || status === 410) {
              gone++;
              await redis("HDEL", SUBS, id);
            } else if (status < 300) sent++;
          } catch {
            // 届かなかった端末は次の機会に
          }
        }));
      }
      return res.status(200).json({ ok: true, sent, removed: gone, total: targets.length });
    }

    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    console.error("push failed", e);
    return res.status(500).json({ error: "通知の処理に失敗しました。" });
  }
}
