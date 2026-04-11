# i18n 审核系统升级 - 第一期 (MVP) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 `i18n-code` agent 偷懒根源：把机械化高危扫描 + 翻译质量检查下沉到 `i18n-validate.js`；agent 改为读 validator 产出的结构化 JSON 并对每条命中给出 verdict。

**Architecture:** 三层分离 —— validator 脚本（确定性机械检查）→ i18n-code agent（语义判断）→ 主线程修复循环。本期只做第一层的能力补全（新增 14 条 A 类规则 + 扩展 C 类翻译质量检查 + JSON 输出 + 退出码分级），第二层改 prompt 协议，第三层流程调整。

**Tech Stack:** Node.js（无依赖），`node --test` runner，regex + 多行扫描。

**Spec：** `docs/superpowers/specs/2026-04-11-audit-system-upgrade-design.md`

---

## 文件结构

**新建：**
- `skills/i18n-replace/validate-rules.js` — 规则数据模块（导出规则数组）
- `tests/validate-rules.test.js` — 每条规则的单元测试（inline string fixture）
- `tests/validate-integration.test.js` — 端到端集成测试（执行 CLI，解析 JSON 输出）
- `tests/fixtures/validate-phase1/vue-project/` — Vue 集成测试项目 fixture
- `tests/fixtures/validate-phase1/wx-project/` — wx 集成测试项目 fixture
- `tests/fixtures/validate-phase1/translations/` — 翻译 JSON 质量测试 fixtures

**修改：**
- `skills/i18n-replace/i18n-validate.js` — 消费 `validate-rules.js`，新增 `--format json`、`--out`、退出码分级、C 类检查扩展
- `agents/i18n-code.md` — 重写为 JSON 协议：读 issues.json 输出 verdicts.json
- `skills/i18n-workflow/SKILL.md` — 在替换与审核之间插入 validate step
- `README.md` — 记录 validator 新能力
- `tests/validate.test.js` — 保持不变（旧测试，向后兼容）

---

## Task 1：重构 —— 抽出规则到 `validate-rules.js`（无行为变化）

**Files:**
- Create: `skills/i18n-replace/validate-rules.js`
- Modify: `skills/i18n-replace/i18n-validate.js:56-88`

**目的：** 为后续加规则打基础。纯粹重构，把现有的 `VUE_PATTERNS/HTML_PATTERNS/WX_PATTERNS` 搬家 + 加 `id` 字段，不改行为。

- [ ] **Step 1：确认当前测试全绿（baseline）**

Run: `cd F:/i18n-plugin && node --test tests/validate.test.js`
Expected: PASS，4 tests

- [ ] **Step 2：创建 `validate-rules.js` 并搬家现有规则**

Create `skills/i18n-replace/validate-rules.js`:

```js
/**
 * i18n 验证规则数据模块
 *
 * 每条规则结构：
 *   {
 *     id:         'V01',            // 唯一 id（V=vue, H=html, W=wx, A=新增, C=翻译质量）
 *     category:   'pattern',         // pattern | translation | cross-file | init
 *     scope:      'vue'|'wx'|'html', // 适用项目类型
 *     regex:      /.../,             // pattern 类规则用
 *     severity:   '🔴'|'🟠'|'🟡',
 *     name:       '简短名称',
 *     description:'详细说明',
 *     fix:        '修复建议'
 *   }
 */

const VUE_RULES = [
  { id: 'V01', category: 'pattern', scope: 'vue', regex: /case\s+.*\$t\s*\(/,                       severity: '🔴', name: 'switch case 中 $t',       description: 'case 值来自后端，翻译后匹配失败', fix: 'case 值改回原始中文字面量' },
  { id: 'V02', category: 'pattern', scope: 'vue', regex: /[=!]==?\s*\$t\s*\(/,                      severity: '🔴', name: '等值比较中 $t',          description: '与后端数据比较，翻译后永远不等', fix: '比较值保持原始中文' },
  { id: 'V03', category: 'pattern', scope: 'vue', regex: /\$t\s*\([^)]*\)\s*[=!]==?/,               severity: '🔴', name: '$t 后等值比较',         description: '与后端数据比较，翻译后永远不等', fix: '比较值保持原始中文' },
  { id: 'V04', category: 'pattern', scope: 'vue', regex: /\.(?:indexOf|includes)\s*\(\s*\$t\s*\(/,  severity: '🔴', name: 'indexOf/includes 中 $t', description: '匹配后端响应内容，翻译后失败', fix: '匹配值保持原始中文' },
  { id: 'V05', category: 'pattern', scope: 'vue', regex: /\$router.*name.*\$t\s*\(/,                severity: '🟠', name: '路由 name 中 $t',       description: '路由 name 是技术标识符', fix: '路由 name 保持原始中文或改 path' },
  { id: 'V06', category: 'pattern', scope: 'vue', regex: /showRouter\s*\(.*\$t/,                    severity: '🟠', name: 'showRouter 中 $t',      description: '权限/路由匹配标识符', fix: '参数保持原始中文' },
  { id: 'V07', category: 'pattern', scope: 'vue', regex: /(?:habit|localStorage).*\$t\s*\(/,        severity: '🟠', name: '存储键中 $t',           description: '持久化键翻译后读不到旧数据', fix: '存储键保持原始中文' },
  { id: 'V08', category: 'pattern', scope: 'vue', regex: /(?:EventBus|\$bus).*\$t\s*\(/,            severity: '🟠', name: 'EventBus 中 $t',        description: 'on/emit 事件名不匹配', fix: '事件名保持原始中文' },
  { id: 'V09', category: 'pattern', scope: 'vue', regex: /el-tab-pane[^>]*:name=.*\$t/,             severity: '🟡', name: 'el-tab name 中 $t',     description: 'tab 标识符不能翻译', fix: 'name 保持原始中文，label 用 $t' },
  { id: 'V10', category: 'pattern', scope: 'vue', regex: /:prop=.*\$t\s*\(/,                        severity: '🟡', name: 'el-table prop 中 $t',   description: '数据路径不能翻译', fix: 'prop 保持原字段名' },
];

const HTML_RULES = [
  { id: 'H01', category: 'pattern', scope: 'html', regex: /<option[^>]*data-i18n-value/,             severity: '🔴', name: 'option value 标记',    description: '表单提交值被翻译', fix: '去掉 data-i18n-value' },
  { id: 'H02', category: 'pattern', scope: 'html', regex: /type=["']hidden["'][^>]*data-i18n/,       severity: '🔴', name: 'hidden input 标记',    description: '纯业务数据', fix: '去掉 data-i18n' },
  { id: 'H03', category: 'pattern', scope: 'html', regex: /data-i18n-data-/,                         severity: '🟠', name: 'data-* 业务属性',      description: 'JS dataset 读取值变了', fix: '去掉 data-i18n-data-*' },
  { id: 'H04', category: 'pattern', scope: 'html', regex: /data-i18n-value=/,                        severity: '🟠', name: 'value 属性标记',       description: '下拉选项提交值', fix: '去掉 data-i18n-value' },
  { id: 'H05', category: 'pattern', scope: 'html', regex: /querySelector.*\$t\s*\(/,                 severity: '🟡', name: 'querySelector 中 $t',  description: '选择器失效', fix: '选择器保持原始字符串' },
];

const WX_RULES = [
  { id: 'W01', category: 'pattern', scope: 'wx', regex: /case\s+.*global\.\$t\s*\(/,                              severity: '🔴', name: 'switch case 中 global.$t',       description: 'case 值来自后端，翻译后匹配失败', fix: 'case 值保持原始中文' },
  { id: 'W02', category: 'pattern', scope: 'wx', regex: /[=!]==?\s*global\.\$t\s*\(/,                             severity: '🔴', name: '等值比较中 global.$t',          description: '与后端数据比较，翻译后永远不等', fix: '比较值保持原始中文' },
  { id: 'W03', category: 'pattern', scope: 'wx', regex: /global\.\$t\s*\([^)]*\)\s*[=!]==?/,                      severity: '🔴', name: 'global.$t 后等值比较',         description: '与后端数据比较，翻译后永远不等', fix: '比较值保持原始中文' },
  { id: 'W04', category: 'pattern', scope: 'wx', regex: /\.(?:indexOf|includes)\s*\(\s*global\.\$t\s*\(/,         severity: '🔴', name: 'indexOf/includes 中 global.$t', description: '匹配后端响应内容', fix: '匹配值保持原始中文' },
  { id: 'W05', category: 'pattern', scope: 'wx', regex: /wx\.(?:set|get|remove)Storage.*global\.\$t\s*\(/,        severity: '🟠', name: 'wx 存储键中 global.$t',        description: '持久化键翻译后读不到旧数据', fix: '存储键保持原始中文' },
  { id: 'W06', category: 'pattern', scope: 'wx', regex: /wx\.(?:navigateTo|redirectTo).*global\.\$t\s*\(/,        severity: '🟠', name: 'wx 路由参数中 global.$t',      description: 'URL/路由参数不能翻译', fix: '参数保持原字符串' },
  { id: 'W07', category: 'pattern', scope: 'wx', regex: /\[.*global\.\$t\s*\(/,                                   severity: '🟡', name: '方括号访问中 global.$t',       description: '后端数据字段访问', fix: '字段名保持原字符串' },
  { id: 'W08', category: 'pattern', scope: 'wx', regex: /global\.\$t\s*\([^)]*\)\s*:/,                            severity: '🔴', name: '对象 key 中 global.$t',        description: '对象 key 不能是函数调用', fix: '改为计算属性 [global.$t("...")]' },
];

function getRulesForType(type) {
  if (type === 'vue')  return VUE_RULES;
  if (type === 'wx')   return WX_RULES;
  if (type === 'html') return HTML_RULES;
  return [];
}

function findRule(id) {
  return [...VUE_RULES, ...HTML_RULES, ...WX_RULES].find(r => r.id === id);
}

module.exports = { VUE_RULES, HTML_RULES, WX_RULES, getRulesForType, findRule };
```

