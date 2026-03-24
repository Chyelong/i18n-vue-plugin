# 融合实战经验到 i18n-vue 插件 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将两个项目（f--web Vue 大型项目、blindBox 静态项目）的 i18n 实战经验融合进插件的脚本、agent 和 skill 中，减少误替换和审核遗漏。

**Architecture:** 改动分 6 个模块：vue-i18n-replace.js 增加高危跳过规则、html-i18n-replace.js 增加危险属性跳过、i18n-init.js 修复浏览器模板已知 bug、i18n-code agent 增强跨文件审核规则、i18n-text agent 增加变量保护规则、i18n-workflow 增加替换后验证步骤。

**Tech Stack:** Node.js 脚本、Markdown agent/skill 定义

---

## 文件变更总览

| 文件 | 操作 | 职责 |
|------|------|------|
| `skills/i18n-replace/vue-i18n-replace.js` | 修改 | 增加 8 类高危场景跳过规则 |
| `skills/i18n-replace/html-i18n-replace.js` | 修改 | 增加 value/data-* 危险属性跳过 |
| `skills/i18n-init/i18n-init.js` | 修改 | browser 模板增加同步预加载、修复路径 |
| `agents/i18n-code.md` | 修改 | 增加跨文件审核方法论和 grep 扫描清单 |
| `agents/i18n-text.md` | 修改 | 增加插值变量保护规则和翻译简化规则 |
| `skills/i18n-workflow/SKILL.md` | 修改 | 步骤 3 后增加验证扫描、步骤 4 后增加翻译质量检查 |

---

### Task 1: vue-i18n-replace.js — 增加高危场景跳过规则

**Files:**
- Modify: `skills/i18n-replace/vue-i18n-replace.js`

**背景:** 实战中脚本最大的问题是无法区分"UI 展示文本"和"数据层/逻辑层中文"。以下 8 类场景被误替换的概率极高，需要在脚本层面跳过并输出警告。

#### 1.1 新增跳过规则常量

- [ ] **Step 1: 在文件顶部 SKIP_ATTRS 后添加高危上下文检测模式**

在 `SKIP_ATTRS` 数组（约第 48-52 行）后面添加：

```javascript
// ===== 高危场景跳过规则（来自实战经验） =====

// Vue 组件属性中作为技术标识符的 name（el-tab-pane 等）
// 注意：普通 name 已在 SKIP_ATTRS 中，这里处理动态 :name
const COMPONENT_ID_ATTRS = ['el-tab-pane', 'el-tabs'];

// switch/case 语句的 case 值（通常与后端数据比较）
const SWITCH_CASE_REGEX = /\bcase\s+$/;

// 方括号属性访问（如 item.data['类型']、obj['键名']）
const BRACKET_ACCESS_REGEX = /\[\s*$/;

// 本地存储 key（habit.get/set、localStorage）
const STORAGE_KEY_REGEX = /(?:habit\s*\.\s*(?:get|set)|localStorage\s*\.\s*(?:get|set)Item)\s*\(\s*$/;

// 路由 name 参数（$router.push/replace 的 name）
const ROUTER_NAME_REGEX = /(?:\$router\s*\.\s*(?:push|replace)\s*\(\s*\{[^}]*name\s*:\s*|showRouter\s*\(\s*)$/;

// EventBus 事件名
const EVENTBUS_REGEX = /(?:EventBus|eventBus|\$bus|\$event)\s*\.\s*\$?(?:on|emit|off|once)\s*\(\s*$/;

// indexOf/includes 匹配后端数据（当前行含 .indexOf( 或 .includes(）
const INDEX_MATCH_REGEX = /\.(?:indexOf|includes)\s*\(\s*$/;

// el-table-column 的 prop 属性（数据路径，不应翻译）
const TABLE_PROP_REGEX = /el-table-column/;
```

- [ ] **Step 2: 在 script 字符串处理方法中集成跳过逻辑**

在 `processScriptContent` 方法中（约第 373 行 `line.replace(CHINESE_STRING_REGEX, ...)` 的回调内），在现有的比较运算符跳过逻辑（约第 378-386 行）后面添加：

