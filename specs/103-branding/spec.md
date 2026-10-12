# 103 — 品牌化：Pi Desktop 文案 / Logo / 图标 / 禁用版本检测 功能规格

> **Module:** branding ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-12
> **上游基线:** pi v1.1.0（Branch_v1.1.0）· pi-web v0.11.1（Branch_v0.11.1）· harmonypc-electron v37.2.3
> **需求编号:** 103-branding ｜ **需求名称:** UI 品牌化与图标物料统一
> **git 分支:** 不改动（沿用 101/102 的纪律：不新建、不切换、不重命名）
> **物料来源:** **父工程** `../assets/`（本机 `D:\pi-workspace\assets\`）—— `logo.png`（200×200，含透明通道）、
> `logo.svg`（矢量）、`logo-1024-with-bg.png`（1024×1024，**完全不透明**）

## 1. 目的

当前构建把 pi-web 的原生品牌直接暴露给用户：界面若干处写着 **`Pi Web`**、页面标题/浏览器标签是 `Pi Web`、
Logo 是 pi-web 自带图标、应用图标是参考工程拷贝来的**占位图**（且非 Pi 品牌，见 `docs/media-placeholder-icons.md`），
首页还会联网检查 pi-web 新版本。本需求把这一层收束到本工程自己的品牌：

- 界面与元数据：**`Pi Web` → `Pi Desktop`**；
- 页面 Logo 与**所有**图标位：统一用父工程 `assets/` 的物料；
- **保留「当前版本」显示，但禁用「检测新版本」**。

## 2. 范围

**In scope**

- pi-dist 构建产物的**构建期品牌化**（`Pi Web` → `Pi Desktop`；替换 web 图标/favicon；补入 `logo.svg`）。
- HarmonyOS 包内图标物料的**构建期生成**（`AppScope/resources/base/media/*` +
  状态栏/托盘字形 `runtime-overlays/web_engine/.../electron_white.png`）。
- 运行时开关：`PI_WEB_SKIP_VERSION_CHECK=1`（**禁用更新检查**）、`PI_WEB_APP_NAME=Pi Desktop`（PWA 名）。
- 壳侧首屏标记同步（`src-main/main.js` 的 `UI_HTML_MARKERS`）。
- 文档同步（含 `docs/media-placeholder-icons.md` 由「占位图」改写为「品牌图标」、能力清单 §B 待办 #7 关闭）。
- 构建、真机部署与端到端验证（含负向用例）。

**Out of scope**

- **不改上游一个字节**：`../pi`、`../pi-web`、`../harmonypc-electron` 三个仓保持工作树干净；
  `patches/` 仍 **0 条**（品牌化全部落在本工程自己的产物与 overlay 上）。
- **不做** i18n 文案重写（除品牌名本身）：技术标识符（`pi-web:*` localStorage key、`@agegr/pi-web` 包名、
  `pi_web_session` cookie、SW 缓存前缀等）**一律不改**，避免破坏兼容与用户数据。
- **不改**版本号（仍 `0.11.1 / 1101`）、不改 bundleName、不改启动流程与能力面。
- 不做发布证书 / 上架材料。

## 3. 上游事实（本规格前提，已核实）

| # | 事实 | 出处 |
|---|---|---|
| U1 | `Pi Web` 是**硬编码/编译期内联**的：源内出现在 `app/layout.tsx`（title/description/applicationName/appleWebApp）、`app/login/page.tsx`、`components/ChatWindow.tsx`（新会话 hero 品牌）、`components/PiWebTitle.tsx`（`BRAND_TEXT`）、`components/AppShell.tsx`（`document.title`）、`public/offline.html`、`proxy.ts`（Basic realm）、i18n 三语言包 | pi-web 源码；构建产物内 35 个文件含该串 |
| U2 | 版本值是**构建期内联常量**：`next.config.ts` 的 `env.NEXT_PUBLIC_APP_VERSION`（= pi-web package.json 版本 0.11.1）与 `NEXT_PUBLIC_PI_VERSION`（= 1.1.0） | pi-web `next.config.ts:7-12,104-107` |
| U3 | 版本显示点：新会话 hero（`web v…` / `pi v…`）与侧栏品牌彩蛋（`0.11.1p1.1.0`）；**没有**关于页 | pi-web `components/ChatWindow.tsx:1441,1444`、`components/PiWebTitle.tsx:90-92` |
| U4 | 更新检查 = 服务端路由 `GET /api/app-update` 拉 `registry.npmjs.org/@agegr%2Fpi-web/latest`（12 h 缓存），客户端每页加载最多一次；**有运行时开关** `PI_WEB_SKIP_VERSION_CHECK=1` → 直接返回 `updateAvailable:false`（**版本显示不受影响**） | pi-web `app/api/app-update/route.ts:5-11,70-77`；`components/ChatWindow.tsx:95-157` |
| U5 | UI 里的 Logo 引用：hero/window 用 `/icons/apple-touch-icon.png`（180×180，渲染 40×40）、登录页同源（52×52）、元数据与 offline 用 `/icons/icon-192.png`、manifest 用 `icon-192/512.png`、`app/favicon.ico` 实为 512×512 PNG（与 `icon-512.png` 同字节） | pi-web `app/layout.tsx:22-37`、`components/ChatWindow.tsx:1437`、`app/login/page.tsx:52`、`public/offline.html:77`、`app/manifest.ts:19-32` |
| U6 | PWA 名可运行时改：`app/manifest.ts:6` 读 `PI_WEB_APP_NAME`（构建产物保留运行时读取） | pi-web `app/manifest.ts:3,6` |
| U7 | Next 静态资源原样引用（`images.unoptimized = true`）→ `<img src>` 用的就是引号内的路径，替换路径即可换 Logo | pi-web `next.config.ts:30` |
| U8 | 构建产物里 favicon 的字节落在 `pi-dist/.next/server/app/favicon.ico.body`（`.meta` 只记 content-type/cache，不记大小）→ 换图标要替换 `.body` | 本工程 `pi-dist/` 实测 |
| U9 | 包内**实际投放**的图标只有 6 个：`AppScope/.../app_icon.png`（1024²，被 `app.json5`、`module.json5`×3、shortcuts 引用）、`icon.png`（仅 ohosTest 用，HAP 内为死重）、`product_logo_32.png`（无引用，死重）、`startIcon.png`（`module.json5` 启动图标）、`window_icon.png`（200²，EntryAbility 图标）、`web_engine` 的 `electron_white.png`（200²，状态栏/托盘字形，由 overlay 供给） | 本工程实测 + `docs/media-placeholder-icons.md` |
| U10 | 运行时的 `window_icon` / `electron_white` **允许带 alpha**；应用级图标要求 **1024×1024 且不透明** | `docs/media-placeholder-icons.md:23-28`、`docs/工程规划.md:891` |
| U11 | `runtime-overlays/` 的语义是**整文件替换**（不是补丁），`collect-runtime.mjs` 阶段 3 回盖、阶段 7 md5 守卫；`AppScope/` 不被 `collect-runtime` 触碰（本工程自有） | `runtime-overlays/README.md`、`scripts/collect-runtime.mjs` |
| U12 | 父工程物料：`logo.png` 200²（**40.2% 全透明像素**，即透明标记）、`logo-1024-with-bg.png` 1024²（**minAlpha=255，完全不带透明**）、`logo.svg` 矢量 | 实测（alpha 直方图 + PNG IHDR） |

## 4. 需求条目

> 只追加不修订；MUST / MUST NOT / SHOULD / MAY。Plan 逐条回引。

### 4.1 版本与更新检查

- **FR-brand-001**（MUST）：首页/侧栏**仍必须显示当前版本**（pi-web 版本与 pi 版本），
  但**必须禁用新版本检测** —— 不得向 npm registry 等外部源查询最新版本，也不得渲染「新版本可用」链接。
  实现优先用上游**运行时开关**（`PI_WEB_SKIP_VERSION_CHECK=1`），**不得**为改这一行为而改上游源码。
- **FR-brand-002**（MUST）：禁用后**不得**产生用户可见的报错或空白（版本行照旧、只是没有更新链接）。

### 4.2 文案与标题

- **FR-brand-003**（MUST）：用户可见的 `Pi Web` **必须**全部改为 `Pi Desktop`，覆盖：
  页面元数据（`<title>`/description/application-name/apple-mobile-web-app-title）、登录页标题、
  新会话 hero 品牌、侧栏品牌文本、`document.title`（浏览器标签/窗口标题）、离线页文案、PWA manifest 名、
  i18n 品牌相关字符串（含无障碍标签）。
- **FR-brand-004**（MUST）：上述改名**必须**落在交付产物里 —— 即以「交付产物中不再出现 `Pi Web`」为判据，
  而不是「源码里改了」。
- **FR-brand-005**（MUST NOT）：**不得**改动技术标识符：`@agegr/pi-web` 包名、`pi-web:*` localStorage key、
  `pi_web_session` cookie、`PI_WEB_*` 环境变量名、SW 缓存前缀、`pi-web-*` 文件名、API 路由路径。
- **FR-brand-006**（MUST）：壳侧「首屏 UI 标记」探测必须与改名后的产物一致（否则启动日志会误报未命中首屏）。

### 4.3 Logo 与图标物料

- **FR-brand-007**（MUST）：页面 Logo（hero + 登录页）**必须**使用父工程物料（`assets/logo.svg` 优先，
  或 `assets/logo.png`），且必须是**矢量或 ≥ 显示尺寸**的清晰版本（不得把 200² 位图放大到 512² 以上再当大图标）。
- **FR-brand-008**（MUST）：包内**每一个**被引用的图标位（应用图标、启动图标、窗口图标、状态栏/托盘字形、
  快捷方式图标、PWA 图标 192/512、apple-touch-icon、favicon）**必须**来自同一物料。
- **FR-brand-009**（MUST）：应用级不透明图标（`app_icon`/`startIcon`/`icon`/`product_logo_32`）
  必须是 **1024×1024 且不带 alpha 通道**（满足工程约束）；窗口/状态栏图标**允许**透明。
- **FR-brand-010**（MUST）：物料**缺失或不可解析**时构建**必须硬失败**并给出明确指引
  （不得静默产出无品牌/占位图标的包）。
- **FR-brand-011**（SHOULD）：图标生成应当**幂等且确定性**（同一物料 → 同一字节），以免每次构建污染工作树。

### 4.4 上游零改动与不回归

- **FR-brand-012**（MUST NOT）：不得改动 `../pi`、`../pi-web`、`../harmonypc-electron` 的任何文件；
  不得新增 `patches/` 补丁。品牌化只在**本工程自己的**产物（pi-dist 副本）与 overlay 上进行。
- **FR-brand-013**（MUST）：不得回归既有能力：应用启动到「就绪」、会话可建、真实对话可完成、
  `bash`/`grep`/`find` 三个工具仍可用（需求 102 的成果）。
- **FR-brand-014**（MUST）：版本号**不变**（`0.11.1 / 1101`），bundleName 不变。

### 4.5 文档

- **FR-brand-015**（MUST）：文档必须与实现后的现状一致：`docs/media-placeholder-icons.md` 改写为
  「图标物料与生成规则」（不再是占位图）；`docs/鸿蒙环境能力清单-v0.11.1.md` §B 待办 #7「图标替换」**关闭**；
  `README.md` 流水线小节补上品牌物料步骤；`docs/工程规划.md` 新增变更记录条目；
  `docs/真机验证记录.md` 增补本轮见闻。

## 5. 验收标准

| 编号 | 验收条件 | 判定方式 |
|---|---|---|
| AC-01 | 首屏 DOM 中 `Pi Web` 出现次数为 **0**，且 `Pi Desktop` 出现在 `<title>` 与品牌区 | 真机应用域读 `document.title` + `outerHTML` 计数 |
| AC-02 | 当前版本**仍可见**（`web v0.11.1` 与 `pi v1.1.0`） | 同上（DOM 文本包含） |
| AC-03 | 更新检测**已禁用**：`GET /api/app-update` 返回 `updateAvailable:false`，且页面**无**更新链接 | 应用域 `fetch` 该路由 + DOM 无 `→ v…` 链接 |
| AC-04 | 页面 Logo 取的是我方物料（`/icons/logo.svg`），内容与父工程 `assets/logo.svg` **逐字节一致** | 应用域 `fetch` + 哈希比对 |
| AC-05 | **源资产**：4 个应用级图标为 1024² 且**无 alpha 通道**；`window_icon`/`electron_white` 与物料生成的 200² 透明标记一致。**HAP 内**：`icon.png`/`product_logo_32.png`/`startIcon.png`/`window_icon.png`/`electron_white.png` 与生成物**逐字节一致**；`app_icon.png` 由资源编译器重编码（实测 512²/带 alpha），因此**以源资产判据为准**并在文档中登记 | 读源资产 PNG IHDR + 解包 HAP 比对 md5 |
| AC-06 | HAP 内图标**不再是**参考工程占位图（md5 与旧值 `09b57e9f…`/`8163783d…` 均不同） | 解包 HAP 比对 md5 |
| AC-07 | 上游三仓工作树 **0 项改动**（已跟踪文件）；`patches/` 仍 0 条 | `git -C ../pi status`、`git -C ../pi-web status`、`git -C ../harmonypc-electron status`、`ls patches/` |
| AC-08 | 负向：物料缺失时构建**失败**且信息明确 | 临时移走 `assets/logo.png`（+ `logo-1024-with-bg.png`）后跑品牌化 → 非零退出 |
| AC-09 | 不回归：应用启动六项齐备、会话可建、真实对话完成、`bash`/`grep`/`find` 仍可用 | 真机 hilog + 会话 JSONL |
| AC-10 | 版本号仍 `0.11.1 / 1101`，bundleName 未变 | `pack.info`、`AppScope/app.json5` |
| AC-11 | 文档同步且无残留矛盾表述 | diff 审阅 |
| AC-12 | 代码评审完成且无未决 Critical/Important | `REVIEW_REPORT.md` |
| AC-13 | 提交信息符合 `git-commit` 技能的规范前缀 | `git log` |

## 6. 已知风险

| # | 风险 | 处置 |
|---|---|---|
| R1 | 字符串替换误伤技术标识符（破坏兼容/用户数据） | 只替换**带空格的字面量** `Pi Web`（技术标识符均为 `pi-web`/`PiWeb*`/`PI_WEB_*`）；替换后断言技术标识符计数不变 |
| R2 | pi-web 升级后文案/图标引用点漂移 → 品牌化静默失效 | 品牌化步骤做**后置断言**：产物 HTML/RSC 中不得残留 `Pi Web`、且必须出现 `Pi Desktop`；引用点缺失即失败 |
| R3 | 上游 favicon 走 Next 路由体（`.body`）而非 `public/` | 同时替换 `public/icons/*` 与 `.next/server/app/favicon.ico.body`（U8） |
| R4 | 物料在**父工程**（本仓外）→ 干净 checkout 无法构建 | 明确文档化前置；缺失即硬失败（FR-brand-010），不静默降级 |
| R5 | 用 200² 位图放大当大图标 → 模糊 | 大尺寸（≥512）与不透明图标一律用 1024² 母版 `logo-1024-with-bg.png`；UI 内联用矢量 `logo.svg`（FR-brand-007/009） |
| R6 | 生成图标污染工作树 / 不确定性 | 生成参数固定（scale + format），生成物**入库**一次；同物料重建应得同字节（FR-brand-011） |
| R7 | 替换 `public/icons/*` 后 PWA/元数据引用不一致 | 同时替换三处引用文件与 favicon 路由体，并在真机验证 manifest 与 DOM 引用 |
