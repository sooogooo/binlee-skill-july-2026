# OpenCode adapter

OpenCode 的 canonical 发现目录是：

- 用户级：`~/.config/opencode/skills/<name>/SKILL.md`
- 项目级：`<repo-root>/.opencode/skills/<name>/SKILL.md`
- 兼容目录：`.claude/skills` 与 `.agents/skills`

安装：

```bash
node scripts/install-binlee.mjs --cli opencode --scope user
```

OpenCode 通过原生 `skill` 工具按需加载 skill；若 skill 没有出现在列表中，先检查目录、frontmatter 和 skill 权限设置。
