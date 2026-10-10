-- Jobs / Queue
CREATE TABLE IF NOT EXISTS bossai_notion_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  type TEXT NOT NULL, -- 'full_sync' | 'incremental' | 'page_sync'
  status TEXT DEFAULT 'pending', -- pending | running | done | failed
  payload JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Raw layer (page + full block tree)
CREATE TABLE IF NOT EXISTS bossai_notion_page_raw (
  page_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  page_json JSONB NOT NULL,
  block_tree_json JSONB NOT NULL DEFAULT '[]',
  markdown TEXT DEFAULT '',
  last_edited_time TIMESTAMPTZ,
  file_refs JSONB DEFAULT '[]',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (page_id, user_id)
);

-- Service layer: pages
CREATE TABLE IF NOT EXISTS bossai_notion_pages (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT DEFAULT '',
  cover TEXT,
  icon TEXT,
  parent_id TEXT,
  parent_type TEXT,
  url TEXT,
  last_edited_time TIMESTAMPTZ,
  properties JSONB DEFAULT '{}',
  is_database_item BOOLEAN DEFAULT false,
  database_id TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- Service layer: blocks (flattened tree)
CREATE TABLE IF NOT EXISTS bossai_notion_blocks (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  page_id TEXT NOT NULL,
  parent_id TEXT,
  type TEXT NOT NULL,
  content JSONB DEFAULT '{}',
  order_index INTEGER DEFAULT 0,
  has_children BOOLEAN DEFAULT false,
  depth INTEGER DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_notion_blocks_page ON bossai_notion_blocks (page_id, user_id, order_index);

-- Service layer: databases
CREATE TABLE IF NOT EXISTS bossai_notion_databases (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  properties_schema JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- Service layer: database items
CREATE TABLE IF NOT EXISTS bossai_notion_database_items (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  database_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  title TEXT DEFAULT '',
  properties JSONB DEFAULT '{}',
  cover TEXT,
  icon TEXT,
  last_edited_time TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_notion_db_items ON bossai_notion_database_items (database_id, user_id);
