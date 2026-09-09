-- Grant broadcast sending to admin only.
--
-- Broadcasts go to the entire member base, so this stays off the moderator
-- role. The admin-email-broadcast edge function checks this permission (plus
-- ban status and aal2) before sending anything.
INSERT INTO public.role_permissions (role, permission)
VALUES ('admin', 'broadcasts.create')
ON CONFLICT (role, permission) DO NOTHING;
