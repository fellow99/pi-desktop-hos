#!/usr/bin/env node
/**
 * collect-runtime.mjs — 收集 Electron-on-鸿蒙 运行时（阶段 ①）
 *
 * 把同级 `../harmonypc-electron/ohos_hap` 的运行时外壳（ArkTS 源码 + 原生 SO +
 * Chromium 资源）搬进本工程，并在搬完之后重新施加本工程自己的定制。
 *
 * 为什么必须「物理 copy」而不是 HAR `file:` 依赖：hvigor 只构建
 * `build-profile.json5` 模块列表里**物理存在**的目录；HAR 的 `file:` 依赖只带纯
 * ArkTS，**不带 `.so` 与 `resfile`**。所以运行时必须被拷进来。
 *
 * 为什么要有 overlay：阶段 1 是**整目录覆盖**，任何没被重新施加的定制都会被静默
 * 回退。本工程只把定制存在 `runtime-overlays/`，由阶段 3 回盖，阶段 7 用 md5 守卫。
 *
 * 固定阶段流水线，任一阶段失败即非零退出：
 *   0   清单加载与前置校验（runtime-manifest.json / 3 个 SO / DEVECO_SDK_HOME）
 *   0b  运行时产物就位：v37 发布归档 → ohos_hap/（缺 SO 时才做；幂等，不覆盖已有文件）
 *   1   拷贝运行时：electron + web_engine 模块（剔除生成物目录）
 *   1b  剪裁本应用不需要的运行时文件（缺失即硬失败，防上游外壳结构漂移）
 *   3   App 定制 overlay 回盖（白名单，缺失即硬失败）
 *   4   bundleName 字面量替换：4 个 adapter 中通用 bundleName → App bundleName（次数断言）
 *   5   清理上游 demo 残留：resfile/resources/app 只留白名单
 *   6   注入 libc++_shared.so（DevEco SDK）
 *   7   一致性守卫：SO 哈希 / 壳 markers / barrel 导出 / App 身份 / demo 残留 /
 *       overlay 命中 / 剪枝 / 前置 overlay 改写 / 新增 overlay 落地
 *
 * 用法：
 *   node scripts/collect-runtime.mjs                 原地更新本工程（默认）
 *   node scripts/collect-runtime.mjs --verify-only   只跑阶段 7 守卫，不改工作树
 *   node scripts/collect-runtime.mjs --skip-extract  不做阶段 0b（假定运行时已就位）
 *
 * 前置：
 *   - ../harmonypc-electron 与本工程同级，且含 runtime-manifest.json 与 ArkTS 外壳
 *   - ../harmonypc-electron-versions/v37.2.3-20260825.1-release.zip（阶段 0b 自动解压）
 *   - 环境变量 DEVECO_SDK_HOME 指向 HarmonyOS SDK（阶段 6 取 libc++_shared.so）
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyRepoBranding, loadMaterial } from './brand-assets.mjs';

// ---------------------------------------------------------------- 参数/路径

const argv = process.argv.slice(2);
const VERIFY_ONLY = argv.includes('--verify-only');
const SKIP_EXTRACT = argv.includes('--skip-extract');

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const runtimeRoot = resolve(projectRoot, '../harmonypc-electron/ohos_hap');
const versionsRoot = resolve(projectRoot, '../harmonypc-electron-versions');
/** v37 发布归档；内含 libelectron_138.tar.gz（= 完整 ohos_hap 外壳 + SO + Chromium 资源） */
const RELEASE_ZIP = 'v37.2.3-20260825.1-release.zip';
/** 发布归档内的载荷；名称里的 138 是 Node ABI（Electron 37 / Node 22.17.0） */
const RELEASE_INNER_TGZ = 'libelectron_138.tar.gz';
const sdkRoot = process.env.DEVECO_SDK_HOME;
const manifestPath = resolve(runtimeRoot, 'runtime-manifest.json');

/** App 身份事实源 —— 与 AppScope/app.json5 保持单一来源 */
const EXPECTED_BUNDLE = 'org.fellow99.pi.PiDesktop';

