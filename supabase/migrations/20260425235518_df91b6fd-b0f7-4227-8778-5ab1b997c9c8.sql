-- Switch to RPC-based delete: simpler than header-based RLS for an anon app.
DROP POLICY IF EXISTS "Owner device can delete saved comparisons" ON public.saved_comparisons;

-- No direct deletes allowed — clients must go through delete_saved_comparison().
-- (Absence of a DELETE policy = no rows can be deleted under RLS.)

CREATE OR REPLACE FUNCTION public.delete_saved_comparison(
  _id UUID,
  _install_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted INTEGER;
BEGIN
  IF _install_id IS NULL OR length(_install_id) < 8 THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.saved_comparisons
  WHERE id = _id
    AND install_id = _install_id;

  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted > 0;
END;
$$;

-- Allow public callers (anon / authenticated) to invoke the helper.
GRANT EXECUTE ON FUNCTION public.delete_saved_comparison(UUID, TEXT) TO anon, authenticated;