- [ ] **Step 3：修改 `i18n-validate.js` 使用新模块**

Edit `skills/i18n-replace/i18n-validate.js`:

将 56-88 行的三个 PATTERNS 数组整块删除，替换为：

```js
const { getRulesForType } = require('./validate-rules');
```

将 242 行：
```js
const patterns = type === 'wx' ? WX_PATTERNS : type === 'vue' ? VUE_PATTERNS : HTML_PATTERNS;
```
改为：
```js
const patterns = getRulesForType(type);
```

由于规则字段从 `{regex, severity, name}` 变为含 `id, name, description, fix` 的完整对象，但 `scanFile` 仍然只用 `regex/severity/name`，所以**不需要改 scanFile**。

- [ ] **Step 4：运行现有测试，确认无回归**

Run: `cd F:/i18n-plugin && node --test tests/validate.test.js`
Expected: PASS，4 tests（行为未变）

- [ ] **Step 5：提交**

```bash
cd F:/i18n-plugin
git add skills/i18n-replace/validate-rules.js skills/i18n-replace/i18n-validate.js
git commit -m "refactor: extract validate rules to separate module

Prepare for phase 1 rule expansion. No behavior change — just
move rule data to validate-rules.js with id/description/fix fields."
```

---

## Task 2：建立规则单元测试框架 + A1/A2 规则

**Files:**
- Create: `tests/validate-rules.test.js`
- Modify: `skills/i18n-replace/validate-rules.js`

**规则：**
- A1：对象字面量 key 用 `$t()`（JS 语法错误）
- A2：嵌套 `$t($t(...))`

- [ ] **Step 1：写失败测试 —— 建立测试文件**

Create `tests/validate-rules.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { findRule } = require('../skills/i18n-replace/validate-rules');

function matchAny(rule, lines) {
  return lines.some(l => rule.regex.test(l));
}

describe('Phase 1 rules', () => {
  describe('A1 - 对象字面量 key 用 $t', () => {
    const rule = findRule('A1');
    it('rule exists', () => {
      assert.ok(rule, 'A1 rule must exist');
      assert.equal(rule.severity, '🔴');
    });
    it('matches object key using $t', () => {
      const positive = "  window.$t('绑定用户'): 'bind',";
      assert.match(positive, rule.regex);
    });
    it('does not match $t used as value', () => {
      const negative = "  type: window.$t('绑定用户'),";
      assert.doesNotMatch(negative, rule.regex);
    });
  });

  describe('A2 - 嵌套 $t($t(...))', () => {
    const rule = findRule('A2');
    it('rule exists', () => {
      assert.ok(rule, 'A2 rule must exist');
      assert.equal(rule.severity, '🔴');
    });
    it('matches nested window.$t(window.$t(...))', () => {
      const positive = "const x = window.$t(window.$t('xxx'));";
      assert.match(positive, rule.regex);
    });
    it('matches nested $t($t(...))', () => {
      const positive = "const x = $t($t('xxx'));";
      assert.match(positive, rule.regex);
    });
    it('does not match sibling $t calls', () => {
      const negative = "const x = $t('a') + $t('b');";
      assert.doesNotMatch(negative, rule.regex);
    });
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: FAIL，A1 rule must exist / A2 rule must exist

- [ ] **Step 3：实现 A1 和 A2 规则**

Edit `skills/i18n-replace/validate-rules.js`，在 `VUE_RULES` 数组末尾追加（也加入 `WX_RULES`，因为两类项目都可能出现）：

```js
// Phase 1 新增：通用高危规则（A 类）
const A_RULES_COMMON = [
  {
    id: 'A1', category: 'pattern', scope: 'all',
    regex: /^\s*(?:window\.|global\.)?\$t\s*\([^)]*\)\s*:/,
    severity: '🔴',
    name: '对象字面量 key 用 $t()',
    description: 'JS 对象字面量 key 不能是函数调用，会导致 SyntaxError',
    fix: '改为计算属性 [window.$t("...")]: value'
  },
  {
    id: 'A2', category: 'pattern', scope: 'all',
    regex: /(?:window\.|global\.)?\$t\s*\(\s*(?:window\.|global\.)?\$t\s*\(/,
    severity: '🔴',
    name: '嵌套 $t($t(...))',
    description: '双重翻译，内层返回值已是翻译后文本，外层找不到 key',
    fix: '只保留一层 $t()'
  },
];
```

然后在文件底部的 exports 和合并逻辑中：

```js
// 把 A 类规则同时追加到 VUE_RULES 和 WX_RULES
VUE_RULES.push(...A_RULES_COMMON);
WX_RULES.push(...A_RULES_COMMON);
HTML_RULES.push(...A_RULES_COMMON);

module.exports = { VUE_RULES, HTML_RULES, WX_RULES, A_RULES_COMMON, getRulesForType, findRule };
```

- [ ] **Step 4：运行测试确认通过**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: PASS，A1 和 A2 所有测试通过

- [ ] **Step 5：提交**

```bash
cd F:/i18n-plugin
git add tests/validate-rules.test.js skills/i18n-replace/validate-rules.js
git commit -m "feat(validate): add A1/A2 rules (object key \$t, nested \$t)

Detect JS syntax errors from object-key \$t calls and double
translation anti-patterns. Applies to vue/wx/html projects."
```

---

## Task 3：A3、A10、A11 规则（wx 专有）

**Files:**
- Modify: `tests/validate-rules.test.js`
- Modify: `skills/i18n-replace/validate-rules.js`

**规则：**
- A3：WXML 嵌套 `$t['...$t[...']`
- A10：wx 双逗号语法错误（函数参数残留）
- A11：wx 多余括号 `$t(...))`

- [ ] **Step 1：追加测试**

在 `tests/validate-rules.test.js` 的 `describe('Phase 1 rules')` 块内追加：

```js
  describe('A3 - WXML 嵌套 $t[...$t[...]]', () => {
    const rule = findRule('A3');
    it('rule exists', () => {
      assert.ok(rule);
      assert.equal(rule.severity, '🔴');
    });
    it('matches nested $t[] in wxml', () => {
      const positive = "{{$t['单价' + $t['元']]}}";
      assert.match(positive, rule.regex);
    });
    it('does not match single $t[]', () => {
      const negative = "{{$t['单价']}}{{item.price}}";
      assert.doesNotMatch(negative, rule.regex);
    });
  });

  describe('A10 - wx 双逗号', () => {
    const rule = findRule('A10');
    it('rule exists', () => {
      assert.ok(rule);
    });
    it('matches double comma after $t', () => {
      const positive = "const { obtain,, $t } = this.data;";
      assert.match(positive, rule.regex);
    });
    it('does not match normal comma', () => {
      const negative = "const { obtain, $t } = this.data;";
      assert.doesNotMatch(negative, rule.regex);
    });
  });

  describe('A11 - wx 多余括号', () => {
    const rule = findRule('A11');
    it('rule exists', () => {
      assert.ok(rule);
    });
    it('matches extra closing parens', () => {
      const positive = "wx.showToast({ title: global.$t('成功')) })";
      assert.match(positive, rule.regex);
    });
    it('does not match balanced parens', () => {
      const negative = "wx.showToast({ title: global.$t('成功') })";
      assert.doesNotMatch(negative, rule.regex);
    });
  });
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: FAIL，A3/A10/A11 rule must exist

- [ ] **Step 3：实现规则**

Edit `skills/i18n-replace/validate-rules.js`，在 `A_RULES_COMMON` 下方新增一个 wx 专有数组：

```js
const A_RULES_WX = [
  {
    id: 'A3', category: 'pattern', scope: 'wx',
    regex: /\$t\[[^\]]*\$t\[/,
    severity: '🔴',
    name: 'WXML 嵌套 $t[...$t[...]]',
    description: 'WXML 模板编译会报错',
    fix: '只保留外层 $t[]，内层用变量或字面量'
  },
  {
    id: 'A10', category: 'pattern', scope: 'wx',
    regex: /,\s*,/,
    severity: '🟠',
    name: 'wx 双逗号语法错误',
    description: '替换脚本追加 $t 到解构时产生双逗号',
    fix: '删除多余逗号'
  },
  {
    id: 'A11', category: 'pattern', scope: 'wx',
    regex: /\$t\s*\([^)]*\)\s*\)\s*\)/,
    severity: '🟠',
    name: 'wx 多余闭合括号',
    description: '替换脚本包裹 $t 时多加了一个 )',
    fix: '删除多余的 )'
  },
];
```

下方合并逻辑补充：
```js
WX_RULES.push(...A_RULES_WX);
```

