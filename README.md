# Binlee Skills · 医美信任闭环

一套面向医美机构经营者、医生、监管研究者与普通消费者的 Agent Skills。它把行业判断、机构运营、医生 IP、合规风险、消费者决策和公共传播放进同一个可追溯的知识系统。

这不是“让 AI 多背一点医美术语”。它的重点是：让 AI 在面对医美问题时，知道该查什么、如何区分文章观点与当前事实、如何把不确定性讲清楚，以及什么时候不应该给出个体化结论。

## 快速开始

### 推荐：用 skills CLI 安装

仓库中的 `skills/` 是唯一真源，已按 Agent Skills 的标准目录组织。直接运行下面的命令即可从 GitHub 安装整套技能：

```bash
npx skills add sooogooo/binlee-skill-july-2026
```

先查看可安装的技能，不写入本地目录：

```bash
npx skills add sooogooo/binlee-skill-july-2026 --list
```

只安装一个业务入口及其语料库依赖，或跳过确认提示：

```bash
npx skills add sooogooo/binlee-skill-july-2026 --skill binlee-consumer-decision binlee-source-library
npx skills add sooogooo/binlee-skill-july-2026 --all --yes
```

标准 `npx skills` CLI 当前不会解析 skill 之间的依赖，因此上面的 `--skill` 同时显式列出了业务入口和语料库。也可以使用下面的仓库安装器，它会自动解析这项依赖。

需要安装到用户级目录时加 `--global`；不加时由 `skills` CLI 按当前项目环境选择项目级安装。`npx skills` 会按目标 CLI 的发现规则写入对应目录。

`skills-lock.json` 属于官方 `skills` CLI，由官方 CLI 自己维护；仓库安装器不会读取或修改它。旧版官方 CLI 创建的项目级记录可能无法通过 `npx skills update --project` 原位更新，此时使用完整仓库 URL 显式重装：

```bash
npx skills add https://github.com/sooogooo/binlee-skill-july-2026 -y
```

本项目只通过 GitHub 仓库和现有 `v*` 标签分发，不发布 npm 包。

### 进阶：使用仓库自带安装器

当你需要明确指定 Codex、Claude Code、Gemini CLI 或 OpenCode，以及用户级/项目级路径时，先克隆仓库。推荐先用 `--check` 做只读检查，确认状态后再用 `--apply`：

```bash
git clone https://github.com/sooogooo/binlee-skill-july-2026.git
cd binlee-skill-july-2026

node scripts/install-binlee.mjs --check --cli codex --scope user
node scripts/install-binlee.mjs --apply --cli codex --scope user
```

只安装一个 skill：

```bash
node scripts/install-binlee.mjs --check --cli claude --scope project --skill binlee-consumer-decision
node scripts/install-binlee.mjs --apply --cli claude --scope project --skill binlee-consumer-decision
```

检查结果有五种：`missing` 表示尚未安装；`adoptable` 表示已有副本与当前版本完全一致、可纳入管理；`current` 表示已是当前版本；`upgradeable` 表示受管理的旧副本可安全升级；`conflict` 表示本地内容与可信状态不一致。`--check` 的退出码为 `0`（全部 current）、`2`（有安全待办）、`3`（有冲突）；参数、文件系统或其他运行错误返回 `1`。

安全 `--apply` 遇到冲突会拒绝写入。只有明确使用 `--force` 才会覆盖冲突目录，并先在 `<CLI 根目录>/.binlee-install/backups/<transaction-id>/` 保存完整备份；状态保存在相邻的 `state.json`。`--rollback` 只回退最后一次成功事务（LIFO），回退前发现后续本地改动时同样拒绝，除非同时使用 `--force`。安装器只管理选中的 Binlee 目录，不删除或改写无关 skill。

选择六个业务 skill 中的任意一个时，仓库安装器会先安装 `binlee-source-library`，再安装所选 skill。直接选择 `binlee-help` 或 `binlee-source-library` 时仍只安装一个；`--dry-run` 是兼容旧流程的预览别名，不写入文件。完整说明见 [详细使用手册](docs/USER_GUIDE.md)、[CLI 兼容性说明](docs/CLI_COMPATIBILITY.md) 和 [推广长文](copy/PROMOTION_LONGFORM_ZH-CN.md)。

## 快速帮助

不知道该调用哪个入口时，直接使用：

```text
请使用 binlee-help，帮我选择合适的 Binlee skill，并给出可复制的提问方式。
```

Codex 可使用 `$binlee-help`，Claude Code 可使用 `/binlee-help`。它会优先给出一个默认推荐，不要求你先完成一轮问答。

## 六个应用 skill + 一个帮助路由 + 一个语料库 skill

| Skill                            | 解决的问题                               |
| -------------------------------- | ---------------------------------------- |
| `binlee-med-aesthetics-strategy` | 周期、定位、竞争与经营决策               |
| `binlee-clinic-operations`       | 组织、渠道、医生协作与运营系统           |
| `binlee-doctor-ip`               | 医生创业、专业表达与个人品牌             |
| `binlee-compliance-risk`         | 宣传、医疗边界与消费者保护风险           |
| `binlee-consumer-decision`       | 普通消费者的信息辨别、面诊准备与风险识别 |
| `binlee-public-communication`    | 面向公众的医美内容与信任审查             |
| `binlee-source-library`          | 检索、引用和刷新本地文章语料             |
| `binlee-help`                    | 查看能力、选择入口和获得下一步建议       |

## 语料库

`binlee-source-library` 保存从 [drli.beaucare.org](https://drli.beaucare.org) 提取并按原文来源去重的 577 篇文章全文、摘要、FAQ、日期和原文链接。语料是可追溯的作者观点库，不是现行临床、法律或市场事实的替代品。

每个 skill 都要求区分：**文章中的观点**、**跨文归纳**、**需另行核验的当前事实**。消费者 skill 不做诊断、不替个人选择项目或医生；公共传播 skill 会检查焦虑营销、隐性推广、虚假确定性和利益冲突。

## 仓库结构

```text
skills/       canonical skill source
adapters/     每个 CLI 的发现目录与安装说明
docs/         使用、兼容性和维护手册
copy/         项目介绍、CLI 上架文案和推广素材
scripts/      跨 CLI 安装器
```

对外介绍项目时，可直接使用 [简体中文推广长文](copy/PROMOTION_LONGFORM_ZH-CN.md)，再按平台调整标题、摘要和篇幅。

## 适用对象

机构老板可以用它做经营判断，医生可以用它建设专业 IP，监管研究者可以用它梳理行业叙事与风险，消费者可以用它准备面诊并识别信息差。四类人看到的是不同入口，但共享同一套证据与传播边界。

## 贡献与更新

先读 [贡献与维护说明](docs/CONTRIBUTING.md)。先预览语料变化：

```bash
bash skills/binlee-source-library/scripts/refresh-corpus.sh --check
```

确认新增、删除和修改记录合理后，再运行 `bash skills/binlee-source-library/scripts/refresh-corpus.sh --apply`。刷新只在手动运行时访问源站；日常使用通过本地 `articles.json` 和轻量索引完成检索。
