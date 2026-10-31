# TECH.md — pi-desktop-hos 技术选型

> 本文件是 **Pi Desktop · Electron on HarmonyOS 版** 的技术栈与版本锁定说明。
> 事实以 `package.json` / `AppScope/app.json5` / `build-profile.json5` / `../docs/工程规划.md` 为准。

---

## 1. 技术栈

| 类别 | 技术 | 版本 | 用途 |
|---|---|---|---|
| 运行时 | Electron-on-HarmonyOS | **37.2.3** | 鸿蒙上的 Electron |
| Node | 运行时内置 | **22.17.0** | 进程内宿主 |
| ABI | — | **v138** | 原生模块 |
| 壳 | ArkTS + ArkUI | HarmonyOS API 17 兼容 / 24 目标 | entry + web_engine |
| Web 引擎 | Chromium（包内） | **138** | 渲染 |
| 构建 | hvigor + DevEco | 见 `build-profile.json5` | HAP |
| 构建脚本 | Node `.mjs` | Node 22.17.0 | collect-runtime / prepare-next / smoke / collect-pi / collect-app |
| 图像 | Python + Pillow / ffmpeg | 构建机 | 品牌图标生成 |
| 签名 | hvigor + signing profile | 本机/CI secrets | HAP 签名 |

## 2. 上游与依赖

| 依赖 | 版本 | 说明 |
|---|---|---|
| `pi` | **v1.2.0** | agent harness |
| `pi-web` | **v0.12.1** | UI + Next 服务 |
| `harmonypc-electron` | **v37.2.3** | Electron-on-鸿蒙运行时 |
| `electron` 依赖 | 37.2.3 | `oh-package.json5` |
| 补丁 | 2 条 | `patches/v0.12.1/` |

## 3. 运行时与目录

- Electron 主进程：`src-main/main.js`；tar 解压：`src-main/tar-extract.js`。
- 应用产物：`web_engine/src/main/resources/resfile/resources/app/`。
- 预置配置：`config/settings.json` / `config/mcp.json`。
- 扩展：`extensions/`（exec / search / runtime / workspace-roots / git）。
- 技能：`skills/harmony-runtime-capabilities/`。
- 运行时覆盖：`runtime-overlays/`（整文件替换）。

## 4. 构建流水线

```
collect-runtime
  → prepare-next（Node 22.17 构建 pi-web）
  → smoke-node22（门禁）
  → collect-pi（pi-dist.tar.gz + SHA-256 marker）
  → collect-app（投放 resfile）
  → hvigor 构建 + 签名
  → 真机安装/验证
```

## 5. 兼容与风险

| # | 风险 | 缓解 |
|---|---|---|
| R1 | Electron 37 / Node 22.17 落后于桌面 | 固定版本；能力清单标注降级 |
| R2 | 无系统 git / fd / rg | 纯 JS 同名顶替扩展 |
| R3 | 无 PTY prebuild | 补丁显式 `unsupported`；不伪造 |
| R4 | 鸿蒙权限/ACL | `docs/ACL申请清单.md`；按包名申请；真机复验 |
| R5 | 局域网绑定 + 密码 | 随机密码 + Basic/Cookie 注入；日志脱敏 |
| R6 | 外部链接 SIGSEGV | 外链中转页；系统浏览器 |
| R7 | 运行时归档缺失 | `collect-runtime` 守卫；硬失败 |
| R8 | 品牌物料缺失 | 品牌脚本硬失败 |

## 6. 版本锁定文件

| 文件 | 作用 |
|---|---|
| `AppScope/app.json5` | bundleName / `0.12.1` / `1201` |
| `src-main/package.json` | 主进程包版本 `0.12.1` |
| `oh-package.json5` / `electron/oh-package.json5` / `web_engine/oh-package.json5` | 鸿蒙依赖 |
| `build-profile.json5` | 产品 / SDK 17/24 / 模块 |
| `runtime-overlays/` | 运行时覆盖 |
| `patches/v0.12.1/` | 上游补丁 |
