-- The wine-images bucket was created public (20260213000027), with a
-- "Public read access" policy allowing anyone with the anon key to read
-- any object by path - flagged as security finding #3 in
-- docs/WEITERENTWICKLUNGSPOTENZIAL_2026-07-22.md. Paths are namespaced by
-- uploader user_id (UUID), so blind enumeration was impractical, but any
-- leaked URL (referrer, screenshot, shared link) stayed readable forever
-- with no way to revoke it, and the bucket itself was world-readable by
-- design rather than by accident.
--
-- Switches the bucket private and replaces public read with an
-- owner-scoped SELECT policy. The application now mints a long-lived
-- signed URL per image (services/imageStorage.ts) instead of a bare
-- public URL - minting that link still requires the owning user's own
-- authenticated session, closing the "construct the path yourself" hole,
-- even though an already-minted link remains valid until it expires.

UPDATE storage.buckets SET public = false WHERE id = 'wine-images';

DROP POLICY IF EXISTS "Public read access for wine images" ON storage.objects;

CREATE POLICY "Users can read own wine images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'wine-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
