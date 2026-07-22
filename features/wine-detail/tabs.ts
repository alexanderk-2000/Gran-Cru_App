export const TAB_ITEMS = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'terroir', label: 'Terroir & Ausbau' },
  { id: 'sensory', label: 'Sensorik & Pairing' },
  { id: 'cellar', label: 'Keller' },
  { id: 'notes', label: 'Verkostungen' }
] as const;

export type TabId = (typeof TAB_ITEMS)[number]['id'];
