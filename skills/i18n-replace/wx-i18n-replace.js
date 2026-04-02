#!/usr/bin/env node
/**
 * 微信小程序 i18n 中文替换脚本
 * 扫描 WXML 和 JS 文件中的中文文本，进行 i18n 替换
 *
 * 替换规则：
 * - WXML 文件：中文文本 → {{$t['中文']}}，属性 → attr="{{$t['中文']}}"
 * - JS 文件：中文字符串 → global.$t('中文')
 * - 自动注入 Behavior 到有替换的 .wxml 对应的 .js 文件
 *
 * 用法：
 *   node wx-i18n-replace.js <file|directory> [options]
 *
 * 选项：
 *   --dry-run     只预览，不修改文件
 *   --i18n-dir    i18n 目录路径 (默认: ./i18n)
 *   --lang        目标语言 (默认: tw)
 *   --exclude     排除的目录或文件，逗号分隔
 */

const fs = require('fs');
const path = require('path');

// 默认配置
const DEFAULT_CONFIG = {
  i18nDir: './i18n',
  lang: 'tw'
};

// 支持的文件后缀
const WXML_EXTS = ['.wxml'];
const JS_EXTS = ['.js'];

// 匹配是否包含中文
const HAS_CHINESE = /[\u4e00-\u9fa5]/;