```javascript
        // ===== 高危场景跳过（实战经验） =====

        // switch case 值
        if (SWITCH_CASE_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'switch/case 逻辑值', line: line.trim() });
          return match;
        }

        // 方括号属性访问 obj['中文']
        if (BRACKET_ACCESS_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '方括号属性访问（可能是后端数据字段）', line: line.trim() });
          return match;
        }

        // 本地存储 key
        if (STORAGE_KEY_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '存储键（habit/localStorage）', line: line.trim() });
          return match;
        }

        // 路由 name / showRouter
        if (ROUTER_NAME_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '路由标识符（$router name / showRouter）', line: line.trim() });
          return match;
        }

        // EventBus 事件名
        if (EVENTBUS_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'EventBus 事件名', line: line.trim() });
          return match;
        }

        // indexOf/includes 参数
        if (INDEX_MATCH_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'indexOf/includes 匹配值（可能匹配后端数据）', line: line.trim() });
          return match;
        }
```

- [ ] **Step 3: 在 template 动态属性处理中添加 el-table prop 和 el-tab-pane name 跳过**

在 `processTemplate` 方法中处理动态属性（约第 176 行 `result.replace(DYNAMIC_ATTR_REGEX, ...)`）的回调内，在 `SKIP_ATTRS.includes(attr)` 检查后面添加：

```javascript
      // el-table-column 的 prop/sortable 属性是数据路径，不应翻译
      if ((attr === 'prop' || attr === 'sort-by') && TABLE_PROP_REGEX.test(result.substring(Math.max(0, result.lastIndexOf('<', match.index)), match.index))) {
        return match;
      }
```

并在静态属性处理（约第 210 行）中，给 SKIP_ATTRS 补充 `'prop'`。

- [ ] **Step 4: 在输出摘要中展示跳过的高危项**

在文件末尾的 `run()` 方法中（输出统计信息的部分），添加跳过项汇总输出：

```javascript
    // 输出跳过的高危逻辑值
    if (this.skippedLogic.length > 0) {
      console.log(`\n⚠️  跳过的高危逻辑值（${this.skippedLogic.length} 处，需人工确认是否需要翻译）：`);
      const grouped = {};
      for (const item of this.skippedLogic) {
        const key = item.reason;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
      }
      for (const [reason, items] of Object.entries(grouped)) {
        console.log(`  📌 ${reason}（${items.length} 处）：`);
        for (const item of items.slice(0, 5)) {
          console.log(`     ${item.file}: "${item.text}" → ${item.line.substring(0, 80)}`);
        }
        if (items.length > 5) console.log(`     ... 及其他 ${items.length - 5} 处`);
      }
    }
```

- [ ] **Step 5: 本地测试脚本运行**

```bash
cd F:\i18n-plugin
node skills/i18n-replace/vue-i18n-replace.js --dry-run --help
```

确认脚本无语法错误。

- [ ] **Step 6: Commit**

```bash
git add skills/i18n-replace/vue-i18n-replace.js
git commit -m "feat(vue-replace): add 8 high-risk skip rules from production experience

Skip switch/case, bracket access, storage keys, router name,
EventBus events, indexOf/includes, el-table prop patterns.
Output skipped items summary for manual review."
```

---

### Task 2: html-i18n-replace.js — 增加危险属性跳过

**Files:**
- Modify: `skills/i18n-replace/html-i18n-replace.js`

**背景:** 静态项目中 `<option value="已完成">` 的 value、`<input type="hidden" value="xxx">` 和 `data-*` 业务属性被标记 data-i18n 后会导致表单提交值被翻译。

- [ ] **Step 1: 扩展 SKIP_ATTRS 和添加危险属性检测**

在 `SKIP_ATTRS` 数组（约第 44-48 行）中添加 `'value'`，并在其后添加：

```javascript
// 需要跳过 data-i18n-value 标记的元素（value 被翻译会破坏表单提交）
const SKIP_VALUE_ELEMENTS = ['option', 'input'];

// data-* 业务属性不应标记（JS 通过 dataset 读取，翻译后逻辑出错）
const SKIP_DATA_ATTR_REGEX = /^data-(?!i18n)/;
```

