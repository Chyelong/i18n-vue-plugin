# 替换脚本 Bug 修复 + 源头跳过补齐设计（v2.6.1）

**日期**：2026-04-11
**版本目标**：v2.6.1（从 v2.6.0-phase1 升级）
**作者**：brainstorming session
**前置依赖**：v2.6.0-phase1 审核系统升级（`docs/superpowers/specs/2026-04-11-audit-system-upgrade-design.md`）

---

## 1. 问题陈述

### 1.1 背景

v2.6.0-phase1 加强了审核侧（validator + agent），但替换脚本本身（`vue-i18n-replace.js` / `wx-i18n-replace.js` / `html-i18n-replace.js`）没有优化。结果：

- **事后审核能发现问题**（100% 覆盖 A1-A14、C1-C4）
- **但事前预防做得不够**，脚本仍然会重复产生相同的坑，每次都要跑 validator 再修复

### 1.2 Spike 验证结果

用 9 个 fixture 在 3 个真实脚本上做了快速验证（`tests/fixtures/spike/`），memory 记录的 7 类 bug 经过实锤分类：

| # | Memory 记录的 Bug | 实际状态 | 说明 |
|---|---|---|---|
| 1 | wx 双逗号（`obtain,, $t`） | ✅ 不存在 | memory 里的是 agent 手工修复引入的，不是脚本 bug。validator A10 已覆盖 |
| 2 | wx 多余括号（`$t()))`） | ✅ 不存在 | 同上。validator A11 已覆盖 |
| 3 | HTML 注释吞进 `$t()` | 🔴 **真 bug**（vue + html） | 脚本需要修 |
| 4 | 模板字符串 `${var}` 拆碎 | ✅ 已修好 | `processTemplateString` 已正确处理 |
| 5 | `$t()` 字符串跨行 | 🔴 **真 bug**（vue） | 脚本需要修 |
| 6 | 弯引号转义失败 | 🟡 **真 bug**（vue） | Vue 2 buble `\"` 编译报错 |
| 7 | 裸 `$t()` 缺 `window.` | ✅ 已修好 | Vue/HTML script 区强制 `window.$t` |

**结论**：Phase 1.6 从"修 7 个 bug"缩减到"修 3 个真实 bug + 补齐源头跳过"。

### 1.3 Phase 1.5 仍然有效

审核脚本缺的源头跳过规则还存在：

- `body`/`$mode`/`checkOperate` name 参数协议字段 — 3 个脚本都没跳过
- `tag_name`/`tag_box_name`/`recharge_tag_name` 双用途字段 — 3 个都没跳过
- 对象 key — 仅 wx 做了，vue/html 缺
- EventBus 事件名 — 仅 vue 做了，wx/html 缺
- 路由 name — 仅 vue 做了，wx/html 缺

### 1.4 设计目标

1. **从源头消除 3 个真实脚本 bug**（事前预防代替事后审核）
2. **补齐 7 条缺失的源头跳过规则**，让三个脚本的跳过能力对齐
3. **所有修复走 TDD**，把 spike fixture 转为永久回归测试
4. **合并发布 v2.6.1**（去掉 phase1 预发布后缀）

---

## 2. 总体架构

合并线路 A（修 bug）+ 线路 B（补跳过）为单一版本 v2.6.1：

```
v2.6.1 范围
├─ 🔴 线路 A：修脚本 3 个真实 bug（源头修正）
│   ├─ A1 HTML 注释吞噬 (vue + html)
│   ├─ A2 跨行文本未合并 (vue)
│   └─ A3 弯引号嵌套转义 (vue)
│
└─ 🟨 线路 B：补齐源头跳过规则（事前预防）
    ├─ B1 body 字段协议 (vue + wx + html)
    ├─ B2 $mode 业务标识 (vue + wx + html)
    ├─ B3 checkOperate name 参数 (vue + wx + html)
    ├─ B4 双用途字段 tag_name 等 (vue + wx + html)
    ├─ B5 对象 key (vue + html) [wx 已有]
    ├─ B6 EventBus 事件名 (wx + html) [vue 已有]
    └─ B7 路由 name (wx + html) [vue 已有]
```

