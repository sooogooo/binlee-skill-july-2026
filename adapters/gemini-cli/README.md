# Gemini CLI adapter

Gemini CLI 的 canonical 发现目录是：

- 用户级：`~/.gemini/skills/<name>/SKILL.md`
- 项目级：`<repo-root>/.gemini/skills/<name>/SKILL.md`
- 兼容目录：`~/.agents/skills` 或 `<repo-root>/.agents/skills`

安装：

```bash
node scripts/install-binlee.mjs --cli gemini --scope user
```

使用 `/skills list` 检查发现结果，使用 `/skills reload` 重新扫描。Gemini CLI 可能要求对远程 skill 的安装和激活分别确认；这是安全机制，不是 Binlee 的错误。
