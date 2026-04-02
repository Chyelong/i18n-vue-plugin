# WeChat Mini Program i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WeChat Mini Program i18n replacement support to the i18n-vue plugin, handling `.wxml` and `.js` files with `global.$t()` and `{{$t['key']}}` patterns, auto-injecting Behavior, and generating runtime files.

**Architecture:** New standalone `wx-i18n-replace.js` script parallels existing `vue-i18n-replace.js` and `html-i18n-replace.js`. Reuses `shared-patterns.js` for skip rules. `i18n-init.js` gains `--type wx` mode to generate mini-program-specific runtime (`i18n.js` + `i18n-behavior.js`). Language packs use Chinese text as keys with flat JSON structure.

**Tech Stack:** Node.js, regex-based text processing, WeChat Mini Program (Page/Component/Behavior APIs)

**Spec:** `docs/superpowers/specs/2026-04-02-wx-miniprogram-i18n-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `tests/fixtures/sample.wxml` | Create | WXML test fixture with all replacement/skip scenarios |
| `tests/fixtures/sample-wx.js` | Create | Mini program JS test fixture with all replacement/skip scenarios |
| `tests/wx-replace.test.js` | Create | Unit + integration tests for wx-i18n-replace.js |
| `skills/i18n-replace/wx-i18n-replace.js` | Create | Core replacement script for .wxml + .js files |
| `skills/i18n-replace/shared-patterns.js` | Modify | Add `WX_STORAGE_REGEX` for `wx.setStorageSync`/`wx.getStorageSync` |
| `skills/i18n-init/i18n-init.js` | Modify | Add `--type wx` mode generating i18n.js + i18n-behavior.js |
| `tests/wx-init.test.js` | Create | Tests for wx init mode |
| `skills/i18n-replace/SKILL.md` | Modify | Document mini program support |
| `skills/i18n-workflow/SKILL.md` | Modify | Add wx type detection and wx-specific workflow steps |
| `agents/i18n-files.md` | Modify | Add .wxml/.wxs to scan scope |

---

### Task 1: Test Fixtures

**Files:**
- Create: `tests/fixtures/sample.wxml`
- Create: `tests/fixtures/sample-wx.js`

- [ ] **Step 1: Create WXML test fixture**

```xml
<!-- tests/fixtures/sample.wxml -->
<!-- 测试注释应该跳过 -->
<view class="container">
  <text>你好世界</text>
  <text>提交订单</text>
  <input placeholder="请输入手机号" />
  <button disabled="{{loading}}">确认支付</button>
  <view wx:if="{{status === '已完成'}}">完成</view>
  <view>共{{num}}件商品</view>
  <view>{{item.name}}</view>
  <view>{{$t['已替换']}}</view>
  <navigator url="/pages/home/home">首页</navigator>
  <wxs src="../../utils/bestime.wxs" module="computed" />
</view>
```

- [ ] **Step 2: Create mini program JS test fixture**

```js
// tests/fixtures/sample-wx.js
const app = getApp()

Page({
  data: {
    title: '订单列表'
  },
  onLoad() {
    wx.showToast({ title: '加载成功' })
    wx.setStorageSync('user_key', '存储键不翻译')
    wx.getStorageSync('cache_key')
    console.log('调试信息不翻译')
    // 注释中的中文不翻译
    const status = item.status === '已完成' ? '完成' : '进行中'
    const path = require('../../utils/common.js')
    wx.showModal({
      title: '提示',
      content: '确认删除吗？',
      confirmText: '确定',
      cancelText: '取消'
    })
    const msg = `共${this.data.count}件商品`
  }
})
```

- [ ] **Step 3: Verify fixtures are valid**

Run: `node -e "const fs=require('fs'); console.log('wxml:', fs.readFileSync('tests/fixtures/sample.wxml','utf-8').length, 'bytes'); console.log('wx.js:', fs.readFileSync('tests/fixtures/sample-wx.js','utf-8').length, 'bytes')"`
Expected: Both files exist with non-zero size

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/sample.wxml tests/fixtures/sample-wx.js
git commit -m "test: add WeChat mini program test fixtures"
```

---

### Task 2: Extend shared-patterns.js

**Files:**
- Modify: `skills/i18n-replace/shared-patterns.js`
- Test: `tests/vue-replace.test.js` (existing shared-patterns tests)

- [ ] **Step 1: Write failing test for new wx storage pattern**

Add to `tests/vue-replace.test.js` in the `shared-patterns.js` describe block:

```js
it('WX_STORAGE_REGEX matches wx storage APIs', () => {
  assert.ok(sp.WX_STORAGE_REGEX.test('wx.setStorageSync('));
  assert.ok(sp.WX_STORAGE_REGEX.test('wx.getStorageSync('));
  assert.ok(sp.WX_STORAGE_REGEX.test('wx.setStorage({key: '));
  assert.ok(!sp.WX_STORAGE_REGEX.test('wx.showToast('));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/vue-replace.test.js`
Expected: FAIL — `sp.WX_STORAGE_REGEX` is undefined

- [ ] **Step 3: Add WX_STORAGE_REGEX to shared-patterns.js**

Add before `module.exports`:

```js
// 微信小程序存储 API key
const WX_STORAGE_REGEX = /wx\s*\.\s*(?:set|get|remove)Storage(?:Sync)?\s*\(\s*(?:\{\s*key\s*:\s*)?$/;
```

Update `module.exports`:

