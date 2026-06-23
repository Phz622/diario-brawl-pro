
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin_principal', 'admin_salas', 'participante');
CREATE TYPE public.request_status AS ENUM ('pendente', 'aprovado', 'recusado', 'cancelado');
CREATE TYPE public.room_status AS ENUM ('aberta', 'fechada');
CREATE TYPE public.tx_type AS ENUM ('deposito', 'saque', 'inscricao', 'ajuste_admin', 'reembolso');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  nick TEXT NOT NULL,
  is_main_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_full_name_key ON public.profiles (lower(full_name));
CREATE UNIQUE INDEX profiles_phone_key ON public.profiles (phone);
CREATE UNIQUE INDEX profiles_nick_key ON public.profiles (lower(nick));

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin_principal', 'admin_salas')
  )
$$;

-- WALLETS
CREATE TABLE public.wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- DEPOSIT REQUESTS
CREATE TABLE public.deposit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  pix_holder_name TEXT NOT NULL,
  status public.request_status NOT NULL DEFAULT 'pendente',
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.deposit_requests TO authenticated;
GRANT ALL ON public.deposit_requests TO service_role;
ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;

-- WITHDRAWAL REQUESTS
CREATE TABLE public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  pix_key TEXT NOT NULL,
  status public.request_status NOT NULL DEFAULT 'pendente',
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- ROOMS
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  entry_fee NUMERIC(12,2) NOT NULL CHECK (entry_fee >= 0),
  max_participants INTEGER NOT NULL CHECK (max_participants > 0),
  status public.room_status NOT NULL DEFAULT 'aberta',
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- ROOM PARTICIPANTS
CREATE TABLE public.room_participants (
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.room_participants TO authenticated;
GRANT ALL ON public.room_participants TO service_role;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;

-- WALLET TRANSACTIONS
CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  type public.tx_type NOT NULL,
  description TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- APP SETTINGS (singleton)
CREATE TABLE public.app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pix_key TEXT NOT NULL DEFAULT '',
  pix_holder_name TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id, pix_key, pix_holder_name) VALUES (1, '', '');
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- POLICIES
-- profiles
CREATE POLICY "view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "admins view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_any_admin(auth.uid()));
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "admins update profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin_principal')) WITH CHECK (public.has_role(auth.uid(),'admin_principal'));

-- user_roles
CREATE POLICY "view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_any_admin(auth.uid()));

-- wallets
CREATE POLICY "view own wallet" ON public.wallets FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_any_admin(auth.uid()));

-- deposit_requests
CREATE POLICY "view own deposits" ON public.deposit_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin_principal'));
CREATE POLICY "create own deposits" ON public.deposit_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pendente');
CREATE POLICY "cancel own pending deposits" ON public.deposit_requests FOR UPDATE TO authenticated USING (user_id = auth.uid() AND status = 'pendente') WITH CHECK (user_id = auth.uid() AND status IN ('pendente','cancelado'));

-- withdrawal_requests
CREATE POLICY "view own withdrawals" ON public.withdrawal_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin_principal'));
CREATE POLICY "create own withdrawals" ON public.withdrawal_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pendente');
CREATE POLICY "cancel own pending withdrawals" ON public.withdrawal_requests FOR UPDATE TO authenticated USING (user_id = auth.uid() AND status = 'pendente') WITH CHECK (user_id = auth.uid() AND status IN ('pendente','cancelado'));

-- rooms
CREATE POLICY "all auth view rooms" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage rooms" ON public.rooms FOR INSERT TO authenticated WITH CHECK (public.is_any_admin(auth.uid()));
CREATE POLICY "admins update rooms" ON public.rooms FOR UPDATE TO authenticated USING (public.is_any_admin(auth.uid())) WITH CHECK (public.is_any_admin(auth.uid()));
CREATE POLICY "main admin delete rooms" ON public.rooms FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin_principal'));

-- room_participants
CREATE POLICY "view participants of room one is in or admins" ON public.room_participants FOR SELECT TO authenticated USING (
  public.is_any_admin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.room_participants rp WHERE rp.room_id = room_participants.room_id AND rp.user_id = auth.uid())
);
-- join handled via RPC; allow self-insert as backup blocked by trigger
CREATE POLICY "no direct insert" ON public.room_participants FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "admin remove participant" ON public.room_participants FOR DELETE TO authenticated USING (public.is_any_admin(auth.uid()));

-- wallet_transactions
CREATE POLICY "view own tx" ON public.wallet_transactions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_any_admin(auth.uid()));

-- app_settings
CREATE POLICY "all auth view settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
-- Updates done via RPC (only main admin)

-- TRIGGER: on signup -> create wallet + assign participante
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_full_name TEXT := NEW.raw_user_meta_data ->> 'full_name';
  v_phone TEXT := NEW.raw_user_meta_data ->> 'phone';
  v_nick TEXT := NEW.raw_user_meta_data ->> 'nick';
  v_is_admin BOOLEAN := COALESCE((NEW.raw_user_meta_data ->> 'is_main_admin')::boolean, false);
BEGIN
  -- For main admin we may pass values directly; for normal users metadata required
  IF v_full_name IS NOT NULL AND v_phone IS NOT NULL AND v_nick IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, phone, nick, is_main_admin)
    VALUES (NEW.id, v_full_name, v_phone, v_nick, v_is_admin);
  END IF;

  INSERT INTO public.wallets (user_id, balance) VALUES (NEW.id, 0) ON CONFLICT DO NOTHING;

  IF v_is_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin_principal') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'participante') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RPC: join_room (atomic)
