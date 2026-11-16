# 二次开发指南

## 改枚举与标签（最常见）

`src/lib/types.ts` 是**唯一数据源**：前端展示、接口白名单、提示词都引用它。改一处即可全链路生效。

| 想改 | 常量 |
| --- | --- |
| 衣橱品类 | `CLOTHING_CATEGORIES` + `CATEGORY_LABELS` |
| 风格 / 季节 / 厚度 | `STYLES` / `SEASONS` / `THICKNESS` |
| 场合 | `OCCASIONS` + `OCCASION_LABELS` |
| 美妆品类 | `COSMETIC_CATEGORIES` |
| 食品品类 | `FoodCategory` + `FOOD_CATEGORY_LABELS` + `FOOD_CATEGORY_ORDER` |
| 食品单位 | `FOOD_UNITS` |
| 订阅类别 | `SUB_CATEGORY_LABELS` + `SUB_CATEGORY_ORDER` |
| 计费周期 | `SUB_CYCLE_*` |

改完**同步改提示词**：`src/lib/llm.ts` 里识别类提示词中的枚举白名单和别名映射表，否则模型仍会返回旧类别。

## 加一个新模块

以「药品库」为例，四步：

1. **建表**：在 `assets/init-db.sql` 追加 `create table` + 索引 + `enable row level security` + 4 条放通策略（照抄 `foods` 那段）
2. **类型**：`src/lib/types.ts` 加接口与标签常量
3. **接口**：复制 `src/app/api/food/route.ts` 与 `[id]/route.ts`，改表名与字段白名单；如需拍照识别，再复制 `analyze/route.ts` 并在 `llm.ts` 加分析函数
4. **页面**：复制 `src/app/food/page.tsx` 改字段，`src/components/bottom-nav.tsx` 加 Tab

## 改 AI 识别 / 推荐

- 提示词全在 `src/lib/llm.ts`，一个函数对应一个场景
- 输出字段用 `asText` / `asTextList` 宽松规整，**不要加严格 zod 校验**
- 枚举字段走白名单 + 别名表（参考 `normalizeFoodCategory`），匹配不上落默认值
- 只有必填字段为空才重试，最多 2 次
- 失败原文务必 `console.error`，否则线上排查不到

推荐逻辑在 `src/app/api/outfit/recommend/route.ts`：组装输入（天气、场合、衣橱、历史 OOTD、灵感）→ 调 `generateOutfit` → 落库。想让 OOTD 权重更高，改这里的 `.limit(6)` 和排序条件。

## 接登录、做多用户

当前是单用户模式，所有表 RLS 策略是 `using (true)`。改多用户要动四处：

1. 接入认证（扣子编程的用户认证集成，或用 Supabase Auth）
2. 所有业务表加 `user_id uuid not null default auth.uid()`
3. RLS 策略改为 `using (auth.uid() = user_id)`，insert 加 `with check`
4. 所有查询显式 `.eq('user_id', ...)`，写接口补 `user_id`

`user_settings` 需要从「单行配置」改为「每用户一行」，查询用 `.maybeSingle()` 改为按 user_id 取。

## 提醒规则怎么调

| 场景 | 位置 | 当前阈值 |
| --- | --- | --- |
| 食品临期 | `src/app/food/page.tsx` 的 `expiryInfo` | 已过期 / ≤7 天紧急 / ≤30 天提醒 |
| 食品低库存 | 同上 | `quantity <= min_quantity` |
| 订阅到期 | `src/app/subscriptions/page.tsx` | 30 天 / 7 天分级 |
| 美妆效期 | `src/app/beauty/page.tsx` | 按开封日期 + 保质月数推算 |

## 样式

- Tailwind 4 + shadcn/ui，主色调在 `src/app/globals.css` 的 CSS 变量
- 移动优先，所有页面按手机竖屏设计，底部固定 6 Tab 导航
- 新增页面记得在 `bottom-nav.tsx` 注册，否则用户进不去

## 部署注意

- 静态检查脚本 `scripts/validate.sh`（tsc + eslint + stylelint），提交前跑一次
- `.env` 保持为空，凭据由平台注入；不要把自己的 Key 提交进仓库
- 图片、`tsconfig.tsbuildinfo`、`logs/`、`node_modules` 不应进版本库
