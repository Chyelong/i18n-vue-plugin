#!/usr/bin/env node
/**
 * 静态 HTML/JS i18n 中文替换脚本
 * 扫描 HTML 和 JS/TS 文件中的中文文本，进行 i18n 替换
 *
 * 替换规则：
 * - JS/TS 文件：中文字符串 → window.$t('中文')
 * - HTML 文件 <script> 标签内：中文字符串 → window.$t('中文')
 * - HTML 标签间文本：开始标签添加 data-i18n 属性标记
 * - HTML 属性中文：添加 data-i18n-{attr} 属性标记
 *
 * 用法：
 *   node html-i18n-replace.js <file|directory> [options]
 *
 * 选项：
 *   --dry-run     只预览，不修改文件
 *   --i18n-dir    i18n 目录路径 (默认: ./src/i18n)
 *   --lang        目标语言 (默认: tw)
 */

const fs = require('fs');
const path = require('path');

// 默认配置（静态项目 i18n 目录在项目根目录下）
const DEFAULT_CONFIG = {
  i18nDir: './i18n',
  lang: 'tw'
};

// 支持的文件后缀
const HTML_EXTS = ['.html', '.htm'];
const JS_EXTS = ['.js', '.ts', '.jsx', '.tsx'];

// 匹配是否包含中文
const HAS_CHINESE = /[\u4e00-\u9fa5]/;

