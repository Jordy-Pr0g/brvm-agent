export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Query manquant" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Clé API manquante" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: `Expert BRVM. Recherche web puis réponds UNIQUEMENT en JSON:
{"type":"analyse","titre":"...","contenu":"...","points_cles":["..."],"donnees":[{"label":"...","valeur":"..."}]}
- contenu: 3-4 phrases détaillées avec chiffres
- points_cles: 5-6 faits précis avec chiffres et dates
- donnees: 4-6 indicateurs clés chiffrés
JSON uniquement, pas de texte autour.`,
        messages: [{ role: "user", content: query }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    let result;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      result = JSON.parse(match ? match[0] : text);
    } catch {
      result = {
        type: "analyse",
        titre: query.slice(0, 60),
        contenu: text.slice(0, 400) || "Données non disponibles.",
        points_cles: text.split("\n").filter(l => l.trim().length > 20).slice(0, 5).map(l => l.trim()),
        donnees: [],
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
