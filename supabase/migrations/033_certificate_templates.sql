-- Certificate templates - editable through the UI by admins.
-- Bodies use {{placeholder}} syntax that's resolved at render time:
--   {{first_name}}, {{last_name}}, {{full_name}}, {{full_name_with_id}}
--   {{id_number}}, {{passport_number}}, {{shiur}}
--   {{year}}, {{admission_date}}, {{date_of_birth}}
--   {{hebrew_date}}, {{gregorian_date}}
--   plus any extra-field keys defined per template (e.g. {{months}}, {{amount}})

CREATE TABLE IF NOT EXISTS certificate_templates (
  id TEXT PRIMARY KEY,                -- e.g. 'regular', 'arnona'
  name TEXT NOT NULL,
  recipient TEXT,                     -- "לכבוד..." line, blank for none
  body TEXT NOT NULL,                 -- multiline with {{placeholders}}
  extra_fields JSONB DEFAULT '[]'::jsonb,  -- [{key,label,type,placeholder}, ...]
  signer_name TEXT,                   -- override for default signer (null = use default)
  signer_title TEXT,
  signer_id_number TEXT,
  is_receipt BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION trg_certificate_templates_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS certificate_templates_updated_at ON certificate_templates;
CREATE TRIGGER certificate_templates_updated_at
BEFORE UPDATE ON certificate_templates
FOR EACH ROW EXECUTE FUNCTION trg_certificate_templates_set_updated_at();

ALTER TABLE certificate_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cert_templates_all" ON certificate_templates;
CREATE POLICY "cert_templates_all" ON certificate_templates FOR ALL USING (true) WITH CHECK (true);

-- ===== Seed initial 17 templates =====
INSERT INTO certificate_templates (id, name, recipient, body, extra_fields, display_order)
VALUES
  ('regular', 'אישור תלמיד רגיל', 'לכל המעונין:',
   E'הננו לאשר בזאת כי ה"ה  {{full_name_with_id}}\nהינו תלמיד בישיבה בשנת הלימודים {{year}}.',
   '[]'::jsonb, 10),

  ('arnona', 'אישור לארנונה', 'לכל המעוניין:',
   E'הננו לאשר בזאת כי התלמיד {{full_name_with_id}}\nלומד בישיבתנו כל היום, ותורתו אומנותו.\nבחודשים {{months}} למד בישיבתנו ולא קיבל מלגה.',
   '[{"key":"months","label":"חודשים (לדוגמא: 10-12/2021)","type":"text","placeholder":"10-12/2024"}]'::jsonb, 20),

  ('bituach_leumi', 'אישור ביטוח לאומי', 'לכבוד המוסד לביטוח לאומי',
   E'הננו לאשר בזאת כי ה"ה  {{full_name_with_id}}\nהינו תלמיד בישיבתנו בשנת הלימודים {{year}} בהיקף של 45 שעות שבועיות\n בתנאי פנימייה ואינו מקבל מלגה.\nהנ"ל החל את לימודיו בישיבה בתאריך {{admission_date}}.',
   '[]'::jsonb, 30),

  ('bituach_leumi_yb', 'אישור ביטוח לאומי תלמיד יב', 'לכבוד המוסד לביטוח לאומי',
   E'הננו לאשר בזאת כי ה"ה  {{full_name_with_id}}\nהינו תלמיד בכיתה י"ב בשנת הלימודים {{year}} בהיקף של 45 שעות שבועיות\n בתנאי פנימייה ואינו מקבל מלגה.',
   '[]'::jsonb, 40),

  ('kita_yb', 'אישור בכיתה יב', 'לכל המעונין:',
   E'הננו לאשר בזאת כי ה"ה  {{full_name_with_id}}\nהינו תלמיד בכיתה יב בשנת הלימודים {{year}}\n בהיקף של 45 שעות שבועיות.',
   '[]'::jsonb, 50),

  ('vaad_yeshivot', 'אישור לועד הישיבות', 'לכבוד ועד הישיבות בארה"ק:',
   E'הננו לאשר בזאת כי ה"ה  {{full_name_with_id}}\nהינו תלמיד בישיבה בשנת הלימודים {{year}}',
   '[]'::jsonb, 60),

  ('with_hours_45', 'אישור עם שעות לימוד (45 שש)', 'לכל המעונין:',
   E'הננו לאשר בזאת כי ה"ה  {{full_name_with_id}}\nלומד בישיבתנו כל היום, ותורתו אומנותו.\n שעות הלימוד:\nבין השעות 9:00 - 13:00, לפנה"צ,\nומ 15:30 עד 19:00 אחה"צ.\nומ 21:00 עד 22:30 בערב\nסה"כ 45 שעות שבועיות.',
   '[]'::jsonb, 70),

  ('with_hours_40', 'אישור עם שעות לימוד (40 שש)', 'לכל המעונין:',
   E'הננו לאשר בזאת כי ה"ה  {{full_name_with_id}}\nלומד בישיבתנו כל היום, ותורתו אומנותו.\n שעות הלימוד:\nבין השעות 9:00 - 13:00, לפנה"צ,\nומ 15:00 עד 19:00 אחה"צ.\nסה"כ 40 שעות שבועיות.',
   '[]'::jsonb, 80),

  ('with_hours_milga', 'אישור עם שעות ומילגה', 'לכל המעונין:',
   E'הננו לאשר בזאת כי ה"ה  {{full_name_with_id}}\nלומד בישיבתנו כל היום, ותורתו אומנותו.\n שעות הלימוד:\nימים א - ה\nבין השעות 9:00 - 13:30, לפנה"צ,\nומ 15:00 עד 19:30 אחה"צ.\nסה"כ 45 שעות שבועיות.\nהנ"ל מקבל תמיכה חודשית בסך {{amount}} ₪\nמתייחס לשנת הלימודים {{year}}',
   '[{"key":"amount","label":"סכום מילגה חודשית (ש\"ח)","type":"number","placeholder":"1650"}]'::jsonb, 90),

  ('with_tuition', 'אישור עם שכר לימוד', 'לכל המעונין:',
   E'הננו לאשר בזאת כי ה"ה  {{full_name_with_id}}\nהינו תלמיד בישיבה בשנת הלימודים {{year}}\n ומשתתף בשכ"ל בסך {{amount}} ₪ לחודש.',
   '[{"key":"amount","label":"שכר לימוד חודשי (ש\"ח)","type":"number","placeholder":"600"}]'::jsonb, 100),

  ('ravak', 'אישור תלמיד רווק', 'לכל המעונין:',
   E'הננו לאשר בזאת כי ה"ה  {{full_name_with_id}}\nהינו תלמיד בישיבה בשנת הלימודים {{year}}\n והינו רווק.',
   '[]'::jsonb, 110),

  ('left', 'אישור תלמיד שעזב', 'לכל המעונין:',
   E'הננו לאשר בזאת כי ה"ה  {{full_name_with_id}}\nלמד בישיבתנו בין התאריכים {{admission_date}} –  {{endDate}}',
   '[{"key":"endDate","label":"תאריך עזיבה","type":"date"}]'::jsonb, 120),

  ('left_with_masachtot', 'אישור תלמיד שעזב עם מסכתות', 'לכל המעונין:',
   E'הננו לאשר בזאת כי ה"ה  {{full_name_with_id}}\nלמד בישיבתנו בין התאריכים –  {{admission_date}} - {{endDate}}\nולמד ונבחן על מסכתות:\n{{masachtot}}',
   '[{"key":"endDate","label":"תאריך עזיבה","type":"date"},{"key":"masachtot","label":"מסכתות (כל מסכת בשורה חדשה)","type":"textarea","placeholder":"בבא בתרא\nבבא מציעא\nקידושין"}]'::jsonb, 130),

  ('visa', 'אישור תלמיד לויזה', 'לכבוד משרד הפנים',
   E'הנדון: אישור לימודים משנת הלימודים {{fromYear}} ועד שנת {{toYear}}\nהננו לאשר בזאת כי ה"ה   {{full_name}} נושא דרכון {{passportHolder}}\nהינו תלמיד ישיבתנו החל מתאריך {{admission_date}}\n שעות הלימוד:\nימים א - ה\nבין השעות 9:00 - 13:00, לפנה"צ,\nומ 15:30 -  19:00 אחה"צ.\nומ 21:00 – 22:30 בערב\nבדקנו וידוע לנו כי הנ"ל יהודי מלידה',
   '[{"key":"fromYear","label":"משנת לימודים","type":"text","placeholder":"תשפ\"ד"},{"key":"toYear","label":"עד שנת לימודים","type":"text","placeholder":"תשפ\"ה"},{"key":"passportHolder","label":"נושא דרכון (מספר)","type":"text"}]'::jsonb, 140),

  ('exit_abroad', 'אישור יציאה לחול', 'לכבוד צה"ל',
   E'הננו לאשר בזאת לתלמיד {{full_name}} ת.ז. {{id_number}}\nלצאת לחו"ל בין התאריכים {{fromDate}} עד {{toDate}}.',
   '[{"key":"fromDate","label":"מתאריך","type":"date"},{"key":"toDate","label":"עד תאריך","type":"date"}]'::jsonb, 150),

  ('kabala_46', 'קבלה סעיף 46', '',
   E'',
   '[{"key":"donorName","label":"שם התורם","type":"text"},{"key":"donorId","label":"ע\"ר / מספר זהות","type":"text"},{"key":"donorAddress","label":"כתובת תורם","type":"text"},{"key":"donorCity","label":"עיר","type":"text"},{"key":"amount","label":"סכום (ש\"ח)","type":"number"},{"key":"amountWords","label":"סכום במילים","type":"text","placeholder":"מאה וחמישים אלף"},{"key":"paymentMethod","label":"אמצעי תשלום","type":"text","placeholder":"העברה בנקאית"},{"key":"receiptNumber","label":"מספר קבלה","type":"text","placeholder":"0557"}]'::jsonb, 160)
ON CONFLICT (id) DO NOTHING;

-- visa + exit_abroad have custom signers - update those after inserts
UPDATE certificate_templates
  SET signer_name = 'אליעזר יהודה פינקל', signer_title = 'ראש הישיבה'
  WHERE id = 'visa';

UPDATE certificate_templates
  SET signer_title = 'חתימת ראש הישיבה'
  WHERE id = 'exit_abroad';

-- kabala_46 is a receipt with special layout
UPDATE certificate_templates SET is_receipt = true WHERE id = 'kabala_46';
