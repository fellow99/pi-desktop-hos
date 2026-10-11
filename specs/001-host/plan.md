# 001 — Host 宿主（host）技术实现方案

> **Module:** host ｜ **Status:** Proposed ｜ **Last Updated:** 2026-10-11
> **上游基线:** pi v1.1.0（Branch_v1.1.0）· pi-web v0.11.1（Branch_v0.11.1）
> **对应规格:** [`./spec.md`](./spec.md)
> **规划依据:** `docs/工程规划.md` §4.2、§4.4、§4.5、§4.6、§4.9、§8.1

## 1. 实现落点

全部实现集中在 **`src-main/main.js`** 一个文件内（构建期由 `scripts/collect-app.mjs` 投放到
`web_engine/src/main/resources/resfile/resources/app/`）。不拆文件的原因：本模块是启动期的一次性
编排，拆成多文件只会在没有测试框架的情况下增加跨文件的隐式耦合；参考工程 `dsh-desktop-hos`
的 `main.js` 同样是单文件编排（51 KB），这是同型工程的既有选择。

唯一的独立文件是 `src-main/tar-extract.js`（纯解析器，可单测，属 004 模块）。

## 2. 启动时序

```
main.js 顶层
  ├─ 阶段 0  ensureSandboxEnv()        环境装配（先于任何 pi/pi-web import）
  ├─ 阶段 1  ensureAgentDirTree()      创建 pi-agent 目录树 + 预置 settings.json/mcp.json
  ├─ 阶段 2  ensurePiDistExtracted()   产物就位（SHA-256 marker 幂等）      [004 模块]
  ├─ 阶段 3  materializeShellAssets()  壳预置 extensions/ skills/ copy 物化 [004 模块]
  └─ app.whenReady()
        ├─ 阶段 4  resolveFreePort()        取空闲高位端口
        ├─ 阶段 5  resolveLanIp()           取非 internal IPv4（回退 127.0.0.1）
        ├─ 阶段 6  rotatePreviewSecrets()   预览密钥轮换（必须先于起服务）
        ├─ 阶段 7  startServer()            进程内启动 Next（候选 A / B）
        ├─ 阶段 8  waitForReady()           HTTP 轮询（30 s 上限）
        ├─ 阶段 9  createWindow()           建窗 + loading 页             [002 模块]
        ├─ 阶段 10 installBasicAuth()       请求出栈注入 Basic 凭据
        └─ 阶段 11 loadURL(lanIp)           加载真实地址                  [002 模块]
  before-quit → close()
```

**阶段 0 必须先于一切 import**（FR-host-001）：pi 在**模块加载时**就可能读取 agent 目录
（例如计算 `getBinDir()` 的 `TOOLS_DIR` 常量、`getAgentDir()` 的默认值）。若环境变量在
import 之后才设置，进程会拿着错误的路径一路走下去，且不会有任何报错。

因此 `main.js` 的实现必须回避顶层 ESM import 的静态提升问题：**用 `await import()` 动态
导入 pi / pi-web 侧模块**，或者把 `require` 延迟到环境装配之后。工程规约见 §5.1。

## 3. 各阶段实现要点

### 3.1 环境装配（对应 FR-host-001…007）

| 步骤 | 实现 | 需求 |
|---|---|---|
| 沙箱家目录 | `process.env.HOME = process.env.USERPROFILE = app.getPath('userData')` | FR-host-002 |
| 数据目录 | `process.env.PI_CODING_AGENT_DIR = join(userData, 'pi-agent')` | FR-host-003 |
| 临时目录 | 设 `TMPDIR`，并 `os.tmpdir = () => tmpDir`（**必须打补丁**） | FR-host-004 |
| 离线旗标 | `process.env.PI_OFFLINE = '1'` | FR-host-005 |
| 代理例外 | 追加 `NO_PROXY` / `no_proxy` | FR-host-006 |
| 目录创建 | `mkdirSync(..., { recursive: true })` 全部目录；任一失败即 fail-visible | FR-host-007 |

`os.tmpdir` 的补丁必须在**任何第三方模块首次调用它之前**完成。实现上放在文件最顶端、
在任何动态 import 之前执行。

> **可测性**：把环境装配抽成一个**纯函数** `buildSandboxEnv({ userData })` 返回一个
> `Record<string, string>`，副作用（真正写 `process.env`）由调用方施加。这样 §6 的
> host 侧测试可以断言映射表，而不需要真的启动 Electron。

### 3.2 目录树与预置配置（对应 FR-host-007）

首次启动创建：

