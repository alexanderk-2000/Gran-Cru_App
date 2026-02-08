
export type Category = 'Genuss' | 'Investment' | 'Rarität' | 'Daily Drinker';
export type WineType = 'Rot' | 'Weiß' | 'Rosé' | 'Schaumwein' | 'Süßwein';
export type BottleFormat = '0.375L' | '0.75L' | '1.5L (Magnum)' | '3.0L (Double Magnum)' | '6.0L (Imperial)';
export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type InstanceStatus = 'planned' | 'consumed' | 'skipped';
export type DrinkArchetype = 'EARLY' | 'CLASSIC' | 'LONG_LIVED' | 'SWEET';

export interface Occasion {
  id: string;
  user_id: string;
  title: string;
  start_date: string;
  end_date: string;
  drink_anchor_date?: string | null;
  repeat_rule: RepeatRule;
  repeat_interval: number;
  repeat_weekdays?: number[] | null;
  max_occurrences?: number | null;
  created_at: string;
  updated_at?: string;
}

export type OccasionWinePriority = 'low' | 'medium' | 'high';

export interface OccasionWinePoolEntry {
  id: string;
  occasion_id: string;
  user_id: string;
  wine_id: string;
  bottles_reserved: number;
  priority: OccasionWinePriority;
  created_at: string;
  wine?: Wine;
}

export interface OccasionInstance {
  id: string;
  occasion_id: string;
  user_id: string;
  instance_date: string;
  wine_id: string | null;
  status: InstanceStatus;
  auto_assigned?: boolean;
  assignment_score?: number | null;
  assignment_reason?: string | null;
  note?: string;
  created_at: string;
  updated_at: string;
  occasion?: Occasion;
}

export interface UserProfile {
  id: string;
  email: string;
  currency: string;
  target_date: string;
}

export interface CellarPocket {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface CriticScore {
  critic: string;
  score: string | number;
  year?: number;
}

export interface WineStructure {
  acidity?: number;
  tannin?: number;
  body?: number;
  sweetness?: number;
  oak?: number;
}

export interface WineDetails {
  identification?: {
    brand_line?: string;
    classification?: string;
    cru?: string;
    vineyard?: string;
    bottling?: string;
    bottle_size?: string;
    closure_type?: string;
    color?: string;
    wine_type?: string;
    wine_style?: string;
    country?: string;
    region?: string;
    subregion?: string;
    appellation?: string;
  };
  grapes_style?: {
    varieties?: { name: string; percentage?: number }[];
    monovarietal?: boolean;
    style_profile?: string[];
    sweetness?: string;
    residual_sugar_g_l?: number;
    acidity?: string;
    tannin?: string;
    body?: string;
    alcohol_percent?: number;
  };
  terroir?: {
    soil_types?: string[];
    altitude_m?: number;
    exposure?: string;
    climate?: string;
    vine_age_avg?: number;
    training_system?: string;
    yield_hl_ha?: number;
    harvest_method?: string;
    sustainability?: {
      organic?: boolean;
      biodynamic?: boolean;
      sustainable_certified?: boolean;
      vegan?: boolean;
    };
  };
  vinification?: {
    fermentation_vessel?: string;
    yeast?: string;
    maceration_days?: number;
    aging_vessel?: string;
    oak_type?: string;
    new_oak_percent?: number;
    aging_months?: number;
    lees_contact?: string;
    malolactic?: string;
    batonnage?: boolean;
    filtration?: boolean;
    sulfur?: string;
  };
  sensory?: {
    aromatics?: {
      fruit?: string[];
      floral?: string[];
      spice?: string[];
      herbal_spice?: string[];
      wood?: string[];
      minerality?: string[];
      mineral_earth?: string[];
      tertiary?: string[];
    };
    palate?: {
      freshness?: string;
      structure?: string;
      tannin_grip?: string;
      balance?: string;
      body_extract?: string;
      finish_length?: string;
      complexity?: string;
      drinkability?: string;
    };
    stage?: string;
  };
  maturity?: {
    drink_start?: number;
    peak_year?: number;
    drink_end?: number;
    stage?: string;
    aging_potential_years?: number;
    decant_minutes?: number;
    serving_temp_c?: number;
  };
  ratings?: {
    avg_rating?: number;
    own_notes?: string;
    own_rating?: number;
    critics?: { source: string; value: number; vintage?: number }[];
    awards?: string[];
    vintage_quality?: string;
  };
  pairing_usage?: {
    pairings?: { item: string; category?: string; note?: string }[];
    occasion?: string;
    drinking_style?: string;
    audience?: string;
  };
  cellar?: {
    provenance?: string;
    purchase_date?: string;
    purchase_source?: string;
    purchase_price?: number;
    market_price?: number;
    value_change_percent?: number;
    quantity?: number;
    storage_location?: string;
    condition?: string;
    rebuy_recommendation?: boolean;
  };
  investment?: {
    category?: string;
    liquidity?: string;
    volatility?: string;
    secondary_market?: string;
    critic_momentum?: string;
    vintage_risk?: string;
    counterfeit_risk?: string;
    projected_value?: number;
    hold_years?: number;
    exit_window?: string;
  };
  app?: {
    favorite?: boolean;
    wishlist?: boolean;
    time_capsule_event?: string;
    reminder_start?: string;
    qr_id?: string;
    images?: { label?: string; bottle?: string; case?: string };
    notes?: string;
    tags?: string[];
  };
  extensions?: {
    co2_footprint?: number;
    water_use?: number;
    esg_score?: number;
    producer_story?: string;
    vintage_report?: string;
    comparables?: string[];
    blind_tasting?: string;
    ai_recommendation?: string;
    short_description_de?: string;
  };
}

export interface Wine {
  id: string;
  user_id: string;
  name: string;
  vintage: number;
  region: string;
  subcellar?: string;
  category: Category;
  wine_type?: WineType;
  quantity: number;
  purchase_price: number;
  market_price?: number;
  format: BottleFormat;
  drink_start: number;
  drink_end: number;
  peak_year?: number;
  producer?: string;
  appellation?: string;
  subregion?: string;
  vineyard?: string;
  country?: string;
  alcohol_percent?: number;
  aromas?: { tag: string; intensity?: number }[];
  structure?: WineStructure;
  pairings?: { item: string; category?: string; note?: string }[];
  scores?: CriticScore[];
  confidence?: 'high' | 'medium' | 'low';
  missing_fields?: string[];
  is_favorite?: boolean;
  wishlist: boolean;
  ai_details?: WineDetails;
  ai_sources?: { title?: string; url?: string }[];
  drink_archetype?: DrinkArchetype;
  grapes?: { name: string; percentage?: number }[];
  maturation_profile?: string;
  fermentation?: string;
  aging_process?: string;
  farming?: string;
  closure_type?: string;
  deleted_reason?: string;
  deleted_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export enum WineStatus {
  READY = 'READY',
  HOLD = 'HOLD',
  PAST_PEAK = 'PAST_PEAK'
}

export interface Tasting {
  id: string;
  wine_id: string;
  user_id: string;
  date: string;
  rating: number;
  note: string;
}

export interface PortfolioStats {
  totalBottles: number;
  totalValue: number;
  readyCount: number;
  holdCount: number;
  pastPeakCount: number;
  averageAge: number;
  investmentValue: number;
}
