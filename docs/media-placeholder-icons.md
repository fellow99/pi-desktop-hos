# 媒体资源（图标）说明与生成规则

> 为什么这份说明**不在** `AppScope/resources/` 里：鸿蒙资源编译器要求资源目录内的文件名匹配
> `[a-zA-Z0-9_]`，中文文件名会让 `CompileResource` 直接失败：
>
> ```
> Error Code: 11211116  Resource Pack Error
> Invalid resource name 'README-媒体资源'. It should match the pattern [a-zA-Z0-9_].
> ```
>
> 本文件原先放在 `AppScope/resources/base/media/`，实测触发上述错误（构建在第 26 s 失败）。
> 因此移到 `docs/`。**今后不要在 `resources/` 下放任何非资源文件，尤其是非 ASCII 文件名的文件。**
>
> 文件名本身仍叫 `media-placeholder-icons.md`（历史名，改名的收益不抵引用漂移的风险）；
> **内容已不再是「占位图」说明** —— 图标自需求 103 起由物料生成。

## 现状（需求 103 之后）

`AppScope/resources/base/media/` 下的 5 个 PNG 与状态栏字形**不再是参考工程拷贝来的占位图**，
而是**构建期由父工程物料生成**（`scripts/brand-assets.mjs`）：

| 文件 | 尺寸 / 通道 | 生成来源 | 被谁引用 |
|---|---|---|---|
| `app_icon.png` | 1024×1024，**无 alpha** | `../assets/logo-1024-with-bg.png` | `AppScope/app.json5`、`module.json5`（BrowserAbility / StatelessAbility / StatusBarEntryAbility）、`shortcuts_config.json` |
| `startIcon.png` | 1024×1024，**无 alpha** | 同上 | `module.json5` 的 `startWindowIcon` |
| `icon.png` | 1024×1024，**无 alpha** | 同上 | 仅 `electron/src/ohosTest/module.json5`（HAP 内为死重） |
| `product_logo_32.png` | 1024×1024，**无 alpha** | 同上 | 无引用（历史遗留，保持一致） |
| `window_icon.png` | 200×200，**允许 alpha** | `../assets/logo.png` | `module.json5` 的 EntryAbility `icon` |
| `web_engine/.../resfile/resources/app/electron_white.png` | 200×200，**允许 alpha** | `../assets/logo.png`（overlay 源） | 状态栏/托盘字形 |

**规则**（`scripts/brand-assets.mjs` 内是硬断言，违反即构建失败）：

1. **应用级图标**（前 4 个）必须 **1024×1024 且不带 alpha 通道** —— 参考工程曾因图标含透明背景被
   审核驳回（`docs/工程规划.md` §2.4c 的 A1 项），所以这里把「不透明」做成生成参数（`format=rgb24`）
   而不是靠人工注意：母版若含非 255 像素，物料校验阶段就会失败。
2. `window_icon.png` 与状态栏字形**允许透明** —— 它们不是 `$media:` 应用图标，不受不透明要求约束。
3. **物料来源唯一**：父工程 `../assets/`（`logo-1024-with-bg.png` / `logo.png` / `logo.svg`）。
   可用 `--assets <dir>` 或 `PI_ASSETS_DIR` 覆盖；缺失即构建失败。
4. **幂等且确定性**：同物料重建得同字节（生成参数固定），因此重建不产生无谓的 git diff。
5. **生成产物入库**：干净 checkout 也有图标；构建期再生成一遍只是「物料变了要跟上」。

## 关于「HAP 内的 app_icon 与源文件不同」的已知事实

鸿蒙资源编译器会对 `app_icon.png` 做**自己的重编码**（`resConfig.json` 里 `iconCheck: true`）。
实测：源文件 1024×1024 无 alpha（`fe006dfd…`）→ HAP 内条目变成 **512×512、带 alpha 通道**；
其余四个图标与状态栏字形在 HAP 内**逐字节等同**于生成物。这不是本工程的问题，
但**验收时必须区分「源资产」与「编译器产物」**（`specs/103-branding/test-cases.md` TC-03）。

## 与规划文档的对应

- 上架前置清单（图标不透明、命名禁用词等）：`docs/工程规划.md` §11.5
- 参考工程被驳回的图标问题原文与分析：§2.4c
- 本规则的需求与验收：`specs/103-branding/spec.md`（FR-brand-007…011 / AC-04…06）
