# i18n-vue

这是一个面向 Vue / 静态 HTML 项目的 i18n 自动化插件与技能集合，提供初始化 i18n、自动替换中文、同步翻译、全流程工作流，以及扫描/翻译/审核子代理能力。兼容 Claude CLI、Gemini CLI、Codex。

## 插件结构（官方标准）

- `.claude-plugin/plugin.json`：插件元数据（必需）
- `skills/`：可调用技能（`i18n-init`、`i18n-replace`、`i18n-sync`、`i18n-workflow`）
- `agents/`：子代理（`i18n-files`、`i18n-text`、`i18n-code`）
- `GEMINI.md`：Gemini CLI 入口与执行约定
- `CODEX.md`：Codex 入口与执行约定

## 3 个 AI Agent 安装方式（推荐按需选择）

### 1) Claude CLI 安装（插件方式）

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

本地调试：

```bash
claude --plugin-dir /absolute/path/to/i18n-vue-plugin
```

---

### 2) Gemini CLI 安装（仓库方式）

Gemini 当前按“仓库技能”方式使用，不读取 `.claude-plugin/*`。步骤如下：

1. 克隆仓库

```bash
git clone https://github.com/Chyelong/i18n-vue-plugin.git
cd i18n-vue-plugin
```

2. 在 Gemini 会话中让其读取 `skills/*/SKILL.md` 与 `agents/*.md`
3. 执行脚本命令（示例）：

```bash
node skills/i18n-init/i18n-init.js ./src/i18n --type vue --langs en,ja
node skills/i18n-replace/vue-i18n-replace.js ./src --i18n-dir ./src/i18n --lang en
node skills/i18n-sync/sync-i18n.js ./src --i18n-dir ./src/i18n --lang en
```

详细约定见：`GEMINI.md`

也支持 Gemini 扩展安装方式（推荐）：

```bash
gemini extensions install https://github.com/Chyelong/i18n-vue-plugin.git --auto-update
```

常用管理命令：

```bash
gemini extensions update i18n-vue
gemini extensions uninstall i18n-vue
```

---

### 3) Codex 安装（仓库方式）

Codex 当前按“仓库技能”方式使用，不读取 `.claude-plugin/*`。步骤如下：

1. 克隆仓库

```bash
git clone https://github.com/Chyelong/i18n-vue-plugin.git
cd i18n-vue-plugin
```

2. 在 Codex 会话中让其读取 `skills/*/SKILL.md` 与 `agents/*.md`
3. 执行脚本命令（示例）：

```bash
node skills/i18n-init/i18n-init.js ./src/i18n --type vue --langs en,ja
node skills/i18n-replace/vue-i18n-replace.js ./src --i18n-dir ./src/i18n --lang en
node skills/i18n-sync/sync-i18n.js ./src --i18n-dir ./src/i18n --lang en
```

详细约定见：`CODEX.md`

也支持 Codex 的远程安装说明模式（Fetch and follow）：

```text
Fetch and follow instructions from https://raw.githubusercontent.com/Chyelong/i18n-vue-plugin/refs/heads/main/.codex/INSTALL.md
```

## 安装后更新方式

### Claude CLI（插件）

```bash
/plugin update i18n-vue
```

如果是本地 `--plugin-dir` 调试方式，先拉代码再重载：

```bash
git pull
/reload-plugins
```

### Gemini CLI（扩展）

手动更新：

```bash
gemini extensions update i18n-vue
```

如果安装时使用了 `--auto-update`，会按 Gemini 的机制自动更新：

```bash
gemini extensions install https://github.com/Chyelong/i18n-vue-plugin.git --auto-update
```

### Codex（仓库技能）

更新本地仓库：

```bash
cd ~/.codex/i18n-vue-plugin && git pull
```

如果你是用远程安装说明模式，也可以重新执行一次：

```text
Fetch and follow instructions from https://raw.githubusercontent.com/Chyelong/i18n-vue-plugin/refs/heads/main/.codex/INSTALL.md
```

## 本地开发调试（Claude 插件）

修改后可在 Claude 会话中执行：

```bash
/reload-plugins
```

## 发布前检查清单

- `plugin.json` 中 `name`、`version`、`description` 已填写
- `marketplace.json` 已包含 `name`、`owner`、`plugins`
- `gemini-extension.json` 已存在且版本号已更新
- `GEMINI.md` 已说明 Gemini 使用方式
- `CODEX.md` 已说明 Codex 使用方式
- `skills/*/SKILL.md` 与 `agents/*.md` 可正常读取
- 安装命令可直接从 Git 地址拉取