const EXCLUDE_TOP = new Set(['build', 'oh_modules', 'node_modules', '.git', '.hvigor', '.idea', '.codegraph']);

/**
 * App 配置 overlay 白名单（相对工程根的镜像路径）。
 * 这些文件在上游**存在**，但本工程做了改动；阶段 1 覆盖拷贝后由本阶段回盖。
 * 全部由阶段 7.6 做源/目标 md5 一致性守卫。
 */
const OVERLAY_FILES = [
  // 两个模块的 manifest：entry 侧「去浏览器语义」+ 后台保活声明；HAR 侧权限表定制
  'electron/src/main/module.json5',
  'web_engine/src/main/module.json5',
  // Ability 源码：后台保活（taskKeeping）申请/释放 + hilog 标签
  'electron/src/main/ets/entryability/EntryAbility.ets',
  // 两个主窗口页面：AI 生成内容常驻标识
  'electron/src/main/ets/pages/Index.ets',
  'electron/src/main/ets/pages/NodeHandleWindow.ets',
  // 快捷方式配置（bundleName + 图标）
  'electron/src/main/resources/base/profile/shortcuts_config.json',
  // 页面注册表：新增 ArkWeb 外链页
  'electron/src/main/resources/base/profile/main_pages.json',
  // 6 个 locale 资源（electron 3 + web_engine 3）；electron 侧承载 OS 桌面显示名
  'electron/src/main/resources/base/element/string.json',
  'electron/src/main/resources/en_US/element/string.json',
  'electron/src/main/resources/zh_CN/element/string.json',
  'web_engine/src/main/resources/base/element/string.json',
  'web_engine/src/main/resources/en_US/element/string.json',
  'web_engine/src/main/resources/zh_CN/element/string.json',
  // 命令行适配：--inspect 改为仅 debug 构建启用
  'web_engine/src/main/ets/common/CommandLineAdapter.ets',
  // 权限管理适配 + 相机导入移除（蓝牙 bind 已随剪裁删除）
  'web_engine/src/main/ets/adapter/MediaAdapter.ets',
  'web_engine/src/main/ets/jsbindings/JsBindingMethod.ets',
  // 状态栏（托盘）图标：替换为产品图标的镂空字形
  'web_engine/src/main/resources/resfile/resources/app/electron_white.png',
];

/**
 * 回盖时机早于阶段 4（bundleName 字面量替换）的 overlay。
 *
 * 这份副本必须保留**通用** bundleName（`manifest.bundleNameRewrite.from`），由阶段 4
 * 再替换成 App bundleName，因此**不能**纳入阶段 7.6 的 md5 一致性守卫（回盖后目标文件
 * 会被阶段 4 改写，源与目标必然不同）。其正确性由阶段 7.4（adapter 已无通用字面量残留）
 * 与 7.9 共同保障。
 */
const OVERLAY_PRE_REWRITE_FILES = ['web_engine/src/main/ets/adapter/PermissionManagerAdapter.ets'];

/**
 * 上游归档里**不存在**、由本工程新增的文件。
 * 与 OVERLAY_FILES 的区别：目标文件由阶段 1 的拷贝…也创建不出来（上游没有），
 * 因此不检查其是否已存在，只由阶段 3 直接写入、阶段 7.10 守卫其落地。
 *
 * 已核验：以下 5 个路径在 v37 发布归档中**零命中**（`ImageAdapter` / `TrayAdapter`
 * / `ImageAdapterBind` / `TrayAdapterBind` / `ExternalWeb` 全部 0 个），确属本工程新增。
 */
const OVERLAY_ADD_FILES = [
  // ArkWeb 外链页（上架合规：外部网页必须由 ArkWeb 渲染）
  'electron/src/main/ets/pages/ExternalWeb.ets',
  // 状态栏（托盘）适配与绑定
  'web_engine/src/main/ets/adapter/TrayAdapter.ets',
  'web_engine/src/main/ets/jsbindings/TrayAdapterBind.ets',
  // 图像转换桥（交由平台图像框架执行，替代不可用的 libvips）
  'web_engine/src/main/ets/adapter/ImageAdapter.ets',
  'web_engine/src/main/ets/jsbindings/ImageAdapterBind.ets',
];

