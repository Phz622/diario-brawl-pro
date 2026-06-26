-- Reliable room link helpers
CREATE OR REPLACE FUNCTION public.save_and_release_room_link(p_room_id uuid, p_link text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link text := nullif(trim(coalesce(p_link, '')), '');
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_link IS NULL THEN RAISE EXCEPTION 'Informe o link da sala'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE id = p_room_id) THEN RAISE EXCEPTION 'Sala não encontrada'; END IF;

  INSERT INTO public.room_links (room_id, link, released, updated_by, updated_at)
  VALUES (p_room_id, v_link, true, auth.uid(), now())
  ON CONFLICT (room_id) DO UPDATE
    SET link = EXCLUDED.link,
        released = true,
        updated_by = auth.uid(),
        updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.get_released_room_link(p_room_id uuid)
RETURNS TABLE(link text, released boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rl.link, rl.released
  FROM public.room_links rl
  WHERE rl.room_id = p_room_id
    AND rl.released = true
    AND rl.link IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.room_participants rp
      WHERE rp.room_id = p_room_id AND rp.user_id = auth.uid()
    )
$$;

REVOKE ALL ON FUNCTION public.save_and_release_room_link(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_and_release_room_link(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_released_room_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_released_room_link(uuid) TO authenticated;

-- Admin action logs
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_logs TO authenticated;
GRANT ALL ON public.admin_logs TO service_role;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "main admin view logs" ON public.admin_logs;
CREATE POLICY "main admin view logs" ON public.admin_logs FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin_principal'));
DROP POLICY IF EXISTS "admins create logs" ON public.admin_logs;
CREATE POLICY "admins create logs" ON public.admin_logs FOR INSERT
  TO authenticated WITH CHECK (public.is_any_admin(auth.uid()) AND admin_id = auth.uid());

CREATE OR REPLACE FUNCTION public.log_admin_action(p_action text, p_target_type text, p_target_id uuid DEFAULT NULL, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_any_admin(auth.uid()) THEN
    INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.log_admin_action(text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, uuid, jsonb) TO authenticated;

-- Chat tables
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('public', 'private')),
  participant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT private_thread_pair CHECK ((type = 'public' AND participant_id IS NULL AND admin_id IS NULL) OR (type = 'private' AND participant_id IS NOT NULL AND admin_id IS NOT NULL))
);
GRANT SELECT, INSERT, UPDATE ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_threads TO service_role;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS one_public_chat_thread ON public.chat_threads ((type)) WHERE type = 'public';
CREATE UNIQUE INDEX IF NOT EXISTS one_private_chat_thread_pair ON public.chat_threads (participant_id, admin_id) WHERE type = 'private';

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text,
  image_path text,
  image_name text,
  image_size integer,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_has_content CHECK (nullif(trim(coalesce(body, '')), '') IS NOT NULL OR image_path IS NOT NULL),
  CONSTRAINT image_size_limit CHECK (image_size IS NULL OR image_size <= 10485760)
);
GRANT SELECT, INSERT, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS chat_messages_thread_created_idx ON public.chat_messages (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_expires_idx ON public.chat_messages (expires_at);

CREATE OR REPLACE FUNCTION public.can_access_chat_thread(p_thread_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_threads t
    WHERE t.id = p_thread_id
      AND (
        t.type = 'public'
        OR t.participant_id = p_user_id
        OR t.admin_id = p_user_id
        OR public.has_role(p_user_id, 'admin_principal')
      )
  )
$$;

DROP POLICY IF EXISTS "view allowed chat threads" ON public.chat_threads;
CREATE POLICY "view allowed chat threads" ON public.chat_threads FOR SELECT
  TO authenticated USING (
    type = 'public'
    OR participant_id = auth.uid()
    OR admin_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin_principal')
  );
DROP POLICY IF EXISTS "create own private chat threads" ON public.chat_threads;
CREATE POLICY "create own private chat threads" ON public.chat_threads FOR INSERT
  TO authenticated WITH CHECK (
    type = 'private'
    AND participant_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = admin_id AND ur.role IN ('admin_principal', 'admin_salas'))
  );
DROP POLICY IF EXISTS "update allowed chat threads" ON public.chat_threads;
CREATE POLICY "update allowed chat threads" ON public.chat_threads FOR UPDATE
  TO authenticated USING (public.can_access_chat_thread(id, auth.uid()))
  WITH CHECK (public.can_access_chat_thread(id, auth.uid()));

DROP POLICY IF EXISTS "view allowed chat messages" ON public.chat_messages;
CREATE POLICY "view allowed chat messages" ON public.chat_messages FOR SELECT
  TO authenticated USING (expires_at > now() AND public.can_access_chat_thread(thread_id, auth.uid()));
