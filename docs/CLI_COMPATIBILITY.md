# CLI compatibility

本仓库使用 Agent Skills 的共同格式：每个技能是一个目录，入口文件是带 YAML frontmatter 的 `SKILL.md`；脚本、参考资料和本地语料放在同一技能目录内。这样，正文不需要为某个模型重写。

目录路径来自各 CLI 的官方文档，可能随版本变化；本表在 2026-07-10 核对过。若 CLI 的安装器与本手册冲突，以该 CLI 当前版本的帮助和官方文档为准。

| CLI         | 用户级发现目录                              | 项目级发现目录                     | 调用方式                   | 本仓库支持方式                                                        |
| ----------- | ------------------------------------------- | ---------------------------------- | -------------------------- | --------------------------------------------------------------------- |
| Codex CLI   | `~/.agents/skills/<name>/SKILL.md`          | `.agents/skills/<name>/SKILL.md`   | `$skill-name` 或 `/skills` | 原生；`agents/openai.yaml` 提供可选 UI 元数据                         |
| Claude Code | `~/.claude/skills/<name>/SKILL.md`          | `.claude/skills/<name>/SKILL.md`   | `/skill-name` 或自动触发   | 原生；忽略 `agents/openai.yaml`，保留 `SKILL.md`、scripts、references |
| Gemini CLI  | `~/.gemini/skills/<name>/SKILL.md`          | `.gemini/skills/<name>/SKILL.md`   | `/skills list`、自动激活   | 原生；也支持 `.agents/skills` 兼容目录                                |
| OpenCode    | `~/.config/opencode/skills/<name>/SKILL.md` | `.opencode/skills/<name>/SKILL.md` | 原生 `skill` 工具          | 原生；也识别 `.claude/skills` 与 `.agents/skills`                     |
| 其他 CLI    | 由各工具决定                                | 由各工具决定                       | 由各工具决定               | 手动导入 `skills/` 下的 skill；不宣称原生兼容                         |

## 推荐安装

### 标准 skills CLI

本仓库支持 Vercel `skills` CLI 的标准 GitHub 安装方式：

```bash
npx skills add sooogooo/binlee-skill-july-2026
```

该命令会扫描仓库根目录的 `skills/`，当前版本可发现 8 个 Binlee skill。常用选项：

```bash
npx skills add sooogooo/binlee-skill-july-2026 --list
npx skills add sooogooo/binlee-skill-july-2026 --skill binlee-consumer-decision binlee-source-library
npx skills add sooogooo/binlee-skill-july-2026 --global --yes
```

标准 `npx skills` CLI 当前只安装 `--skill` 后显式列出的名称，不解析本仓库的依赖关系，因此上面的选择性安装命令同时列出了业务入口和语料库。若需要自动补齐依赖，请改用仓库自带安装器。

`skills-lock.json` 是官方 CLI 的状态文件，只能由官方 CLI 维护；仓库自带安装器永远不会编辑它。旧版官方 CLI 创建的项目级安装可能无法通过 `npx skills update --project` 原位升级，可改用完整仓库 URL 显式重装：

```bash
npx skills add https://github.com/sooogooo/binlee-skill-july-2026 -y
```

本项目只通过 GitHub 仓库和 `v*` 标签分发，不发布 npm 包。

### 仓库自带安装器

当需要明确指定目标 CLI 和用户级/项目级范围时，使用仓库自带安装器。先运行只读 `--check`，再运行 `--apply`：

```bash
node scripts/install-binlee.mjs --check --cli codex --scope user
node scripts/install-binlee.mjs --apply --cli codex --scope user
```

把 `codex` 替换为 `claude`、`gemini` 或 `opencode` 即可选择其他目标。项目级安装适合团队把 skill 与代码一起版本控制：

```bash
node scripts/install-binlee.mjs --check --cli claude --scope project
node scripts/install-binlee.mjs --apply --cli claude --scope project
```

只安装一个 skill：

```bash
node scripts/install-binlee.mjs --check --cli codex --scope user --skill binlee-consumer-decision
node scripts/install-binlee.mjs --apply --cli codex --scope user --skill binlee-consumer-decision
```

仓库安装器会为六个业务 skill 自动安装 `binlee-source-library`，依赖在所选 skill 之前安装且只安装一次。`binlee-help` 和 `binlee-source-library` 保持单独安装；不指定 `--skill` 时仍安装全部八个。`--dry-run` 是兼容旧流程的只读预览别名。

`--check` 报告 `missing`、`adoptable`、`current`、`upgradeable` 或 `conflict`。前四项分别表示未安装、内容一致但未受管理、已是当前版本、可安全升级；`conflict` 表示目标与可信状态不一致。退出码 `0` 表示全部 current 或写操作成功，`2` 表示有无冲突的安全待办，`3` 表示冲突阻止检查/应用/回滚，`1` 表示参数、状态或文件系统错误。

普通 `--apply` 遇到冲突时拒绝写入。显式 `--force` 会先把被替换目录备份到 `<CLI 配置根目录>/.binlee-install/backups/<transaction-id>/`，状态文件位于相邻的 `state.json`。`--rollback` 只允许回退最后一次成功事务（LIFO）；目标在安装后被修改时也会拒绝，除非同时明确使用 `--force`。所有操作只处理选中的 Binlee skill，不删除其他 skill，也不修改官方 `skills-lock.json`。

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