```js
module.exports = {
  SWITCH_CASE_REGEX,
  BRACKET_ACCESS_REGEX,
  INDEX_MATCH_REGEX,
  STORAGE_KEY_REGEX_BASE,
  WX_STORAGE_REGEX,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/vue-replace.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add skills/i18n-replace/shared-patterns.js tests/vue-replace.test.js
git commit -m "feat: add WX_STORAGE_REGEX to shared-patterns"
```

---

### Task 3: wx-i18n-replace.js — Core Replacement Script

**Files:**
- Create: `skills/i18n-replace/wx-i18n-replace.js`

This is the largest task. The script follows the same architecture as `html-i18n-replace.js` (class with `processWxml`, `processScript`, `processFile`, `processDirectory`, CLI entry) but with wx-specific logic:

- WXML: Chinese text → `{{$t['中文']}}`, attributes → `{{$t['中文']}}`
- JS: Chinese string → `global.$t('中文')`
- Auto-inject Behavior into `.js` files whose corresponding `.wxml` had replacements
- Skip: comments, console, require/import, wx directives expressions, wx storage keys, comparison operators, switch/case, bracket access, indexOf/includes

- [ ] **Step 1: Create wx-i18n-replace.js with class structure and WXML processing**

Create `skills/i18n-replace/wx-i18n-replace.js` with the full implementation. Key design decisions matching existing patterns:

```js
#!/usr/bin/env node
/**
 * 微信小程序 i18n 中文替换脚本
 * 扫描 .wxml 和 .js 文件中的中文文本，进行 i18n 替换
 *
 * 替换规则：
 * - .wxml 标签文本：'中文' → {{$t['中文']}}
 * - .wxml 属性：attr="中文" → attr="{{$t['中文']}}"
 * - .js 字符串：'中文' → global.$t('中文')
 *
 * 用法：
 *   node wx-i18n-replace.js <file|directory> [options]
 *
 * 选项：
 *   --dry-run     只预览，不修改文件
 *   --i18n-dir    i18n 目录路径 (默认: ./i18n)
 *   --lang        目标语言 (默认: tw)
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  i18nDir: './i18n',
  lang: 'tw'
};

// 支持的文件后缀
const WXML_EXTS = ['.wxml'];
const JS_EXTS = ['.js'];

// 匹配是否包含中文
const HAS_CHINESE = /[\u4e00-\u9fa5]/;

// 匹配需要处理的中文字符串
const CHINESE_STRING_REGEX = /(['"`])((?:(?!\1).)*[\u4e00-\u9fa5]+(?:(?!\1).)*?)(\1)/g;

