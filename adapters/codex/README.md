# Codex adapter

Codex 的 canonical 发现目录是：

- 用户级：`~/.agents/skills/<name>/SKILL.md`
- 项目级：`<repo-root>/.agents/skills/<name>/SKILL.md`

安装：

```bash
node scripts/install-binlee.mjs --cli codex --scope user
```

在 Codex CLI/IDE 中可用 `$skill-name` 显式调用，也可以让 Codex 按 `description` 自动选择。`agents/openai.yaml` 只提供 Codex/ChatGPT 界面元数据，其他 CLI 不依赖它。
