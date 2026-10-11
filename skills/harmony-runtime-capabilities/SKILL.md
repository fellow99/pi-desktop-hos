---
name: harmony-runtime-capabilities
description: What this HarmonyOS build of Pi can and cannot do — which built-in tools work, why `find` and `grep` are unavailable (they need external binaries), what `bash` actually spawns, why a subprocess cannot run Node, and which file operations behave differently. Read this before assuming a tool or command works.
whenToUse: Before running shell commands with `bash`, before using `find`/`grep`, when a tool reports a missing binary, when writing files outside the session workspace, or when a tool seems to be absent.
---

# HarmonyOS runtime capabilities

This deployment runs inside a HarmonyOS HAP on the Electron-on-HarmonyOS runtime. The
platform removes several capabilities that a normal Pi install has, and the shell is not a
Linux desktop shell. Check the facts below before you spend turns discovering them.

The host is Pi's own agent runtime running inside an Electron main process, together with the
Pi Web server. Everything that is pure JavaScript works. Everything that needs an **external
executable**, a **TTY**, or **JIT in a child process** does not.

## Available tools

| Tool | Status | Why |
|---|---|---|
| `read` / `write` / `edit` | **available** | pure Node.js |
| `ls` | **available** | pure Node.js (`fs.readdir`) |
| `bash` | **available, with caveats** | spawns the system `sh`; see below |
| `find` | **unavailable** | shells out to the `fd` binary, which this device does not have and which cannot be downloaded |
| `grep` | **unavailable** | shells out to the `ripgrep` (`rg`) binary, same reason |
| `powershell` | **absent** | Windows-only tool |

`find` and `grep` will fail with an error such as `fd is not available and could not be
downloaded`. That is expected, not a temporary fault: this build runs with `PI_OFFLINE=1`, so
Pi never tries to fetch a binary, and the device ships neither `fd` nor `rg`.

**Use `bash` instead of `find`/`grep`.** The toybox applets are the working replacement:

```
bash("find . -name '*.ts'")          # not the find tool; the shell command
bash("grep -rn 'pattern' src")       # not the grep tool; the shell command
bash("ls -la")
```

They are ordinary toybox applets, not the model-facing tools, and they work. This is a
name collision worth remembering: "`find` does not work" is true of the *tool* and false of
the *command*.

## Command execution (`bash`)

`bash` is available. It spawns a real shell — **`/system/bin/sh`, which is mksh R59** — using
the application's own permissions, and it does **not** use a PTY.

What this means in practice:

- There is **no TTY**. Interactive programs (editors, pagers, `top`, anything waiting on a
  terminal) are unsupported. Use non-interactive forms.
- `bash` is the tool's name, not the shell's. There is no `bash` binary on the device; the
  command runs under `sh`. GNU-only tools (`bash`, `busybox`, `vi`, `strace`) do **not** exist.
- Directly runnable are the coreutils-style commands (`pwd`, `ls`, `cat`, `grep`, `sed`,
  `wc`, …) and any toybox applet reached as `toybox <name>`.
- **`git` is not shipped at all.** There is no `git` binary and no way to install one. Any
  version-control operation must be done by reading and writing files directly.
- **`curl` is not available.** Network access from the agent's tools goes through the
  `web_search` / `web_fetch` tools, not the shell.
- `node`, `npm`, `npx`, `pnpm`, `python` are **not** on `PATH` for this application. Do not
  try to run them.
- A non-zero exit code is a normal result, not a tool error.
- **No command in `bash` is fenced.** The shell runs with the application's full file access,
  so it can read and write wherever the application can — including outside the session
  workspace, bypassing the file-approval flow. Prefer the `read`/`write`/`edit` tools for
  file work, and reach for `bash` only when nothing else fits.
- **The first spawn of the shell is what makes a command possible at all; there is no
  per-command `workdir` parameter.** State (`cd`, shell variables) does not reliably persist
  between `bash` calls — pass an absolute path or `cd` within the same command line.

### Do not try to launch Node from a subprocess

A subprocess cannot run a Node script on this device. `node -e …`, `node script.js`, and
`npm -v` all die with **`Signal 31 (core dumped)`** — SIGSYS, from seccomp refusing the JIT's
executable-memory allocation. Note that `node -v` *does* print a version, so the failure only
appears once real code runs. This is a hard platform limit, not a configuration mistake, and
it is not lifted by any approval or permission.

The practical consequence: anything that needs a JavaScript runtime must run **inside the
agent process** (which is where Pi itself runs), never in a child process.

## Listing and finding files

- `ls` lists a directory (pure Node.js) — use it for a plain directory listing.
- To search by pattern, use shell commands: `bash("find . -name '*.json'")`.
- To search file contents, use `bash("grep -rn '…' <dir>")`.

## Paths, sandbox, and user directories

- The session workspace is a directory inside the application sandbox, under
  `/data/storage/el2/base/files/`.
- Pi's data directory is
  `/data/storage/el2/base/files/pi-agent/` (it is redirected there by
  `PI_CODING_AGENT_DIR`). Sessions, settings, skills, extensions, and credentials live there.
- The **user's home directory** (`/storage/Users/currentUser`) is **not writable** by the
  application. `Desktop`, `Documents`, and `Download` are separate HarmonyOS system
  permissions: the user must grant them in
  *Settings → Apps → this app → Allow access*, and then **restart the app** before writes
  succeed. A write may still fail after any in-app approval, because the in-app approval is
  not an OS grant. Prefer keeping artifacts inside the workspace and telling the user where
  they are.
- `symlink` is refused by the application sandbox (`EACCES`). Anything that would create a
  symlink must copy instead.
- **A new file created outside the workspace can fail** even when overwriting an existing
  file works: the atomic-create path uses a hard link, which the shared user-directory
  filesystem (`hmdfs`) rejects. If a create fails there, get the target to exist first (or
  create it inside the workspace) and then write to it.
- `chmod` is not honored on the shared user-directory volume: the call succeeds but the mode
  that comes back is not the one you asked for. Inside the workspace it works normally.

## Network access

- The agent's HTTP access is through `web_search` / `web_fetch`. The shell has no special
  network grant and no `curl`.
- The Pi Web server listens on the device's **LAN address**, not on `127.0.0.1`: the platform
  isolates loopback between processes, so the renderer reaches the server over the local
  network interface. A password is always set for that server.

## Related reading

The project's capability inventory, with the root cause (platform limit vs. missing native
artifact vs. this build's own configuration choice vs. an upstream API gap) and the recovery
plan for each gap, lives in the repository at
`pi-desktop-hos/docs/工程规划.md` §9.3 (degradation table) and §11 (risks and open questions).
Read it when you need to know whether a limitation is fixable.
