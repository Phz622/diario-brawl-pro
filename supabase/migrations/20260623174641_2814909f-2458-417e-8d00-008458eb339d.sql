
-- 1. Matches played
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS matches_played integer NOT NULL DEFAULT 0;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS finished_at timestamptz;

-- 2. Room links
CREATE TABLE IF NOT EXISTS public.room_links (
  room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  link text,
  released boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_links TO authenticated;
GRANT ALL ON public.room_links TO service_role;
ALTER TABLE public.room_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage room_links" ON public.room_links FOR ALL
  TO authenticated USING (public.is_any_admin(auth.uid())) WITH CHECK (public.is_any_admin(auth.uid()));
CREATE POLICY "participants view released link" ON public.room_links FOR SELECT
  TO authenticated USING (
    released = true AND EXISTS (
      SELECT 1 FROM public.room_participants rp WHERE rp.room_id = room_links.room_id AND rp.user_id = auth.uid()
    )
  );

-- 3. Public room counts (any authenticated user)
CREATE OR REPLACE FUNCTION public.get_room_counts()
RETURNS TABLE(room_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT room_id, count(*)::bigint FROM public.room_participants GROUP BY room_id
$$;

CREATE OR REPLACE FUNCTION public.get_room_nicks(p_room_id uuid)
RETURNS TABLE(user_id uuid, nick text, is_me boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rp.user_id, p.nick, (rp.user_id = auth.uid()) AS is_me
  FROM public.room_participants rp
  JOIN public.profiles p ON p.id = rp.user_id
  WHERE rp.room_id = p_room_id
  ORDER BY rp.joined_at ASC
$$;

-- 4. Room link management
CREATE OR REPLACE FUNCTION public.set_room_link(p_room_id uuid, p_link text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  INSERT INTO public.room_links (room_id, link, updated_by, updated_at)
  VALUES (p_room_id, p_link, auth.uid(), now())
  ON CONFLICT (room_id) DO UPDATE SET link = EXCLUDED.link, updated_by = auth.uid(), updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.release_room_link(p_room_id uuid, p_released boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  INSERT INTO public.room_links (room_id, released, updated_by, updated_at)
  VALUES (p_room_id, p_released, auth.uid(), now())
  ON CONFLICT (room_id) DO UPDATE SET released = EXCLUDED.released, updated_by = auth.uid(), updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.get_room_link_admin(p_room_id uuid)
RETURNS TABLE(link text, released boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rl.link, rl.released FROM public.room_links rl WHERE rl.room_id = p_room_id
  AND public.is_any_admin(auth.uid())
$$;

-- 5. Finalize room: close + increment matches_played for participants
CREATE OR REPLACE FUNCTION public.finalize_room(p_room_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_room public.rooms;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada'; END IF;
  IF v_room.finished_at IS NOT NULL THEN RAISE EXCEPTION 'Partida já finalizada'; END IF;

  UPDATE public.profiles SET matches_played = matches_played + 1
  WHERE id IN (SELECT user_id FROM public.room_participants WHERE room_id = p_room_id);

  UPDATE public.rooms SET status = 'fechada', finished_at = now() WHERE id = p_room_id;
END $$;

-- 6. Ranking (any authenticated user can view)
CREATE OR REPLACE FUNCTION public.get_ranking(p_limit integer DEFAULT 50)
RETURNS TABLE(nick text, matches_played integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nick, matches_played FROM public.profiles
  WHERE matches_played > 0
  ORDER BY matches_played DESC, nick ASC
  LIMIT GREATEST(1, COALESCE(p_limit, 50))
$$;

-- 7. Permissions
REVOKE ALL ON FUNCTION public.get_room_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_room_counts() TO authenticated;
REVOKE ALL ON FUNCTION public.get_room_nicks(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_room_nicks(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.set_room_link(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_room_link(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.release_room_link(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_room_link(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.get_room_link_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_room_link_admin(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.finalize_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_room(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_ranking(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ranking(integer) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.room_links;
