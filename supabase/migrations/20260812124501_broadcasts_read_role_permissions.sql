-- Grant broadcast read access to admin only.
--
-- This gates the read side of the admin Email page: SES account health,
-- identity status, and the suppression list. Same audience as sending, so it
-- stays off the moderator role.
INSERT INTO public.role_permissions (role, permission)
VALUES ('admin', 'broadcasts.read')
ON CONFLICT (role, permission) DO NOTHING;
