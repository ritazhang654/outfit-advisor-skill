-- =====================================================================
-- 每日穿搭（outfit-advisor）数据库初始化脚本
-- Postgres 15+（扣子编程内置 Supabase 数据库）
-- 用法：在扣子编程项目的数据库控制台（SQL 执行入口）整段执行即可。
-- 特性：全部使用 IF NOT EXISTS，可重复执行，不会清空或覆盖已有数据。
-- 说明：本应用为「个人单用户」模式，RLS 开启后放通 public 全部权限；
--       如需多用户隔离，请改造策略为基于 auth.uid() 的校验。
-- =====================================================================

-- 需要 pgcrypto / pg_util 提供 gen_random_uuid()
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. health_check：平台健康检查探针表
-- ---------------------------------------------------------------------
create table if not exists health_check (
  id          serial primary key,
  updated_at  timestamptz default now()
);
-- 健康检查表不启用 RLS（平台探针直接读写）

-- ---------------------------------------------------------------------
-- 2. clothing_items：衣橱单品
-- ---------------------------------------------------------------------
create table if not exists clothing_items (
  id          varchar(36) primary key default gen_random_uuid(),
  image_key   text not null,                          -- S3 对象 key
  category    varchar(20) not null,                   -- top/bottom/outerwear/dress/shoes/accessory
  name        varchar(100) not null,
  color       varchar(30),
  style       varchar(30),                            -- casual/business/formal/sport/fashion/street
  formality   integer,                                -- 1 休闲 - 5 正式
  season      jsonb,                                  -- ["spring","summer","autumn","winter"]
  thickness   varchar(10),                            -- thin/medium/thick
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create index if not exists clothing_items_category_idx   on clothing_items (category);
create index if not exists clothing_items_created_at_idx on clothing_items (created_at);

-- ---------------------------------------------------------------------
-- 3. outfit_records：每日穿搭推荐 / 打卡记录
-- ---------------------------------------------------------------------
create table if not exists outfit_records (
  id            varchar(36) primary key default gen_random_uuid(),
  wear_date     date not null,                       -- YYYY-MM-DD（东八区）
  item_ids      jsonb not null,                      -- 最终搭配的单品 id 数组（1-8 件）
  ai_item_ids   jsonb,                               -- AI 最初推荐的单品 id（手工调整前）
  occasion      varchar(20) not null,                -- formal/nice/casual
  reason        text,                                -- AI 搭配理由
  tips          text,                                -- AI 小贴士
  weather       jsonb,                               -- 当日天气快照
  status        varchar(20) not null default 'recommended', -- recommended/worn
  user_adjusted boolean not null default false,      -- 是否被手工调整过
  adjust_note   text,                                -- 调整备注
  created_at    timestamptz not null default now()
);
create index if not exists outfit_records_wear_date_idx on outfit_records (wear_date);
create index if not exists outfit_records_status_idx    on outfit_records (status);

-- ---------------------------------------------------------------------
-- 4. user_settings：用户设置（单用户，固定一行）
-- ---------------------------------------------------------------------
create table if not exists user_settings (
  id             varchar(36) primary key default gen_random_uuid(),
  city           varchar(50),                        -- 所在城市，用于天气查询
  weekday_rules  jsonb,                               -- {"1":"formal",...} 按周几的着装惯例
  updated_at     timestamptz
);

-- ---------------------------------------------------------------------
-- 5. cosmetics：美妆柜（化妆品/护肤品）
-- ---------------------------------------------------------------------
create table if not exists cosmetics (
  id           varchar(36) primary key default gen_random_uuid(),
  image_key    text,
  name         varchar(100) not null,
  brand        varchar(50),
  category     varchar(20) not null,                 -- skincare/makeup/perfume/other
  subcategory  varchar(20),                          -- 细分类别 key（见前端枚举）
  spec_type    varchar(10) not null default 'full',  -- full 正装/mid 中样/sample 小样
  size         varchar(30),                          -- 容量，如 50ml
  shade        varchar(50),                          -- 色号
  opened_at    date,                                 -- 开封日期
  shelf_months integer default 12,                   -- 开封后保质月数
  expiry_date  date,                                 -- 包装印刷的到期日
  quantity     integer not null default 1,           -- 数量
  status       varchar(10) not null default 'in_use',-- stock/in_use/done
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);
create index if not exists cosmetics_category_idx   on cosmetics (category);
create index if not exists cosmetics_created_at_idx on cosmetics (created_at);

-- ---------------------------------------------------------------------
-- 6. inspirations：穿搭灵感图集（AI 风格分析）
-- ---------------------------------------------------------------------
create table if not exists inspirations (
  id          varchar(36) primary key default gen_random_uuid(),
  image_key   text not null,
  summary     varchar(200),                          -- 一句话风格总结
  style       varchar(30),
  palette     jsonb,                                 -- 配色
  pieces      jsonb,                                 -- 关键单品
  vibe        text,                                  -- 风格氛围详述
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists inspirations_created_at_idx on inspirations (created_at);

-- ---------------------------------------------------------------------
-- 7. subscriptions：订阅 / 会员记录
-- ---------------------------------------------------------------------
create table if not exists subscriptions (
  id          varchar(36) primary key default gen_random_uuid(),
  name        varchar(100) not null,                 -- 如 WPS 会员
  vendor      varchar(50),                           -- 商家/平台
  category    varchar(20) not null default 'other',  -- office/video/music/cloud/ai/supermarket/insurance/other
  cycle       varchar(10) not null default 'monthly',-- monthly/quarterly/yearly/one_time
  price       integer not null default 0,            -- 每期费用，单位：分
  expire_at   date,                                  -- 到期日
  auto_renew  boolean not null default false,        -- 是否自动续费
  notes       text,
  status      varchar(10) not null default 'active', -- active/cancelled
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create index if not exists subscriptions_expire_idx   on subscriptions (expire_at);
create index if not exists subscriptions_category_idx on subscriptions (category);

-- =====================================================================
-- 行级安全（RLS）：6 张业务表开启并放通 public（个人单用户模式）
-- =====================================================================
alter table clothing_items  enable row level security;
alter table outfit_records  enable row level security;
alter table user_settings   enable row level security;
alter table cosmetics       enable row level security;
alter table inspirations    enable row level security;
alter table subscriptions   enable row level security;

-- clothing_items
drop policy if exists clothing_items_select_all on clothing_items;
drop policy if exists clothing_items_insert_all on clothing_items;
drop policy if exists clothing_items_update_all on clothing_items;
drop policy if exists clothing_items_delete_all on clothing_items;
create policy clothing_items_select_all on clothing_items for select using (true);
create policy clothing_items_insert_all on clothing_items for insert with check (true);
create policy clothing_items_update_all on clothing_items for update using (true) with check (true);
create policy clothing_items_delete_all on clothing_items for delete using (true);

-- outfit_records
drop policy if exists outfit_records_select_all on outfit_records;
drop policy if exists outfit_records_insert_all on outfit_records;
drop policy if exists outfit_records_update_all on outfit_records;
drop policy if exists outfit_records_delete_all on outfit_records;
create policy outfit_records_select_all on outfit_records for select using (true);
create policy outfit_records_insert_all on outfit_records for insert with check (true);
create policy outfit_records_update_all on outfit_records for update using (true) with check (true);
create policy outfit_records_delete_all on outfit_records for delete using (true);

-- user_settings
drop policy if exists user_settings_select_all on user_settings;
drop policy if exists user_settings_insert_all on user_settings;
drop policy if exists user_settings_update_all on user_settings;
drop policy if exists user_settings_delete_all on user_settings;
create policy user_settings_select_all on user_settings for select using (true);
create policy user_settings_insert_all on user_settings for insert with check (true);
create policy user_settings_update_all on user_settings for update using (true) with check (true);
create policy user_settings_delete_all on user_settings for delete using (true);

-- cosmetics
drop policy if exists cosmetics_select_all on cosmetics;
drop policy if exists cosmetics_insert_all on cosmetics;
drop policy if exists cosmetics_update_all on cosmetics;
drop policy if exists cosmetics_delete_all on cosmetics;
create policy cosmetics_select_all on cosmetics for select using (true);
create policy cosmetics_insert_all on cosmetics for insert with check (true);
create policy cosmetics_update_all on cosmetics for update using (true) with check (true);
create policy cosmetics_delete_all on cosmetics for delete using (true);

-- inspirations
drop policy if exists inspirations_select_all on inspirations;
drop policy if exists inspirations_insert_all on inspirations;
drop policy if exists inspirations_update_all on inspirations;
drop policy if exists inspirations_delete_all on inspirations;
create policy inspirations_select_all on inspirations for select using (true);
create policy inspirations_insert_all on inspirations for insert with check (true);
create policy inspirations_update_all on inspirations for update using (true) with check (true);
create policy inspirations_delete_all on inspirations for delete using (true);

-- subscriptions
drop policy if exists subscriptions_select_all on subscriptions;
drop policy if exists subscriptions_insert_all on subscriptions;
drop policy if exists subscriptions_update_all on subscriptions;
drop policy if exists subscriptions_delete_all on subscriptions;
create policy subscriptions_select_all on subscriptions for select using (true);
create policy subscriptions_insert_all on subscriptions for insert with check (true);
create policy subscriptions_update_all on subscriptions for update using (true) with check (true);
create policy subscriptions_delete_all on subscriptions for delete using (true);

-- =====================================================================
-- 9. ootd_records：我的 OOTD（用户自己拍过的日常穿搭，作为推荐风格参考）
-- ---------------------------------------------------------------------
create table if not exists ootd_records (
  id          varchar(36) primary key default gen_random_uuid(),
  image_key   text not null,                          -- S3 对象 key
  wear_date   date not null,
  occasion    varchar(20),                            -- formal/nice/casual，可为空
  summary     varchar(200),                           -- 一句话概括
  style       varchar(30),
  palette     jsonb,                                  -- 配色
  pieces      jsonb,                                  -- 关键单品
  rating      integer,                                -- 1-5，评分越高越优先进入推荐参考
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists ootd_records_wear_date_idx  on ootd_records (wear_date);
create index if not exists ootd_records_created_at_idx on ootd_records (created_at);

-- ---------------------------------------------------------------------
-- 10. foods：食品库
-- ---------------------------------------------------------------------
create table if not exists foods (
  id            varchar(36) primary key default gen_random_uuid(),
  name          varchar(100) not null,
  brand         varchar(50),
  category      varchar(20) not null default 'other', -- dairy/snack/staple/drink/produce/frozen/seasoning/other
  quantity      integer not null default 1,
  unit          varchar(10) default '件',
  min_quantity  integer not null default 1,           -- 低库存阈值
  expire_at     date,
  rating        integer,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index if not exists foods_category_idx on foods (category);
create index if not exists foods_expire_idx   on foods (expire_at);

-- ---------------------------------------------------------------------
-- 新增两表的 RLS（个人单用户模式，放通 public）
-- ---------------------------------------------------------------------
alter table ootd_records enable row level security;
alter table foods        enable row level security;

drop policy if exists ootd_records_select_all on ootd_records;
drop policy if exists ootd_records_insert_all on ootd_records;
drop policy if exists ootd_records_update_all on ootd_records;
drop policy if exists ootd_records_delete_all on ootd_records;
create policy ootd_records_select_all on ootd_records for select using (true);
create policy ootd_records_insert_all on ootd_records for insert with check (true);
create policy ootd_records_update_all on ootd_records for update using (true) with check (true);
create policy ootd_records_delete_all on ootd_records for delete using (true);

drop policy if exists foods_select_all on foods;
drop policy if exists foods_insert_all on foods;
drop policy if exists foods_update_all on foods;
drop policy if exists foods_delete_all on foods;
create policy foods_select_all on foods for select using (true);
create policy foods_insert_all on foods for insert with check (true);
create policy foods_update_all on foods for update using (true) with check (true);
create policy foods_delete_all on foods for delete using (true);

-- =====================================================================
-- 完成。验证：
--   select tablename from pg_tables where schemaname='public' order by 1;
-- 应返回 9 张表：clothing_items, cosmetics, foods, health_check,
--                inspirations, ootd_records, outfit_records,
--                subscriptions, user_settings
-- =====================================================================