- [ ] **Step 4：运行测试确认通过**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: PASS，A1/A2/A3/A10/A11 所有测试通过

- [ ] **Step 5：提交**

```bash
cd F:/i18n-plugin
git add tests/validate-rules.test.js skills/i18n-replace/validate-rules.js
git commit -m "feat(validate): add wx-specific A3/A10/A11 rules

A3: nested \$t[] in WXML
A10: double-comma syntax residue from replace script
A11: extra closing paren syntax residue from replace script"
```

---

## Task 4：A4、A5、A6、A7 规则（协议/业务标识）

**Files:**
- Modify: `tests/validate-rules.test.js`
- Modify: `skills/i18n-replace/validate-rules.js`

**规则：**
- A4：支付协议 `body` 字段被 `$t` 包裹
- A5：`$mode` 业务标识被 `$t` 包裹
- A6：`checkOperate` 的 name 参数被 `$t` 包裹（TM_h5 项目惯例，可配置）
- A7：`res.msg.indexOf($t(...))`

- [ ] **Step 1：追加测试**

在 `describe('Phase 1 rules')` 内追加：

```js
  describe('A4 - body 字段协议', () => {
    const rule = findRule('A4');
    it('rule exists', () => {
      assert.ok(rule);
      assert.equal(rule.severity, '🔴');
    });
    it('matches body: $t(...)', () => {
      const positive = "  body: window.$t('包时套餐'),";
      assert.match(positive, rule.regex);
    });
    it('does not match body-like key', () => {
      const negative = "  bodyLabel: window.$t('描述'),";
      assert.doesNotMatch(negative, rule.regex);
    });
  });

  describe('A5 - $mode 业务标识', () => {
    const rule = findRule('A5');
    it('rule exists', () => {
      assert.ok(rule);
    });
    it('matches $mode: $t(...)', () => {
      const positive = "  $mode: window.$t('买赠'),";
      assert.match(positive, rule.regex);
    });
  });

  describe('A6 - checkOperate name 参数', () => {
    const rule = findRule('A6');
    it('rule exists', () => {
      assert.ok(rule);
    });
    it('matches checkOperate name with $t', () => {
      const positive = "checkOperate({ name: window.$t('订座'), ... })";
      assert.match(positive, rule.regex);
    });
  });

  describe('A7 - res.msg.indexOf($t)', () => {
    const rule = findRule('A7');
    it('rule exists', () => {
      assert.ok(rule);
    });
    it('matches res.msg.indexOf', () => {
      const positive = "if (res.msg.indexOf($t('成功')) > -1) {}";
      assert.match(positive, rule.regex);
    });
    it('matches res.message.indexOf', () => {
      const positive = "if (res.message.indexOf(window.$t('成功')) > -1) {}";
      assert.match(positive, rule.regex);
    });
  });
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: FAIL

- [ ] **Step 3：实现规则**

Edit `skills/i18n-replace/validate-rules.js`，在 `A_RULES_COMMON` 数组内追加：

```js
  {
    id: 'A4', category: 'pattern', scope: 'all',
    regex: /\bbody\s*:\s*(?:window\.|global\.)?\$t\s*\(/,
    severity: '🔴',
    name: 'body 字段被 $t 包裹（支付协议）',
    description: 'body 是支付网关订单描述字段，翻译后对账/退款失败',
    fix: 'body 保持原始中文或模板字符串拼接'
  },
  {
    id: 'A5', category: 'pattern', scope: 'all',
    regex: /\$mode\s*:\s*(?:window\.|global\.)?\$t\s*\(/,
    severity: '🔴',
    name: '$mode 业务标识被 $t 包裹',
    description: '$mode 用于 storage/逻辑判断，翻译后比较失败',
    fix: '$mode 保持原始中文'
  },
  {
    id: 'A6', category: 'pattern', scope: 'all',
    regex: /checkOperate\s*\([^)]*name\s*:\s*(?:window\.|global\.)?\$t/,
    severity: '🔴',
    name: 'checkOperate name 参数被 $t 包裹',
    description: 'checkOperate 内部用 indexOf 匹配原始中文（TM_h5 项目惯例）',
    fix: 'name 参数保持原始中文',
    projectSpecific: true
  },
  {
    id: 'A7', category: 'pattern', scope: 'all',
    regex: /res\.(?:msg|message)\.indexOf\s*\(\s*(?:window\.|global\.)?\$t/,
    severity: '🔴',
    name: 'res.msg.indexOf 中 $t',
    description: '后端 msg 是中文，翻译后匹配失败',
    fix: '用 res.code 数值判断或保持原始中文'
  },
```

- [ ] **Step 4：运行测试**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: PASS

- [ ] **Step 5：提交**

```bash
cd F:/i18n-plugin
git add tests/validate-rules.test.js skills/i18n-replace/validate-rules.js
git commit -m "feat(validate): add A4-A7 rules for protocol/business markers

A4: body field (payment gateway description, don't translate)
A5: \$mode business identifier
A6: checkOperate name parameter (TM_h5 convention)
A7: res.msg.indexOf with \$t (backend message matching)"
```

---

## Task 5：A8、A9 规则（双用途字段）

**Files:**
- Modify: `tests/validate-rules.test.js`
- Modify: `skills/i18n-replace/validate-rules.js`

**规则：**
- A8：`sort_label == $t(...)` 等截取字段比较
- A9：`tag_name = $t(...)` 等双用途字段赋值

- [ ] **Step 1：追加测试**

```js
  describe('A8 - sort_label 截取字段比较', () => {
    const rule = findRule('A8');
    it('rule exists', () => {
      assert.ok(rule);
    });
    it('matches sort_label == $t', () => {
      const positive = "if (item.sort_label == window.$t('时')) { }";
      assert.match(positive, rule.regex);
    });
    it('matches sort_label !== $t', () => {
      const positive = "if (sort_label !== $t('天')) { }";
      assert.match(positive, rule.regex);
    });
  });

  describe('A9 - 双用途字段赋值 $t', () => {
    const rule = findRule('A9');
    it('rule exists', () => {
      assert.ok(rule);
    });
    it('matches tag_name = $t', () => {
      const positive = "item.tag_name = window.$t('组合套餐');";
      assert.match(positive, rule.regex);
    });
    it('matches tag_box_name = $t', () => {
      const positive = "this.tag_box_name = $t('套餐');";
      assert.match(positive, rule.regex);
    });
    it('matches recharge_tag_name = $t', () => {
      const positive = "recharge_tag_name = window.$t('充值');";
      assert.match(positive, rule.regex);
    });
  });
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: FAIL

- [ ] **Step 3：实现规则**

在 `A_RULES_COMMON` 内追加：

```js
  {
    id: 'A8', category: 'pattern', scope: 'all',
    regex: /\bsort_label\s*[=!]==?\s*(?:window\.|global\.)?\$t/,
    severity: '🟠',
    name: 'sort_label 截取字段与 $t 比较',
    description: '后端字典截取值是中文，翻译后比较失败',
    fix: '保持原始中文比较'
  },
  {
    id: 'A9', category: 'pattern', scope: 'all',
    regex: /\b(?:tag_name|tag_box_name|recharge_tag_name)\s*=\s*(?:window\.|global\.)?\$t/,
    severity: '🟠',
    name: '双用途字段赋值被 $t 包裹',
    description: '字段同时用于后端数据传递和 UI 展示，赋值处翻译会导致后端数据失真',
    fix: '数据层保持原文，模板 {{ $t(item.tag_name) }} 翻译'
  },
```

- [ ] **Step 4：运行测试**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: PASS

- [ ] **Step 5：提交**

```bash
cd F:/i18n-plugin
git add tests/validate-rules.test.js skills/i18n-replace/validate-rules.js
git commit -m "feat(validate): add A8/A9 rules for dual-use fields

A8: sort_label dictionary-sliced comparison
A9: tag_name/tag_box_name/recharge_tag_name assignment"
```

---

## Task 6：A12 规则（HTML 注释占位符残留）

**Files:**
- Modify: `tests/validate-rules.test.js`
- Modify: `skills/i18n-replace/validate-rules.js`

**规则：**
- A12：`__HTML_COMMENT_N__` 占位符残留在代码或 JSON 中

- [ ] **Step 1：追加测试**

```js
  describe('A12 - HTML 注释占位符残留', () => {
    const rule = findRule('A12');
    it('rule exists', () => {
      assert.ok(rule);
      assert.equal(rule.severity, '🔴');
    });
    it('matches HTML_COMMENT placeholder in code', () => {
      const positive = "{{ $t('__HTML_COMMENT_0__ 感谢！') }}";
      assert.match(positive, rule.regex);
    });
    it('matches placeholder in JSON key', () => {
      const positive = '"支付支持 __HTML_COMMENT_2__": "..."';
      assert.match(positive, rule.regex);
    });
    it('does not match unrelated HTML_COMMENT-like text', () => {
      const negative = "// HTML_COMMENT is a concept";
      assert.doesNotMatch(negative, rule.regex);
    });
  });
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: FAIL

- [ ] **Step 3：实现规则**

在 `A_RULES_COMMON` 内追加：

```js
  {
    id: 'A12', category: 'pattern', scope: 'all',
    regex: /__HTML_COMMENT_\d+__/,
    severity: '🔴',
    name: 'HTML 注释占位符残留',
    description: '替换脚本误把 HTML 注释吞进 $t()，或占位符未清理',
    fix: '移除占位符，注释从 $t 中移出'
  },
```

- [ ] **Step 4：运行测试**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: PASS

- [ ] **Step 5：提交**

```bash
cd F:/i18n-plugin
git add tests/validate-rules.test.js skills/i18n-replace/validate-rules.js
git commit -m "feat(validate): add A12 rule for HTML_COMMENT placeholder residue"
```

---

## Task 7：A13 规则（JSON 弯引号检测）

**Files:**
- Modify: `skills/i18n-replace/i18n-validate.js`
- Modify: `tests/validate-rules.test.js`

**规则：**
- A13：tw.json 中含未转义的中文弯引号 `"` `"`（会导致 JSON 解析不稳定或显示异常）

注：A13 不是行级 regex，而是对 JSON 源文本的扫描。需要集成到 `validateTranslationJSON` 函数。

- [ ] **Step 1：写测试（文件级集成测试）**

Create fixture `tests/fixtures/validate-phase1/translations/with-curly-quotes.json`:

```json
{
  "普通文本": "normal text",
  "含弯引号": "含"中文"弯引号未转义"
}
```

在 `tests/validate-rules.test.js` 追加新的 describe：

```js
const fs = require('node:fs');
const path = require('node:path');

describe('A13 - JSON 弯引号未转义', () => {
  const fixturePath = path.join(__dirname, 'fixtures/validate-phase1/translations');
  const { detectCurlyQuotes } = require('../skills/i18n-replace/i18n-validate');

  it('detects curly quotes in JSON file', () => {
    const issues = detectCurlyQuotes(path.join(fixturePath, 'with-curly-quotes.json'));
    assert.ok(issues.length > 0);
    assert.equal(issues[0].severity, '🟠');
    assert.equal(issues[0].name, 'JSON 弯引号未转义');
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: FAIL, detectCurlyQuotes is not a function

- [ ] **Step 3：实现 detectCurlyQuotes**

Edit `skills/i18n-replace/i18n-validate.js`，在 `validateTranslationJSON` 函数下方添加：

```js
/**
 * A13: 扫描 JSON 源文本中未转义的中文弯引号
 * 期望用 \u201C / \u201D 转义
 */
function detectCurlyQuotes(jsonFilePath) {
  const issues = [];
  if (!fs.existsSync(jsonFilePath)) return issues;
  const content = fs.readFileSync(jsonFilePath, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (/[\u201C\u201D]/.test(line) && !line.includes('\\u201C') && !line.includes('\\u201D')) {
      issues.push({
        file: jsonFilePath,
        line: idx + 1,
        severity: '🟠',
        name: 'JSON 弯引号未转义',
        content: line.trim().substring(0, 120)
      });
    }
  });
  return issues;
}
```

在文件底部增加 exports（之前是脚本式，无 exports）。改为：

```js
// 导出给测试使用（仅在作为模块 require 时生效）
if (require.main !== module) {
  module.exports = { detectCurlyQuotes, validateTranslationJSON, readLangData };
}
```

- [ ] **Step 4：运行测试**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: PASS

- [ ] **Step 5：把 A13 也集成到主扫描流程**

Edit `skills/i18n-replace/i18n-validate.js`：在 Translation quality 块后增加 curly-quote 扫描。找到（约 263-267 行）：

```js
// Translation quality
if (checkTranslation || (!checkJson && !checkTranslation)) {
  allIssues.push(...validateTranslationJSON(i18nDir, lang));
}
```

改为：

```js
// Translation quality
if (checkTranslation || (!checkJson && !checkTranslation)) {
  allIssues.push(...validateTranslationJSON(i18nDir, lang));
  const langResult = readLangData(i18nDir, lang);
  if (langResult) {
    allIssues.push(...detectCurlyQuotes(langResult.filePath));
  }
}
```

- [ ] **Step 6：确认 CLI 行为不回归**

Run: `cd F:/i18n-plugin && node --test tests/validate.test.js`
Expected: PASS，4 tests

- [ ] **Step 7：提交**

```bash
cd F:/i18n-plugin
git add tests/fixtures/validate-phase1/translations/with-curly-quotes.json tests/validate-rules.test.js skills/i18n-replace/i18n-validate.js
git commit -m "feat(validate): add A13 rule for unescaped curly quotes in JSON

Expose detectCurlyQuotes as module export for testing.
Integrate into main translation quality scan."
```

---

## Task 8：A14 规则（￥ vs ¥ 双字符映射完整性）

**Files:**
- Modify: `skills/i18n-replace/i18n-validate.js`
- Modify: `tests/validate-rules.test.js`
- Create: `tests/fixtures/validate-phase1/translations/incomplete-yen.json`

**规则：**
- A14：如果代码中既有全角 ￥(U+FFE5) 又有半角 ¥(U+00A5)，翻译 JSON 必须同时包含两个字符的映射

- [ ] **Step 1：创建 fixture**

Create `tests/fixtures/validate-phase1/translations/incomplete-yen.json`:

```json
{
  "￥": "",
  "普通文本": "normal"
}
```

- [ ] **Step 2：写测试**

在 `tests/validate-rules.test.js` 追加：

```js
describe('A14 - ￥/¥ 双字符映射', () => {
  const fixturePath = path.join(__dirname, 'fixtures/validate-phase1/translations');
  const { detectYenCoverage } = require('../skills/i18n-replace/i18n-validate');

  it('detects missing yen when both exist in code', () => {
    const codeUsage = { fullwidth: true, halfwidth: true };
    const issues = detectYenCoverage(path.join(fixturePath, 'incomplete-yen.json'), codeUsage);
    assert.ok(issues.length > 0);
    assert.equal(issues[0].severity, '🟡');
  });

  it('no issue when only fullwidth used', () => {
    const codeUsage = { fullwidth: true, halfwidth: false };
    const issues = detectYenCoverage(path.join(fixturePath, 'incomplete-yen.json'), codeUsage);
    assert.equal(issues.length, 0);
  });
});
```

- [ ] **Step 3：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: FAIL

- [ ] **Step 4：实现 detectYenCoverage**

Edit `skills/i18n-replace/i18n-validate.js`，在 `detectCurlyQuotes` 下方：

```js
/**
 * A14: 检测 ￥ (U+FFE5) / ¥ (U+00A5) 双字符映射完整性
 * 如果代码中两个字符都用了，翻译包必须两个都有 key
 */
function detectYenCoverage(jsonFilePath, codeUsage) {
  const issues = [];
  if (!codeUsage.fullwidth || !codeUsage.halfwidth) return issues;
  if (!fs.existsSync(jsonFilePath)) return issues;
  let data;
  try {
    const content = fs.readFileSync(jsonFilePath, 'utf-8');
    const parsed = jsonFilePath.endsWith('.js')
      ? JSON.parse(content.replace(/^module\.exports\s*=\s*/, '').replace(/\s*;?\s*$/, ''))
      : JSON.parse(content);
    data = parsed;
  } catch {
    return issues;
  }
  const hasFullwidth = Object.keys(data).some(k => k.includes('\uFFE5'));
  const hasHalfwidth = Object.keys(data).some(k => k.includes('\u00A5'));
  if (!hasFullwidth || !hasHalfwidth) {
    issues.push({
      file: jsonFilePath,
      severity: '🟡',
      name: '￥/¥ 双字符映射不完整',
      content: `代码使用两种字符但翻译包只有 ${hasFullwidth ? '￥(U+FFE5)' : ''}${hasHalfwidth ? '¥(U+00A5)' : ''}`
    });
  }
  return issues;
}

function scanYenUsageInCode(files) {
  let fullwidth = false, halfwidth = false;
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf-8');
    if (content.includes('\uFFE5')) fullwidth = true;
    if (content.includes('\u00A5')) halfwidth = true;
    if (fullwidth && halfwidth) break;
  }
  return { fullwidth, halfwidth };
}
```

在导出中加入：

```js
if (require.main !== module) {
  module.exports = { detectCurlyQuotes, detectYenCoverage, scanYenUsageInCode, validateTranslationJSON, readLangData };
}
```

- [ ] **Step 5：运行测试**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: PASS

- [ ] **Step 6：集成到主扫描流程**

Edit `skills/i18n-replace/i18n-validate.js`：在 Task 7 修改过的 Translation quality 块后再加：

```js
  // A14: ￥/¥ 双字符映射完整性
  if (langResult) {
    const codeUsage = scanYenUsageInCode(files);
    allIssues.push(...detectYenCoverage(langResult.filePath, codeUsage));
  }
```

将该代码放到 `detectCurlyQuotes` 调用后（在 `if (langResult)` 块内）。

- [ ] **Step 7：提交**

```bash
cd F:/i18n-plugin
git add tests/fixtures/validate-phase1/translations/incomplete-yen.json tests/validate-rules.test.js skills/i18n-replace/i18n-validate.js
git commit -m "feat(validate): add A14 rule for ￥/¥ dual-character coverage

Ensure translation package has keys for both U+FFE5 and U+00A5
if the source code uses both."
```

---

## Task 9：C 类翻译质量 —— C1（插值变量名保护）、C2（JSON key 漂移检测）

**Files:**
- Modify: `skills/i18n-replace/i18n-validate.js`
- Modify: `tests/validate-rules.test.js`
- Create: `tests/fixtures/validate-phase1/translations/var-name-translated.json`

**规则：**
- C1：插值变量名中的中文部分被翻译（`{item_待上机}` → `{item_Awaiting}`）
- C2：haiku 子代理偶发把 JSON key 部分繁体化（简繁漂移）

注：C1 在现有 `validateTranslationJSON` 里已做变量一致性检查（变量列表长度）。这一步是加强：同一位置的变量名必须逐字符相同。

- [ ] **Step 1：创建 fixture**

Create `tests/fixtures/validate-phase1/translations/var-name-translated.json`:

```json
{
  "等待{item_待上机}分钟": "Wait {item_Awaiting} minutes",
  "正常{name}翻译": "Normal {name} translation"
}
```

Create `tests/fixtures/validate-phase1/translations/key-drift.json`:

```json
{
  "赠送网费漫游明细表": "Free Internet Fee Roaming Details",
  "赠送网费漫游明細表": "Free Internet Fee Roaming Details"
}
```

（注意 key 1 的"细"是简体 U+7EC6，key 2 的"細"是繁体 U+7D30，这是漂移症状）

- [ ] **Step 2：写测试**

在 `tests/validate-rules.test.js` 追加：

```js
describe('C1 - 插值变量名被翻译', () => {
  const fixturePath = path.join(__dirname, 'fixtures/validate-phase1/translations');
  const { detectVarNameTranslated } = require('../skills/i18n-replace/i18n-validate');

  it('detects translated variable name', () => {
    const issues = detectVarNameTranslated(path.join(fixturePath, 'var-name-translated.json'));
    assert.ok(issues.length >= 1);
    assert.ok(issues.some(i => i.name === '插值变量名被翻译'));
  });
});

describe('C2 - JSON key 简繁漂移', () => {
  const fixturePath = path.join(__dirname, 'fixtures/validate-phase1/translations');
  const { detectKeyDrift } = require('../skills/i18n-replace/i18n-validate');

  it('detects near-duplicate keys differing only in simplified/traditional', () => {
    const issues = detectKeyDrift(path.join(fixturePath, 'key-drift.json'));
    assert.ok(issues.length >= 1);
    assert.ok(issues.some(i => i.name === 'JSON key 简繁漂移'));
  });
});
```

- [ ] **Step 3：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: FAIL，两个函数都未定义

- [ ] **Step 4：实现 detectVarNameTranslated 和 detectKeyDrift**

Edit `skills/i18n-replace/i18n-validate.js`，在 `scanYenUsageInCode` 下方：

```js
/**
 * C1: 检测插值变量名本身被翻译
 * key "等待{item_待上机}分钟" vs val "Wait {item_Awaiting} minutes"
 * 变量名位置逐字符必须相同
 */
function detectVarNameTranslated(jsonFilePath) {
  const issues = [];
  let data;
  try {
    const content = fs.readFileSync(jsonFilePath, 'utf-8');
    data = jsonFilePath.endsWith('.js')
      ? JSON.parse(content.replace(/^module\.exports\s*=\s*/, '').replace(/\s*;?\s*$/, ''))
      : JSON.parse(content);
  } catch {
    return issues;
  }
  const varRe = /\{([^}]+)\}/g;
  for (const [key, val] of Object.entries(data)) {
    if (typeof val !== 'string' || !val) continue;
    const keyVars = [...key.matchAll(varRe)].map(m => m[1]);
    const valVars = [...val.matchAll(varRe)].map(m => m[1]);
    if (keyVars.length !== valVars.length) continue;  // 已由 C0 处理
    for (let i = 0; i < keyVars.length; i++) {
      if (keyVars[i] !== valVars[i]) {
        issues.push({
          file: jsonFilePath,
          severity: '🔴',
          name: '插值变量名被翻译',
          content: `"${key.substring(0, 40)}" 变量 {${keyVars[i]}} → {${valVars[i]}}`
        });
        break;
      }
    }
  }
  return issues;
}

/**
 * C2: 检测 JSON key 简繁漂移
 * 通过 Unicode 归一化简繁（简单策略：把常见繁体字替换为简体）对比
 * 若两个 key 归一化后相同，视为漂移
 */
const TRAD_TO_SIMP_MAP = {
  '細': '细', '網': '网', '費': '费', '贈': '赠', '漫': '漫', '遊': '游', '餐': '餐',
  '帳': '账', '戶': '户', '訂': '订', '單': '单', '統': '统', '計': '计', '頁': '页',
  '確': '确', '認': '认', '設': '设', '備': '备', '電': '电', '話': '话', '際': '际',
  '個': '个', '處': '处', '產': '产', '關': '关', '開': '开', '發': '发', '現': '现'
};

function normalizeForDrift(s) {
  return [...s].map(c => TRAD_TO_SIMP_MAP[c] || c).join('');
}

function detectKeyDrift(jsonFilePath) {
  const issues = [];
  let data;
  try {
    const content = fs.readFileSync(jsonFilePath, 'utf-8');
    data = jsonFilePath.endsWith('.js')
      ? JSON.parse(content.replace(/^module\.exports\s*=\s*/, '').replace(/\s*;?\s*$/, ''))
      : JSON.parse(content);
  } catch {
    return issues;
  }
  const keys = Object.keys(data);
  const normalized = new Map();
  for (const k of keys) {
    const n = normalizeForDrift(k);
    if (normalized.has(n) && normalized.get(n) !== k) {
      issues.push({
        file: jsonFilePath,
        severity: '🟠',
        name: 'JSON key 简繁漂移',
        content: `"${normalized.get(n)}" 与 "${k}" 归一化后相同`
      });
    } else {
      normalized.set(n, k);
    }
  }
  return issues;
}
```

更新导出：

```js
if (require.main !== module) {
  module.exports = {
    detectCurlyQuotes, detectYenCoverage, scanYenUsageInCode,
    detectVarNameTranslated, detectKeyDrift,
    validateTranslationJSON, readLangData
  };
}
```

- [ ] **Step 5：运行测试**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: PASS

- [ ] **Step 6：集成到主扫描流程**

Edit `skills/i18n-replace/i18n-validate.js`，在 Translation quality 块内的 `if (langResult)` 块中再追加：

```js
    allIssues.push(...detectVarNameTranslated(langResult.filePath));
    allIssues.push(...detectKeyDrift(langResult.filePath));
```

- [ ] **Step 7：提交**

```bash
cd F:/i18n-plugin
git add tests/fixtures/validate-phase1/translations/ tests/validate-rules.test.js skills/i18n-replace/i18n-validate.js
git commit -m "feat(validate): add C1/C2 translation quality checks

C1: detect translated interpolation variable names
C2: detect simplified/traditional key drift (haiku subagent bug)"
```

---

## Task 10：C3（重复翻译值语境提醒）、C4（空值白名单）

**Files:**
- Modify: `skills/i18n-replace/i18n-validate.js`
- Modify: `tests/validate-rules.test.js`
- Create: `tests/fixtures/validate-phase1/translations/duplicate-values.json`

**规则：**
- C3：相同 value 的不同 key 聚合提醒（如"总价/总计/合计"全译为 Total）
- C4：空 value 白名单（除 `￥`、`¥` 外，其他空值为🟠）

- [ ] **Step 1：创建 fixture**

Create `tests/fixtures/validate-phase1/translations/duplicate-values.json`:

```json
{
  "总价": "Total",
  "总计": "Total",
  "合计": "Total",
  "￥": "",
  "未翻译": "",
  "正常": "Normal"
}
```

- [ ] **Step 2：写测试**

```js
describe('C3 - 重复翻译值提醒', () => {
  const fixturePath = path.join(__dirname, 'fixtures/validate-phase1/translations');
  const { detectDuplicateValues } = require('../skills/i18n-replace/i18n-validate');

  it('groups keys with same translation value', () => {
    const issues = detectDuplicateValues(path.join(fixturePath, 'duplicate-values.json'));
    assert.ok(issues.length >= 1);
    assert.ok(issues.some(i => i.name === '重复翻译值'));
  });
});

describe('C4 - 空值白名单', () => {
  const fixturePath = path.join(__dirname, 'fixtures/validate-phase1/translations');
  const { detectEmptyValues } = require('../skills/i18n-replace/i18n-validate');

  it('allows whitelisted empty values (￥)', () => {
    const issues = detectEmptyValues(path.join(fixturePath, 'duplicate-values.json'));
    assert.ok(!issues.some(i => i.content && i.content.includes('￥')));
    assert.ok(issues.some(i => i.content && i.content.includes('未翻译')));
  });
});
```

- [ ] **Step 3：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: FAIL

- [ ] **Step 4：实现函数**

在 `detectKeyDrift` 下方：

```js
const EMPTY_VALUE_WHITELIST = new Set(['\uFFE5', '\u00A5']); // ￥ ¥

function detectDuplicateValues(jsonFilePath) {
  const issues = [];
  let data;
  try {
    const content = fs.readFileSync(jsonFilePath, 'utf-8');
    data = jsonFilePath.endsWith('.js')
      ? JSON.parse(content.replace(/^module\.exports\s*=\s*/, '').replace(/\s*;?\s*$/, ''))
      : JSON.parse(content);
  } catch {
    return issues;
  }
  const valMap = new Map();
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== 'string' || v.trim() === '') continue;
    if (!valMap.has(v)) valMap.set(v, []);
    valMap.get(v).push(k);
  }
  for (const [v, keys] of valMap.entries()) {
    if (keys.length >= 2) {
      issues.push({
        file: jsonFilePath,
        severity: '🟡',
        name: '重复翻译值',
        content: `"${v}" ← [${keys.join(', ')}]`
      });
    }
  }
  return issues;
}

function detectEmptyValues(jsonFilePath) {
  const issues = [];
  let data;
  try {
    const content = fs.readFileSync(jsonFilePath, 'utf-8');
    data = jsonFilePath.endsWith('.js')
      ? JSON.parse(content.replace(/^module\.exports\s*=\s*/, '').replace(/\s*;?\s*$/, ''))
      : JSON.parse(content);
  } catch {
    return issues;
  }
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== 'string' || v.trim() !== '') continue;
    if (EMPTY_VALUE_WHITELIST.has(k)) continue;
    issues.push({
      file: jsonFilePath,
      severity: '🟠',
      name: '未翻译空值',
      content: `"${k}" 空值未翻译`
    });
  }
  return issues;
}
```

更新导出：

```js
if (require.main !== module) {
  module.exports = {
    detectCurlyQuotes, detectYenCoverage, scanYenUsageInCode,
    detectVarNameTranslated, detectKeyDrift,
    detectDuplicateValues, detectEmptyValues,
    validateTranslationJSON, readLangData
  };
}
```

- [ ] **Step 5：运行测试**

Run: `cd F:/i18n-plugin && node --test tests/validate-rules.test.js`
Expected: PASS

- [ ] **Step 6：把 C3/C4 集成到主扫描流程**

Edit `skills/i18n-replace/i18n-validate.js`：在 Translation quality 块 `if (langResult)` 内追加：

```js
    allIssues.push(...detectDuplicateValues(langResult.filePath));
    allIssues.push(...detectEmptyValues(langResult.filePath));
```

**同时**：现有 `validateTranslationJSON` 内有旧的空值检查，会重复报告。找到约 178-181 行：

```js
  const emptyKeys = Object.entries(data).filter(([, v]) => typeof v === 'string' && v.trim() === '').map(([k]) => k);
  if (emptyKeys.length > 0) {
    issues.push({ severity: '🟠', name: `未翻译空值 (${emptyKeys.length})`, content: emptyKeys.slice(0, 10).join(', ') });
  }
```

删除这段（已由 `detectEmptyValues` 替代）。

- [ ] **Step 7：确认旧测试不回归**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js`
Expected: 全部 PASS

- [ ] **Step 8：提交**

```bash
cd F:/i18n-plugin
git add tests/fixtures/validate-phase1/translations/duplicate-values.json tests/validate-rules.test.js skills/i18n-replace/i18n-validate.js
git commit -m "feat(validate): add C3/C4 translation quality checks

C3: duplicate translation values (context awareness reminder)
C4: empty value whitelist (￥/¥ allowed, others warned)
Replace inline empty-value check with dedicated detector."
```

---

## Task 11：JSON 输出格式 + 退出码分级 + --out 参数

**Files:**
- Modify: `skills/i18n-replace/i18n-validate.js`
- Create: `tests/validate-integration.test.js`
- Create: `tests/fixtures/validate-phase1/vue-project/src/page.vue`
- Create: `tests/fixtures/validate-phase1/vue-project/src/i18n/tw.json`

- [ ] **Step 1：创建集成测试 fixture（最小 Vue 项目）**

Create `tests/fixtures/validate-phase1/vue-project/src/page.vue`:

```vue
<template>
  <div>
    <el-button>{{ $t('提交') }}</el-button>
  </div>
</template>

<script>
export default {
  data() {
    return {
      status: 'active'
    };
  },
  methods: {
    handle() {
      if (this.status === window.$t('已完成')) {
        console.log('done');
      }
      switch (this.status) {
        case window.$t('进行中'):
          break;
      }
    }
  }
};
</script>
```

Create `tests/fixtures/validate-phase1/vue-project/src/i18n/tw.json`:

```json
{
  "提交": "提交",
  "已完成": "已完成",
  "进行中": "進行中"
}
```

- [ ] **Step 2：写集成测试**

Create `tests/validate-integration.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const path = require('node:path');
const fs = require('node:fs');

const SCRIPT = 'skills/i18n-replace/i18n-validate.js';
const VUE_FIXTURE = 'tests/fixtures/validate-phase1/vue-project';

function runValidate(args) {
  try {
    const out = execSync(`node ${SCRIPT} ${args}`, { encoding: 'utf-8', cwd: process.cwd() });
    return { stdout: out, code: 0 };
  } catch (e) {
    return { stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '', code: e.status };
  }
}

describe('validate-integration', () => {
  it('exits 1 for 🔴 critical issues', () => {
    const r = runValidate(`${VUE_FIXTURE} --type vue --i18n-dir ${VUE_FIXTURE}/src/i18n`);
    assert.equal(r.code, 1, 'should exit 1 when 🔴 found');
  });

  it('outputs JSON with --format json', () => {
    const r = runValidate(`${VUE_FIXTURE} --type vue --i18n-dir ${VUE_FIXTURE}/src/i18n --format json`);
    const lines = r.stdout.split('\n').filter(l => l.trim().startsWith('{'));
    assert.ok(lines.length > 0, 'should output JSON');
    const json = JSON.parse(lines.join('\n'));
    assert.ok(Array.isArray(json.issues));
    assert.ok(json.stats);
    assert.ok(json.issues.length > 0);
    const ids = json.issues.map(i => i.id);
    assert.ok(ids.some(id => id && id.startsWith('V01')), 'should detect switch case');
    assert.ok(ids.some(id => id && id.startsWith('V02')), 'should detect equality');
  });

  it('writes JSON to file with --out', () => {
    const outFile = 'tests/fixtures/validate-phase1/vue-project/.tmp-issues.json';
    runValidate(`${VUE_FIXTURE} --type vue --i18n-dir ${VUE_FIXTURE}/src/i18n --format json --out ${outFile}`);
    assert.ok(fs.existsSync(outFile));
    const json = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    assert.ok(Array.isArray(json.issues));
    fs.unlinkSync(outFile);
  });
});
```

- [ ] **Step 3：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/validate-integration.test.js`
Expected: FAIL（--format json 不支持）

- [ ] **Step 4：实现 JSON 输出 + 退出码分级 + --out**

Edit `skills/i18n-replace/i18n-validate.js`：

**4a. 在 CLI 解析块（约 23-35 行）追加参数：**

```js
const outputFormat = getArgValue('--format', 'text');
const outFile = getArgValue('--out', null);
```

**4b. 在规则命中时保留 id 字段（修改 `scanFile` 函数约 92-105 行）：**

```js
function scanFile(filePath, patterns) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];
  lines.forEach((line, idx) => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    for (const p of patterns) {
      if (p.regex.test(line)) {
        issues.push({
          id: p.id,
          file: filePath,
          line: idx + 1,
          content: line.trim().substring(0, 120),
          severity: p.severity,
          name: p.name,
          description: p.description,
          fix: p.fix
        });
      }
    }
  });
  return issues;
}
```

**4c. 修改报告输出区（约 280-304 行），替换为：**

```js
// Report
const summary = {
  files: files.length,
  critical: grouped['🔴'].length,
  high: grouped['🟠'].length,
  warning: grouped['🟡'].length
};

function emitJSON() {
  const report = {
    projectPath: targetDir,
    projectType: type,
    stats: summary,
    issues: allIssues.map(i => ({
      id: i.id || null,
      category: i.category || 'pattern',
      severity: i.severity,
      rule: i.name,
      description: i.description || null,
      file: i.file || null,
      line: i.line || null,
      snippet: i.content || null,
      fix: i.fix || null
    }))
  };
  const jsonStr = JSON.stringify(report, null, 2);
  if (outFile) {
    fs.writeFileSync(outFile, jsonStr, 'utf-8');
    console.log(`报告已写入 ${outFile}`);
  } else {
    console.log(jsonStr);
  }
}

function emitText() {
  console.log(`\n=== i18n 验证报告 ===`);
  console.log(`📁 路径: ${targetDir}  📋 类型: ${type}  🔍 文件: ${files.length}`);
  for (const [sev, items] of Object.entries(grouped)) {
    if (items.length > 0) {
      console.log(`\n${sev} (${items.length}):`);
      items.slice(0, 20).forEach(i => {
        const loc = i.file ? `  ${i.file}${i.line ? ':' + i.line : ''}` : '  ';
        const ruleId = i.id ? `[${i.id}] ` : '';
        console.log(`${loc}  ${ruleId}${i.name} — ${i.content || ''}`);
      });
      if (items.length > 20) console.log(`  ... 及其他 ${items.length - 20} 处`);
    }
  }
  console.log(`\n=== 总结 ===`);
  console.log(`🔴 ${summary.critical}  🟠 ${summary.high}  🟡 ${summary.warning}`);
}

const grouped = { '🔴': [], '🟠': [], '🟡': [] };
for (const i of allIssues) {
  if (grouped[i.severity]) grouped[i.severity].push(i);
}

if (outputFormat === 'json') {
  emitJSON();
} else {
  emitText();
}

// 退出码分级：
// 0 全绿 / 1 有🔴 / 2 有🟠无🔴 / 3 脚本自身错误
let exitCode = 0;
if (summary.critical > 0) exitCode = 1;
else if (summary.high > 0) exitCode = 2;

if (outputFormat === 'text') {
  const codeLabel = { 0: '0 (全部通过)', 1: '1 (存在严重问题)', 2: '2 (存在高危问题)' }[exitCode];
  console.log(`退出码: ${codeLabel}`);
}
process.exit(exitCode);
```

注意：`grouped` 计算要在 `emitText/emitJSON` 之前完成。把 grouped 块移到 if/else 之前。完整顺序：
```
const grouped = {...}
for (...) { ... }
const summary = {...}
if (outputFormat === 'json') emitJSON() else emitText()
// exit code
```

**4d. 更新 --help 文本：**

在 --help 文本中增加：

```
  --format <text|json>    输出格式 (默认: text)
  --out <file>            写入文件 (默认: stdout)

退出码：
  0  全部通过
  1  存在 🔴 严重问题
  2  存在 🟠 高危问题（无🔴）
  3  脚本自身错误
```

- [ ] **Step 5：运行集成测试**

Run: `cd F:/i18n-plugin && node --test tests/validate-integration.test.js`
Expected: PASS

- [ ] **Step 6：运行所有旧测试确认不回归**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js`
Expected: 全部 PASS

- [ ] **Step 7：手动验证 CLI**

Run:
```bash
cd F:/i18n-plugin
node skills/i18n-replace/i18n-validate.js tests/fixtures/validate-phase1/vue-project --type vue --i18n-dir tests/fixtures/validate-phase1/vue-project/src/i18n --format json
```
Expected: 输出合法 JSON，含 `projectPath/stats/issues`

Run:
```bash
cd F:/i18n-plugin && node skills/i18n-replace/i18n-validate.js --help
```
Expected: 看到 `--format` 和 `--out` 说明

- [ ] **Step 8：提交**

```bash
cd F:/i18n-plugin
git add tests/validate-integration.test.js tests/fixtures/validate-phase1/vue-project/ skills/i18n-replace/i18n-validate.js
git commit -m "feat(validate): add JSON output format, --out file, exit code tiering

- --format json emits structured report with issues[], stats, metadata
- --out <file> writes to file instead of stdout
- Exit codes: 0 green / 1 critical / 2 high / 3 script error
- Scan results now carry rule id, description, fix suggestion"
```

---

## Task 12：重写 `i18n-code` agent 为 JSON 协议

**Files:**
- Modify: `agents/i18n-code.md`

**目的：** agent 不再自己 grep，改为消费 validator 产出的 issues.json；输出为结构化 verdicts。

- [ ] **Step 1：备份现有 agent（可选，git 会保留历史）**

跳过（git log 已经保留）

- [ ] **Step 2：重写 `agents/i18n-code.md`**

覆盖写入 `agents/i18n-code.md`：

```markdown
---
name: i18n-code
model: haiku
description: |
  接收 i18n-validate 产出的 issues JSON 报告，对每条命中做语义判断（真问题 / 误报 / 需上下文），输出结构化 verdicts JSON。
  不自行 grep 或扫描项目，输入由主线程通过 validator 提供。
  当用户说"审核i18n"、"判断替换问题"、"review i18n issues"时触发。
tools: Read
---

# i18n 逻辑一致性审核专员（JSON 协议版）

## 角色定义

你是一个 **i18n 审核语义判断专员**。你不再自己扫描项目，而是接收主线程传入的 `issues.json`（由 `skills/i18n-replace/i18n-validate.js --format json` 生成），对每一条 issue 做 verdict 判断，输出结构化 JSON。

## 【硬性约束】

- ❌ 不扫描项目（脚本已做）
- ❌ 不修改任何文件
- ❌ 不跳过任何 issue（verdict 数量必须等于 issues 数量）
- ❌ 不使用 Grep/Glob（工具仅保留 Read）
- ✅ 可选 Read 具体文件以补充上下文
- ✅ 必须对每条 issue 给出 verdict + reason（≥20 字）

---

## 输入协议

主线程会把 `issues.json` 的内容粘贴给你（或告知文件路径让你 Read）。结构：

\`\`\`json
{
  "projectPath": "...",
  "projectType": "vue|wx|html",
  "stats": { "files": N, "critical": N, "high": N, "warning": N },
  "issues": [
    {
      "id": "V01" | "A1" | "C1" | ...,
      "category": "pattern" | "translation" | "cross-file" | "init",
      "severity": "🔴" | "🟠" | "🟡",
      "rule": "switch case 中 $t",
      "description": "case 值来自后端...",
      "file": "src/xxx.vue",
      "line": 42,
      "snippet": "case window.$t('进行中'):",
      "fix": "case 值改回原始中文"
    }
  ]
}
\`\`\`

## 判断流程

对于每条 issue：

1. 看 `id` / `rule` / `snippet` 判断是不是真问题
2. 若 snippet 上下文不足，调用 Read 工具读 `file`（只读必要范围，不要整文件读）
3. 给出 verdict：
   - `confirmed` — 真问题，必须修
   - `falsePositive` — 误报，说明原因（比如 rule 本意针对后端数据，但这里是纯展示）
   - `needsContext` — 信息不足，必须指明需要看哪个文件/哪一段，让主线程补充后重派
4. 若 verdict 是 confirmed，给出具体修复建议（可以基于 issue.fix 进一步细化）

## 输出协议

**必须输出合法 JSON**（放在一个 markdown code block 里）：

\`\`\`json
{
  "verdicts": [
    {
      "id": "V01",
      "verdict": "confirmed",
      "reason": "switch 中 status 变量来自后端 /api/order 返回，翻译后 case 字面量变繁体，永远进不了分支",
      "fixSuggestion": "case 值改回 '进行中'（原始中文字面量）"
    },
    {
      "id": "A9",
      "verdict": "falsePositive",
      "reason": "tag_name 赋值处在 computed 内，值来自 props 的临时变量，未发往后端也不入 storage，只用于当前组件渲染"
    },
    {
      "id": "V05",
      "verdict": "needsContext",
      "reason": "需要确认该 $router.push 跳转的 name 是否是声明在 router.js 的路由名称，请 Read src/router.js 第 40-60 行"
    }
  ],
  "summary": {
    "confirmed": 12,
    "falsePositive": 3,
    "needsContext": 2
  }
}
\`\`\`

## 防偷懒硬约束（主线程会校验）

1. **verdicts.length 必须等于 issues.length** — 一条都不能少
2. **每个 reason 至少 20 字** — 简单的"这是问题"不通过
3. **falsePositive 必须说清楚为什么不是问题** — 不能写"误报"了事
4. **needsContext 必须指明需要 Read 哪个文件/哪一段** — 不能打太极

如果不满足以上约束，主线程会报"偷懒警告"并退回重派。

## 判断参考手册

### 常见 confirmed 场景

| id / rule | 典型判断 |
|-----------|---------|
| V01 switch case 中 $t | status/type 来自后端 → confirmed |
| V02 等值比较中 $t | 与后端数据比较 → confirmed |
| V05 路由 name | router.js 定义处或 push 处 → confirmed |
| V07 habit/localStorage | 存储键 → confirmed |
| V08 EventBus | 事件名跨文件配对 → confirmed |
| A1 对象 key 用 $t | JS 语法错误 → confirmed |
| A2 嵌套 $t | 双重翻译 → confirmed |
| A4 body 字段 | 支付协议 → confirmed |
| A5 $mode | 业务逻辑值 → confirmed |
| A7 res.msg.indexOf | 后端消息 → confirmed |
| A12 HTML_COMMENT 残留 | 替换脚本 bug → confirmed |

### 常见 falsePositive 场景

1. **JS 中保持中文原值 + 模板中 $t(变量) 不是双重翻译**
   - `data: { label: '删除' }` + `{{ $t(item.label) }}` — 这是标准双用途翻译模式
   - 不要因为 A9 rule 命中就判 confirmed，要看变量最终是否发往后端/进 storage
   - 若变量只在模板展示 → falsePositive

2. **原始代码就是中文字符串（未被 $t 包裹）**
   - 如 `uid: '挂机锁倒计时结账'` 是原始设计，不是 i18n 替换引入的
   - 判断标准：**被 $t 包裹才是 i18n 问题**；没被包裹的中文是原有代码

3. **console.log 中的 $t** — 展示用途，无害

### 常见 needsContext 场景

- V07 habit 键：若 snippet 只有一侧（set 或 get），需要 Read 另一文件确认配对
- V08 EventBus：需要 Read on/emit 两侧对应文件
- V05 路由 name：需要 Read router.js 确认是否是真实路由名

## 输出规范

- JSON 必须合法（main thread 会 JSON.parse）
- 包裹在 \`\`\`json ... \`\`\` 代码块中
- summary 字段必填，数值为对应 verdict 类型的计数
- 如果 issues.length === 0，输出 `{"verdicts": [], "summary": {"confirmed": 0, "falsePositive": 0, "needsContext": 0}}`
```

- [ ] **Step 3：手动检查 agent 文件没有 markdown 格式错误**

Run: `cd F:/i18n-plugin && head -30 agents/i18n-code.md`
Expected: 看到完整 frontmatter + 角色定义

- [ ] **Step 4：提交**

```bash
cd F:/i18n-plugin
git add agents/i18n-code.md
git commit -m "refactor(agent): rewrite i18n-code agent for JSON protocol

- Input: issues.json produced by i18n-validate --format json
- Output: structured verdicts.json (confirmed / falsePositive / needsContext)
- Tools: reduce from Read+Glob+Grep to Read only
- Enforce: verdicts.length == issues.length, reason >= 20 chars
- Provide: decision reference table and common false-positive cases"
```

---

## Task 13：更新 `i18n-workflow` skill 插入 validate step

**Files:**
- Modify: `skills/i18n-workflow/SKILL.md`

- [ ] **Step 1：读取当前 skill 文档定位要改的位置**

Run: `cd F:/i18n-plugin && wc -l skills/i18n-workflow/SKILL.md`
记录总行数。

- [ ] **Step 2：修改工作流程图 + 执行步骤**

Edit `skills/i18n-workflow/SKILL.md`：

在工作流图（`digraph i18n_workflow`）中，找到：

```
"verify" [shape=box, label="3.5. 高危验证扫描\nGrep 扫描 + 主线程修复"];
```

替换为：

```
"validate" [shape=box, label="3.5. i18n-validate 脚本\n生成 issues.json（含跨文件）"];
```

并且把所有 `"verify"` 节点名改为 `"validate"`（node 定义和边连接处都要改）。

在 `"review"` 节点的标签里补充：

```
"review" [shape=box, label="5. 派发 i18n-code 子代理\n传入 issues.json\n返回 verdicts.json"];
```

- [ ] **Step 3：在 AI 执行规则章节补充步骤 3.5 和 5 的细节**

找到（或新增）AI 执行规则块，在步骤 3.5 位置写入：

```markdown
### 步骤 3.5：运行 i18n-validate 脚本

主线程执行：

\`\`\`bash
node skills/i18n-replace/i18n-validate.js <目标路径> \
  --type <vue|wx|html> \
  --i18n-dir <i18n目录> \
  --lang <目标语言> \
  --format json \
  --out <项目>/.i18n-issues.json
\`\`\`

退出码：
- 0 全绿 → 跳过 code 审核步骤
- 1 有 🔴 严重 → 继续步骤 5（派发 i18n-code agent）
- 2 有 🟠 高危 → 继续步骤 5
- 3 脚本错误 → 报告用户

`.i18n-issues.json` 是步骤 5 的输入。
```

步骤 5 位置：

```markdown
### 步骤 5：派发 i18n-code agent 做语义判断

调用 Agent 工具，必须指定 `model: "haiku"`，prompt 内容：

"接收 issues.json，路径为 `<项目>/.i18n-issues.json`。请 Read 这个文件，按 agent 判断手册对每一条 issue 给出 verdict。严格按 JSON 协议输出。"

主线程收到 verdicts 后：
1. 校验 verdicts.length === issues.length（不等则退回重派）
2. 对每个 confirmed verdict 执行修复
3. 重跑 i18n-validate 确认 🔴/🟠 清零
4. 如果循环 3 轮仍有 🔴/🟠，输出疑难清单交人工
```

- [ ] **Step 4：运行现有测试确认没影响**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js`
Expected: 全部 PASS（workflow 改的是文档，不影响脚本测试）

- [ ] **Step 5：提交**

```bash
cd F:/i18n-plugin
git add skills/i18n-workflow/SKILL.md
git commit -m "docs(workflow): insert i18n-validate step with JSON output

Update workflow graph and AI execution rules:
- Step 3.5 runs validator, writes .i18n-issues.json
- Step 5 passes issues.json to i18n-code agent for verdicts
- Exit code 0 skips audit, 1/2 triggers audit
- Main thread verifies verdicts count and enforces loop cap of 3"
```

---

## Task 14：更新 README + bump 版本

**Files:**
- Modify: `README.md`
- Modify: `package.json`（如存在 root 级 version，否则跳过）

- [ ] **Step 1：查看 README 现状**

Run: `cd F:/i18n-plugin && head -50 README.md`

- [ ] **Step 2：在 README 中增加 validator 新能力说明**

Edit `F:/i18n-plugin/README.md`：

找到 "高危扫描" 或 "审核" 相关段落（若无则在 "快速开始" 之后新增一节）：

```markdown
## i18n-validate 审核脚本（v2.6.0+）

**新能力：**

- 28+ 条高危规则（A1-A14 通用 / V01-V10 Vue / W01-W08 wx / H01-H05 HTML）
- 翻译质量检查：C1 变量名保护、C2 简繁漂移、C3 重复值、C4 空值白名单、A13 弯引号、A14 ￥/¥ 双字符
- 结构化 JSON 输出：`--format json` + `--out <file>`
- 退出码分级：0 全绿 / 1 有🔴 / 2 有🟠 / 3 脚本错误
- 与 `i18n-code` agent 解耦：脚本扫描 + agent 语义判断

**用法：**

\`\`\`bash
# 文本报告
node skills/i18n-replace/i18n-validate.js src/ --type vue --i18n-dir src/i18n --lang tw

# JSON 报告（用于 agent 审核）
node skills/i18n-replace/i18n-validate.js src/ --type vue --i18n-dir src/i18n --lang tw \
  --format json --out .i18n-issues.json
\`\`\`

**规则 ID 查询：** 审核报告会带规则 id（如 `[V01]`、`[A4]`），可在 `skills/i18n-replace/validate-rules.js` 或 spec 文档中查到规则详情。
```

- [ ] **Step 3：bump 版本号**

Run: `cd F:/i18n-plugin && grep -n version package.json`

如果 root 有 package.json 带 version 字段：
Edit `package.json`：将 `"version": "2.5.0"` 改为 `"version": "2.6.0-phase1"`

如果没有 root version 字段，则检查 `.claude-plugin/plugin.json` 或类似配置，同步修改。

- [ ] **Step 4：提交**

```bash
cd F:/i18n-plugin
git add README.md package.json
git commit -m "docs: README + bump to v2.6.0-phase1

Document new validator capabilities:
- 28+ high-risk rules with IDs
- Translation quality checks (C class)
- JSON output and exit code tiering
- Decoupled agent via JSON protocol"
```

---

## Task 15：端到端烟测

**目的：** 对一个真实的小项目 fixture（或用 Task 11 创建的 vue-project）完整走一遍新流程，确认 validator → JSON → agent 链路通畅。

**Files:**
- 无新文件，只是跑验证命令

- [ ] **Step 1：跑 validator 生成 JSON**

Run:
```bash
cd F:/i18n-plugin
node skills/i18n-replace/i18n-validate.js tests/fixtures/validate-phase1/vue-project \
  --type vue \
  --i18n-dir tests/fixtures/validate-phase1/vue-project/src/i18n \
  --lang tw \
  --format json \
  --out /tmp/i18n-issues-smoketest.json
echo "Exit code: $?"
ls -la /tmp/i18n-issues-smoketest.json
```

Expected:
- 退出码 = 1（有 🔴）
- 文件存在且是合法 JSON

- [ ] **Step 2：手工读 JSON 内容验证结构**

Run: `cd F:/i18n-plugin && node -e "const d = require('/tmp/i18n-issues-smoketest.json'); console.log(JSON.stringify({stats: d.stats, ids: d.issues.map(i => i.id), count: d.issues.length}, null, 2))"`

Expected: 输出含 `stats`、`issues[]`，每条带 `id`/`severity`/`rule`

- [ ] **Step 3：跑全部测试最终确认**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js`

Expected: 全部 PASS

- [ ] **Step 4：清理临时文件**

Run: `rm /tmp/i18n-issues-smoketest.json`

- [ ] **Step 5：提交烟测不需要（无文件变更）**

跳过（烟测无代码变更）

---

## 自审清单（写完本计划后自己过一遍）

- [x] **Spec 覆盖**：
  - 3.1 A 类 14 条规则 → Task 2-8 全部覆盖
  - 3.3 C 类翻译质量 → Task 9-10 覆盖 C1-C4；C5 重复值在 C3；C6 ￥完整性在 A14
  - 5.2 CLI --format / --out / 退出码 → Task 11
  - 4 agent JSON 协议 → Task 12
  - 5.3 workflow skill 更新 → Task 13
  - README → Task 14
  - **暂不覆盖**（第二期）：3.4 D 类跨文件追踪、3.2 B 类多行扫描、3.5 E 类初始化检查、主线程修复循环自动化
- [x] **Placeholder 扫描**：无 TBD/TODO
- [x] **类型一致性**：所有 rule id 使用 `A1-A14`（新增）、`V01-V10`（Vue）、`H01-H05`（HTML）、`W01-W08`（wx）
- [x] **文件路径**：全部使用 `F:/i18n-plugin/...` 绝对路径或 CWD 相对路径

---

## 提示

1. 每个 Task 做完就 commit，不要把多个 Task 合并成一个大 commit
2. 每次 commit 前跑一次 `node --test tests/*.test.js` 确认无回归
3. 遇到规则 regex 误报，优先调整 regex 而不是降低严重度
4. 遇到真的需要语义判断的坑（例如"这个字段是不是双用途"），不要强塞进脚本规则，留给 agent
5. 如果某条规则测试写起来特别别扭，说明 regex 可能需要重新设计

---

**计划完成，等待你选择执行方式。**
