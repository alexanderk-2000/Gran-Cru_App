-- Manual Test Table
-- Created on request to verify Supabase connectivity and migration flow

CREATE TABLE IF NOT EXISTS manual_test_table (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    info TEXT DEFAULT 'It works!'
);

COMMENT ON TABLE manual_test_table IS 'Table created via manual user request';
