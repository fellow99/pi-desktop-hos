# overall-data-model.md — pi-desktop-hos 数据模型

> 本文件记录本工程的运行期数据实体、目录布局、状态机与配置契约。
> 事实以 `src-main/main.js`、`AppScope/app.json5`、`config/`、`../docs/工程规划.md` 为准。
> 最后更新：2026-10-31。

---

## 1. 数据实体

| 实体 | 说明 | 关键属性 / 落点 |
|---|---|---|
| 应用身份 | 包名/显示名/版本 | `AppScope/app.json5`：`org.fellow99.pi.PiDesktop`、`0.12.1`、`1201` |
| 宿主环境 | 进程环境 | `HOME`、`PI_CODING_AGENT_DIR`、`TMPDIR`、`PI_OFFLINE`、`PI_WEB_*`、`NO_PROXY` |
| 鉴权凭据 | 随机密码 / 会话 token | 启动时生成；不入日志；Cookie 注入 |
| 载荷 | pi-dist | `pi-dist.tar.gz` + `pi-dist.version`（SHA-256） |
| 配置模板 | settings / mcp / trust | `config/settings.json`、`config/mcp.json` |
| 扩展 | 纯 JS 工具 | `extensions/`（exec/search/runtime/workspace-roots/git） |
| 技能 | runtime capabilities | `skills/harmony-runtime-capabilities/` |
| 会话 | JSONL | `userData` 下 agent 目录的 `sessions/` |
| 日志 | 运行日志 | `userData/logs/`（或平台日志） |
| 窗口状态 | 尺寸/位置 | `window-state.json`（Electron userData） |
| 补丁 | 上游修改 | `patches/v0.12.1/`（2 条） |

---

## 2. 目录布局

```
<userData>/
├── pi-dist/                 # 解压后的 pi-web 产物
│   ├── .next/
│   ├── node_modules/
│   └── ...
├── pi-agent/                # agent 数据（PI_CODING_AGENT_DIR）
│   ├── sessions/*.jsonl
│   ├── settings.json
│   ├── mcp.json
│   ├── extensions/
│   └── skills/
├── logs/
└── window-state.json
```

- 首次启动：解压 `pi-dist.tar.gz` 到 `pi-dist/`；写 `pi-dist.version` marker。
- 二次启动：比较 marker 的 SHA-256；一致则跳过解压。
- 配置：`config/` 模板复制到 agent 目录；不覆盖既有文件。

---

## 3. 启动状态机

```
Idle
 → PreparingRuntime
 → ExtractingPayload
 → StartingServer
 → WaitingReady
 → CreatingWindow
 → Ready
 → (Failed)
```

- 每个阶段必须有可读文本/日志。
- `Failed` 展示错误页 + 日志尾；不自动假装成功。
- 退出：`Stopping → Closed`；超时强退。

---

## 4. 鉴权状态

| 状态 | 说明 | 迁移 |
|---|---|---|
| NoServer | 服务未起 | → ServerStarted |
| ServerStarted | 端口/密码已生成 | → CookieReady |
| CookieReady | HMAC token 已派生 | → Injected |
| Injected | Basic/Cookie 已注入 | → Ready |
| Ready | 首屏可访问 | — |
| Failed | 任一阶段失败 | 错误页 |

---

## 5. 配置契约

### 5.1 `config/settings.json`

| 键 | 值 | 说明 |
|---|---|---|
| `shellPath` | `/system/bin/sh` | 鸿蒙 shell |
| `defaultTools` | `read,write,edit,ls,find,grep,bash` | 默认工具 |
| `defaultProjectTrust` | `ask` | 信任门禁默认 |

### 5.2 `config/mcp.json`

- 默认 `{ "mcpServers": {} }`；用户可添加 HTTP/SSE 服务器。

### 5.3 环境变量

| 变量 | 作用 |
|---|---|
| `PI_CODING_AGENT_DIR` | agent 数据目录 |
| `PI_WEB_PASSWORD` | 随机密码（不落日志） |
| `PI_WEB_SKIP_VERSION_CHECK` | 禁用上游版本检查 |
| `PI_WEB_APP_NAME` | `Pi Desktop` |
| `PI_OFFLINE` | 离线模式（按配置） |
| `PI_HOS_ROOTS` | 工作区根清单 |

---

## 6. 权限数据模型

- 声明面：`web_engine/src/main/module.json5` + `electron/src/main/module.json5`。
- 授权面：系统设置/运行时弹窗；ACL 按包名申请并写入发布 Profile。
- 能力桥：`perm.check` / `perm.request` / `perm.openAppInfo`；未授权返回结构化状态。
- 纪律：声明面 ≠ 授权面；每个权限必须有调用点，否则移除。

---

## 7. 载荷体积与裁剪

- `pi-dist.tar.gz` 包含 pi-web 生产产物 + 上游依赖 + agent 资源。
- 裁剪：平台不用的原生件、测试/文档、非目标架构。
- 体积账：真机记录中保留 HAP 大小与解压后大小。
- 裁剪只删不用项，先删后验；不改变上游行为。
