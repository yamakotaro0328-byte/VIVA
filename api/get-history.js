// api/get-history.js
export default async function handler(req, res) {
  try {
    const headers = {};
    if (process.env.VIVA_STATS_API_TOKEN) {
      headers.Authorization = `Bearer ${process.env.VIVA_STATS_API_TOKEN}`;
    }

    const response = await fetch("http://viva-mc.net:25566/v1/history?limit=20", { headers });
    const data = await response.json();

    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
}
