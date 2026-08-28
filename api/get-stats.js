// api/get-stats.js
export default async function handler(req, res) {
  const { player } = req.query;

  try {
    const headers = {};
    // VivaStatsAPI側でtokenを設定している場合は、Vercelの環境変数
    // VIVA_STATS_API_TOKEN に同じ値を入れておくと、ここで自動的に送られます。
    if (process.env.VIVA_STATS_API_TOKEN) {
      headers.Authorization = `Bearer ${process.env.VIVA_STATS_API_TOKEN}`;
    }

    // Vercelのサーバーから内部的にHTTPのAPIを叩く
    const response = await fetch(
      `http://viva-mc.net:25566/v1/player?player=${encodeURIComponent(player || "")}`,
      { headers }
    );
    const data = await response.json();

    // ブラウザ側の404判定が効くよう、上流のステータスをそのまま伝える
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
}