**核心原则**：
- 所有修复走 TDD：先写失败测试（基于 spike fixture）→ 实现 → 验证通过 → 提交
- Fixture 从 `tests/fixtures/spike/` 迁移到 `tests/fixtures/replace-bugs/` 变成永久回归测试
- 线路 A 优先（因为 bug 存在实际影响项目），线路 B 其次（预防未来踩坑）
- 保持 `vue-i18n-replace.js` / `wx-i18n-replace.js` / `html-i18n-replace.js` 的文件结构不变

---

## 3. 线路 A 修复策略

### 3.1 A1：HTML 注释吞噬

#### Vue 脚本 `vue-i18n-replace.js`

**当前错误流程**：

```
1. processTemplate 把 <!-- 注释 --> 替换成 __HTML_COMMENT_0__（line 142-147）
2. 文本抽取时直接用 "__HTML_COMMENT_0__ 感谢您的支持"
3. recordText("__HTML_COMMENT_0__ 感谢您的支持") ❌ 写进 JSON key
4. 生成 $t('__HTML_COMMENT_0__ 感谢您的支持') ❌
5. 全局还原 __HTML_COMMENT_0__ → <!-- 注释 --> ❌ 在 $t('') 内部也还原了
   → 最终输出 $t('<!-- 注释 --> 感谢您的支持')
```

**Spike 验证**：

输入：
```vue
<div>
  <!-- 这是注释 -->
  感谢您的支持
</div>
```

当前错误输出：
```vue
<div>
  {{ $t('<!-- 这是注释 -->
感谢您的支持') }}
</div>
```

**修复策略**：

新增一个 `stripCommentPlaceholders(text)` 辅助函数：

```js
// 匹配 __HTML_COMMENT_\d+__ 占位符
const HTML_COMMENT_PLACEHOLDER = /__HTML_COMMENT_\d+__/g;

/**
 * 从文本中切出 HTML 注释占位符
 * 返回 { segments: [...], hasComment: boolean }
 * 其中 segments 是 [{ type: 'text'|'comment', value }] 交替序列
 */
stripCommentPlaceholders(text) {
  const segments = [];
  let lastIdx = 0;
  let m;
  HTML_COMMENT_PLACEHOLDER.lastIndex = 0;
  while ((m = HTML_COMMENT_PLACEHOLDER.exec(text)) !== null) {
    if (m.index > lastIdx) {
      segments.push({ type: 'text', value: text.slice(lastIdx, m.index) });
    }
    segments.push({ type: 'comment', value: m[0] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIdx) });
  }
  const hasComment = segments.some(s => s.type === 'comment');
  return { segments, hasComment };
}
```

**调用点修改**：
在 `processTemplate` 的标签内文本处理（约 line 247-288）里，文本进入 `recordText` 和 `$t('')` 构造之前，先调用 `stripCommentPlaceholders`：

- 如果 `hasComment === false`：保持原逻辑
- 如果 `hasComment === true`：对每个 `type === 'text'` 且含中文的 segment 单独构造 `$t('...')`；`type === 'comment'` 的 segment 直接保留原占位符（最终还原成注释）
- 结果按原顺序拼接

**第 290-291 行的全局还原保留**（现在只会还原 "本来就在 $t 外部" 的占位符）。

#### HTML 脚本 `html-i18n-replace.js`

HTML 脚本直接扫描元素内文本并加 `data-i18n` 属性。同样问题：注释被吞进 `data-i18n` 属性值。

**修复**：在 `processHtml` 扫描元素内文本时，先 grep 掉 `<!-- ... -->` 子串（而不是用占位符机制，因为 HTML 输出保持原样，不需要还原）：

```js
// 剥离注释，只对剩余文本处理 i18n
const stripped = text.replace(/<!--[\s\S]*?-->/g, '').trim();
if (!stripped || !HAS_CHINESE.test(stripped)) return match;
// 用 stripped 作为 data-i18n 值
```

如果 `stripped` 为空或无中文，不加 `data-i18n` 属性。

### 3.2 A2：跨行文本未合并（Vue）

