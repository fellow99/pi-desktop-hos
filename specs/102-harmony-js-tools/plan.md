# 102 — 鸿蒙环境能力补齐：纯 JS 工具插件（harmony-js-tools）技术方案

> **Module:** harmony-js-tools ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-12
> **需求编号:** 102-harmony-js-tools ｜ **上游基线:** pi v1.1.0 · pi-web v0.11.1
> **规格依据:** [`spec.md`](./spec.md)（FR-tool-001 … FR-tool-027）
> **依据:** `docs/鸿蒙环境能力清单-v0.11.1.md`（#15/#18/#19/#21/#23/#32）
> **参考工程:** `dsh-desktop-hos/plugins/harmony-plugin-{exec,fs-search}`（**仓库外**）

## 1. 方案总览

```
extensions/
├── harmony-exec.js      # 顶替内建 bash：常驻 /system/bin/sh + 随机哨兵行协议
├── harmony-search.js    # 顶替内建 grep / find：纯 JS BFS 遍历
└── harmony-runtime.js   # （既有）/harmony-info + session_start 校验

数据流（bash）：
  模型 ──bash{command}──▶ 模块级常驻 sh（惰性 spawn，stdin 一条命令帧）
                                    │
        frame = printf '\nBEGIN <tok>\n' ; { cd <cwd>; <command>\n} 2>&1 ;
                rc=$? ; printf '\nEND <tok> <rc>\n'
                                    │
        stdout 累积 ──找到 'END <tok> '──▶ 解析 rc + 截取正文 ──▶ 返回 {content, details}
                                    │
        若 stdout 'end' 到达（shell 死了）→ 标记 dead → 下次调用重启
```

**为什么是「同名顶替」而不是新增工具**（FR-tool-001）：内建注册表先放内建工具、再让扩展工具
`set(name, tool)` 覆盖（U1），因此同名即替换；而 pi-web 的 `toolNames` 只接受**内建名**（U6），
新增名字会被 preset 过滤掉。同名顶替对模型、对 pi-web、对既有技能文档都是**零感知**的。

## 2. 关键决策

### D1 — 结束判定：只用 stdout 内容，绝不等事件（落实 FR-tool-004/005）

设备上 `exit`/`close` 永不送达（U9、报告 #15），所以**任何**以事件为前置的结束判定都会挂死
（这正是内建 `bash` 的病根：`waitForChildProcess()` 的三条决胜路径全部以事件为前置）。
本方案把结束判定完全建立在 **stdout 里出现结束哨兵行**上：

- 哨兵由 `crypto.randomBytes(8).toString('hex')` 生成，**每条命令一个新 token**，
  且**不写进被执行的命令体**（不会被回显、也不会被命令读到）；
- 结束行格式 `END <token> <rc>`，**必须同时匹配 token 与紧随其后的十进制 rc**；
  匹配不到就**不返回**（等超时），**绝不伪造 rc=0**（FR-tool-005）。

> 对照：参考工程 `harmony-plugin-exec` 用同样思路（随机 16 位 hex 哨兵 + BEGIN/END 标记 + 队列串行）；
> 本方案在其基础上把「每条命令隐式 `cd` 到会话目录」（FR-tool-009）与「默认超时」（FR-tool-007）
> 补上 —— 这两点是内建 `bash` 在设备上最致命的两个缺口。

### D2 — 命令帧（落实 FR-tool-006/009）

```
printf '\n__PI_B__ %s\n' '<tok>'
{ cd <cwd>
<command>
} 2>&1
__pi_rc=$?
printf '\n__PI_E__ %s %s\n' '<tok>' "$__pi_rc"
```

- `{ ... } 2>&1` 把**花括号组**的 stderr 并进 stdout → 单流、顺序可读（FR-tool-006）；
  帧**不在子 shell 里**，因此 shell 变量与 `cd` 在**同一条命令内**有效；
- 开头 `printf '\n…'` 前置换行，保证哨兵落在**行首**（否则上一命令无尾换行时会粘连）；
- `cd <cwd>` 是**每条命令都做**的隐式前缀（FR-tool-009）：cwd 确定 = `ctx.cwd`，
  不依赖跨命令持久化（与内建「每条命令新建 shell + 设 cwd」同语义）。
  `cwd` 用单引号包裹并转义 `'`。
- **风险已知并接受**：命令里顶层 `exit`/`exec` 会杀死常驻 shell（已实测，R2）。
  由 D4 的死亡检测 + 重启覆盖；**shell 状态（变量、cd）不跨重启保留**，写进文档。

### D3 — 串行与缓冲隔离（落实 FR-tool-010）

模块级 `queue` + `pumping` 守卫 → **同一时刻只有一条命令在飞**；每次派发**清空累积缓冲**，
只在缓冲里找**本条命令的 token**。因此：
- 上一个命令的残留输出不会串进下一个结果；
- 并发调用（模型并行发多个 `bash`）被排队，而不是交错写同一个 stdin。

### D4 — 死亡检测与重启（落实 FR-tool-008）

