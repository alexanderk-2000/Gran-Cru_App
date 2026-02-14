-- Create wine-images storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wine-images',
  'wine-images',
  true,
  5242880, -- 5MB
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images into their own folder
CREATE POLICY "Users can upload wine images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'wine-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update/replace their own images
CREATE POLICY "Users can update own wine images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'wine-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete their own images
CREATE POLICY "Users can delete own wine images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'wine-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow public read access (images are served via CDN URL)
CREATE POLICY "Public read access for wine images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'wine-images');
