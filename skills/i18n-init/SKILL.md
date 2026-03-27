---
name: i18n-init
description: 初始化项目 i18n 目录。触发词：i18n初始化、国际化初始化、创建i18n、init i18n
---

# /i18n-init

## 角色与边界

执行此 skill 时，你是一个 **i18n 初始化执行者**，负责创建 i18n 目录结构和核心文件，并修改项目入口文件引入 i18n。

- ✅ 执行 i18n-init.js 脚本生成 i18n 目录和文件
- ✅ 按项目类型修改入口文件（main.js 或 HTML）
- ✅ 重复执行时覆盖更新 index.js（工具类升级），保留已有语言 JSON 文件
- ❌ 不替换任何中文文本（那是 /i18n-replace 的工作）
- ❌ 不翻译任何语言包（那是 i18n-text agent 的工作）
- ❌ 不扫描项目文件状态（那是 i18n-files agent 的工作）

---

初始化项目的 i18n 目录，生成核心文件。支持 Vue 项目和静态 HTML/JS 项目。

**支持重复调用**：再次执行会重新生成 `index.js`（更新工具类代码），已有的语言 JSON 文件不会被覆盖。

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

#### 语言自动检测

i18n 模块在**加载阶段**会同步检测当前语言（确保 `$img` 等函数在其他模块的顶层代码中也能正确工作），检测优先级：

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1 | `window.__I18N_LANG__` | JS 全局变量，后台可在页面模板注入 |
| 2 | URL 参数 `?lang=tw` | 后台重定向或前端拼接 |
| 3 | Cookie `i18n_lang=tw` | 后台设置 cookie |
| 4 | `localStorage` `i18n_lang` | `initI18n()` 调用后自动保存 |
| 5 | `<html lang="tw">` | 后台在 HTML 模板设置 |
| 6 | 默认 `zh` | 以上都没有时 |

后台只需通过**任意一种方式**传递语言即可，无需前端手动配置。

#### Vue 项目（--type vue）

修改 `main.js`（在最前面添加）：

```javascript
import './i18n'
import { $t, $img, $imgVar, initI18n } from './i18n'

import Vue from 'vue'

Vue.prototype.$t = $t
Vue.prototype.$img = $img
Vue.prototype.$imgVar = $imgVar

// 加载翻译数据（语言已在模块加载时自动检测）
initI18n();
```

如果后台通过接口返回语言，在获取后调用 `initI18n('tw')` 即可，它会同时保存到 localStorage，后续访问自动生效。

#### 静态 HTML/JS 项目（--type browser）

后台在页面模板中注入语言（任选一种）：

```html
<!-- 方式一：后台注入全局变量 -->
<script>window.__I18N_LANG__ = '{{ backend_lang }}';</script>

<!-- 方式二：后台设置 HTML lang 属性 -->
<html lang="{{ backend_lang }}">

<!-- 方式三：后台设置 cookie（无需额外前端代码） -->
```

然后引入 i18n：

```html
<script src="./i18n/index.js"></script>
<script>
  initI18n();
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

await initI18n();
```

## 生成文件

```
i18n/
├── index.js    # 核心模块（$t 函数、语言切换、applyI18n）
└── en.json     # 翻译文件（由替换脚本填充）
```
