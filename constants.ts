
import { Wine, Category } from './types.ts';

export const PRE_SEED_WINES: Partial<Wine>[] = [
  {
    name: 'Château Margaux',
    vintage: 2015,
    region: 'Bordeaux, Frankreich',
    category: 'Investment' as Category,
    quantity: 6,
    purchase_price: 1200,
    market_price: 1450,
    format: '0.75L',
    drink_start: 2030,
    drink_end: 2060,
    wishlist: false,
    producer: 'Château Margaux',
    alcohol_percent: 13.5,
    // Fix: Renamed varietals to grapes and adjusted structure to match types.ts
    grapes: [
      { name: 'Cabernet Sauvignon' },
      { name: 'Merlot' },
      { name: 'Petit Verdot' }
    ],
    aromas: [
      { tag: 'Schwarze Johannisbeere', intensity: 5 },
      { tag: 'Veilchen', intensity: 4 },
      { tag: 'Zeder', intensity: 4 },
      { tag: 'Graphit', intensity: 3 }
    ],
    pairings: [
      { item: 'Lammkarree', category: 'Fleisch' },
      { item: 'Wildgericht', category: 'Fleisch' }
    ],
    // Corrected: Renamed critic_scores to scores and source to critic to match types.ts
    scores: [
      { critic: 'Robert Parker', score: '99' },
      { critic: 'James Suckling', score: '100' }
    ],
    is_favorite: true
  },
  {
    name: 'Sassicaia Tenuta San Guido',
    vintage: 2021,
    region: 'Toskana, Italien',
    category: 'Investment' as Category,
    quantity: 3,
    purchase_price: 320,
    market_price: 345,
    format: '0.75L',
    drink_start: 2028,
    drink_end: 2045,
    wishlist: false,
    producer: 'Tenuta San Guido',
    aromas: [
      { tag: 'Dunkle Beeren', intensity: 4 },
      { tag: 'Rosmarin', intensity: 3 },
      { tag: 'Pfeffer', intensity: 3 }
    ],
    // Corrected: Renamed critic_scores to scores and source to critic to match types.ts
    scores: [{ critic: 'Wine Spectator', score: '98' }]
  },
  {
    name: 'Krug Vintage Brut',
    vintage: 2008,
    region: 'Champagne, Frankreich',
    category: 'Daily Drinker' as Category,
    quantity: 4,
    purchase_price: 380,
    market_price: 720,
    format: '0.75L',
    drink_start: 2022,
    drink_end: 2038,
    wishlist: false,
    aromas: [
      { tag: 'Brioche', intensity: 5 },
      { tag: 'Honig', intensity: 4 },
      { tag: 'Zitrus', intensity: 3 }
    ],
    is_favorite: true
  }
];

export const AROMA_TAGS_CURATED = [
  // Frucht
  'Kirsche', 'Schwarzkirsche', 'Sauerkirsche', 'Brombeere', 'Cassis', 'Himbeere', 'Erdbeere', 'Preiselbeere', 'Pflaume', 'Zwetschge', 'Heidelbeere', 'Waldbeeren', 'Orange', 'Zitrone', 'Limette', 'Grapefruit', 'Mandarine', 'Aprikose', 'Pfirsich', 'Nektarine', 'Quitte', 'Birne', 'Grüner Apfel', 'Roter Apfel', 'Ananas', 'Mango', 'Papaya', 'Maracuja', 'Melone',
  // Würzig / Erdige
  'Pfeffer', 'Weißer Pfeffer', 'Gewürznelke', 'Muskat', 'Vanille', 'Zimt', 'Lakritz', 'Tabak', 'Leder', 'Rauch', 'Kräuter', 'Thymian', 'Rosmarin', 'Eukalyptus', 'Menthol', 'Graphit', 'Erde', 'Waldboden', 'Unterholz', 'Pilze', 'Trüffel',
  // Holz / Ausbau
  'Eiche', 'Toast', 'Röstaromen', 'Zedernholz', 'Kakaobohne', 'Kaffee', 'Schokolade', 'Karamell', 'Kokos',
  // Florale
  'Veilchen', 'Rose', 'Jasmin', 'Holunderblüte', 'Lindenblüte', 'Orangenblüte',
  // Mineralische
  'Mineralisch', 'Feuerstein', 'Kreide', 'Salzig', 'Petrol', 'Harz', 'Teer', 'Balsamisch', 'Honig', 'Wachs'
];

export const PAIRING_CATEGORIES = [
  'Fleisch', 'Geflügel', 'Fisch', 'Vegetarisch', 'Käse', 'Asiatisch', 'BBQ', 'Dessert', 'Pasta / Risotto', 'Moderne Küche', 'Leichte Gerichte', 'Schmorgerichte'
];