- [ ] **Step 2: 在 HTML 属性处理中应用新规则**

在处理 HTML 属性的方法中，对 `value` 属性做条件跳过（如果父元素是 option/input 则跳过），对 `data-*` 业务属性跳过 data-i18n 标记：

找到处理属性的逻辑部分，添加：

```javascript
      // value 属性在表单元素上是提交值，不应标记
      if (attr === 'value') {
        return match; // 已在 SKIP_ATTRS 中，这里作为文档说明
      }

      // data-* 业务属性不应标记 data-i18n（JS 通过 dataset 读取）
      if (SKIP_DATA_ATTR_REGEX.test(attr)) {
        return match;
      }
```

- [ ] **Step 3: 添加 indexOf/includes 和 switch/case 跳过规则（与 vue 脚本一致）**

在 JS 字符串处理部分（`processJsContent` 或等效方法），添加与 Task 1 相同的跳过逻辑（switch case、bracket access、storage key、indexOf/includes）。

复用相同的正则常量：

```javascript
const SWITCH_CASE_REGEX = /\bcase\s+$/;
const BRACKET_ACCESS_REGEX = /\[\s*$/;
const STORAGE_KEY_REGEX = /(?:localStorage\s*\.\s*(?:get|set)Item)\s*\(\s*$/;
const INDEX_MATCH_REGEX = /\.(?:indexOf|includes)\s*\(\s*$/;
```

- [ ] **Step 4: Commit**

```bash
git add skills/i18n-replace/html-i18n-replace.js
git commit -m "feat(html-replace): skip value attr, data-* attrs, and logic patterns

Prevent form value, dataset attributes, switch/case, bracket access,
localStorage keys, indexOf/includes from being i18n-marked."
```

---

### Task 3: i18n-init.js — 修复 browser 模板已知 bug

**Files:**
- Modify: `skills/i18n-init/i18n-init.js`

**背景:** 静态项目存在三个已知问题：(1) 模板字面量中 `$t()` 在翻译数据加载前执行；(2) loadLang 路径硬编码；(3) initI18n 无参调用后再传参调用导致死循环刷新。

- [ ] **Step 1: 在 browser 模板的 IIFE 中添加同步预加载**

在 `I18N_BROWSER_TEMPLATE` 中（约第 530 行 `_initialLang` 赋值后），添加同步 XHR 预加载逻辑：

```javascript
  // 模块加载时同步预加载翻译数据（确保后续脚本中 $t() 立即可用）
  // 仅在非中文环境下执行，对小型静态项目可接受
  if (currentLang !== 'zh') {
    try {
      var syncXhr = new XMLHttpRequest();
      syncXhr.open('GET', './i18n/' + currentLang + '.json', false); // 同步请求
      syncXhr.send();
      if (syncXhr.status === 200) {
        messages[currentLang] = JSON.parse(syncXhr.responseText);
      }
    } catch(e) {
      console.warn('[i18n] Sync preload failed for ' + currentLang + ', will retry async');
    }
  }
```

- [ ] **Step 2: 使 loadLang 路径可配置**

在 browser 模板的 IIFE 顶部添加路径配置：

```javascript
  // i18n 资源路径（相对于 HTML 页面）
  var I18N_BASE_PATH = (typeof window.__I18N_PATH__ === 'string') ? window.__I18N_PATH__ : './i18n/';
  if (I18N_BASE_PATH.charAt(I18N_BASE_PATH.length - 1) !== '/') I18N_BASE_PATH += '/';
```

将 `loadLang` 中的 `'./i18n/' + lang + '.json'` 替换为 `I18N_BASE_PATH + lang + '.json'`，同步预加载也同样替换。

- [ ] **Step 3: 修复 initI18n 无参调用的安全性**

在 `initI18n` 函数中，将 `lang = lang || 'zh'` 改为优先使用已检测的语言：

```javascript
  function initI18n(lang, callback) {
    // 未传参时使用模块加载时自动检测的语言（避免与 _initialLang 不匹配导致死循环刷新）
    lang = lang || currentLang;
```

