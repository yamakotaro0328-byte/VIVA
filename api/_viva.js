// api/_viva.js — VivaStatsAPI（サーバーのプラグイン）へ中継するための共通部品
// （ファイル名が _ で始まるので、これ自体はAPIとして公開されない）
//
// Vercel の環境変数:
//   VIVA_STATS_API_URL   … 任意。プラグインのアドレス（既定: http://viva-mc.net:45678）
//   VIVA_STATS_API_TOKEN … 任意。プラグインの config.yml の token と同じ値

const BASE = (process.env.VIVA_STATS_API_URL || "http://viva-mc.net:45678").replace(/\/+$/, "");

/**
 * プラグインの path を呼んで、その答えをそのままブラウザへ返す。
 * サーバーが止まっていても待ち続けないよう、timeout ミリ秒で切り上げる。
 * cache 秒のあいだは Vercel 側で答えを使い回す（アクセスが集中してもサーバーに負担をかけない）。
 */
export async function relay(res, path, params = {}, { cache = 30, timeout = 6000 } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v).slice(0, 64));
  }
  const headers = {};
  if (process.env.VIVA_STATS_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.VIVA_STATS_API_TOKEN}`;
  }

  try {
    const r = await fetch(`${BASE}${path}${qs.toString() ? `?${qs}` : ""}`, {
      headers,
      signal: AbortSignal.timeout(timeout),
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "bad response" });
    }
    if (r.ok) {
      res.setHeader("Cache-Control", `public, s-maxage=${cache}, stale-while-revalidate=${cache * 4}`);
    }
    return res.status(r.status).json(data);
  } catch {
    // つながらない（サーバー停止中・プラグイン未導入など）
    res.setHeader("Cache-Control", "public, s-maxage=20");
    return res.status(503).json({ error: "offline" });
  }
}
