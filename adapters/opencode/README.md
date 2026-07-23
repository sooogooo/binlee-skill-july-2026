# OpenCode adapter

OpenCode 的 canonical 发现目录是：

- 用户级：`~/.config/opencode/skills/<name>/SKILL.md`
- 项目级：`<repo-root>/.opencode/skills/<name>/SKILL.md`
- 兼容目录：`.claude/skills` 与 `.agents/skills`

安装（先检查，再显式应用）：

```bash
node scripts/install-binlee.mjs --check --cli opencode --scope user
node scripts/install-binlee.mjs --apply --cli opencode --scope user
```

`--check` 返回 `2` 表示有可安全应用的变更，返回 `3` 表示存在冲突。普通 `--apply` 不会覆盖冲突；仅在明确确认后使用 `--force`，安装器会先创建备份。这些状态、备份和回滚能力仅属于仓库自带安装器，不属于官方 `npx skills` CLI。

OpenCode 通过原生 `skill` 工具按需加载 skill；若 skill 没有出现在列表中，先检查目录、frontmatter 和 skill 权限设置。
