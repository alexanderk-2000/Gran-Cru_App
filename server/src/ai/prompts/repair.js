export const buildRepairPrompt = (originalPrompt, issues, previousJson) => {
  const needsGuteWeine = issues.includes('sources_require_gute_weine');
  const needsWineSearcher = issues.includes('sources_require_wine_searcher');
  const needsCritics = issues.includes('scores_external_critics');

  const targetedHints = [
    needsGuteWeine ? '- Quellen müssen mindestens eine URL von gute-weine.de enthalten.' : null,
    needsWineSearcher ? '- Quellen müssen mindestens eine URL von wine-searcher.com enthalten.' : null,
    needsCritics
      ? '- Suche aktiv nach externen Kritikerbewertungen (z. B. James Suckling, Robert Parker/Wine Advocate, Vinous, Decanter, Jancis Robinson, Falstaff) und fülle scores[]; falls nicht verfügbar, lasse score weg und setze fehlende Felder korrekt.'
      : null
  ]
    .filter(Boolean)
    .join('\n');

  return `${originalPrompt}

FEHLERKORREKTUR:
- Behebe diese Probleme: ${issues.join(', ')}.
- Keine neuen Fakten erfinden.
- Unbekannte Felder auf null setzen und in missing_fields aufnehmen.
- Antworte ausschließlich als JSON im geforderten Format.
${targetedHints ? `\n${targetedHints}` : ''}

VORHERIGE ANTWORT (zur Korrektur):
${JSON.stringify(previousJson)}
`;
};
