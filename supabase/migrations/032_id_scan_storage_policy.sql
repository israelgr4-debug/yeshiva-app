-- Storage policies for the PRIVATE 'student-id-scans' bucket.
-- Only authenticated users can read/write; nothing is public.

DROP POLICY IF EXISTS "id_scan_select" ON storage.objects;
CREATE POLICY "id_scan_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'student-id-scans' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "id_scan_insert" ON storage.objects;
CREATE POLICY "id_scan_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'student-id-scans' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "id_scan_update" ON storage.objects;
CREATE POLICY "id_scan_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'student-id-scans' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'student-id-scans' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "id_scan_delete" ON storage.objects;
CREATE POLICY "id_scan_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'student-id-scans' AND auth.role() = 'authenticated');
