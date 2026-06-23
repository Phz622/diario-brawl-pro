
-- Secondary nick & winner tracking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nick2 TEXT;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS winner_id UUID;

-- Update handle_new_user to also persist nick2
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name TEXT := NEW.raw_user_meta_data ->> 'full_name';
  v_phone TEXT := NEW.raw_user_meta_data ->> 'phone';
  v_nick TEXT := NEW.raw_user_meta_data ->> 'nick';
  v_nick2 TEXT := NEW.raw_user_meta_data ->> 'nick2';
  v_is_admin BOOLEAN := COALESCE((NEW.raw_user_meta_data ->> 'is_main_admin')::boolean, false);
BEGIN
  IF v_full_name IS NOT NULL AND v_phone IS NOT NULL AND v_nick IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, phone, nick, nick2, is_main_admin)
    VALUES (NEW.id, v_full_name, v_phone, v_nick, NULLIF(v_nick2,''), v_is_admin);
  END IF;
  INSERT INTO public.wallets (user_id, balance) VALUES (NEW.id, 0) ON CONFLICT DO NOTHING;
  IF v_is_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin_principal') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'participante') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $function$;

-- Finalize room with winner, +R$10 bonus
CREATE OR REPLACE FUNCTION public.finalize_room_with_winner(p_room_id uuid, p_winner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_room public.rooms;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada'; END IF;
  IF v_room.finished_at IS NOT NULL THEN RAISE EXCEPTION 'Partida já finalizada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.room_participants WHERE room_id = p_room_id AND user_id = p_winner_id) THEN
    RAISE EXCEPTION 'Vencedor não está inscrito';
  END IF;

  UPDATE public.profiles SET matches_played = matches_played + 1
  WHERE id IN (SELECT user_id FROM public.room_participants WHERE room_id = p_room_id);

  UPDATE public.wallets SET balance = balance + 10, updated_at = now() WHERE user_id = p_winner_id;
  INSERT INTO public.wallet_transactions (user_id, amount, type, description, reference_id)
    VALUES (p_winner_id, 10, 'premio', 'Prêmio vencedor: ' || v_room.name, p_room_id);

  UPDATE public.rooms SET status='fechada', finished_at = now(), winner_id = p_winner_id WHERE id = p_room_id;
END $function$;

-- Admin delete user (cascades + nulls FKs with NO ACTION)
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'Não é possível excluir a própria conta'; END IF;

  UPDATE public.deposit_requests SET decided_by = NULL WHERE decided_by = p_user_id;
  UPDATE public.withdrawal_requests SET decided_by = NULL WHERE decided_by = p_user_id;
  UPDATE public.rooms SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.room_links SET updated_by = NULL WHERE updated_by = p_user_id;

  DELETE FROM auth.users WHERE id = p_user_id;
END $function$;

GRANT EXECUTE ON FUNCTION public.finalize_room_with_winner(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
