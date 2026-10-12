# 103 — 品牌化技术方案（plan）

> **Module:** branding ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-12
> **规格依据:** [`spec.md`](./spec.md)（FR-brand-001 … FR-brand-015 / AC-01 … AC-13）
> **物料:** 父工程 `../assets/`（`logo.svg` 矢量 · `logo.png` 200² 透明标记 · `logo-1024-with-bg.png` 1024² 不透明母版）

## 1. 方案总览

```
父工程 assets/                     本工程（构建期施加，上游零改动）
├── logo.svg ──────────────┬──▶ pi-dist/public/icons/logo.svg           （页面 Logo，矢量）
├── logo.png (200²,透明) ──┼──▶ pi-dist/public/icons/icon-192.png       192²
│                          ├──▶ pi-dist/public/icons/apple-touch-icon.png 180²
│                          ├──▶ AppScope/.../window_icon.png            200²（允许 alpha）
│                          └──▶ runtime-overlays/web_engine/.../electron_white.png 200²（状态栏字形）
└── logo-1024-with-bg.png ─┬──▶ AppScope/.../app_icon.png      1024² 不透明（rgb24）
   (1024², 不透明)          ├──▶ AppScope/.../startIcon.png     1024² 不透明
                            ├──▶ AppScope/.../icon.png          1024² 不透明（ohosTest 用）
                            ├──▶ AppScope/.../product_logo_32.png 1024² 不透明（无引用，保持一致）
                            ├──▶ pi-dist/public/icons/icon-512.png 512² 不透明
                            └──▶ pi-dist/.next/server/app/favicon.ico.body 192² 透明（PNG 字节）

文案：pi-dist/**（.next + public）文本文件内 `Pi Web` → `Pi Desktop`（按文件计数并后置断言）
运行时：src-main 注入 PI_WEB_SKIP_VERSION_CHECK=1（禁用更新检查）· PI_WEB_APP_NAME=Pi Desktop（PWA 名）
壳侧：UI_HTML_MARKERS = ['Pi Desktop', 'Pi Web']
```

**分两个函数、一处模块**（`scripts/brand-assets.mjs`）：

- `applyRepoBranding()` —— 只写**本工程自有**的图标位（`AppScope/resources/base/media/*`、overlay 字形）。
  幂等，可随时跑；被 `collect-runtime.mjs`（阶段 0.5）与 `collect-pi.mjs` 调用，保证「overlay 源在阶段 3 回盖之前已是品牌图标」。
- `applyWebBranding(piDistDir)` —— 只写 **pi-dist 副本**（web 图标 + favicon 路由体 + `logo.svg` + 文案替换）。
  只由 `collect-pi.mjs` 调用（pi-dist 由它创建）。
- CLI（`node scripts/brand-assets.mjs`）：两件都做（pi-dist 不存在时跳过 web 部分）—— 供人工单独执行。

## 2. 关键决策

### D1 — 文案替换：只替换**带空格的字面量**（落实 FR-brand-003/005，R1）

`Pi Web` → `Pi Desktop`。技术标识符全是 `pi-web` / `PiWebTitle` / `PI_WEB_*` / `pi_web_session` / `pi-web:…`，
**都不含 `Pi Web` 这个带空格写法** → 单条精确替换即可，无需正则边界。

- 作用范围：`pi-dist/.next/**` 与 `pi-dist/public/**` 下的**文本文件**（判定：无 NUL 字节且 UTF-8 可解码）；
  跳过 `.next/cache`（已在 collect-pi 删掉）与二进制图标。
- **计数与后置断言**（R2）：
  1. 打印「替换文件数 / 命中次数」；
  2. 断言 `pi-dist/.next/server/app/index.html` 与 `login.html` 中 `Pi Web` **为 0**、
     `Pi Desktop` **≥1**；不满足即 **fail**（pi-web 升级导致漂移时必须吵醒，而不是静默发无品牌包）；
  3. 断言技术标识符集合未被误伤（`pi-web` / `@agegr/pi-web` / `pi_web_session` / `PI_WEB_` / `PiWeb`）：
     替换前后总出现次数必须逐项不变（当前 750）。

### D2 — Logo：矢量进 UI，位图进图标位（落实 FR-brand-007/008/009，R5）

- **页面 Logo**：只改**真正渲染 Logo 的 `<img src>`**（hero 40×40、登录页 52×52）—— 覆盖三种编译形态
  （客户端 chunk 的 `src:"/icons/…"`、SSR HTML 的 `src="/icons/…"`、RSC 的 `"src":"/icons/…"`）→ 改成矢量
  `/icons/logo.svg`（`images.unoptimized = true`，`<img src>` 原样使用该路径），并把 `assets/logo.svg`
  **原样拷入** `pi-dist/public/icons/logo.svg`（逐字节一致）。**不动**元数据里的
  `href="/icons/apple-touch-icon.png"`（`rel="apple-touch-icon"` 声明的仍是 PNG）与 `public/sw.js`
  的预缓存列表 —— 因此 `apple-touch-icon.png` 仍被引用、也仍然生成（180² 透明标记）。
- **PWA/离线页图标**：`icon-192.png`（192²）与 `apple-touch-icon.png`（180²）用 200² 透明标记下采样（不放大）。
- **大位图**：`icon-512.png` 用 1024² 不透明母版下采样（不允许把 200² 放大当大图标）。
- **favicon**：上游把它编译成路由体 `pi-dist/.next/server/app/favicon.ico.body`（U8，内容是 PNG 字节）——
  替换该 `.body` 文件（192² 透明标记、PNG 字节，文件名保持 `.ico`；`.meta` 不含大小信息、无需改）；
  **路由体缺失即失败**（不静默沿用上游图标）。