**根因**：`vue-i18n-replace.js` 第 253 行：

```js
let trimmed = text.trim();
```

只 trim，没有用 `.replace(/\s+/g, ' ')` 合并内部的换行。而插值内分支（第 184 行）有 `normalizedText = text.replace(/\s+/g, ' ').trim()`。两套处理不一致。

**修复**：

```js
// 修复前
let trimmed = text.trim();

// 修复后
let trimmed = text.replace(/\s+/g, ' ').trim();
```

同时检查 `processMixedText` 里的纯文本分支（约 line 330）：

```js
// 修复前
const trimmedPart = part.value.trim();

// 修复后
const trimmedPart = part.value.replace(/\s+/g, ' ').trim();
```

### 3.3 A3：弯引号 + 双引号嵌套转义（Vue）

**根因**：`escapeQuote`（第 350-354 行）用 `\"` 转义双引号。Vue 2 buble 编译器不支持 `\"`。

**Spike 验证**：

输入：
```vue
<script>
  tip: '请输入"昵称"'
</script>
```

当前错误输出：
```vue
<script>
  tip: window.$t('请输入\"昵称\"')
</script>
```

Vue 2 buble 会报 `Unexpected character '"'`。

**修复策略（方案 1：弯引号替换）**：

新增 `smartQuoteAndWrap(text, prefix)` 辅助函数：

```js
/**
 * 根据文本内容智能选择包裹引号，避免 Vue 2 buble \" 报错。
 * 策略：如果文本同时含单引号和双引号，把双引号替换为中文弯引号
 * (U+201C/U+201D)，然后用单引号包裹。
 *
 * @param {string} text  原始文本（已 trim/normalize）
 * @param {string} prefix  前缀如 "window." 或 ""
 * @returns {string}  完整的 $t('...') 或 $t("...") 表达式
 */
smartQuoteAndWrap(text, prefix = '') {
  const hasSingle = text.includes("'");
  const hasDouble = text.includes('"');

  if (hasSingle && hasDouble) {
    // 双引号转中文弯引号（符合中文排版习惯）
    const converted = this.convertAsciiDoubleQuotes(text);
    return `${prefix}$t('${converted.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')`;
  }

  if (hasDouble && !hasSingle) {
    // 只有双引号：用单引号包裹，双引号不需转义
    return `${prefix}$t('${text.replace(/\\/g, '\\\\')}')`;
  }

  // 默认（只有单引号 / 什么都没有）：用单引号包裹并转义单引号
  return `${prefix}$t('${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')`;
}

/**
 * 把 ASCII 双引号 (") 转换为中文弯引号 ("/")。
 * 简单策略：奇数次出现替换为左弯引号，偶数次替换为右弯引号。
 */
convertAsciiDoubleQuotes(text) {
  let open = true;
  return text.replace(/"/g, () => {
    const ch = open ? '\u201C' : '\u201D';
    open = !open;
    return ch;
  });
}
```

**调用点修改**：
在 `vue-i18n-replace.js` 里所有构造 `$t('...')` / `window.$t('...')` 的地方，改用 `smartQuoteAndWrap`。主要位置：
- 第 187 行 `$t('${normalizedText}')`（插值内）
- 第 220 行 `$t('${escapeQuote(literalText)}')`（动态属性）
- 第 243 行 `:${attr}="$t('${escapeQuote(value)}')"`（静态属性）
- 第 287 行 `{{ $t('${escapeQuote(trimmed)}') }}`（标签内文本）
- 第 340 行 `{{ $t('${escapeQuote(trimmedPart)}') }}`（混合文本）
- 第 485-486 行 `window.$t('${escapeQuote(text)}')`（script 区）

全部改为：`smartQuoteAndWrap(text, prefix)` 产出完整表达式。

---

## 4. 线路 B 源头跳过补齐

### 4.1 共享模式提取到 `shared-patterns.js`

**当前** `shared-patterns.js` 已有：`SWITCH_CASE_REGEX`、`BRACKET_ACCESS_REGEX`、`INDEX_MATCH_REGEX`（共 28 行）。

