# 占位媒体资源说明（上架前必须替换）

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

## 现状

`AppScope/resources/base/media/` 下的 5 个 PNG —— `app_icon.png`、`icon.png`、
`product_logo_32.png`、`startIcon.png`、`window_icon.png` —— **全部是从参考工程
`dsh-desktop-hos` 原样拷贝的占位图标**（其中 `app_icon.png` / `icon.png` /
`product_logo_32.png` / `startIcon.png` 四者是同一张图）。

## 上架（AppGallery）前必须替换

1. 换成 **Pi 品牌化**的图标（当前占位图不是 Pi 品牌，也可能涉及第三方商标）。
2. 尺寸 **1024×1024**，**纯色不透明背景**（**无 alpha 通道** —— 参考工程曾因图标含透明背景被
   审核驳回，见 `docs/工程规划.md` §2.4c 的 A1 项）。
3. 建议在构建期加一条 alpha 通道守卫（存在非 255 的 alpha 即失败），防止回退。
4. `window_icon.png`（窗口图标）与状态栏图标（`web_engine/.../resfile/resources/app/electron_white.png`，
   托盘用的镂空字形）**允许透明** —— 它们不是 `$media:` 应用图标，不受上述不透明要求约束。

## 与规划文档的对应

- 上架前置清单（图标不透明、命名禁用词等）：`docs/工程规划.md` §11.5
- 参考工程被驳回的图标问题原文与分析：§2.4c
