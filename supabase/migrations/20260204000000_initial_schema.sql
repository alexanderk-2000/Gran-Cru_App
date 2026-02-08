-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- WINES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS wines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  
  -- Basic Info
  name TEXT NOT NULL,
  producer TEXT,
  vintage INTEGER,
  
  -- Location
  region TEXT,
  country TEXT,
  appellation TEXT,
  vineyard TEXT,
  
  -- Classification
  category TEXT DEFAULT 'Rotwein',
  wine_type TEXT DEFAULT 'Stillwein',
  format TEXT DEFAULT '0.75L',
  
  -- Inventory
  quantity INTEGER DEFAULT 0,
  purchase_price DECIMAL(10,2) DEFAULT 0,
  
  -- Wine Details (JSONB for flexibility)
  grapes JSONB DEFAULT '[]'::jsonb,
  alcohol_percent DECIMAL(4,2),
  
  -- Drinking Window
  drink_start INTEGER,
  drink_end INTEGER,
  peak_year INTEGER,
  
  -- Tasting Profile
  aromas JSONB DEFAULT '[]'::jsonb,
  structure JSONB DEFAULT '{}'::jsonb,
  pairings JSONB DEFAULT '[]'::jsonb,
  scores JSONB DEFAULT '[]'::jsonb,
  
  -- Vinification
  closure_type TEXT,
  aging_process TEXT,
  farming TEXT,
  fermentation TEXT,
  maturation_profile TEXT,
  
  -- AI Metadata
  confidence TEXT DEFAULT 'medium',
  missing_fields JSONB DEFAULT '[]'::jsonb,
  market_price DECIMAL(10,2) DEFAULT 0,
  wishlist BOOLEAN DEFAULT FALSE,
  ai_details JSONB DEFAULT '{}'::jsonb,
  ai_sources JSONB DEFAULT '[]'::jsonb,
  
  -- User Preferences
  is_favorite BOOLEAN DEFAULT FALSE,
  
  -- Soft Delete
  deleted_at TIMESTAMPTZ,
  deleted_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- OCCASIONS TABLE (Trinkplan Events)
-- ============================================
CREATE TABLE IF NOT EXISTS occasions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  
  title TEXT NOT NULL,
  description TEXT,
  
  -- Date Range
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Repeat Settings
  repeat_rule TEXT DEFAULT 'none', -- 'none', 'daily', 'weekly', 'monthly', 'yearly'
  repeat_interval INTEGER DEFAULT 1,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- OCCASION INSTANCES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS occasion_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  occasion_id UUID REFERENCES occasions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  instance_date DATE NOT NULL,
  wine_id UUID REFERENCES wines(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'planned', -- 'planned', 'completed', 'cancelled'
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique instances per user/occasion/date
  UNIQUE(user_id, occasion_id, instance_date)
);

-- ============================================
-- TASTINGS TABLE (Verkostungsnotizen)
-- ============================================
CREATE TABLE IF NOT EXISTS tastings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wine_id UUID REFERENCES wines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  date TIMESTAMPTZ DEFAULT NOW(),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  note TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_wines_user_id ON wines(user_id);
CREATE INDEX IF NOT EXISTS idx_wines_deleted_at ON wines(deleted_at);
CREATE INDEX IF NOT EXISTS idx_wines_category ON wines(category);
CREATE INDEX IF NOT EXISTS idx_wines_vintage ON wines(vintage);

CREATE INDEX IF NOT EXISTS idx_occasions_user_id ON occasions(user_id);
CREATE INDEX IF NOT EXISTS idx_occasions_dates ON occasions(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_occasion_instances_user_id ON occasion_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_occasion_instances_date ON occasion_instances(instance_date);
CREATE INDEX IF NOT EXISTS idx_occasion_instances_wine_id ON occasion_instances(wine_id);

CREATE INDEX IF NOT EXISTS idx_tastings_wine_id ON tastings(wine_id);
CREATE INDEX IF NOT EXISTS idx_tastings_user_id ON tastings(user_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE wines ENABLE ROW LEVEL SECURITY;
ALTER TABLE occasions ENABLE ROW LEVEL SECURITY;
ALTER TABLE occasion_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE tastings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can access their own wines" ON wines;
DROP POLICY IF EXISTS "Users can access their own occasions" ON occasions;
DROP POLICY IF EXISTS "Users can access their own instances" ON occasion_instances;
DROP POLICY IF EXISTS "Users can access their own tastings" ON tastings;

-- Wines Policies
CREATE POLICY "Users can access their own wines" ON wines
  FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Occasions Policies
CREATE POLICY "Users can access their own occasions" ON occasions
  FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Occasion Instances Policies
CREATE POLICY "Users can access their own instances" ON occasion_instances
  FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Tastings Policies
CREATE POLICY "Users can access their own tastings" ON tastings
  FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables
DROP TRIGGER IF EXISTS update_wines_updated_at ON wines;
CREATE TRIGGER update_wines_updated_at
  BEFORE UPDATE ON wines
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_occasions_updated_at ON occasions;
CREATE TRIGGER update_occasions_updated_at
  BEFORE UPDATE ON occasions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_occasion_instances_updated_at ON occasion_instances;
CREATE TRIGGER update_occasion_instances_updated_at
  BEFORE UPDATE ON occasion_instances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