// 匹配需要处理的中文字符串（至少包含一个中文字符）
const CHINESE_STRING_REGEX = /(['"`])((?:(?!\1).)*[\u4e00-\u9fa5]+(?:(?!\1).)*?)(\1)/g;

// 已经被 i18n 包裹的模式（跳过）
const ALREADY_I18N = /\$t\s*\(|i18n\.|data-i18n/;

// HTML 中需要跳过的属性
const SKIP_ATTRS = [
  'class', 'id', 'name', 'style', 'type', 'href', 'src', 'action',
  'method', 'enctype', 'charset', 'rel', 'media', 'lang', 'value',
  'data-i18n', 'onclick', 'onchange', 'onsubmit', 'onload'
];

// data-* 业务属性不应标记 data-i18n（JS 通过 dataset 读取，翻译后逻辑出错）
const SKIP_DATA_ATTR_REGEX = /^data-(?!i18n)/;

// ===== 高危场景跳过规则（来自实战经验） =====
const {
  SWITCH_CASE_REGEX,
  BRACKET_ACCESS_REGEX,
  INDEX_MATCH_REGEX,
  STORAGE_KEY_REGEX_BASE: STORAGE_KEY_REGEX,
} = require('./shared-patterns');

// HTML void 元素（不会有文本子节点）
const VOID_ELEMENTS = [
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
];

class HtmlI18nReplacer {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.i18nDir = options.i18nDir || DEFAULT_CONFIG.i18nDir;
    this.lang = options.lang || DEFAULT_CONFIG.lang;
    this.exclude = options.exclude || [];
    this.extractedTexts = new Set();
    this.skippedLogic = [];
    this.currentFile = '';
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
   * 转义 HTML 属性值
   */
  escapeAttr(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
  }

  // ==================== JS 处理 ====================

  /**
   * 处理 JS 代码（始终使用 window.$t）
   */
  processScript(script) {
    const lines = script.split('\n');
    let inBlockComment = false; // 多行注释状态追踪
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
        if (STORAGE_KEY_REGEX.test(beforeMatch)) {
          this.skippedLogic.push({ file: this.currentFile, text, reason: '存储键（localStorage）', line: line.trim() });
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
              return `>${leadingSpace}\${window.$t('${this.escapeQuote(trimmedInner)}')}${trailingSpace}<`;
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
        return `window.$t('${this.escapeQuote(text)}')`;
      });
    });

    return processedLines.join('\n');
  }

  /**
   * 处理模板字符串（始终使用 window.$t）
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
          return `window.$t(${quote}${this.escapeQuote(strText)}${quote})`;
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
      return `window.$t('${this.escapeQuote(normalizedOriginal)}')`;
    }

    const params = varMappings.map(m => `'${m.key}': ${m.expr}`).join(', ');
    return `window.$t('${this.escapeQuote(normalizedText)}', { ${params} })`;
  }

  // ==================== HTML 处理 ====================

  /**
   * 处理 HTML 内容（非 script/style 部分）
   */
  processHtmlContent(html) {
    let result = html;

    // 第零步：保护 HTML 注释
    const comments = [];
    let commentIdx = 0;
    result = result.replace(/<!--[\s\S]*?-->/g, (match) => {
      comments.push(match);
      return `__HTML_COMMENT_${commentIdx++}__`;
    });

    // 第一步：处理静态属性中的中文（添加 data-i18n-{attr} 标记）
    result = result.replace(/([\s])(\w[\w-]*)="([^"]*[\u4e00-\u9fa5]+[^"]*)"/g, (match, prefix, attr, value) => {
      if (attr.startsWith('data-i18n') || SKIP_ATTRS.includes(attr)) return match;
      if (attr.startsWith('on')) return match; // 事件处理属性跳过
      if (SKIP_DATA_ATTR_REGEX.test(attr)) return match; // data-* 业务属性跳过
      if (this.shouldSkip(value, match)) return match;

      this.recordText(value);
      return `${match} data-i18n-${attr}="${this.escapeAttr(value)}"`;
    });

    // 第二步：处理标签间的中文文本（添加 data-i18n 到开始标签）
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

      this.recordText(trimmed);

      // 在开始标签的 > 前插入 data-i18n 属性
      const newOpenTag = openTag.slice(0, -1) + ` data-i18n="${this.escapeAttr(trimmed)}">`;
      return newOpenTag + text;
    });

    // 还原 HTML 注释
    result = result.replace(/__HTML_COMMENT_(\d+)__/g, (_, i) => comments[parseInt(i)]);

    return result;
  }

  // ==================== 文件处理 ====================

  /**
   * 处理 HTML 文件
   */
  processHtmlFile(content) {
    let result = content;

    // 第一步：保护 style 标签
    const styles = [];
    let styleIdx = 0;
    result = result.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (match) => {
      styles.push(match);
      return `__STYLE_PLACEHOLDER_${styleIdx++}__`;
    });

    // 第二步：提取并处理 script 标签
    result = result.replace(/(<script[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, openTag, scriptBody, closeTag) => {
      const processedScript = this.processScript(scriptBody);
      return openTag + processedScript + closeTag;
    });

    // 第三步：处理 HTML 内容（标签文本和属性）
    result = this.processHtmlContent(result);

    // 第四步：还原 style 标签
    result = result.replace(/__STYLE_PLACEHOLDER_(\d+)__/g, (_, i) => styles[parseInt(i)]);

    return result;
  }

  /**
   * 处理 JS/TS 文件
   */
  processJsFile(content) {
    return this.processScript(content);
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
      if (HTML_EXTS.includes(ext) || JS_EXTS.includes(ext)) {
        await this.processFile(targetPath);
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

      if (stats.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
        if (this.exclude.some(pattern => file === pattern || fullPath.includes(pattern))) continue;
        await this.processDirectory(fullPath);
      } else {
        if (this.exclude.some(pattern => file === pattern || fullPath.includes(pattern))) continue;
        const ext = path.extname(file).toLowerCase();
        if (HTML_EXTS.includes(ext) || JS_EXTS.includes(ext)) {
          await this.processFile(fullPath);
        }
      }
    }
  }

  /**
   * 向上查找 node_modules 下的指定模块
   */
  findNodeModule(startDir, moduleName) {
    let current = path.resolve(startDir);
    while (true) {
      const candidate = path.join(current, 'node_modules', moduleName);
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }

  /**
   * 格式化内容（调用 Prettier API，内存中格式化避免双倍 IO）
   */
  async formatContent(content, filePath) {
    const absFilePath = path.resolve(filePath);

    try {
      let prettier;
      const bundledPrettierPath = path.join(__dirname, 'node_modules', 'prettier');
      const projectPrettierPath = this.findNodeModule(path.dirname(absFilePath), 'prettier');

      if (fs.existsSync(bundledPrettierPath)) {
        prettier = require(bundledPrettierPath);
      } else if (projectPrettierPath) {
        prettier = require(projectPrettierPath);
      } else {
        prettier = require('prettier');
      }

      if (!prettier || typeof prettier.format !== 'function') {
        console.log(`[跳过格式化] ${filePath} (未找到 Prettier API)`);
        return content;
      }

      const resolved = (typeof prettier.resolveConfig === 'function')
        ? (await prettier.resolveConfig(absFilePath))
        : null;
      const formatted = await prettier.format(content, {
        ...(resolved || {}),
        filepath: absFilePath
      });
      console.log(`[已格式化] ${filePath} (Prettier)`);
      return formatted;
    } catch (e) {
      const reason = (e && e.message) ? e.message : String(e);
      console.log(`[跳过格式化] ${filePath} (${reason})`);
      return content;
    }
  }

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

  /**
   * 处理单个文件
   */
  async processFile(filePath) {
    console.log(`处理文件: ${filePath}`);
    this.currentFile = filePath;

    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    let processed;
    if (HTML_EXTS.includes(ext)) {
      processed = this.processHtmlFile(content);
    } else if (JS_EXTS.includes(ext)) {
      processed = this.processJsFile(content);
    } else {
      return;
    }

    if (content !== processed) {
      if (this.dryRun) {
        this.showDiff(content, processed, filePath);
      } else {
        const formatted = await this.formatContent(processed, filePath);
        fs.writeFileSync(filePath, formatted, 'utf-8');
        console.log(`[已修改] ${filePath}`);
      }
    }
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

    // 输出跳过的高危逻辑值（按类型分组）
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
  }
}