// 已经被 i18n 包裹的模式
const ALREADY_I18N = /\$t\s*[\[(']|global\.\$t/;

// WXML 中需要跳过的属性
const SKIP_ATTRS = [
  'class', 'id', 'style', 'wx:if', 'wx:elif', 'wx:else',
  'wx:for', 'wx:for-item', 'wx:for-index', 'wx:key',
  'wx:ref', 'src', 'url', 'open-type', 'hover-class',
  'bindtap', 'catchtap', 'bindinput', 'bindchange',
  'bindsubmit', 'bindscroll', 'bindload', 'binderror',
  'bindtouchstart', 'bindtouchmove', 'bindtouchend',
  'bindlongpress', 'bindconfirm', 'bindfocus', 'bindblur',
  'data-key', 'data-id', 'data-type', 'data-uid', 'data-index',
  'mode', 'type', 'name', 'value', 'hidden'
];

// data-* 业务属性跳过（但 data-i18n 除外）
const SKIP_DATA_ATTR_REGEX = /^data-(?!i18n)/;

// ===== 高危场景跳过规则 =====
const {
  SWITCH_CASE_REGEX,
  BRACKET_ACCESS_REGEX,
  INDEX_MATCH_REGEX,
  STORAGE_KEY_REGEX_BASE,
  WX_STORAGE_REGEX,
} = require('./shared-patterns');

class WxI18nReplacer {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.i18nDir = options.i18nDir || DEFAULT_CONFIG.i18nDir;
    this.lang = options.lang || DEFAULT_CONFIG.lang;
    this.exclude = options.exclude || [];
    this.extractedTexts = new Set();
    this.skippedLogic = [];
    this.currentFile = '';
    this.wxmlReplacedFiles = new Set(); // .wxml files that had replacements
  }

  shouldSkip(text, context) {
    if (ALREADY_I18N.test(context)) return true;
    if (!HAS_CHINESE.test(text)) return true;
    if (/^\s*\/\/|^\s*\/\*|\*\/\s*$|<!--/.test(context)) return true;
    return false;
  }

  recordText(text) {
    const trimmed = text.trim();
    if (!trimmed || !HAS_CHINESE.test(trimmed)) return;

    if (/<[^>]+>|\$\{[^}]+\}/.test(trimmed)) {
      const parts = trimmed.split(/<[^>]+>|\$\{[^}]+\}/);
      for (const part of parts) {
        const partTrimmed = part.trim();
        if (partTrimmed && HAS_CHINESE.test(partTrimmed)) {
          this.extractedTexts.add(partTrimmed);
        }
      }
    } else {
      this.extractedTexts.add(trimmed);
    }
  }

  escapeQuote(text) {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"');
  }

  // ==================== WXML 处理 ====================

  processWxml(content) {
    let result = content;

    // 第零步：保护注释
    const comments = [];
    let commentIdx = 0;
    result = result.replace(/<!--[\s\S]*?-->/g, (match) => {
      comments.push(match);
      return `__HTML_COMMENT_${commentIdx++}__`;
    });

    // 第一步：处理 {{ }} 插值内部的字符串
    result = result.replace(/\{\{([\s\S]*?)\}\}/g, (match, code) => {
      if (ALREADY_I18N.test(code)) return match;
      if (!HAS_CHINESE.test(code)) return match;

      let hasChange = false;
      const newCode = code.replace(CHINESE_STRING_REGEX, (strMatch, quote, text, _endQuote, offset) => {
        if (ALREADY_I18N.test(text)) return strMatch;

        const beforeStr = code.substring(0, offset);
        if (/(===?|!==?|<=?|>=?)\s*$/.test(beforeStr) && !/=>\s*$/.test(beforeStr)) {
          return strMatch;
        }

        this.recordText(text);
        hasChange = true;
        return `$t['${this.escapeQuote(text)}']`;
      });

      return hasChange ? `{{${newCode}}}` : match;
    });

    // 第二步：处理静态属性中的中文 attr="中文"
    result = result.replace(/([\s<])(\w[\w-]*)="([^"]*[\u4e00-\u9fa5]+[^"]*)"/g, (match, prefix, attr, value) => {
      if (SKIP_ATTRS.includes(attr)) return match;
      if (attr.startsWith('bind') || attr.startsWith('catch') || attr.startsWith('mut-bind')) return match;
      if (SKIP_DATA_ATTR_REGEX.test(attr)) return match;
      if (this.shouldSkip(value, match)) return match;

      this.recordText(value);
      return `${prefix}${attr}="{{$t['${this.escapeQuote(value)}']}}"`;
    });

    // 第三步：处理标签间的静态文本
    result = result.replace(/>([^<]*[\u4e00-\u9fa5]+[^<]*)</g, (match, text) => {
      if (ALREADY_I18N.test(text)) return match;
      if (!HAS_CHINESE.test(text)) return match;

      const trimmed = text.trim();
      if (!trimmed) return match;

      // 包含引号，疑似代码，跳过
      if (text.includes('"') || text.includes("'")) return match;

      // 包含 {{ }}，分段处理
      if (/\{\{[\s\S]*?\}\}/.test(text)) {
        const processed = this.processMixedText(text);
        return `>${processed}<`;
      }

      this.recordText(trimmed);

      const leadingSpace = text.match(/^\s*/)[0];
      const trailingSpace = text.match(/\s*$/)[0];

      return `>${leadingSpace}{{$t['${this.escapeQuote(trimmed)}']}}${trailingSpace}<`;
    });

    // 还原注释
    result = result.replace(/__HTML_COMMENT_(\d+)__/g, (_, i) => comments[parseInt(i)]);

    return result;
  }

  processMixedText(text) {
    const parts = [];
    let lastIndex = 0;
    const interpolationRegex = /\{\{[\s\S]*?\}\}/g;
    let m;

    while ((m = interpolationRegex.exec(text)) !== null) {
      if (m.index > lastIndex) {
        parts.push({ type: 'text', value: text.slice(lastIndex, m.index) });
      }
      parts.push({ type: 'interpolation', value: m[0] });
      lastIndex = m.index + m[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({ type: 'text', value: text.slice(lastIndex) });
    }

    const processedParts = parts.map(part => {
      if (part.type === 'interpolation') {
        return part.value;
      } else {
        const trimmedPart = part.value.trim();
        if (!trimmedPart || !HAS_CHINESE.test(trimmedPart)) {
          return part.value;
        }
        if (ALREADY_I18N.test(part.value)) return part.value;

        this.recordText(trimmedPart);
        const partLeading = part.value.match(/^\s*/)[0];
        const partTrailing = part.value.match(/\s*$/)[0];
        return `${partLeading}{{$t['${this.escapeQuote(trimmedPart)}']}}${partTrailing}`;
      }
    });

    return processedParts.join('');
  }

  // ==================== JS 处理 ====================

  processScript(script) {
    const lines = script.split('\n');
    let inBlockComment = false;
    const processedLines = lines.map(line => {
      if (inBlockComment) {
        if (/\*\//.test(line)) inBlockComment = false;
        return line;
      }
      if (/\/\*/.test(line) && !/\*\//.test(line)) {
        inBlockComment = true;
        return line;
      }

      if (/^\s*(import\s+|.*require\s*\()/.test(line)) return line;
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) return line;
      if (/^\s*console\s*\.\s*(log|warn|error|info|debug)\s*\(/.test(line)) return line;

      return line.replace(CHINESE_STRING_REGEX, (match, quote, text, _endQuote) => {
        if (this.shouldSkip(text, match)) return match;

        const matchIndex = line.indexOf(match);
        const beforeMatch = line.substring(0, matchIndex);

        // 比较运算符
        if (/(===?|!==?|<=?|>=?)\s*$/.test(beforeMatch) && !/=>\s*$/.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '比较运算符后的逻辑值', line: line.trim() });
          return match;
        }

        // 高危场景跳过
        if (SWITCH_CASE_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'switch/case 逻辑值', line: line.trim() });
          return match;
        }
        if (BRACKET_ACCESS_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '方括号属性访问', line: line.trim() });
          return match;
        }
        if (STORAGE_KEY_REGEX_BASE.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '存储键（localStorage）', line: line.trim() });
          return match;
        }
        if (WX_STORAGE_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '存储键（wx.setStorageSync）', line: line.trim() });
          return match;
        }
        if (INDEX_MATCH_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'indexOf/includes 匹配值', line: line.trim() });
          return match;
        }

        // 模板字符串含变量
        if (quote === '`' && /\$\{/.test(text)) {
          return this.processTemplateString(match, text);
        }

        this.recordText(text);
        return `global.$t('${this.escapeQuote(text)}')`;
      });
    });

    return processedLines.join('\n');
  }

  processTemplateString(match, text) {
    const varMappings = [];
    const cleanText = text.replace(/\$\{([^}]+)\}/g, (_, expr) => {
      let trimmedExpr = expr.trim();
      let safeKey = trimmedExpr.replace(/[^\w]/g, '_').replace(/_+/g, '_').replace(/(^_+|_+$)/g, '');

      if (HAS_CHINESE.test(trimmedExpr)) {
        trimmedExpr = trimmedExpr.replace(CHINESE_STRING_REGEX, (strMatch, quote, strText, _, offset) => {
          const beforeStr = trimmedExpr.substring(0, offset);
          if (/(===?|!==?|<=?|>=?)\s*$/.test(beforeStr) && !/=>\s*$/.test(beforeStr)) return strMatch;
          this.recordText(strText);
          return `global.$t(${quote}${this.escapeQuote(strText)}${quote})`;
        });
      }

      if (!safeKey) safeKey = 'var_' + Math.random().toString(36).slice(2, 5);
      varMappings.push({ expr: trimmedExpr, key: safeKey });
      return `{${safeKey}}`;
    });

    const normalizedText = cleanText.replace(/\s+/g, ' ').trim();

    if (/[\u4e00-\u9fa5]/.test(normalizedText)) {
      this.extractedTexts.add(normalizedText);
    }

    if (!/[\u4e00-\u9fa5]/.test(normalizedText)) {
      if (varMappings.length === 1) return `(${varMappings[0].expr})`;
      return varMappings.map(m => `(${m.expr})`).join(' + ');
    }

    if (varMappings.length === 0) {
      const normalizedOriginal = text.replace(/\s+/g, ' ').trim();
      return `global.$t('${this.escapeQuote(normalizedOriginal)}')`;
    }

    const params = varMappings.map(m => `'${m.key}': ${m.expr}`).join(', ');
    return `global.$t('${this.escapeQuote(normalizedText)}', { ${params} })`;
  }

  // ==================== Behavior 注入 ====================

  injectBehavior(jsContent, jsFilePath) {
    const behaviorRelPath = path.relative(
      path.dirname(jsFilePath),
      path.join(this.i18nDir, 'i18n-behavior.js')
    ).replace(/\\/g, '/');

    const requireLine = `const i18nBehavior = require('${behaviorRelPath.startsWith('.') ? behaviorRelPath : './' + behaviorRelPath}')`;

    // 已经注入过
    if (jsContent.includes('i18nBehavior')) return jsContent;

    let result = jsContent;

    // 在文件顶部（第一个非注释/非空行之前或 require 块之后）插入 require
    const lines = result.split('\n');
    let insertIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') || line === '' || line.startsWith('import ') || line.includes('require(')) {
        insertIdx = i + 1;
      } else {
        break;
      }
    }
    lines.splice(insertIdx, 0, requireLine);
    result = lines.join('\n');

    // 在 Page({ 或 Component({ 内添加 behaviors
    result = result.replace(/(Page|Component)\s*\(\s*\{/g, (match, type) => {
      return `${match}\n  behaviors: [i18nBehavior],`;
    });

    // 如果已有 behaviors 数组，追加（替代上面的逻辑）
    // 先检查是否已添加（上面可能在已有 behaviors 的情况下重复添加）
    if (/behaviors\s*:\s*\[/.test(jsContent)) {
      // 回退：不用上面的替换，改用追加逻辑
      result = jsContent;
      const linesAgain = result.split('\n');
      linesAgain.splice(insertIdx, 0, requireLine);
      result = linesAgain.join('\n');

      result = result.replace(/behaviors\s*:\s*\[([^\]]*)\]/g, (match, existing) => {
        if (existing.includes('i18nBehavior')) return match;
        const trimmed = existing.trim();
        if (trimmed) {
          return `behaviors: [${trimmed}, i18nBehavior]`;
        }
        return `behaviors: [i18nBehavior]`;
      });
    }

    return result;
  }

  // ==================== 文件处理 ====================

  async processFile(filePath) {
    console.log(`处理文件: ${filePath}`);
    this.currentFile = filePath;

    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    let processed;
    if (WXML_EXTS.includes(ext)) {
      processed = this.processWxml(content);
      if (content !== processed) {
        this.wxmlReplacedFiles.add(filePath);
      }
    } else if (JS_EXTS.includes(ext)) {
      processed = this.processScript(content);
    } else {
      return;
    }

    if (content !== processed) {
      if (this.dryRun) {
        this.showDiff(content, processed, filePath);
      } else {
        fs.writeFileSync(filePath, processed, 'utf-8');
        console.log(`[已修改] ${filePath}`);
      }
    }
  }

  async processDirectory(dirPath) {
    let files;
    try {
      files = fs.readdirSync(dirPath);
    } catch (e) {
      console.warn(`[跳过] 无法读取目录: ${dirPath} (${e.code || e.message})`);
      return;
    }

    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      let stats;
      try {
        stats = fs.lstatSync(fullPath);
      } catch (e) {
        console.warn(`[跳过] 无法访问: ${fullPath} (${e.code || e.message})`);
        continue;
      }

      if (stats.isSymbolicLink()) continue;

      if (stats.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'miniprogram_npm' && file !== 'dist' && file !== 'build') {
        if (this.exclude.some(pattern => file === pattern || fullPath.includes(pattern))) continue;
        await this.processDirectory(fullPath);
      } else {
        if (this.exclude.some(pattern => file === pattern || fullPath.includes(pattern))) continue;
        if (file.endsWith('.min.js')) continue;
        const ext = path.extname(file).toLowerCase();
        if (WXML_EXTS.includes(ext) || JS_EXTS.includes(ext)) {
          await this.processFile(fullPath);
        }
      }
    }
  }

  async process(targetPath) {
    const stats = fs.statSync(targetPath);

    if (stats.isDirectory()) {
      await this.processDirectory(targetPath);
    } else if (stats.isFile()) {
      const ext = path.extname(targetPath).toLowerCase();
      if (WXML_EXTS.includes(ext) || JS_EXTS.includes(ext)) {
        await this.processFile(targetPath);
      }
    }

    // 对有替换的 wxml 对应的 js 文件注入 Behavior
    if (!this.dryRun) {
      for (const wxmlPath of this.wxmlReplacedFiles) {
        const jsPath = wxmlPath.replace(/\.wxml$/, '.js');
        if (fs.existsSync(jsPath)) {
          const jsContent = fs.readFileSync(jsPath, 'utf-8');
          const injected = this.injectBehavior(jsContent, jsPath);
          if (jsContent !== injected) {
            fs.writeFileSync(jsPath, injected, 'utf-8');
            console.log(`[Behavior 注入] ${jsPath}`);
          }
        }
      }
    }
  }

  showDiff(original, processed, filePath) {
    const origLines = original.split('\n');
    const procLines = processed.split('\n');
    const maxLen = Math.max(origLines.length, procLines.length);
    let diffCount = 0;

    console.log(`[预览] 将修改: ${filePath}`);
    console.log('---');
    for (let i = 0; i < maxLen && diffCount < 15; i++) {
      if (origLines[i] !== procLines[i]) {
        console.log(`  L${i + 1}:`);
        if (origLines[i] !== undefined) console.log(`  - ${origLines[i]}`);
        if (procLines[i] !== undefined) console.log(`  + ${procLines[i]}`);
        diffCount++;
      }
    }
    if (diffCount >= 15) console.log(`  ... 还有更多变更`);
    console.log('');
  }

  // ==================== 语言包 ====================

  readLangFile(lang) {
    const filePath = path.join(this.i18nDir, `${lang}.json`);
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch (e) {
        console.warn(`[警告] 无法解析 ${filePath}: ${e.message}`);
        return {};
      }
    }
    return {};
  }

  writeLangFile(lang, data) {
    const filePath = path.join(this.i18nDir, `${lang}.json`);
    if (!fs.existsSync(this.i18nDir)) {
      fs.mkdirSync(this.i18nDir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[已写入] ${filePath} (${Object.keys(data).length} 条翻译)`);
  }

  saveExtractedTexts() {
    const texts = Array.from(this.extractedTexts);

    if (texts.length === 0) {
      console.log('\n没有需要处理的中文文本');
      return;
    }

    console.log(`\n=== 翻译文件处理 ===`);
    console.log(`共 ${texts.length} 条中文文本`);

    const existingTranslations = this.readLangFile(this.lang);
    const newTexts = texts.filter(text => !(text in existingTranslations));

    if (newTexts.length === 0) {
      console.log('所有文本已存在于翻译文件中');
      return;
    }

    if (this.dryRun) {
      console.log(`[预览模式] 将添加 ${newTexts.length} 条新文本:`);
      newTexts.slice(0, 10).forEach(t => console.log(`  "${t}": ""`));
      if (newTexts.length > 10) console.log(`  ... 还有 ${newTexts.length - 10} 条`);
      return;
    }

    for (const text of newTexts) {
      existingTranslations[text] = '';
    }

    this.writeLangFile(this.lang, existingTranslations);
    console.log(`已添加 ${newTexts.length} 条新文本（翻译值留空）`);
  }

  outputSummary() {
    const texts = Array.from(this.extractedTexts);
    console.log('\n=== 提取摘要 ===');
    console.log(`共提取 ${texts.length} 条中文文本`);

    if (texts.length > 0 && texts.length <= 20) {
      console.log('\n文本列表:');
      texts.forEach(t => console.log(`  "${t}"`));
    } else if (texts.length > 20) {
      console.log('\n前 20 条:');
      texts.slice(0, 20).forEach(t => console.log(`  "${t}"`));
      console.log(`  ... 还有 ${texts.length - 20} 条`);
    }

    if (this.skippedLogic.length > 0) {
      console.log(`\n⚠️  跳过的高危逻辑值（${this.skippedLogic.length} 处）：`);
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

    if (this.wxmlReplacedFiles.size > 0) {
      console.log(`\n=== Behavior 注入 ===`);
      console.log(`${this.wxmlReplacedFiles.size} 个 .wxml 文件有替换，对应 .js 文件已注入 Behavior`);
    }
  }
}

// CLI 入口
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
微信小程序 i18n 中文替换工具

用法：
  node wx-i18n-replace.js <file|directory> [options]

选项：
  --dry-run       只预览，不修改文件
  --i18n-dir      i18n 目录路径 (默认: ./i18n)
  --lang          目标语言 (默认: tw)
  --exclude       排除的目录或文件，逗号分隔

替换规则：
  WXML 文本：  <text>中文</text>  →  <text>{{$t['中文']}}</text>
  WXML 属性：  placeholder="中文"  →  placeholder="{{$t['中文']}}"
  JS 代码：    '中文'  →  global.$t('中文')

示例：
  node wx-i18n-replace.js ./pages --dry-run
  node wx-i18n-replace.js ./pages --i18n-dir ./i18n --lang tw
`);
    process.exit(0);
  }

  const targetPath = args[0];

  const getArgValue = (flag, defaultValue) => {
    const index = args.indexOf(flag);
    if (index === -1) return defaultValue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      console.error(`错误: ${flag} 参数缺少值`);
      process.exit(1);
    }
    return value;
  };

  const excludeStr = getArgValue('--exclude', '');
  const options = {
    dryRun: args.includes('--dry-run'),
    i18nDir: getArgValue('--i18n-dir', DEFAULT_CONFIG.i18nDir),
    lang: getArgValue('--lang', DEFAULT_CONFIG.lang),
    exclude: excludeStr ? excludeStr.split(',').map(s => s.trim()) : []
  };

  if (!fs.existsSync(targetPath)) {
    console.error(`错误: 路径不存在 - ${targetPath}`);
    process.exit(1);
  }

  // 校验 i18n 目录（dry-run 跳过）
  if (!options.dryRun) {
    const i18nJs = path.join(options.i18nDir, 'i18n.js');
    if (!fs.existsSync(options.i18nDir) || !fs.existsSync(i18nJs)) {
      console.error(`错误: i18n 目录未初始化 - ${options.i18nDir}`);
      console.error(`请先运行: node i18n-init.js ${options.i18nDir} --type wx`);
      process.exit(1);
    }
  }

  console.log(`\n微信小程序 i18n 替换工具`);
  console.log(`目标: ${targetPath}`);
  console.log(`i18n 目录: ${options.i18nDir}`);
  console.log(`目标语言: ${options.lang}`);
  console.log(`模式: ${options.dryRun ? '预览 (dry-run)' : '替换'}`);
  console.log('');

  const replacer = new WxI18nReplacer(options);
  await replacer.process(targetPath);
  replacer.saveExtractedTexts();
  replacer.outputSummary();
}

