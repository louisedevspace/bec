-- Notifications tables

CREATE TABLE IF NOT EXISTS notification_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  deeplink_url TEXT,
  channel TEXT NOT NULL DEFAULT 'push', -- push | email | sms
  variant_a_title TEXT,
  variant_a_body TEXT,
  variant_b_title TEXT,
  variant_b_body TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_campaigns (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES notification_templates(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  deeplink_url TEXT,
  channels TEXT[] NOT NULL DEFAULT ARRAY['push'],
  segment_role TEXT, -- 'user' | 'admin' | null
  segment_is_verified BOOLEAN,
  segment_is_active BOOLEAN,
  segment_min_credit_score NUMERIC,
  segment_email_search TEXT,
  scheduled_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | scheduled | running | completed | failed
  variant TEXT, -- 'A' | 'B' | null
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES notification_campaigns(id),
  user_id UUID,
  channel TEXT NOT NULL, -- push | email | sms
  status TEXT NOT NULL, -- queued | sent | delivered | clicked | failed
  error TEXT,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  clicked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id UUID PRIMARY KEY,
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
