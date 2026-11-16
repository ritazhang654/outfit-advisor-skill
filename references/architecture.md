# 架构与代码地图

## 目录结构（业务部分）

```
src/
├── app/
│   ├── page.tsx                    # 今日穿搭首页（含我的 OOTD、穿搭灵感两个区块）
│   ├── calendar/page.tsx           # 穿搭日历 + 设置弹窗
│   ├── wardrobe/page.tsx           # 我的衣橱
│   ├── beauty/page.tsx             # 美妆柜
│   ├── food/page.tsx               # 食品库（含拍照识别）
│   ├── subscriptions/page.tsx      # 订阅管家
│   ├── settings/page.tsx           # 设置独立页（薄壳，导航已并入日历）
│   └── api/
│       ├── clothing/               # 衣橱 CRUD + upload
│       ├── cosmetic/               # 美妆 CRUD + analyze（拍照识别）
│       ├── food/                   # 食品 CRUD + analyze（拍照识别）
│       ├── ootd/                   # 我的 OOTD CRUD（上传即 AI 分析）
│       ├── outfit/
│       │   ├── recommend/          # 生成当日推荐
│       │   ├── adjust/             # 手工调整搭配并重写文案
│       │   ├── wear/               # 打卡
│       │   └── records/ calendar/ history/
│       ├── inspiration/            # 灵感图 CRUD
│       ├── subscription/           # 订阅 CRUD + renew 一键续费
│       ├── settings/               # 城市 / 周几规则读写
│       └── weather/                # 天气代理
├── components/
│   ├── bottom-nav.tsx              # 底部 6 Tab 导航
│   ├── settings-panel.tsx          # 设置面板（日历弹窗与独立页共用）
│   ├── inspiration-section.tsx
│   ├── ootd-section.tsx            # 我的 OOTD 照片墙 + 上传 + 详情
│   └── ui/                         # shadcn/ui 组件
├── lib/
│   ├── llm.ts                      # 全部 LLM 提示词、结构化输出与宽松规整
│   ├── weather.ts                  # Open-Meteo 天气
│   ├── storage.ts                  # S3 单例 + 签名 URL
│   ├── types.ts                    # 全部 TS 类型、枚举与中文标签
│   ├── occasion.ts                 # 场合 / 周几规则
│   └── utils.ts
└── storage/database/
    ├── supabase-client.ts          # 平台凭据自动注入
    └── shared/schema.ts            # drizzle 表声明（类型/文档用）
```

## 关键文件职责

| 文件 | 职责 | 改它会影响 |
| --- | --- | --- |
| `src/lib/types.ts` | 所有枚举、中文标签、类型定义 | 前端展示、接口白名单、提示词 |
| `src/lib/llm.ts` | 全部提示词 + 模型输出规整 + 重试 | 识别准确率、推荐质量 |
| `src/lib/storage.ts` | S3 客户端与签名 URL | 图片显示、上传 |
| `src/lib/weather.ts` | Open-Meteo 封装 | 天气信息 |
| `src/app/api/outfit/recommend/route.ts` | 组装推荐输入（天气/衣橱/OOTD/灵感） | 推荐结果 |
| `src/components/bottom-nav.tsx` | 底部导航 | 全站入口 |
| `src/storage/database/shared/schema.ts` | 表声明 | 仅类型提示，**不改真实库** |

## 数据表（9 张）

### clothing_items —— 衣橱单品
`id` / `image_key`(S3 key) / `category`(top,bottom,outerwear,dress,shoes,accessory) / `name` / `color` / `style` / `season` / `thickness` / `notes` / `created_at`

### outfit_records —— 每日推荐与打卡
`id` / `wear_date` / `occasion`(formal,nice,casual) / `item_ids`(jsonb) / `reason` / `tips` / `weather`(jsonb) / `worn`(bool) / `ai_item_ids`(jsonb，AI 原始建议) / `user_adjusted`(bool) / `adjust_note` / `created_at`

`ai_item_ids` / `user_adjusted` / `adjust_note` 三个字段用于**留痕**：区分「AI 原本建议什么」和「用户实际改成了什么」，便于后续分析用户偏好。

### user_settings —— 单用户设置
`id` / `city` / `weekday_rules`(jsonb，按周几的着装惯例) / `updated_at`

### cosmetics —— 美妆柜
`id` / `image_key` / `name` / `brand` / `category` / `count` / `is_sample`(小样) / `status`(in_use,unopened,used_up) / `opened_at` / `expire_at` / `shelf_life_months` / `rating` / `notes` / `created_at`

### inspirations —— 穿搭灵感
`id` / `image_key` / `style` / `palette`(jsonb) / `key_pieces`(jsonb) / `notes` / `created_at`

### subscriptions —— 会员订阅
`id` / `name` / `category` / `cycle`(monthly,quarterly,yearly,lifetime) / `price`(**整数分**) / `start_date` / `expire_at` / `auto_renew` / `status`(active,canceled) / `notes` / `created_at`

### ootd_records —— 我的 OOTD
`id` / `image_key` / `wear_date` / `occasion` / `summary`(一句话概括) / `style` / `palette`(jsonb) / `pieces`(jsonb) / `rating`(1-5) / `notes` / `created_at`

评分越高，越靠前进入穿搭推荐的风格参考。

### foods —— 食品库
`id` / `name` / `brand` / `category`(dairy,snack,staple,drink,produce,frozen,seasoning,other) / `quantity` / `unit` / `min_quantity`(低库存阈值) / `expire_at` / `rating` / `notes` / `created_at` / `updated_at`

### health_check —— 平台探针
`id` / `updated_at`。不启用 RLS。

## API 清单

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/api/clothing` | 列表（带签名 URL）/ 新增 |
| PATCH/DELETE | `/api/clothing/[id]` | 改 / 删（删时清存储） |
| POST | `/api/clothing/upload` | 图片上传 |
| GET/POST | `/api/cosmetic` | 美妆列表 / 新增 |
| PATCH/DELETE | `/api/cosmetic/[id]` | 改 / 删 |
| POST | `/api/cosmetic/analyze` | 包装图识别 |
| GET/POST | `/api/ootd` | OOTD 列表（带 URL）/ 上传并 AI 分析 |
| PATCH/DELETE | `/api/ootd/[id]` | 改评分备注 / 删 |
| GET/POST | `/api/food` | 食品列表（按有效期升序）/ 新增 |
| PATCH/DELETE | `/api/food/[id]` | 改 / 删 |
| POST | `/api/food/analyze` | 包装图识别（临时图用完即删） |
| GET/POST | `/api/inspiration` | 灵感列表 / 新增 |
| DELETE | `/api/inspiration/[id]` | 删 |
| POST | `/api/outfit/recommend` | 生成当日搭配 |
| POST | `/api/outfit/adjust` | 手工调整并重写文案 |
| POST | `/api/outfit/wear` | 打卡 |
| GET | `/api/outfit/records` `/calendar` `/history` | 查询 |
| GET/POST | `/api/subscription` | 订阅列表 / 新增 |
| PATCH/DELETE | `/api/subscription/[id]` | 改 / 删 / 续费 |
| GET/PUT | `/api/settings` | 城市与周几规则 |
| GET | `/api/weather` | 天气代理 |

## 请求与错误约定

- 所有写接口先做参数校验，非法入参返回 400 + `{ error: "中文提示" }`
- AI 识别类接口失败返回 502，前端降级为可手填
- 列表接口默认带 `limit`，避免全表返回
