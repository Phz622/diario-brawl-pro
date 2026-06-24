
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'premio';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wins integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.admin_set_user_stats(
  p_user_id uuid, p_matches_played integer, p_wins integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_matches_played < 0 OR p_wins < 0 THEN RAISE EXCEPTION 'Valores inválidos'; END IF;
  UPDATE public.profiles
     SET matches_played = p_matches_played, wins = p_wins
   WHERE id = p_user_id;
END $$;

DROP FUNCTION IF EXISTS public.get_ranking(integer);
CREATE OR REPLACE FUNCTION public.get_ranking(p_limit integer DEFAULT 50)
RETURNS TABLE(nick text, matches_played integer, wins integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT nick, matches_played, wins FROM public.profiles
  WHERE matches_played > 0 OR wins > 0
  ORDER BY wins DESC, matches_played DESC, nick ASC
  LIMIT GREATEST(1, COALESCE(p_limit, 50))
$$;

CREATE OR REPLACE FUNCTION public.finalize_room_with_winner(p_room_id uuid, p_winner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  UPDATE public.profiles SET wins = wins + 1 WHERE id = p_winner_id;

  UPDATE public.wallets SET balance = balance + 10, updated_at = now() WHERE user_id = p_winner_id;
  INSERT INTO public.wallet_transactions (user_id, amount, type, description, reference_id)
    VALUES (p_winner_id, 10, 'premio'::public.tx_type, 'Prêmio vencedor: ' || v_room.name, p_room_id);

  UPDATE public.rooms SET status='fechada', finished_at = now(), winner_id = p_winner_id WHERE id = p_room_id;
END $$;