唯一存活信号 = `child.stdout.on('end')`（U9；`exit`/`close` 从不来）。
- `alive=false` 后，**下一次调用**先 `spawn` 新 shell 再执行该命令 —— **不重放上一次那条命令**
  （重放会重复执行副作用；代码实现与本文档一致：死亡的命令如实报 `died` 与「未取得退出码」）；
- `stdin.write` 抛错（EPIPE）也按死亡处理，并在 `proc.stdin` 上挂 `error` 监听（EPIPE 是**异步**事件，
  同步 try/catch 抓不到）；
- 重置时**整组杀**（`detached: true` + `process.kill(-pid)`，失败退化单进程），
  否则被超时/中止的命令的子进程会继续往旧 stdout 管道写 → 迟到输出污染后续命令结果；
- `reset()`：摘掉该 shell 的所有监听器（迟到事件按对象身份丢弃）+ `kill('SIGKILL')` + 丢弃引用 + `alive=false`
  （**不**等任何事件）。

### D5 — 超时（落实 FR-tool-007）

- `timeout` 参数语义与内建一致（**秒**）；未给出时用默认 `DEFAULT_TIMEOUT_MS = 120_000`；
  上限 `MAX_TIMEOUT_MS = 2_147_483_647`（与内建同）。
- 到点：先进入**排干（drain）**阶段（给已经跑起来的命令一个收尾窗口，比如 2 s，
  若期间哨兵到达就正常返回），仍不到 → **先取出已产出的正文**再 `reset()`，返回**超时错误**
  （`isError:true`，正文 = 已产出输出 + 「命令超时，常驻 shell 已重置」，**不得因重置而丢掉已产出的输出**）。
- 所有定时器 `.unref()`，避免拖住进程退出。

### D6 — 输出上限（落实 FR-tool-011）

`MAX_OUTPUT_BYTES = 262_144`（256 KiB）：**仍然把流读到哨兵**（否则会与下一条命令串流），
但只把前 256 KiB 交给模型，并在正文里显式写 `[输出已截断：共 N 字节，仅显示前 256 KiB]`。
超过 `onUpdate` 节流阈值时用 `onUpdate` 报进度（FR-tool-012，节流 500 ms）。

### D7 — 搜索：纯 JS BFS（落实 FR-tool-013…019）

两个工具共用同一套**迭代式（非递归）遍历**，避免深目录爆栈：

| 维度 | `grep` | `find` |
|---|---|---|
| 遍历 | BFS 队列，`fs.readdirSync(p,{withFileTypes:true})` | 同左（只用 `listDir`，不读文件） |
| 命中判定 | 逐行正则 / 字面量（`literal` 时用 `split`/`indexOf`） | 文件名对 glob 匹配 |
| 输出 | `<path>:<行号>: <行内容>`（`context` 时附前后行） | 文件路径（**目录不返回**） |
| 特有参数 | `glob`（文件名过滤）、`ignoreCase`、`literal`、`context`、`limit`（默认 100） | 无 |
| 共用参数 | `pattern`、`path`、`limit` | `pattern`、`path`、`limit`（默认 1000） |

**上限（FR-tool-016，任一触顶都在输出里写明）**：结果数 = `limit`（**目录内**与**单文件内**两种情形都要报，
单文件情形靠 `collectMatchesForFile` 返回的 `limited` 标志）；文件数 2000（`MAX_FILES`）；
单文件 512 KiB（`MAX_FILE_BYTES`，超限**跳过**并计数，FR-tool-018）；深度 8（`MAX_DEPTH`，
计**返回路径相对搜索根的段数**）；单行 300 字符（`MAX_LINE_CHARS`，截断加 `…` **并在汇总里报「N 行超过…已截断」**）。
汇总里的计数：`grep` 报 `N files read`（真的读过），`find` 报 `N files scanned`（遍历到）。

**跳过规则（FR-tool-017）**：目录名以 `.` 开头 或 属于 `{node_modules,.git}` → 跳过；
**但显式给出的根目录永远遍历**（`grep -r . --path .pi` 仍要看 `.pi`）。
读取失败（EACCES/EISDIR/超限）→ 计为 `filesSkipped`，**不整体失败**。
`stat`/`readdir` 抛错 → 跳过该条目（FR-tool-019）。**不跟随符号链接**（`Dirent.isSymbolicLink()` 跳过）。

**glob 语义**（`find` 的 `pattern` 与 `grep` 的 `glob`）与内建对齐：
`*`/`?` 只匹配**单个路径段内**，`**` 跨段；`{a,b}` 花括号枚举 → 交替；
`[0-9]` / `[!a-z]` 字符类转成正则类；**不含 `/` 的模式按 basename 在任意深度匹配**
（这样 `find("*.ts")` 才能像内建一样工作）；`find` 的匹配用**智能大小写**（全小写模式忽略大小写，与 fd 默认一致），
`grep` 的 `glob` 保持大小写敏感（与 rg 默认一致）；非法 glob **抛错**而不是静默不过滤。

### D8 — 生命周期（落实 FR-tool-020）

