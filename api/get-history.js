// api/get-history.js — 直近の入退室
import { relay } from "./_viva.js";

export default function handler(req, res) {
  return relay(res, "/v1/history", { limit: 20 }, { cache: 20 });
}