// 导出供测试使用
module.exports = { WxI18nReplacer };

main().catch(console.error);
```

- [ ] **Step 2: Verify script loads without errors**

Run: `node -e "const { WxI18nReplacer } = require('./skills/i18n-replace/wx-i18n-replace.js'); console.log('OK')" 2>&1 || true`

Note: The script's `main()` will run and print help (no args), which is fine. Check there are no require errors.

- [ ] **Step 3: Commit**

```bash
git add skills/i18n-replace/wx-i18n-replace.js
git commit -m "feat: add wx-i18n-replace.js core replacement script"
```

---

### Task 4: Tests for wx-i18n-replace.js

**Files:**
- Create: `tests/wx-replace.test.js`

- [ ] **Step 1: Write tests**

```js
// tests/wx-replace.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const fixturePath = path.join(__dirname, 'fixtures', 'sample.wxml');
const fixtureJsPath = path.join(__dirname, 'fixtures', 'sample-wx.js');
const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');
const fixtureJsContent = fs.readFileSync(fixtureJsPath, 'utf-8');

describe('WxI18nReplacer fixtures', () => {
  it('wxml fixture file exists and has content', () => {
    assert.ok(fixtureContent.length > 0);
    assert.ok(fixtureContent.includes('你好世界'));
  });

  it('js fixture file exists and has content', () => {
    assert.ok(fixtureJsContent.length > 0);
    assert.ok(fixtureJsContent.includes('订单列表'));
  });

  it('wxml fixture contains skip scenarios', () => {
    assert.ok(fixtureContent.includes('wx:if'), 'missing wx:if');
    assert.ok(fixtureContent.includes('{{item.name}}'), 'missing data binding');
    assert.ok(fixtureContent.includes("$t['已替换']"), 'missing already-replaced');
  });

  it('js fixture contains skip scenarios', () => {
    assert.ok(fixtureJsContent.includes('wx.setStorageSync'), 'missing wx storage');
    assert.ok(fixtureJsContent.includes("console.log"), 'missing console');
    assert.ok(fixtureJsContent.includes("require("), 'missing require');
    assert.ok(fixtureJsContent.includes("=== '已完成'"), 'missing comparison');
  });
});

