# i18n-vue

这是一个面向 Vue / 静态 HTML / 微信小程序项目的 i18n 自动化插件与技能集合，提供初始化 i18n、自动替换中文、同步翻译、全流程工作流，以及扫描/翻译/审核子代理能力。兼容 Claude CLI、Gemini CLI、Codex。

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
# Vue 项目
/i18n-vue:i18n-workflow ./src --langs en
/i18n-vue:i18n-init ./src/i18n --langs en,ja
/i18n-vue:i18n-replace ./src/views --lang en
/i18n-vue:i18n-sync ./src --lang en

# 微信小程序
/i18n-vue:i18n-workflow ./pages --type wx --langs tw
/i18n-vue:i18n-init ./i18n --type wx --langs tw
/i18n-vue:i18n-replace ./pages --type wx --lang tw
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
# Vue 项目
node skills/i18n-init/i18n-init.js ./src/i18n --type vue --langs en,ja
node skills/i18n-replace/vue-i18n-replace.js ./src --i18n-dir ./src/i18n --lang en
node skills/i18n-sync/sync-i18n.js ./src --i18n-dir ./src/i18n --lang en

# 微信小程序
node skills/i18n-init/i18n-init.js ./i18n --type wx --langs tw
node skills/i18n-replace/wx-i18n-replace.js ./pages --i18n-dir ./i18n --lang tw
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
# Vue 项目
node skills/i18n-init/i18n-init.js ./src/i18n --type vue --langs en,ja
node skills/i18n-replace/vue-i18n-replace.js ./src --i18n-dir ./src/i18n --lang en
node skills/i18n-sync/sync-i18n.js ./src --i18n-dir ./src/i18n --lang en

# 微信小程序
node skills/i18n-init/i18n-init.js ./i18n --type wx --langs tw
node skills/i18n-replace/wx-i18n-replace.js ./pages --i18n-dir ./i18n --lang tw
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

## i18n-validate 审核脚本（v2.6.0 起）

新版审核分成两层：

1. **脚本层 `skills/i18n-replace/i18n-validate.js`** — 机械化高危模式扫描 + 翻译质量检查，输出结构化 JSON
2. **Agent 层 `agents/i18n-code.md`** — 读取 validator 产出的 JSON，对每条命中做语义判断（confirmed / falsePositive / needsContext）

### 内置规则（38+ 条）

| 分类 | 数量 | 说明 |
|------|-----|------|
| V01-V10 | 10 | Vue 项目高危模式（switch、等值、路由 name、habit 等） |
| W01-W08 | 8  | 微信小程序高危模式（`global.$t` 前缀） |
| H01-H05 | 5  | 静态 HTML/JS（`data-i18n-value` 等） |
| A1-A14  | 14 | 跨类型踩坑（对象 key、嵌套 $t、`body`、`$mode`、HTML 注释残留、弯引号、￥/¥ 等） |
| C1-C4   | 4  | 翻译质量（变量名保护、简繁漂移、重复值、空值白名单） |

### 用法

```bash
# 文本报告（默认）
node skills/i18n-replace/i18n-validate.js src/ --type vue --i18n-dir src/i18n --lang tw

# JSON 报告（供 agent 审核使用）
node skills/i18n-replace/i18n-validate.js src/ --type vue --i18n-dir src/i18n --lang tw \
  --format json --out .i18n-issues.json
```

**退出码**：`0` 全绿 / `1` 有 🔴 严重 / `2` 有 🟠 高危 / `3` 脚本错误

报告每条命中带规则 ID（如 `[V01]`、`[A4]`），规则详情查 `skills/i18n-replace/validate-rules.js` 或 `docs/superpowers/specs/2026-04-11-audit-system-upgrade-design.md`。

## 支持的项目类型

| 类型 | 文件 | 替换方式 | 初始化核心文件 |
|------|------|----------|---------------|
| Vue | `.vue` `.js` | `$t()` / `{{ $t() }}` | `index.js` |
| 静态 HTML/JS | `.html` `.js` `.ts` | `window.$t()` / `data-i18n` | `index.js` |
| 微信小程序 | `.wxml` `.js` | `global.$t()` / `{{$t['key']}}` | `i18n.js` + `i18n-behavior.js` |

## 发布前检查清单

- `plugin.json` 中 `name`、`version`、`description` 已填写
- `marketplace.json` 已包含 `name`、`owner`、`plugins`
- `gemini-extension.json` 已存在且版本号已更新
- `GEMINI.md` 已说明 Gemini 使用方式
- `CODEX.md` 已说明 Codex 使用方式
- `skills/*/SKILL.md` 与 `agents/*.md` 可正常读取
- 安装命令可直接从 Git 地址拉取
