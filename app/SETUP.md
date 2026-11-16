# 每日穿搭（outfit-advisor）搭建指南

一款个人生活管理 Web 应用：**AI 每日穿搭推荐 + 衣橱管理 + 美妆柜效期管理 + 食品库 + 会员订阅记账**。
上传衣服照片自动识别建档，每天结合天气、场合和你的衣橱给出搭配；美妆拍照识别并跟踪开封效期；会员订阅到期提醒、月均费用统计。

> 本文写给拿到项目副本、想在自己的扣子账号里跑起来 / 二次开发的人。按顺序做，约 10 分钟可完成部署。

---

## 一、功能模块

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| 今日穿搭 | `/` | 当天 AI 推荐一套搭配（含理由、小贴士、天气）；可「换一套」、手工增删单品（调整后 AI 会重写搭配说明）、打卡「今天就穿它」 |
| 穿搭日历 | `/calendar` | 月历查看历史推荐与打卡；右上角齿轮打开**设置**（城市、按周几着装惯例） |
| 美妆柜 | `/beauty` | 拍照/手工录入化妆品，AI 识别品牌品类、自动数件数；效期提醒、分类数量角标、「已用完」出库区、小样/正装、数量 ×N |
| 我的衣橱 | `/wardrobe` | 上传单品图，AI 识别品类/颜色/风格/季节/厚度；单品 CRUD |
| 穿搭灵感 | 首页「灵感」区 | 上传街拍/博主图，AI 分析风格、配色、关键单品，沉淀灵感库 |
| 我的 OOTD | 首页 | 上传日常穿搭照片，AI 分析风格配色单品，作为推荐参考 |
| 食品库 | `/food` | 食品录入与拍照识别，库存与临期提醒、评分 |
| 订阅管家 | `/subscriptions` | 会员/套餐记录：包月季年/买断、每期费用（自动折算月均、年花费）、到期提醒（30/7 天分级）、一键续费、取消/恢复 |

底部导航 6 个 Tab：今日穿搭 / 穿搭日历 / 美妆柜 / 我的衣橱 / 订阅 / 食品库。

---

## 二、技术架构

