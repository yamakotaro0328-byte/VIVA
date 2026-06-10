// api/get-stats.js
export default async function handler(req, res) {
  const { player } = req.query;

  try {
    // Vercelのサーバーから内部的にHTTPのAPIを叩く
    const response = await fetch(`http://VIVA-mc.net:25566/v1/player?player=${player}`);
    const data = await response.json();
    
    // ブラウザに結果を返す
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
}
