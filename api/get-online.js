// api/get-online.js — いま接続している人と、直近7日の人数の移り変わり
import { relay } from "./_viva.js";

export default function handler(req, res) {
  return relay(res, "/v1/online", {}, { cache: 30 });
}