```
<userData>/pi-agent/{extensions,skills,prompts,themes,agents,sessions,tmp,packages}
<userData>/pi-agent/settings.json   ← 仅当不存在时从 pi-dist/resources/pi-agent/settings.json 复制
<userData>/pi-agent/mcp.json        ← 同上
```

**「仅当不存在时复制」是刻意的**：这些文件一旦存在就属于用户，本工程不得覆盖。
这与 `extensions/`、`skills/` 的覆盖规则（extensions 以壳为准 / skills 以用户为准）
不同，理由见工程规划 §5.3 b) 与 004 模块的 plan。

> 目录树里刻意**没有** `trust.json`：它由 pi 自己管理，本工程不预写（预写等于替用户
> 做信任决定）。

### 3.3 端口分配（对应 FR-host-011）

```
async function resolveFreePort() {
  const srv = net.createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  await new Promise((r) => srv.close(r));
  return port;
}
```

选**高位**且不指定具体值，由 OS 分配。`--port 0` 不可用：pi-web 的 `bin/pi-web.js` 明确
记录「端口 0 会让 OS 选一个我们永远不知道的端口」并要求端口是已知值。

### 3.4 局域网 IP（对应 FR-host-011、spec §6 O3）

从 `os.networkInterfaces()` 取第一个 `family === 'IPv4' && !internal` 的地址。**回退顺序**：

1. 非 internal IPv4（正常路径）
2. `127.0.0.1`（无网卡时的回退；此时渲染层大概率无法加载，但至少地址形式正确，
   错误会以「加载失败」而不是「地址为空」暴露）

把选中的地址写进 `process.env.PI_WEB_HOSTNAME`（FR-host-013）并用于 `loadURL`。

### 3.5 预览密钥轮换（对应 FR-host-012）

`require('<pi-dist>/bin/rotate-preview-secrets.js')` 并调用其导出。**必须先于启动服务器**：
它重写 `.next` 里烘焙的 preview-mode 密钥；若在服务器已注册路由后才改，进程内已加载的
配置仍是旧值，轮换等于没做。

不得自行实现轮换算法 —— 那是上游的产物格式知识，抄一份就会在升级时静默失配。

### 3.6 服务器启动：候选 A（FR-host-010 / 014）

**候选 A 的具体做法**（Phase 0 的 P0-1 探针要验证的第一条路）：

```js
// 目标：拿到一个 startServer 之类的导出，自己给 hostname/port/dir。
const entry = require('<pi-dist>/node_modules/next/dist/server/lib/start-server.js');
await entry.startServer({
  dir: piDistDir,
  hostname: '0.0.0.0',
  port,
  isDev: false,
  allowRetry: false,
});
```

⚠️ **导出名与签名必须实测确认**（Next 版本间会变）。探针步骤：

1. `node -e "console.log(Object.keys(require('next/dist/server/lib/start-server.js')))"`
2. 检查 `next/dist/cli/next-start.js` 看 CLI 是怎么调它的（这是权威用法示例）
3. 在本工程里按该用法调用，观察宿主是否存活（不退出）

**退出防护**：无论走哪条路，都必须在启动前后安装守卫，避免上游内部的 `process.exit()`
带走整个应用（FR-host-014）：

```js
const realExit = process.exit;
let nextRequestedExit = false;
process.exit = (code) => {
  nextRequestedExit = true;
  log('WARN', `上游请求 process.exit(${code})，已拦截（宿主继续运行）`);
};
// 启动完成后按需恢复：若不恢复，其他模块的正常退出路径会被吞掉。
```

**是否恢复**是需要在探针里定的一件事：不恢复更安全（防再次退出），恢复更符合最小惊讶。
建议：**不恢复**，但把 `nextRequestedExit` 记录到诊断槽，让 003-lifecycle 在真正退出时
仍走自己的收尾路径（直接调 `realExit`）。

### 3.7 服务器启动：候选 B（兜底，需追加 FR）

