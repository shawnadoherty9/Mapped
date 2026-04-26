-- Replace the broad DELETE policy with one that requires the caller to
-- present the install_id as a Postgres setting (set per request from the client).
DROP POLICY IF EXISTS "Anyone can delete saved comparisons" ON public.saved_comparisons;

CREATE POLICY "Owner device can delete saved comparisons"
  ON public.saved_comparisons
  FOR DELETE
  USING (
    install_id = current_setting('request.headers', true)::json->>'x-install-id'
  );
