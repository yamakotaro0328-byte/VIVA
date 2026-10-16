// api/get-ranking.js — ランキング（type: player_kills / mob_kills / deaths / playtime / blocks_placed / blocks_broken / balance / login_count）
import { relay } from "./_viva.js";

export default function handler(req, res) {
  const { type, limit, order } = req.query;
  return relay(res, "/v1/ranking", { type, limit, order }, { cache: 60 });
}
