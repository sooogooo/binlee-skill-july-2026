# Binlee Skills 简体中文详细使用手册

## 1. 先理解：它不是一个“医美问答机器人”

Binlee Skills 是一组按决策场景拆开的 Agent Skills。它把从 `drli.beaucare.org` 整理并按原文来源去重的 577 篇文章保存在本地，再用八个入口处理不同问题：七个专业入口加一个帮助与路由入口。

| Skill                            | 适合处理的问题                                   | 不适合替代的工作               |
| -------------------------------- | ------------------------------------------------ | ------------------------------ |
| `binlee-med-aesthetics-strategy` | 行业周期、定位、竞争、定价与经营选择             | 直接预测市场、替代尽调         |
| `binlee-clinic-operations`       | 组织、渠道、交付、医生协作与运营系统             | 用“增长话术”掩盖交付问题       |
| `binlee-doctor-ip`               | 医生定位、专业内容、创业与个人品牌               | 把医生包装成销售代言人         |
| `binlee-compliance-risk`         | 宣传、医疗边界、记录、消费者保护与风险分级       | 在没有最新法源时给法律结论     |
| `binlee-consumer-decision`       | 消费者澄清需求、准备面诊、识别利益冲突           | 诊断、处方、指定项目或医生     |
| `binlee-public-communication`    | 科普、媒体回应、机构内容与公众信任审查           | 把不确定性写成确定承诺         |
| `binlee-source-library`          | 本地文章检索、引用、溯源与语料刷新               | 把旧文章当成当前法规或临床证据 |
| `binlee-help`                    | 查看能力、选择入口、获得最短提问模板和下一步建议 | 代替专业 skill 做实际诊断      |

七个专业入口共享同一套证据纪律：把**文章中的观点**、**跨文归纳**和**需另行核验的当前事实**分开；`binlee-help`负责把任务路由到它们。这个分层是整套技能最重要的安全阀。

## 2. 安装

### 2.1 推荐：用 `skills` CLI

在任意项目目录运行：

```bash
npx skills add sooogooo/binlee-skill-july-2026
```

第一次运行时，CLI 可能会询问安装范围和目标 Agent。按照自己的使用场景选择即可。

安装前先查看仓库里的技能：

```bash
npx skills add sooogooo/binlee-skill-july-2026 --list
```

只安装一个业务入口及其语料库依赖：

```bash
npx skills add sooogooo/binlee-skill-july-2026 \
  --skill binlee-consumer-decision binlee-source-library
```

标准 `npx skills` CLI 当前不会读取仓库内部的 skill 依赖，因此上面的命令同时显式选择了两个 skill。六个业务 skill 都需要本地语料库；如果希望自动补齐依赖，请使用 2.2 节的仓库安装器。

自动安装全部技能并跳过确认：

```bash
npx skills add sooogooo/binlee-skill-july-2026 --all --yes
```

安装到用户级目录：

```bash
npx skills add sooogooo/binlee-skill-july-2026 --global --yes
```

仓库根目录的 `skills/` 是唯一真源。标准 CLI 会从那里发现八个 skill，并根据目标 Agent 写入对应发现目录。

官方 CLI 的 `skills-lock.json` 只属于官方 CLI；仓库安装器从不读取或修改它。旧版官方 CLI 创建的项目级记录可能无法用 `npx skills update --project` 原位更新，此时用完整 URL 显式重装：

```bash
npx skills add https://github.com/sooogooo/binlee-skill-july-2026 -y
```

Binlee Skills 只通过 GitHub 仓库和已有 `v*` 标签分发。`package.json` 保持 `private: true`，没有 npm 发布物。

### 2.2 需要精确控制时使用仓库安装器

如果你要明确指定 Codex、Claude Code、Gemini CLI 或 OpenCode，以及用户级还是项目级目录，可以先克隆仓库。每次安装或升级都先运行只读 `--check`，再决定是否 `--apply`：

```bash
git clone https://github.com/sooogooo/binlee-skill-july-2026.git
cd binlee-skill-july-2026

node scripts/install-binlee.mjs --check --cli codex --scope user
node scripts/install-binlee.mjs --apply --cli codex --scope user
```

把 `codex` 换成 `claude`、`gemini` 或 `opencode` 即可选择其他 CLI。项目级安装适合把 skill 和项目代码一起版本控制：

```bash
node scripts/install-binlee.mjs --check --cli claude --scope project
node scripts/install-binlee.mjs --apply --cli claude --scope project
```

只检查并安装一个 skill：

```bash
node scripts/install-binlee.mjs --check --cli codex --scope project --skill binlee-consumer-decision
node scripts/install-binlee.mjs --apply --cli codex --scope project --skill binlee-consumer-decision
```

