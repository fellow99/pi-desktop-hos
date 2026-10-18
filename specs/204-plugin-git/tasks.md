# 204-plugin-git 任务清单（pi-desktop-hos）

> **Module:** 204-plugin-git ｜ **Last Updated:** 2026-10-18
> **对应规格:** [spec.md](./spec.md) ｜ **对应方案:** [plan.md](./plan.md)
> **日志目录:** `logs/20261018-1/`

## 1. 规格与文档

| ID | 任务 | 落点 | 回引 | 状态 |
|---|---|---|---|---|
| T01 | 设计文档 | `docs/204-插件-GIT.md`（hos + ark） | — | ✅ 已批准（c86ed55 / c18c415） |
| T02 | 功能规格 | `specs/204-plugin-git/spec.md` | FR-204-001…030 | ⬜ |
| T03 | 技术方案 | `specs/204-plugin-git/plan.md` | 逐条回引 FR | ⬜ |
| T04 | 任务清单 | 本文件 | — | ⬜ |
| T05 | 测试用例 | `specs/204-plugin-git/test-cases.md` | 覆盖全部 FR | ⬜ |

## 2. 依赖 bundle

| ID | 任务 | 落点 | 依赖 | 回引 | 状态 |
|---|---|---|---|---|---|
| T10 | bundle 构建脚本（修复 npm spawn EINVAL + --external: + esbuild 0.28.2） | `scripts/build-git-vendor.mjs` | — | FR-204-006/007 | ✅ |
| T11 | 产出并入库 bundle（iso-git 1.44.2 + diff 9.0.0） | `extensions/harmony-git/vendor/isomorphic-git.bundle.cjs` | T10 | FR-204-006/008 | ✅（915056 B，自检通过） |
| T12 | `--verify` 离线校验 | `scripts/build-git-vendor.mjs --verify` | T11 | FR-204-007 | ⬜ |

## 3. 运行时模块

| ID | 任务 | 落点 | 依赖 | 回引 | 状态 |
|---|---|---|---|---|---|
| T20 | runtime.js（装载 bundle + 断言） | `lib/runtime.js` | T11 | FR-204-008 | ⬜ |
| T21 | fence.js（仓库根解析 + chroot + roots 提示） | `lib/fence.js` | — | FR-204-009/012/013 | ⬜ |
| T22 | fs-adapter.js（全 async + chroot） | `lib/fs-adapter.js` | T21 | FR-204-010/011 | ⬜ |
| T23 | git-credentials.js（git 原生凭据文件） | `lib/git-credentials.js` | — | FR-204-015/016 | ⬜ |
| T24 | auth.js（onAuth/onAuthFailure） | `lib/auth.js` | T23 | FR-204-014/018 | ⬜ |
| T25 | url.js（host 规整 + ssh→https） | `lib/url.js` | — | FR-204-019 | ⬜ |
| T26 | diff.js（createTwoFilesPatch + 二进制） | `lib/diff.js` | T20 | FR-204-021 | ⬜ |
| T27 | report.js（渲染） | `lib/report.js` | — | FR-204-004 | ⬜ |

## 4. 工具（21 + 1）

| ID | 任务 | 落点 | 依赖 | 回引 | 状态 |
|---|---|---|---|---|---|
| T30 | 本地只读：init/status/log/show/branch/remote(列)/config(读) | `lib/tools/{init,status,log,show,branch,remote,config}.js` | T20-27 | FR-204-020 | ⬜ |
| T31 | 本地写：add/commit/checkout/reset/merge/cherry-pick/revert/stash/tag | `lib/tools/{add,commit,checkout,reset,merge,cherry-pick,revert,stash,tag}.js` | T20-27 | FR-204-020/022/023/026/027 | ⬜ |
| T32 | diff | `lib/tools/diff.js` | T26 | FR-204-021 | ⬜ |
| T33 | 网络：clone/fetch/pull/push + remote(增删/探测) | `lib/tools/{clone,fetch,pull,push,remote}.js` | T20-27 | FR-204-014/024 | ⬜ |
| T34 | git_credentials | `lib/tools/credentials.js` | T23 | FR-204-017 | ⬜ |
| T35 | rebase 明确不支持 | （模型发起时） | — | FR-204-025 | ⬜ |
| T36 | index.js 工厂注册 21+1 + session_shutdown 清理 | `index.js`、`package.json` | T30-34 | FR-204-001/002 | ⬜ |

## 5. 测试与验证

| ID | 任务 | 落点 | 依赖 | 回引 | 状态 |
|---|---|---|---|---|---|
| T40 | 纯逻辑单测 | `tests/*.test.mjs` | T20-27 | AC-4 | ⬜ |
| T41 | jiti 加载冒烟（注册数 + 临时仓库操作 + 本地 file 远端） | scratch 脚本 | T36 | AC-1/AC-2 | ⬜ |
| T42 | ark 同步脚本 + 拷贝 | `pi-desktop-ark/scripts/sync-git-extension.mjs` + `payload/extensions/harmony-git/` | T36 | FR-204-029 | ⬜ |
| T43 | hos/ark hvigor HAP 编译 | — | T41 | 编译通过 | ⬜ |
| T44 | 代码评审（requesting + receiving） | `logs/20261018-1/REVIEW_REPORT.md` | T41 | Critical/Important 清零 | ⬜ |
| T45 | 真机回归（无真机，留待） | test-cases 真机段 | — | AC-3/AC-5/AC-7/AC-8 | ⬜ 待真机 |
