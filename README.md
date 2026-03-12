# i18n-vue

这是一个面向 Vue 项目的 Claude CLI 插件，提供国际化相关的完整能力：初始化 i18n、自动替换中文、同步翻译、全流程工作流，以及扫描/翻译/审核子代理。

## 插件结构（官方标准）

- `.claude-plugin/plugin.json`：插件元数据（必需）
- `skills/`：可调用技能（`i18n-init`、`i18n-replace`、`i18n-sync`、`i18n-workflow`）
- `agents/`：子代理（`i18n-files`、`i18n-text`、`i18n-code`）

## 通过 Claude 直接安装（推荐）

其他用户可直接通过以下命令安装：

```bash
/plugin marketplace add Chyelong/i18n-vue-plugin
/plugin install i18n-vue@i18n-vue-plugin
```

安装后可用命令示例（自动带插件命名空间）：

```bash
/i18n-vue:i18n-workflow ./src --langs en
/i18n-vue:i18n-init ./src/i18n --langs en,ja
/i18n-vue:i18n-replace ./src/views --lang en
/i18n-vue:i18n-sync ./src --lang en
```

## 本地开发调试

```bash
claude --plugin-dir /absolute/path/to/i18n-vue-plugin
```

修改后可在 Claude 会话中执行：

```bash
/reload-plugins
```

## 发布前检查清单

- `plugin.json` 中 `name`、`version`、`description` 已填写
- `marketplace.json` 已包含 `name`、`owner`、`plugins`
- `skills/*/SKILL.md` 与 `agents/*.md` 可正常读取
- 安装命令可直接从 Git 地址拉取
