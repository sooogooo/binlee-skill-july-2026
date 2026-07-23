# Codex adapter

Codex 的 canonical 发现目录是：

- 用户级：`~/.agents/skills/<name>/SKILL.md`
- 项目级：`<repo-root>/.agents/skills/<name>/SKILL.md`

安装（先检查，再显式应用）：

```bash
node scripts/install-binlee.mjs --check --cli codex --scope user
node scripts/install-binlee.mjs --apply --cli codex --scope user
```

`--check` 返回 `2` 表示有可安全应用的变更，返回 `3` 表示存在冲突。普通 `--apply` 不会覆盖冲突；仅在明确确认后使用 `--force`，安装器会先创建备份。这些状态、备份和回滚能力仅属于仓库自带安装器，不属于官方 `npx skills` CLI。

在 Codex CLI/IDE 中可用 `$skill-name` 显式调用，也可以让 Codex 按 `description` 自动选择。`agents/openai.yaml` 只提供 Codex/ChatGPT 界面元数据，其他 CLI 不依赖它。
