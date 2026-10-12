# 103 — 品牌化测试用例与执行结果

> **Module:** branding ｜ **Status:** Done ｜ **Last Updated:** 2026-10-12
> **需求编号:** 103-branding ｜ **规格:** [`spec.md`](./spec.md)（FR-brand-001…015 / AC-01…13）
> **方案:** [`plan.md`](./plan.md) ｜ **任务:** [`tasks.md`](./tasks.md)
> **原始取证:** `logs/20261012-3/`（不入库）。图例：✅ 通过 ｜ ❌ 失败 ｜ ⬜ 未执行

## A. 构建期（宿主侧，可复核）

| ID | 用例 | 方法 | 结果 | 证据 |
|---|---|---|---|---|
| TC-01 | 物料校验：尺寸/通道/真实不透明度 | `node scripts/brand-assets.mjs` | ✅ `logo-1024-with-bg.png` 1024²、**minAlpha=255**；`logo.png` 200²/含 alpha；`logo.svg` 非空 | `T10-brand.txt` |
| TC-02 | 图标生成：应用级不透明、窗口/状态栏允许 alpha | 读生成物 PNG IHDR | ✅ 4 个应用级 1024²/`colorType=2`（无 alpha）；`window_icon`/`electron_white` 200²/`colorType=6` | `T10-brand.txt` |
| TC-03 | **幂等/确定性**：连跑两次字节不变 | 两次生成后比 md5 | ✅ `fe006dfd…`（应用级）与 `20337842…`（窗口/状态栏）两次一致 | `T18-brand-fix.txt` |
| TC-04 | 文案替换规模与安全边界 | 品牌化输出统计 + 技术标识符计数断言 | ✅ 扫描 670 个文本文件、改写 41 个（文案 1055 处、Logo 路径 32 处）；小写 `pi-web` 计数 **608 → 608 不变** | `T19-build.log` |
| TC-05 | 后置断言：预渲染 HTML 无旧品牌 | 品牌化内建断言 | ✅ `index.html`/`login.html` 均**无** `Pi Web`、**含** `Pi Desktop`；缺失即失败 | 同上 |
| TC-06 | **全树零残留** | `assertNoBrandLeftovers(piDistDir)`（排除 `node_modules` 的机器断言，在**壳预置资源投放之后**跑）+ `grep -rl "Pi Web" pi-dist` | ✅ 终检通过（0 处）；`grep` 亦 0 个文件（`.next` + `public` + `bin` + `resources/pi-agent` + `package.json` / `next.config.ts`） | `T27-build.log` |
| TC-07 | favicon 必须是真 PNG | 读 `favicon.ico.body` 魔数 + 应用域 `fetch('/favicon.ico')` | ✅ 首轮发现 ffmpeg 落成 **JPEG**（`FF D8 FF FE…Lavc61`）→ 加 `-c:v png` 后为 PNG（192²/alpha） | `T23-branding-probe.txt` |
| TC-08 | **负向**：物料缺失必须构建失败（AC-08） | 临时移走 `logo.png` + `logo-1024-with-bg.png` → 跑品牌化 → 恢复 | ✅ 非零退出 + 明确指引：`✖ 物料缺失：透明标记 logo.png → D:\pi-workspace\assets\logo.png` | `T24-negative.txt` |
| TC-09 | 脚本自身语法 | `node --check`（brand-assets / collect-pi / collect-runtime / src-main） | ✅ 全通过 | `T12/T19` 日志 |

## B. 流水线与包内（AC-05/06/10）