describe('WxI18nReplacer WXML processing', () => {
  // Load module without running main()
  let WxI18nReplacer;
  it('module loads', () => {
    ({ WxI18nReplacer } = require('../skills/i18n-replace/wx-i18n-replace'));
    assert.ok(WxI18nReplacer);
  });

  it('replaces plain text in tags', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processWxml('<text>你好世界</text>');
    assert.ok(result.includes("{{$t['你好世界']}}"), `Got: ${result}`);
  });

  it('replaces attribute values', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processWxml('<input placeholder="请输入手机号" />');
    assert.ok(result.includes("placeholder=\"{{$t['请输入手机号']}}\""), `Got: ${result}`);
  });

  it('skips wx:if expressions', () => {
    const replacer = new WxI18nReplacer();
    const input = '<view wx:if="{{status === \'已完成\'}}">完成</view>';
    const result = replacer.processWxml(input);
    // wx:if value should not be replaced, but "完成" text should be
    assert.ok(!result.includes("wx:if=\"{{$t"), `wx:if should not be replaced: ${result}`);
    assert.ok(result.includes("{{$t['完成']}}"), `Text should be replaced: ${result}`);
  });

  it('skips already wrapped content', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processWxml("<view>{{$t['已替换']}}</view>");
    assert.ok(result.includes("{{$t['已替换']}}"), 'Should keep existing');
    assert.ok(!result.includes("$t[$t"), 'Should not double-wrap');
  });

  it('skips comments', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processWxml('<!-- 这是注释 --><text>你好</text>');
    assert.ok(result.includes('<!-- 这是注释 -->'), 'Comment should be preserved');
    assert.ok(result.includes("{{$t['你好']}}"), 'Text should be replaced');
  });

  it('handles mixed text with interpolation', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processWxml('<view>共{{num}}件商品</view>');
    assert.ok(result.includes("$t['共']") || result.includes("$t['件商品']"), `Mixed text should be split: ${result}`);
  });
});

