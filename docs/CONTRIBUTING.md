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
bash skills/binlee-source-library/scripts/refresh-corpus.sh --check
```

检查预览中的新增、删除、修改、文章数量、日期范围和 bundle SHA-256。确认变化合理后再运行：

```bash
bash skills/binlee-source-library/scripts/refresh-corpus.sh --apply
```

若下载、解析或产物校验失败，旧语料必须保持不变；不要绕过检查模式或提交半成品。

## 验证清单

```bash
node scripts/install-binlee.mjs --check --cli codex --scope project
node scripts/install-binlee.mjs --check --cli claude --scope project
node skills/binlee-source-library/scripts/search-corpus.mjs --query "消费者" 3
npm test
npm run release:check
```

`--check` 返回 `2` 只表示存在 `missing`、`adoptable` 或 `upgradeable` 的安全待办，返回 `3` 才表示冲突；参数或文件系统错误返回 `1`。维护者应先检查状态，再决定是否运行 `--apply`，不得用 `--force` 掩盖未审查的本地改动。

修改版本、canonical skill 或 release 元数据后，先重新生成清单，再验证清单没有漂移：

```bash
npm run release:manifest
npm run release:check
```

`release/skills-manifest.json` 必须保持确定性：不写时间戳和本机路径，版本与 `package.json` 一致，覆盖全部 8 个 canonical skill。发布说明使用 `release/RELEASE_NOTES_v<version>.md`；GitHub Release 只能从已有、且与 package 版本相等的 `v*` 标签创建。项目没有 npm 发布流程，`package.json` 必须保持 `private: true`。

官方 CLI 的 `skills-lock.json` 归官方 CLI 管理，custom installer 不得读取或改写。旧版官方项目安装若不能通过 `npx skills update --project` 更新，应使用 `npx skills add https://github.com/sooogooo/binlee-skill-july-2026 -y` 显式重装。

提交前确认没有 token、密码、私钥或本机绝对路径；检查 8 个 `SKILL.md` 的 frontmatter、manifest digest 和 Git diff。不要提交 `.binlee-install/state.json` 或备份目录，它们属于本地安装状态。
