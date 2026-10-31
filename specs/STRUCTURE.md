# STRUCTURE.md — pi-desktop-hos 目录与文件结构

> 记录本工程目录结构、关键配置与入口；扫描时间 2026-10-31。
> 排除 `oh_modules/`、`build/`、`.hvigor/`、`logs/`、`pi-dist/` 等构建/依赖目录。

```
pi-desktop-hos/
├── AppScope/
│   ├── app.json5                 # bundleName / versionName 0.12.1 / versionCode 1201
│   └── resources/base/
│       ├── element/string.json   # app_name / EntryAbility_label
│       └── media/                # app_icon / icon / startIcon / window_icon
├── electron/                     # entry 模块（Electron-on-鸿蒙）
│   ├── src/main/ets/             # Application/AbilityStage、EntryAbility、页面
│   ├── src/main/module.json5     # 权限 / abilities / deviceTypes
│   ├── src/main/resources/       # 图标、resfile 落点
│   ├── build-profile.json5
│   └── hvigorfile.ts
├── web_engine/                   # HAR：ArkUI 承载窗口 + 适配器 + ArkWeb 外链页
│   ├── src/main/ets/
│   ├── src/main/module.json5
│   └── build-profile.json5
├── src-main/
│   ├── main.js                   # 主进程宿主：环境、Next、鉴权、窗口、能力桥
│   ├── tar-extract.js            # 流式 ustar 解压
│   └── package.json              # 0.12.1
├── extensions/
│   ├── harmony-exec.js           # bash 同名顶替
│   ├── harmony-search.js         # find/grep 同名顶替
│   ├── harmony-runtime.js        # 运行时能力 skill 注入
│   ├── harmony-workspace-roots.js
│   └── harmony-git/              # 纯 JS Git 扩展（isomorphic-git）
├── config/
│   ├── settings.json             # shellPath / defaultTools / projectTrust
│   └── mcp.json
├── runtime-overlays/             # 运行时/HAR 整文件替换
├── skills/harmony-runtime-capabilities/
├── patches/
│   ├── README.md
│   └── v0.12.1/                  # 2 条补丁
├── scripts/
│   ├── collect-runtime.mjs
│   ├── prepare-next.mjs
│   ├── smoke-node22.mjs
│   ├── collect-pi.mjs
│   ├── collect-app.mjs
│   ├── brand-assets.mjs
│   └── build-hap.ps1
├── specs/                        # 本目录
├── docs/                         # 工程规划 / 真机记录 / 能力清单 / ACL
├── build-profile.json5
├── hvigorfile.ts
├── oh-package.json5
└── README.md / README_zh.md
```

## 关键配置

| 文件 | 作用 |
|---|---|
| `AppScope/app.json5` | 应用身份、版本、图标 |
| `build-profile.json5` | 产品、SDK、签名配置、模块 |
| `electron/src/main/module.json5` | EntryAbility、权限、deviceTypes |
| `web_engine/src/main/module.json5` | HAR、权限、页面 |
| `src-main/main.js` | 主进程宿主与平台接入 |
| `patches/v0.12.1/` | 上游补丁 |
| `runtime-overlays/` | 运行时整文件替换 |

## 运行期目录

- 应用产物：`web_engine/src/main/resources/resfile/resources/app/`。
- 用户数据：Electron `userData`（会话、配置、日志）。
- 载荷：`pi-dist.tar.gz` + SHA-256 marker。
- 不入库：`oh_modules/`、`build/`、`.hvigor/`、`logs/`、`pi-dist*`、运行时 SO。