- **框架**：Next.js 16（App Router）+ React 19 + TypeScript 5 + Tailwind CSS 4
- **UI**：shadcn/ui（Radix UI 原语，组件在 `src/components/ui/`）
- **数据库**：扣子编程内置集成 **Supabase（Postgres）**，用 `@supabase/supabase-js` 走 PostgREST；表结构声明在 `src/storage/database/shared/schema.ts`（drizzle 写法，仅作类型/文档，实际建库用 SQL）
- **对象存储**：扣子编程内置 **S3 兼容存储**（`coze-coding-dev-sdk` 的 `S3Storage`），数据库只存对象 key，展示时生成签名 URL
- **AI 能力**：扣子编程内置 **LLM 多模态**（`coze-coding-dev-sdk` 的 `LLMClient`），用于衣服识别、化妆品识别、灵感分析、穿搭生成与文案重写
- **天气**：[Open-Meteo](https://open-meteo.com/) 免费接口（地理编码 + 16 天预报），**无需 API Key**，逻辑在 `src/lib/weather.ts`
- **部署**：扣子编程一键部署，自动分配 `*.coze.site` 域名

关键约定：
- 金额一律以**整数分**存储（`subscriptions.price`），前端做元↔分换算。
- 日期统一 `YYYY-MM-DD`，「今天」按东八区计算。
- 当前为**个人单用户模式**：RLS 开启但放通 public 全部权限，没有登录体系。

---

## 三、目录结构（业务部分）

```
src/
├── app/
│   ├── page.tsx                    # 今日穿搭首页（含穿搭灵感区）
│   ├── calendar/page.tsx           # 穿搭日历 + 设置弹窗
│   ├── beauty/page.tsx             # 美妆柜
│   ├── wardrobe/page.tsx           # 我的衣橱
│   ├── subscriptions/page.tsx      # 订阅管家
│   ├── settings/page.tsx           # 设置独立页（薄壳，导航已并入日历）
│   └── api/
│       ├── clothing/               # 衣橱单品 CRUD + upload（图片上传）
│       ├── cosmetic/               # 美妆 CRUD + analyze（拍照识别）
│       ├── outfit/
│       │   ├── recommend/          # 生成当日推荐
│       │   ├── adjust/             # 手工调整搭配并重写文案
│       │   ├── wear/               # 打卡
│       │   ├── records/ calendar/ history/
│       ├── inspiration/            # 灵感图 CRUD
│       ├── subscription/[id]/      # 订阅 CRUD + renew 一键续费
│       ├── settings/               # 城市/周几规则读写
│       └── weather/                # 天气代理
├── components/
│   ├── bottom-nav.tsx              # 底部 5 Tab 导航
│   ├── settings-panel.tsx          # 设置面板（日历弹窗与独立页共用）
│   ├── inspiration-section.tsx
│   └── ui/                         # shadcn/ui 组件
├── lib/
│   ├── llm.ts                      # 全部 LLM 提示词与结构化输出（zod 校验）
│   ├── weather.ts                  # Open-Meteo 天气
│   ├── storage.ts                  # S3 单例 + 签名 URL
│   ├── types.ts                    # 全部 TS 类型与枚举/中文标签
│   ├── occasion.ts                 # 场合/周几规则
│   └── utils.ts
└── storage/database/
    ├── supabase-client.ts          # 平台凭据自动注入，无需手填密钥
    └── shared/schema.ts            # drizzle 表声明
docs/
└── init-db.sql                     # ★ 数据库初始化脚本（7 张表 + RLS + 索引）
```

---

## 四、数据表（9 张）

| 表 | 用途 |
| --- | --- |
| `health_check` | 平台健康检查探针（不启用 RLS） |
| `clothing_items` | 衣橱单品 |
| `outfit_records` | 每日推荐与打卡（含调整留痕：`ai_item_ids` / `user_adjusted` / `adjust_note`） |
| `user_settings` | 城市、按周几着装惯例（单用户一行） |
| `cosmetics` | 美妆柜（效期、数量、小样/正装、在用/未开封/已用完） |
| `inspirations` | 穿搭灵感图与 AI 风格分析 |
| `subscriptions` | 会员订阅（价格单位分、周期、到期日、自动续费） |
| `ootd_records` | 我的 OOTD（用户上传的日常穿搭，作为推荐风格参考） |
| `foods` | 食品库（类别、数量、低库存阈值、有效期、评分） |

完整 DDL、索引、RLS 策略见 **[`docs/init-db.sql`](./docs/init-db.sql)**，可重复执行。

---

## 五、从零搭建步骤

### 0. 前置条件
- 一个扣子账号（[coze.cn](https://www.coze.cn)），个人版即可。
- 复制本项目（通过项目分享链接「复制项目」，或由扣子编程「从已有编程项目导入」）。

### 1. 复制项目
打开分享链接 → 复制到**自己的工作空间**。复制带走的是代码和项目配置，**不会带走原作者的数据库数据**；平台内置集成（数据库、存储、LLM）会在你空间里生成新的独立资源。

### 2. 开通三项内置集成
在扣子编程项目里确认已添加（开发过程中 Agent 通常会自动引导添加；若接口报集成不可用，手动添加一次）：
1. **数据库（Supabase / Postgres）**
2. **对象存储（S3）**
3. **大语言模型（LLM，多模态）**

> 凭据由平台在运行时自动注入（`COZE_SUPABASE_URL` 等），**不需要**手动复制任何 Key 到 `.env`。

### 3. 初始化数据库
在扣子编程的数据库/SQL 控制台，整段执行 [`docs/init-db.sql`](./docs/init-db.sql)。
成功后应能看到 7 张表；脚本可重复执行，不影响已有数据。

### 4. 本地预览验证
在编程项目中点运行 / 预览，依次验证：
- 首页能打开；设置里填城市（如「杭州」）后能出天气；
- 衣橱上传一张衣服图，能识别出品类名称；
- 美妆、订阅各新增一条记录成功。

### 5. 部署上线
点右上角**部署 → 开始部署**（默认配置即可），约 1–3 分钟得到 `https://<你的前缀>.coze.site` 域名。
部署配置里可按需加自定义域名、调整可见性。部署时环境变量/集成随项目走，无需额外配置。

### 6.（可选）分享给别人使用
项目页右上角**分享图标**：
- **分享产物**：复制生产版本 URL，对方直接用你的线上应用；
- **分享完整项目**：设为公开可见、允许复制、可设永久有效期，对方复制后得到一份独立代码与独立数据库，自行部署。

---

## 六、费用说明（扣子平台侧）

- 与编程 Agent 的开发对话、部署构建：按[扣子编程任务](https://docs.coze.cn/coze_pro_task_fee.md)消耗积分。
- 用户使用时触发的**内置集成**（LLM 识图/生成、存储等）：按[内置集成费用](https://docs.coze.cn/coze_pro_internal_integrations_fee.md)计量。
- 线上服务托管：见[部署服务托管费用](https://docs.coze.cn/coze_pro_service_hosting_fee.md)。
- 天气接口 Open-Meteo 免费，无额外费用。

---

## 七、常见二次修改

| 想改什么 | 改哪里 |
| --- | --- |
| 订阅类别（默认：办公/视频/音乐/云存储/AI 工具/超市/保险/其他） | `src/lib/types.ts` 的 `SUB_CATEGORY_LABELS` 与 `SUB_CATEGORY_ORDER`（前端、接口白名单均引用这两个常量，一处生效） |
| 计费周期 | `src/lib/types.ts` 的 `SUB_CYCLE_*` 常量 |
| 衣服/美妆品类、风格、场合枚举与中文标签 | `src/lib/types.ts`，识别提示词在 `src/lib/llm.ts` |
| 穿搭推荐规则（如外套最多 1 件、正式度匹配） | `src/app/api/outfit/recommend/route.ts` 与 `src/lib/llm.ts` |
| 美妆效期默认保质月数、到期分级阈值 | 美妆页计算逻辑 `src/app/beauty/page.tsx`；订阅到期分级在 `src/app/subscriptions/page.tsx` |
| 底部导航 | `src/components/bottom-nav.tsx` |
| 接入登录、做多用户 | 需要接入扣子编程用户认证集成，并把各表 RLS 策略从 `using (true)` 改为按 `auth.uid()` 过滤、表上加 `user_id` 列 |

---

## 八、常见问题

**Q：复制项目后页面报「Supabase project configuration is unavailable」？**
A：第 2 步的数据库集成未在你的空间开通，添加数据库集成后重新运行。

**Q：上传图片失败？**
A：检查对象存储（S3）集成是否已开通；存储区域默认 `cn-beijing`（见 `src/lib/storage.ts`）。

**Q：天气一直失败？**
A：先在设置里确认城市名能被 Open-Meteo 识别（用国内常见城市名）；天气失败不会阻断穿搭推荐，只是不带天气信息。

**Q：AI 识别/推荐报错？**
A：确认 LLM（多模态）集成可用；相关接口都做了降级（识别失败可手工填写，文案失败不阻塞主流程）。

**Q：会复制到原作者的数据吗？**
A：不会。复制只带走代码，数据库是你空间里的新库，需执行一次 `docs/init-db.sql` 建表。
