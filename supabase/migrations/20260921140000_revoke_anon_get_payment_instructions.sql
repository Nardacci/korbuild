-- get_payment_instructions() returns KORbuild's payment details (PIX key,
-- account holder, bank, contact) and has no guard of its own, so with EXECUTE
-- granted to anon/PUBLIC anyone holding the publishable key could call it
-- without signing in.
--
-- Its only caller is openPaymentInstructions() in billing.js, which runs on a
-- click inside billing.html -- a guarded page (not in the access guard's public
-- page list, so it redirects to index.html without a session) -- with a
-- supabase-js client that sends the user's JWT. No pre-login screen uses it.
-- Same treatment as the tenant-scoped RPCs (migration 20260921130000):
-- authenticated + service_role keep EXECUTE, PUBLIC/anon lose it.
--
-- Test: supabase/tests/anon_and_unprovisioned.sql.
--
-- NOTE: local migrations are not in the remote history -- do NOT use
-- "supabase db push"; apply with "supabase db query --linked -f <this file>".

revoke execute on function public.get_payment_instructions() from public, anon;
grant execute on function public.get_payment_instructions() to authenticated, service_role;
