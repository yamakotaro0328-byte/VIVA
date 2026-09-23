// api/get-players.js
export default async function handler(req, res) {
  const { query, limit, offset } = req.query;

  try {
    const headers = {};
    if (process.env.VIVA_STATS_API_TOKEN) {
      headers.Authorization = `Bearer ${process.env.VIVA_STATS_API_TOKEN}`;
    }

    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (limit) params.set("limit", limit);
    if (offset) params.set("offset", offset);

    const response = await fetch(
      `http://viva-mc.net:45678/v1/players?${params.toString()}`,
      { headers }
    );
    const data = await response.json();

    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
}
