## Diário Brawl Pro

Plataforma mobile-first para gerenciar salas de campeonatos de Brawl Stars com saldo interno (R$), depósitos via PIX aprovados manualmente e painel administrativo separado.

### Estética
- Verde neon claro (suave, não saturado) + preto profundo como base
- Tipografia moderna, UI compacta para celular
- Tokens semânticos no `src/styles.css` (oklch), sem cores hardcoded

### Autenticação
- **Participantes**: cadastro/login por **email + senha**. Campos obrigatórios no signup: nome completo, telefone, nick Brawl Stars. Nenhum pode ser editado pelo próprio usuário.
- **Admin Principal**: login especial com **nome de usuário fixo + senha de 10 caracteres** (não usa email). Detectado no login; ao entrar, um botão fixo no topo leva direto ao Painel Admin.
- Bloqueio de duplicidade: nome completo, telefone e nick são UNIQUE.

Credenciais do Admin Principal serão geradas e mostradas após o build.

### Sistema de Saldo (R$)
- Depósito: usuário informa valor + nome do titular do PIX → pedido fica `pendente`
- Usuário pode cancelar enquanto pendente
- Admin Principal aprova (credita saldo) ou recusa
- Saques: fluxo análogo (pendente/aprovado/recusado), apenas Admin Principal aprova

### Salas
- Campos: nome, valor de inscrição, máx. participantes, status (aberta/fechada), inscritos
- Participante entra → desconta saldo automaticamente (transação atômica via RPC)
- Admin de Salas: criar/editar salas, abrir/fechar inscrições, mudar valor
- Admin Principal: tudo acima + excluir salas, ver inscritos, etc.

### Cargos (RBAC)
Tabela separada `user_roles` com enum `app_role`: `admin_principal`, `admin_salas`, `participante`. Função `has_role()` SECURITY DEFINER. RLS em todas as tabelas.

### Estrutura do Banco (Lovable Cloud)
- `profiles` (id, full_name, phone, nick, created_at) — UNIQUE em phone e nick
- `user_roles` (user_id, role)
- `wallets` (user_id, balance numeric)
- `deposit_requests` (id, user_id, amount, pix_holder_name, status, created_at, decided_at, decided_by)
- `withdrawal_requests` (id, user_id, amount, pix_key, status, ...)
- `rooms` (id, name, entry_fee, max_participants, status, created_at, created_by)
- `room_participants` (room_id, user_id, joined_at)
- `wallet_transactions` (id, user_id, amount, type, reference_id, created_at) — histórico completo
- `app_settings` (singleton: pix_key, pix_holder_name)
- RPCs: `join_room(room_id)`, `approve_deposit(id)`, `reject_deposit(id)`, `admin_adjust_balance(user_id, delta, reason)`

### Telas do Participante
- `/auth` — login/cadastro
- `/` — lista de salas abertas, saldo no topo
- `/sala/$id` — detalhes + botão entrar
- `/carteira` — saldo, depositar, sacar, histórico, pedidos pendentes (cancelar)
- `/perfil` — visualização (sem edição)

### Telas do Admin
- `/admin` — dashboard (totais)
- `/admin/usuarios` — listar/buscar, ajustar saldo, ver histórico, gerenciar cargos
- `/admin/depositos` — pendentes/aprovados/recusados, filtros
- `/admin/saques` — análogo
- `/admin/salas` — CRUD, abrir/fechar, ver inscritos
- `/admin/configuracoes` — chave PIX, titular PIX

Admin de Salas só vê `/admin` (dashboard simplificado) e `/admin/salas`.

### Tempo Real
Supabase Realtime nas tabelas `rooms`, `room_participants`, `deposit_requests`, `wallets` para atualizar contadores e saldo ao vivo.

### Detalhes Técnicos
- TanStack Start + TanStack Query + Supabase via integration
- Server functions para operações privilegiadas (aprovar depósito, ajustar saldo)
- Validação Zod em todos formulários
- Layout `_authenticated` (managed) para rotas de usuário; sub-layout `_authenticated/_admin` com gate por role
- Admin Principal seed: criado via migration usando `supabaseAdmin` em uma server function de bootstrap, OU via Auth Admin (preferido: migration que cria o user em `auth.users` + role)

### Entregáveis após o build
1. URL do site funcionando
2. **Credenciais do Admin Principal** (usuário + senha 10 chars)
3. Lista do que está pronto e próximos passos sugeridos
