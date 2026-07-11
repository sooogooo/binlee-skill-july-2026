# CLI compatibility

本仓库使用 Agent Skills 的共同格式：每个技能是一个目录，入口文件是带 YAML frontmatter 的 `SKILL.md`；脚本、参考资料和本地语料放在同一技能目录内。这样，正文不需要为某个模型重写。

目录路径来自各 CLI 的官方文档，可能随版本变化；本表在 2026-07-10 核对过。若 CLI 的安装器与本手册冲突，以该 CLI 当前版本的帮助和官方文档为准。

| CLI | 用户级发现目录 | 项目级发现目录 | 调用方式 | 本仓库支持方式 |
| --- | --- | --- | --- | --- |
| Codex CLI | `~/.agents/skills/<name>/SKILL.md` | `.agents/skills/<name>/SKILL.md` | `$skill-name` 或 `/skills` | 原生；`agents/openai.yaml` 提供可选 UI 元数据 |
| Claude Code | `~/.claude/skills/<name>/SKILL.md` | `.claude/skills/<name>/SKILL.md` | `/skill-name` 或自动触发 | 原生；忽略 `agents/openai.yaml`，保留 `SKILL.md`、scripts、references |
| Gemini CLI | `~/.gemini/skills/<name>/SKILL.md` | `.gemini/skills/<name>/SKILL.md` | `/skills list`、自动激活 | 原生；也支持 `.agents/skills` 兼容目录 |
| OpenCode | `~/.config/opencode/skills/<name>/SKILL.md` | `.opencode/skills/<name>/SKILL.md` | 原生 `skill` 工具 | 原生；也识别 `.claude/skills` 与 `.agents/skills` |
| 其他 CLI | 由各工具决定 | 由各工具决定 | 由各工具决定 | 手动导入 `skills/` 下的 skill；不宣称原生兼容 |

## 推荐安装

### 标准 skills CLI

本仓库支持 Vercel `skills` CLI 的标准 GitHub 安装方式：

```bash
npx skills add sooogooo/binlee-skill-july-2026
```

该命令会扫描仓库根目录的 `skills/`，当前版本可发现 8 个 Binlee skill。常用选项：

```bash
npx skills add sooogooo/binlee-skill-july-2026 --list
npx skills add sooogooo/binlee-skill-july-2026 --skill binlee-consumer-decision
npx skills add sooogooo/binlee-skill-july-2026 --global --yes
```

### 仓库自带安装器

当需要明确指定目标 CLI 和用户级/项目级范围时，使用仓库自带安装器。它只负责把 canonical `skills/` 复制到目标发现目录：

```bash
node scripts/install-binlee.mjs --cli codex --scope user
node scripts/install-binlee.mjs --cli claude --scope user
node scripts/install-binlee.mjs --cli gemini --scope user
node scripts/install-binlee.mjs --cli opencode --scope user
```

项目级安装适合团队把 skill 与代码一起版本控制：

```bash
node scripts/install-binlee.mjs --cli claude --scope project
```

只安装一个 skill：

```bash
node scripts/install-binlee.mjs --cli codex --scope user --skill binlee-consumer-decision
```

## CLI 差异的处理原则

- 只把跨 CLI 都能理解的规则写进 `SKILL.md`。
- Codex 专属展示信息放在 `agents/openai.yaml`，不让 Claude、Gemini、OpenCode 依赖它。
- 不在 canonical skill 中使用 `${CLAUDE_SKILL_DIR}`、`$ARGUMENTS` 等 Claude 专属替换；需要 CLI 特定能力时，写入对应 adapter 文档。
- 语料检索命令使用相对 skill 目录的路径，安装到不同 CLI 后仍然有效。

## 官方参考

- [Codex: Build skills](https://developers.openai.com/codex/skills/)
- [Claude Code: Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Gemini CLI: Managing Agent Skills](https://geminicli.com/docs/cli/using-agent-skills/)
- [OpenCode: Agent Skills](https://dev.opencode.ai/docs/skills)