DROP POLICY IF EXISTS "send allowed chat messages" ON public.chat_messages;
CREATE POLICY "send allowed chat messages" ON public.chat_messages FOR INSERT
  TO authenticated WITH CHECK (sender_id = auth.uid() AND public.can_access_chat_thread(thread_id, auth.uid()) AND expires_at <= now() + interval '12 hours' + interval '1 minute');
DROP POLICY IF EXISTS "delete own chat messages" ON public.chat_messages;
CREATE POLICY "delete own chat messages" ON public.chat_messages FOR DELETE
  TO authenticated USING (sender_id = auth.uid() OR public.has_role(auth.uid(), 'admin_principal'));

CREATE OR REPLACE FUNCTION public.cleanup_expired_chat_messages()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.chat_messages WHERE expires_at <= now();
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_public_chat()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  PERFORM public.cleanup_expired_chat_messages();
  INSERT INTO public.chat_threads (type)
  VALUES ('public')
  ON CONFLICT ON CONSTRAINT chat_threads_pkey DO NOTHING;

  SELECT id INTO v_id FROM public.chat_threads WHERE type = 'public' LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.chat_threads (type) VALUES ('public') RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_or_create_private_chat(p_admin_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_admin_id IS NULL THEN RAISE EXCEPTION 'Selecione um admin'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_admin_id AND role IN ('admin_principal', 'admin_salas')) THEN
    RAISE EXCEPTION 'Admin não encontrado';
  END IF;
  PERFORM public.cleanup_expired_chat_messages();

  INSERT INTO public.chat_threads (type, participant_id, admin_id)
  VALUES ('private', v_user, p_admin_id)
  ON CONFLICT (participant_id, admin_id) WHERE type = 'private'
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.send_chat_message(p_thread_id uuid, p_body text DEFAULT NULL, p_image_path text DEFAULT NULL, p_image_name text DEFAULT NULL, p_image_size integer DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.can_access_chat_thread(p_thread_id, v_user) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF nullif(trim(coalesce(p_body, '')), '') IS NULL AND nullif(trim(coalesce(p_image_path, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Mensagem vazia';
  END IF;
  IF p_image_size IS NOT NULL AND p_image_size > 10485760 THEN RAISE EXCEPTION 'Imagem maior que 10MB'; END IF;

  PERFORM public.cleanup_expired_chat_messages();
  INSERT INTO public.chat_messages (thread_id, sender_id, body, image_path, image_name, image_size)
  VALUES (p_thread_id, v_user, nullif(trim(coalesce(p_body, '')), ''), nullif(trim(coalesce(p_image_path, '')), ''), nullif(trim(coalesce(p_image_name, '')), ''), p_image_size)
  RETURNING id INTO v_id;
  UPDATE public.chat_threads SET updated_at = now() WHERE id = p_thread_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.can_access_chat_thread(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_chat_thread(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_chat_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_chat_messages() TO authenticated;
REVOKE ALL ON FUNCTION public.get_or_create_public_chat() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_public_chat() TO authenticated;
REVOKE ALL ON FUNCTION public.get_or_create_private_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_private_chat(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.send_chat_message(uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text, text, text, integer) TO authenticated;

INSERT INTO public.chat_threads (type)
VALUES ('public')
ON CONFLICT ((type)) WHERE type = 'public' DO NOTHING;

-- Private chat image storage policies
DROP POLICY IF EXISTS "chat image upload" ON storage.objects;
CREATE POLICY "chat image upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND coalesce((metadata->>'size')::int, 0) <= 10485760
);
DROP POLICY IF EXISTS "chat image read" ON storage.objects;
CREATE POLICY "chat image read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-images');
DROP POLICY IF EXISTS "chat image owner delete" ON storage.objects;
CREATE POLICY "chat image owner delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Add logging to existing admin functions
CREATE OR REPLACE FUNCTION public.grant_role(p_user_id uuid, p_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, p_role) ON CONFLICT DO NOTHING;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'grant_role', 'user', p_user_id, jsonb_build_object('role', p_role));
END $function$;

CREATE OR REPLACE FUNCTION public.revoke_role(p_user_id uuid, p_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = p_role;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'revoke_role', 'user', p_user_id, jsonb_build_object('role', p_role));
END $function$;

CREATE OR REPLACE FUNCTION public.admin_adjust_balance(p_user_id uuid, p_delta numeric, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_bal NUMERIC;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  INSERT INTO public.wallets (user_id, balance) VALUES (p_user_id, 0) ON CONFLICT DO NOTHING;
  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_bal + p_delta < 0 THEN RAISE EXCEPTION 'Saldo ficaria negativo'; END IF;
  UPDATE public.wallets SET balance = balance + p_delta, updated_at=now() WHERE user_id = p_user_id;
  INSERT INTO public.wallet_transactions (user_id, amount, type, description)
    VALUES (p_user_id, p_delta, 'ajuste_admin', COALESCE(p_reason,'Ajuste manual'));
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'adjust_balance', 'user', p_user_id, jsonb_build_object('delta', p_delta, 'reason', COALESCE(p_reason,'Ajuste manual')));
END $function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_stats(p_user_id uuid, p_matches_played integer, p_wins integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_matches_played < 0 OR p_wins < 0 THEN RAISE EXCEPTION 'Valores inválidos'; END IF;
  UPDATE public.profiles
     SET matches_played = p_matches_played, wins = p_wins
   WHERE id = p_user_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'set_user_stats', 'user', p_user_id, jsonb_build_object('matches_played', p_matches_played, 'wins', p_wins));
END $function$;

CREATE OR REPLACE FUNCTION public.admin_delete_room(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room public.rooms;
  v_part RECORD;
  v_refunds int := 0;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada'; END IF;

  IF v_room.finished_at IS NULL THEN
    FOR v_part IN SELECT user_id FROM public.room_participants WHERE room_id = p_room_id LOOP
      UPDATE public.wallets SET balance = balance + v_room.entry_fee, updated_at = now()
        WHERE user_id = v_part.user_id;
      INSERT INTO public.wallet_transactions (user_id, amount, type, description, reference_id)
        VALUES (v_part.user_id, v_room.entry_fee, 'reembolso', 'Reembolso (sala excluída): ' || v_room.name, p_room_id);
      v_refunds := v_refunds + 1;
    END LOOP;
  END IF;

  DELETE FROM public.room_participants WHERE room_id = p_room_id;
  DELETE FROM public.room_links WHERE room_id = p_room_id;
  DELETE FROM public.rooms WHERE id = p_room_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'delete_room', 'room', p_room_id, jsonb_build_object('room_name', v_room.name, 'refunds', v_refunds, 'entry_fee', v_room.entry_fee));
END $function$;

CREATE OR REPLACE FUNCTION public.finalize_room_with_kills(p_room_id uuid, p_winner_id uuid, p_kills jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room public.rooms;
  v_part RECORD;
  v_kills INT;
  v_payout NUMERIC;
  v_total_payout NUMERIC := 0;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada'; END IF;
  IF v_room.finished_at IS NOT NULL THEN RAISE EXCEPTION 'Partida já finalizada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.room_participants WHERE room_id = p_room_id AND user_id = p_winner_id) THEN
    RAISE EXCEPTION 'Vencedor não está inscrito';
  END IF;

  FOR v_part IN SELECT user_id FROM public.room_participants WHERE room_id = p_room_id LOOP
    v_kills := COALESCE((p_kills ->> v_part.user_id::text)::int, 0);
    IF v_kills < 0 OR v_kills > 9 THEN
      RAISE EXCEPTION 'Kills inválidas (0-9 por jogador)';
    END IF;
  END LOOP;

  FOR v_part IN SELECT user_id FROM public.room_participants WHERE room_id = p_room_id LOOP
    v_kills := COALESCE((p_kills ->> v_part.user_id::text)::int, 0);
    v_payout := v_kills * v_room.kill_value;
    IF v_part.user_id = p_winner_id THEN
      v_payout := v_payout + v_room.win_value;
    END IF;
    v_total_payout := v_total_payout + v_payout;

    IF v_payout > 0 THEN
      UPDATE public.wallets SET balance = balance + v_payout, updated_at = now()
        WHERE user_id = v_part.user_id;
      IF v_kills > 0 AND v_room.kill_value > 0 THEN
        INSERT INTO public.wallet_transactions (user_id, amount, type, description, reference_id)
          VALUES (v_part.user_id, v_kills * v_room.kill_value, 'kill_bonus'::public.tx_type,
                  v_kills || ' kill(s) em ' || v_room.name, p_room_id);
      END IF;
      IF v_part.user_id = p_winner_id AND v_room.win_value > 0 THEN
        INSERT INTO public.wallet_transactions (user_id, amount, type, description, reference_id)
          VALUES (p_winner_id, v_room.win_value, 'premio'::public.tx_type,
                  'Prêmio vencedor: ' || v_room.name, p_room_id);
      END IF;
    END IF;

    UPDATE public.profiles SET matches_played = matches_played + 1 WHERE id = v_part.user_id;
  END LOOP;

  UPDATE public.profiles SET wins = wins + 1 WHERE id = p_winner_id;
  UPDATE public.rooms SET status='fechada', finished_at = now(), winner_id = p_winner_id WHERE id = p_room_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'finalize_room', 'room', p_room_id, jsonb_build_object('winner_id', p_winner_id, 'kills', p_kills, 'total_payout', v_total_payout));
END $function$;

-- Ensure execute grants remain
GRANT EXECUTE ON FUNCTION public.grant_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_balance(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_stats(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_room_with_kills(uuid, uuid, jsonb) TO authenticated;