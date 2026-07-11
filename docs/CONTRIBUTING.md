# 贡献与维护说明

## Canonical source

只修改 `skills/` 下的 canonical skill；不要为 Codex、Claude、Gemini、OpenCode 复制四份正文。CLI 差异放在 `adapters/` 和 `docs/CLI_COMPATIBILITY.md`。

## 新增或修改 skill

每个 skill 必须：

1. 有合法的 `SKILL.md` frontmatter：`name` 与 `description`。
2. 只写一个清晰的任务边界，避免多个 skill 争抢同一触发词。
3. 把详细资料放入 `references/`，把可重复的确定性操作放入 `scripts/`。
4. 对会过期的事实标注日期和来源；不要把作者观点伪装成现行法规或临床共识。
5. 保持消费者安全边界：不从文本做个体化诊断或项目推荐。

## 语料更新

更新前先确认源站仍然公开且文章包装格式没有改变：

```bash
bash skills/binlee-source-library/scripts/refresh-corpus.sh
```

检查 `manifest.json` 的文章数量、日期范围和 SHA-256；若提取失败，保留旧语料并修复脚本，不要提交半成品。

## 验证清单

```bash
node scripts/install-binlee.mjs --cli codex --scope project --dry-run
node scripts/install-binlee.mjs --cli claude --scope project --dry-run
node skills/binlee-source-library/scripts/search-corpus.mjs --query "消费者" 3
```

提交前确认没有 token、密码、私钥或本机绝对路径；检查 8 个 `SKILL.md` 的 frontmatter 和 Git diff。