- **生成后回读断言**：必须是 PNG、尺寸一致；应用级图标必须 `colorType=2`（无 alpha 且不是带 tRNS 的调色板图）。
- **包内图标**：应用级四个用 1024² 母版**去掉 alpha**（`-vf scale=1024:1024,format=rgb24`）→ 满足
  「1024² 且不透明」（U10）；`window_icon` / `electron_white` 用 200² 透明标记（允许 alpha，状态栏/托盘需要透明底）。

### D3 — 禁用更新检查：用上游运行时开关，不改上游（落实 FR-brand-001/002）

pi-web 的 `/api/app-update` 有运行时开关 `PI_WEB_SKIP_VERSION_CHECK=1`（U4）：置位后直接返回
`updateAvailable:false`，客户端（`ChatWindow` 的模块级单例）因此**不渲染**「→ v… ↗」链接，
而**版本行照旧**（`web v0.11.1` / `pi v1.1.0`，U3）。

- 在 `src-main/main.js` 注入该 env（与既有 `PI_OFFLINE` 同一处），并**同时**注入 `PI_WEB_APP_NAME=Pi Desktop`
  （PWA manifest 名，U6）。
- 选择理由：**零上游改动、零字符串替换、行为由上游保证**；不选「把 fetch URL 改死」的方案
  （那样会破坏 `/api/app-update` 的契约，且升级后锚点难保）。

### D4 — 幂等与确定性（落实 FR-brand-011，R6）

- 生成统一走 `ffmpeg -y -v error -i <src> -vf "scale=W:H[:flags=lanczos],format=rgb24|rgba" <dst>`；
  参数固定、无时间戳元数据 → **同物料得同字节**（真机/CI 重建不产生 diff）。
- 生成物**入库**（`AppScope/.../*.png` 与 overlay 字形），因此干净 checkout 也有图标；
  构建时再生成一遍仅用于「物料变了要跟上」，字节一致则不产生 git diff。

### D5 — 依赖前置检查（落实 FR-brand-010，R4）

- 物料目录解析：`--assets <dir>` > `$PI_ASSETS_DIR` > `resolve(projectRoot, '../assets')`。
- 必需文件：`logo-1024-with-bg.png`（1024² **且不透明**，生成不透明图标用）、`logo.png`（含 alpha，小尺寸用）、
  `logo.svg`（矢量）。**任一缺失/尺寸不符/透明度不符 → 立即非零退出**，并打印「期望路径 + 期望属性」。
- `ffmpeg` 不可用 → 同样硬失败并提示安装（不静默跳过品牌化）。

### D6 — 与既有 overlay / 流水线的接线（落实 FR-brand-012，U11）

- `collect-runtime.mjs` 在**阶段 0.5**（阶段 3 回盖之前）调用 `applyRepoBranding()`：
  保证 overlay 源 `electron_white.png` 已是品牌字形；阶段 7 的 md5 守卫（源==目标）照常通过。
- `collect-pi.mjs` 在**组装完 pi-dist 之后**（原有阶段 2 与 3 之间）调用
  `applyRepoBranding()` + `applyWebBranding(piDistDir)`，并在阶段 4 统计里打印品牌化结果。
- **不改** `AppScope/app.json5` / `module.json5`（图标名与引用保持原样，只换文件内容）→ 零配置漂移风险。
- 不新增 `patches/`、不改上游三仓（FR-brand-012）。

### D7 — 文档同步（落实 FR-brand-015）

`docs/media-placeholder-icons.md` 改写成「图标物料与生成规则」；能力清单 §B #7 关闭；
README 流水线小节加「阶段 ⓪/③.5 品牌物料」；工程规划附录 C 新增条目；真机验证记录新增本轮。

## 3. 不做的设计（YAGNI）

- **不做** i18n 文案本地化改写（只换品牌名本身）；**不做** 上游源码/patch 改动；
- **不做** 改名 bundleName / 版本号；**不做** 自定义托盘图标加载（现有 `electron_white.png` 通路已足够）；
- **不做** 图标多分辨率自适应（HarmonyOS 由 `$media:` 单文件 + 系统缩放，与现状一致）。

## 4. 风险与回滚

| 风险 | 处置 |
|---|---|
| 替换字符串误伤 | 只替换带空格字面量 + 技术标识符计数断言（D1） |
| pi-web 升级后文案/引用漂移 | 后置断言（index.html/login.html 必须无 `Pi Web`），失败即 build 失败（D1/R2） |
| 物料缺失/被改名 | 硬失败 + 明确指引（D5） |
| 生成图标破坏资源编译 | 仅换文件内容、不改配置；构建后用 HAP 内字节核对（AC-05/06） |
| 回滚 | `git checkout` 图标文件 + 重跑 `collect-runtime`/`collect-pi`/`collect-app`/build（无数据迁移） |

## 5. 验证方式

1. **静态/负向**：品牌化步骤的输出计数与断言；临时改名物料 → 必须非零退出（AC-08）。
2. **包内核对**：解包 HAP 读 `AppScope/.../*.png` 的 IHDR（1024²、无 alpha）与 md5（≠ 占位图，= 生成物）（AC-05/06）。
3. **真机端到端**：应用域读 `document.title`/`outerHTML`（`Pi Web` 计数 = 0、`Pi Desktop` 命中）、
   `fetch('/api/app-update')`（`updateAvailable:false`）、`fetch('/icons/logo.svg')`（与物料哈希一致）、
   版本文本仍在（AC-01…AC-04）。
4. **不回归**：启动六项、会话可建、真实对话、`bash`/`grep`/`find`（AC-09）。
5. **上游**：三仓工作树 0 改动、`patches/` 0 条（AC-07）。
6. 代码评审 + 按 `git-commit` 规范提交（AC-12/13）。
