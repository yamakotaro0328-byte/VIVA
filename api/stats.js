// api/stats.js — サーバー（VivaStatsAPI）のデータをまとめて中継する
//
// サイトからは今までどおり /api/get-stats などで呼べる（vercel.json で、ここへ振り分けている）。
// 関数の数を増やさないように、1つにまとめた。
//
//   kind=player   … プレイヤー1人の記録（player）
//   kind=ranking  … ランキング（type, limit, order）
//   kind=players  … 名前の検索・一覧（query, limit, offset）
//   kind=history  … 直近の入退室
//   kind=online   … いま接続している人と、直近7日の人数
//   kind=lands    … 国家図鑑（土地・国・いまの戦争）
//   kind=events   … 年表（limit）
import { relay } from "./_viva.js";

const KINDS = {
  player: { path: "/v1/player", params: ["player"], cache: 30 },
  stats: { path: "/v1/player", params: ["player"], cache: 30 },
  ranking: { path: "/v1/ranking", params: ["type", "limit", "order"], cache: 60 },
  players: { path: "/v1/players", params: ["query", "limit", "offset"], cache: 60 },
  history: { path: "/v1/history", params: [], fixed: { limit: 20 }, cache: 20 },
  online: { path: "/v1/online", params: [], cache: 30 },
  lands: { path: "/v1/lands", params: [], cache: 60 },
  events: { path: "/v1/events", params: ["limit"], cache: 60 },
};

export default function handler(req, res) {
  const k = KINDS[String(req.query.kind || "")];
  if (!k) return res.status(404).json({ error: "unknown kind" });
  const params = { ...(k.fixed || {}) };
  for (const p of k.params) params[p] = req.query[p];
  return relay(res, k.path, params, { cache: k.cache });
}
