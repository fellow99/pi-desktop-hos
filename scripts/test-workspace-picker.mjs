#!/usr/bin/env node
/**
 * test-workspace-picker.mjs — 需求 203-plugin-workspace-picker 的宿主侧断言（零设备）
 *
 * 覆盖 `specs/203-plugin-workspace-picker/plan.md` §11 承诺的三层里的两层：
 *   ① **根围栏的真实行为**：把补丁后的 `lib/directory-browser.ts` 从 pi-web 的 pristine 内容 +
 *      补丁本身**在一个临时 git 仓库里**重建出来，转译后用 `node` 直接断言
 *      `isPathInsideRoot` / `listWorkspaceEntries` / `getWorkspaceRoots` / `getBrowseStartDirectory`。
 *      （转译而非复制粘贴 —— 测的是**补丁的产物**，不是本脚本里的副本。）
 *   ② **补丁本身的工程化不变量**：文件集合、无二进制/无 lockfile、可往返（SHA-256）、幂等判定语义。
 *
 * 明确**不**覆盖：
 *   · `next build` 与补丁应用阶段 —— 由 `scripts/prepare-next.mjs` 自己在构建期强制执行；
 *   · 扩展在真机被 pi 装载 —— 由 `logs/20261014-2/T29-extension-on-device.txt` 取证；
 *   · 对话框 DOM 行为 —— 由真机用例 TC-D5…TC-D10 覆盖。
 *
 * 全程**不修改** `../pi-web` 的工作树或索引：重建在 `$TMPDIR` 下的临时仓库里进行。
 *
 * 用法（工程根）：node scripts/test-workspace-picker.mjs
 * 需要：`../pi-web`（含 node_modules/typescript）与 `patches/v0.11.1/*.patch`。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const piWebRoot = resolve(projectRoot, '../pi-web');
const patchTag = 'v0.11.1';
const patchDir = join(projectRoot, 'patches', patchTag);

let pass = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name + (detail ? ` :: ${detail}` : ''));
    console.log(`  FAIL  ${name}${detail ? ' :: ' + detail : ''}`);
  }
}
function section(title) {
  console.log(`\n== ${title} ==`);
}
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' });

// ---------------------------------------------------------------- 0. 前置
section('0. 前置');
if (!existsSync(piWebRoot)) {
  console.error(`pi-web 未找到：${piWebRoot}`);
  process.exit(1);
}
if (!existsSync(patchDir)) {
  console.error(`补丁目录未找到：${patchDir}`);
  process.exit(1);
}
const patches = readdirSync(patchDir).filter((n) => n.endsWith('.patch')).sort();
check('补丁目录非空', patches.length > 0, patchDir);
const patchPath = join(patchDir, patches[0]);
const patchText = readFileSync(patchPath, 'utf8');
const patchFiles = patchText
  .split('\n')
  .filter((l) => l.startsWith('diff --git '))
  .map((l) => l.slice(l.indexOf(' b/') + 3).trim());
console.log(`  补丁：${patches[0]}（${patchFiles.length} 个文件）`);

// ---------------------------------------------------------------- 1. 补丁不变量
section('1. 补丁工程化不变量');
check('不含二进制段', !patchText.includes('Binary files') && !patchText.includes('GIT binary patch'));
check('不含 package-lock.json', !patchText.includes('package-lock.json'));
check(
  '文件集合符合预期',
  patchFiles.length === 7
    && patchFiles.includes('lib/directory-browser.ts')
    && patchFiles.includes('components/DirectoryPicker.tsx')
    && patchFiles.includes('app/api/cwd/browse/route.ts')
    && patchFiles.includes('app/api/cwd/workspace-permission/route.ts'),
  patchFiles.join(', '),
);
check('上游工作树在测试开始时是 pristine 的（本脚本不改它）', git(['status', '--porcelain'], piWebRoot).trim() === '');

// ---------------------------------------------------------------- 2. 幂等判定语义
section('2. 幂等判定语义（pristine 状态）');
const reverseCheckOk = (() => {
  try { git(['apply', '--reverse', '--check', patchPath], piWebRoot); return true; } catch { return false; }
})();
check('pristine 时 --reverse --check 失败（→ 应执行应用）', reverseCheckOk === false);
const forwardCheckOk = (() => {
  try { git(['apply', '--check', patchPath], piWebRoot); return true; } catch { return false; }
})();
check('pristine 时 --check 成功（→ 可应用）', forwardCheckOk === true);

// ---------------------------------------------------------------- 3. 临时仓库里重建补丁产物
section('3. 临时仓库重建补丁后的目录浏览模块');
const tempRoot = mkdtempSync(join(tmpdir(), 'pi203-'));
let patchedModulePath = null;
try {
  git(['init', '--quiet'], tempRoot);
  git(['config', 'user.email', 'test@example.invalid'], tempRoot);
  git(['config', 'user.name', 'pi203-test'], tempRoot);
  mkdirSync(join(tempRoot, 'lib'), { recursive: true });
  writeFileSync(join(tempRoot, 'lib', 'directory-browser.ts'), git(['show', `v0.11.1:lib/directory-browser.ts`], piWebRoot));
  git(['add', '-A'], tempRoot);
  git(['commit', '--quiet', '-m', 'pristine'], tempRoot);
  // 只应用本文件的相关 hunk —— 其余文件与本组断言无关。
  execFileSync('git', ['apply', `--include=lib/directory-browser.ts`, patchPath], { cwd: tempRoot });
  const patchedSrc = readFileSync(join(tempRoot, 'lib', 'directory-browser.ts'), 'utf8');
  check('补丁后含 WORKSPACE_ROOTS_ENV', patchedSrc.includes('WORKSPACE_ROOTS_ENV'));
  check('补丁后含 isPathInsideRoot', patchedSrc.includes('isPathInsideRoot'));
  check('客户端重复的 buildRootRelativeCrumbs 已移除', !patchedSrc.includes('buildRootRelativeCrumbs'));

  // 转译（不是复制）：测的是补丁产物本身
  const ts = (await import(pathToFileURL(join(piWebRoot, 'node_modules', 'typescript', 'lib', 'typescript.js')).href)).default;
  const js = ts.transpileModule(patchedSrc, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
    fileName: 'directory-browser.ts',
  }).outputText;
  const outFile = join(tempRoot, 'directory-browser.patched.mjs');
  writeFileSync(outFile, js);
  patchedModulePath = outFile;
} catch (err) {
  check('临时仓库重建成功', false, String(err && err.message || err));
}

// ---------------------------------------------------------------- 4. 根围栏行为
if (patchedModulePath) {
  const mod = await import(pathToFileURL(patchedModulePath).href);

  section('4. getWorkspaceRoots 解析');
  const savedEnv = process.env.PI_HOS_ROOTS;
  try {
    delete process.env.PI_HOS_ROOTS;
    check('缺省 → 空数组', mod.getWorkspaceRoots().length === 0);
    process.env.PI_HOS_ROOTS = 'not-json';
    check('非法 JSON → 空数组', mod.getWorkspaceRoots().length === 0);
    process.env.PI_HOS_ROOTS = '"a string"';
    check('非数组 → 空数组', mod.getWorkspaceRoots().length === 0);
    process.env.PI_HOS_ROOTS = JSON.stringify([
      { id: 'sandbox', label: '沙箱', path: '/sandbox', permType: null },
      { id: '', path: '/broken' },
      { id: 'noPath' },
    ]);
    const parsed = mod.getWorkspaceRoots();
    check('过滤 id/路径为空与缺 path 的条目', parsed.length === 1 && parsed[0].id === 'sandbox', JSON.stringify(parsed));
    check('null permType 保留为 null', parsed[0].permType === null);
    check('未知 rootId → null（不得回退）', mod.resolveWorkspaceRoot('desktop') === null);
    check('已知 rootId → 该根', mod.resolveWorkspaceRoot('sandbox')?.path === '/sandbox');
    check('getBrowseStartDirectory 缺省落在沙箱根', mod.getBrowseStartDirectory() === '/sandbox');
    check('getBrowseStartDirectory 显式 path 优先', mod.getBrowseStartDirectory('/x') === '/x');

    section('4b. isPathInsideRoot（词法围栏原语）');
    check('相等 → true', mod.isPathInsideRoot('/a/b', '/a/b') === true);
    check('子路径 → true', mod.isPathInsideRoot('/a/b', '/a/b/c') === true);
    check('兄弟前缀不越界（/a/bc 不在 /a/b 内）', mod.isPathInsideRoot('/a/b', '/a/bc') === false);
    check('父路径 → false', mod.isPathInsideRoot('/a/b', '/a') === false);
    check('空串 → false', mod.isPathInsideRoot('/a/b', '') === false);

    section('4c. isHiddenName');
    check('. 开头 → hidden', mod.isHiddenName('.git') === true);
    check('普通名 → 可见', mod.isHiddenName('src') === false);

    section('4d. listWorkspaceEntries（真实文件系统围栏）');
    const rootDir = join(tempRoot, 'root');
    mkdirSync(join(rootDir, 'visible', 'nested'), { recursive: true });
    mkdirSync(join(rootDir, '.hidden'), { recursive: true });
    writeFileSync(join(rootDir, 'a-file.txt'), 'x');
    const absoluteElsewhere = join(tempRoot, 'elsewhere');
    mkdirSync(absoluteElsewhere, { recursive: true });
    const root = { id: 't', label: 't', path: rootDir, permType: null };

    const listing = await mod.listWorkspaceEntries(root);
    const names = listing.entries.map((e) => e.name);
    check('只列目录（不含文件）', !names.includes('a-file.txt'), names.join(','));
    check('不列隐藏目录', !names.includes('.hidden'), names.join(','));
    check('列出可见目录', names.includes('visible'), names.join(','));
    check('truncated 为 false（未触顶）', listing.truncated === false);
    check('回传 rootId / rootPath / path', listing.rootId === 't' && listing.path.endsWith('root'));

    const drill = await mod.listWorkspaceEntries(root, join(rootDir, 'visible'));
    check('可下钻到根内子目录', drill.path.endsWith(join('root', 'visible')));

    const outside = await mod.listWorkspaceEntries(root, absoluteElsewhere).then(() => null, (e) => e.message);
    check('根外绝对路径被拒', outside === 'Path is outside the selected workspace root', String(outside));

    // 必须真的存在：否则会在 realpath 阶段先以 ENOENT 被拒，围栏断言就落空了。
    mkdirSync(`${rootDir}-sibling`, { recursive: true });
    const sibling = await mod.listWorkspaceEntries(root, `${rootDir}-sibling`).then(() => null, (e) => e.message);
    check('同前缀兄弟目录被拒（分隔符边界）', sibling === 'Path is outside the selected workspace root', String(sibling));

    const traversal = await mod.listWorkspaceEntries(root, join(rootDir, '..', 'elsewhere')).then(() => null, (e) => e.message);
    check('../ 穿越被拒', traversal === 'Path is outside the selected workspace root', String(traversal));

    const missing = await mod.listWorkspaceEntries(root, join(rootDir, 'does-not-exist')).then(() => null, (e) => e.message);
    check('不存在的子目录 → Directory does not exist', missing === 'Directory does not exist', String(missing));
  } finally {
    if (savedEnv === undefined) delete process.env.PI_HOS_ROOTS;
    else process.env.PI_HOS_ROOTS = savedEnv;
  }
}

// ---------------------------------------------------------------- 5. 上游零改动
section('5. 上游零改动（本脚本不得留下痕迹）');
check('pi-web 工作树仍为 pristine', git(['status', '--porcelain'], piWebRoot).trim() === '', git(['status', '--porcelain'], piWebRoot));
check('pi-web 索引无暂存', git(['diff', '--cached', '--name-only'], piWebRoot).trim() === '');
if (existsSync(join(piWebRoot, 'app/api/cwd/workspace-permission/route.ts'))) {
  check('未在 pi-web 留下新文件（应只经补丁存在）', false);
} else {
  check('未在 pi-web 留下新文件（应只经补丁存在）', true);
}

// ---------------------------------------------------------------- 6. 扩展
section('6. 壳扩展 harmony-workspace-roots.js');
const extPath = join(projectRoot, 'extensions', 'harmony-workspace-roots.js');
check('扩展文件存在', existsSync(extPath));
if (existsSync(extPath)) {
  const ext = readFileSync(extPath, 'utf8');
  check('导出默认工厂', /export default function/.test(ext));
  check('注册 roots 命令', /registerCommand\("roots"/.test(ext));
  check('不在工厂里起长驻资源（无 setInterval/setTimeout 于顶层）', !/^set(Interval|Timeout)\(/m.test(ext));
  execFileSync(process.execPath, ['--check', extPath]); // 语法
  check('node --check 通过', true);
}

// ---------------------------------------------------------------- 收尾
if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });

console.log(`\n== 结果：${pass} PASS / ${failures.length} FAIL ==`);
if (failures.length) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
void dirname;
