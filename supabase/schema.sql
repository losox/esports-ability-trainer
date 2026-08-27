-- 电竞能力训练平台 — Supabase 数据库 Schema
-- 执行顺序：1. profiles → 2. sessions → 3. scores → 4. achievements → 5. follows → 6. training_plans → 7. plan_items

-- ============================================================
-- 1. profiles — 用户资料表
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  preference text not null default 'all' check (preference in ('fps', 'moba', 'all')),
  sensitivity real not null default 1.0,
  allow_comparison boolean not null default true,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. sessions — 训练会话表（一次完整训练）
-- ============================================================
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dimension_id smallint not null check (dimension_id between 1 and 8),
  version text check (version in ('fps', 'moba', 'universal')),
  total_score integer not null default 0,
  group_count integer not null default 1,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. scores — 单组训练成绩（一次会话包含多组）
-- ============================================================
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  dimension_id smallint not null check (dimension_id between 1 and 8),
  group_index integer not null,
  score integer not null default 0,
  sub_metrics jsonb not null default '{}',
  is_personal_best boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 4. achievements — 用户成就/徽章
-- ============================================================
create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null,
  dimension_id smallint check (dimension_id between 1 and 8),
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_key)
);

-- ============================================================
-- 5. follows — 单向关注关系
-- ============================================================
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, target_id),
  check (follower_id != target_id)
);

-- ============================================================
-- 6. training_plans — 训练计划
-- ============================================================
create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Daily Plan',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 7. plan_items — 训练计划项
-- ============================================================
create table if not exists public.plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  dimension_id smallint not null check (dimension_id between 1 and 8),
  version text check (version in ('fps', 'moba', 'universal')),
  target_sets integer not null default 3,
  completed_sets integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (plan_id, dimension_id, version)
);

-- ============================================================
-- 索引
-- ============================================================
create index if not exists idx_sessions_user on public.sessions(user_id, created_at desc);
create index if not exists idx_sessions_dimension on public.sessions(dimension_id);
create index if not exists idx_scores_session on public.scores(session_id);
create index if not exists idx_scores_user_dim on public.scores(user_id, dimension_id, created_at desc);
create index if not exists idx_follows_follower on public.follows(follower_id);
create index if not exists idx_follows_target on public.follows(target_id);
create index if not exists idx_achievements_user on public.achievements(user_id);
create index if not exists idx_plan_items_plan on public.plan_items(plan_id);

-- ============================================================
-- RLS 策略
-- ============================================================

-- profiles：用户只能 CRUD 自己的资料，但可以查看他人资料（用于比较）
alter table public.profiles enable row level security;
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid() = id);

-- sessions：用户可查看自己的；他人仅在对方 allow_comparison=true 时可查（用于比较）
alter table public.sessions enable row level security;
drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own" on public.sessions for select using (auth.uid() = user_id);
drop policy if exists "sessions_select_public" on public.sessions;
create policy "sessions_select_public" on public.sessions for select using (
  exists (select 1 from public.profiles p where p.id = sessions.user_id and p.allow_comparison = true)
);
drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own" on public.sessions for insert with check (auth.uid() = user_id);
drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own" on public.sessions for update using (auth.uid() = user_id);
drop policy if exists "sessions_delete_own" on public.sessions;
create policy "sessions_delete_own" on public.sessions for delete using (auth.uid() = user_id);

-- scores：同 sessions — 自己可见，他人需对方 allow_comparison=true
alter table public.scores enable row level security;
drop policy if exists "scores_select_own" on public.scores;
create policy "scores_select_own" on public.scores for select using (auth.uid() = user_id);
drop policy if exists "scores_select_public" on public.scores;
create policy "scores_select_public" on public.scores for select using (
  exists (select 1 from public.profiles p where p.id = scores.user_id and p.allow_comparison = true)
);
drop policy if exists "scores_insert_own" on public.scores;
create policy "scores_insert_own" on public.scores for insert with check (auth.uid() = user_id);
drop policy if exists "scores_update_own" on public.scores;
create policy "scores_update_own" on public.scores for update using (auth.uid() = user_id);
drop policy if exists "scores_delete_own" on public.scores;
create policy "scores_delete_own" on public.scores for delete using (auth.uid() = user_id);

-- achievements：用户只能 CRUD 自己的成就
alter table public.achievements enable row level security;
drop policy if exists "achievements_select_own" on public.achievements;
create policy "achievements_select_own" on public.achievements for select using (auth.uid() = user_id);
drop policy if exists "achievements_insert_own" on public.achievements;
create policy "achievements_insert_own" on public.achievements for insert with check (auth.uid() = user_id);
drop policy if exists "achievements_delete_own" on public.achievements;
create policy "achievements_delete_own" on public.achievements for delete using (auth.uid() = user_id);