**新增 7 条**（全部作为 `beforeMatch` 模式，除 `OBJECT_KEY_AFTER_REGEX` 是 `afterMatch`）：

```js
// body: 协议字段
const BODY_FIELD_REGEX = /\bbody\s*:\s*$/;

// $mode: 业务标识
const MODE_FIELD_REGEX = /\$mode\s*:\s*$/;

// checkOperate({ name: ... })
const CHECK_OPERATE_NAME_REGEX = /checkOperate\s*\([^)]*\bname\s*:\s*$/;

// 双用途字段 tag_name/tag_box_name/recharge_tag_name
const DUAL_USE_FIELD_REGEX = /\b(?:tag_name|tag_box_name|recharge_tag_name)\s*=\s*$/;

// EventBus 事件名
const EVENTBUS_REGEX = /(?:EventBus|eventBus|\$bus|\$event)\s*\.\s*\$?(?:on|emit|off|once)\s*\(\s*$/;

// 路由 name / showRouter
const ROUTER_NAME_REGEX = /(?:\$router\s*\.\s*(?:push|replace)\s*\(\s*\{[^}]*name\s*:\s*|showRouter\s*\(\s*)$/;

// 对象 key 检测（after 方向）—— 检测字符串之后是否紧跟 ":"（非 "::"）
const OBJECT_KEY_AFTER_REGEX = /^\s*:(?!:)/;
```

**`vue-i18n-replace.js` 里现有的 `STORAGE_KEY_REGEX`、`ROUTER_NAME_REGEX`、`EVENTBUS_REGEX`** 搬到共享模块（去掉重复定义）。

### 4.2 三个脚本的跳过调用点补齐

在每个脚本的 `processScript`/`processWxml` 里的"高危场景跳过"区块（`SWITCH_CASE_REGEX` 之后的位置），追加缺失的判断。

**模式**：

```js
if (BODY_FIELD_REGEX.test(beforeMatch)) {
  this.skippedLogic.push({
    file: this.currentFile,
    text,
    reason: 'body 字段（支付协议）',
    line: line.trim()
  });
  return match;
}
```

**每个脚本需要补的规则**：

| 脚本 | B1 | B2 | B3 | B4 | B5 | B6 | B7 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| vue | 补 | 补 | 补 | 补 | 补 | ✅已有 | ✅已有 |
| wx | 补 | 补 | 补 | 补 | ✅已有 | 补 | 补 |
| html | 补 | 补 | 补 | 补 | 补 | 补 | 补 |

**B5（对象 key）特殊处理**：用 `afterMatch`：

```js
const matchIndex = line.indexOf(match);
const afterMatch = line.substring(matchIndex + match.length);
if (OBJECT_KEY_AFTER_REGEX.test(afterMatch)) {
  this.skippedLogic.push({ file, text, reason: '对象 key', line });
  return match;
}
```

---

## 5. 测试策略

### 5.1 Fixture 迁移

从 spike 临时位置迁移到正式位置：

```
tests/fixtures/spike/           →  tests/fixtures/replace-bugs/
├─ vue/bug3-html-comment.vue    →  vue/A1-html-comment.vue
├─ vue/bug4-template-string.vue →  vue/positive-template-string.vue  (回归锁定：已修好的能力)
├─ vue/bug5-multiline-text.vue  →  vue/A2-multiline-text.vue
├─ vue/bug6-curly-quotes.vue    →  vue/A3-curly-quotes.vue
├─ vue/bug7-bare-t.vue          →  vue/positive-bare-t.vue
├─ wx/bug1-destructure.js       →  wx/positive-destructure.js
├─ wx/bug2-extra-paren.js       →  wx/positive-extra-paren.js
├─ wx/bug4-template-string.js   →  wx/positive-template-string.js
├─ html/bug3-html-comment.html  →  html/A1-html-comment.html
└─ html/bug7-bare-t.js          →  html/positive-bare-t.js
```

还需要新建**线路 B 的 fixture**（每条规则一个极小片段）：

