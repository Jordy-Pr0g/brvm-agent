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

  const q = query.toLowerCase();
  let systemPrompt = "";

  if (q.includes("indice") || q.includes("composite") || q.includes("prestige") || q.includes("brvm 30")) {
    systemPrompt = `Expert BRVM. Recherche les valeurs EXACTES des indices BRVM sur brvm.org, daba.finance, sikafinance.com. Retourne UNIQUEMENT ce JSON:
{"type":"indices","updated":"[date]","items":[{"nom":"BRVM Composite","valeur":"[pts]","variation_pct":"[+/-x.xx%]","ytd":"[+/-x.xx%]","volume":"[FCFA]","description":"[1 phrase]"},{"nom":"BRVM 30","valeur":"...","variation_pct":"...","ytd":"...","volume":"...","description":"..."},{"nom":"BRVM Prestige","valeur":"...","variation_pct":"...","ytd":"...","volume":"...","description":"..."}]}
JSON uniquement.`;

  } else if (q.includes("cours") || q.includes("action") || q.includes("titre") || q.includes("cote")) {
    systemPrompt = `Expert BRVM. Recherche les cours actuels sur brvm.org ou sikafinance.com. Retourne UNIQUEMENT ce JSON:
{"type":"cours","updated":"[date]","items":[{"ticker":"[ex:SNTS]","societe":"[nom]","secteur":"[secteur]","cours":"[FCFA]","variation_pct":"[+/-x.xx%]","volume":"[vol]","capitalisation":"[Mds FCFA]"}]}
Au moins 15 actions réelles. JSON uniquement.`;

  } else if (q.includes("actual") || q.includes("news") || q.includes("information") || q.includes("nouvelle")) {
    systemPrompt = `Expert BRVM. Recherche les actualités récentes sur la BRVM. Retourne UNIQUEMENT ce JSON:
{"type":"news","items":[{"titre":"[titre précis]","source":"[source]","date":"[date]","resume":"[2-3 phrases avec chiffres]","categorie":"marché|société|dividende|IPO|réglementation","impact":"positif|négatif|neutre"}]}
Au moins 8 actualités détaillées. JSON uniquement.`;

  } else if (q.includes("synthèse") || q.includes("synthese") || q.includes("marché") || q.includes("global")) {
    systemPrompt = `Expert BRVM. Recherche une vue complète du marché. Retourne UNIQUEMENT ce JSON:
{"type":"synthese","date":"[date]","sentiment":"haussier|baissier|neutre","resume_marche":"[3-4 phrases avec chiffres]","indices":[{"nom":"...","valeur":"...","variation_pct":"..."}],"top_hausses":[{"ticker":"...","societe":"...","cours":"...","variation_pct":"..."}],"top_baisses":[{"ticker":"...","societe":"...","cours":"...","variation_pct":"..."}],"volumes":{"total":"...","valeur":"..."},"news_cles":[{"titre":"...","resume":"...","impact":"positif|négatif|neutre"}]}
Top 5 hausses et baisses. JSON uniquement.`;

  } else if (q.includes("dividende")) {
    systemPrompt = `Expert BRVM. Recherche les dividendes 2025-2026. Retourne UNIQUEMENT ce JSON:
{"type":"dividendes","updated":"[date]","items":[{"societe":"...","ticker":"...","dividende":"[FCFA]","rendement":"[x.xx%]","date_detachement":"...","date_paiement":"...","exercice":"..."}]}
Au moins 10 sociétés. JSON uniquement.`;

  } else if (q.includes("capitalisation") || q.includes("top 10") || q.includes("plus grande")) {
    systemPrompt = `Expert BRVM. Recherche les plus grandes capitalisations sur brvm.org. Retourne UNIQUEMENT ce JSON:
{"type":"capitalisations","updated":"[date]","total_marche":"[Mds FCFA]","items":[{"rang":1,"ticker":"...","societe":"...","secteur":"...","capitalisation":"[Mds FCFA]","cours":"...","variation_ytd":"..."}]}
Top 10 réel. JSON uniquement.`;

  } else if (q.includes("ipo") || q.includes("introduction") || q.includes("cotation")) {
    systemPrompt = `Expert BRVM. Recherche les IPO récentes et à venir. Retourne UNIQUEMENT ce JSON:
{"type":"ipo","items":[{"societe":"...","secteur":"...","statut":"prévu|récent|en cours","date":"...","prix_emission":"...","montant_leve":"...","details":"[2-3 phrases]"}]}
JSON uniquement.`;

  } else {
    systemPrompt = `Expert financier BRVM. Recherche des infos précises et récentes. Retourne UNIQUEMENT ce JSON:
{"type":"analyse","titre":"[titre précis]","contenu":"[4-5 phrases avec chiffres et dates réels]","points_cles":["[fait précis 1]","[fait précis 2]","[fait précis 3]","[fait précis 4]","[fait précis 5]","[fait précis 6]"],"donnees":[{"label":"...","valeur":"[chiffre + unité]"},{"label":"...","valeur":"..."},{"label":"...","valeur":"..."},{"label":"...","valeur":"..."}],"source":"[sites consultés]"}
Chiffres RÉELS uniquement. JSON uniquement.`;
  }

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
        max_tokens: 1200,
        system: systemPrompt,
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
        contenu: text.slice(0, 500) || "Données non disponibles.",
        points_cles: text.split("\n").filter(l => l.trim().length > 20).slice(0, 5).map(l => l.trim()),
        donnees: [],
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