这样无参调用 `initI18n()` 时 lang 等于 currentLang 等于 _initialLang，不会触发 reload。

- [ ] **Step 4: Vue 和 ESM 模板也做同样的 initI18n 安全修复**

对 `I18N_VUE_TEMPLATE` 和 `I18N_ESM_TEMPLATE` 中的 `initI18n` 函数也做同样修改：`lang = lang || currentLang`。

- [ ] **Step 5: Commit**

```bash
git add skills/i18n-init/i18n-init.js
git commit -m "fix(init): sync preload for browser, configurable path, safe initI18n

- Browser template: sync XHR preload ensures $t() works immediately
- loadLang path now configurable via window.__I18N_PATH__
- initI18n() without args uses detected lang instead of 'zh' to prevent reload loop"
```

---

### Task 4: i18n-code agent — 增强跨文件审核方法论

**Files:**
- Modify: `agents/i18n-code.md`

**背景:** 子代理只做单文件 diff 审查，实战中漏掉 35+ 处跨文件逻辑断裂。需要在 agent 定义中增加跨文件追踪要求和具体的 grep 扫描清单。

- [ ] **Step 1: 在"工作流程"步骤 2 后添加"步骤 2.5：高危模式扫描"**

在 `## 工作流程` 的 `### 步骤 2：逐处对比` 后面，添加新步骤：