| ID | 用例 | 方法 | 结果 | 证据 |
|---|---|---|---|---|
| TC-20 | `collect-runtime` 阶段 0.5 + 阶段 7 守卫 | 跑 `node scripts/collect-runtime.mjs` | ✅ 阶段 0.5 生成图标；阶段 7 **全部守卫通过**（含 overlay 源/目标 md5 一致、新增 overlay 落地） | `T12-collect-runtime.log` |
| TC-21 | overlay 状态栏字形已回盖 | 比 `runtime-overlays/.../electron_white.png` 与 `web_engine/.../electron_white.png` | ✅ 两侧同 md5 `20337842…`（品牌字形） | 同上 |
| TC-22 | `collect-pi` 步骤 2.5 + 打包 | 跑 `node scripts/collect-pi.mjs` | ✅ 品牌化内联执行；pi-dist 文件数 27,281 → **27,282**（新增 `logo.svg`） | `T19-build.log` |
| TC-23 | 签名构建 | `scripts/build-debug.ps1` | ✅ 两轮均绿（评审修复前 `31 s 39 ms`；修复后 **`29 s 398 ms`**）；`pack.info` 仍 `0.11.1 / 1101`；最终 HAP **335,746,618 B** | `T20-build-hap.log`、`T28-build-hap.log` |
| TC-24 | **包内图标 = 生成物** | 解包 HAP 读 IHDR + md5 | ✅ **5 个**逐字节一致：`icon.png` / `product_logo_32.png` / `startIcon.png`（1024²/`colorType=2` 无 alpha）+ `window_icon.png` / `electron_white.png`（200²/alpha）；`app_icon.png` 例外见 TC-26 | `T14-hap-icons.txt`、`T32-hap-icons.txt` |
| TC-25 | 旧占位图已消失 | 比 md5（旧值 `09b57e9f…` / `8163783d…`） | ✅ 已彻底替换 | 同上 |
| TC-26 | **`app_icon.png` 与源文件不同（已知事实）** | 解包 HAP | ⚠️ 包内为 **512×512 / `colorType=6`** —— 鸿蒙资源编译器重编码（`resConfig.json#iconCheck`）；**源资产**仍是 1024²/无 alpha（`fe006dfd…`）。验收以源资产为准（AC-05 已按此改写） | `T32-hap-icons.txt` + `docs/media-placeholder-icons.md` |
| TC-27 | 版本号与 bundleName 未变（AC-10） | `pack.info`、`AppScope/app.json5` | ✅ `0.11.1 / 1101`、`org.fellow99.pi.PiDesktop` | 同上 |

## C. 真机端到端（AC-01…04、AC-09）

方式：`hdc` 卸载 → 安装 → 启动 → 应用域（`hdc fport` → 主进程 Node inspector）读 DOM / 调 HTTP 路由 / 比哈希。

