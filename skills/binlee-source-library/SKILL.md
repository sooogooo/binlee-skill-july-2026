---
name: binlee-source-library
description: 检索、引用、检查并刷新来自 drli.beaucare.org 的李滨医美文章本地语料。适用于研究语料覆盖的问题、定位原文、检查文章来源或时间，或希望减少重复访问源站时。
---

# Binlee 医美语料库

把本地语料当作可检索、可引用的原始文章集合，而不是当前临床、法律或市场数据的权威库。

## 检索

1. 读取 [references/corpus-guide.md](references/corpus-guide.md) 和 [references/evidence-policy.md](references/evidence-policy.md)。
2. 用 `node scripts/search-corpus.mjs --query "关键词"` 搜索标题、摘要、FAQ 和正文。
3. 用 `node scripts/search-corpus.mjs --id "文章-id"` 读取选中的完整记录。
4. 每条重要的语料结论都要附文章标题、发布日期和原文链接。

不要一次性加载 `references/articles.json`。先检索，再只打开相关记录。

## 刷新

只有在确实需要更新语料时，才运行 `bash scripts/refresh-corpus.sh`。脚本会下载当前应用 bundle，校验文章包装结构，并一起替换本地语料、索引和 manifest。

提取失败时要停止并报告，不要悄悄生成不完整的语料库。

## 输出纪律

把源自文章的内容标为：**文章中的观点**、**跨文归纳**或**需另行核验的当前事实**。始终把作者的主张和你的结论分开。
