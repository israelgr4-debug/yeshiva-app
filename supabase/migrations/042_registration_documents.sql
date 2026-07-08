-- Registration document checklist: the 5 attachments each candidate must bring
-- at registration. Marked per-registration in the Acceptance tab, and exported
-- in the "documents checklist" report.
--
--   doc_student_id      - צילום ת.ז. תלמיד
--   doc_parent_id       - צילום ת.ז. אחד ההורים + ספח
--   doc_credit          - אשראי
--   doc_standing_order  - הוראת קבע (הו"ק)
--   doc_medical         - אישור רפואי לפנימיה

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS doc_student_id     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_parent_id      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_credit         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_standing_order BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_medical        BOOLEAN NOT NULL DEFAULT false;
