// api/get-lands.js — 国家図鑑（土地・国・いまの戦争）
import { relay } from "./_viva.js";

export default function handler(req, res) {
  return relay(res, "/v1/lands", {}, { cache: 60 });
}