- **工厂内零长驻资源**（U8）：只 `registerTool`，不 spawn、不建定时器。
- 常驻 shell **惰性启动**（首次 `bash` 调用）；`session_shutdown` 钩子里**幂等** `reset()`
  （杀掉 shell、清定时器）。这样既满足「不在工厂起资源」，也不会在无会话路径上泄漏。
- 扩展**自包含**（FR-tool-021）：只用 `node:` 内建模块；`/system/bin/sh` 是常量，
  与 `config/settings.json` 的 `shellPath` 一致；**不 import 上游内部路径**。

### D9 — 与内建 `bash` 的行为差异（必须写进文档，FR-tool-024）

| 维度 | 内建 `bash` | 本扩展 `bash` |
|---|---|---|
| 结束判定 | 等 `exit`/`close` → **设备上永不返回** | stdout 哨兵行 → 正常返回 |
| 默认超时 | **无**（可无限等） | **120 s**，超时重置 shell 并报错 |
| stderr | 单独管道 | 合并进 stdout（`2>&1`，顺序可读） |
| 命令的 stdin | `ignore`（≈/dev/null） | **`</dev/null`**（同语义；保证读 stdin 的命令不会吃掉帧尾与 token） |
| 每条命令的 cwd | `cwd: sessionCwd`，不存在则失败 | 隐式 `cd <cwd>`（失败即 `cd failed: …` 并退出） |
| 跨命令状态 | 无（每次新 shell） | 无（常驻 shell 但每条命令都在子 shell 里执行，`cd`/变量不保留） |
| 重置语义 | `killProcessTree` | `detached: true` + **杀进程组** `kill(-pid)`（被中断命令的子进程不会污染后续结果） |
| PTY | 无 | 无 |
| 文件围栏 | **无**（子进程以应用 uid 运行，绕过审批） | **同样无** —— 信任模型**未改变**（见 spec C1） |
| 会话环境变量 | 注入 `PI_SESSION_ID`/`PI_SESSION_FILE`/`PI_PROVIDER`/`PI_MODEL` | **不注入**（常驻 shell 继承应用进程环境） |
| 输出上限 | 有（DEFAULT_MAX_BYTES/LINES） | 有（256 KiB + 显式截断标注，按 UTF-8 字节且不切多字节字符） |

### D10 — 文件布局与投放（沿用既有机制）

两个文件放 `extensions/` 根下（**单文件、无子目录**），理由：pi 的扩展发现会扫「一层子目录里的
`index.js`」，一旦引入 `extensions/lib/index.js` 就会被误当扩展加载；自包含单文件最省事，
代价是 `grep`/`find` 共用遍历器时需在同一文件内（本方案把它们放在**同一个文件**里，正好共用）。

投放链不变：`extensions/` →（`collect-pi.mjs`）→ `pi-dist/resources/pi-agent/extensions/`
→（`main.js` 解压引导，**禁用 symlink**）→ `<userData>/pi-agent/extensions/`。
**不需要**在 `settings.json` 里声明（pi 是目录扫描，`extensions/README.md` 已记录该结构性简化）。

## 3. 不做的设计（YAGNI，落实 FR-tool-025…027）

- **不做**文件操作工具：`bash` 修好后 `rm/mv/cp/mkdir` 已可用；单独做工具只是重复。
- **不做**命令围栏：会让合法命令 fail-closed，且需与审批流集成；登记为可选增强（缓解 #32）。
- **不做**进程内 JS：需额外资源上限/隔离设计；登记为可选增强（替代 #17）。
- **不新增**任何配置项或声明表（pi 的目录扫描已足够）；**不改**上游与补丁集。

## 4. 风险与回滚

| 风险 | 处置 |
|---|---|
| 顶替后行为异常影响主流程 | 回滚 = 删掉扩展文件 + 重跑 `collect-pi`/`collect-app`/build（无数据迁移） |
| 常驻 shell 泄漏僵尸 | 与既有 `bash` 同等（每次 spawn 1 个僵尸）；本方案**显著更少 spawn**（常驻复用），故净改善 |
| 命令里 `exit` 杀 shell | 已由重启覆盖（D4）；文档写明状态不跨重启保留 |
| 大目录遍历变慢 | 五重上限 + 跳过点目录；触顶在输出中可见 |
| 输出撑爆上下文 | 256 KiB 截断 + 显式标注 |

## 5. 验证方式

1. **静态**：`node --check` 语法检查两个扩展文件；源码审查确认无子进程（search）与只用 `node:` 模块。
2. **投放**：`collect-pi` → `collect-app` → `build-debug`；应用域读文件核对扩展已落地。
3. **端到端（真机）**：设 DeepSeek API KEY → 建工作区 → **真实对话**，让模型实际调用
   `bash` / `grep` / `find`，再从会话 JSONL 读回 `toolResult` 内容与 `durationMs`。
   - 覆盖：rc=0、rc≠0、stderr、`exit` 后重启、toybox `find`/`grep`、`grep` 的 `glob`/`context`、
     `find` 的 `**`、limit 触顶。
4. **不回归**：应用启动到「就绪」（hilog 六项）、会话可建、既有 `read`/`ls` 工具仍正常。
5. **代码评审** + 按 `git-commit` 规范提交。
