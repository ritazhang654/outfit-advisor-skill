# 每日穿搭（outfit-advisor）

一套完整的个人生活管理 Web 应用：**AI 每日穿搭推荐 + 衣橱 + 美妆柜 + 食品库 + 订阅管家**，同时附带一份 Agent Skill 说明，方便别人复刻或二次开发。

## 仓库内容

```
.
├── SKILL.md                      # Agent Skill 主文件：应用全貌、技术栈、核心实现要点
├── references/
│   ├── setup.md                  # 从零搭建与部署、排错
│   ├── architecture.md           # 目录结构、9 张表字段、API 清单
│   └── customization.md          # 二次开发：加模块、改枚举、接登录做多用户
├── assets/
│   └── init-db.sql               # 建库脚本（9 张表 + 索引 + RLS，可重复执行）
└── app/                          # 应用源码（Next.js 16）
    ├── src/
    ├── scripts/
    ├── package.json
    └── ...
```

## 直接跑起来（app/ 目录）

```bash
cd app
pnpm install
pnpm dev
```

前置条件：需要先开通三项集成——数据库（Postgres）、对象存储（S3）、多模态 LLM，并执行一次 `assets/init-db.sql` 建表。凭据由平台运行时注入，`.env` 保持为空即可。

详细步骤见 `references/setup.md`。

## 功能

| 模块 | 能力 |
| --- | --- |
| 今日穿搭 | 结合天气、场合、衣橱、历史 OOTD 生成搭配，含理由与小贴士；可换一套、手工调整、打卡 |
| 我的 OOTD | 上传日常穿搭照片，AI 分析风格配色，作为后续推荐的风格参考 |
| 穿搭灵感 | 街拍 / 博主图拆解风格、配色、关键单品 |
| 穿搭日历 | 月历回看历史推荐与打卡 |
| 我的衣橱 | 单品拍照识别品类 / 颜色 / 风格 / 季节 / 厚度 |
| 美妆柜 | 拍照识别品牌品类，跟踪开封效期、数量、小样 / 正装 |
| 食品库 | 食品录入与拍照识别，低库存与临期分级提醒、评分 |
| 订阅管家 | 会员周期与费用记账，月均 / 年花费统计，到期提醒、一键续费 |

底部 6 个 Tab，移动优先。

## 技术栈

Next.js 16（App Router）+ React 19 + TypeScript 5 + Tailwind CSS 4 + shadcn/ui
数据：Postgres（PostgREST 访问）｜存储：S3 兼容对象存储｜AI：多模态 LLM｜天气：Open-Meteo（免费，无需 Key）

## 用 Skill 的方式

把仓库根目录放进支持 Skill 的 Agent（Claude Code、扣子等）的 skills 目录，Agent 会在匹配到「做穿搭应用 / 衣橱管理 / 拍照识别建档」这类需求时自动读取 `SKILL.md`。

## 注意

- 本仓库不含任何真实用户数据，也不含任何 API Key。
- `.coze` 中的项目绑定 ID 已移除，首次部署时会自动生成。
- 迁到非扣子平台时，数据库 / 存储 / LLM 三处适配层需要重写：`src/storage/database/supabase-client.ts`、`src/lib/storage.ts`、`src/lib/llm.ts`。

## License

MIT
