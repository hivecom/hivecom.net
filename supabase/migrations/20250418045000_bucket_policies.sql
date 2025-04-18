-- Allow users to upload their own avatars.
DO $$
BEGIN
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'Allow users to CRUD their avatar.png') THEN
  CREATE POLICY "Allow users to CRUD their avatar.png" ON storage.objects
    FOR ALL TO authenticated
      USING(bucket_id = 'hivecom-content-users' AND name = 'avatar.png'
        AND(
          SELECT
            auth.uid( )::text ) =(storage.foldername(name ) )[1] );
END IF;
END
$$;

-- Allow authorized roles to CRUD all objects in the hivecom-content-static games directory of the static bucket.
DO $$
BEGIN
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'Allow authorized roles to CRUD games in storage') THEN
  CREATE POLICY "Allow authorized roles to CRUD games in storage" ON storage.objects
    FOR ALL TO authenticated
      USING((bucket_id = 'hivecom-content-static'::text )
        AND(name LIKE 'games/%'::text )
        AND(
          SELECT
            authorize('games.crud'::public.app_permission ) AS authorize ) );
END IF;
END
$$;

