# overall-plan.md — pi-desktop-hos 整体技术方案

> 对应规格：[`overall-spec.md`](./overall-spec.md)（`FR-HOS-*`）。
> 技术事实以 `../docs/工程规划.md` 与源码为准；最后更新：2026-10-31。

---

## 1. 技术上下文

| 项 | 值 |
|---|---|
| 运行时 | Electron-on-HarmonyOS 37.2.3 |
| Node | 22.17.0 / ABI 138 |
| 渲染 | Chromium 138（包内） |
| 壳 | ArkTS + ArkUI（entry + web_engine HAR） |
| 构建 | Node 脚本 + hvigor + DevEco |
| 上游 | `pi` v1.2.0 / `pi-web` v0.12.1 |
| 补丁 | 2 条（`patches/v0.12.1/`） |

---

## 2. 宪法合规

| 原则 | 合规 | 说明 |
|---|---|---|
| 零上游改动 | ✅ | 补丁按 tag、幂等可逆 |
| 进程内宿主 | ✅ | Electron 主进程 require Next |
| 同源数据面 | ✅ | HTTP/SSE，无 IPC 数据 |
| 薄壳 | ✅ | 壳只做装配与平台能力 |
| 失败可见 | ✅ | 阶段文本/错误页/日志 |
| 单实例随机端口 | ✅ | EntryAbility 单实例 |
| 安全 | ✅ | 随机密码 + Cookie；无调试入口 |
| 版本 | ✅ | 0.12.1 / 1201 |

---

## 3. 五阶段流水线

```
1. collect-runtime
   ../harmonypc-electron/ohos_hap + v37 归档
   → electron/ web_engine/ SO / Chromium 资源
   → prune（删不用项） + overlay（回盖定制）

2. prepare-next
   Node 22.17 构建 pi-web
   → 原生件裁剪 + 预览密钥轮换

2'. smoke-node22
   → 服务启动 / SPA / API / SSE / AgentSession 门禁

3. collect-pi
   → pi-dist 组装（pi-web + @earendil-works/* + pi-agent 资源）
   → 品牌化（文案/图标）
   → tar.gz + SHA-256 marker

4. collect-app
   → src-main + config/ + extensions/ + skills/
   → resfile 投放

5. hvigor 构建 + 签名
   → HAP
   → 真机安装/验证
```

---

## 4. 启动与鉴权

- `src-main/main.js` 装配环境（HOME / PI_CODING_AGENT_DIR / TMPDIR / PI_OFFLINE / 证书 / NO_PROXY）。
- 进程内 `require` Next，绑定 `0.0.0.0` 随机端口。
- 生成 32 字节随机密码；派生 HMAC 会话 Cookie；同时注入 Basic 与 Cookie。
- 轮询 `/api/web-auth` 就绪；加载 `http://<ip>:<port>/`。
- 窗口：loading 页 → 同源加载；导航围栏；`window.open` 拦截；F11 全屏。

---

## 5. 能力与扩展

| 能力 | 实现 |
|---|---|
| bash | `extensions/harmony-exec.js`（常驻 mksh + 哨兵） |
| find/grep | `extensions/harmony-search.js`（纯 JS，零 fd/rg） |
| 工作区根 | `extensions/harmony-workspace-roots.js` + `PI_HOS_ROOTS` |
| Git | `extensions/harmony-git/`（isomorphic-git 1.44.2） |
| 目录选择器 | 补丁 0001 + ArkTS 桥 |
| 通知 | 系统设置关闭（如实） |
| 外链 | 外链中转页 + 系统浏览器 |
| PTY | 补丁 0001 显式 unsupported |

---

## 6. 跨切面

- **版本**：`011`；上游 tag + SHA；补丁按 tag。
- **品牌**：`013`；父工程物料；0 残留终检。
- **安全**：密码不入日志；生产无 `--inspect`；权限最小面。
- **证据**：真机记录、HAP 哈希、能力清单。
- **文档**：父/子分工；模块成对；源码即真理。

---

## 7. 测试

| 层 | 内容 |
|---|---|
| L0 | 类型/配置/补丁可逆 |
| L1 | 脚本单测（品牌/补丁/组装） |
| L2 | `smoke-node22` |
| L3 | HAP 安装/启动/首屏 |
| L4 | 真机：对话、工具、选择器、权限、外链、通知 |

判据：HTTP 200 / SSE / 会话 JSONL / 截图 / marker / 哈希；不以日志一行当成功。

---

## 8. 风险

| # | 风险 | 处置 |
|---|---|---|
| R1 | 运行时版本落后 | 固定 + 能力清单 |
| R2 | 无系统 git/fd/rg | 纯 JS 顶替 |
| R3 | 无 PTY | 显式 unsupported |
| R4 | 权限/ACL | 申请清单 + 真机复验 |
| R5 | 外链 SIGSEGV | 中转页 |
| R6 | 密码/凭据泄露 | 脱敏 + 不入库 |
| R7 | 物料缺失 | 构建硬失败 |
| R8 | 文档漂移 | 回写 + 证据 |

---

## 9. 交付顺序

1. 运行时收集 + 构建 pi-web。
2. 载荷组装 + 品牌化。
3. 壳/窗口/鉴权/能力桥。
4. 扩展/补丁。
5. 签名 + 真机。
6. 版本/品牌文档回写。
7. 评审 + 提交。
