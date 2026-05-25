export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Paramètre query manquant" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Clé API non configurée" });

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
        max_tokens: 1500,
        system: `Tu es un agent financier expert de la BRVM (Bourse Régionale des Valeurs Mobilières). Effectue des recherches web pour obtenir les données les plus récentes. Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks, sans texte autour. Utilise ces formats selon la demande:
- Indices: {"type":"indices","updated":"...","items":[{"nom":"","valeur":"","variation_pct":"","ytd":"","description":""}]}
- Cours: {"type":"cours","updated":"...","items":[{"ticker":"","societe":"","secteur":"","cours":"","variation_pct":"","volume":""}]}
- Actualités: {"type":"news","items":[{"titre":"","source":"","date":"","resume":"","categorie":""}]}
- Synthèse: {"type":"synthese","resume_marche":"","sentiment":"haussier|baissier|neutre","indices":[],"top_hausses":[{"ticker":"","societe":"","variation_pct":""}],"top_baisses":[{"ticker":"","societe":"","variation_pct":""}],"news_cles":[{"titre":"","resume":""}]}
- Analyse: {"type":"analyse","titre":"","contenu":"","points_cles":[],"donnees":[{"label":"","valeur":""}]}`,
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
      .join("\n");

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: "Réponse vide", raw: text.slice(0, 200) });

    return res.status(200).json(JSON.parse(match[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
