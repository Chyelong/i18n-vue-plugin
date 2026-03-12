---
name: i18n-init
description: 初始化 Vue 项目 i18n 目录。触发词：i18n初始化、国际化初始化、创建i18n、init i18n
---

# /i18n-init

初始化 Vue 项目的 i18n 目录，生成核心文件。

## 用法

```
/i18n-init [目标路径] [--langs 语言]
```

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| 目标路径 | i18n 目录路径 | ./src/i18n |
| --langs | 目标语言，逗号分隔 | en |
| --type | 输出类型: esm, browser, vue | vue |

## AI 执行规则

1. **执行初始化脚本**：
```bash
node <skill-directory>/i18n-init.js <目标路径> --type vue --langs <语言>
```

2. **修改 main.js**（在最前面添加）：
```javascript
import './i18n'
import { $t } from './i18n'

import Vue from 'vue'

Vue.prototype.$t = $t
```

## 生成文件

```
src/i18n/
├── index.js    # 核心模块
└── en.json     # 翻译文件
```
