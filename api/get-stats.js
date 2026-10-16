// api/get-stats.js — プレイヤー1人の記録
import { relay } from "./_viva.js";

export default function handler(req, res) {
  return relay(res, "/v1/player", { player: req.query.player }, { cache: 30 });
}
