# 103 — 品牌化任务拆解（tasks）

> **Module:** branding ｜ **Status:** Done（已交付；含代码评审轮）｜ **Last Updated:** 2026-10-12
> **需求编号:** 103-branding ｜ **规格:** [`spec.md`](./spec.md) ｜ **方案:** [`plan.md`](./plan.md)
> **日志目录:** `logs/20261012-3/`（当天序号 3）

## 依赖关系

```
T01(规格) ─ T02(brand-assets) ─┬─ T03(接线 collect-runtime/collect-pi)
                               ├─ T04(src-main 运行时开关 + 首屏标记)
                               └─ T05(图标生成物入库)
                                        │
                    T09(评审/提交) ─ T08(真机验证) ─ T07(构建) ─ T06(文档同步)
```

## 任务清单

### T01 — 规格四件套
| 项 | 内容 |
|---|---|
| 动作 | 写 `spec.md`（15 条 FR + 13 条 AC）/ `plan.md`（D1–D7）/ `tasks.md` / `test-cases.md` |
| 产出 | `specs/103-branding/` |

### T02 — 实现 `scripts/brand-assets.mjs`
| 项 | 内容 |
|---|---|
| 回引 | FR-brand-007…011、FR-brand-015 |
| 动作 | ① 物料解析与校验（`--assets` > `$PI_ASSETS_DIR` > `../assets`）+ `ffmpeg` 可用性检查（缺失即失败）；② `applyRepoBranding()`：AppScope 4 个 1024² **不透明**图标 + `window_icon` 200² 透明 + overlay `electron_white.png`；③ `applyWebBranding(piDistDir)`：`public/icons/{logo.svg,icon-192,apple-touch-icon,icon-512}` + favicon 路由体 + 文案替换与后置断言；④ CLI 入口 |
| 完成判据 | 幂等（连跑两次不产生 diff）；物料缺失/尺寸不符/透明度过高 → 非零退出 |

### T03 — 接线流水线
| 项 | 内容 |
|---|---|
| 回引 | FR-brand-012、plan D6 |
| 动作 | `collect-runtime.mjs` 阶段 0.5 调 `applyRepoBranding()`；`collect-pi.mjs` 在 pi-dist 组装后调两个函数并打印结果 |
| 完成判据 | 两脚本语法通过；`collect-runtime --verify-only` 阶段 7 守卫全绿（含 overlay md5） |

### T04 — 壳侧运行时开关与首屏标记
| 项 | 内容 |
|---|---|
| 回引 | FR-brand-001、FR-brand-002、FR-brand-006 |
| 动作 | `src-main/main.js`：注入 `PI_WEB_SKIP_VERSION_CHECK=1`、`PI_WEB_APP_NAME=Pi Desktop`（含日志）；`UI_HTML_MARKERS` 改为 `['Pi Desktop', 'Pi Web']` 并更新告警文案 |
| 完成判据 | 语法通过；真机 `/api/app-update` 返回 `updateAvailable:false`；首屏标记日志命中 `Pi Desktop` |

### T05 — 图标生成物入库
| 项 | 内容 |
|---|---|
| 回引 | AC-05、AC-06、FR-brand-011 |
| 动作 | 运行品牌化 → 提交 `AppScope/resources/base/media/*.png` 与 `runtime-overlays/.../electron_white.png` |
| 完成判据 | 四个应用级图标 1024²/无 alpha；md5 ≠ 旧占位图 `09b57e9f…` |

### T06 — 文档同步
| 项 | 内容 |
|---|---|
| 回引 | FR-brand-015 |
| 动作 | ① `docs/media-placeholder-icons.md` → 「图标物料与生成规则」；② 能力清单 §B #7 关闭 + 追加修订节 REV-2（品牌化）；③ README 流水线补步骤；④ 工程规划附录 C 新条目；⑤ `docs/真机验证记录.md` 本轮 |
| 完成判据 | 无残留「占位图/不可上架（图标）」矛盾表述 |

### T07 — 构建
| 项 | 内容 |
|---|---|
| 动作 | `collect-runtime` → `collect-pi` → `collect-app` → `build-debug` |
| 完成判据 | 四阶段全绿；`pack.info` 仍 `0.11.1 / 1101` |

### T08 — 真机部署与验证
| 项 | 内容 |
|---|---|
| 回引 | AC-01…AC-06、AC-08、AC-09 |
| 动作 | 解包 HAP 核对图标字节；卸载/安装/启动；设 KEY + 建工作区；应用域读 DOM/标题/`/api/app-update`/`/icons/logo.svg`；一轮真实对话确认不回归；负向用例（物料改名→失败） |
| 产出 | `logs/20261012-3/T2x-*.txt` |

### T09 — 代码评审与提交
| 项 | 内容 |
|---|---|
| 回引 | AC-12、AC-13 |
| 动作 | `requesting-code-review` 派发 → `receiving-code-review` 处置 → `REVIEW_REPORT.md`；按 `git-commit` 规范提交 |
| 完成判据 | 无未决 Critical/Important；提交前缀合规 |

## 里程碑

| 里程碑 | 含任务 | 判定 |
|---|---|---|
| M1 品牌化可用 | T01–T05 | 品牌化脚本幂等且断言全过，生成物入库 |
| M2 随包可用 | T06–T07 | 构建全绿，HAP 内图标为新物料 |
| M3 真机可用 | T08 | DOM 无 `Pi Web`、版本仍在、无更新链接、Logo 为物料、不回归 |
| M4 交付 | T09 | 评审关闭 + 提交合规 |

## 执行记录（收口）

| 任务 | 状态 | 证据 |
|---|---|---|
| T01 规格四件套 | ✅ | 本目录 4 份文档 |
| T02 `scripts/brand-assets.mjs` | ✅ | 源码 + `logs/20261012-3/T10-brand.txt`、`T18-brand-fix.txt`（幂等）、`T24-negative.txt`（负向） |
| T03 接线流水线 | ✅ | `collect-runtime` 阶段 0.5 + `collect-pi` 步骤 2.5；`T12-collect-runtime.log`（阶段 7 全绿）、`T19-build.log` |
| T04 壳侧运行时开关与首屏标记 | ✅ | `src-main/main.js`；`T16-hilog.txt`（`PI_WEB_SKIP_VERSION_CHECK = 1`、`UI 标记命中：Pi Desktop`）、`T23-branding-probe.txt`（`updateAvailable:false`） |
| T05 图标生成物入库 | ✅ | `AppScope/.../*.png`、`runtime-overlays/.../electron_white.png`；`T14-hap-icons.txt` |
| T06 文档同步 | ✅ | `docs/media-placeholder-icons.md`、能力清单 §B#7 + **REV-2**、`README.md`、`docs/工程规划.md`（G2 + v1.5）、`docs/真机验证记录.md` 轮次 4、`specs/README.md` |
| T07 构建 | ✅ | `T20-build-hap.log`（`BUILD SUCCESSFUL in 31 s 39 ms`，`0.11.1 / 1101`） |
| T08 真机部署与验证 | ✅ | `T15/T21-deploy.txt`、`T22-setup.txt`、`T23-branding-probe.txt`、`T25-e2e-smoke.*`、`T26-scope.txt` |
| T09 代码评审与提交 | ✅ | `logs/20261012-3/REVIEW_REPORT.md` + 按 `git-commit` 规范提交 |

**评审轮额外产出**：新增 `bin/` 到文案替换范围（CLI 也属交付产物）、修掉 ffmpeg 对无扩展名目标落成 JPEG 的缺陷、
把「真实不透明」判定从 stdout 管道改为临时文件（消除偶发失败）。