/**
 * 本应用不需要、必须在拷贝后删除的运行时文件。
 * 删除前**断言其存在**：缺失说明上游外壳结构已变化，必须重新评估（不得静默跳过）。
 */
const PRUNE_FILES = [
  'web_engine/src/main/ets/adapter/BluetoothAdapter.ets',
  'web_engine/src/main/ets/adapter/BluetoothLowEnergyAdapter.ets',
  'web_engine/src/main/ets/jsbindings/BluetoothAdapterBind.ets',
  'web_engine/src/main/ets/jsbindings/BluetoothLowEnergyAdapterBind.ets',
];

/**
 * `resfile/resources/app` 的保留白名单。
 * 上游归档在该目录放了一个 demo（`main.js` + `package.json`）；本工程的同名文件由
 * `collect-app.mjs` 在**本脚本之后**投放，故此处允许它们尚不存在。
 */
const APP_KEEP = new Set([
  'electron_white.png',
  'main.js',
  'tar-extract.js',
  'package.json',
  'pi-dist.tar.gz',
  'pi-dist.version',
  'resources',
]);

const APP_RESFILE_DIR = 'web_engine/src/main/resources/resfile/resources/app';

// ---------------------------------------------------------------- 工具

function fail(msg) {
  console.error(`[collect-runtime] 错误: ${msg}`);
  process.exit(1);
}

function log(stage, msg) {
  console.log(`[collect-runtime][${stage}] ${msg}`);
}

function readText(p) {
  return readFileSync(p, 'utf8');
}

function md5File(p) {
  return createHash('md5').update(readFileSync(p)).digest('hex').toUpperCase();
}

