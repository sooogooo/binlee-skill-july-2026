# Claude Code adapter

Claude Code 的 canonical 发现目录是：

- 用户级：`~/.claude/skills/<name>/SKILL.md`
- 项目级：`<repo-root>/.claude/skills/<name>/SKILL.md`

安装：

```bash
node scripts/install-binlee.mjs --cli claude --scope user
```

直接调用：

```text
/binlee-consumer-decision
```

Claude Code 会读取 `SKILL.md` 的 `description` 决定自动触发时机；同目录下的 `scripts/`、`references/` 和语料文件也会随 skill 一起可用。
