// api/get-players.js — プレイヤーの名前検索・一覧
import { relay } from "./_viva.js";

export default function handler(req, res) {
  const { query, limit, offset } = req.query;
  return relay(res, "/v1/players", { query, limit, offset }, { cache: 60 });
}
