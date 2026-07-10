# Binlee Medical-Aesthetics Skills

一套以医美机构、医生、监管研究者与普通消费者为共同受众的 Codex skill 包。它把经营判断、合规边界、消费者决策与公共传播放在同一套“信任闭环”中处理。

## Skills

- `binlee-med-aesthetics-strategy`：行业周期、定位、竞争与经营决策。
- `binlee-clinic-operations`：组织、渠道、医生协作与运营系统。
- `binlee-doctor-ip`：医生创业、专业表达与个人品牌。
- `binlee-compliance-risk`：经营、宣传、医疗与消费者保护风险。
- `binlee-consumer-decision`：普通消费者的信息辨别、面诊准备与风险识别。
- `binlee-public-communication`：面向公众的医美内容创建与可信度审查。
- `binlee-source-library`：本地语料的检索、引用与刷新。

## Local corpus

`binlee-source-library` 保存从 [drli.beaucare.org](https://drli.beaucare.org) 提取的 582 篇文章全文、摘要、FAQ、日期和原文链接。文章日期覆盖 2018-08-29 至 2026-07-07。

语料是可追溯的作者观点库，不是现行临床、法律或市场事实的替代品。各 skill 都要求把文章观点、跨文归纳与需要实时核验的事实明确区分。

## Install

将 `skills/` 下的每个 `binlee-*` 文件夹复制到 Codex 的 skills 目录（通常为 `%USERPROFILE%\.codex\skills`）。各 skill 必须保持为同级目录，以便共享本地语料库。

## Refresh the corpus

在 Git Bash 中运行：

```bash
bash skills/binlee-source-library/scripts/refresh-corpus.sh
```

刷新只在手动运行时访问源站；日常使用通过本地 `articles.json` 和轻量索引完成检索。
