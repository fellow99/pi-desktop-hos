[中文](./README_zh.md) | English

---

# Pi Desktop (HarmonyOS)

> A [Pi](https://pi.dev) desktop wrapper built on the "Electron-on-HarmonyOS" runtime
> ([harmonypc-electron](https://atomgit.com/jianguoxu/harmonypc-electron),
> Electron **37.2.3** / Node **22.17.0** / ABI **v138**) — it hosts **Pi Web** (the Next server
> from `pi-web`, including the agent and `/api/*`) inside the Electron main process on a
> HarmonyOS device, and the renderer loads the Pi Web UI served by that same-origin server.
> The UI is reused 100% from upstream; the frontend is not forked.

**Version**: `0.11.1` / `versionCode` `1101` (**built and verified via signed on-device deployment**,
see [docs/真机验证记录.md](docs/真机验证记录.md))
· **Upstream baseline**: `pi` **v1.1.0** (`Branch_v1.1.0`) + `pi-web` **v0.11.1** (`Branch_v0.11.1`)
· **Runtime**: Electron **37.2.3** (Node **22.17.0** / ABI **v138**; on the HarmonyOS side via the `harmonypc-electron` runtime)
· **App name / bundle name**: `Pi Desktop` / `org.fellow99.pi.PiDesktop`

The full engineering plan and delivery record live in **[docs/工程规划.md](docs/工程规划.md)**;
the **authoritative** document for device-side capability conclusions is
**[docs/鸿蒙环境能力清单-v0.11.1.md](docs/鸿蒙环境能力清单-v0.11.1.md)** (with revision sections
**REV-1** / **REV-2**; where they conflict with the earlier sections, the revisions win).

---

## What this is

`Pi` is a minimal, extensible agent harness: extensions, skills, prompt templates and themes
are all replaceable, and it offers four official integration entry points (CLI / RPC / JSON /
SDK). `Pi Web` is its local browser UI (a Next.js app) where **a single Node process serves
both the SPA and `/api/*`**, and the agent is created inside that process.

This project wraps all of that in a native HarmonyOS desktop shell (the Electron-on-HarmonyOS
runtime) so it runs like a first-class desktop application on HarmonyOS PCs and tablets. It is
**not** a thin shell that "wraps a browser pointed at localhost".

> **Unofficial notice**: This project is not built by the Pi or Pi Web teams, has no
> affiliation with the upstream authors, and is not endorsed by them. Both `Pi` and `Pi Web`
> are MIT-licensed upstream open-source projects; this project is merely a third-party port of
> their desktop form factor to HarmonyOS.

## Delivered requirements

Requirements are organized under `specs/NNN-<name>/`, delivered in pairs (`spec.md` for
requirements and acceptance, `plan.md` for the design) with `tasks.md` + `test-cases.md` added
for more complex ones.

| Requirement | Spec directory | Deliverable | On-device round |
|---|---|---|---|
| `001-host` | [specs/001-host/](specs/001-host/) | Host: environment wiring, in-process Next server, HTTP-polling readiness check, random password and credential injection | Round 1 |
| `101-version-0.11.1` | [specs/101-version-0.11.1/](specs/101-version-0.11.1/) | Version convergence to `0.11.1` / `1101`; full-pipeline rebuild after cleaning intermediates with byte-level reproducibility; capability inventory produced | Rounds 2, 2b |
| `102-harmony-js-tools` | [specs/102-harmony-js-tools/](specs/102-harmony-js-tools/) | **Pure-JS extensions** shipped in the HAP take over `bash` / `find` / `grep` under the same tool names; **zero upstream or patch changes** | Rounds 3, 3b, 3c |
| `103-branding` | [specs/103-branding/](specs/103-branding/) | UI branding switched to `Pi Desktop`, Logo/icons generated from parent-project assets, new-version check disabled (zero upstream changes) | Round 4 |

> **§10** of `specs/README.md` lists the documentation status and the four-part document set for
> the table above.

## Core design

```
┌─ HarmonyOS HAP (pi-desktop-hos) ─────────────────────────────────────────┐
│  electron module (entry): 3 native SOs + libc++_shared.so + Ability setup │
│  web_engine module (HAR): ArkTS bridge layer + resfile carrying app assets│
│   ┌─ Electron main process (Node 22.17.0) ───────────────────────────┐    │
│   │  main.js: env wiring → extract pi-dist → in-process Next server  │    │
│   │           → create window                                        │    │
│   │    ├─ Next server 0.0.0.0:<random port>: SPA + /api/* + SSE       │    │
│   │    ├─ agent session (pi SDK, in-process)                          │    │
│   │    └─ when ready, loadURL(http://<LAN IP>:<port>/)                │    │
│   └──────────────────────▲───────────────────────────────────────────┘   │
│                          │ same-origin (no CORS, no Host/Origin rewrite)  │
│   ┌──────────────────────┴───────────────────────────────────────────┐   │
│   │ Renderer: Electron BrowserWindow (Chromium)                       │   │
│   │   standard Pi Web UI (fetch /api/* + SSE /api/agent/[id]/events)  │   │
│   └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

Key points:

- **The server runs inside the main process**, with no Node child process — this sidesteps
  three platform problems at once: "JIT in an app-domain child process is blocked by seccomp",
  "a child's `exit`/`close` events are never observable", and "every spawn leaks a zombie".
- **Same-origin renderer**: zero CORS, zero custom protocol, zero preload bridge, zero IPC
  carrier.
- **No Host/Origin header rewriting needed**: pi-web's request trust fence admits any IP
  literal, so same-origin requests pass the Origin check naturally (this saves an entire set of
  patches compared with the sibling project `dsh-desktop-hos`).
- **Command execution and file search are taken over by pure-JS extensions shipped in the HAP**
  (requirement 102): `bash` uses a resident `/system/bin/sh` plus a random sentinel line, and
  decides completion **from stdout alone**, never waiting for process events that never arrive;
  `find` / `grep` use a pure-JS directory walk with **zero `fd`/`rg` and zero child processes**.
  This is fully transparent to the model and to pi-web presets.
- **Zero patches are required**: all 8 registered candidates are covered by existing upstream
  mechanisms or by the shell extensions (see [patches/README.md](patches/README.md)).
- **Branding is applied to the upstream artifact copy** (requirement 103): UI text, the Logo and
  every icon slot use parent-project assets, and the home page's new-version check is disabled;
  `pi` / `pi-web` / `harmonypc-electron` are **untouched**.
- **Low-cost app-store compliance is front-loaded**: no browser semantics are declared
  (`browsable` / `viewData`); all external web pages go through the ArkWeb external-link page.

## Directory layout

This project lives **side by side with its sibling projects** (`pi-workspace` is a submodule
container repository):

```
pi-workspace/
├── pi/                                 # [submodule] upstream host + SDK, pinned to Branch_v1.1.0
├── pi-web/                             # [submodule] upstream UI + server, pinned to Branch_v0.11.1
├── harmonypc-electron/                 # [submodule] Electron-on-HarmonyOS runtime (shell + manifest)
├── harmonypc-electron-versions/        # (plain dir, gitignored) v37 archive + native module material
├── assets/                             # parent-project brand assets (logo-1024-with-bg.png / logo.png / logo.svg)
└── pi-desktop-hos/                     # [submodule] ← this project
```

Inside this project:

```
pi-desktop-hos/
├── AppScope/                    # app-level config (bundleName / version / icons / label)
├── electron/                    # entry module (populated by collect-runtime; libs/ is not committed)
├── web_engine/                  # HAR bridge layer + resfile carrying app assets (populated by collect-runtime)
├── src-main/                    # Electron main-process sources (main.js + tar-extract.js)
├── scripts/                     # five-stage build pipeline + host-side gate + branding + signing scripts
├── runtime-overlays/            # "copy then overlay" whitelist (protects our customizations from being overwritten)
├── patches/                     # upstream patch set (empty for this version; see that directory's README)
├── config/                      # runtime preset templates (settings.json / mcp.json)
├── extensions/                  # shell-specific pi extensions (pure-JS bash / find / grep)
├── skills/                      # shell-specific pi skills
├── specs/                       # module and version-requirement specs (NNN-name/{spec,plan,tasks,test-cases})
└── docs/                        # engineering plan, capability inventory, device-verification records, etc.
```

**Why `electron/` and `web_engine/` are script-generated**: they come from the runtime shell in
the sibling `harmonypc-electron` (ArkTS code + native SOs + Chromium resources). hvigor only
builds directories that **physically exist** in the module list of `build-profile.json5`, and a
HAR's `file:` dependency **does not carry `.so` or `resfile`** — so the runtime must be copied in
physically by `collect-runtime.mjs`. This project commits only **configuration + overlays**;
upstream copies are re-collected by the scripts, so re-running the scripts after an upstream
update cannot produce "someone edited an upstream file and nobody knew" drift. (The `resfile`
drop-in artifacts are currently **committed**, contradicting the previous README's wording; see
risk R17.)

## Build

### Prerequisites (one-time)

| Item | Requirement |
|---|---|
| Toolchain | DevEco Studio 6.x + HarmonyOS SDK (API 17+, targetSdk `6.1.1(24)`) + hvigorw + ohpm |
| Node | ≥ 18 (build scripts); the host-side gate needs **Node 22.17.0** (matching Electron 37's bundled version) |
| Sibling projects | `../pi`, `../pi-web`, `../harmonypc-electron`, `../harmonypc-electron-versions` |
| Runtime artifact | `harmonypc-electron-versions/v37.2.3-20260825.1-release.zip` (contains `libelectron_138.tar.gz`) |
| Brand assets (req. 103) | **Parent project** `../assets/`: `logo-1024-with-bg.png` (1024², opaque), `logo.png` (200², with alpha), `logo.svg` (vector); overridable with `--assets` / `PI_ASSETS_DIR` |
| Icon generation tool | **`ffmpeg`** must be on PATH (`scripts/brand-assets.mjs` uses it to generate all icons; missing means the build fails) |
| Signing | `signing.debug.local.json` (see the sample `signing.debug.local.json.sample`); ACLs below |

### Five-stage pipeline

```bash
# 1. Collect the runtime: v37 archive → electron/ + web_engine/ + SOs + Chromium resources + libc++_shared.so
#    Includes prune (remove upstream files this app does not use) and overlay (re-apply our customizations)
#    plus stage 0.5 branding (parent assets/ → AppScope icons + overlay status-bar glyph)
node scripts/collect-runtime.mjs

# 2. Build the pi-web production output: npm ci → next build → prune platform-specific natively → rotate preview secret
node scripts/prepare-next.mjs --node <path to node22>

# 2'. Host-side gate: run the server smoke test under Node 22.17.0 (must be all green before deploying to a device)
node scripts/smoke-node22.mjs

# 3. Assemble pi-dist (pi-web output + @earendil-works/* + pi-agent resources) + step 2.5 branding
#    (inside the pi-dist copy: `Pi Web` → `Pi Desktop`, web icons/favicon swapped to the assets, with post-assertions)
#    + tar.gz + SHA-256 marker
node scripts/collect-pi.mjs

# 4. Drop the main process and preset templates into resfile
node scripts/collect-app.mjs

# 5. Build + sign (see the header comment of scripts/build-hap.ps1 for details)
powershell -ExecutionPolicy Bypass -File scripts\build-debug.ps1     # debug-signed HAP
powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1   # release-signed App Pack
```

> Branding only touches **this project's own artifacts** (`AppScope/`, overlay sources, the
> `pi-dist/` copy); upstream `../pi`, `../pi-web` and `../harmonypc-electron` are **untouched**
> (`patches/` is still empty). To regenerate brand assets alone (after changing `../assets/`):
> `node scripts/brand-assets.mjs`; missing assets cause a **hard failure**, never a silent
> downgrade. See `specs/103-branding/` and `docs/media-placeholder-icons.md`.

Host-side regression test (runs with no device; covers the pure-JS search extension):
`node scripts/test-harmony-tools.mjs`.

### Install and launch

```bash
hdc uninstall org.fellow99.pi.PiDesktop
hdc app install -r electron/build/default/outputs/default/electron-default-signed.hap
hdc shell aa start -a EntryAbility -b org.fellow99.pi.PiDesktop
```

> ⚠️ **Release-signed packages cannot be sideloaded** (they fail with
> `signature verification failed due to not trusted app source`). For on-device regression use
> `-BuildMode release -SignMode debug`; release-signed packages are meant only for AppGallery
> submission. **Make sure the screen is unlocked before deploying** (a lock screen hard-blocks
> `aa start`).

### On-device forensics

```bash
hdc shell "hilog -x | grep pi-desktop"     # app log (shared tag for the main process and the ArkTS layer)
hdc shell aa dump -a                       # inspect Ability state
hdc fport tcp:19229 tcp:9229               # CDP debugging (debug builds only; production must drop --inspect)
```

> ⚠️ `hdc` occasionally reports `need connect-key`, and under Git-Bash it rewrites device-side
> POSIX path arguments (use `MSYS_NO_PATHCONV=1`); `fport` mappings have an unstable lifetime,
> so establishing and consuming a forward should be done within a single command where possible.

## Permissions

**Must be requested (ACL, restricted permission)**:
`ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY` (`system_basic` / since API 14 / tablet +
2in1 only / **requires an ACL application through AGC**) — it enables Electron/V8's JIT, is
required by the engine, and cannot be removed.

**Open permissions** (granted at install time once listed in `requestPermissions`):
`INTERNET`, `GET_NETWORK_INFO`, `KEEP_BACKGROUND_RUNNING`,
`READ_WRITE_DOCUMENTS_DIRECTORY`, `READ_WRITE_DOWNLOAD_DIRECTORY`, `FILE_ACCESS_PERSIST`.

**Not needed by this project**: binary certificates (AGC `certType: 4`; we ship no ELF of our
own), `ALLOW_EXTERNAL_NATIVE_CODE`, `READ_WRITE_DESKTOP_DIRECTORY` (`system_basic`, an app-store
obstacle).

ACL submission notes and the app-store pre-flight checklist are in
[docs/工程规划.md](docs/工程规划.md) §11.4, §11.5.

## Capability boundaries (known device-side limitations)

> The table below summarizes [docs/鸿蒙环境能力清单-v0.11.1.md](docs/鸿蒙环境能力清单-v0.11.1.md);
> that file is the **sole authority** on device-side capabilities (§A–§D are the as-measured
> state for requirement 101, **REV-1 / REV-2** are later revisions, and the revisions win where
> they conflict).

| Capability | Status | Reason |
|---|---|---|
| Main UI (Pi Desktop Web) | ✅ | In-process server + Chromium rendering |
| Session persistence / resume | ✅ | JSONL written under the sandbox `pi-agent/sessions/` |
| File read / write / edit / list | ✅ | Pure Node.js |
| Command execution (the `bash` tool) | ✅ | Replaced under the same name by `extensions/harmony-exec.js`: a resident non-PTY `/system/bin/sh` (mksh R59) + a random sentinel line; completion is judged from stdout alone and **never waits** for `exit`/`close` |
| File lookup / content search (the `find` / `grep` tools) | ✅ | Replaced under the same names by `extensions/harmony-search.js`: a pure-JS walk with **zero `fd`/`rg` and zero child processes**; `rg`/`fd` are still absent, but no longer needed |
| Terminal panel / PTY | ❌ | `node-pty` ships only `darwin-arm64`/`win32-arm64` prebuilds (**proven L2**); whether the kernel also refuses PTY is **not disproven** |
| `git` integration / worktree | ❌ | No `git` binary on the device, and no way to install one |
| Network plugin installation | ❌ | PL1 "local sources only" + `PI_OFFLINE=1`; no npm/git on the device |
| MCP stdio servers | ⚠️ | The blocking root cause (child-exit events never delivered) was lifted with the `bash` takeover, and the channel was verified at the transport level; **no real MCP server has been attached** (`config/mcp.json` is empty) |
| Running Node scripts in a child process | ❌ | `node -e` produces no stdout/stderr and the process becomes a zombie; the **termination cause could not be read** |
| User directories (Desktop/Documents/Download) read/write | ❌ | OS authorization gate; requires granting access in *Settings → Apps → Allow access* and **restarting the app** — in-app approval does not change this |
| Symbolic links (`symlink`) | ❌ | Refused in **both** the app domain and the shell domain (`EACCES` / `Permission denied`) |
| Auto-start at boot / background residency | ❌ / ⚠️ | Read-only interfaces and no public setter; minimizing under 2in1 does not produce a real background state |
| File fencing for commands | ⚠️ | The `bash` child runs as the application identity (uid `20020215`) and therefore **bypasses pi's file-approval flow**; the only mitigation is a skill-level constraint |

See [skills/harmony-runtime-capabilities/SKILL.md](skills/harmony-runtime-capabilities/SKILL.md)
(the runtime digest shown to the model) and [docs/工程规划.md](docs/工程规划.md) §9.3
(hardening table) and §11 (risks and open questions).

## Documentation

| Document | Contents |
|---|---|
| [docs/工程规划.md](docs/工程规划.md) | **Engineering plan (source of truth)**: what to build, how, in what order, and the risks |
| [docs/鸿蒙环境能力清单-v0.11.1.md](docs/鸿蒙环境能力清单-v0.11.1.md) | **Authoritative** device-capability inventory (capability × status × root-cause layer L1–L4 + evidence + REV-1/REV-2) |
| [docs/真机验证记录.md](docs/真机验证记录.md) | Per-round device-verification environment, steps and conclusions (rounds 0–4) |
| [docs/media-placeholder-icons.md](docs/media-placeholder-icons.md) | Icon assets and generation rules (requirement 103) |
| [specs/README.md](specs/README.md) | Spec index, documentation rules, and the version-requirement (101+) list |
| [specs/001-host/](specs/001-host/) | Host (environment wiring / in-process server / readiness check) |
| [specs/101-version-0.11.1/](specs/101-version-0.11.1/) | Version convergence to 0.11.1 (spec / plan / tasks / test-cases) |
| [specs/102-harmony-js-tools/](specs/102-harmony-js-tools/) | Pure-JS tool extensions: `bash` / `find` / `grep` taken over under the same names |
| [specs/103-branding/](specs/103-branding/) | Branding: text / Logo / icon assets / version-check disabled |
| [runtime-overlays/README.md](runtime-overlays/README.md) | Runtime customization list and the prune/overlay mechanism (23 files) |
| [patches/README.md](patches/README.md) | Why this version's patch set is empty (8 candidates verified against source, one by one) |
| [config/README.md](config/README.md) | Why every runtime preset key is set the way it is |
| [extensions/README.md](extensions/README.md) | Shell-extension mechanics, authoring conventions, and the same-name takeover |
| [skills/README.md](skills/README.md) | Shell-skill format and maintenance discipline |

## Related projects

- [harmonypc-electron](https://atomgit.com/jianguoxu/harmonypc-electron) (sibling `../harmonypc-electron`) — the Electron-on-HarmonyOS runtime
- [pi](https://github.com/earendil-works/pi) (sibling `../pi`) — the wrapped host
- [pi-web](https://github.com/agegr/pi-web) (sibling `../pi-web`) — the reused UI and server

## License

MIT
