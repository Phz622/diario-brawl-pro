
-- 1. Add kill/win value columns to rooms
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS kill_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS win_value NUMERIC NOT NULL DEFAULT 0;

-- Backfill sensible defaults for existing rooms based on entry_fee preset
UPDATE public.rooms SET
  kill_value = CASE
    WHEN entry_fee <= 2.50 THEN 1.50
    WHEN entry_fee <= 5.00 THEN 3.00
    WHEN entry_fee <= 7.50 THEN 4.50
    ELSE 6.00
  END,
  win_value = CASE
    WHEN entry_fee <= 2.50 THEN 5.00
    WHEN entry_fee <= 5.00 THEN 10.00
    WHEN entry_fee <= 7.50 THEN 15.00
    ELSE 20.00
  END
WHERE kill_value = 0 AND win_value = 0;

-- 2. Extend tx_type enum with reversal value (saque + premio already exist)
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'saque_estorno';
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'kill_bonus';

-- 3. Admin delete room with refund
CREATE OR REPLACE FUNCTION public.admin_delete_room(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.rooms;
  v_part RECORD;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada'; END IF;

  -- Refund only if not finished (finished rooms already paid prizes)
  IF v_room.finished_at IS NULL THEN
    FOR v_part IN SELECT user_id FROM public.room_participants WHERE room_id = p_room_id LOOP
      UPDATE public.wallets SET balance = balance + v_room.entry_fee, updated_at = now()
        WHERE user_id = v_part.user_id;
      INSERT INTO public.wallet_transactions (user_id, amount, type, description, reference_id)
        VALUES (v_part.user_id, v_room.entry_fee, 'reembolso', 'Reembolso (sala excluída): ' || v_room.name, p_room_id);
    END LOOP;
  END IF;

  DELETE FROM public.room_participants WHERE room_id = p_room_id;
  DELETE FROM public.room_links WHERE room_id = p_room_id;
  DELETE FROM public.rooms WHERE id = p_room_id;
END $$;

-- 4. Finalize room with kills distribution
-- p_kills: jsonb object { "<user_id>": <kills_int>, ... }
CREATE OR REPLACE FUNCTION public.finalize_room_with_kills(
  p_room_id uuid,
  p_winner_id uuid,
  p_kills jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.rooms;
  v_part RECORD;
  v_kills INT;
  v_payout NUMERIC;
  v_kill_total INT;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada'; END IF;
  IF v_room.finished_at IS NOT NULL THEN RAISE EXCEPTION 'Partida já finalizada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.room_participants WHERE room_id = p_room_id AND user_id = p_winner_id) THEN
    RAISE EXCEPTION 'Vencedor não está inscrito';
  END IF;

  -- Validate kill counts (max 9 per player)
  FOR v_part IN SELECT user_id FROM public.room_participants WHERE room_id = p_room_id LOOP
    v_kills := COALESCE((p_kills ->> v_part.user_id::text)::int, 0);
    IF v_kills < 0 OR v_kills > 9 THEN
      RAISE EXCEPTION 'Kills inválidas (0-9 por jogador)';
    END IF;
  END LOOP;

  -- Pay each participant
  FOR v_part IN SELECT user_id FROM public.room_participants WHERE room_id = p_room_id LOOP
    v_kills := COALESCE((p_kills ->> v_part.user_id::text)::int, 0);
    v_payout := v_kills * v_room.kill_value;
    IF v_part.user_id = p_winner_id THEN
      v_payout := v_payout + v_room.win_value;
    END IF;

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
END $$;

-- 5. Withdrawal: deduct immediately on request
CREATE OR REPLACE FUNCTION public.create_withdrawal_request(p_amount numeric, p_pix_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_bal numeric;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF length(coalesce(trim(p_pix_key),'')) < 3 THEN RAISE EXCEPTION 'Informe a chave PIX'; END IF;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Carteira não encontrada'; END IF;
  IF v_bal < p_amount THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  UPDATE public.wallets SET balance = balance - p_amount, updated_at = now() WHERE user_id = v_user;

  INSERT INTO public.withdrawal_requests (user_id, amount, pix_key, status)
    VALUES (v_user, p_amount, trim(p_pix_key), 'pendente')
    RETURNING id INTO v_id;

  INSERT INTO public.wallet_transactions (user_id, amount, type, description, reference_id)
    VALUES (v_user, -p_amount, 'saque'::public.tx_type, 'Saque solicitado (pendente)', v_id);

  RETURN v_id;
END $$;

-- 6. Approve: no balance change (already deducted); just status
CREATE OR REPLACE FUNCTION public.approve_withdrawal(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_req public.withdrawal_requests;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pendente' THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
  UPDATE public.withdrawal_requests SET status='aprovado', decided_by=auth.uid(), decided_at=now() WHERE id=p_id;
END $$;

-- 7. Reject: refund balance
CREATE OR REPLACE FUNCTION public.reject_withdrawal(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_req public.withdrawal_requests;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin_principal') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pendente' THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
  UPDATE public.withdrawal_requests SET status='recusado', decided_by=auth.uid(), decided_at=now() WHERE id=p_id;
  UPDATE public.wallets SET balance = balance + v_req.amount, updated_at = now() WHERE user_id = v_req.user_id;
  INSERT INTO public.wallet_transactions (user_id, amount, type, description, reference_id)
    VALUES (v_req.user_id, v_req.amount, 'saque_estorno'::public.tx_type, 'Saque recusado — estorno', v_req.id);
END $$;

-- 8. User cancel: refund balance
CREATE OR REPLACE FUNCTION public.cancel_withdrawal(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_req public.withdrawal_requests;
BEGIN
  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF v_req.user_id <> auth.uid() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_req.status <> 'pendente' THEN RAISE EXCEPTION 'Pedido não está pendente'; END IF;
  UPDATE public.withdrawal_requests SET status='cancelado', decided_at=now() WHERE id=p_id;
  UPDATE public.wallets SET balance = balance + v_req.amount, updated_at = now() WHERE user_id = v_req.user_id;
  INSERT INTO public.wallet_transactions (user_id, amount, type, description, reference_id)
    VALUES (v_req.user_id, v_req.amount, 'saque_estorno'::public.tx_type, 'Saque cancelado — estorno', v_req.id);
END $$;
