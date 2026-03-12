---
name: i18n-replace
description: 自动替换 Vue 代码中的中文为 $t() 并通过 agent 翻译。触发词：i18n替换、替换中文、国际化替换、wrap i18n、extract i18n
---

# /i18n-replace

扫描 Vue 文件，自动用 `$t('中文')` 包裹中文文本，然后调用 `i18n-text` agent 子代理进行翻译。

## 用法

```
/i18n-replace [目标路径] [--lang 语言] [--dry-run]
```

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| 目标路径 | 要扫描的目录或文件 | ./src |
| --i18n-dir | i18n 目录路径 | ./src/i18n |
| --lang | 目标语言 | en |
| --dry-run | 只预览，不修改 | - |

## AI 执行规则

### 步骤 1：执行替换脚本

```bash
node <skill-directory>/vue-i18n-replace.js <目标路径> --i18n-dir ./src/i18n --lang <语言>
```

脚本会：
- 扫描 Vue 文件，用 `$t('中文')` 包裹中文文本
- 将中文 key 写入 `<lang>.json`，翻译值留空


## 处理规则

| 场景 | 处理方式 |
|------|----------|
| script 字符串 `"中文"` | → `window.$t("中文")` |
| template 文本 `<div>中文</div>` | → `<div>{{ $t("中文") }}</div>` |
| template 属性 `placeholder="请输入"` | → `:placeholder="$t('请输入')"` |
| 动态属性 `:title="'标题'"` | → `:title="$t('标题')"` |

## 跳过的场景

- 已被 `$t()` 包裹的文本
- `v-if`、`v-show` 中的字符串（可能是逻辑参数）
- `class`、`id`、`name`、`key` 等属性
- 注释中的文本
