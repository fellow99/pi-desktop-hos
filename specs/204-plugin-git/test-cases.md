# 204-plugin-git 测试用例（pi-desktop-hos）

> **Module:** 204-plugin-git ｜ **Last Updated:** 2026-10-18
> **对应规格:** [spec.md](./spec.md)（FR-204-xxx）｜ **对应方案:** [plan.md](./plan.md)
> **脱敏声明：** 仓库地址/账号/口令由需求方线下提供，不写入本文件、不进对话、不进日志。占位符 `<host>`、`<user>`、`<pass>`、`<repo>.git`。

## 1. 主机层（本机 Node，无设备）

| 编号 | 用例 | 步骤 | 预期 | 覆盖 |
|---|---|---|---|---|
| TC-H01 | 凭据文件解析 | 写入含空行/注释/坏行/百分号编码行 | 正确解析、容忍坏行不抛错 | FR-204-015 |
| TC-H02 | 凭据匹配 | 协议/host/路径前缀/后者覆盖 | 对齐 git credential-store | FR-204-015 |
| TC-H03 | 凭据写入/删除 | 原子写保留其余行、0600、删空删文件 | 通过 | FR-204-016 |
| TC-H04 | chroot 校验 | `..` 逃逸/绝对路径/根外软链 | 全部拒绝 | FR-204-010 |
| TC-H05 | fs 方言 | 适配器每方法 `constructor.name === 'AsyncFunction'`；复刻 isPromiseFs 探测 | 判为 promise 方言 | FR-204-011 |
| TC-H06 | url 规整 | host 大写化/非字母数字→_；ssh→https | 通过 | FR-204-019 |
| TC-H07 | diff 渲染 | unified diff + stat + 二进制标记 | 含 `---/+++ /@@`；二进制如实标记 | FR-204-021 |
| TC-H08 | revert 冲突 | 构造工作区分叉 | fail-closed 拒绝并列出冲突路径 | FR-204-022 |
| TC-H09 | status 分组 | staged/modified/deleted/untracked/conflicted | 分组正确 | FR-204-020 |

## 2. 加载冒烟（本机 jiti，无设备）

| 编号 | 用例 | 步骤 | 预期 | 覆盖 |
|---|---|---|---|---|
| TC-L01 | 工厂加载注册 | jiti 2.7.0 `jiti.import(index.js)`，mock pi 捕获注册 | 捕获 22 个工具（21 git_* + git_credentials） | FR-204-001/002/020 |
| TC-L02 | 本地仓库链 | 临时目录 init→config→add→commit→log→show→status→diff | 全部成功 | FR-204-020/021 |
| TC-L03 | 分支/合并/标签/重置 | branch/checkout/merge/stash/tag/reset/cherry-pick/revert | 成功；revert 互为逆 | FR-204-020/022 |
| TC-L04 | 本地 file 远端 | 本地裸仓库作 remote：clone/fetch/pull/push | 全链成功 | FR-204-020 |
| TC-L05 | 非仓库报错 | 对非仓库目录调 git_status | 明确报「不是 git 仓库」 | FR-204-027 |
| TC-L06 | rebase 不支持 | 模型发起 rebase | 明确报「本平台不支持」 | FR-204-025 |
| TC-L07 | diff ref 误用 | 非 refs 模式传 ref | 明确报错而非忽略 | FR-204-021 |
| TC-L08 | 凭据 list 脱敏 | git_credentials list | 只回显协议/host/用户名，无密码 | FR-204-017 |

## 3. 构建期

| 编号 | 用例 | 步骤 | 预期 | 覆盖 |
|---|---|---|---|---|
| TC-B01 | bundle 校验 | `node scripts/build-git-vendor.mjs --verify` | 版本 1.44.2 + 入口存在 | FR-204-007 |
| TC-B02 | hos 装配 | `collect-pi` 相关 dry/组装 | extensions/harmony-git + vendor 入 pi-dist | FR-204-028 |
| TC-B03 | ark 装配 | `assemble-payload.mjs` dry/apply | payload extensions 含 harmony-git + vendor 入 tar | FR-204-029 |
| TC-B04 | HAP 编译 | hos/ark hvigor assembleHap | 编译通过 | — |

## 4. 真机回归（无真机，留待）

| 编号 | 用例 | 步骤 | 预期 | 覆盖 |
|---|---|---|---|---|
| TC-D01 | 扩展加载 | 应用启动，对话列工具 | 21+1 可用，无加载报错 | AC-1 |
| TC-D02 | 无账号公开仓库 | clone/status/log/diff/show/add/commit/branch/checkout/merge/stash/tag/reset/cherry-pick/revert/config | 全部成功 | AC-2 |
| TC-D03 | 凭据 set/list | git_credentials set→list | 文件 0600，list 脱敏 | AC-4 |
| TC-D04 | 带账号仓库 | listServerRefs/clone/fetch/pull/commit+push（测试分支） | 全成功，凭据经 onAuth | AC-3 |
| TC-D05 | 缺凭据报错 | 清凭据后 clone 带账号仓库 | 点名文件路径+占位行，非裸 401 | AC-5 |
| TC-D06 | 凭据不泄露 | 检索对话/details/hilog | 无明文密码 | AC-6 |
| TC-D07 | revert 分叉 | 构造分叉 | fail-closed 列冲突路径 | AC-8 |
| TC-D08 | 越界提示 | dir 指向 roots 外 | 清晰错误，不假装审批 | FR-204-012 |
| TC-D09 | OS 未授权 | 用户目录未授权 | EPERM/EACCES 归因 + 重启提示 | FR-204-013 |
| TC-D10 | 回归 | 既有 exec/search/runtime/roots 扩展 | 功能不受影响 | AC-10 |

## 5. 结果记录

| 编号 | 结果 | 证据 | 备注 |
|---|---|---|---|
| （实施时填） | | | |