describe('WxI18nReplacer JS processing', () => {
  let WxI18nReplacer;
  it('module loads', () => {
    ({ WxI18nReplacer } = require('../skills/i18n-replace/wx-i18n-replace'));
  });

  it('replaces string literals with global.$t', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processScript("wx.showToast({ title: '加载成功' })");
    assert.ok(result.includes("global.$t('加载成功')"), `Got: ${result}`);
  });

  it('skips console.log', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processScript("console.log('调试信息')");
    assert.equal(result, "console.log('调试信息')");
  });

  it('skips require paths', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processScript("const a = require('../../utils/工具.js')");
    assert.ok(!result.includes("global.$t"), `Should not replace require: ${result}`);
  });

  it('skips comparison operators', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processScript("if (status === '已完成') {}");
    assert.ok(!result.includes("global.$t('已完成')"), `Should skip comparison: ${result}`);
  });

  it('skips wx storage keys', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processScript("wx.setStorageSync('缓存键', data)");
    assert.ok(!result.includes("global.$t('缓存键')"), `Should skip wx storage: ${result}`);
  });

  it('skips comments', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processScript("// 这是注释");
    assert.equal(result, "// 这是注释");
  });

  it('handles template strings with variables', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processScript("const msg = `共${count}件`");
    assert.ok(result.includes("global.$t("), `Should handle template string: ${result}`);
  });
});

