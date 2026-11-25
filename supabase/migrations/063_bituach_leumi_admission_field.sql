-- =============================================================================
-- אישור ביטוח לאומי: שדה "תאריך כניסה לישיבה" במסך האישורים.
-- השדה מתמלא לבד מכרטיס התלמיד, אפשר לתקן אותו לפני ההפקה, ומה שכתוב בו הוא מה שמודפס
-- (במקום {{admission_date}} שבנוסח האישור).
--
-- בטוח להריץ שוב: שדה קיים לא מתווסף פעמיים, ונוסח שכבר מכיל את התאריך לא משתנה.
-- =============================================================================

-- 1. the field itself (key 'admission_date' — the same name as the placeholder, so the
--    typed value replaces the one from the student's card)
UPDATE certificate_templates
SET extra_fields = coalesce(extra_fields, '[]'::jsonb)
      || '[{"key":"admission_date","label":"תאריך כניסה לישיבה","type":"date"}]'::jsonb
WHERE id = 'bituach_leumi'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(extra_fields, '[]'::jsonb)) f
    WHERE f ->> 'key' = 'admission_date'
  );

-- 2. the sentence with the date — only if the wording does not print the date already
--    (a wording edited in the editor is HTML paragraphs; an untouched one is plain lines)
UPDATE certificate_templates
SET body = CASE
      WHEN body ~* '<(p|li|h[1-6]|table)[\s>/]'
        THEN body || '<p>הנ"ל החל את לימודיו בישיבה בתאריך {{admission_date}}.</p>'
      ELSE body || E'\nהנ"ל החל את לימודיו בישיבה בתאריך {{admission_date}}.'
    END
WHERE id = 'bituach_leumi'
  AND body !~ '\{\{\s*admission_date\s*\}\}';

-- 3. what the certificate looks like now
SELECT name                                         AS "אישור",
       extra_fields                                 AS "שדות",
       body ~ '\{\{\s*admission_date\s*\}\}'        AS "התאריך מופיע בנוסח",
       body                                         AS "הנוסח"
FROM certificate_templates
WHERE id = 'bituach_leumi';
