-- Super admin: auth <> profile drift
-- Any auth.users row without a matching public.profiles row, or vice versa.
-- Should always be empty; non-empty = a trigger failed or someone hand-edited a table.

SELECT 'auth_user_without_profile' AS issue, u.id::text AS id, u.email AS detail, u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL

UNION ALL

SELECT 'profile_without_auth_user' AS issue, p.id::text AS id, p.username AS detail, p.created_at
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE u.id IS NULL

ORDER BY created_at DESC;
