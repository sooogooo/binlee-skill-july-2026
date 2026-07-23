# Binlee Skills v1.1.0

Released 2026-07-23.

## What changed

- The repository installer now distinguishes `missing`, `adoptable`, `current`, `upgradeable`, and `conflict` targets from normalized file hashes.
- Safe apply refuses local conflicts. Explicit force creates a complete backup before replacement, and rollback is limited to the latest successful transaction.
- The release includes a deterministic manifest for all 8 canonical skills, with package/version and CI release gates.

## Install this tag

This project is distributed from the GitHub repository and existing tags only. There is no npm package release.

```bash
git clone --branch v1.1.0 --depth 1 https://github.com/sooogooo/binlee-skill-july-2026.git
cd binlee-skill-july-2026
```

## Check, apply, force, and rollback

Run the read-only check before applying changes:

```bash
node scripts/install-binlee.mjs --check --cli codex --scope user
node scripts/install-binlee.mjs --apply --cli codex --scope user
```

Replace `codex` with `claude`, `gemini`, or `opencode`, and choose `user` or `project`. Add `--skill <name>` for a selective install; the installer automatically includes `binlee-source-library` when a selected business skill requires it.

If check reports `conflict`, ordinary apply exits without writing. Review the local changes before explicitly replacing them:

```bash
node scripts/install-binlee.mjs --force --cli codex --scope user
```

Force stores backups under `<CLI root>/.binlee-install/backups/<transaction-id>/`; installer state is `<CLI root>/.binlee-install/state.json`. Rollback restores only the latest successful transaction (LIFO):

```bash
node scripts/install-binlee.mjs --rollback --cli codex --scope user
node scripts/install-binlee.mjs --rollback <transaction-id> --cli codex --scope user
```

Rollback refuses post-install local changes with exit code `3`. Add `--force` only after reviewing those changes. Unrelated skills in the same discovery directory are preserved.

## Status and exit compatibility

| Exit | Meaning                                                                    |
| ---- | -------------------------------------------------------------------------- |
| `0`  | Check is current, or the requested write completed                         |
| `2`  | Check found safe pending work: missing, adoptable, or upgradeable          |
| `3`  | A conflict blocked check, apply, or rollback                               |
| `1`  | Invalid arguments, invalid state, symbolic links, or another runtime error |

The official `skills` CLI continues to own `skills-lock.json`; this repository installer never edits it. Legacy official project installs that cannot use `npx skills update --project` may require an explicit reinstall:

```bash
npx skills add https://github.com/sooogooo/binlee-skill-july-2026 -y
```

Codex, Claude Code, Gemini CLI, and OpenCode discovery paths remain compatible with v1.0.0. Node.js 20 or newer is required for repository scripts.