// 匹配需要处理的中文字符串（至少包含一个中文字符）
const CHINESE_STRING_REGEX = /(['"`])((?:(?!\1).)*[\u4e00-\u9fa5]+(?:(?!\1).)*?)(\1)/g;

// 已经被 i18n 包裹的模式（跳过）
const ALREADY_I18N = /\$t\s*[\[(]|global\.\$t/;

// WXML 中需要跳过的属性
const SKIP_ATTRS = [
  'class', 'id', 'style',
  'wx:if', 'wx:elif', 'wx:else', 'wx:for', 'wx:for-item', 'wx:for-index', 'wx:key',
  'src', 'url', 'path', 'module', 'name'
];

// 动态前缀匹配的跳过属性
const SKIP_ATTR_PREFIXES = ['bind', 'catch', 'mut-bind', 'data-'];

// ===== 高危场景跳过规则（来自实战经验） =====
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
    this.wxmlReplacedFiles = new Set(); // wxml 有替换的文件集合
    this.behaviorInjectedCount = 0;
  }

  /**
   * 检查是否应该跳过
   */
  shouldSkip(text, context) {
    if (ALREADY_I18N.test(context)) return true;
    if (!HAS_CHINESE.test(text)) return true;
    if (/^\s*\/\/|^\s*\/\*|\*\/\s*$|<!--/.test(context)) return true;
    return false;
  }

  /**
   * 记录中文文本
   */
  recordText(text) {
    const trimmed = text.trim();
    if (!trimmed || !HAS_CHINESE.test(trimmed)) return;

    if (/<[^>]+>|\{[^}]+\}|\$\{[^}]+\}/.test(trimmed)) {
      const parts = trimmed.split(/<[^>]+>|\{[^}]+\}|\$\{[^}]+\}/);
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

  /**
   * 转义引号和反斜杠（用于 JS 字符串）
   */
  escapeQuote(text) {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"');
  }

  /**
   * 检查属性是否应该跳过
   */
  isSkipAttr(attr) {
    if (SKIP_ATTRS.includes(attr)) return true;
    for (const prefix of SKIP_ATTR_PREFIXES) {
      if (attr.startsWith(prefix)) return true;
    }
    return false;
  }

  // ==================== WXML 处理 ====================

  /**
   * 处理混合了中文和 {{ }} 插值的文本
   * 例如：共{{num}}件商品 → {{$t['共']}}{{num}}{{$t['件商品']}}
   */
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

  /**
   * 处理 WXML 内容
   */
  processWxml(wxml) {
    let result = wxml;

    // 第零步：保护 HTML 注释
    const comments = [];
    let commentIdx = 0;
    result = result.replace(/<!--[\s\S]*?-->/g, (match) => {
      comments.push(match);
      return `__HTML_COMMENT_${commentIdx++}__`;
    });

    // 第一步：处理 {{ }} 插值内部的中文字符串
    result = result.replace(/\{\{([\s\S]*?)\}\}/g, (match, code) => {
      if (ALREADY_I18N.test(code)) return match;
      if (!HAS_CHINESE.test(code)) return match;

      const trimmed = code.trim();

      // 纯字符串字面量 {{ '中文' }}
      if (/^(['"`])[\u4e00-\u9fa5]+(\1)$/.test(trimmed)) {
        const text = trimmed.slice(1, -1);
        this.recordText(text);
        return `{{$t['${this.escapeQuote(text)}']}}`;
      }

      // 复杂表达式内的字符串字面量
      let hasChange = false;
      const newCode = code.replace(/(['"`])((?:(?!\1)[\s\S])*[\u4e00-\u9fa5]+(?:(?!\1)[\s\S])*?)(\1)/g, (strMatch, quote, text, _endQuote, offset) => {
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

    // 第二步：处理静态属性中的中文 attr="中文" → attr="{{$t['中文']}}"
    result = result.replace(/([\s])(\w[\w-]*)="([^"]*[\u4e00-\u9fa5]+[^"]*)"/g, (match, prefix, attr, value) => {
      if (this.isSkipAttr(attr)) return match;
      if (this.shouldSkip(value, match)) return match;

      // 如果值已包含 {{ }}，跳过（已经是动态绑定）
      if (/\{\{/.test(value)) return match;

      this.recordText(value);
      return `${prefix}${attr}="{{$t['${this.escapeQuote(value)}']}}"`;
    });

    // 第三步：处理标签间的中文文本 >中文< → >{{$t['中文']}}<
    result = result.replace(/>([^<]*[\u4e00-\u9fa5]+[^<]*)</g, (match, text) => {
      if (ALREADY_I18N.test(text)) return match;
      if (!HAS_CHINESE.test(text)) return match;

      const trimmed = text.trim();
      if (!trimmed) return match;

      // 包含引号，跳过
      if (text.includes('"') || text.includes("'")) return match;

      // 包含 {{ }} 插值，分段处理
      if (/\{\{[\s\S]*?\}\}/.test(text)) {
        const processed = this.processMixedText(text);
        return `>${processed}<`;
      }

      this.recordText(trimmed);

      const leadingSpace = text.match(/^\s*/)[0];
      const trailingSpace = text.match(/\s*$/)[0];
      return `>${leadingSpace}{{$t['${this.escapeQuote(trimmed)}']}}${trailingSpace}<`;
    });

    // 还原 HTML 注释
    result = result.replace(/__HTML_COMMENT_(\d+)__/g, (_, i) => comments[parseInt(i)]);

    return result;
  }

  // ==================== JS 处理 ====================

  /**
   * 处理 JS 代码（使用 global.$t）
   */
  processScript(script) {
    const lines = script.split('\n');
    let inBlockComment = false;
    const processedLines = lines.map(line => {
      // 多行注释状态追踪
      if (inBlockComment) {
        if (/\*\//.test(line)) inBlockComment = false;
        return line;
      }
      if (/\/\*/.test(line) && !/\*\//.test(line)) {
        inBlockComment = true;
        return line;
      }

      // 跳过 import/require
      if (/^\s*(import\s+|.*require\s*\()/.test(line)) return line;
      // 跳过单行注释和 /* ... */ 同行闭合的注释
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) return line;
      // 跳过 console
      if (/^\s*console\s*\.\s*(log|warn|error|info|debug)\s*\(/.test(line)) return line;

      return line.replace(CHINESE_STRING_REGEX, (match, quote, text, _endQuote) => {
        if (this.shouldSkip(text, match)) return match;

        // 跳过比较运算符后的字符串（不跳过箭头函数 =>）
        const matchIndex = line.indexOf(match);
        const beforeMatch = line.substring(0, matchIndex);
        if (/(===?|!==?|<=?|>=?)\s*$/.test(beforeMatch) && !/=>\s*$/.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '比较运算符后的逻辑值', line: line.trim() });
          return match;
        }

        // ===== 高危场景跳过（实战经验） =====
        if (SWITCH_CASE_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'switch/case 逻辑值', line: line.trim() });
          return match;
        }
        if (BRACKET_ACCESS_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '方括号属性访问（可能是后端数据字段）', line: line.trim() });
          return match;
        }
        if (STORAGE_KEY_REGEX_BASE.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '存储键（localStorage）', line: line.trim() });
          return match;
        }
        if (WX_STORAGE_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '微信存储键（wx.setStorage/getStorage）', line: line.trim() });
          return match;
        }
        if (INDEX_MATCH_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: 'indexOf/includes 匹配值（可能匹配后端数据）', line: line.trim() });
          return match;
        }

        // 处理包含 HTML 标签的字符串
        if (/<[^>]+>/.test(text)) {
          let hasHtmlChange = false;
          const processedHtml = text.replace(/>([^<]*[\u4e00-\u9fa5]+[^<]*)</g, (htmlMatch, innerText) => {
            if (!HAS_CHINESE.test(innerText)) return htmlMatch;
            const trimmedInner = innerText.trim();
            if (trimmedInner) {
              this.recordText(trimmedInner);
              hasHtmlChange = true;
              const leadingSpace = innerText.match(/^\s*/)[0];
              const trailingSpace = innerText.match(/\s*$/)[0];
              return `>${leadingSpace}\${global.$t('${this.escapeQuote(trimmedInner)}')}${trailingSpace}<`;
            }
            return htmlMatch;
          });
          if (hasHtmlChange) return `\`${processedHtml}\``;
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

  /**
   * 处理模板字符串（使用 global.$t）
   */
  processTemplateString(match, text) {
    const varMappings = [];
    const cleanText = text.replace(/\$\{([^}]+)\}/g, (_, expr) => {
      let trimmedExpr = expr.trim();

      // 先用原始表达式生成 safeKey（排除中文）
      let safeKey = trimmedExpr.replace(/[^\w]/g, '_').replace(/_+/g, '_').replace(/(^_+|_+$)/g, '');

      // 再处理表达式内的中文字符串
      if (HAS_CHINESE.test(trimmedExpr)) {
        trimmedExpr = trimmedExpr.replace(/(['"])((?:(?!\1).)*[\u4e00-\u9fa5]+(?:(?!\1).)*?)\1/g, (strMatch, quote, strText, offset) => {
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

    // 外部无中文，直接返回表达式
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

  /**
   * 为有 WXML 替换的页面/组件注入 i18nBehavior
   */
  injectBehavior(jsFilePath) {
    if (!fs.existsSync(jsFilePath)) return;

    let content = fs.readFileSync(jsFilePath, 'utf-8');

    // 已经注入过则跳过
    if (/i18nBehavior/.test(content)) return;

    // 计算 i18n-behavior.js 的相对路径
    const jsDir = path.dirname(jsFilePath);
    const i18nDir = path.resolve(this.i18nDir);
    let relativePath = path.relative(jsDir, path.join(i18nDir, 'i18n-behavior.js'));
    // 确保使用 posix 分隔符
    relativePath = relativePath.replace(/\\/g, '/');
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    // 在文件顶部添加 require
    const requireLine = `const i18nBehavior = require('${relativePath}')\n`;

    // 查找 Page({ 或 Component({ 并注入 behaviors
    if (/\bPage\s*\(\s*\{/.test(content)) {
      content = requireLine + content;
      // 检查是否已有 behaviors 数组
      if (/behaviors\s*:\s*\[/.test(content)) {
        // 追加到已有 behaviors 数组
        content = content.replace(/behaviors\s*:\s*\[/, 'behaviors: [i18nBehavior, ');
      } else {
        // 在 Page({ 后插入 behaviors
        content = content.replace(/\bPage\s*\(\s*\{/, 'Page({\n  behaviors: [i18nBehavior],');
      }
    } else if (/\bComponent\s*\(\s*\{/.test(content)) {
      content = requireLine + content;
      if (/behaviors\s*:\s*\[/.test(content)) {
        content = content.replace(/behaviors\s*:\s*\[/, 'behaviors: [i18nBehavior, ');
      } else {
        content = content.replace(/\bComponent\s*\(\s*\{/, 'Component({\n  behaviors: [i18nBehavior],');
      }
    } else {
      // 不是 Page 或 Component，跳过
      return;
    }

    if (this.dryRun) {
      console.log(`[预览] 将注入 Behavior: ${jsFilePath}`);
    } else {
      fs.writeFileSync(jsFilePath, content, 'utf-8');
      console.log(`[已注入 Behavior] ${jsFilePath}`);
    }
    this.behaviorInjectedCount++;
  }

  // ==================== 文件处理 ====================

  /**
   * 处理单个文件
   */
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

  /**
   * 处理目录
   */
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

      if (stats.isDirectory()) {
        // 跳过特殊目录
        if (file.startsWith('.')) continue;
        if (['node_modules', 'miniprogram_npm', 'dist', 'build'].includes(file)) continue;
        if (this.exclude.some(pattern => file === pattern || fullPath.includes(pattern))) continue;
        await this.processDirectory(fullPath);
      } else {
        if (this.exclude.some(pattern => file === pattern || fullPath.includes(pattern))) continue;
        // 跳过压缩文件
        if (file.endsWith('.min.js')) continue;
        const ext = path.extname(file).toLowerCase();
        if (WXML_EXTS.includes(ext) || JS_EXTS.includes(ext)) {
          await this.processFile(fullPath);
        }
      }
    }
  }

  /**
   * 处理文件或目录
   */
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

    // 所有文件处理完后，注入 Behavior
    this.injectBehaviors();
  }

  /**
   * 为所有有 WXML 替换的文件注入 Behavior
   */
  injectBehaviors() {
    for (const wxmlFile of this.wxmlReplacedFiles) {
      const jsFile = wxmlFile.replace(/\.wxml$/, '.js');
      this.injectBehavior(jsFile);
    }
  }

  // ==================== Diff 输出 ====================

  /**
   * 生成简易 diff 输出（用于 dry-run 预览）
   */
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

  /**
   * 读取现有语言文件
   */
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

  /**
   * 写入语言文件
   */
  writeLangFile(lang, data) {
    const filePath = path.join(this.i18nDir, `${lang}.json`);
    if (!fs.existsSync(this.i18nDir)) {
      fs.mkdirSync(this.i18nDir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[已写入] ${filePath} (${Object.keys(data).length} 条翻译)`);
  }

  /**
   * 将提取的中文文本写入语言文件
   */
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
      console.log(`[预览模式] 将添加 ${newTexts.length} 条新文本（翻译值留空）:`);
      newTexts.slice(0, 10).forEach(t => console.log(`  "${t}": ""`));
      if (newTexts.length > 10) console.log(`  ... 还有 ${newTexts.length - 10} 条`);
      return;
    }

    for (const text of newTexts) {
      existingTranslations[text] = '';
    }

    this.writeLangFile(this.lang, existingTranslations);
    console.log(`已添加 ${newTexts.length} 条新文本（翻译值留空，请使用 i18n-text agent 进行翻译）`);
  }

  /**
   * 输出提取摘要
   */
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

    // 输出跳过的高危逻辑值
    if (this.skippedLogic.length > 0) {
      console.log(`\n跳过的高危逻辑值（${this.skippedLogic.length} 处，需人工确认是否需要翻译）：`);
      const grouped = {};
      for (const item of this.skippedLogic) {
        const key = item.reason;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
      }
      for (const [reason, items] of Object.entries(grouped)) {
        console.log(`  ${reason}（${items.length} 处）：`);
        for (const item of items.slice(0, 5)) {
          console.log(`     ${item.file}: "${item.text}" -> ${item.line.substring(0, 80)}`);
        }
        if (items.length > 5) console.log(`     ... 及其他 ${items.length - 5} 处`);
      }
    }

    // 输出 Behavior 注入信息
    if (this.behaviorInjectedCount > 0) {
      console.log(`\nBehavior 注入: ${this.behaviorInjectedCount} 个文件`);
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
  --dry-run       只预览，不修改文件（显示 diff 对比）
  --i18n-dir      i18n 目录路径 (默认: ./i18n)
  --lang          目标语言 (默认: tw)
  --exclude       排除的目录或文件，逗号分隔 (如: components,legacy)

支持文件类型：
  .wxml           WXML 模板文件
  .js             JS 逻辑文件

替换规则：
  WXML 文本：  <text>中文</text>  →  <text>{{$t['中文']}}</text>
  WXML 属性：  placeholder="中文"  →  placeholder="{{$t['中文']}}"
  JS 代码：    '中文'  →  global.$t('中文')

示例：
  node wx-i18n-replace.js ./ --dry-run
  node wx-i18n-replace.js ./ --i18n-dir ./i18n --lang en
  node wx-i18n-replace.js ./ --exclude components,legacy
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

  // 校验 i18n 目录是否已初始化（dry-run 模式跳过）
  if (!options.dryRun) {
    const i18nEntry = path.join(options.i18nDir, 'i18n.js');
    if (!fs.existsSync(options.i18nDir) || !fs.existsSync(i18nEntry)) {
      console.error(`错误: i18n 目录未初始化 - ${options.i18nDir}`);
      console.error(`请先运行 /i18n-init 初始化 i18n 目录（需包含 i18n.js）`);
      process.exit(1);
    }
  }

  console.log('=== 微信小程序 i18n 替换工具 ===');
  console.log(`目标路径: ${targetPath}`);
  console.log(`i18n 目录: ${options.i18nDir}`);
  console.log(`目标语言: ${options.lang}`);
  if (options.dryRun) console.log('[预览模式]');
  console.log('');

  const replacer = new WxI18nReplacer(options);
  await replacer.process(targetPath);
  replacer.outputSummary();
  replacer.saveExtractedTexts();

  console.log('\n替换完成！请使用 i18n-text agent 子代理进行翻译。');
}

// 支持 require 导入（测试用）和 CLI 直接运行
module.exports = { WxI18nReplacer };

// 如果直接运行（非 require 导入），执行 CLI
if (require.main === module) {
  main().catch((e) => {
    console.error(`执行失败: ${e && e.message ? e.message : String(e)}`);
    process.exit(1);
  });
}
