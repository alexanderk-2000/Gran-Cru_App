export const buildProfilePrompt = ({ profile, query, rawPrompt }) => {
  if (profile === 'fast') {
    return `Recherchiere den Wein: "${query}"

ZIEL (FAST PROFILE):
- Schnell verlässliche Kerndaten liefern. Kein Langtext, kein unnötiger Detailballast.
- Antworte ausschließlich als JSON.

Pflichtfelder:
name, producer, vintage, short_description_de, country, region, appellation, vineyard, wine_type, drink_start, peak_year, drink_end, scores[{critic,score,year}], sources[{title,url}], confidence, missing_fields[].

Regeln:
- Verpflichte Web-Recherche für Fakten.
- sources muss enthalten: gute-weine.de + wine-searcher.com + mindestens eine weitere Quelle.
- Kritiker-Scores aktiv versuchen: James Suckling, Robert Parker/Wine Advocate, Vinous, Decanter, Jancis Robinson, Falstaff.
- Falls etwas nicht verlässlich ist: null und in missing_fields aufnehmen.`;
  }

  return `${rawPrompt}

VOLLPROFIL:
- Ergänze fehlende Felder belastbar, ohne Halluzination.
- Nutze weiterhin Web-Recherche und halte Quellenpflicht ein.
- Liefere konsistentes JSON im gleichen Schema.`;
};
