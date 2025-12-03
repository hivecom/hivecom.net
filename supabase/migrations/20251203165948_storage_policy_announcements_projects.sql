-- Storage policies for project banner assets
DROP POLICY IF EXISTS "Allow authorized roles to INSERT project assets in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to INSERT project assets in storage" ON storage.objects
	FOR INSERT TO authenticated
		WITH CHECK (
			bucket_id = 'hivecom-content-static'
			AND name LIKE 'projects/%'
			AND (
				public.has_permission('projects.create'::public.app_permission)
				OR public.has_permission('projects.update'::public.app_permission)
			)
		);

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE project assets in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to UPDATE project assets in storage" ON storage.objects
	FOR UPDATE TO authenticated
		USING (
			bucket_id = 'hivecom-content-static'
			AND name LIKE 'projects/%'
			AND public.has_permission('projects.update'::public.app_permission)
		)
		WITH CHECK (
			bucket_id = 'hivecom-content-static'
			AND name LIKE 'projects/%'
			AND public.has_permission('projects.update'::public.app_permission)
		);

DROP POLICY IF EXISTS "Allow authorized roles to DELETE project assets in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to DELETE project assets in storage" ON storage.objects
	FOR DELETE TO authenticated
		USING (
			bucket_id = 'hivecom-content-static'
			AND name LIKE 'projects/%'
			AND (
				public.has_permission('projects.delete'::public.app_permission)
				OR public.has_permission('projects.update'::public.app_permission)
			)
		);

DROP POLICY IF EXISTS "Allow public SELECT project assets in storage" ON storage.objects;

CREATE POLICY "Allow public SELECT project assets in storage" ON storage.objects
	FOR SELECT TO authenticated, anon
		USING (
			bucket_id = 'hivecom-content-static'
			AND name LIKE 'projects/%'
		);

-- Storage policies for announcement assets (mirrors project policies)
DROP POLICY IF EXISTS "Allow authorized roles to INSERT announcement assets in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to INSERT announcement assets in storage" ON storage.objects
	FOR INSERT TO authenticated
		WITH CHECK (
			bucket_id = 'hivecom-content-static'
			AND name LIKE 'announcements/%'
			AND (
				public.has_permission('announcements.create'::public.app_permission)
				OR public.has_permission('announcements.update'::public.app_permission)
			)
		);

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE announcement assets in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to UPDATE announcement assets in storage" ON storage.objects
	FOR UPDATE TO authenticated
		USING (
			bucket_id = 'hivecom-content-static'
			AND name LIKE 'announcements/%'
			AND public.has_permission('announcements.update'::public.app_permission)
		)
		WITH CHECK (
			bucket_id = 'hivecom-content-static'
			AND name LIKE 'announcements/%'
			AND public.has_permission('announcements.update'::public.app_permission)
		);

DROP POLICY IF EXISTS "Allow authorized roles to DELETE announcement assets in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to DELETE announcement assets in storage" ON storage.objects
	FOR DELETE TO authenticated
		USING (
			bucket_id = 'hivecom-content-static'
			AND name LIKE 'announcements/%'
			AND (
				public.has_permission('announcements.delete'::public.app_permission)
				OR public.has_permission('announcements.update'::public.app_permission)
			)
		);

DROP POLICY IF EXISTS "Allow public SELECT announcement assets in storage" ON storage.objects;

CREATE POLICY "Allow public SELECT announcement assets in storage" ON storage.objects
	FOR SELECT TO authenticated, anon
		USING (
			bucket_id = 'hivecom-content-static'
			AND name LIKE 'announcements/%'
		);