function stageBanner(n, name) {
  console.log(`\n[collect-runtime] ---- 阶段 ${n}: ${name} ----`);
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

// ---------------------------------------------------------------- 阶段 0

function stage0Load() {
  stageBanner(0, '清单加载与前置校验');
  if (!existsSync(manifestPath)) {
    fail(
      `运行时清单缺失: ${manifestPath}\n` +
        '  请确认 ../harmonypc-electron 已切换到含 runtime-manifest.json 的 shell 回灌提交。',
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(readText(manifestPath));
  } catch (e) {
    fail(`运行时清单不是合法 JSON: ${manifestPath} (${e.message})`);
  }
  validateManifest(manifest);
  log(0, `清单 shellVersion=${manifest.shellVersion} binaryVersion=${manifest.binaryVersion}`);

  if (!VERIFY_ONLY && !sdkRoot) {
    fail('DEVECO_SDK_HOME 未设置，无法注入 libc++_shared.so（阶段 6 需要）');
  }
  return manifest;
}

/**
 * 清单结构强校验：缺任一必需段都硬失败，避免后面的守卫循环因空数组而空转（exit 0）。
 */
function validateManifest(m) {
  const problems = [];
  const needString = (key) => {
    if (typeof m[key] !== 'string' || m[key].length === 0) problems.push(`缺少字符串字段 ${key}`);
  };
  const needNonEmptyArray = (key, itemCheck) => {
    if (!Array.isArray(m[key]) || m[key].length === 0) {
      problems.push(`缺少非空数组字段 ${key}`);
      return;
    }
    m[key].forEach((it, i) => itemCheck?.(it, `${key}[${i}]`));
  };
  needString('shellVersion');
  needString('binaryVersion');
  needString('genericBundleName');
  needNonEmptyArray('so', (it, where) => {
    if (typeof it.path !== 'string' || !it.path) problems.push(`${where}.path 缺失`);
    if (!/^[0-9a-fA-F]{32}$/.test(it.md5 ?? '')) problems.push(`${where}.md5 必须是 32 位十六进制`);
  });
  needNonEmptyArray('shellMarkers', (it, where) => {
    if (typeof it.symbol !== 'string' || !it.symbol) problems.push(`${where}.symbol 缺失`);
    if (typeof it.file !== 'string' || !it.file) problems.push(`${where}.file 缺失`);
  });
  needString('barrelFile');
  needNonEmptyArray('barrelExports');
  const rw = m.bundleNameRewrite;
  if (!rw || typeof rw !== 'object') {
    problems.push('缺少对象字段 bundleNameRewrite');
  } else {
    if (typeof rw.from !== 'string' || !rw.from) problems.push('bundleNameRewrite.from 缺失');
    if (!Array.isArray(rw.adapters) || rw.adapters.length === 0) {
      problems.push('bundleNameRewrite.adapters 必须是非空数组');
    }
    if (typeof rw.expectedHitsPerFile !== 'number') {
      problems.push('bundleNameRewrite.expectedHitsPerFile 必须是数字');
    }
  }
  if (!m.libcxx || typeof m.libcxx.path !== 'string' || !m.libcxx.path) {
    problems.push('libcxx.path 缺失');
  }
  if (problems.length > 0) {
    fail(
      `运行时清单结构不完整（守卫不得空转）:\n  - ${problems.join('\n  - ')}\n  清单: ${manifestPath}`,
    );
  }
}

// ---------------------------------------------------------------- 阶段 0b

/**
 * 把 v37 发布归档的载荷解压到 `ohos_hap/`。
 *
 * 归档结构：`v37…-release.zip` → `libelectron_138.tar.gz` → 顶层 `libelectron/ohos_hap/<…>`，
 * 内含**完整外壳**（ArkTS 源码 + 3 个 SO + 全套 Chromium 资源）。因此 `--strip-components`
 * 要剥掉 **2** 层（`libelectron/` + `ohos_hap/`）才对得上 `ohos_hap/` 内的相对路径。
 *
 * ⚠️ 用 Python `tarfile` 而不是 `tar`：Git-Bash 的 `tar` 会把 `C:/…` 形式的绝对路径
 * 当成远程主机（`Cannot connect to C: resolve failed`），且 `--keep-old-files` 的
 * 覆盖语义不易在跨平台间保持一致。Python 逐成员解压能同时保证「不覆盖已有文件」。
 *
 * 幂等：只要 3 个 SO 都已存在就跳过；只解压缺失的文件，已存在的一律保留。
 */
function stage0bProvisionRuntime(manifest) {
  stageBanner('0b', '运行时产物就位（发布归档 → ohos_hap）');

  const missingSo = manifest.so.filter((so) => !existsSync(resolve(runtimeRoot, so.path)));
  if (missingSo.length === 0) {
    log('0b', '3 个 SO 已就位，跳过解压');
    return;
  }
  log('0b', `缺失 ${missingSo.length} 个 SO，需要从发布归档补齐`);

  const zipPath = resolve(versionsRoot, RELEASE_ZIP);
  if (!existsSync(zipPath)) {
    fail(
      `发布归档缺失: ${zipPath}\n` +
        `  请把 ${RELEASE_ZIP} 放到 ../harmonypc-electron-versions/，或用 --skip-extract 手工补齐 SO。`,
    );
  }

  // 1) 从 zip 取出载荷（幂等：已存在则复用）
  const workDir = resolve(projectRoot, '.collect-runtime-tmp');
  mkdirSync(workDir, { recursive: true });
  const tgzPath = resolve(workDir, RELEASE_INNER_TGZ);
  if (!existsSync(tgzPath)) {
    log('0b', `解出 ${RELEASE_INNER_TGZ} …（zip ${(readFileSync(zipPath).length / 1048576).toFixed(0)} MB）`);
    try {
      run('unzip', ['-q', '-o', zipPath, '-d', workDir]);
    } catch (e) {
      fail(`解压 ${RELEASE_ZIP} 失败: ${e.message}\n  需要系统 PATH 上有 unzip。`);
    }
    if (!existsSync(tgzPath)) fail(`归档内未找到 ${RELEASE_INNER_TGZ}：${tgzPath}`);
  }

  // 2) 用 Python tarfile 逐成员解压，剥 2 层前缀，不覆盖已有文件
  const py = `
import os, sys, tarfile
arch, dest = sys.argv[1], sys.argv[2]
wrote = kept = 0
with tarfile.open(arch, 'r:gz') as t:
    for m in t.getmembers():
        parts = m.name.split('/')
        if len(parts) <= 2:
            continue
        rel = '/'.join(parts[2:])
        if not rel:
            continue
        target = os.path.join(dest, rel)
        if m.isdir():
            os.makedirs(target, exist_ok=True)
            continue
        if os.path.exists(target):
            kept += 1
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        src = t.extractfile(m)
        with open(target, 'wb') as out:
            while True:
                chunk = src.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
        wrote += 1
print(f'{wrote} {kept}')
`;
  log('0b', '解压外壳 + SO + Chromium 资源（约 400 MB，请稍候）…');
  let out;
  try {
    out = run('python', ['-c', py, tgzPath, runtimeRoot], { maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    fail(
      `解压运行时载荷失败: ${e.message}\n` +
        '  需要系统 PATH 上有 python（用于 tarfile 逐成员解压）。',
    );
  }
  const [wrote, kept] = out.trim().split(/\s+/);
  log('0b', `解压完成：新写入 ${wrote} 个文件，保留已有 ${kept} 个文件（不覆盖）`);

  // 3) 断言 SO 全部就位（否则后面的守卫只是把问题推迟）
  for (const so of manifest.so) {
    if (!existsSync(resolve(runtimeRoot, so.path))) fail(`解压后仍缺 SO: ${so.path}`);
  }
}

// ---------------------------------------------------------------- 阶段 1

// ---------------------------------------------------------------- 阶段 0.5

/**
 * 品牌化（需求 103）：按**父工程** `../assets/` 的物料生成本工程自有的图标位
 * （`AppScope/resources/base/media/*` + overlay 状态栏字形）。
 *
 * 为什么放在阶段 1 之前：阶段 1 是**整目录覆盖**拷贝上游外壳，阶段 3 才回盖 overlay；
 * overlay 源（`runtime-overlays/web_engine/.../electron_white.png`）必须先被写成品牌字形，
 * 否则阶段 3 会把旧字节盖回工作树。详见 `scripts/brand-assets.mjs` 与 `specs/103-branding/`。
 */
function stage05BrandAssets() {
  stageBanner('0.5', '品牌化图标物料（父工程 assets/）');
  const material = loadMaterial(process.argv.slice(2));
  applyRepoBranding({ material });
}
function copyModule(name) {
  const src = resolve(runtimeRoot, name);
  const dest = resolve(projectRoot, name);
  if (!existsSync(resolve(src, 'build-profile.json5')) && !existsSync(resolve(src, 'oh-package.json5'))) {
    fail(`运行时模块缺失: ${src}`);
  }
  cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (s) => {
      const rel = s.slice(src.length + 1);
      if (rel === '') return true;
      const top = rel.split(/[\\/]/)[0];
      return !EXCLUDE_TOP.has(top);
    },
  });
  log(1, `已 copy 模块 ${name} -> ${relative(projectRoot, dest)}`);
}

function stage1CopyRuntime() {
  stageBanner(1, '拷贝运行时 electron + web_engine');
  for (const m of ['electron', 'web_engine']) copyModule(m);
}

// ---------------------------------------------------------------- 阶段 1b

function stage1bPruneRuntime() {
  stageBanner('1b', '剪裁本应用不需要的运行时文件');
  for (const rel of PRUNE_FILES) {
    const p = resolve(projectRoot, rel);
    if (!existsSync(p)) {
      fail(
        `待剪裁文件缺失（上游外壳结构可能已变化）: ${p}\n` +
          '  请重新评估 PRUNE_FILES 是否仍然需要（不得静默跳过）。',
      );
    }
    rmSync(p, { force: true });
    log('1b', `已删除 ${rel}`);
  }
}

// ---------------------------------------------------------------- 阶段 3

function stage3ApplyOverlays() {
  stageBanner(3, '应用 App 定制 overlay');
  for (const rel of [...OVERLAY_FILES, ...OVERLAY_PRE_REWRITE_FILES]) {
    const src = resolve(projectRoot, 'runtime-overlays', rel);
    const dest = resolve(projectRoot, rel);
    if (!existsSync(src)) fail(`overlay 源缺失（App 定制丢失）: ${src}`);
    if (!existsSync(dest)) {
      fail(
        `overlay 目标缺失（上游外壳结构可能已升级）: ${dest}\n` +
          '  该文件在上游应存在；不存在说明它已改名或删除，需重新评估 OVERLAY_FILES。',
      );
    }
    cpSync(src, dest, { force: true });
    log(3, `回盖 ${rel}`);
  }
  // 新增文件：上游没有该文件，因此不检查目标是否存在；由阶段 7.10 守卫其落地。
  for (const rel of OVERLAY_ADD_FILES) {
    const src = resolve(projectRoot, 'runtime-overlays', rel);
    const dest = resolve(projectRoot, rel);
    if (!existsSync(src)) fail(`新增 overlay 源缺失（App 定制丢失）: ${src}`);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { force: true });
    log(3, `新增 ${rel}`);
  }
}

// ---------------------------------------------------------------- 阶段 4

/**
 * 上游外壳在 4 个 adapter 里硬编码了通用 bundleName（`com.huawei.ohos_electron`），
 * 用于拉起自身的 Ability。本工程必须把它替换成自己的 bundleName，否则窗口/权限等
 * Ability 拉起会指向另一个应用。
 *
 * 不做静默替换：命中次数必须与清单声明一致，多了少了都硬失败。
 */
function stage4RewriteBundleName(manifest) {
  stageBanner(4, 'bundleName 字面量替换');
  const from = manifest.bundleNameRewrite?.from;
  const expected = manifest.bundleNameRewrite?.expectedHitsPerFile ?? 1;
  const adapters = manifest.bundleNameRewrite?.adapters;
  if (!from || !Array.isArray(adapters)) fail('清单缺少 bundleNameRewrite.from/adapters 配置');

  const appBundleName = readAppBundleName();

  for (const rel of adapters) {
    const p = resolve(projectRoot, rel);
    if (!existsSync(p)) fail(`adapter 缺失（外壳结构可能已升级）: ${p}`);
    const original = readText(p);
    const hits = original.split(from).length - 1;
    if (hits !== expected) {
      fail(
        `${rel} 中通用字面量 "${from}" 命中 ${hits} 次，预期 ${expected} 次。\n` +
          '  外壳升级后必须重新评估本工程的 bundleName 定制（见 runtime-manifest.json 的 bundleNameRewrite）。',
      );
    }
    const rewritten = original.split(from).join(appBundleName);
    if (rewritten.includes(from)) fail(`${rel} 替换后仍残留通用字面量 "${from}"`);
    if (rewritten.split(appBundleName).length - 1 !== expected) {
      fail(`${rel} 替换后 App bundleName 次数异常`);
    }
    writeFileSync(p, rewritten);
    log(4, `${rel.split('/').pop()}: ${from} -> ${appBundleName}（${hits} 处）`);
  }
}

// ---------------------------------------------------------------- 阶段 5

/**
 * 上游归档在 `resfile/resources/app` 放了一个 demo（`main.js` + `package.json`）。
 * 本工程的应用文件同名，由 `collect-app.mjs` 在**本脚本之后**投放，所以这里只做
 * 「删除白名单之外的一切」，不要求白名单内的文件已存在。
 */
function stage5PurgeDemo() {
  stageBanner(5, '清理上游 demo 残留');
  const dir = resolve(projectRoot, APP_RESFILE_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    log(5, `${APP_RESFILE_DIR} 原本不存在，已创建（三件套待 collect-app 投放）`);
    return;
  }
  for (const entry of readdirSync(dir)) {
    if (APP_KEEP.has(entry)) continue;
    rmSync(join(dir, entry), { recursive: true, force: true });
    log(5, `清理非本应用文件: ${entry}`);
  }
}

// ---------------------------------------------------------------- 阶段 6

function stage6InjectLibcxx(manifest) {
  stageBanner(6, '注入 libc++_shared.so');
  const candidates = [
    resolve(sdkRoot, 'default/openharmony/native/llvm/lib/aarch64-linux-ohos/libc++_shared.so'),
    resolve(sdkRoot, 'default/openharmony/native/llvm/lib/aarch64-linux-ohos/c++/libc++_shared.so'),
  ];
  const libcxx = candidates.find((p) => existsSync(p));
  if (!libcxx) fail(`SDK libc++_shared.so 缺失，已尝试:\n  - ${candidates.join('\n  - ')}`);

  if (manifest.libcxx?.md5) {
    const got = md5File(libcxx);
    if (got !== manifest.libcxx.md5.toUpperCase()) {
      fail(
        `SDK 里的 libc++_shared.so 与清单期望不一致（SDK 版本可能已变）:\n` +
          `  期望 ${manifest.libcxx.md5}\n  实得 ${got}\n  取自 ${libcxx}`,
      );
    }
  }
  const dest = resolve(projectRoot, manifest.libcxx?.path ?? 'electron/libs/arm64-v8a/libc++_shared.so');
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(libcxx, dest, { force: true });
  log(6, `已 copy libc++_shared.so -> ${relative(projectRoot, dest)}（来源 ${manifest.libcxx?.source ?? 'SDK'}）`);
}

// ---------------------------------------------------------------- 阶段 7

function readAppBundleName() {
  const appScope = resolve(projectRoot, 'AppScope/app.json5');
  if (!existsSync(appScope)) fail(`AppScope/app.json5 缺失: ${appScope}`);
  const m = readText(appScope).match(/"bundleName"\s*:\s*"([^"]+)"/);
  if (!m) fail('无法从 AppScope/app.json5 解析 bundleName');
  return m[1];
}

