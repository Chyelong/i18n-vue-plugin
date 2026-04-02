---
name: i18n-replace
description: 自动替换代码中的中文为 i18n 标记。支持 Vue（$t）和静态 HTML/JS（data-i18n + window.$t）。触发词：i18n替换、替换中文、国际化替换、wrap i18n、extract i18n
---

# /i18n-replace

## 角色与边界

执行此 skill 时，你是一个 **i18n 替换执行者**，负责运行替换脚本将中文文本包裹为 i18n 标记。

- ✅ 判断项目类型，调用对应的替换脚本
- ✅ 将中文 key 写入语言 JSON（翻译值留空）
- ❌ 不翻译语言包（那是 i18n-text agent 的工作）
- ❌ 不审核替换结果（那是 i18n-code agent 的工作）
- ❌ 不初始化 i18n 目录（那是 /i18n-init 的工作）
- ❌ 不手动编辑代码，只通过脚本自动替换

---

扫描项目文件，自动替换中文文本为 i18n 标记，然后将中文 key 写入语言 JSON（翻译值留空）。

支持两种项目类型：
- **Vue 项目**：`.vue` 文件 → `$t()` / `{{ $t() }}`
- **静态 HTML/JS 项目**：`.html`/`.js`/`.ts` 文件 → `window.$t()` / `data-i18n` 属性

## 用法

```
/i18n-replace [目标路径] [--lang 语言] [--dry-run]
```

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| 目标路径 | 要扫描的目录或文件 | vue: ./src，browser: ./ |
| --i18n-dir | i18n 目录路径 | vue: ./src/i18n，browser: ./i18n |
| --lang | 目标语言 | tw |
| --dry-run | 只预览，不修改 | - |

## AI 执行规则

### 步骤 0：判断项目类型

- 存在 `package.json` 且依赖包含 `vue` → Vue 项目
- 否则 → 静态 HTML/JS 项目

### 步骤 1：执行替换脚本

**Vue 项目**：
```bash
node <skill-directory>/vue-i18n-replace.js <目标路径> --i18n-dir <i18n-dir> --lang <语言>
```

**静态 HTML/JS 项目**：
```bash
node <skill-directory>/html-i18n-replace.js <目标路径> --i18n-dir <i18n-dir> --lang <语言>
```

## 处理规则

### Vue 项目（vue-i18n-replace.js）

| 场景 | 处理方式 |
|------|----------|
| script 字符串 `"中文"` | → `window.$t("中文")`（始终使用 window. 前缀） |
| template 文本 `<div>中文</div>` | → `<div>{{ $t("中文") }}</div>` |
| template 属性 `placeholder="请输入"` | → `:placeholder="$t('请输入')"` |
| 动态属性 `:title="'标题'"` | → `:title="$t('标题')"` |
| 模板字符串 `` `你好${name}` `` | → `window.$t('你好{name}', { 'name': name })` |

### 静态 HTML/JS 项目（html-i18n-replace.js）

| 场景 | 处理方式 |
|------|----------|
| JS 字符串 `"中文"` | → `window.$t("中文")` |
| HTML 标签文本 `<div>中文</div>` | → `<div data-i18n="中文">中文</div>` |
| HTML 属性 `placeholder="请输入"` | → `placeholder="请输入" data-i18n-placeholder="请输入"` |
| `<script>` 内的 JS 代码 | 同 JS 字符串处理 |

## 跳过的场景

**通用**：
- 已被 `$t()` / `data-i18n` 标记的文本
- 比较运算符后的字符串（`===` `!==` 等）
- 注释、import/require、console.log

**Vue 特有**：`v-if`、`v-show` 中的字符串，`class`/`id`/`name`/`key`/`ref`/`style` 属性

**HTML 特有**：`class`/`id`/`name`/`style`/`type`/`href`/`src`/`action` 属性，`on*` 事件属性，void 元素

## 验证命令

替换完成后，运行验证脚本检查高危模式和翻译质量：

```bash
# 全量扫描（代码 + 翻译质量）
node skills/i18n-replace/i18n-validate.js <directory> --type <vue|html> --i18n-dir <path> --lang <lang>

# 仅翻译质量
node skills/i18n-replace/i18n-validate.js <directory> --check-translation --i18n-dir <path> --lang <lang>

# 检查 JSON 可疑条目
node skills/i18n-replace/i18n-validate.js <directory> --check-json --i18n-dir <path> --lang <lang>

# 自动修复裸 $t()
node skills/i18n-replace/i18n-validate.js <directory> --fix
```

退出码：0 = 全部通过，1 = 存在严重/高危问题。