仓库安装器维护明确的依赖映射。选择 `binlee-med-aesthetics-strategy`、`binlee-clinic-operations`、`binlee-doctor-ip`、`binlee-compliance-risk`、`binlee-consumer-decision` 或 `binlee-public-communication` 时，它会先处理 `binlee-source-library`，再处理所选 skill。选择 `binlee-help` 或 `binlee-source-library` 时仍只处理一个；不传 `--skill` 时处理全部八个。

`--check` 会为每个目录报告一种状态：

| 状态          | 含义                                                    | 安全动作                                          |
| ------------- | ------------------------------------------------------- | ------------------------------------------------- |
| `missing`     | 目标目录不存在                                          | `--apply` 可安装                                  |
| `adoptable`   | 目标内容与当前 canonical 内容完全一致，但尚无安装器状态 | `--apply` 只纳入管理                              |
| `current`     | 内容和版本都与当前 release 一致                         | 无需动作                                          |
| `upgradeable` | 目标仍与已记录版本一致，canonical 内容或版本已更新      | `--apply` 可升级                                  |
| `conflict`    | 目标含未受信任内容，或受管理副本被本地修改              | 普通 `--apply` 拒绝；检查后才能决定是否 `--force` |

退出码是自动化脚本的稳定接口：

| 退出码 | 含义                                                             |
| ------ | ---------------------------------------------------------------- |
| `0`    | 检查全部为 `current`，或写操作成功                               |
| `2`    | `--check` 发现 `missing`、`adoptable` 或 `upgradeable`，没有冲突 |
| `3`    | 冲突阻止检查、应用或回滚                                         |
| `1`    | 参数、状态、符号链接或其他文件系统错误                           |

`--apply` 遇到 `conflict` 时不会写入任何目标或状态。确认确实要舍弃冲突内容后，显式强制安装：

```bash
node scripts/install-binlee.mjs --force --cli codex --scope project --skill binlee-consumer-decision
```

`--force` 会先完整备份将被替换的 Binlee 目录。状态保存在 `<CLI 配置根目录>/.binlee-install/state.json`，备份保存在 `<CLI 配置根目录>/.binlee-install/backups/<transaction-id>/`。例如 Codex 项目级安装使用 `.agents/.binlee-install/`，Claude 用户级安装使用 `~/.claude/.binlee-install/`。

回滚只允许撤销最后一次成功事务（LIFO）：

```bash
node scripts/install-binlee.mjs --rollback --cli codex --scope project
node scripts/install-binlee.mjs --rollback <transaction-id> --cli codex --scope project
```

如果安装后又改过目标目录，普通回滚会以退出码 `3` 拒绝覆盖；只有审查改动后显式加入 `--force` 才会继续。安装和回滚只处理事务记录中的 Binlee skill，目标发现目录里的其他 skill 和无关数据会保留。`--dry-run` 仍可作为旧流程的只读预览别名，但新流程推荐 `--check`。

安装器只复制技能文件，不写入 API key、账号凭据或项目业务数据，也不修改源仓库或 `skills-lock.json`。

### 2.3 不知道用哪个 skill 时

直接输入：

```text
请使用 binlee-help，帮我选择合适的 Binlee skill，并给出可复制的提问方式。
```

它会先给一个默认入口和提示词，不会把你卡在“请先选择角色、平台、格式”的确认流程里。只有安全边界、法律辖区或关键事实缺失会改变结果时，专业 skill 才会追问。

## 3. 不同 CLI 怎么调用

| CLI         | 用户级目录                   | 项目级目录          | 常见调用方式                                |
| ----------- | ---------------------------- | ------------------- | ------------------------------------------- |
| Codex CLI   | `~/.agents/skills/`          | `.agents/skills/`   | `$binlee-consumer-decision`，或直接描述任务 |
| Claude Code | `~/.claude/skills/`          | `.claude/skills/`   | `/binlee-consumer-decision`                 |
| Gemini CLI  | `~/.gemini/skills/`          | `.gemini/skills/`   | `/skills list` 后按描述调用                 |
| OpenCode    | `~/.config/opencode/skills/` | `.opencode/skills/` | 由 `skill` 工具按描述调用                   |

如果 CLI 没有自动触发，直接在问题中写出 skill 名称。显式调用比等待自动识别更稳：

```text
请使用 binlee-compliance-risk，审查下面这段医美宣传文案。
```

## 4. 选哪个 skill：一个简单判断法

先问自己：**我现在要做的是判断、改善、表达，还是核验？**

- 要判断行业方向、扩项目还是收缩：`binlee-med-aesthetics-strategy`
- 要解决机构内部的转化、交付、协作或复购问题：`binlee-clinic-operations`
- 要帮医生建立专业定位和内容系统：`binlee-doctor-ip`
- 要审查广告、话术、流程或记录风险：`binlee-compliance-risk`
- 要帮助普通人准备面诊和比较信息：`binlee-consumer-decision`
- 要写科普、媒体回应或公众内容：`binlee-public-communication`
- 要找原文、追溯观点或刷新本地语料：`binlee-source-library`
- 不知道从哪里开始、想找下一步：`binlee-help`

