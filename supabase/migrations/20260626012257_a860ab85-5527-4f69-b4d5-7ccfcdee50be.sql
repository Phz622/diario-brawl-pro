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

  SELECT id INTO v_id FROM public.chat_threads WHERE type = 'public' LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.chat_threads (type) VALUES ('public') RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.get_or_create_public_chat() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_public_chat() TO authenticated;