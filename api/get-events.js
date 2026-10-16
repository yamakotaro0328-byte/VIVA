// api/get-events.js — 戦争・外交・建国などの年表
import { relay } from "./_viva.js";

export default function handler(req, res) {
  return relay(res, "/v1/events", { limit: req.query.limit }, { cache: 60 });
}