一个问题可以连续调用多个 skill，但要分阶段。比如“推出一个新项目”可以这样走：

1. 用 `binlee-med-aesthetics-strategy` 判断是否真的值得做。
2. 用 `binlee-clinic-operations` 评估交付能力和组织成本。
3. 用 `binlee-compliance-risk` 检查宣传、流程和证据留存。
4. 用 `binlee-public-communication` 把结果写成公众能理解的内容。
5. 如果需要从消费者角度检查信息是否公平，再调用 `binlee-consumer-decision`。

不要让一个 skill 包办所有事情。分开调用，结论更容易复核，也更容易发现冲突。

## 5. 怎么提问，答案会明显变好

一个好问题至少包含六项：**角色、背景、决策、对象、边界、交付格式**。

可以直接套用这个模板：

```text
请使用 [skill 名称]。

我的角色：我是 [机构老板/医生/监管研究者/消费者/内容编辑]。
背景： [已有事实、时间范围、所在地区、可用资源]。
我真正要决定的是： [一个具体选择，而不是泛泛分析]。
请面向： [内部团队/患者/普通消费者/监管部门/公众]。
请区分：文章观点、跨文归纳、需要实时核验的事实。
请输出： [决策备忘录/检查表/面诊问题清单/文章大纲/风险矩阵]。
请说明：不确定性、反例、下一步验证动作。
```

### 5.1 机构老板：从“想增长”改成可执行决策

```text
请使用 binlee-med-aesthetics-strategy。
我是一个中型医美机构负责人，正在考虑新增一个轻医美项目。
请不要只写行业趋势，先列出这个决定依赖的关键假设，再比较“立即上线、先做小规模试点、暂缓”三种方案。
输出：决策备忘录、需要验证的数据、两周内可做的低成本实验，以及会伤害消费者信任的做法。
```

### 5.2 机构运营：把症状拆成系统问题

```text
请使用 binlee-clinic-operations。
我们的到店咨询量上升，但交付投诉和医生排班冲突也在增加。
请分别检查需求、转化、临床交付、团队协作、复购和合规六个环节，给出根因假设、指标、负责人、复盘日期和不可接受的风险。
```

### 5.3 医生：做专业 IP，不做销售脚本

```text
请使用 binlee-doctor-ip。
我是做面部年轻化的医生，想在视频号和公众号建立长期专业影响力。
请根据我的真实能力和患者常见决策问题，设计 4 个内容支柱、每个支柱的 5 个选题、证据边界和一份发布前检查表。
不要使用焦虑营销、夸大案例或无法核验的效果承诺。
```

### 5.4 普通消费者：让下一次面诊更安全

```text
请使用 binlee-consumer-decision。
我正在考虑一次医美咨询，但还没有决定项目或机构。
请帮我把“我想改善什么、我需要问什么、哪些信息要核验、哪些话术需要警惕”整理成一页清单。
不要诊断我，也不要直接推荐项目、医生或机构。
```

### 5.5 内容编辑：把专业内容讲清楚

```text
请使用 binlee-public-communication。
下面是一篇医生科普初稿。
请先做 claim map，把每个关键句标成事实、解释、价值判断或不确定性；再改成普通消费者能看懂的版本。
请保留必要的风险提示，删除隐性广告、制造焦虑和确定性承诺。
```

## 6. 语料库怎么工作

日常使用不需要反复打开原网站。`binlee-source-library` 已经把文章正文、标题、日期、摘要、FAQ 和原文链接保存在本地。

搜索时不要直接打开完整的 `articles.json`，先用检索脚本缩小范围。多个关键词用空格分隔，结果会返回相关性分数、实际命中的关键词和上下文片段：

```bash
node skills/binlee-source-library/scripts/search-corpus.mjs \
  --query "消费者 面诊" 5
```

找到文章 ID 后，再读取完整记录：

```bash
node skills/binlee-source-library/scripts/search-corpus.mjs \
  --id "文章-id"
```

需要更新语料时，先预览源站变化：

```bash
bash skills/binlee-source-library/scripts/refresh-corpus.sh --check
```

预览会报告新增、删除和修改记录，不会写入文件。确认变化合理后，再显式应用：

```bash
bash skills/binlee-source-library/scripts/refresh-corpus.sh --apply
```

应用模式会先完整生成并校验正文、索引和 manifest，再替换旧产物；如果下载或提取失败，旧语料保持不变。

### 6.1 语料可以回答什么