// CLI 入口
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
静态 HTML/JS i18n 中文替换工具

用法：
  node html-i18n-replace.js <file|directory> [options]

选项：
  --dry-run       只预览，不修改文件（显示 diff 对比）
  --i18n-dir      i18n 目录路径 (默认: ./i18n)
  --lang          目标语言 (默认: tw)
  --exclude       排除的目录或文件，逗号分隔 (如: vendors,legacy)

支持文件类型：
  .html .htm      HTML 文件（处理标签文本、属性、内联 script）
  .js .ts .jsx .tsx  JS/TS 文件（处理字符串中的中文）

替换规则：
  JS 代码：  '中文'  →  window.$t('中文')
  HTML 文本：<div>中文</div>  →  <div data-i18n="中文">中文</div>
  HTML 属性：placeholder="中文"  →  placeholder="中文" data-i18n-placeholder="中文"

示例：
  node html-i18n-replace.js ./ --dry-run
  node html-i18n-replace.js ./ --i18n-dir ./i18n --lang en
  node html-i18n-replace.js ./ --exclude vendors,legacy
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

  // 校验 i18n 目录是否已初始化（dry-run 模式跳过，预览不需要写入）
  if (!options.dryRun) {
    const i18nIndex = path.join(options.i18nDir, 'index.js');
    if (!fs.existsSync(options.i18nDir) || !fs.existsSync(i18nIndex)) {
      console.error(`错误: i18n 目录未初始化 - ${options.i18nDir}`);
      console.error(`请先运行 /i18n-init 初始化 i18n 目录`);
      process.exit(1);
    }
  }

  console.log('=== 静态 HTML/JS i18n 替换工具 ===');
  console.log(`目标路径: ${targetPath}`);
  console.log(`i18n 目录: ${options.i18nDir}`);
  console.log(`目标语言: ${options.lang}`);
  if (options.dryRun) console.log('[预览模式]');
  console.log('');

  const replacer = new HtmlI18nReplacer(options);
  await replacer.process(targetPath);
  replacer.outputSummary();
  replacer.saveExtractedTexts();

  console.log('\n替换完成！');
  console.log('提示：HTML 中标记了 data-i18n 属性的元素，需要配合初始化脚本在运行时替换文本。');
  console.log('请使用 i18n-text agent 子代理完成翻译。');
}

main().catch((e) => {
  console.error(`执行失败: ${e && e.message ? e.message : String(e)}`);
  process.exit(1);
});
