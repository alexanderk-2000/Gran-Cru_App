-- ============================================
-- TEST MIGRATION: Test1234 Table
-- ============================================
-- This is a test migration to verify the automated migration system works

CREATE TABLE IF NOT EXISTS test1234 (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_name TEXT NOT NULL,
  test_value INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_test1234_test_name ON test1234(test_name);

-- Insert test data
INSERT INTO test1234 (test_name, test_value) VALUES
  ('Migration Test 1', 100),
  ('Migration Test 2', 200),
  ('Migration Test 3', 300);

-- Comment for verification
COMMENT ON TABLE test1234 IS 'Test table created to verify automated migrations work correctly';
