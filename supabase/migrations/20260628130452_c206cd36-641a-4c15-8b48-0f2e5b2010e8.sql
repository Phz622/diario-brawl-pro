-- Harden SECURITY DEFINER function exposure.
-- 1) Revoke EXECUTE from PUBLIC and anon on all SECURITY DEFINER functions in public schema.
-- 2) Revoke EXECUTE from authenticated on admin-only RPCs (in-function role checks already RAISE).
-- 3) Re-grant EXECUTE to authenticated on user-callable RPCs.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon', r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- Admin-only: revoke from authenticated (callers must be admin; func checks role and RAISEs)
REVOKE EXECUTE ON FUNCTION public.get_room_link_admin(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_room_link(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.release_room_link(uuid, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.save_and_release_room_link(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_remove_participant(uuid, uuid, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_balance(uuid, numeric, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_room(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_stats(uuid, integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_deposit(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_deposit(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_withdrawal(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_withdrawal(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_room(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_room_with_winner(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_room_with_kills(uuid, uuid, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_role(uuid, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_role(uuid, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_app_settings(text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, text, uuid, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_chat_messages() FROM authenticated;

-- Re-grant only to admin roles (Supabase has no "admin" role concept at DB level;
-- enforcement stays via in-function has_role/is_any_admin RAISE checks for authenticated callers).
-- We grant back to authenticated for those that need it because role enforcement is in-function:
GRANT EXECUTE ON FUNCTION public.get_room_link_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_room_link(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_room_link(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_and_release_room_link(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_participant(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_balance(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_stats(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_deposit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_deposit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_withdrawal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_room_with_winner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_room_with_kills(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_app_settings(text, text) TO authenticated;

-- User-callable RPCs (require auth; first line of each RAISEs if auth.uid() is null or unauthorized)
GRANT EXECUTE ON FUNCTION public.join_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_withdrawal_request(numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_room_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_room_nicks(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_released_room_link(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_public_chat() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_private_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_admins() TO authenticated;

-- Helpers used by RLS policies must remain callable by authenticated (policies execute as the calling role)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_any_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_chat_thread(uuid, uuid) TO authenticated;

-- Harden get_room_link_admin: fail fast for non-admins (defense in depth)
CREATE OR REPLACE FUNCTION public.get_room_link_admin(p_room_id uuid)
 RETURNS TABLE(link text, released boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY SELECT rl.link, rl.released FROM public.room_links rl WHERE rl.room_id = p_room_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.get_room_link_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_link_admin(uuid) TO authenticated;