```
tests/fixtures/replace-bugs/
├─ vue/B1-body-field.js         (含 body: '中文'，应保留)
├─ vue/B2-dollar-mode.js        (含 $mode: '中文'，应保留)
├─ vue/B3-check-operate.js
├─ vue/B4-dual-use-field.js
├─ vue/B5-object-key.js
├─ wx/B1-body-field.js
├─ wx/B2-dollar-mode.js
├─ ... (以此类推)
└─ html/B1-...
```

### 5.2 新测试文件

**`tests/replace-bugs.test.js`** — 每个 bug 一个 describe block：

```js
describe('A1 vue: HTML comment should not be wrapped in $t()', () => {
  it('comment outside $t, chinese wrapped', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    const input = fs.readFileSync('tests/fixtures/replace-bugs/vue/A1-html-comment.vue', 'utf-8');
    const output = replacer.processVueFile(input);

    assert.doesNotMatch(output, /\$t\(['"][^'"]*<!--/,
      'comment must not appear inside $t()');
    assert.match(output, /<!-- 这是注释 -->/,
      'comment should be preserved as-is');
    assert.match(output, /\$t\(['"]感谢您的支持['"]\)/,
      'chinese text should be wrapped');
  });
});
```

**断言原则**：
- **反例断言**：bug 特征不应出现（`doesNotMatch` 注释在 `$t()` 内 / 换行在 `$t('')` 内 / `\"` 出现）
- **正例断言**：正确结果应该出现（`$t('纯中文')` 结构 / 注释保留在 `$t` 外 / 单引号包裹）
- **回归锁定**：已修好的能力也要写 positive 测试，防止倒退（例如 `positive-bare-t.vue` 断言 `window.$t` 被正确产生）

### 5.3 线路 B 测试

每条规则的 fixture 断言两条：

```js
describe('B1 vue: body field should be skipped', () => {
  it('body: $t() should not be produced', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    const input = fs.readFileSync('tests/fixtures/replace-bugs/vue/B1-body-field.js', 'utf-8');
    const output = replacer.processScript(input);

    // body 值应保持原样
    assert.match(output, /body:\s*['"]包时套餐['"]/,
      'body value must remain original');
    // 不应产生 window.$t('body 中的值')
    assert.doesNotMatch(output, /body:\s*window\.\$t/,
      'body field should not be wrapped');
    // skippedLogic 应有对应记录
    assert.ok(replacer.skippedLogic.some(s => /body 字段/.test(s.reason)),
      'should record skipped reason');
  });
});
```

---

## 6. 错误处理

| 场景 | 处理策略 |
|---|---|
| fixture 文件不存在 | 测试 fail，报清晰 error |
| 替换脚本崩溃 | 测试 fail，显示 stack trace |
| `stripCommentPlaceholders` 遇到嵌套占位符 | 占位符不可能嵌套（HTML 注释本身不可嵌套），不处理边界 |
| `smartQuoteAndWrap` 遇到已转义的反斜杠 | `escapeQuote` 首先处理反斜杠转义，顺序必须 `\\` → `'` → `"` |
| 线路 B 的 `afterMatch` 检测到 `::` (TypeScript 类型注解) | `OBJECT_KEY_AFTER_REGEX` 用 `(?!:)` 排除 |

---

## 7. 实施分期

**一次 PR 内的 12 个 TDD Task**：

```
线路 A（修真 bug，先做）
├─ Task 1  迁移 spike fixture → tests/fixtures/replace-bugs/ + 建测试文件框架
├─ Task 2  Vue A1: stripCommentPlaceholders + 调用点修改
├─ Task 3  HTML A1: processHtml 中剥离注释
├─ Task 4  Vue A2: 跨行文本合并（2 行修改）
└─ Task 5  Vue A3: smartQuoteAndWrap + 全部调用点替换

线路 B（补齐源头跳过）
├─ Task 6  shared-patterns.js: 追加 B1-B7 模式 + 从 vue-i18n-replace.js 迁移已有项
├─ Task 7  Vue 脚本: 接入 B1-B5
├─ Task 8  wx 脚本: 接入 B1-B4, B6, B7
├─ Task 9  html 脚本: 接入 B1-B7
└─ Task 10 验证 skippedLogic 输出测试全部通过

收尾
├─ Task 11 bump 版本到 v2.6.1（去掉 phase1 后缀），更新 README
└─ Task 12 烟测：对 .spike-tmp 等价输入再跑一次，对比 before/after 确认所有 bug 消失
```

