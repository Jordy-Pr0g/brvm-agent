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
    // Étape 1 : recherche web séparée
    const searchResponse = await fetch("https://api.anthropic.com/v1/messages", {
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
        system: "Tu es un assistant de recherche. Effectue une recherche web sur la BRVM et résume les informations trouvées en texte simple et concis. Maximum 400 mots.",
        messages: [{ role: "user", content: `Recherche web: ${query}` }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    let searchResults = "";
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      searchResults = (searchData.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .slice(0, 1500);
    }

    // Étape 2 : formatage JSON séparé (sans recherche web = tokens réduits)
    const formatResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: `Transforme ce texte en JSON valide. Réponds UNIQUEMENT avec ce JSON, rien d'autre:
{"type":"analyse","titre":"[titre court]","contenu":"[résumé en 2-3 phrases]","points_cles":["point 1","point 2","point 3","point 4"],"donnees":[{"label":"[nom]","valeur":"[valeur]"}]}
- points_cles: liste des faits importants
- donnees: chiffres clés (cours, indices, volumes...)
- Garde tout en français`,
        messages: [{ 
          role: "user", 
          content: `Texte à formater:\n${searchResults || "Aucune donnée trouvée pour: " + query}` 
        }],
      }),
    });

    if (!formatResponse.ok) {
      const err = await formatResponse.text();
      return res.status(formatResponse.status).json({ error: err });
    }

    const formatData = await formatResponse.json();
    const text = (formatData.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    // Extraction JSON robuste
    let result;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      result = JSON.parse(match ? match[0] : text);
    } catch {
      // Fallback : on construit un JSON depuis le texte brut
      const lines = searchResults
        .split("\n")
        .filter((l) => l.trim().length > 20)
        .slice(0, 5);
      result = {
        type: "analyse",
        titre: query.slice(0, 60),
        contenu: searchResults.slice(0, 300) || "Données non disponibles.",
        points_cles: lines.length ? lines.map((l) => l.trim().slice(0, 120)) : ["Aucune donnée trouvée"],
        donnees: [],
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
