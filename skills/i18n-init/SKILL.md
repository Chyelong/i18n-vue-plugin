---
name: i18n-init
description: 初始化项目 i18n 目录。触发词：i18n初始化、国际化初始化、创建i18n、init i18n
---

# /i18n-init

## 角色与边界

执行此 skill 时，你是一个 **i18n 初始化执行者**，负责创建 i18n 目录结构和核心文件，并修改项目入口文件引入 i18n。

- ✅ 执行 i18n-init.js 脚本生成 i18n 目录和文件
- ✅ 按项目类型修改入口文件（main.js 或 HTML）
- ❌ 不替换任何中文文本（那是 /i18n-replace 的工作）
- ❌ 不翻译任何语言包（那是 i18n-text agent 的工作）
- ❌ 不扫描项目文件状态（那是 i18n-files agent 的工作）

---

初始化项目的 i18n 目录，生成核心文件。支持 Vue 项目和静态 HTML/JS 项目。

## 用法

```
/i18n-init [目标路径] [--langs 语言] [--type 类型]
```

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| 目标路径 | i18n 目录路径 | vue: ./src/i18n, browser: ./i18n |
| --langs | 目标语言，逗号分隔 | tw |
| --type | 输出类型: vue, browser, esm | vue |

## 类型说明

| 类型 | 适用场景 | $t 调用方式 |
|------|----------|-------------|
| vue | Vue 项目 | `this.$t()` / `window.$t()` |
| browser | 静态 HTML/JS 项目 | `window.$t()` + `data-i18n` 属性 |
| esm | ESM 模块项目 | `import { $t } from './i18n'` |

## AI 执行规则

### 1. 判断项目类型

检查项目根目录的特征文件，自动判断类型：

- **存在 `package.json` 且依赖包含 `vue`** → `--type vue`，默认路径 `./src/i18n`
- **否则** → `--type browser`，默认路径 `./i18n`（项目根目录下）

### 2. 执行初始化脚本

```bash
node <skill-directory>/i18n-init.js <目标路径> --type <type> --langs <语言>
```

### 3. 修改入口文件（按类型区分）

#### Vue 项目（--type vue）

修改 `main.js`（在最前面添加）：

```javascript
import './i18n'
import { $t, $img, $imgVar } from './i18n'

import Vue from 'vue'

Vue.prototype.$t = $t
Vue.prototype.$img = $img
Vue.prototype.$imgVar = $imgVar
```

#### 静态 HTML/JS 项目（--type browser）

在 HTML 文件的 `<head>` 或 `<body>` 末尾引入：

```html
<script src="./i18n/index.js"></script>
<script>
  // 初始化 i18n（可选指定语言，默认中文）
  initI18n();
  // 应用 data-i18n 属性翻译
  document.addEventListener('DOMContentLoaded', function() {
    applyI18n();
  });
</script>
```

**注意**：`applyI18n()` 会遍历 DOM 中所有带 `data-i18n` / `data-i18n-{attr}` 标记的元素，替换文本内容和属性值。切换语言后需重新调用。

#### ESM 项目（--type esm）

在入口文件中导入：

```javascript
import { $t, $img, $imgVar, initI18n } from './i18n'

await initI18n('en');
```

## 生成文件

```
i18n/
├── index.js    # 核心模块（$t 函数、语言切换、applyI18n）
└── en.json     # 翻译文件（由替换脚本填充）
```