- 作者曾经如何解释某个行业现象。
- 多篇文章之间有哪些重复出现的判断。
- 某个概念在文章中的上下文、反例和限制。
- 一条观点出自哪篇文章、什么时间、原文在哪里。

### 6.2 语料不能单独回答什么

- 今天仍然有效的法律、监管要求和平台规则。
- 当前价格、市场规模、公司状态和产品规格。
- 个人的诊断、治疗方案、手术适应证和预后。

遇到这些问题，skill 会把它们标为“需另行核验的当前事实”，并要求查当下的权威来源或寻求合格专业人士帮助。

## 7. 输出应该长什么样

一份合格的 Binlee 输出，通常包含以下部分：

1. **结论先行**：先说当前最重要的判断，不用行业套话开场。
2. **证据分层**：明确哪些句子来自原文，哪些是跨文归纳，哪些还没有被当前证据确认。
3. **反例和不确定性**：说明结论在哪些条件下会失效。
4. **行动清单**：把观点翻译成负责人、指标、问题清单或验证步骤。
5. **风险边界**：说明哪些事不能由 AI 代替完成。

如果答案只有“趋势、机会、赋能、闭环”等词，却没有证据、条件和下一步动作，应当重新提问。

## 8. 消费者安全边界

`binlee-consumer-decision` 的目标是帮助人做出更知情的下一步，而不是把人推向某个项目。

它会帮助消费者：

- 把“我不满意”拆成具体目标、时间和可接受代价。
- 区分医生解释、机构销售、用户体验和广告承诺。
- 准备面诊问题，要求对方说明替代方案、风险、恢复期和费用边界。
- 识别限时促销、恐惧叙事、保证效果和模糊资质等警讯。
- 在出现症状、并发症、明显焦虑或被迫消费时，优先寻找合格的线下帮助。

它不会：

- 根据照片或文字诊断。
- 替个人选择项目、产品、医生或机构。
- 估算某个人一定会达到什么效果。
- 把外貌焦虑包装成“必须解决的问题”。

这不是保守，而是必要的信任边界。信息越不完整，越不应该用确定语气替别人做医疗决定。

## 9. 用它生产内容：建议的工作流

如果你的目标是写公众号、博客或社交平台内容，可以按下面的顺序：

### 第一步：确定内容要改变什么

不是“写一篇医美文章”，而是明确读者看完后要能做什么：准备面诊、识别广告、理解一个概念、评估机构方案，还是理解一个行业现象。

### 第二步：检索并建立 claim map

先用 `binlee-source-library` 找原文，再用 `binlee-public-communication` 把文章观点、当前事实、解释和价值判断分开。

### 第三步：选择真正的读者

同一件事，给机构老板写的是决策备忘录，给消费者写的是验证清单，给监管研究者写的是风险地图。不要把四类人塞进同一段空泛的“行业洞察”。

### 第四步：做一次风险审查

调用 `binlee-compliance-risk` 检查：是否存在隐性推广、虚假确定性、隐私泄露、未经核验的数字、医疗边界越界或对消费者施压。

### 第五步：最后才润色传播

内容可以有观点、节奏和个性，但不能靠恐惧、羞耻或权威幻觉换取转发。传播做得越好，越要对误解的后果负责。

## 10. 常见问题与排错

### 找不到 skill

先确认安装范围：

```bash
npx skills list
npx skills list --global
```

如果使用 Codex 或 Claude Code，检查对应目录里是否存在 `<skill-name>/SKILL.md`。也可以重新运行：

```bash
npx skills add sooogooo/binlee-skill-july-2026 \
  --skill binlee-consumer-decision binlee-source-library --yes
```

### 自动调用不稳定

在问题第一行显式写出 skill 名称，并补上角色、目标和输出格式。短问题“帮我分析医美”信息不足，模型很难知道应该从经营、消费者还是合规角度回答。

### 文章观点和当前事实混在一起

要求输出使用三层标签：文章中的观点、跨文归纳、需另行核验的当前事实。法律、价格、政策、临床证据和产品状态都要重新核验。

### 想更新语料

先确认更新是必要的，再运行刷新脚本。刷新失败时保留旧语料，不要用半成品覆盖本地库。

### 想修改技能

编辑 `skills/<skill-name>/SKILL.md` 及其 `references/`、`scripts/`，不要直接改安装后的目标副本。修改后运行仓库的校验，再提交到 GitHub。

## 11. 维护与贡献

修改前先阅读 [贡献与维护说明](CONTRIBUTING.md)。建议每次改动只解决一个问题，并写清楚：

- 改动影响哪类使用者。
- 新增的判断依赖哪些证据。
- 是否改变了消费者安全边界。
- 是否需要更新 README、适配器或推广文案。

一个好的 Binlee 改动，不是让答案听起来更自信，而是让答案更可追溯、更容易复核，也更不容易把信息差变成伤害。
