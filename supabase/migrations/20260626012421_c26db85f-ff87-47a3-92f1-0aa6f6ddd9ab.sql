CREATE OR REPLACE FUNCTION public.get_chat_admins()
RETURNS TABLE(user_id uuid, nick text, full_name text, is_owner boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.nick, p.full_name, public.has_role(p.id, 'admin_principal') AS is_owner
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('admin_principal', 'admin_salas')
  ORDER BY public.has_role(p.id, 'admin_principal') DESC, p.nick ASC
$$;

REVOKE ALL ON FUNCTION public.get_chat_admins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_admins() TO authenticated;