---

## 8. 非目标（明确 YAGNI）

- **不修 wx 双逗号/多余括号**：这是 agent 手工修复引入的问题，已由 validator A10/A11 覆盖
- **不改模板字符串处理逻辑**：`processTemplateString` 已正确处理简单场景
- **不补裸 `$t` 缺 `window.` 前缀**：Vue/HTML script 区已正确产生 `window.$t`
- **不引入 AST 解析**：所有修复用 regex + 字符串处理，不值得引入 babel
- **不做 Phase 2 的跨文件追踪**：那是 v2.7.0 的事
- **不做 Phase 3 的模块级时序检查**：同上

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| `stripCommentPlaceholders` 逻辑复杂引入新 bug | 修 bug 反而破坏正常路径 | fixture 覆盖正反两面 + 跑旧测试全绿 |
| `smartQuoteAndWrap` 改变原有单引号行为 | 修改多处调用点可能漏 | 用 grep 统一替换 + 运行旧测试保证不回归 |
| 补跳过规则过严导致漏翻 | 用户反馈"本该翻译的没翻译" | 每条规则在 `skippedLogic` 记录 reason，用户可从脚本输出看到 |
| `shared-patterns.js` 重构打破现有引用 | 现有测试失败 | 保持向后兼容（只加不删），`vue-i18n-replace.js` 里的重复定义可删也可保留 |
| 弯引号替换改变字符串字面值 | tw.json 里 key 从 `"` 变成 `"` | memory 已验证 TM_h5 项目用过这个策略，中文排版反而更标准 |

---

## 10. 成功标准

1. **spike 9 个 fixture 全部变成回归测试**，新版本跑 `node --test` 全绿
2. **3 个真 bug 消失**：再次对 spike 输入跑脚本，输出里不再出现注释吞噬、跨行字符串、`\"` 转义
3. **7 条跳过规则生效**：对应 fixture 的字符串保留原样，`skippedLogic` 记录对应 reason
4. **三个脚本的跳过能力对齐**：三个脚本的高危跳过规则表完全一致（除类型专有项）
5. **validator 对同一批输入的命中数明显下降**：线路 B 补齐后，对历史 fixture 重跑 validator，A 类规则命中应该大幅减少

---

## 附录 A：Bug → Fixture → Test 映射表

| Bug ID | Fixture | 测试用例 | 断言数 |
|---|---|---|---|
| A1-vue | `vue/A1-html-comment.vue` | `comment outside $t, chinese wrapped` | 3 |
| A1-html | `html/A1-html-comment.html` | `comment stripped from data-i18n` | 3 |
| A2-vue | `vue/A2-multiline-text.vue` | `multiline collapsed to single line` | 2 |
| A3-vue | `vue/A3-curly-quotes.vue` | `curly quotes replace \"` | 3 |
| B1-vue | `vue/B1-body-field.js` | `body field preserved` | 3 |
| B1-wx | `wx/B1-body-field.js` | 同上 | 3 |
| B1-html | `html/B1-body-field.js` | 同上 | 3 |
| B2-vue | `vue/B2-dollar-mode.js` | `$mode preserved` | 3 |
| ... | ... | ... | ... |

完整映射表在实施 plan 里展开。

---

## 附录 B：版本号变迁

```
v2.5.0            当前主分支
v2.6.0-phase1     审核系统升级（第一期，已完成）
                      ↓ 合并本 spec
v2.6.1            审核系统升级 + 替换脚本修复 + 源头跳过补齐
```

**版本号理由**：v2.6.1 是 v2.6.0-phase1 的增量修正 + 功能补齐，不是大版本跳跃。去掉 `-phase1` 预发布后缀，因为现在具备了完整性（审核+替换源头都覆盖了）。

---

**设计定稿**。下一步：转入 writing-plans skill 生成详细实施计划。
