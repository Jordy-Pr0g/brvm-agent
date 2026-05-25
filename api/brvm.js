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
    // Étape 1 : recherche web approfondie avec plusieurs angles
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
        max_tokens: 2000,
        system: `Tu es un analyste financier expert de la BRVM (Bourse Régionale des Valeurs Mobilières d'Afrique de l'Ouest). 
Effectue plusieurs recherches web pour collecter un maximum d'informations récentes et détaillées.
Pour chaque recherche, note:
- Les chiffres exacts (cours, indices, variations, volumes)
- Les dates précises
- Les noms des sociétés et secteurs
- Les sources (sites web, journaux financiers)
Compile toutes les informations trouvées de façon exhaustive. Ne résume pas, donne tous les détails.`,
        messages: [{ role: "user", content: `Recherche approfondie sur: ${query}\n\nEffectue au moins 2-3 recherches web complémentaires pour avoir un maximum d'informations récentes et précises.` }],
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
        .slice(0, 3000);
    }

    // Étape 2 : structuration détaillée en JSON
    const formatResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: `Tu es un expert financier BRVM. Transforme les données brutes en JSON structuré et détaillé.
Réponds UNIQUEMENT avec un JSON valide, rien d'autre avant ou après.
Format:
{
  "type": "analyse",
  "titre": "[titre descriptif et précis]",
  "contenu": "[analyse détaillée en 4-6 phrases avec chiffres, dates, contexte marché]",
  "points_cles": [
    "point détaillé 1 avec chiffres",
    "point détaillé 2 avec chiffres",
    "point détaillé 3 avec chiffres",
    "point détaillé 4 avec chiffres",
    "point détaillé 5 avec chiffres",
    "point détaillé 6 avec chiffres"
  ],
  "donnees": [
    {"label": "nom indicateur", "valeur": "valeur précise avec unité"},
    {"label": "nom indicateur", "valeur": "valeur précise avec unité"},
    {"label": "nom indicateur", "valeur": "valeur précise avec unité"},
    {"label": "nom indicateur", "valeur": "valeur précise avec unité"}
  ]
}
- Inclus TOUS les chiffres disponibles (cours, indices, variations, volumes, capitalisations)
- Mentionne les dates précises
- Cite les sociétés par leur nom complet et ticker
- Garde tout en français
- Si une info manque, indique "N/D"`,
        messages: [{
          role: "user",
          content: `Données brutes à structurer:\n\n${searchResults || "Aucune donnée trouvée pour: " + query}`
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
      const lines = searchResults
        .split("\n")
        .filter((l) => l.trim().length > 30)
        .slice(0, 8);
      result = {
        type: "analyse",
        titre: query.slice(0, 60),
        contenu: searchResults.slice(0, 500) || "Données non disponibles.",
        points_cles: lines.length ? lines.map((l) => l.trim().slice(0, 150)) : ["Aucune donnée trouvée"],
        donnees: [],
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
