# Claude Code adapter

Claude Code 的 canonical 发现目录是：

- 用户级：`~/.claude/skills/<name>/SKILL.md`
- 项目级：`<repo-root>/.claude/skills/<name>/SKILL.md`

安装（先检查，再显式应用）：

```bash
node scripts/install-binlee.mjs --check --cli claude --scope user
node scripts/install-binlee.mjs --apply --cli claude --scope user
```

`--check` 返回 `2` 表示有可安全应用的变更，返回 `3` 表示存在冲突。普通 `--apply` 不会覆盖冲突；仅在明确确认后使用 `--force`，安装器会先创建备份。这些状态、备份和回滚能力仅属于仓库自带安装器，不属于官方 `npx skills` CLI。

直接调用：

```text
/binlee-consumer-decision
```

Claude Code 会读取 `SKILL.md` 的 `description` 决定自动触发时机；同目录下的 `scripts/`、`references/` 和语料文件也会随 skill 一起可用。
