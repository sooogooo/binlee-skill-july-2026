# Binlee Skills 使用手册

## 1. 先理解它是什么

Binlee 不是一个聊天机器人，也不是一套把文章自动改写成答案的提示词。它是一组按决策场景拆开的专业 workflow：

- **战略**：判断周期、定位、竞争和经营选择。
- **运营**：拆解机构的组织、渠道、交付和治理系统。
- **医生 IP**：把临床能力转成可解释、可验证的专业影响力。
- **合规风险**：识别宣传、医疗边界、病历与消费者保护风险。
- **消费者决策**：帮助普通人准备面诊、识别利益冲突和理解不确定性。
- **公共传播**：把专业观点转成公众能理解、不会误导的表达。
- **语料库**：在本地检索 582 篇文章，并保留日期、摘要、FAQ 和原文链接。

## 2. 安装

### 2.1 一条命令安装（推荐）

直接从公开 GitHub 仓库安装：

```bash
npx skills add sooogooo/binlee-skill-july-2026
```

安装前查看仓库暴露的技能：

```bash
npx skills add sooogooo/binlee-skill-july-2026 --list
```

常用变体：

```bash
# 只安装消费者决策 skill
npx skills add sooogooo/binlee-skill-july-2026 --skill binlee-consumer-decision

# 安装全部 skill，并跳过确认
npx skills add sooogooo/binlee-skill-july-2026 --all --yes

# 安装到用户级目录，而不是当前项目
npx skills add sooogooo/binlee-skill-july-2026 --global --yes
```

`npx skills add` 会从仓库根目录的 `skills/` 发现技能，并按 CLI 选择的目标写入发现目录。默认行为由 `skills` CLI 当前版本决定；如果要精确控制 Codex、Claude Code、Gemini CLI 或 OpenCode 的用户级/项目级路径，可使用下面的仓库安装器。

### 2.2 精确指定 CLI 和安装范围

先把仓库克隆到本地：

```bash
git clone https://github.com/sooogooo/binlee-skill-july-2026.git
cd binlee-skill-july-2026
```

再按所用 CLI 选择一个目标：

```bash
node scripts/install-binlee.mjs --cli codex --scope user
node scripts/install-binlee.mjs --cli claude --scope user
node scripts/install-binlee.mjs --cli gemini --scope user
node scripts/install-binlee.mjs --cli opencode --scope user
```

若团队希望把 skill 与当前项目一起提交：

```bash
node scripts/install-binlee.mjs --cli claude --scope project
```

安装前可以预览目标：

```bash
node scripts/install-binlee.mjs --cli codex --scope user --dry-run
```

## 3. 第一次使用怎么问

不要只说“帮我分析医美”。先写清楚角色、对象和交付物：

```text
用 binlee-consumer-decision，帮我把第一次面诊前必须确认的问题整理成清单。
```

```text
用 binlee-med-aesthetics-strategy，从机构老板角度判断：我们现在应该扩项目，还是先修复交付系统？
```

```text
用 binlee-public-communication，把这篇医生科普改成普通消费者看得懂、又不构成广告承诺的版本。
```

Claude Code 可直接使用 `/binlee-consumer-decision`；Codex 可使用 `$binlee-consumer-decision`；Gemini CLI 和 OpenCode 会按描述自动选择，也可以在各自的 skills 列表中确认是否加载。

## 4. 输出会遵守什么规则

每个 skill 都要求把结论拆成三层：

1. **文章中的观点**：作者在具体文章中的判断，必须保留标题、日期和原文链接。
2. **跨文归纳**：从多篇文章抽出的模式，必须说明归纳依据。
3. **需另行核验的当前事实**：法律、政策、价格、产品状态、市场数据和临床证据，不能因为出现在文章里就当成现行事实。

消费者相关回答不会从文字直接诊断、处方、指定医生或替个人选择项目。出现症状、并发症、强迫消费或明显心理压力时，回答应优先建议合适的线下专业帮助。

## 5. 语料库怎么用

不要一次加载完整的 `articles.json`。先检索，再读取具体文章：

```bash
node skills/binlee-source-library/scripts/search-corpus.mjs --query "消费者 面诊" 5
node skills/binlee-source-library/scripts/search-corpus.mjs --id "文章-id"
```

需要更新时手动运行：

```bash
bash skills/binlee-source-library/scripts/refresh-corpus.sh
```

刷新脚本会重新提取站点内嵌文章库，并一起更新正文、轻量索引和 manifest。它不会在日常问答时自动访问原站。

## 6. 如何判断一次使用是否有效

一次好的使用至少满足四点：

- 先回答了真正的决策问题，而不是复述行业名词。
- 把事实、推断、价值判断和不确定性分开。
- 给出了下一步可以执行的验证动作。
- 没有用焦虑、权威幻觉或确定性承诺推动消费。

如果答案只有“趋势、机会、赋能、闭环”等抽象词，却没有证据、边界和行动，说明应该重新缩小问题并明确调用的 skill。
