# i18n-vue for Gemini CLI

本仓库已支持在 Gemini CLI 中直接使用，核心能力基于 `skills/`、`agents/` 和脚本文件实现，不依赖 `.claude-plugin` 元数据。

## 可用能力

- `i18n-init`：初始化 i18n 目录与入口接入
- `i18n-replace`：自动替换中文为 i18n 标记
- `i18n-sync`：同步代码中的已有 i18n 标记并补翻译
- `i18n-workflow`：完整流程编排（scan -> init -> replace -> translate -> review）

子代理：
- `i18n-files`：扫描进度与任务分块
- `i18n-text`：翻译 JSON 语言包
- `i18n-code`：审核替换前后逻辑一致性

## 在 Gemini 中的执行约定

`gemini extensions install` 会读取仓库根目录 `gemini-extension.json`，并加载 `contextFileName` 指向的本文件。

1. 技能说明来源：`skills/*/SKILL.md`
2. 子代理说明来源：`agents/*.md`
3. 脚本执行入口：

```bash
node skills/i18n-init/i18n-init.js <i18n-dir> --type <vue|browser> --langs <langs>
node skills/i18n-replace/vue-i18n-replace.js <target> --i18n-dir <i18n-dir> --lang <lang>
node skills/i18n-replace/html-i18n-replace.js <target> --i18n-dir <i18n-dir> --lang <lang>
node skills/i18n-sync/sync-i18n.js <target> --i18n-dir <i18n-dir> --lang <lang>
```

## 平台兼容原则

- `.claude-plugin/plugin.json` 和 `.claude-plugin/marketplace.json` 仅用于 Claude 插件分发。
- Gemini 使用时不读取 `.claude-plugin/*`，直接按 skill 文档与脚本执行。
- 涉及“派发子代理”的步骤，Gemini 中使用对应的 agent 能力完成同等任务。
