-- Allow authenticated users to upload/read registration photos.
-- The bucket 'registration-photos' must already exist (Public).

-- SELECT (read public anyway, but be explicit for authenticated)
DROP POLICY IF EXISTS "registration_photos_select" ON storage.objects;
CREATE POLICY "registration_photos_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'registration-photos');

-- INSERT
DROP POLICY IF EXISTS "registration_photos_insert" ON storage.objects;
CREATE POLICY "registration_photos_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'registration-photos' AND auth.role() = 'authenticated');

-- UPDATE (so upsert/replace works)
DROP POLICY IF EXISTS "registration_photos_update" ON storage.objects;
CREATE POLICY "registration_photos_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'registration-photos' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'registration-photos' AND auth.role() = 'authenticated');

-- DELETE
DROP POLICY IF EXISTS "registration_photos_delete" ON storage.objects;
CREATE POLICY "registration_photos_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'registration-photos' AND auth.role() = 'authenticated');
