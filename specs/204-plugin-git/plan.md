# 204-plugin-git 技术方案（pi-desktop-hos）

> **Module:** 204-plugin-git ｜ **Last Updated:** 2026-10-18
> **对应规格:** [spec.md](./spec.md) ｜ **设计文档:** [`../../docs/204-插件-GIT.md`](../../docs/204-插件-GIT.md)
> 逐条回引 FR-204-xxx。

## 1. 总体思路

交付 pi 自动发现的目录扩展 `extensions/harmony-git/`：ESM 工厂注册 21+1 工具；isomorphic-git+diff 以 esbuild 单文件 bundle 供给（vendor/，入库）；仓库根 chroot 围栏；设备自管 git 原生凭据文件经 onAuth 注入。hos 为单一事实源，ark 经脚本同步。

## 2. 代码结构（FR-204-001/002/005/028）

```
extensions/harmony-git/
├── package.json      { "type": "module" }
├── index.js          ESM 工厂：require bundle → 注册 21+1 工具 → session_shutdown 清理
├── lib/
│   ├── runtime.js    装载 vendor bundle（断言导出/版本）
│   ├── fence.js      仓库根解析 + chroot 校验 + PI_HOS_ROOTS 提示
│   ├── fs-adapter.js isomorphic-git 的 node:fs/promises 适配器（全方法 async）
│   ├── auth.js       onAuth/onAuthFailure → git-credentials
│   ├── git-credentials.js  .git-credentials（git 原生格式，0600，原子写）
│   ├── diff.js       bundle createTwoFilesPatch 封装 + 二进制检测
│   ├── report.js     status 矩阵/提交摘要/冲突列表渲染
│   ├── url.js        host 规整、ssh→https 改写
│   └── tools/        21 个工具，一文件一工具
├── vendor/isomorphic-git.bundle.cjs   构建期产物（入库）
└── tests/*.test.mjs  node --test
```

## 3. 关键实现要点

### 3.1 依赖装载（FR-204-006/007/008）
- `lib/runtime.js`：`createRequire(import.meta.url)` → `require('../vendor/isomorphic-git.bundle.cjs')`（jiti 从扩展目录解析兄弟 CJS）。
- 断言：`typeof git.init/clone/statusMatrix === 'function'`、`git.http.request`、`git.createTwoFilesPatch`、`git.version()`。
- bundle 平铺导出（esbuild entry：`module.exports = git; .http/.createTwoFilesPatch/.structuredPatch`）。

### 3.2 fs 适配器（FR-204-010/011，复刻 dsh 真机发现①）
- `createRepositoryFs(root)`：返回 `{ promises: { readFile/writeFile/mkdir/rmdir/unlink/rename/symlink/readlink/stat/lstat/readdir/rm } }`，**全部 async**。
- 每个方法先 `resolveWithin(root, rel)`：`join(root,rel)`→`normalize`→前缀包含校验→越界抛 `FsError('FS_SANDBOX_DENIED' 风格)`；软链 realpath 后再校验。
- isomorphic-git `isPromiseFs()` 无参调 `fs.readFile()`：async 函数不能同步抛错，探测即得 promise → 判成 promise 方言。**这是硬契约，写在适配器头注。**

### 3.3 围栏（FR-204-009/012/013）
- `fence.js resolveRepoRoot(dir, ctx)`：`path.resolve(ctx.cwd, dir)` → 校验存在/非仓库给清晰错误。
- 对照 `process.env.PI_HOS_ROOTS`（JSON `[{id,path}]`），落在外给警告性提示文本（非阻断审批）。
- EPERM/EACCES 原样归因（能力清单 A.2 #6）。

### 3.4 凭据（FR-204-014..019）
- `git-credentials.js`：`gitCredentialsPath()` = `join(PI_CODING_AGENT_DIR, '.git-credentials')`；`readCredentials/parseLine/matchCredential/writeCredential/removeCredential`。
- 解析容忍空行/注释/坏行；匹配对齐 git credential-store；写入临时文件+rename 原子替换+chmod 0600。
- `auth.js makeAuth(url)`：`onAuth` → matchCredential → `{username,password}` 或 `{cancel:true}`；`onAuthFailure` 报「凭据被拒绝」+ 文件路径，重试≤1。
- `git_credentials` 工具：set/unset/list；list 脱敏（不回显密码）。

### 3.5 自建缺口（FR-204-021/022）
- `diff.js`：`statusMatrix` 清单 + `readBlob` 两侧字节 + `createTwoFilesPatch`；`stat` 模式；含 NUL 判二进制。
- `tools/show.js`：`readCommit/readTree/readBlob/readTag` 拼装。
- `tools/revert.js`：恰 1 父提交；枚举变更路径；先比对工作区 blob oid 与目标提交一致（fail-closed）→ 物化父内容 → add → commit。

### 3.6 工具注册（FR-204-003/004/020..027）
- 每工具：`pi.registerTool({name:'git_x', label, description, parameters:{type:'object',properties,required}, async execute(id,params,signal,onUpdate,ctx){...}})`。
- 错误：try/catch → `{content:[{type:'text',text:msg}], details:{}, isError:true}`；不伪造成功。
- 取消：透传 `signal` 给 isomorphic-git。
- 写类工具 `executionMode:'sequential'`；读类 `annotations:{readOnlyHint:true}`。

## 4. 装配（FR-204-028/029/030）
- hos：`collect-pi.mjs` 已 `cpSync(extensions → resources/pi-agent/extensions, recursive, dereference)`；运行期 `materializeBundledResources` 递归 copy。**不改脚本。**
- ark：`scripts/sync-git-extension.mjs` 幂等拷贝 hos `extensions/harmony-git/**` → `payload/extensions/harmony-git/**` + V2 头注；`assemble-payload.mjs`（APP_PAYLOAD_ENTRIES 含 extensions）与 `pi-web-launch.js#materializeAgentResources` 自动物化。**不改装配脚本。**

## 5. 验证（无真机）
1. 主机 `node --test`：chroot/凭据/url/diff/report/revert 纯逻辑。
2. jiti 加载冒烟：本机 Node 用 jiti 2.7.0 加载 index.js 工厂，mock pi 捕获 21+1 注册，临时仓库跑 init/add/commit/log/diff/本地 file 远端 clone/push。
3. bundle 版本断言 + `--verify`。
4. hos/ark hvigor HAP 编译。
