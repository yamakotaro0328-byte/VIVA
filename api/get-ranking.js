// api/get-ranking.js
export default async function handler(req, res) {
  const { type, limit, order } = req.query;

  try {
    const headers = {};
    // VivaStatsAPI側でtokenを設定している場合は、Vercelの環境変数
    // VIVA_STATS_API_TOKEN に同じ値を入れておくと、ここで自動的に送られます。
    if (process.env.VIVA_STATS_API_TOKEN) {
      headers.Authorization = `Bearer ${process.env.VIVA_STATS_API_TOKEN}`;
    }

    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (limit) params.set("limit", limit);
    if (order) params.set("order", order);

    // Vercelのサーバーから内部的にHTTPのAPIを叩く
    const response = await fetch(
      `http://viva-mc.net:45678/v1/ranking?${params.toString()}`,
      { headers }
    );
    const data = await response.json();

    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
}