-- follows：用户只能管理自己的关注列表，但可查他人关注关系
alter table public.follows enable row level security;
drop policy if exists "follows_select_all" on public.follows;
create policy "follows_select_all" on public.follows for select using (true);
drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own" on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own" on public.follows for delete using (auth.uid() = follower_id);

-- training_plans：用户只能 CRUD 自己的训练计划
alter table public.training_plans enable row level security;
drop policy if exists "plans_select_own" on public.training_plans;
create policy "plans_select_own" on public.training_plans for select using (auth.uid() = user_id);
drop policy if exists "plans_insert_own" on public.training_plans;
create policy "plans_insert_own" on public.training_plans for insert with check (auth.uid() = user_id);
drop policy if exists "plans_update_own" on public.training_plans;
create policy "plans_update_own" on public.training_plans for update using (auth.uid() = user_id);
drop policy if exists "plans_delete_own" on public.training_plans;
create policy "plans_delete_own" on public.training_plans for delete using (auth.uid() = user_id);

-- plan_items：通过 plan 关联，只能 CRUD 自己计划下的项
alter table public.plan_items enable row level security;
drop policy if exists "plan_items_select_own" on public.plan_items;
create policy "plan_items_select_own" on public.plan_items for select using (
  exists (select 1 from public.training_plans p where p.id = plan_id and p.user_id = auth.uid())
);
drop policy if exists "plan_items_insert_own" on public.plan_items;
create policy "plan_items_insert_own" on public.plan_items for insert with check (
  exists (select 1 from public.training_plans p where p.id = plan_id and p.user_id = auth.uid())
);
drop policy if exists "plan_items_update_own" on public.plan_items;
create policy "plan_items_update_own" on public.plan_items for update using (
  exists (select 1 from public.training_plans p where p.id = plan_id and p.user_id = auth.uid())
);
drop policy if exists "plan_items_delete_own" on public.plan_items;
create policy "plan_items_delete_own" on public.plan_items for delete using (
  exists (select 1 from public.training_plans p where p.id = plan_id and p.user_id = auth.uid())
);

-- ============================================================
-- 触发器：新用户注册时自动创建 profile
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'player_' || substr(new.id::text, 1, 8)))
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 触发器：scores 插入时自动标记个人最佳
-- ============================================================
create or replace function public.mark_personal_best()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  current_best integer;
begin
  select coalesce(max(score), 0) into current_best
  from public.scores
  where user_id = new.user_id and dimension_id = new.dimension_id and id != new.id;

  if new.score > current_best then
    new.is_personal_best := true;
    -- 清除之前的个人最佳标记
    update public.scores set is_personal_best = false
    where user_id = new.user_id and dimension_id = new.dimension_id and id != new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_score_insert on public.scores;
create trigger on_score_insert
  before insert on public.scores
  for each row execute function public.mark_personal_best();

-- ============================================================
-- updated_at 自动更新
-- ============================================================
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists on_profiles_update on public.profiles;
create trigger on_profiles_update
  before update on public.profiles
  for each row execute function public.update_updated_at();

drop trigger if exists on_plans_update on public.training_plans;
create trigger on_plans_update
  before update on public.training_plans
  for each row execute function public.update_updated_at();

-- ============================================================
-- 8. device_registrations — 设备注册计数（防刷：同一设备最多10个账号）
-- ============================================================
create table if not exists public.device_registrations (
  device_fp text primary key,
  register_count integer not null default 0,
  last_registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint device_registrations_count_check check (register_count >= 0 and register_count <= 10)
);

-- ============================================================
-- 9. password_reset_codes — 密码重置验证码
-- ============================================================
create table if not exists public.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  is_used boolean not null default false
);

create index if not exists idx_reset_codes_email on public.password_reset_codes(email, is_used);
create index if not exists idx_reset_codes_expires on public.password_reset_codes(expires_at);

-- ============================================================
-- 10. password_reset_attempts — 密码重置频率（每账号24h限5次）
-- ============================================================
create table if not exists public.password_reset_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_reset_attempts_email_time on public.password_reset_attempts(email, created_at desc);

-- ============================================================
-- RLS：新增表的行级安全
-- ============================================================

-- device_registrations：仅允许 service_role 写入（前端通过 RPC 调用）
alter table public.device_registrations enable row level security;
drop policy if exists "device_registrations_select_service" on public.device_registrations;
create policy "device_registrations_select_service" on public.device_registrations for select using (false);

-- password_reset_codes：仅允许 service_role 读写
alter table public.password_reset_codes enable row level security;
drop policy if exists "reset_codes_select_service" on public.password_reset_codes;
create policy "reset_codes_select_service" on public.password_reset_codes for select using (false);
drop policy if exists "reset_codes_insert_service" on public.password_reset_codes;
create policy "reset_codes_insert_service" on public.password_reset_codes for insert with check (false);
drop policy if exists "reset_codes_update_service" on public.password_reset_codes;
create policy "reset_codes_update_service" on public.password_reset_codes for update using (false);

