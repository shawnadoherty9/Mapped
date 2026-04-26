-- 1. Attach the existing handle_new_user() function as a trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Backfill profiles for any auth users that don't have one yet
INSERT INTO public.profiles (user_id, display_name, role)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'display_name', ''), split_part(u.email, '@', 1)),
  COALESCE(
    NULLIF(u.raw_user_meta_data ->> 'role', '')::public.app_account_role,
    CASE WHEN u.email ILIKE '%employer%' OR u.email ILIKE '%policy%' THEN 'policymaker'::public.app_account_role
         ELSE 'individual'::public.app_account_role END
  )
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.id IS NULL;
