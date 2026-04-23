-- Classify Nedarim categories (Groupe) into types so we can distinguish
-- tuition from donations and other things.

ALTER TABLE nedarim_groups
  ADD COLUMN IF NOT EXISTS category_type TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (category_type IN ('tuition', 'donation', 'other', 'unclassified'));

ALTER TABLE nedarim_groups
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- View that joins each subscription to its category type
CREATE OR REPLACE VIEW nedarim_subscriptions_with_type AS
SELECT
  s.*,
  COALESCE(g.category_type, 'unclassified') AS category_type
FROM nedarim_subscriptions s
LEFT JOIN nedarim_groups g ON g.name = s.groupe;

GRANT SELECT ON nedarim_subscriptions_with_type TO authenticated, anon;
