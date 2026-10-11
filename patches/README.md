# patches/ — 上游补丁集（本版本为空）

**本目录当前没有任何补丁文件。** 这是工程规划 §7 得出的**结论**，不是尚未开始。

补丁按上下游版本分目录（`patches/<tag>/`），上游升级时**新建目录**、旧目录保留可追溯。
本工程的上游基线是：

| 上游 | 基线 | 本工程消费方式 |
|---|---|---|
| `pi` | tag `v1.1.0`（`Branch_v1.1.0`） | 源码引用：`npm install` 产出 `@earendil-works/*` 依赖树 |
| `pi-web` | tag `v0.11.1`（`Branch_v0.11.1`） | 源码引用：`npm ci` + `next build` → 收集 `.next` 产物 |

因此本版本的目录名应为 `patches/v0.11.1/`（按被 patch 的那一侧的上游 tag 命名）。它现在
是空的，所以**不建目录** —— 空目录在 git 里不存在，建了也会被丢弃，徒增误导。第一条
补丁出现时再建，并在本文件里登记。

## 为什么 0 条就够

每一条「可能需要补丁」的问题，在实测/源码核实后都被上游现成机制覆盖了：

| 潜在补丁 | 为什么不需要 |
|---|---|
| Node 版本门禁（上游声明 `>=22.19.0`，运行时是 Node 22.17.0） | 该门禁位于 `pi-web/bin/node-version.js`，只作用于 `bin/pi-web.js` 这个入口。本工程**不经该入口**（采用主进程进程内嵌入 Next 服务器，见工程规划 §4.2），门禁根本不触发。pi 侧对 Node 新特性普遍用运行时守卫（例：zstd 是 `typeof zlib.zstdCompressSync !== "function"` 判空后才用）。 |
| 插件/包安装闸门 | PL1「仅本地源」由三个上游现成机制覆盖：公开注入点 `DefaultPackageManager.resolve(onMissing)`、总闸 `PI_OFFLINE`（`installMissing()` 首行短路）、本地路径源走 `resolveLocalExtensionSource()` 完全不碰 npm/git。见 §5.1、§5.2。 |
| `node:sqlite` 不可用 | pi 的 SQLite 后端在 `packages/durable`，本工程不消费；pi-web 的会话存储是 JSONL 文件。 |
| zstd / 其它新 Node API | 上游有运行守卫（同上）。 |
| 原生模块（PTY / sharp / koffi） | 本工程**不随包分发任何原生 `.node`**；终端面板降级（§9.2、§9.3）。 |
| 网络绑定 / Host-Origin 头改写 | pi-web 的 `lib/request-security.ts#isApiRequestHostAllowed()` 在 `isIP(hostname)` 为真时直接放行，局域网 IP 字面量天然通过 Host 白名单；同源请求的 `Origin` 与 `Host` 也一致。**因此本工程比参考工程 `dsh-desktop-hos` 少一整套补丁。** |
| symlink / hardlink / chmod 回退 | pi 与 pi-web 的写入路径未依赖它们。**⬜ 若真机实测命中，再按下面的规则补一条回退补丁**，并同步文档 §7 与 §11.2 的开放问题。 |

`pi` 与 `pi-web` 均以 tag + 分支固定，本工程所有「上游机制」结论都在 `docs/工程规划.md`
里**带文件路径**记录。上游升级时逐条复核那些路径，而不是盲目重跑构建。

## 新增补丁时必须遵守的规则

沿用参考工程 `dsh-desktop-hos` 与 `oc-desktop-hos` 的补丁纪律（工程规划 §2.4c、§7）：

1. **幂等**：应用前先 `git apply --reverse --check <patch>`，成功即视为已应用 → 跳过。
2. **冲突即终止**：绝不 `--3way` 强行合并，绝不覆盖上游 checkout 里的用户改动。
3. **不带镜像噪声**：`package-lock.json` 等由 `npm install` 重新生成，不进补丁。
4. **按上游 tag 组织**：`patches/<tag>/`；上游升级时新建目录，旧目录保留可追溯。
5. **不得落在既有补丁的连续上下文区间**（`git apply` 默认前后各 3 行）—— 新补丁一律
   追加到列表末尾，追加前对**每一个**既有补丁跑一遍 `--reverse --check`。
6. **可往返**：正向应用 → 反向应用后受影响文件的 SHA-256 必须完全还原。
7. **只在独立的 detached worktree 里生成与校验**，不在工作树上直接 diff。
8. **登记三要素**：每条补丁必须写明「触发条件 / 实施时机 / 替代方案」，并占用全局
   唯一编号（编号只增不改、不复用）。

## 构建脚本如何消费本目录

`scripts/` 下**没有** `build-pi-web.mjs` 这类"打补丁 + 构建"脚本，因为补丁集为空 ——
`scripts/prepare-next.mjs` 直接 `npm ci` + `next build` + 裁剪。**第一条补丁出现时**，
需要在 `prepare-next.mjs` 里加一个补丁应用阶段（照 `dsh-desktop-hos/scripts/build-dsh.mjs`
的幂等循环写），并同步本文件与工程规划 §7 的表格。

## 与工程规划的对应

- 补丁集为空的完整理由（逐条登记）：`docs/工程规划.md` §7
- 补丁纪律（上下文区间、往返校验）：§2.4c、§7
- 上游基线锚定与升级复核责任：§11.3
