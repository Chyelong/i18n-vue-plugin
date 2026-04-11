# 替换脚本 Bug 修复 + 源头跳过补齐 实施计划（v2.6.1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 vue/html 替换脚本的 3 个真实 bug（HTML 注释吞噬、跨行文本、弯引号嵌套），同时把 7 条缺失的源头跳过规则补齐到所有三个脚本（vue/wx/html），发布 v2.6.1。

**Architecture:** TDD 驱动——spike fixture 迁移到 `tests/fixtures/replace-bugs/` 作为回归锁定，新建 `tests/replace-bugs.test.js` 覆盖每个 bug。共享正则提取到 `shared-patterns.js`，三个脚本对齐跳过能力。所有修改都在现有脚本内做局部手术，不重构文件结构。

**Tech Stack:** Node.js、`node --test` runner、regex、现有 vue/wx/html replacer 类。

**Spec：** `docs/superpowers/specs/2026-04-11-replace-script-fixes-design.md`

---

## 文件结构

**新建：**
- `tests/replace-bugs.test.js` — 所有 bug 修复 + 跳过规则的单元测试
- `tests/fixtures/replace-bugs/vue/` — Vue 脚本的 fixture 集合
- `tests/fixtures/replace-bugs/wx/` — wx 脚本的 fixture 集合
- `tests/fixtures/replace-bugs/html/` — HTML 脚本的 fixture 集合

**修改：**
- `skills/i18n-replace/shared-patterns.js` — 追加 7 条 B 类跳过正则
- `skills/i18n-replace/vue-i18n-replace.js` — 修 A1/A2/A3 + 接入 B1-B5
- `skills/i18n-replace/wx-i18n-replace.js` — 接入 B1-B4/B6/B7
- `skills/i18n-replace/html-i18n-replace.js` — 修 A1 + 接入 B1-B7
- `.claude-plugin/plugin.json` — 版本 → v2.6.1
- `gemini-extension.json` — 版本 → v2.6.1
- `README.md` — 记录 v2.6.1 变化

**删除：**
- `tests/fixtures/spike/` — 迁移完成后整个目录删除

---

## Task 1：迁移 spike fixture + 建测试框架

**Files:**
- Create: `tests/fixtures/replace-bugs/vue/A1-html-comment.vue`
- Create: `tests/fixtures/replace-bugs/vue/A2-multiline-text.vue`
- Create: `tests/fixtures/replace-bugs/vue/A3-curly-quotes.vue`
- Create: `tests/fixtures/replace-bugs/vue/positive-template-string.vue`
- Create: `tests/fixtures/replace-bugs/vue/positive-bare-t.vue`
- Create: `tests/fixtures/replace-bugs/wx/positive-destructure.js`
- Create: `tests/fixtures/replace-bugs/wx/positive-extra-paren.js`
- Create: `tests/fixtures/replace-bugs/wx/positive-template-string.js`
- Create: `tests/fixtures/replace-bugs/html/A1-html-comment.html`
- Create: `tests/fixtures/replace-bugs/html/positive-bare-t.js`
- Create: `tests/replace-bugs.test.js`
- Delete: `tests/fixtures/spike/`

- [ ] **Step 1：验证 baseline 测试全绿**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js 2>&1 | tail -6`
Expected: `pass 110`，全绿

- [ ] **Step 2：迁移 spike fixtures 到正式目录**

```bash
cd F:/i18n-plugin
mkdir -p tests/fixtures/replace-bugs/vue tests/fixtures/replace-bugs/wx tests/fixtures/replace-bugs/html
git mv tests/fixtures/spike/vue/bug3-html-comment.vue tests/fixtures/replace-bugs/vue/A1-html-comment.vue
git mv tests/fixtures/spike/vue/bug5-multiline-text.vue tests/fixtures/replace-bugs/vue/A2-multiline-text.vue
git mv tests/fixtures/spike/vue/bug6-curly-quotes.vue tests/fixtures/replace-bugs/vue/A3-curly-quotes.vue
git mv tests/fixtures/spike/vue/bug4-template-string.vue tests/fixtures/replace-bugs/vue/positive-template-string.vue
git mv tests/fixtures/spike/vue/bug7-bare-t.vue tests/fixtures/replace-bugs/vue/positive-bare-t.vue
git mv tests/fixtures/spike/wx/bug1-destructure.js tests/fixtures/replace-bugs/wx/positive-destructure.js
git mv tests/fixtures/spike/wx/bug2-extra-paren.js tests/fixtures/replace-bugs/wx/positive-extra-paren.js
git mv tests/fixtures/spike/wx/bug4-template-string.js tests/fixtures/replace-bugs/wx/positive-template-string.js
git mv tests/fixtures/spike/html/bug3-html-comment.html tests/fixtures/replace-bugs/html/A1-html-comment.html
git mv tests/fixtures/spike/html/bug7-bare-t.js tests/fixtures/replace-bugs/html/positive-bare-t.js
rmdir tests/fixtures/spike/vue tests/fixtures/spike/wx tests/fixtures/spike/html tests/fixtures/spike
```

- [ ] **Step 3：创建测试文件骨架**

Create `tests/replace-bugs.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const VueI18nReplacer = require('../skills/i18n-replace/vue-i18n-replace');
const WxI18nReplacer = require('../skills/i18n-replace/wx-i18n-replace');
const HtmlI18nReplacer = require('../skills/i18n-replace/html-i18n-replace');

const FIXTURE_DIR = path.join(__dirname, 'fixtures/replace-bugs');

function readFixture(subPath) {
  return fs.readFileSync(path.join(FIXTURE_DIR, subPath), 'utf-8');
}

describe('replace-bugs sanity', () => {
  it('fixture directory exists and has files', () => {
    assert.ok(fs.existsSync(FIXTURE_DIR));
    assert.ok(fs.existsSync(path.join(FIXTURE_DIR, 'vue/A1-html-comment.vue')));
    assert.ok(fs.existsSync(path.join(FIXTURE_DIR, 'html/A1-html-comment.html')));
  });
});
```

**Note**：上面的 `require` 当前会失败，因为 vue-i18n-replace.js / wx-i18n-replace.js / html-i18n-replace.js 尚未 `module.exports` 相关类。需要在 Step 4 中加 export。

- [ ] **Step 4：在三个 replacer 脚本底部加 module.exports**

Find bottom of `skills/i18n-replace/vue-i18n-replace.js`. Should see a CLI block that does `if (require.main === module)` or similar. Find the `class VueI18nReplacer { ... }` definition.

Add at the END of the file（CLI 逻辑之外）:

```js
module.exports = VueI18nReplacer;
```

Same for `wx-i18n-replace.js`:
```js
module.exports = WxI18nReplacer;
```

Same for `html-i18n-replace.js`:
```js
module.exports = HtmlI18nReplacer;
```

**重要**：如果脚本现在是顶层直接执行（没有 `if (require.main === module)` 保护），需要先把 CLI main 逻辑包进 `if (require.main === module) { ... }`，否则 `require()` 测试时会触发脚本执行。

检查方法：
```bash
cd F:/i18n-plugin && grep -n "require.main === module" skills/i18n-replace/vue-i18n-replace.js skills/i18n-replace/wx-i18n-replace.js skills/i18n-replace/html-i18n-replace.js
```

如果 grep 结果为空（没有保护），则每个脚本的 main 执行部分都需要包一层 `if (require.main === module) { ... }`。

- [ ] **Step 5：运行 sanity 测试验证框架**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -8`
Expected: `pass 1`，sanity 测试通过