```js
const child = spawn(process.execPath, [join(piDistDir, 'bin', 'pi-web.js'), '--port', String(port), '--no-open'], {
  cwd: piDistDir,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

采用候选 B 时的额外义务（spec §6 已写明）：① 追加 FR 记录该决定；② 更新工程规划 §11.1 R3；
③ 补齐僵尸清理与「exit 事件不可观测」下的就绪判定（仍然是 HTTP 轮询，不监听 stdout）。

`ELECTRON_RUN_AS_NODE=1` 不可省：`process.execPath` 在 Electron 里指向 Electron 二进制，
不加该变量会再起一个 Electron 实例而不是 Node。

### 3.8 就绪判定（FR-host-015、016）

```js
async function waitForReady(url, { timeoutMs = 30_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const res = await fetch(url, { redirect: 'manual' });
      // 401/403 也算「服务器已就绪」：它已经在处理请求，只是我们还没带凭据。
      if (res.status < 500) return { attempt };
    } catch { /* 未就绪，继续 */ }
    if (attempt % 20 === 1) log('INFO', `等待服务器就绪（第 ${attempt} 次）`);
    await sleep(intervalMs);
  }
  throw new Error(`服务器在 ${timeoutMs} ms 内未就绪`);
}
```

要点：**`< 500` 视为就绪**。pi-web 启用了密码时，不带凭据的探测会得到 401/403，这恰恰
证明服务器在工作 —— 若要求 200，就会把「服务器已就绪但需鉴权」误判为未就绪。

### 3.9 访问凭据（FR-host-020…023）

```js
const password = process.env.PI_DESKTOP_PASSWORD ?? randomBytes(32).toString('base64url');
process.env.PI_WEB_PASSWORD = password;   // 必须在服务器注册路由前设置
```

注入 Basic 凭据的位置是**渲染层 session 的请求出栈**（属 002 模块的实现）：

```js
win.webContents.session.webRequest.onBeforeSendHeaders({ urls: [`http://${lanIp}:${port}/*`] }, (details, cb) => {
  cb({ requestHeaders: { ...details.requestHeaders, Authorization: `Basic ${Buffer.from(`pi:${password}`).toString('base64')}` } });
});
```

**为什么用用户名 `pi`**：pi-web 的 `proxy.ts` 对 Basic 认证的解析约定用户名为 `pi`
（`README.md` 的 Remote Access 一节明确写「API clients may use Basic Auth with username `pi`」）。

**密码不得写盘**（FR-host-023）：不落 `settings.json`、不落 marker、不进日志。

### 3.10 fail-visible（FR-host-030…033）

统一诊断出口：

```js
function fail(stage, error) {
  const message = `[pi-desktop] 启动失败于阶段 ${stage}：${error?.message ?? error}`;
  console.error(message);
  globalThis[`__${stage}Error`] = message;   // __hostError / __extractError / __renderError
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(`Pi Desktop — 启动失败（${stage}）`);
    mainWindow.webContents.executeJavaScript(`window.__piDesktopFail && window.__piDesktopFail(${JSON.stringify(message)})`)
      .catch(() => {});
  }
}
```

标题与 loading 页**都要**出现说明（FR-host-031）。loading 页由 002 模块提供，暴露一个
`window.__piDesktopFail(text)` 供本模块调用 —— 这是两个模块之间唯一的前端契约。

## 4. 需求落实对照（反向闭合）

| 需求 | 落点 |
|---|---|
| FR-host-001 | §3.1 + §5.1（动态导入纪律） |
| FR-host-002…007 | §3.1 的映射表 |
| FR-host-010 | §3.6（候选 A）/ §3.7（候选 B） |
| FR-host-011 | §3.3 + §3.4 |
| FR-host-012 | §3.5 |
| FR-host-013 | §3.4 + §3.6 |
| FR-host-014 | §3.6 的 `process.exit` 守卫 |
| FR-host-015 | §3.8（明确不监听 stdout） |
| FR-host-016 | §3.8 的 `timeoutMs` |
| FR-host-020…023 | §3.9 |
| FR-host-030…033 | §3.10 |
| FR-host-040、041 | §5.4 |

## 5. 工程规约

### 5.1 导入纪律（FR-host-001 的实现保证）

- **顶层不允许出现 pi / pi-web 侧的静态 `import`。** 需要它们的地方一律用
  `await import(...)`，且必须在环境装配完成之后。
- Electron / Node 内置模块（`electron`、`node:path`、`node:fs`…）不受此约束。
- 产物解压（004）也遵守同一纪律：它在任何 pi 模块加载之前完成，因为 pi 会读 `PI_CODING_AGENT_DIR`。

### 5.2 凭据注入要两件都做（FR-host-022）

**为什么要派生 cookie 而不只注入 Basic（✅ 源码核实）**：`proxy.ts` 的鉴权分支是 —— `const authorization = isApiRequest ? request.headers.get("authorization") : null;`，即 Basic 头**只在 `/api/*`** 请求上被读取；页面导航（非 API）若没有有效会话 cookie，会被 302 重定向到 `/login`。因此只注入 Basic 会让用户**先看到登录页**，功能上"能用"但体验与产品定位不符。

正确的做法是两件都做：出栈注入 Basic（覆盖 API），再按上游算法派生会话 token 并写 cookie（覆盖页面导航）。派生必须与 `lib/web-auth.ts` 的 `createWebSessionToken` **逐位一致**：

```
payload   = v1.<Math.floor(Date.now()/1000) + 60*60*24*30>.<randomBytes(16).toString("hex")>
signature = HMAC-SHA256(key = PI_WEB_PASSWORD, data = "pi-web-session:" + payload).toString("hex")
token     = payload + "." + signature
cookie    = "pi_web_session=" + token        // 名字取自 PI_WEB_SESSION_COOKIE
```

⚠️ **这是唯一一处我们复刻上游算法的位置**，因此对上游升级敏感（工程规划 §11.1 R10）。复核方式：`diff` 本文件与 `pi-web/lib/web-auth.ts`，若签名前缀（`pi-web-session:`）、payload 形状或有效期常量（`PI_WEB_SESSION_MAX_AGE`）变了，本处必须同步。**不要**为了"更稳"而改成用户名口令式登录：那会引入一个用户可见的多余步骤，且与"自动注入凭据"的产品决策冲突。

### 5.3 日志纪律

- 统一前缀 `[pi-desktop]`，格式 `[pi-desktop] <LEVEL> <阶段> <消息>`。
- 级别：`INFO` / `WARN` / `FAIL`。
- **禁止输出**：密码、API Key、凭据内容、文件内容、会话内容。
- 真机取证：`hdc shell "hilog -x | grep pi-desktop"`（ArkTS 侧用同一 tag）。

### 5.4 关闭（FR-host-040、041）

```js
let closing = null;
function close() {
  closing ??= (async () => {
    try { await server?.close?.(); } catch (e) { log('WARN', `关闭服务器失败：${e?.message}`); }
    await new Promise((r) => setTimeout(r, 100));   // 让监听 FD 真正释放
  })();
  return closing;
}
app.on('before-quit', (event) => {
  if (closing) return;
  event.preventDefault();
  close().finally(() => app.exit(0));
});
```

幂等由 `closing ??=` 保证。**只关闭、不做清理性删除**：更新策略见工程规划 §8.3 的
SHA-256 marker 讨论。

## 6. 验证方式（host 侧，上真机之前）

| 层次 | 方式 | 覆盖的需求 |
|---|---|---|
| 静态 | `node --check src-main/main.js` | 语法 |
| 单元 | 环境映射表纯函数 `buildSandboxEnv()` 的断言（Node 内置 test runner） | FR-host-002…006 |
| 集成（**门禁**） | `scripts/smoke-node22.mjs`：用 Node 22.17 起服务器，断言 `GET /` 200、某 API 200、SSE 可连、`AgentSession` 可创建 | FR-host-010、013、015、016 |
| 真机 | Phase 0 的 P0-1 / P0-3 探针 + 用 grep pi-desktop 过滤 hilog（`hdc shell hilog -x`） | 全部 |

**host 侧门禁是硬性前置**：`smoke-node22.mjs` 不全绿就不允许把产物推到真机
（工程规划 §8.1 阶段 ②′）。理由是 Node 22.17 与上游声明的 22.19 之间存在真实未知，
在真机上排查这一步的代价远高于在 host 侧。

## 7. 已知限制与风险

| # | 限制 | 处置 |
|---|---|---|
| L1 | Next 的进程内入口不是公开 API，上游升级可能改变导出名 | Phase 0 定标后，在 `specs/README.md` 与工程规划 §11.1 R10 登记「需在每次上游升级时复核」。**不依赖未导出内部 API 的假设要写进注释。** |
| L2 | 进程内宿主崩溃 = 应用级崩溃（无隔离） | 接受。这是「避免子进程三个平台问题」的对价；003-lifecycle 负责兜底与诊断。 |
| L3 | 局域网暴露面（绑 `0.0.0.0`） | 随机强密码（FR-host-020）+ 随机端口；端口收敛评估见工程规划 §11.2 O4。 |
| L4 | `process.exit` 守卫可能吞掉其他模块的正当退出 | 记录 `nextRequestedExit` 到诊断槽；真实退出走 003-lifecycle 的 `realExit` 路径。 |

## 8. 参考

- 规格：[`./spec.md`](./spec.md)
- 规划：`docs/工程规划.md` §4.2、§4.4、§4.5、§4.6、§4.9、§8.1、§11.1
- 上游：`pi-web/bin/pi-web.js`、`pi-web/bin/rotate-preview-secrets.js`、
  `pi-web/bin/pi-web-options.js`、`pi-web/lib/request-security.ts`、`pi-web/proxy.ts`
- 同型工程对照：`dsh-desktop-hos/specs/001-host/plan.md`、`dsh-desktop-hos/src-main/main.js`
