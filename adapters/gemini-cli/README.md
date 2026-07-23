# Gemini CLI adapter

Gemini CLI 的 canonical 发现目录是：

- 用户级：`~/.gemini/skills/<name>/SKILL.md`
- 项目级：`<repo-root>/.gemini/skills/<name>/SKILL.md`
- 兼容目录：`~/.agents/skills` 或 `<repo-root>/.agents/skills`

安装（先检查，再显式应用）：

```bash
node scripts/install-binlee.mjs --check --cli gemini --scope user
node scripts/install-binlee.mjs --apply --cli gemini --scope user
```

`--check` 返回 `2` 表示有可安全应用的变更，返回 `3` 表示存在冲突。普通 `--apply` 不会覆盖冲突；仅在明确确认后使用 `--force`，安装器会先创建备份。这些状态、备份和回滚能力仅属于仓库自带安装器，不属于官方 `npx skills` CLI。

使用 `/skills list` 检查发现结果，使用 `/skills reload` 重新扫描。Gemini CLI 可能要求对远程 skill 的安装和激活分别确认；这是安全机制，不是 Binlee 的错误。