| ID | 用例 | 结果 | 证据 |
|---|---|---|---|
| TC-30 | 首屏标题与界面品牌（AC-01） | ✅ `document.title = "Pi Desktop"`；`outerHTML` 中 `Pi Web` **0** 次、`Pi Desktop` **12** 次；`body.innerText` 无 `Pi Web` | `T23-branding-probe.txt` |
| TC-31 | 当前版本**仍显示**（AC-02） | ✅ 侧栏品牌 `aria-label="Pi Desktop，版本：web 0.11.1，pi 1.1.0"`（DOM 同时含 `0.11.1` 与 `1.1.0`） | 同上 |
| TC-32 | 新版本检测**已禁用**（AC-03） | ✅ `/api/app-update` → `{"currentVersion":"0.11.1","latestVersion":"0.11.1","updateAvailable":false,"releaseUrl":""}`；DOM 内 `releases/tag` **0**、`→ v` **0** | 同上 |
| TC-33 | 页面 Logo = 父工程物料（AC-04） | ✅ `/icons/logo.svg` 200 / `image/svg+xml` / 1288 B / sha256 `7c98c891…`，与 `../assets/logo.svg` **逐字节一致** | 同上 |
| TC-34 | Web 图标全部为新物料 | ✅ `icon-192` 192²/alpha、`apple-touch-icon` 180²/alpha、`icon-512` 512²/**无 alpha**、`/favicon.ico` 192² PNG | 同上 |
| TC-35 | PWA manifest 名 | ✅ `name = short_name = "Pi Desktop"`（`PI_WEB_APP_NAME` 运行时生效） | 同上 |
| TC-36 | 启动日志与首屏标记（FR-brand-006） | ✅ `PI_OFFLINE = 1｜PI_WEB_SKIP_VERSION_CHECK = 1｜PI_WEB_APP_NAME = Pi Desktop`；`首屏完成，UI 标记命中：Pi Desktop`；`解压完成：27282 个文件` | `T16-hilog.txt` |
| TC-37 | 应用启动到「就绪」、会话可建、真实对话（AC-09） | ✅ 六项齐备；一轮真实对话 **4 次工具调用**（`bash` / `bash cat` / `grep` / `find`）全部即时返回正确结果 | `T25-e2e-smoke.json` |
| TC-38 | 上游三仓与补丁集（AC-07） | ✅ `../pi` / `../pi-web` / `../harmonypc-electron` 工作树 **0 项改动**；`patches/` 仍 **0 条** | `T26-scope.txt` |

## D. 未测 / 不做（诚实标注）

| 项 | 说明 |
|---|---|
| **图标在人眼中的观感** | 本轮只做**机器可判**的核对（尺寸/色型/哈希/引用路径）；「图标看上去好不好看」「状态栏彩色字形在深色背景下是否够醒目」需人工目视，未做 |
| 登录页（`/login`）品牌 | 只通过构建期断言（`login.html` 无 `Pi Web`、含 `Pi Desktop`）与路径替换（登录页 Logo → `logo.svg`）覆盖，**未在真机打开登录页截图**（本轮应用直接进入会话页） |
| 离线页（`public/offline.html`） | 文案替换由构建期统计覆盖，**未构造离线条目**实机验证 |
| 托盘/状态栏图标的实际渲染 | 依赖人工点击状态栏查看；本轮只核对文件（`electron_white.png` 已换为物料字形） |
| SwiftShader/GPU 视觉取证 | 沿用既有结论（`capturePage` 而非 `snapshot_display`），本轮未做视觉截图 |
| i18n 其它语言包 | 品牌名替换覆盖三种语言包的品牌串；**未**逐条审校其它文案 |

## E. 代码评审修复轮（round 2：`requesting` / `receiving-code-review`）

评审给出 **1 Important + 9 Minor** 与 5 条「文档断言无证据」项，**全部处置**（全文 `logs/20261012-3/REVIEW_REPORT.md`）。

| ID | 用例 | 方法 | 结果 | 证据 |
|---|---|---|---|---|
| TC-40 | **Important**：overlay **源**与**生效副本**不得分叉 | 改物料后只跑 `node scripts/brand-assets.mjs`，比对 `runtime-overlays/.../electron_white.png` 与 `web_engine/.../electron_white.png` | ✅ 现在**两处一起写**（生成 7 项，含生效副本）；不再出现「源已换、包内仍旧」→ 也不会让下一次 `collect-runtime --verify-only` 的阶段 7.6 守卫失败 | `T18-brand-fix.txt`、`T12-collect-runtime.log` |
| TC-41 | Minor：favicon 路由体缺失必须失败（不得静默沿用上游图标） | 静态审阅（`applyWebBranding` 改为 `fail`） | ✅ 见 `scripts/brand-assets.mjs` 的 `未找到 favicon 路由体` 分支 | 代码 |
| TC-42 | Minor：「不透明」判定必须排除带 `tRNS` 的调色板图 | 静态审阅 + 生成物 IHDR | ✅ 改为要求 `colorType === 2`（生成物实测 `colorType=2`） | `T32-hap-icons.txt` |
| TC-43 | Minor：透明标记必须**真的**有透明像素 | 物料校验新增 `minAlpha < 255` | ✅ 本次物料 `logo.png` 实测含 40.2% 全透明像素 → 通过；若换成全不透明图会失败 | `T10-brand.txt` |
| TC-44 | Minor：缺 `ffmpeg` 时必须给出安装指引（而不是未处理异常） | `ensureFfmpeg()` 前移到 `loadMaterial()`/`minAlpha()` | ✅ 代码路径统一 | 代码 |
| TC-45 | Minor：流水线必须支持 `--assets <dir>`（文档承诺的逃生口） | `collect-pi` / `collect-runtime` 传 `process.argv.slice(2)` | ✅ 两处均已传参 | 代码 |
| TC-46 | Minor：Logo 路径替换只改 `<img src>`（不动元数据 `href` 与 SW 预缓存） | 构建后核对 `pi-dist` | ✅ 客户端 chunk/SSR img → `/icons/logo.svg`（5 处）；元数据 `href="/icons/apple-touch-icon.png"` 与 `public/sw.js` 三件套**保持不变**（因此 180² 图标仍被引用、仍生成） | `T27-build.log` + 构建产物核对 |
| TC-47 | Minor：`logo.svg` 必须是可解析矢量 | 物料校验新增 `<svg` + `viewBox` 断言 | ✅ 通过 | `T10-brand.txt` |
| TC-48 | Minor：技术标识符断言要有意义 | 改为**标识符集合**（`pi-web`/`@agegr/pi-web`/`pi_web_session`/`PI_WEB_`/`PiWeb`）计数逐项不变 | ✅ 750 → 750 | `T27-build.log` |
| TC-49 | Minor：品牌终检必须覆盖后写的 `resources/pi-agent/` | 新增 `assertNoBrandLeftovers()` 并在 `collect-pi` **步骤 3 之后**调用 | ✅ 终检通过（0 处） | `T27-build.log` |
| TC-50 | 修复后重新构建 + 重装 + 重设环境 + 复验 | 全流水线 + 真机 | ✅ 图标/文案/路由/不回归全部复验（TC-31…TC-38 的数据来自本轮产物） | `T27`–`T32` |