describe('WxI18nReplacer dry-run integration', () => {
  it('processes sample.wxml without crashing', () => {
    const { execSync } = require('child_process');
    const result = execSync(
      `node skills/i18n-replace/wx-i18n-replace.js tests/fixtures/sample.wxml --dry-run --i18n-dir tests/fixtures`,
      { encoding: 'utf-8', cwd: path.join(__dirname, '..') }
    );
    assert.ok(!result.includes('ReferenceError'), 'Should not throw');
    assert.ok(result.length > 0, 'Should produce output');
  });

  it('processes sample-wx.js without crashing', () => {
    const { execSync } = require('child_process');
    const result = execSync(
      `node skills/i18n-replace/wx-i18n-replace.js tests/fixtures/sample-wx.js --dry-run --i18n-dir tests/fixtures`,
      { encoding: 'utf-8', cwd: path.join(__dirname, '..') }
    );
    assert.ok(!result.includes('ReferenceError'), 'Should not throw');
    assert.ok(result.length > 0, 'Should produce output');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `node --test tests/wx-replace.test.js`
Expected: ALL PASS

- [ ] **Step 3: Fix any failures, re-run until all pass**

- [ ] **Step 4: Commit**

```bash
git add tests/wx-replace.test.js
git commit -m "test: add wx-i18n-replace unit and integration tests"
```

---

### Task 5: Add --type wx to i18n-init.js

**Files:**
- Modify: `skills/i18n-init/i18n-init.js`
- Create: `tests/wx-init.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/wx-init.test.js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('i18n-init --type wx', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-wx-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates wx runtime files', () => {
    const { execSync } = require('child_process');
    const targetDir = path.join(tmpDir, 'i18n');
    execSync(
      `node skills/i18n-init/i18n-init.js "${targetDir}" --type wx --langs tw`,
      { encoding: 'utf-8', cwd: path.join(__dirname, '..') }
    );

    // Check i18n.js exists and contains global.$t
    const i18nJs = fs.readFileSync(path.join(targetDir, 'i18n.js'), 'utf-8');
    assert.ok(i18nJs.includes('global.$t'), 'i18n.js should have global.$t');
    assert.ok(i18nJs.includes('global._i18nLang'), 'i18n.js should have global._i18nLang');
    assert.ok(i18nJs.includes('loadRemoteLocale'), 'i18n.js should have loadRemoteLocale');
    assert.ok(i18nJs.includes("require('./tw.json')"), 'i18n.js should require local tw.json');

    // Check i18n-behavior.js exists
    const behaviorJs = fs.readFileSync(path.join(targetDir, 'i18n-behavior.js'), 'utf-8');
    assert.ok(behaviorJs.includes('Behavior'), 'should export Behavior');
    assert.ok(behaviorJs.includes('$t'), 'should inject $t');
    assert.ok(behaviorJs.includes('global._i18nLang'), 'should read from global._i18nLang');

    // Check tw.json exists
    assert.ok(fs.existsSync(path.join(targetDir, 'tw.json')), 'tw.json should exist');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/wx-init.test.js`
Expected: FAIL — wx type not yet implemented

- [ ] **Step 3: Add wx template and type handling to i18n-init.js**

Add the wx template string before the `I18nInitializer` class (after the browser template closing backtick+semicolon around line 831):

```js
// 微信小程序版本
const I18N_WX_TEMPLATE = `/**
 * i18n 国际化模块 (微信小程序版本)
 * 基准语言：中文简体
 * 翻译函数挂载到 global 对象
 */

const localLang = require('./{{defaultLang}}.json')
global._i18nLang = localLang
global._i18nLocale = '{{defaultLang}}'

/**
 * 翻译函数
 * @param {string} key - 中文原文
 * @param {object} params - 插值参数
 * @returns {string} 翻译后的文本
 */
global.$t = function(key, params) {
  var text = global._i18nLang[key] || key
  if (!params) return text
  return text.replace(/\\{(\\w+)\\}/g, function(match, k) {
    return params.hasOwnProperty(k) ? params[k] : match
  })
}

/**
 * 从云端加载语言包
 * @param {string} url - 语言包 JSON 的 URL
 * @param {string} locale - 语言标识
 * @returns {Promise}
 */
global.loadRemoteLocale = function(url, locale) {
  return new Promise(function(resolve, reject) {
    wx.request({
      url: url,
      success: function(res) {
        global._i18nLang = res.data
        global._i18nLocale = locale || '{{defaultLang}}'
        resolve(res.data)
      },
      fail: reject
    })
  })
}
`;

const I18N_WX_BEHAVIOR_TEMPLATE = `/**
 * i18n Behavior
 * 自动将翻译数据注入到页面/组件的 data 中
 * 在 WXML 中通过 {{$t['key']}} 访问
 */
module.exports = Behavior({
  attached: function() {
    this.setData({ $t: global._i18nLang })
  }
})
`;
```

In the `generateI18nFile` method, add the `wx` case in the switch statement:

```js
case 'wx':
  template = I18N_WX_TEMPLATE;
  filename = 'i18n.js';
  break;
```

And replace the `{{defaultLang}}` placeholder:

```js
const content = template
  .replace(/\{\{langKeys\}\}/g, langKeys)
  .replace(/\{\{langList\}\}/g, langList)
  .replace(/\{\{defaultLang\}\}/g, this.langs[0] || 'tw');
```

Add a new method to generate the behavior file, called from `init()` when type is `wx`:

```js
generateBehaviorFile(dir) {
  const filePath = path.join(dir, 'i18n-behavior.js');
  fs.writeFileSync(filePath, I18N_WX_BEHAVIOR_TEMPLATE, 'utf-8');
  console.log(`生成: i18n-behavior.js`);
}
```

In the `init()` method, after `this.generateI18nFile(targetDir)`, add:

```js
if (this.type === 'wx') {
  this.generateBehaviorFile(targetDir);
}
```

Update the CLI help text to include `wx` in the type list.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/wx-init.test.js`
Expected: ALL PASS

- [ ] **Step 5: Run all existing tests to check no regression**

Run: `node --test tests/*.test.js`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add skills/i18n-init/i18n-init.js tests/wx-init.test.js
git commit -m "feat: add --type wx mode to i18n-init"
```

---

### Task 6: Update SKILL.md Documentation

**Files:**
- Modify: `skills/i18n-replace/SKILL.md`

- [ ] **Step 1: Add mini program section to SKILL.md**

After the existing "支持两种项目类型" section, add:

```markdown
- **微信小程序**：`.wxml`/`.js` 文件 → `global.$t()` / `{{$t['key']}}`，自动注入 Behavior
```

Add to the 参数 table:

```markdown
| --type | 项目类型 (自动检测: vue/browser/wx) | 自动 |
```

Add a new section after the existing replacement rules:

```markdown
### 微信小程序替换规则

| 场景 | 替换前 | 替换后 |
|------|--------|--------|
| WXML 文本 | `<text>中文</text>` | `<text>{{$t['中文']}}</text>` |
| WXML 属性 | `placeholder="中文"` | `placeholder="{{$t['中文']}}"` |
| JS 代码 | `'中文'` | `global.$t('中文')` |

使用方式：
\`\`\`bash
node skills/i18n-replace/wx-i18n-replace.js ./pages --i18n-dir ./i18n --lang tw
\`\`\`
```

- [ ] **Step 2: Commit**

```bash
git add skills/i18n-replace/SKILL.md
git commit -m "docs: add WeChat mini program support to i18n-replace SKILL.md"
```

---

### Task 7: Update i18n-workflow SKILL.md

**Files:**
- Modify: `skills/i18n-workflow/SKILL.md`

- [ ] **Step 1: Add wx detection logic to workflow**

In the `## 工作流程` section, update the detect step description to include:

```
wx: 存在 app.json 且不存在 package.json 中的 vue 依赖
```

Add step 3 variant for wx:

```
3. (wx) 调用 wx-i18n-replace.js 替换中文 + 自动注入 Behavior
```

In the `## 参数` table, update the `--type` row:

```
| --type | 项目类型: vue, browser, wx | 自动检测 |
```

- [ ] **Step 2: Commit**

```bash
git add skills/i18n-workflow/SKILL.md
git commit -m "docs: add wx type support to i18n-workflow"
```

---

### Task 8: Update agents/i18n-files.md

**Files:**
- Modify: `agents/i18n-files.md`

- [ ] **Step 1: Add .wxml to scan scope**

In the agent description, add `.wxml` to the list of supported file extensions alongside `.vue`, `.html`, `.js`, `.ts`. Add `.wxs` as a recognized but skipped file type (noted as not processed for i18n).

- [ ] **Step 2: Commit**

```bash
git add agents/i18n-files.md
git commit -m "docs: add .wxml support to i18n-files agent"
```

---

### Task 9: Full Integration Test

- [ ] **Step 1: Run all tests**

Run: `node --test tests/*.test.js`
Expected: ALL PASS (including vue-replace, html-replace, validate, wx-replace, wx-init)

- [ ] **Step 2: Dry-run test against real mini program project**

Run: `node skills/i18n-replace/wx-i18n-replace.js "F:/web/商超小程序/mini_app_netbar_manage - 约晴/pages/login" --dry-run --i18n-dir "F:/web/商超小程序/mini_app_netbar_manage - 约晴/i18n"`

Expected: Output showing preview of replacements for login pages (editInfo, findPassword, index) — Chinese text like `必填信息`, `请输入昵称`, `登 录`, `忘记密码` should show as replaced. No ReferenceError or crash.

- [ ] **Step 3: Commit final state**

```bash
git add -A
git commit -m "feat: complete WeChat mini program i18n support"
```