```markdown
### 步骤 2.5：高危模式 Grep 扫描【必做】

对目标路径执行以下 Grep 扫描，找出所有可能的高危替换。这是子代理审核的核心价值——不能只看 diff，必须主动搜索危险模式：

**Vue 项目必扫（10 项）：**

| # | 扫描目标 | Grep 模式 | 危险原因 |
|---|---------|-----------|---------|
| 1 | switch case | `case.*\$t\(` | case 值来自后端，翻译后匹配失败 |
| 2 | 等值比较 | `===?\s*\$t\|!==?\s*\$t` | 与后端数据比较，翻译后永远不等 |
| 3 | indexOf/includes | `indexOf\(\$t\|includes\(\$t` | 匹配后端响应内容 |
| 4 | 路由 name | `\$router.*name.*\$t\(` | 路由 name 是技术标识符 |
| 5 | 存储键 | `habit.*\$t\(\|localStorage.*\$t\(` | 持久化键翻译后读不到旧数据 |
| 6 | EventBus 事件名 | `EventBus.*\$t\(` | on/emit 事件名不匹配 |
| 7 | el-tab name | `el-tab-pane.*:name=.*\$t` | tab 标识符不能翻译 |
| 8 | el-table prop | `:prop=.*\$t\(` | 数据路径不能翻译 |
| 9 | showRouter | `showRouter.*\$t\(` | 权限/路由匹配标识符 |
| 10 | 方括号访问 | `\[.*\$t\(` 结合上下文判断 | 后端数据字段访问 |

**静态项目必扫（5 项）：**

| # | 扫描目标 | Grep 模式 | 危险原因 |
|---|---------|-----------|---------|
| 1 | data-i18n-value | `data-i18n-value=` | 表单提交值被翻译 |
| 2 | hidden input | `type="hidden".*data-i18n` | 纯业务数据 |
| 3 | data-* 业务属性 | `data-i18n-data-` | JS dataset 读取值变了 |
| 4 | option value 标记 | `<option.*data-i18n-value` | 下拉选项提交值 |
| 5 | querySelector 中文 | `querySelector.*\$t\(` | 选择器失效 |

对每条 Grep 命中结果，按"对比判断规则"逐条判断是 ✅ 安全还是 ❌ 危险。
```

- [ ] **Step 2: 在"注意事项"中添加跨文件追踪要求**

在 `## 注意事项` 部分末尾追加：

```markdown
- **跨文件数据流追踪**：发现任何被 $t() 包裹的值用作"标识符"（非纯 UI 展示）时，必须 Grep 全项目追踪该值在所有文件中的使用点。重点追踪：
  - EventBus 事件名：`$on('事件名')` 和 `$emit('事件名')` 必须配对检查
  - 组件传参链：模板传参 → script 接收 → switch/case 比较
  - $refs 调用链：`$refs.xxx.show(params)` 的 params 内容
  - 路由跳转：一个模块跳转另一个模块的路由 name
```

- [ ] **Step 3: Commit**

```bash
git add agents/i18n-code.md
git commit -m "feat(i18n-code): add grep scan checklist and cross-file tracking rules

10 Vue + 5 HTML high-risk patterns for mandatory grep scanning.
Cross-file data flow tracking requirements for identifiers."
```

---

### Task 5: i18n-text agent — 增加变量保护和翻译质量规则

**Files:**
- Modify: `agents/i18n-text.md`

**背景:** haiku 子代理会翻译插值变量名中的中文（如 `{item_seat_待上机}` → `{item_seat_Awaiting}`），以及翻译过于冗长。

- [ ] **Step 1: 在"翻译规则速查"表格中强化变量保护**

在 `## 翻译规则速查` 表格中，将 `{name}`、`{0}`、`%s`、`{{ key }}` 那行替换为更详细的说明：

```markdown
| `{name}`、`{0}`、`%s`、`{{ key }}` | **原样保留，包括变量名中的中文** |
```

并在表格后添加警告框：

```markdown
> **⚠️ 变量名保护（最严重的翻译错误）：**
>
> 插值变量名中可能包含中文，这些中文是代码标识符的一部分，**严禁翻译**：
> - ❌ `{item_seat_待上机}` → `{item_seat_Awaiting}` （变量名被翻译，运行时崩溃）
> - ✅ `{item_seat_待上机}` → `{item_seat_待上机}` （保持原样）
>
> **验证方法**：翻译完成后，对比每个 key 和 value 中的 `{xxx}` 变量集合，必须完全一致。
```

- [ ] **Step 2: 添加翻译简化规则**

在 `## 完成后输出摘要` 之前添加：

```markdown
## 翻译风格规则

翻译要在**不丢失语义的前提下尽量精简**，用最少的词表达完整含义：

| 场景 | 规则 | 示例 |
|------|------|------|
| 按钮/操作 | 1-2 个单词，祈使语气 | 确定→Confirm, 搜索→Search |
| 标签/标题 | 名词短语 | 预付房费→Room Prepay |
| 提示信息 | 完整但简洁的句子 | 请输入用户名→Enter username |
| 去掉客套词 | 去掉"请""是否""确认" | 是否删除？→Delete? |
| 状态文本 | 最短表达 | 该客人是未成年人→Minor |
```

- [ ] **Step 3: 添加翻译后自检要求**

在 `## 完成后输出摘要` 中追加自检项：

```markdown
## 翻译后自检【必做】

翻译完成写入文件前，必须执行以下检查：

1. **变量一致性**：遍历所有 key-value，确认 `{xxx}` 变量集合一致（数量和名称都匹配）
2. **无空值遗漏**：确认所有空字符串 value 都已翻译
3. **JSON 合法性**：确认输出是合法 JSON（无多余逗号、引号匹配）
```

- [ ] **Step 4: Commit**

```bash
git add agents/i18n-text.md
git commit -m "feat(i18n-text): add variable protection, translation style, and self-check

- Warn against translating variable names containing Chinese
- Add concise translation style rules
- Require variable consistency self-check before writing"
```

---

### Task 6: i18n-workflow — 增加替换后验证和翻译质量检查

**Files:**
- Modify: `skills/i18n-workflow/SKILL.md`

**背景:** 工作流需要在替换后（步骤 3→4 之间）增加自动验证扫描，在翻译后（步骤 4→5 之间）增加翻译质量检查。

- [ ] **Step 1: 在步骤 3 和步骤 4 之间插入"步骤 3.5：替换后高危验证扫描"**

在 `### 步骤 3：替换中文` 之后、`### 步骤 4：翻译语言包` 之前插入：

```markdown
### 步骤 3.5：替换后高危验证扫描【不可跳过】

替换脚本完成后，**必须**在主线程执行以下 Grep 扫描，自动发现并修复高危误替换：

**Vue 项目扫描命令（使用 Grep 工具，逐条执行）：**

| # | 扫描模式 | 修复方式 |
|---|---------|---------|
| 1 | `case.*\$t\(` 或 `case.*window\.\$t\(` | 还原 case 值为原始中文 |
| 2 | `===?\s*\$t\|===?\s*window\.\$t` | 还原比较值为原始中文 |
| 3 | `indexOf\(\$t\|indexOf\(window\.\$t\|includes\(\$t\|includes\(window\.\$t` | 还原匹配值 |
| 4 | `\$router.*name.*\$t\(` | 还原路由 name 为原始中文 |
| 5 | `habit.*\$t\(\|localStorage.*\$t\(` | 还原存储键 |
| 6 | `EventBus.*\$t\(` | 还原事件名 |
| 7 | `el-tab-pane.*:name=.*\$t` | 还原 tab name，用 slot="label" 包裹翻译文本 |
| 8 | `:prop=.*\$t\(` | 还原 prop 为原始值 |
| 9 | `showRouter.*\$t\(` | 还原 showRouter 参数 |

**静态项目扫描命令：**

| # | 扫描模式 | 修复方式 |
|---|---------|---------|
| 1 | `data-i18n-value=` | 删除 data-i18n-value 属性 |
| 2 | `type="hidden".*data-i18n` | 删除 hidden input 上的 data-i18n |
| 3 | `data-i18n-data-` | 删除业务 data-* 的 i18n 标记 |

**执行规则：**
- 每条 Grep 有命中 → 主线程直接修复（不派发子代理）
- 全部扫描通过（0 命中）→ 继续步骤 4
- 修复后重新执行对应的 Grep 确认归零
```

- [ ] **Step 2: 在步骤 4 后添加"步骤 4.5：翻译质量检查"**

在 `### 步骤 4：翻译语言包` 之后、`### 步骤 5：首次审核` 之前插入：

```markdown
### 步骤 4.5：翻译质量检查【不可跳过】

翻译子代理完成后，**必须**在主线程验证翻译质量：

**检查项：**

1. **插值变量一致性**（最严重）：读取翻译 JSON，对比每个 key-value 中的 `{xxx}` 变量集合，报告不一致的条目
2. **空值遗漏**：检查是否还有空字符串 value 未翻译
3. **JSON 合法性**：确认文件是合法 JSON

**变量一致性检查方法**：

```javascript
// 读取翻译 JSON 后执行
const re = /\{([^}]+)\}/g;
const issues = [];
for (const [key, val] of Object.entries(data)) {
  if (typeof val !== 'string' || !val) continue;
  const keyVars = [...key.matchAll(re)].map(m => m[1]).sort();
  const valVars = [...val.matchAll(re)].map(m => m[1]).sort();
  if (JSON.stringify(keyVars) !== JSON.stringify(valVars)) {
    issues.push({ key, keyVars, valVars });
  }
}
```

发现问题 → 主线程直接修复翻译 JSON → 修复后重新检查 → 全部通过后继续步骤 5。
```

- [ ] **Step 3: 更新工作流图**

更新步骤 0 下方的 `digraph` 图，在 replace 和 translate 之间插入 verify 节点，在 translate 和 review 之间插入 quality-check 节点。

- [ ] **Step 4: 更新步骤编号提示**

将 `⚠️ 严格按步骤 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 顺序执行` 更新为：

```
⚠️ 严格按步骤 0 → 1 → 2 → 3 → 3.5 → 4 → 4.5 → 5 → 6 → 7 顺序执行，禁止跳过任何步骤。
```

- [ ] **Step 5: Commit**

```bash
git add skills/i18n-workflow/SKILL.md
git commit -m "feat(workflow): add post-replace verification and translation quality check

- Step 3.5: grep-based high-risk pattern scan with auto-fix
- Step 4.5: variable consistency check for translations
- Updated workflow diagram and step numbering"
```

---

### Task 7: 版本号更新和最终验证

**Files:**
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: 更新版本号**

将 `plugin.json` 中的 version 从 `2.1.2` 更新为 `2.2.0`（新增功能性改动）。

- [ ] **Step 2: 全局搜索验证无遗漏**

检查所有改动文件无语法错误、无遗漏引用。

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "chore: bump plugin version to 2.2.0"
```