function stage7Guards(manifest) {
  stageBanner(7, '壳/二进制一致性守卫');
  let failed = 0;
  const guard = (cond, msg) => {
    if (cond) log(7, `PASS ${msg}`);
    else {
      console.error(`[collect-runtime][7] FAIL ${msg}`);
      failed += 1;
    }
  };

  // 7.1 二进制存在与哈希
  for (const so of manifest.so ?? []) {
    const p = resolve(projectRoot, so.path);
    if (existsSync(p)) {
      const h = md5File(p);
      guard(h === (so.md5 ?? '').toUpperCase(), `SO 哈希 ${so.path}`);
    } else {
      guard(false, `SO 存在 ${so.path}`);
    }
  }

  // 7.2 新壳标记：确认拿到的是配套的那一版 ArkTS 外壳，而不是旧壳
  for (const mk of manifest.shellMarkers ?? []) {
    const p = resolve(projectRoot, mk.file);
    guard(existsSync(p) && readText(p).includes(mk.symbol), `新壳标记 ${mk.symbol} @ ${mk.file}`);
  }

  // 7.3 barrel 导出：web_engine 的对外入口必须导出预期的窗口组件
  const barrelPath = resolve(projectRoot, manifest.barrelFile ?? 'web_engine/Index.ets');
  if (existsSync(barrelPath)) {
    const barrel = readText(barrelPath);
    for (const e of manifest.barrelExports ?? []) guard(barrel.includes(e), `barrel 导出 ${e}`);
  } else {
    guard(false, `barrel 存在 ${manifest.barrelFile}`);
  }

  // 7.4 App 身份 + adapter 无通用字面量残留
  const appBundleName = readAppBundleName();
  guard(appBundleName === EXPECTED_BUNDLE, `AppScope bundleName = ${appBundleName}（期望 ${EXPECTED_BUNDLE}）`);
  const generic = manifest.bundleNameRewrite?.from ?? 'com.huawei.ohos_electron';
  for (const rel of manifest.bundleNameRewrite?.adapters ?? []) {
    const p = resolve(projectRoot, rel);
    guard(existsSync(p) && !readText(p).includes(generic), `adapter 无通用字面量残留 ${rel.split('/').pop()}`);
  }

  // 7.5 demo 残留
  const dir = resolve(projectRoot, APP_RESFILE_DIR);
  const leftovers = existsSync(dir) ? readdirSync(dir).filter((e) => !APP_KEEP.has(e)) : [];
  guard(
    leftovers.length === 0,
    `resfile/app 无 demo 残留${leftovers.length ? `（发现: ${leftovers.join(', ')}）` : ''}`,
  );

  // 7.6 overlay 命中（源与目标逐字节一致）
  for (const rel of OVERLAY_FILES) {
    const src = resolve(projectRoot, 'runtime-overlays', rel);
    const dest = resolve(projectRoot, rel);
    guard(
      existsSync(src) && existsSync(dest) && md5File(src) === md5File(dest),
      `overlay 命中 ${rel}`,
    );
  }

  // 7.8 剪裁：不需要的运行时文件必须不存在
  for (const rel of PRUNE_FILES) {
    guard(!existsSync(resolve(projectRoot, rel)), `已剪裁 ${rel}`);
  }

  // 7.9 阶段 4 前置 overlay：源保留通用字面量、目标已改写为 App bundleName
  for (const rel of OVERLAY_PRE_REWRITE_FILES) {
    const src = resolve(projectRoot, 'runtime-overlays', rel);
    const dest = resolve(projectRoot, rel);
    const name = rel.split('/').pop();
    guard(existsSync(src) && readText(src).includes(generic), `overlay 源保留通用字面量 ${name}`);
    guard(existsSync(dest) && !readText(dest).includes(generic), `目标已无通用字面量 ${name}`);
    guard(existsSync(dest) && readText(dest).includes(appBundleName), `目标含 App bundleName ${name}`);
  }

  // 7.7 libc++ 注入哈希
  if (manifest.libcxx?.md5) {
    const p = resolve(projectRoot, manifest.libcxx.path);
    guard(
      existsSync(p) && md5File(p) === manifest.libcxx.md5.toUpperCase(),
      `libc++_shared.so 哈希（来源 ${manifest.libcxx.source ?? 'SDK'}）`,
    );
  }

  // 7.10 新增 overlay：上游没有这些文件，必须由阶段 3 创建且与源一致
  for (const rel of OVERLAY_ADD_FILES) {
    const src = resolve(projectRoot, 'runtime-overlays', rel);
    const dest = resolve(projectRoot, rel);
    guard(
      existsSync(src) && existsSync(dest) && md5File(src) === md5File(dest),
      `新增 overlay 落地 ${rel}`,
    );
  }

  // 7.11 应用投放点存在（内容由 collect-app 填充，此处只断言目录可用）
  guard(existsSync(dir), `应用投放点存在 ${APP_RESFILE_DIR}`);

  if (failed > 0) {
    fail(`一致性守卫 ${failed} 项未通过，已中止（旧壳 / 错 SO / demo 污染 / 定制丢失风险）。`);
  }
  log(7, '全部守卫通过');
}

// ---------------------------------------------------------------- main

function main() {
  const manifest = stage0Load();
  if (!VERIFY_ONLY) {
    if (!SKIP_EXTRACT) stage0bProvisionRuntime(manifest);
    stage05BrandAssets();
    stage1CopyRuntime();
    stage1bPruneRuntime();
    stage3ApplyOverlays();
    stage4RewriteBundleName(manifest);
    stage5PurgeDemo();
    stage6InjectLibcxx(manifest);
  }
  stage7Guards(manifest);
  console.log(
    `\n[collect-runtime] 完成：electron + web_engine 已就绪（${VERIFY_ONLY ? '仅守卫模式' : '已更新工作树'}）`,
  );
}

main();
