-- =============================================================================
-- Certificate header as structured settings instead of free HTML (the flex-row HTML
-- header "jumped" when edited). JSON: {showBsd, bsdAlign, datesAlign, datesLayout,
-- showHebrewDate, showWeekday, showGregorianDate, gregorianFormat, title}.
-- NULL = the classic layout of the original Word certificates (בס"ד right, dates left
-- one under the other, "אישור"). header_html is kept but no longer used.
-- Idempotent.
-- =============================================================================
ALTER TABLE certificate_templates ADD COLUMN IF NOT EXISTS header_config JSONB;
