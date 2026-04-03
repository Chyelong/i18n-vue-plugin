---
name: i18n-sync
description: 同步翻译已有的 $t() 调用、$t['key'] 引用和 data-i18n 标记。触发词：同步翻译、sync i18n、翻译同步、补充翻译
---

# /i18n-sync

## 角色与边界

执行此 skill 时，你是一个 **i18n 同步执行者**，负责提取代码中已有的 i18n 标记并补充翻译。

- ✅ 运行 sync-i18n.js 脚本扫描已有的 $t()、$t['key'] 和 data-i18n 标记
- ✅ 将未翻译的 key 写入语言文件（空值占位）
- ✅ 生成 pending.json 隔离待翻译条目（保护已有翻译）
- ✅ 派发 i18n-text agent 翻译 pending 文件
- ✅ 翻译完成后运行 --merge 安全合并
- ❌ 不替换中文文本（那是 /i18n-replace 的工作）
- ❌ 不审核替换结果（那是 i18n-code agent 的工作）
- ❌ 不手动编辑业务代码

---

扫描代码中已有的 i18n 标记，提取中文并写入语言文件，然后调用 `i18n-text` agent 子代理进行翻译。

## 用途

- 替换脚本可能遗漏，用户手动添加了 `$t()` 包裹或 `data-i18n` 标记
- 需要补充翻译新添加的中文文本
- 检查哪些文本还未翻译

## 用法

```
/i18n-sync [目标路径] [--lang 语言] [--type 类型] [--dry-run]
```

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| 目标路径 | 要扫描的目录或文件 | vue: ./src，browser: ./，wx: ./pages |
| --i18n-dir | i18n 目录路径 | vue: ./src/i18n，browser/wx: ./i18n |
| --lang | 目标语言 | tw |
| --type | 项目类型 (vue/browser/wx) | 自动检测 |
| --dry-run | 只预览，不修改文件 | - |
| --merge | 合并 pending 翻译回主文件 | - |

## AI 执行规则

### 步骤 1：执行同步脚本

```bash
node <skill-directory>/sync-i18n.js <目标路径> --i18n-dir <i18n-dir> --lang <语言>
```

脚本会：
- 扫描 `.vue`、`.js`、`.ts`、`.html`、`.htm`、`.wxml` 文件
- 提取所有 `$t('中文')`、`global.$t('中文')` 调用和 `$t['中文']` 引用和 `data-i18n="中文"` 属性
- 与现有翻译文件对比（支持 .json 和 .js 格式）
- 将未翻译的 key 写入主语言文件
- 同时生成 `<lang>.pending.json`（只含待翻译条目）

### 步骤 2：调用 i18n-text agent 翻译 pending 文件

**重要**：让 agent 翻译 `pending.json` 而非主语言文件，防止已有翻译被覆盖：

```
subagent: i18n-text
model: haiku
task: 翻译 i18n pending JSON
prompt: 读取 <i18n-dir>/<lang>.pending.json，将所有值为空字符串的条目翻译为<目标语言>。中文 key 是源文本，翻译要准确自然，符合 UI 用语习惯。翻译完成后直接写回文件。
```

### 步骤 3：合并翻译结果

翻译完成后执行合并（安全合并，绝不覆盖已有翻译）：

```bash
node <skill-directory>/sync-i18n.js --merge --i18n-dir <i18n-dir> --lang <语言>
```

## 安全机制

- **解析失败中止**：语言文件解析失败时直接报错中止，不会返回空对象导致已有翻译丢失
- **覆盖保护**：写入前检查，已翻译条目不允许被覆盖为空值
- **pending 隔离**：待翻译条目写入独立文件，翻译 agent 无法接触已有翻译
- **安全合并**：--merge 只填入之前为空的条目，绝不覆盖非空翻译

## 工作流程

1. 扫描代码文件，提取所有 i18n 标记中的中文
2. 与现有翻译文件对比，找出未翻译的文本
3. 将未翻译的 key 写入主语言文件（空值占位）
4. 生成 `<lang>.pending.json`（只含待翻译条目）
5. 调用 i18n-text agent 翻译 pending 文件
6. 运行 `--merge` 安全合并翻译结果回主文件
