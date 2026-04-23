-- Expand bank_code and branch_code from SMALLINT to INTEGER
-- to safely handle edge cases in imported data.

ALTER TABLE bank_branches
  ALTER COLUMN bank_code TYPE INTEGER,
  ALTER COLUMN branch_code TYPE INTEGER;