-- password_reset_attempts：仅允许 service_role 写入
alter table public.password_reset_attempts enable row level security;
drop policy if exists "reset_attempts_select_service" on public.password_reset_attempts;
create policy "reset_attempts_select_service" on public.password_reset_attempts for select using (false);
drop policy if exists "reset_attempts_insert_service" on public.password_reset_attempts;
create policy "reset_attempts_insert_service" on public.password_reset_attempts for insert with check (false);

-- ============================================================
-- RPC：检查设备注册数（含原子递增）
-- ============================================================
create or replace function public.check_device_register(p_device_fp text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
  v_allowed boolean := false;
begin
  select register_count into v_count
  from public.device_registrations
  where device_fp = p_device_fp;

  if v_count is null then
    v_count := 0;
  end if;

  v_allowed := v_count < 10;

  if v_allowed then
    insert into public.device_registrations (device_fp, register_count)
    values (p_device_fp, 1)
    on conflict (device_fp) do update
    set register_count = device_registrations.register_count + 1,
        last_registered_at = now();
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'current_count', v_count,
    'remaining', greatest(0, 10 - v_count)
  );
end;
$$;

-- ============================================================
-- RPC：申请密码重置验证码（含频率限制检查）
-- ============================================================
create or replace function public.request_password_reset(p_email text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_code text;
  v_expires timestamptz;
  v_recent_count integer;
  v_allowed boolean := false;
  v_rate_limit_reset_at timestamptz;
begin
  -- 1. 频率检查：该邮箱过去24h内重置次数
  select count(*) into v_recent_count
  from public.password_reset_attempts
  where email = p_email
    and created_at > now() - interval '24 hours';

  v_allowed := v_recent_count < 5;

  if not v_allowed then
    select min(created_at) + interval '24 hours' into v_rate_limit_reset_at
    from public.password_reset_attempts
    where email = p_email
      and created_at > now() - interval '24 hours';

    return jsonb_build_object(
      'success', false,
      'reason', 'rate_limit',
      'attempts', v_recent_count,
      'max_attempts', 5,
      'reset_at', to_char(v_rate_limit_reset_at, 'YYYY-MM-DD HH24:MI:SS')
    );
  end if;

  -- 2. 检查邮箱是否存在于 auth.users
  if not exists (select 1 from auth.users where lower(email) = lower(p_email)) then
    return jsonb_build_object(
      'success', false,
      'reason', 'email_not_found'
    );
  end if;

  -- 3. 生成6位随机验证码
  v_code := lpad(floor(random() * 1000000)::text, 6, '0');
  v_expires := now() + interval '10 minutes';

  -- 4. 标记该邮箱之前未使用的验证码为已使用
  update public.password_reset_codes
  set is_used = true, used_at = now()
  where email = p_email and is_used = false;

  -- 5. 存储新验证码
  insert into public.password_reset_codes (email, code, expires_at)
  values (p_email, v_code, v_expires);

  -- 6. 记录本次重置尝试（用于24h频率统计）
  insert into public.password_reset_attempts (email)
  values (p_email);

  return jsonb_build_object(
    'success', true,
    'code', v_code,
    'expires_at', to_char(v_expires, 'YYYY-MM-DD HH24:MI:SS'),
    'attempts_used', v_recent_count + 1,
    'attempts_remaining', 5 - v_recent_count - 1
  );
end;
$$;

-- ============================================================
-- RPC：验证密码重置验证码并更新密码
-- ============================================================
create or replace function public.verify_and_reset_password(
  p_email text,
  p_code text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_record public.password_reset_codes%rowtype;
  v_user_id uuid;
begin
  -- 1. 查找验证码记录（最新的未使用且未过期）
  select * into v_record
  from public.password_reset_codes
  where email = p_email
    and is_used = false
    and expires_at > now()
  order by created_at desc
  limit 1;

  if v_record.id is null then
    return jsonb_build_object(
      'success', false,
      'reason', 'invalid_code'
    );
  end if;

  if v_record.code != p_code then
    return jsonb_build_object(
      'success', false,
      'reason', 'code_mismatch'
    );
  end if;

  -- 2. 标记验证码为已使用
  update public.password_reset_codes
  set is_used = true, used_at = now()
  where id = v_record.id;

  -- 3. 更新 auth.users 密码
  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf'))
  where lower(email) = lower(p_email)
  returning id into v_user_id;

  if v_user_id is null then
    return jsonb_build_object(
      'success', false,
      'reason', 'user_not_found'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'user_id', v_user_id
  );
end;
$$;

-- 安装 pgcrypto 扩展（crypt 函数需要）
create extension if not exists pgcrypto;
