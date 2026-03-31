---
name: i18n-sync
description: 同步翻译已有的 $t() 调用和 data-i18n 标记。触发词：同步翻译、sync i18n、翻译同步、补充翻译
---

# /i18n-sync

## 角色与边界

执行此 skill 时，你是一个 **i18n 同步执行者**，负责提取代码中已有的 i18n 标记并补充翻译。

- ✅ 运行 sync-i18n.js 脚本扫描已有的 $t() 和 data-i18n 标记
- ✅ 将未翻译的 key 写入语言 JSON（空值占位）
- ✅ 派发 i18n-text agent 完成翻译
- ❌ 不替换中文文本（那是 /i18n-replace 的工作）
- ❌ 不审核替换结果（那是 i18n-code agent 的工作）
- ❌ 不手动编辑业务代码

---

扫描代码中已有的 i18n 标记（`$t('中文')` 调用和 `data-i18n` 属性），提取中文并写入语言文件，然后调用 `i18n-text` agent 子代理进行翻译。

## 用途

- 替换脚本可能遗漏，用户手动添加了 `$t()` 包裹或 `data-i18n` 标记
- 需要补充翻译新添加的中文文本
- 检查哪些文本还未翻译

## 用法

```
/i18n-sync [目标路径] [--lang 语言] [--dry-run]
```

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| 目标路径 | 要扫描的目录或文件 | vue: ./src，browser: ./ |
| --i18n-dir | i18n 目录路径 | vue: ./src/i18n，browser: ./i18n |
| --lang | 目标语言 | tw |
| --dry-run | 只预览，不修改文件 | - |

## AI 执行规则

### 步骤 1：执行同步脚本

```bash
node <skill-directory>/sync-i18n.js <目标路径> --i18n-dir <i18n-dir> --lang <语言>
```

脚本会：
- 扫描 `.vue`、`.js`、`.ts`、`.html`、`.htm` 等文件
- 提取所有 `$t('中文')`、`window.$t('中文')` 调用和 `data-i18n="中文"`、`data-i18n-{attr}="中文"` 属性
- 与现有翻译文件对比
- 将未翻译的中文 key 写入 `<lang>.json`，翻译值留空

### 步骤 2：调用 i18n-text agent 子代理翻译

脚本执行完成后，**必须**派发 `i18n-text` 子代理进行翻译：

```
subagent: i18n-text
model: haiku
task: 翻译 i18n JSON
prompt: 读取 <i18n-dir>/<lang>.json，将所有值为空字符串的条目翻译为<目标语言>。中文 key 是源文本，翻译要准确自然，符合 UI 用语习惯。翻译完成后直接写回文件。
```

## 工作流程

1. 扫描 `.vue`、`.js`、`.ts`、`.html`、`.htm` 等文件
2. 提取所有 `$t()` / `window.$t()` 调用和 `data-i18n` 属性中的中文
3. 与现有翻译文件对比
4. 将未翻译的 key 写入语言文件（空值占位）
5. 调用 agent i18n-text 子代理完成翻译
