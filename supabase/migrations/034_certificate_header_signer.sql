-- Add editable header and signer blocks to certificate templates.
-- Until now, "בס"ד + date" and the signature line ("בכבוד רב, יוסף לוי, ...")
-- were hardcoded. Now they're per-template editable HTML, with placeholders.

ALTER TABLE certificate_templates
  ADD COLUMN IF NOT EXISTS header_html TEXT,
  ADD COLUMN IF NOT EXISTS signer_html TEXT;

-- Default header for all existing templates: בס"ד + Hebrew/Gregorian dates + "אישור" title
UPDATE certificate_templates
SET header_html = $$<div style="text-align:center;font-size:14px;">בס"ד</div>
<div style="display:flex;justify-content:space-between;direction:rtl;font-size:14px;margin-top:5px;">
<span>{{hebrew_date}}</span>
<span>{{gregorian_date}}</span>
</div>
<h1 style="text-align:center;font-size:28px;font-weight:bold;margin:25px 0;text-decoration:underline;">אישור</h1>$$
WHERE header_html IS NULL;

-- Default signer block: "בכבוד רב, [name], [id_number], [title]"
UPDATE certificate_templates
SET signer_html = $$<div style="text-align:center;line-height:1.8;margin-top:60px;">
<p>בכבוד רב,</p>
<p style="font-weight:bold;">{{signer_name}}</p>
<p>{{signer_id_number}}</p>
<p>{{signer_title}}</p>
</div>$$
WHERE signer_html IS NULL;

-- Receipt has its own custom layout - clear header/signer (rendered specially)
UPDATE certificate_templates
SET header_html = NULL, signer_html = NULL
WHERE id = 'kabala_46';