- [ ] **Step 6：运行全部测试确保无回归**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js 2>&1 | tail -8`
Expected: `pass 111`（原 110 + 新 1）

- [ ] **Step 7：Commit**

```bash
cd F:/i18n-plugin
git add tests/fixtures/replace-bugs/ tests/fixtures/spike tests/replace-bugs.test.js skills/i18n-replace/*.js
git commit -m "test: migrate spike fixtures to replace-bugs + test framework

Move tests/fixtures/spike/* to tests/fixtures/replace-bugs/* with
stable names (A1/A2/A3 for bugs, positive-* for regression lock).
Add tests/replace-bugs.test.js skeleton with sanity test.
Export replacer classes for testability."
```

---

## Task 2：Vue A1 — HTML 注释吞噬修复

**Files:**
- Modify: `skills/i18n-replace/vue-i18n-replace.js`（新增 `stripCommentPlaceholders` 方法 + 修改 `processTemplate` 标签内文本分支）
- Modify: `tests/replace-bugs.test.js`（追加 A1 Vue 测试）

- [ ] **Step 1：写失败测试**

在 `tests/replace-bugs.test.js` 的 `describe('replace-bugs sanity', ...)` 之后追加：

```js
describe('A1 Vue: HTML comment should not be wrapped in $t()', () => {
  it('comment preserved outside $t, chinese wrapped', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.vue';
    const input = readFixture('vue/A1-html-comment.vue');
    const output = replacer.processVueFile(input);

    // 反例：HTML 注释不应出现在 $t() 参数里
    assert.doesNotMatch(output, /\$t\([^)]*<!--/,
      'HTML comments must not be swallowed into $t()');
    assert.doesNotMatch(output, /__HTML_COMMENT_\d+__/,
      'No placeholder should leak into output');

    // 正例：原注释应保留
    assert.match(output, /<!-- 这是注释 -->/,
      'Comment should be preserved as-is');
    assert.match(output, /<!-- <img src="alipay\.png" \/> -->/,
      'Second comment should be preserved');

    // 正例：中文文本应被 $t() 包裹（使用单引号包裹）
    assert.match(output, /\$t\(['"]感谢您的支持['"]\)/,
      'Chinese text "感谢您的支持" should be wrapped');
    assert.match(output, /\$t\(['"]支付支持以下方式['"]\)/,
      'Chinese text "支付支持以下方式" should be wrapped');
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -20`
Expected: FAIL, `HTML comments must not be swallowed into $t()` assertion fails（当前输出里 `$t('<!-- 这是注释 -->\n    感谢您的支持')` 会被命中）

- [ ] **Step 3：在 VueI18nReplacer 类内新增 `stripCommentPlaceholders` 方法**

Edit `skills/i18n-replace/vue-i18n-replace.js`。在 class `VueI18nReplacer` 内，`processTemplate` 方法**之前**添加新方法：

```js
  /**
   * 把文本按 HTML 注释占位符切成 segments 序列
   * @param {string} text 可能含 __HTML_COMMENT_\d+__ 的文本
   * @returns {{ segments: Array<{type:'text'|'comment', value:string}>, hasComment: boolean }}
   */
  stripCommentPlaceholders(text) {
    const HTML_COMMENT_PH = /__HTML_COMMENT_\d+__/g;
    const segments = [];
    let lastIdx = 0;
    let m;
    HTML_COMMENT_PH.lastIndex = 0;
    while ((m = HTML_COMMENT_PH.exec(text)) !== null) {
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

- [ ] **Step 4：修改 processTemplate 的标签内文本分支**

Find in `skills/i18n-replace/vue-i18n-replace.js` around line 247-288 (the block that starts with `result = result.replace(TEMPLATE_TEXT_REGEX, (match, text) => {`).

Locate this block:

```js
      if (this.shouldSkip(trimmed, match)) {
        return match;
      }

      this.recordText(trimmed);

      // 保留前后空白
      const leadingSpace = text.match(/^\s*/)[0];
      const trailingSpace = text.match(/\s*$/)[0];

      return `>${leadingSpace}{{ $t('${this.escapeQuote(trimmed)}') }}${trailingSpace}<`;
    });
```

Replace with:

```js
      if (this.shouldSkip(trimmed, match)) {
        return match;
      }

      // A1 fix: 如果文本含 HTML 注释占位符，按 segments 分段处理，避免把注释吞进 $t()
      const { segments, hasComment } = this.stripCommentPlaceholders(trimmed);
      if (hasComment) {
        const leadingSpace = text.match(/^\s*/)[0];
        const trailingSpace = text.match(/\s*$/)[0];
        const parts = segments.map(seg => {
          if (seg.type === 'comment') return seg.value; // 占位符保留，后续全局还原
          const partTrimmed = seg.value.trim();
          if (!partTrimmed || !HAS_CHINESE.test(partTrimmed)) return seg.value;
          this.recordText(partTrimmed);
          return `{{ $t('${this.escapeQuote(partTrimmed)}') }}`;
        });
        return `>${leadingSpace}${parts.join('')}${trailingSpace}<`;
      }

      this.recordText(trimmed);

      // 保留前后空白
      const leadingSpace = text.match(/^\s*/)[0];
      const trailingSpace = text.match(/\s*$/)[0];

      return `>${leadingSpace}{{ $t('${this.escapeQuote(trimmed)}') }}${trailingSpace}<`;
    });
```

- [ ] **Step 5：运行测试确认通过**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -10`
Expected: PASS，A1 测试通过

- [ ] **Step 6：运行全部测试确保无回归**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js 2>&1 | tail -10`
Expected: `pass 112` 全部通过

- [ ] **Step 7：Commit**

```bash
cd F:/i18n-plugin
git add tests/replace-bugs.test.js skills/i18n-replace/vue-i18n-replace.js
git commit -m "fix(vue-replacer): A1 HTML comments swallowed into \$t()

Split text at __HTML_COMMENT_N__ placeholders before text extraction.
Comments stay as placeholders (restored later by existing pass),
only text segments get wrapped in \$t(). Fixes memory pitfall where
\$t('<!-- 注释 --> 中文') appeared in output."
```

---

## Task 3：HTML A1 — HTML 注释吞噬修复

**Files:**
- Modify: `skills/i18n-replace/html-i18n-replace.js`（修改 `processHtmlContent` 标签内文本分支）
- Modify: `tests/replace-bugs.test.js`（追加 A1 HTML 测试）

- [ ] **Step 1：写失败测试**

在 `tests/replace-bugs.test.js` 追加：

```js
describe('A1 HTML: HTML comment must not enter data-i18n', () => {
  it('data-i18n should contain only chinese text, not comment', () => {
    const replacer = new HtmlI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.html';
    const input = readFixture('html/A1-html-comment.html');
    const output = replacer.processHtmlFile(input);

    // 反例：data-i18n 属性里不应含 <!--
    assert.doesNotMatch(output, /data-i18n="[^"]*<!--/,
      'data-i18n must not contain HTML comments');
    assert.doesNotMatch(output, /data-i18n="[^"]*\n/,
      'data-i18n must be single-line');
    assert.doesNotMatch(output, /__HTML_COMMENT_\d+__/,
      'No placeholder should leak');

    // 正例：注释应保留
    assert.match(output, /<!-- 这是注释 -->/,
      'Comment should be preserved');

    // 正例：纯文本部分应在 data-i18n 里
    assert.match(output, /data-i18n="感谢您的支持"/,
      'data-i18n should contain only the chinese text');
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -15`
Expected: FAIL

- [ ] **Step 3：修改 processHtmlContent 的标签文本分支**

Find in `skills/i18n-replace/html-i18n-replace.js` around line 288-310 (the block starting with `// 第二步：处理标签间的中文文本`).

Locate this block:

```js
    result = result.replace(/(<(\w+)([^>]*)>)([^<]*[\u4e00-\u9fa5]+[^<]*)/g, (match, openTag, tagName, attrs, text) => {
      const tagLower = tagName.toLowerCase();
      // 跳过 script、style、void 元素
      if (['script', 'style'].includes(tagLower)) return match;
      if (VOID_ELEMENTS.includes(tagLower)) return match;
      // 已有 data-i18n 标记
      if (/data-i18n\s*=/.test(attrs)) return match;

      const trimmed = text.trim();
      if (!trimmed) return match;
      // 包含引号或已被 i18n 处理
      if (ALREADY_I18N.test(text)) return match;
      if (text.includes('"') || text.includes("'")) return match;
      // 含 Vue 插值 {{}} 的文本不能用 data-i18n（applyI18n 会覆盖 Vue 动态渲染）
      if (/\{\{.*?\}\}/.test(text)) return match;

      this.recordText(trimmed);

      // 在开始标签的 > 前插入 data-i18n 属性
      const newOpenTag = openTag.slice(0, -1) + ` data-i18n="${this.escapeAttr(trimmed)}">`;
      return newOpenTag + text;
    });
```

Replace with:

```js
    result = result.replace(/(<(\w+)([^>]*)>)([^<]*[\u4e00-\u9fa5]+[^<]*)/g, (match, openTag, tagName, attrs, text) => {
      const tagLower = tagName.toLowerCase();
      // 跳过 script、style、void 元素
      if (['script', 'style'].includes(tagLower)) return match;
      if (VOID_ELEMENTS.includes(tagLower)) return match;
      // 已有 data-i18n 标记
      if (/data-i18n\s*=/.test(attrs)) return match;

      // A1 fix: 剥离 HTML 注释占位符和换行，只保留纯中文文本
      const stripped = text
        .replace(/__HTML_COMMENT_\d+__/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!stripped) return match;
      if (!HAS_CHINESE.test(stripped)) return match;

      // 包含引号或已被 i18n 处理
      if (ALREADY_I18N.test(stripped)) return match;
      if (stripped.includes('"') || stripped.includes("'")) return match;
      // 含 Vue 插值 {{}} 的文本不能用 data-i18n
      if (/\{\{.*?\}\}/.test(stripped)) return match;

      this.recordText(stripped);

      // 在开始标签的 > 前插入 data-i18n 属性（只用 stripped 纯文本，不动原 text 内容）
      const newOpenTag = openTag.slice(0, -1) + ` data-i18n="${this.escapeAttr(stripped)}">`;
      return newOpenTag + text;
    });
```

**关键点**：
- `stripped` 只用于构造 `data-i18n` 属性值（必须是纯中文）
- 原 `text`（含占位符和换行）保持不变，后续 `__HTML_COMMENT_\d+__` 占位符还原会把注释恢复
- 这样 DOM 结构不变，`data-i18n` 里只有干净的翻译 key

- [ ] **Step 4：运行测试确认通过**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5：运行全部测试确保无回归**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js 2>&1 | tail -10`
Expected: `pass 113`

- [ ] **Step 6：Commit**

```bash
cd F:/i18n-plugin
git add tests/replace-bugs.test.js skills/i18n-replace/html-i18n-replace.js
git commit -m "fix(html-replacer): A1 HTML comments swallowed into data-i18n

Strip __HTML_COMMENT_N__ placeholders and collapse whitespace
before building data-i18n attribute value. Original text inside
the element stays unchanged, so placeholder restoration still
works correctly."
```

---

## Task 4：Vue A2 — 跨行文本合并

**Files:**
- Modify: `skills/i18n-replace/vue-i18n-replace.js`（2 处 `.trim()` 改为 `.replace(/\s+/g, ' ').trim()`）
- Modify: `tests/replace-bugs.test.js`（追加 A2 测试）

- [ ] **Step 1：写失败测试**

追加：

```js
describe('A2 Vue: multiline text must be collapsed to single line', () => {
  it('$t() content should not contain newlines', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.vue';
    const input = readFixture('vue/A2-multiline-text.vue');
    const output = replacer.processVueFile(input);

    // 反例：$t('...') 内部不应有换行（Vue 2 buble 会报 Unterminated string）
    const tCalls = output.match(/\$t\(['"][^'"]*['"]\)/g) || [];
    for (const call of tCalls) {
      assert.doesNotMatch(call, /\n/,
        `$t() call should not contain newline: ${JSON.stringify(call)}`);
    }

    // 正例：应有合并后的单行 $t()
    assert.match(output, /\$t\(['"]包时段或时长，不可用于计局台桌，从计时台桌更换到 ?计局台桌包时套餐将会失效。['"]\)/,
      'Multiline text should be collapsed to single line');
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -15`
Expected: FAIL, `$t() call should not contain newline`

- [ ] **Step 3：修改 vue-i18n-replace.js 的 trim 逻辑**

Find line ~253 in `skills/i18n-replace/vue-i18n-replace.js`:

```js
      let trimmed = text.trim();
```

Replace with:

```js
      let trimmed = text.replace(/\s+/g, ' ').trim();
```

Then find line ~330 inside `processMixedText`:

```js
        const trimmedPart = part.value.trim();
```

Replace with:

```js
        const trimmedPart = part.value.replace(/\s+/g, ' ').trim();
```

- [ ] **Step 4：运行测试确认通过**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5：运行全部测试**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js 2>&1 | tail -10`
Expected: `pass 114`

- [ ] **Step 6：Commit**

```bash
cd F:/i18n-plugin
git add tests/replace-bugs.test.js skills/i18n-replace/vue-i18n-replace.js
git commit -m "fix(vue-replacer): A2 normalize whitespace in tag body text

Collapse internal newlines/whitespace to single space before
wrapping in \$t(). Vue 2 buble compiler rejects multiline strings
inside \$t() with 'Unterminated string constant' error."
```

---

## Task 5：Vue A3 — smartQuoteAndWrap 智能包裹

**Files:**
- Modify: `skills/i18n-replace/vue-i18n-replace.js`（新增 `smartQuoteAndWrap` + `convertAsciiDoubleQuotes` 方法，替换 10 处 `$t('${escapeQuote(...)}')` 调用）
- Modify: `tests/replace-bugs.test.js`（追加 A3 测试）

- [ ] **Step 1：写失败测试**

追加：

```js
describe('A3 Vue: curly quote smart wrapping', () => {
  it('ASCII double quotes inside single-quoted strings should convert to curly quotes', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.vue';
    const input = readFixture('vue/A3-curly-quotes.vue');
    const output = replacer.processVueFile(input);

    // 反例：不应出现 \" 转义（Vue 2 buble 不支持）
    assert.doesNotMatch(output, /\\"/,
      'Escaped double quote \\" is forbidden (Vue 2 buble incompatible)');

    // 正例：script 区 tip 的 $t 应该已经用中文弯引号替代
    assert.match(output, /window\.\$t\('请输入\u201C昵称\u201D'\)/,
      'ASCII " inside string should become curly quotes');
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -15`
Expected: FAIL, `\"` 仍出现在输出中

- [ ] **Step 3：在 VueI18nReplacer 类内新增方法**

Find `escapeQuote` method in `skills/i18n-replace/vue-i18n-replace.js` (around line 350). **保留 `escapeQuote` 不动**（其他地方可能还在用），在其后新增两个方法：

```js
  /**
   * 把 ASCII 双引号 (") 转换为中文弯引号 (U+201C/U+201D)
   * 策略：交替左右弯引号
   */
  convertAsciiDoubleQuotes(text) {
    let open = true;
    return text.replace(/"/g, () => {
      const ch = open ? '\u201C' : '\u201D';
      open = !open;
      return ch;
    });
  }

  /**
   * A3 fix: 根据文本内容智能选择包裹引号，避免 Vue 2 buble \" 报错
   * - 同时含 ' 和 ":把 " 转成中文弯引号，用单引号包裹
   * - 只含 ":用单引号包裹不转义
   * - 否则:用单引号包裹，单引号转义
   * @param {string} text  待包裹文本
   * @param {string} prefix  'window.' / 'this.' / ''
   * @returns {string}  完整 $t('...') 表达式
   */
  smartQuoteAndWrap(text, prefix = '') {
    const hasSingle = text.includes("'");
    const hasDouble = text.includes('"');
    let body = text;

    if (hasSingle && hasDouble) {
      body = this.convertAsciiDoubleQuotes(body);
    }

    // 此时 body 要么不含 "，要么只含 "（弯引号），都用单引号包裹
    const escaped = body.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `${prefix}$t('${escaped}')`;
  }
```

- [ ] **Step 4：替换所有 `$t('${escapeQuote(...)}')` 调用点**

共 10 处（按 line 顺序）。下面列出每一处要改的代码。

**处 1**：line ~161（插值内纯字符串字面量）
```js
// 修改前
return `{{ $t('${this.escapeQuote(text)}') }}`;
// 修改后
return `{{ ${this.smartQuoteAndWrap(text)} }}`;
```

**处 2**：line ~187（插值内表达式字符串）
```js
// 修改前
return `$t('${this.escapeQuote(normalizedText)}')`;
// 修改后
return this.smartQuoteAndWrap(normalizedText);
```

**处 3**：line ~220（动态属性表达式）
```js
// 修改前
return `$t('${this.escapeQuote(literalText)}')`;
// 修改后
return this.smartQuoteAndWrap(literalText);
```

**处 4**：line ~243（静态属性转动态）
```js
// 修改前
return `${prefix}:${attr}="$t('${this.escapeQuote(value)}')"`;
// 修改后
return `${prefix}:${attr}="${this.smartQuoteAndWrap(value)}"`;
```

**处 5**：line ~287（标签内文本）
```js
// 修改前
return `>${leadingSpace}{{ $t('${this.escapeQuote(trimmed)}') }}${trailingSpace}<`;
// 修改后
return `>${leadingSpace}{{ ${this.smartQuoteAndWrap(trimmed)} }}${trailingSpace}<`;
```

**处 6**：line ~340（混合文本纯文本部分）
```js
// 修改前
return `${partLeading}{{ $t('${this.escapeQuote(trimmedPart)}') }}${partTrailing}`;
// 修改后
return `${partLeading}{{ ${this.smartQuoteAndWrap(trimmedPart)} }}${partTrailing}`;
```

**处 7**（A1 fix 里新增的调用点）：如果 Task 2 已经引入 `{{ $t('${this.escapeQuote(partTrimmed)}') }}`，同样改为 `{{ ${this.smartQuoteAndWrap(partTrimmed)} }}`。

**处 8**：line ~468（script 内 HTML 字符串里的内嵌 $t）
```js
// 修改前
return `>${leadingSpace}\${${prefix}$t('${this.escapeQuote(trimmedInner)}')}${trailingSpace}<`;
// 修改后
return `>${leadingSpace}\${${this.smartQuoteAndWrap(trimmedInner, prefix)}}${trailingSpace}<`;
```

**处 9**：line ~485-486（script 主路径）
```js
// 修改前
const replacement = `$t('${this.escapeQuote(text)}')`;
return `window.${replacement}`;
// 修改后
return this.smartQuoteAndWrap(text, 'window.');
```

**处 10**：line ~517（processTemplateString 内嵌中文字符串）

这里 quote 是外层模板字符串的 quote，内层是捕获的原始引号。保持 quote 不变更保险：

```js
// 修改前
return `${prefix}$t(${quote}${this.escapeQuote(strText)}${quote})`;
// 修改后（保持原行为，不用 smartQuoteAndWrap，因为这里引号被模板字符串上下文约束）
return `${prefix}$t(${quote}${this.escapeQuote(strText)}${quote})`;
```

**此处 10 不改**，因为 processTemplateString 的内嵌字符串是嵌在模板字符串里的，行为更复杂，暂保持 escapeQuote。

**处 11**：line ~545（processTemplateString 无变量分支）
```js
// 修改前
return `${prefix}$t('${this.escapeQuote(normalizedOriginal)}')`;
// 修改后
return this.smartQuoteAndWrap(normalizedOriginal, prefix);
```

**处 12**：line ~550（processTemplateString 带变量分支 — 这里有 params 参数，不能用 smartQuoteAndWrap 简单替换）

保持原样：
```js
// 不改
return `${prefix}$t('${this.escapeQuote(normalizedText)}', { ${params} })`;
```

**理由**：smartQuoteAndWrap 只生成 `$t('...')`，不支持 params。带 params 的路径保留 escapeQuote。这是可接受的，因为带 params 的文本通常是业务占位符 `{var}`，不太可能同时出现双引号嵌套。

**总结实际改动点**：处 1, 2, 3, 4, 5, 6, 7, 8, 9, 11 —— 共 10 处替换。

- [ ] **Step 5：运行测试确认通过**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 6：运行全部测试确保无回归**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js 2>&1 | tail -10`
Expected: `pass 115`

- [ ] **Step 7：Commit**

```bash
cd F:/i18n-plugin
git add tests/replace-bugs.test.js skills/i18n-replace/vue-i18n-replace.js
git commit -m "fix(vue-replacer): A3 smart quote wrapping

Add smartQuoteAndWrap() and convertAsciiDoubleQuotes() helpers.
When text contains both ' and \", convert \" to curly quotes
(U+201C/U+201D) to avoid Vue 2 buble \\\" compile error.
Replace 10 call sites in vue-i18n-replace.js. escapeQuote
is preserved for the parameterized \$t() path in processTemplateString."
```

---

## Task 6：shared-patterns.js 追加 B1-B7 跳过正则

**Files:**
- Modify: `skills/i18n-replace/shared-patterns.js`

- [ ] **Step 1：读取当前内容作为基线**

Run: `cd F:/i18n-plugin && cat skills/i18n-replace/shared-patterns.js`
Expected: 看到 5 条现有正则的导出

- [ ] **Step 2：追加 7 条新正则 + 更新 exports**

Edit `skills/i18n-replace/shared-patterns.js`。在 `module.exports = { ... }` 之前追加：

```js
// ===== 线路 B 新增：源头跳过补齐 =====

// B1: body 字段协议（支付网关订单描述，翻译后对账/退款失败）
const BODY_FIELD_REGEX = /\bbody\s*:\s*$/;

// B2: $mode 业务标识（用于 storage/逻辑判断）
const MODE_FIELD_REGEX = /\$mode\s*:\s*$/;

// B3: checkOperate({ name: ... }) 的 name 参数
const CHECK_OPERATE_NAME_REGEX = /checkOperate\s*\([^)]*\bname\s*:\s*$/;

// B4: 双用途字段 tag_name/tag_box_name/recharge_tag_name 赋值
const DUAL_USE_FIELD_REGEX = /\b(?:tag_name|tag_box_name|recharge_tag_name)\s*=\s*$/;

// B5: 对象字面量 key（JavaScript 语法：对象 key 不能是函数调用）
// 注意：这个正则用于 afterMatch，不是 beforeMatch
const OBJECT_KEY_AFTER_REGEX = /^\s*:(?!:)/;

// B6: EventBus 事件名（on/emit/off/once 两侧必须一致）
const EVENTBUS_REGEX = /(?:EventBus|eventBus|\$bus|\$event)\s*\.\s*\$?(?:on|emit|off|once)\s*\(\s*$/;

// B7: 路由 name / showRouter 参数（路由标识符）
const ROUTER_NAME_REGEX = /(?:\$router\s*\.\s*(?:push|replace)\s*\(\s*\{[^}]*name\s*:\s*|showRouter\s*\(\s*)$/;
```

更新导出块（完全替换原 `module.exports`）：

```js
module.exports = {
  // 原有
  SWITCH_CASE_REGEX,
  BRACKET_ACCESS_REGEX,
  INDEX_MATCH_REGEX,
  STORAGE_KEY_REGEX_BASE,
  WX_STORAGE_REGEX,
  // B 类新增
  BODY_FIELD_REGEX,
  MODE_FIELD_REGEX,
  CHECK_OPERATE_NAME_REGEX,
  DUAL_USE_FIELD_REGEX,
  OBJECT_KEY_AFTER_REGEX,
  EVENTBUS_REGEX,
  ROUTER_NAME_REGEX,
};
```

- [ ] **Step 3：运行全部测试确认无回归**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js 2>&1 | tail -6`
Expected: `pass 115`（无变化，只是 shared module 加内容）

- [ ] **Step 4：Commit**

```bash
cd F:/i18n-plugin
git add skills/i18n-replace/shared-patterns.js
git commit -m "feat(shared-patterns): add B1-B7 skip rules for replacers

7 new regex patterns for source-side skipping:
- B1 body field (payment protocol)
- B2 \$mode business identifier
- B3 checkOperate name parameter
- B4 dual-use fields (tag_name/tag_box_name/recharge_tag_name)
- B5 object literal key (syntax error prevention)
- B6 EventBus event names
- B7 router name / showRouter

These will be wired into vue/wx/html scripts in the next tasks."
```

---

## Task 7：Vue 脚本接入 B1/B2/B3/B4/B5

**Files:**
- Modify: `skills/i18n-replace/vue-i18n-replace.js`（引入 shared 新正则 + 在 processScript 追加跳过判断）
- Create: `tests/fixtures/replace-bugs/vue/B1-body-field.js`
- Create: `tests/fixtures/replace-bugs/vue/B2-dollar-mode.js`
- Create: `tests/fixtures/replace-bugs/vue/B3-check-operate.js`
- Create: `tests/fixtures/replace-bugs/vue/B4-dual-use-field.js`
- Create: `tests/fixtures/replace-bugs/vue/B5-object-key.js`
- Modify: `tests/replace-bugs.test.js`（追加 B1-B5 Vue 测试）

Vue 脚本已有 B6 (EventBus) 和 B7 (Router name)，本 Task 只补 B1-B5。

- [ ] **Step 1：创建 5 个 fixture 文件**

Create `tests/fixtures/replace-bugs/vue/B1-body-field.js`:

```js
export default {
  pay() {
    return {
      body: '包时套餐充值',
      amount: 100
    };
  }
};
```

Create `tests/fixtures/replace-bugs/vue/B2-dollar-mode.js`:

```js
export default {
  setup() {
    const payload = {
      $mode: '买赠',
      count: 1
    };
    return payload;
  }
};
```

Create `tests/fixtures/replace-bugs/vue/B3-check-operate.js`:

```js
export default {
  methods: {
    order() {
      checkOperate({ name: '订座', callback: () => {} });
    }
  }
};
```

Create `tests/fixtures/replace-bugs/vue/B4-dual-use-field.js`:

```js
export default {
  created() {
    this.tag_name = '组合套餐';
    this.tag_box_name = '套餐盒';
    this.recharge_tag_name = '充值标签';
  }
};
```

Create `tests/fixtures/replace-bugs/vue/B5-object-key.js`:

```js
export default {
  data() {
    return {
      typeMap: {
        '绑定用户': 'bind',
        '解绑用户': 'unbind'
      }
    };
  }
};
```

- [ ] **Step 2：写失败测试**

追加到 `tests/replace-bugs.test.js`:

```js
describe('B1 Vue: body field should be skipped', () => {
  it('body: "中文" should not be wrapped', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('vue/B1-body-field.js');
    const output = replacer.processScript(input);

    assert.match(output, /body:\s*['"]包时套餐充值['"]/,
      'body value must remain original chinese');
    assert.doesNotMatch(output, /body:\s*window\.\$t/,
      'body field must not be wrapped with window.$t');
    assert.ok(replacer.skippedLogic.some(s => /body/.test(s.reason)),
      'should record "body" in skippedLogic');
  });
});

describe('B2 Vue: $mode field should be skipped', () => {
  it('$mode: "中文" should not be wrapped', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('vue/B2-dollar-mode.js');
    const output = replacer.processScript(input);

    assert.match(output, /\$mode:\s*['"]买赠['"]/,
      '$mode value must remain original');
    assert.doesNotMatch(output, /\$mode:\s*window\.\$t/,
      '$mode must not be wrapped');
    assert.ok(replacer.skippedLogic.some(s => /\$mode/.test(s.reason)),
      'should record "$mode" in skippedLogic');
  });
});

describe('B3 Vue: checkOperate name should be skipped', () => {
  it('checkOperate({ name: "中文" }) should not be wrapped', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('vue/B3-check-operate.js');
    const output = replacer.processScript(input);

    assert.match(output, /name:\s*['"]订座['"]/,
      'checkOperate name must remain original');
    assert.doesNotMatch(output, /name:\s*window\.\$t\(['"]订座/,
      'checkOperate name must not be wrapped');
  });
});

describe('B4 Vue: dual-use field assignment should be skipped', () => {
  it('tag_name/tag_box_name/recharge_tag_name = "中文" should not be wrapped', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('vue/B4-dual-use-field.js');
    const output = replacer.processScript(input);

    assert.match(output, /tag_name\s*=\s*['"]组合套餐['"]/);
    assert.match(output, /tag_box_name\s*=\s*['"]套餐盒['"]/);
    assert.match(output, /recharge_tag_name\s*=\s*['"]充值标签['"]/);
    assert.doesNotMatch(output, /tag_name\s*=\s*window\.\$t/);
  });
});

describe('B5 Vue: object literal key should be skipped', () => {
  it('{"中文": value} should not become {window.$t("中文"): value}', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('vue/B5-object-key.js');
    const output = replacer.processScript(input);

    // 对象 key 保持原样
    assert.match(output, /['"]绑定用户['"]:\s*['"]bind['"]/);
    assert.match(output, /['"]解绑用户['"]:\s*['"]unbind['"]/);
    // 不应有 window.$t('绑定用户'): 这种语法错误
    assert.doesNotMatch(output, /window\.\$t\(['"]绑定用户['"]\)\s*:/);
  });
});
```

- [ ] **Step 3：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -20`
Expected: FAIL，多个 B 类测试失败

- [ ] **Step 4：在 vue-i18n-replace.js 引入新正则**

Find the line near top of `skills/i18n-replace/vue-i18n-replace.js` that does:

```js
const {
  SWITCH_CASE_REGEX,
  BRACKET_ACCESS_REGEX,
  INDEX_MATCH_REGEX,
} = require('./shared-patterns');
```

Replace with:

```js
const {
  SWITCH_CASE_REGEX,
  BRACKET_ACCESS_REGEX,
  INDEX_MATCH_REGEX,
  BODY_FIELD_REGEX,
  MODE_FIELD_REGEX,
  CHECK_OPERATE_NAME_REGEX,
  DUAL_USE_FIELD_REGEX,
  OBJECT_KEY_AFTER_REGEX,
} = require('./shared-patterns');
```

- [ ] **Step 5：在 processScript 的跳过区块追加 B1-B5 判断**

Find in `skills/i18n-replace/vue-i18n-replace.js` the `processScript` method. Find this block (after the existing `EVENTBUS_REGEX` check):

```js
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

**在 `indexOf/includes` 检测之后**追加 B1-B5：

```js
        // indexOf/includes 参数
        if (INDEX_MATCH_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'indexOf/includes 匹配值（可能匹配后端数据）', line: line.trim() });
          return match;
        }

        // B1: body 字段（支付协议）
        if (BODY_FIELD_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'body 字段（支付协议，不翻译）', line: line.trim() });
          return match;
        }

        // B2: $mode 业务标识
        if (MODE_FIELD_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '$mode 业务标识（不翻译）', line: line.trim() });
          return match;
        }

        // B3: checkOperate name 参数
        if (CHECK_OPERATE_NAME_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'checkOperate name 参数（内部用 indexOf 匹配原文）', line: line.trim() });
          return match;
        }

        // B4: 双用途字段赋值
        if (DUAL_USE_FIELD_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '双用途字段赋值（后端数据层不翻译）', line: line.trim() });
          return match;
        }

        // B5: 对象字面量 key (afterMatch 检测)
        const afterMatch = line.substring(matchIndex + match.length);
        if (OBJECT_KEY_AFTER_REGEX.test(afterMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '对象字面量 key（JS 语法错误）', line: line.trim() });
          return match;
        }
```

- [ ] **Step 6：运行测试确认通过**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 7：运行全部测试**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js 2>&1 | tail -6`
Expected: `pass 120`（新增 5 个 B 测试）

- [ ] **Step 8：Commit**

```bash
cd F:/i18n-plugin
git add tests/fixtures/replace-bugs/vue/B*.js tests/replace-bugs.test.js skills/i18n-replace/vue-i18n-replace.js
git commit -m "feat(vue-replacer): add B1-B5 source-side skip rules

B1 body field (payment protocol)
B2 \$mode business identifier
B3 checkOperate name parameter
B4 dual-use field assignment (tag_name/tag_box_name/recharge_tag_name)
B5 object literal key (JS syntax error prevention)

Pulls regex from shared-patterns.js. Records skipped reason in
skippedLogic for visibility."
```

---

## Task 8：wx 脚本接入 B1/B2/B3/B4/B6/B7

**Files:**
- Modify: `skills/i18n-replace/wx-i18n-replace.js`（引入 shared + 追加 6 条跳过判断）
- Create: `tests/fixtures/replace-bugs/wx/B1-body-field.js`
- Create: `tests/fixtures/replace-bugs/wx/B2-dollar-mode.js`
- Create: `tests/fixtures/replace-bugs/wx/B3-check-operate.js`
- Create: `tests/fixtures/replace-bugs/wx/B4-dual-use-field.js`
- Create: `tests/fixtures/replace-bugs/wx/B6-eventbus.js`
- Create: `tests/fixtures/replace-bugs/wx/B7-router-name.js`
- Modify: `tests/replace-bugs.test.js`

wx 脚本已有 B5 (对象 key)，本 Task 补 B1/B2/B3/B4/B6/B7。

- [ ] **Step 1：创建 6 个 fixture 文件**

Create `tests/fixtures/replace-bugs/wx/B1-body-field.js`:

```js
Page({
  pay() {
    wx.request({
      url: '/api/pay',
      data: { body: '包时套餐充值', amount: 100 }
    });
  }
});
```

Create `tests/fixtures/replace-bugs/wx/B2-dollar-mode.js`:

```js
Page({
  setup() {
    const payload = { $mode: '买赠', count: 1 };
    return payload;
  }
});
```

Create `tests/fixtures/replace-bugs/wx/B3-check-operate.js`:

```js
Page({
  order() {
    checkOperate({ name: '订座', callback: function() {} });
  }
});
```

Create `tests/fixtures/replace-bugs/wx/B4-dual-use-field.js`:

```js
Page({
  onLoad() {
    this.tag_name = '组合套餐';
    this.tag_box_name = '套餐盒';
    this.recharge_tag_name = '充值标签';
  }
});
```

Create `tests/fixtures/replace-bugs/wx/B6-eventbus.js`:

```js
Page({
  onLoad() {
    EventBus.on('订单支付成功', this.handlePaid);
    $bus.emit('用户登录', { uid: 1 });
  }
});
```

Create `tests/fixtures/replace-bugs/wx/B7-router-name.js`:

```js
Page({
  navigate() {
    wx.navigateTo({ url: '/pages/home/home' });
    showRouter('充值页面');
  }
});
```

- [ ] **Step 2：写失败测试**

追加到 `tests/replace-bugs.test.js`:

```js
describe('B1 wx: body field should be skipped', () => {
  it('body: "中文" should not be wrapped', () => {
    const replacer = new WxI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('wx/B1-body-field.js');
    const output = replacer.processScript(input);
    assert.match(output, /body:\s*['"]包时套餐充值['"]/);
    assert.doesNotMatch(output, /body:\s*global\.\$t/);
  });
});

describe('B2 wx: $mode field should be skipped', () => {
  it('$mode: "中文" should not be wrapped', () => {
    const replacer = new WxI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('wx/B2-dollar-mode.js');
    const output = replacer.processScript(input);
    assert.match(output, /\$mode:\s*['"]买赠['"]/);
    assert.doesNotMatch(output, /\$mode:\s*global\.\$t/);
  });
});

describe('B3 wx: checkOperate name should be skipped', () => {
  it('checkOperate({ name: "中文" }) should not be wrapped', () => {
    const replacer = new WxI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('wx/B3-check-operate.js');
    const output = replacer.processScript(input);
    assert.match(output, /name:\s*['"]订座['"]/);
    assert.doesNotMatch(output, /name:\s*global\.\$t\(['"]订座/);
  });
});

describe('B4 wx: dual-use field should be skipped', () => {
  it('tag_name/tag_box_name/recharge_tag_name = "中文" should not be wrapped', () => {
    const replacer = new WxI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('wx/B4-dual-use-field.js');
    const output = replacer.processScript(input);
    assert.match(output, /tag_name\s*=\s*['"]组合套餐['"]/);
    assert.doesNotMatch(output, /tag_name\s*=\s*global\.\$t/);
  });
});

describe('B6 wx: EventBus event name should be skipped', () => {
  it('EventBus.on/$bus.emit("中文") should not be wrapped', () => {
    const replacer = new WxI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('wx/B6-eventbus.js');
    const output = replacer.processScript(input);
    assert.match(output, /EventBus\.on\(['"]订单支付成功['"]/);
    assert.match(output, /\$bus\.emit\(['"]用户登录['"]/);
    assert.doesNotMatch(output, /EventBus\.on\(\s*global\.\$t/);
  });
});

describe('B7 wx: showRouter name should be skipped', () => {
  it('showRouter("中文") should not be wrapped', () => {
    const replacer = new WxI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('wx/B7-router-name.js');
    const output = replacer.processScript(input);
    assert.match(output, /showRouter\(['"]充值页面['"]/);
    assert.doesNotMatch(output, /showRouter\(\s*global\.\$t/);
  });
});
```

- [ ] **Step 3：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -20`
Expected: FAIL

- [ ] **Step 4：在 wx-i18n-replace.js 引入新正则**

Find the shared-patterns require block in `skills/i18n-replace/wx-i18n-replace.js`:

```js
const {
  SWITCH_CASE_REGEX,
  BRACKET_ACCESS_REGEX,
  INDEX_MATCH_REGEX,
  STORAGE_KEY_REGEX_BASE,
  WX_STORAGE_REGEX,
} = require('./shared-patterns');
```

Replace with:

```js
const {
  SWITCH_CASE_REGEX,
  BRACKET_ACCESS_REGEX,
  INDEX_MATCH_REGEX,
  STORAGE_KEY_REGEX_BASE,
  WX_STORAGE_REGEX,
  BODY_FIELD_REGEX,
  MODE_FIELD_REGEX,
  CHECK_OPERATE_NAME_REGEX,
  DUAL_USE_FIELD_REGEX,
  EVENTBUS_REGEX,
  ROUTER_NAME_REGEX,
} = require('./shared-patterns');
```

- [ ] **Step 5：在 processScript 的跳过区块追加 B1/B2/B3/B4/B6/B7**

Find `processScript` method in `skills/i18n-replace/wx-i18n-replace.js`. Find the block（约 line 297-325）that has the existing skip checks. After `INDEX_MATCH_REGEX` check and **before** 对象 key 检测，追加：

```js
        if (INDEX_MATCH_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'indexOf/includes 匹配值（可能匹配后端数据）', line: line.trim() });
          return match;
        }

        // B1: body 字段（支付协议）
        if (BODY_FIELD_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'body 字段（支付协议，不翻译）', line: line.trim() });
          return match;
        }

        // B2: $mode 业务标识
        if (MODE_FIELD_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '$mode 业务标识（不翻译）', line: line.trim() });
          return match;
        }

        // B3: checkOperate name 参数
        if (CHECK_OPERATE_NAME_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'checkOperate name 参数（内部用 indexOf 匹配原文）', line: line.trim() });
          return match;
        }

        // B4: 双用途字段赋值
        if (DUAL_USE_FIELD_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '双用途字段赋值（后端数据层不翻译）', line: line.trim() });
          return match;
        }

        // B6: EventBus 事件名
        if (EVENTBUS_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'EventBus 事件名', line: line.trim() });
          return match;
        }

        // B7: 路由 name / showRouter
        if (ROUTER_NAME_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '路由标识符（$router name / showRouter）', line: line.trim() });
          return match;
        }

        // ===== 对象 key 跳过（踩坑经验：{ global.$t('中文'): value } 是语法错误）=====
```

- [ ] **Step 6：运行测试确认通过**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 7：运行全部测试**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js 2>&1 | tail -6`
Expected: `pass 126`

- [ ] **Step 8：Commit**

```bash
cd F:/i18n-plugin
git add tests/fixtures/replace-bugs/wx/B*.js tests/replace-bugs.test.js skills/i18n-replace/wx-i18n-replace.js
git commit -m "feat(wx-replacer): add B1/B2/B3/B4/B6/B7 source-side skip rules

Wire body, \$mode, checkOperate, dual-use fields, EventBus,
router name into wx script's processScript. B5 (object key)
was already present from v2.5.0."
```

---

## Task 9：html 脚本接入 B1-B7

**Files:**
- Modify: `skills/i18n-replace/html-i18n-replace.js`
- Create: `tests/fixtures/replace-bugs/html/B1-body-field.js` 到 `B7-router-name.js` 共 7 个 fixture
- Modify: `tests/replace-bugs.test.js`

HTML 脚本当前只有 B 类中的部分（SWITCH_CASE/BRACKET/STORAGE/INDEX_MATCH），B1-B7 全部要补。

- [ ] **Step 1：创建 7 个 fixture**

Create `tests/fixtures/replace-bugs/html/B1-body-field.js`:

```js
function pay() {
  return { body: '包时套餐充值', amount: 100 };
}
```

Create `tests/fixtures/replace-bugs/html/B2-dollar-mode.js`:

```js
var payload = { $mode: '买赠', count: 1 };
```

Create `tests/fixtures/replace-bugs/html/B3-check-operate.js`:

```js
function order() {
  checkOperate({ name: '订座', ok: function() {} });
}
```

Create `tests/fixtures/replace-bugs/html/B4-dual-use-field.js`:

```js
var state = {};
state.tag_name = '组合套餐';
state.tag_box_name = '套餐盒';
state.recharge_tag_name = '充值标签';
```

Create `tests/fixtures/replace-bugs/html/B5-object-key.js`:

```js
var typeMap = {
  '绑定用户': 'bind',
  '解绑用户': 'unbind'
};
```

Create `tests/fixtures/replace-bugs/html/B6-eventbus.js`:

```js
EventBus.on('订单支付成功', handlePaid);
$bus.emit('用户登录', { uid: 1 });
```

Create `tests/fixtures/replace-bugs/html/B7-router-name.js`:

```js
function navigate() {
  showRouter('充值页面');
}
```

- [ ] **Step 2：写失败测试**

追加到 `tests/replace-bugs.test.js`:

```js
describe('B1 HTML: body field should be skipped', () => {
  it('body: "中文" should not be wrapped', () => {
    const replacer = new HtmlI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('html/B1-body-field.js');
    const output = replacer.processScript(input);
    assert.match(output, /body:\s*['"]包时套餐充值['"]/);
    assert.doesNotMatch(output, /body:\s*window\.\$t/);
  });
});

describe('B2 HTML: $mode field should be skipped', () => {
  it('$mode: "中文" should not be wrapped', () => {
    const replacer = new HtmlI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('html/B2-dollar-mode.js');
    const output = replacer.processScript(input);
    assert.match(output, /\$mode:\s*['"]买赠['"]/);
    assert.doesNotMatch(output, /\$mode:\s*window\.\$t/);
  });
});

describe('B3 HTML: checkOperate name should be skipped', () => {
  it('checkOperate({ name: "中文" }) should not be wrapped', () => {
    const replacer = new HtmlI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('html/B3-check-operate.js');
    const output = replacer.processScript(input);
    assert.match(output, /name:\s*['"]订座['"]/);
    assert.doesNotMatch(output, /name:\s*window\.\$t/);
  });
});

describe('B4 HTML: dual-use field should be skipped', () => {
  it('tag_name etc. should not be wrapped', () => {
    const replacer = new HtmlI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('html/B4-dual-use-field.js');
    const output = replacer.processScript(input);
    assert.match(output, /tag_name\s*=\s*['"]组合套餐['"]/);
    assert.doesNotMatch(output, /tag_name\s*=\s*window\.\$t/);
  });
});

describe('B5 HTML: object literal key should be skipped', () => {
  it('{"中文": value} should not become {window.$t("中文"): value}', () => {
    const replacer = new HtmlI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('html/B5-object-key.js');
    const output = replacer.processScript(input);
    assert.match(output, /['"]绑定用户['"]:\s*['"]bind['"]/);
    assert.doesNotMatch(output, /window\.\$t\(['"]绑定用户['"]\)\s*:/);
  });
});

describe('B6 HTML: EventBus event name should be skipped', () => {
  it('EventBus.on/$bus.emit should not be wrapped', () => {
    const replacer = new HtmlI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('html/B6-eventbus.js');
    const output = replacer.processScript(input);
    assert.match(output, /EventBus\.on\(['"]订单支付成功['"]/);
    assert.doesNotMatch(output, /EventBus\.on\(\s*window\.\$t/);
  });
});

describe('B7 HTML: showRouter name should be skipped', () => {
  it('showRouter("中文") should not be wrapped', () => {
    const replacer = new HtmlI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('html/B7-router-name.js');
    const output = replacer.processScript(input);
    assert.match(output, /showRouter\(['"]充值页面['"]/);
    assert.doesNotMatch(output, /showRouter\(\s*window\.\$t/);
  });
});
```

- [ ] **Step 3：运行测试确认失败**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -20`
Expected: FAIL

- [ ] **Step 4：在 html-i18n-replace.js 引入新正则**

Find the shared-patterns require block in `skills/i18n-replace/html-i18n-replace.js`:

```js
const {
  SWITCH_CASE_REGEX,
  BRACKET_ACCESS_REGEX,
  INDEX_MATCH_REGEX,
  STORAGE_KEY_REGEX_BASE: STORAGE_KEY_REGEX,
} = require('./shared-patterns');
```

（或类似形式；注意如果是别名导入，保留 `STORAGE_KEY_REGEX_BASE: STORAGE_KEY_REGEX` 语法）

Replace with:

```js
const {
  SWITCH_CASE_REGEX,
  BRACKET_ACCESS_REGEX,
  INDEX_MATCH_REGEX,
  STORAGE_KEY_REGEX_BASE: STORAGE_KEY_REGEX,
  BODY_FIELD_REGEX,
  MODE_FIELD_REGEX,
  CHECK_OPERATE_NAME_REGEX,
  DUAL_USE_FIELD_REGEX,
  OBJECT_KEY_AFTER_REGEX,
  EVENTBUS_REGEX,
  ROUTER_NAME_REGEX,
} = require('./shared-patterns');
```

**如果 html-i18n-replace.js 的导入结构和上面不同**，按实际结构调整，但要确保 7 个新符号都被引入。

- [ ] **Step 5：在 processScript 跳过区块追加 B1-B7**

Find `processScript` in `skills/i18n-replace/html-i18n-replace.js` around line 130-211. Find the block after `INDEX_MATCH_REGEX` check. Add after that:

```js
        if (INDEX_MATCH_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'indexOf/includes 匹配值（可能匹配后端数据）', line: line.trim() });
          return match;
        }

        // B1: body 字段（支付协议）
        if (BODY_FIELD_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'body 字段（支付协议，不翻译）', line: line.trim() });
          return match;
        }

        // B2: $mode 业务标识
        if (MODE_FIELD_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '$mode 业务标识（不翻译）', line: line.trim() });
          return match;
        }

        // B3: checkOperate name 参数
        if (CHECK_OPERATE_NAME_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'checkOperate name 参数（内部用 indexOf 匹配原文）', line: line.trim() });
          return match;
        }

        // B4: 双用途字段赋值
        if (DUAL_USE_FIELD_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '双用途字段赋值（后端数据层不翻译）', line: line.trim() });
          return match;
        }

        // B6: EventBus 事件名
        if (EVENTBUS_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'EventBus 事件名', line: line.trim() });
          return match;
        }

        // B7: 路由 name / showRouter
        if (ROUTER_NAME_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '路由标识符（showRouter）', line: line.trim() });
          return match;
        }

        // B5: 对象字面量 key (afterMatch 检测)
        const afterMatch = line.substring(matchIndex + match.length);
        if (OBJECT_KEY_AFTER_REGEX.test(afterMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '对象字面量 key（JS 语法错误）', line: line.trim() });
          return match;
        }
```

- [ ] **Step 6：运行测试确认通过**

Run: `cd F:/i18n-plugin && node --test tests/replace-bugs.test.js 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 7：运行全部测试**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js 2>&1 | tail -6`
Expected: `pass 133`

- [ ] **Step 8：Commit**

```bash
cd F:/i18n-plugin
git add tests/fixtures/replace-bugs/html/B*.js tests/replace-bugs.test.js skills/i18n-replace/html-i18n-replace.js
git commit -m "feat(html-replacer): add B1-B7 source-side skip rules

Wire all 7 B-class skip rules into html script's processScript:
body, \$mode, checkOperate, dual-use fields, object key, EventBus,
router name. HTML replacer is now on par with vue/wx replacers."
```

---

## Task 10：bump 版本到 v2.6.1 + 更新 README

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `gemini-extension.json`
- Modify: `README.md`

- [ ] **Step 1：bump plugin.json**

Edit `F:\i18n-plugin\.claude-plugin\plugin.json`:

```js
// 修改前
"version": "2.6.0-phase1",
// 修改后
"version": "2.6.1",
```

- [ ] **Step 2：bump gemini-extension.json**

Edit `F:\i18n-plugin\gemini-extension.json`:

```js
// 修改前
"version": "2.6.0-phase1",
// 修改后
"version": "2.6.1",
```

- [ ] **Step 3：更新 README.md 的 validator 章节**

Find in `F:\i18n-plugin\README.md` the section `## i18n-validate 审核脚本（v2.6.0+）`. Replace that section heading to `## i18n-validate 审核脚本（v2.6.1+）`.

At the end of that section, **before** `## 支持的项目类型`, 追加一个新的小节：

```markdown
## 替换脚本事前预防（v2.6.1+）

为减少 validator 反复报错的负担，vue/wx/html 替换脚本在源头做了更全面的预防扫描：

**已修复的脚本 bug（v2.6.1）**：

- Vue/HTML 脚本不再把 HTML 注释吞进 `$t()` / `data-i18n`
- Vue 脚本把跨行模板文本合并为单行（避免 Vue 2 buble `Unterminated string constant`）
- Vue 脚本对含双引号的文本用中文弯引号替代 ASCII `"`，避开 `\"` 转义陷阱

**三脚本统一的源头跳过规则（v2.6.1）**：

| 规则 | 触发位置 | 说明 |
|------|---------|------|
| body 字段 | `body: '中文'` | 支付网关订单描述，翻译后对账失败 |
| $mode 字段 | `$mode: '中文'` | 业务标识，用于 storage/逻辑判断 |
| checkOperate name | `checkOperate({ name: '中文' })` | 内部用 indexOf 匹配原文 |
| 双用途字段 | `tag_name/tag_box_name/recharge_tag_name = '中文'` | 同时用于后端数据和 UI 展示 |
| 对象字面量 key | `{ '中文': value }` | JS 语法：对象 key 不能是函数调用 |
| EventBus 事件名 | `$bus.on/emit('中文')` | 跨文件配对必须一致 |
| 路由 name | `$router.push({ name: '中文' })`、`showRouter('中文')` | 路由技术标识符 |

这些规则被替换脚本识别后会保留原始中文字符串，并在 `skippedLogic` 中输出原因供审查。
```

- [ ] **Step 4：运行全部测试确认无回归**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js 2>&1 | tail -6`
Expected: `pass 133`

- [ ] **Step 5：Commit**

```bash
cd F:/i18n-plugin
git add .claude-plugin/plugin.json gemini-extension.json README.md
git commit -m "chore: bump to v2.6.1 + README update

Document replace-script fixes and 7 source-side skip rules.
Drops the phase1 pre-release suffix — v2.6.1 represents both
audit-side and replacer-side improvements."
```

---

## Task 11：端到端烟测

**Files:**
- 无新文件（只跑命令）

**目的**：对 Task 1 迁移的 fixture 再跑一次完整 replace 流程，手工验证 3 个 bug 确实消失、7 条跳过规则确实生效。

- [ ] **Step 1：准备 spike 工作区**

```bash
cd F:/i18n-plugin
rm -rf .spike-smoke
mkdir -p .spike-smoke/vue .spike-smoke/wx .spike-smoke/html \
         .spike-smoke/vue-i18n .spike-smoke/wx-i18n .spike-smoke/html-i18n
cp tests/fixtures/replace-bugs/vue/A1-html-comment.vue \
   tests/fixtures/replace-bugs/vue/A2-multiline-text.vue \
   tests/fixtures/replace-bugs/vue/A3-curly-quotes.vue \
   .spike-smoke/vue/
cp tests/fixtures/replace-bugs/html/A1-html-comment.html .spike-smoke/html/
```

- [ ] **Step 2：初始化 i18n 目录**

```bash
cd F:/i18n-plugin
node skills/i18n-init/i18n-init.js .spike-smoke/vue-i18n --langs tw --type vue
node skills/i18n-init/i18n-init.js .spike-smoke/html-i18n --langs tw --type browser
```

- [ ] **Step 3：跑 Vue replacer，检查输出**

```bash
cd F:/i18n-plugin
node skills/i18n-replace/vue-i18n-replace.js .spike-smoke/vue --i18n-dir .spike-smoke/vue-i18n --lang tw
```

然后 Read 以下文件检查：

```bash
cat .spike-smoke/vue/A1-html-comment.vue
```

Expected：
- 包含 `<!-- 这是注释 -->` 作为独立注释
- 包含 `<!-- <img src="alipay.png" /> -->` 作为独立注释
- 有 `{{ $t('感谢您的支持') }}` 或类似
- **不**包含 `$t('<!--` 模式
- **不**包含 `__HTML_COMMENT_`

```bash
cat .spike-smoke/vue/A2-multiline-text.vue
```

Expected：
- `$t('...')` 内部是**单行**（无换行）
- 文本含"包时段或时长..."且已合并空白

```bash
cat .spike-smoke/vue/A3-curly-quotes.vue
```

Expected：
- script 区 `tip` 的 `$t()` 包裹使用中文弯引号（`"昵称"`）
- **不**包含 `\"` 转义

- [ ] **Step 4：跑 HTML replacer，检查输出**

```bash
cd F:/i18n-plugin
node skills/i18n-replace/html-i18n-replace.js .spike-smoke/html --i18n-dir .spike-smoke/html-i18n --lang tw
cat .spike-smoke/html/A1-html-comment.html
```

Expected：
- `<div data-i18n="感谢您的支持">`（data-i18n 只含纯中文）
- `<!-- 这是注释 -->` 作为独立注释
- **不**包含 `data-i18n="...\n` 或 `data-i18n="...<!--`

- [ ] **Step 5：运行 validator 对比前后**

```bash
cd F:/i18n-plugin
node skills/i18n-replace/i18n-validate.js .spike-smoke/vue --type vue --i18n-dir .spike-smoke/vue-i18n --lang tw --format json 2>&1 | tail -60
```

Expected: 输出中应该：
- `stats.critical` 应比 v2.6.0-phase1 的 spike 输出更少
- `issues[]` 中没有 A12（HTML 注释占位符残留）命中
- 没有涉及到 body/$mode/checkOperate 等字段的误报

- [ ] **Step 6：清理临时目录**

```bash
rm -rf .spike-smoke
```

- [ ] **Step 7：跑一次全部测试最终确认**

Run: `cd F:/i18n-plugin && node --test tests/*.test.js 2>&1 | tail -10`
Expected: `pass 133`，全绿

- [ ] **Step 8：无代码变更，跳过 commit**

Task 11 只是烟测，没有文件改动。

---

## 自审清单（写完本计划后过一遍）

**1. Spec 覆盖**：
- Spec 第 3.1 A1 (vue)  → Task 2
- Spec 第 3.1 A1 (html) → Task 3
- Spec 第 3.2 A2        → Task 4
- Spec 第 3.3 A3        → Task 5
- Spec 第 4.1 shared-patterns 追加 → Task 6
- Spec 第 4.2 Vue 接入 → Task 7
- Spec 第 4.2 wx 接入 → Task 8
- Spec 第 4.2 html 接入 → Task 9
- Spec 第 5 测试策略 → Task 1 建框架，Task 2-9 用 TDD 方式覆盖
- Spec 第 7 task list → 11 个 task 覆盖（合并了原 task 11-12 的 bump 到单个 Task 10）
- Spec 附录 B 版本号 → Task 10

无遗漏。

**2. Placeholder 扫描**：
- 所有步骤都包含完整代码块或完整命令，无 TBD/TODO/XXX。
- 线路 B 所有 fixture 都给出了完整内容。
- 所有 describe/it 测试的 assertion 代码完整。

**3. 类型一致性**：
- `smartQuoteAndWrap(text, prefix)` 参数签名在 Task 5 定义，在所有调用点（处 1-11）使用一致。
- `stripCommentPlaceholders(text)` 返回 `{ segments, hasComment }` 结构在 Task 2 定义，使用一致。
- `skippedLogic.push({ file, text, reason, line })` 结构跨三个脚本一致。
- `VueI18nReplacer` / `WxI18nReplacer` / `HtmlI18nReplacer` 类名跨 Task 1 到 Task 11 一致。

---

## 执行提示

1. **每完成一个 Task 立即 commit**，不要合并多个 Task 到一个 commit。
2. **每次 commit 前都跑一次 `node --test tests/*.test.js`** 确认无回归。
3. **如果某条 fixture 写完后发现触发的规则与预期不符**，优先检查 fixture 而不是怀疑规则——很多时候是 fixture 的构造没考虑实际脚本行为。
4. **Task 5 的 10 处替换最容易出错**——用 grep 找所有 `$t(.*escapeQuote(` 然后逐一替换，避免漏。
5. **Task 9 HTML 脚本的导入解构**可能和文档不完全一致，按实际代码灵活调整，确保 7 个新符号被引入。
6. **遇到 B5 (对象 key) 的 afterMatch 检测 `::` 排除**——`OBJECT_KEY_AFTER_REGEX` 内的 `(?!:)` 是为了排除 TypeScript 类型注解 `obj::method`，不可省略。

---

**计划完成，等待执行方式选择。**
