# 每日穿搭 · Agent Skill

把「每日穿搭（outfit-advisor）」这套应用封装成了一个 Agent Skill，方便别人在 GitHub 上拿到后，让自己的 AI 编程助手按说明复刻或二次开发。

## 目录

```
outfit-advisor/
├── SKILL.md                      # 技能主文件（Agent 读这个）
├── references/
│   ├── setup.md                  # 从零搭建与部署、排错
│   ├── architecture.md           # 目录结构、9 张表字段、API 清单
│   └── customization.md          # 二次开发：加模块、改枚举、接登录做多用户
└── assets/
    └── init-db.sql               # 建库脚本（9 张表 + 索引 + RLS，可重复执行）
```

## 怎么用

**在 Claude / 扣子 / 其他支持 Skill 的 Agent 里：** 把 `outfit-advisor/` 整个目录放进 skills 目录，Agent 会在匹配到「做穿搭应用 / 衣橱管理 / 拍照识别建档」这类需求时自动加载。

**直接给人看：** 打开 `SKILL.md`，就是一份完整的应用说明与实现要点。

**照着搭：** 按 `references/setup.md` 走 6 步——复制项目 → 开通数据库/存储/LLM 三项集成 → 执行 `assets/init-db.sql` → 本地验证 → 部署。

## 发布到 GitHub

```bash
git init
git add outfit-advisor
git commit -m "feat: outfit-advisor agent skill"
git remote add origin <你的仓库地址>
git push -u origin main
```

如果想让仓库首页直接显示说明，可以把 `outfit-advisor/SKILL.md` 复制一份到仓库根目录改名为 `README.md`。

## 注意

- 这套应用原本跑在扣子编程（Coze Coding）上，数据库、对象存储、LLM 三项集成由平台运行时注入凭据，`.env` 保持为空即可。迁到其他平台需要重写这三处适配层（`src/storage/database/supabase-client.ts`、`src/lib/storage.ts`、`src/lib/llm.ts`）。
- 本包只包含代码说明与建库脚本，**不含任何真实用户数据**。
- 天气用 Open-Meteo 免费接口，无需 API Key。
