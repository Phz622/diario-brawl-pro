-- Final reliability fixes: room link release, public chat singleton, chat image bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-images', 'chat-images', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

CREATE OR REPLACE FUNCTION public.save_and_release_room_link(p_room_id uuid, p_link text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_link text := nullif(trim(coalesce(p_link, '')), '');
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_link IS NULL THEN RAISE EXCEPTION 'Informe o link da sala'; END IF;
  INSERT INTO public.room_links (room_id, link, released, updated_by, updated_at)
  VALUES (p_room_id, v_link, true, auth.uid(), now())
  ON CONFLICT (room_id) DO UPDATE SET link = EXCLUDED.link, released = true, updated_by = auth.uid(), updated_at = now();
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'save_and_release_room_link', 'room', p_room_id, jsonb_build_object('link', v_link));
END $$;

CREATE OR REPLACE FUNCTION public.get_released_room_link(p_room_id uuid)
RETURNS TABLE(link text, released boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rl.link, rl.released FROM public.room_links rl
  WHERE rl.room_id = p_room_id AND rl.released = true AND nullif(trim(coalesce(rl.link, '')), '') IS NOT NULL
    AND (public.is_any_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.room_participants rp WHERE rp.room_id = p_room_id AND rp.user_id = auth.uid()))
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_public_chat()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  PERFORM public.cleanup_expired_chat_messages();
  INSERT INTO public.chat_threads (type) VALUES ('public')
  ON CONFLICT ((type)) WHERE type = 'public' DO UPDATE SET updated_at = public.chat_threads.updated_at
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.save_and_release_room_link(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_released_room_link(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_public_chat() TO authenticated;