CREATE OR REPLACE FUNCTION public.join_room(p_room_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room public.rooms;
  v_count INT;
  v_balance NUMERIC;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada'; END IF;
  IF v_room.status <> 'aberta' THEN RAISE EXCEPTION 'Inscrições fechadas'; END IF;

  IF EXISTS (SELECT 1 FROM public.room_participants WHERE room_id = p_room_id AND user_id = v_user) THEN
    RAISE EXCEPTION 'Você já está inscrito';
  END IF;

  SELECT count(*) INTO v_count FROM public.room_participants WHERE room_id = p_room_id;
  IF v_count >= v_room.max_participants THEN RAISE EXCEPTION 'Sala lotada'; END IF;

  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_balance < v_room.entry_fee THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  UPDATE public.wallets SET balance = balance - v_room.entry_fee, updated_at = now() WHERE user_id = v_user;
  INSERT INTO public.room_participants (room_id, user_id) VALUES (p_room_id, v_user);
  INSERT INTO public.wallet_transactions (user_id, amount, type, description, reference_id)
    VALUES (v_user, -v_room.entry_fee, 'inscricao', 'Inscrição em ' || v_room.name, p_room_id);

  -- auto-close if filled
  IF v_count + 1 >= v_room.max_participants THEN
    UPDATE public.rooms SET status = 'fechada' WHERE id = p_room_id;
  END IF;
END $$;

-- RPC: leave_room (admin removes user OR user leaves with refund) — main admin only with refund
CREATE OR REPLACE FUNCTION public.admin_remove_participant(p_room_id UUID, p_user_id UUID, p_refund BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room public.rooms;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada'; END IF;
  DELETE FROM public.room_participants WHERE room_id = p_room_id AND user_id = p_user_id;
  IF p_refund THEN
    UPDATE public.wallets SET balance = balance + v_room.entry_fee, updated_at = now() WHERE user_id = p_user_id;
    INSERT INTO public.wallet_transactions (user_id, amount, type, description, reference_id)
      VALUES (p_user_id, v_room.entry_fee, 'reembolso', 'Reembolso ' || v_room.name, p_room_id);
  END IF;
END $$;

-- RPC: approve_deposit
CREATE OR REPLACE FUNCTION public.approve_deposit(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req public.deposit_requests;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_req FROM public.deposit_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pendente' THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
  UPDATE public.deposit_requests SET status='aprovado', decided_by=auth.uid(), decided_at=now() WHERE id=p_id;
  UPDATE public.wallets SET balance = balance + v_req.amount, updated_at=now() WHERE user_id = v_req.user_id;
  INSERT INTO public.wallet_transactions (user_id, amount, type, description, reference_id)
    VALUES (v_req.user_id, v_req.amount, 'deposito', 'Depósito aprovado', v_req.id);
END $$;

-- RPC: reject_deposit
CREATE OR REPLACE FUNCTION public.reject_deposit(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req public.deposit_requests;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_req FROM public.deposit_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pendente' THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
  UPDATE public.deposit_requests SET status='recusado', decided_by=auth.uid(), decided_at=now() WHERE id=p_id;
END $$;

-- RPC: approve_withdrawal (debita saldo)
CREATE OR REPLACE FUNCTION public.approve_withdrawal(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req public.withdrawal_requests; v_bal NUMERIC;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pendente' THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_req.user_id FOR UPDATE;
  IF v_bal < v_req.amount THEN RAISE EXCEPTION 'Saldo insuficiente do usuário'; END IF;
  UPDATE public.wallets SET balance = balance - v_req.amount, updated_at=now() WHERE user_id = v_req.user_id;
  UPDATE public.withdrawal_requests SET status='aprovado', decided_by=auth.uid(), decided_at=now() WHERE id=p_id;
  INSERT INTO public.wallet_transactions (user_id, amount, type, description, reference_id)
    VALUES (v_req.user_id, -v_req.amount, 'saque', 'Saque aprovado', v_req.id);
END $$;

CREATE OR REPLACE FUNCTION public.reject_withdrawal(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req public.withdrawal_requests;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pendente' THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
  UPDATE public.withdrawal_requests SET status='recusado', decided_by=auth.uid(), decided_at=now() WHERE id=p_id;
END $$;

-- RPC: admin_adjust_balance (principal only)
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(p_user_id UUID, p_delta NUMERIC, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bal NUMERIC;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  INSERT INTO public.wallets (user_id, balance) VALUES (p_user_id, 0) ON CONFLICT DO NOTHING;
  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_bal + p_delta < 0 THEN RAISE EXCEPTION 'Saldo ficaria negativo'; END IF;
  UPDATE public.wallets SET balance = balance + p_delta, updated_at=now() WHERE user_id = p_user_id;
  INSERT INTO public.wallet_transactions (user_id, amount, type, description)
    VALUES (p_user_id, p_delta, 'ajuste_admin', COALESCE(p_reason,'Ajuste manual'));
END $$;

-- RPC: update settings (principal only)
CREATE OR REPLACE FUNCTION public.update_app_settings(p_pix_key TEXT, p_pix_holder TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  UPDATE public.app_settings SET pix_key = p_pix_key, pix_holder_name = p_pix_holder, updated_at = now() WHERE id = 1;
END $$;

-- RPC: grant/revoke role (principal only)
CREATE OR REPLACE FUNCTION public.grant_role(p_user_id UUID, p_role public.app_role)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, p_role) ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_role(p_user_id UUID, p_role public.app_role)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = p_role;
END $$;

-- RPC: admin_update_profile (principal only)
CREATE OR REPLACE FUNCTION public.admin_update_profile(p_user_id UUID, p_full_name TEXT, p_phone TEXT, p_nick TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  UPDATE public.profiles SET full_name = p_full_name, phone = p_phone, nick = p_nick WHERE id = p_user_id;
END $$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deposit_requests;
