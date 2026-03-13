#!/usr/bin/env node
/**
 * Vue i18n 中文替换脚本
 * 扫描 Vue 文件中的中文文本，用 $t('中文') 包裹
 * 替换后将中文 key 写入语言 JSON 文件（翻译值留空，由 AI agent 翻译）
 *
 * 用法：
 *   node vue-i18n-replace.js <file|directory> [options]
 *
 * 选项：
 *   --dry-run     只预览，不修改文件
 *   --i18n-dir    i18n 目录路径 (默认: ./src/i18n)
 *   --lang        目标语言 (默认: en)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// 默认配置
const DEFAULT_CONFIG = {
  i18nDir: './src/i18n',
  lang: 'en'
};

// 匹配是否包含中文
const HAS_CHINESE = /[\u4e00-\u9fa5]/;

// 匹配需要处理的中文字符串（至少包含一个中文字符）
// 使用非贪婪匹配，支持字符串内包含其他引号
const CHINESE_STRING_REGEX = /(['"`])((?:(?!\1).)*[\u4e00-\u9fa5]+(?:(?!\1).)*?)(\1)/g;

// 匹配 template 中的文本内容
// 允许插值 {{ ... }} 内部包含 > 和 < 符号（如箭头函数、比较操作符）
const TEMPLATE_TEXT_REGEX = />([^<]*(?:\{\{[\s\S]*?\}\}[^<]*)*)</gs;

// 匹配静态属性中的中文 (不带冒号前缀)
// 使用 [\w-]+ 匹配完整属性名（包括 v-if、@click 等）
const STATIC_ATTR_CHINESE_REGEX = /(?<!:)([\w@][\w-]*)="([^"]*[\u4e00-\u9fa5]+[^"]*)"/g;

// 匹配动态属性表达式 :attr="expression"
const DYNAMIC_ATTR_REGEX = /:(\w+)\s*=\s*"([^"]*)"/g;

// 已经被 i18n 包裹的模式（跳过）
// 移除负向后行断言以兼容旧版 Node.js
const ALREADY_I18N = /\$t\s*\(|[^a-zA-Z_]t\s*\(|i18n\.|this\.\$t/;

// 需要跳过的属性（静态属性跳过，但指令表达式内的字符串仍需处理）
const SKIP_ATTRS = [
  'class', 'id', 'name', 'key', 'ref', 'v-model', 'style',
  'v-if', 'v-show', 'v-for', 'v-else', 'v-else-if', 'v-bind', 'v-on',
  'v-text', 'v-html', 'v-once', 'v-pre', 'v-cloak'
];

class VueI18nReplacer {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.i18nDir = options.i18nDir || DEFAULT_CONFIG.i18nDir;
    this.lang = options.lang || DEFAULT_CONFIG.lang;
    this.extractedTexts = new Set(); // 提取的中文文本
    this.replacements = []; // 替换记录列表
    this.currentFile = ''; // 当前处理的文件
  }

  /**
   * 检查是否应该跳过
   */
  shouldSkip(text, context) {
    // 已经被 i18n 包裹
    if (ALREADY_I18N.test(context)) return true;
    // 纯数字或空白
    if (!/[\u4e00-\u9fa5]/.test(text)) return true;
    // 注释中的文本
    if (/^\s*\/\/|^\s*\/\*|\*\/\s*$|<!--/.test(context)) return true;
    return false;
  }

  /**
   * 记录替换操作
   */
  recordReplacement(original, replacement, type) {
    this.replacements.push({
      file: this.currentFile,
      original: original,
      replacement: replacement,
      type: type // 'template-text' | 'template-attr' | 'template-interpolation' | 'script'
    });
  }

  /**
   * 记录中文文本
   * 如果文本包含 HTML 标签或插值变量，拆分成独立的纯文本部分
   */
  recordText(text) {
    const trimmed = text.trim();
    if (!trimmed || !/[\u4e00-\u9fa5]/.test(trimmed)) {
      return;
    }

    // 检查是否包含 HTML 标签或插值变量 {xxx} / ${xxx}
    if (/<[^>]+>|\{[^}]+\}|\$\{[^}]+\}/.test(trimmed)) {
      // 拆分 HTML 标签和插值变量，提取纯文本部分
      const parts = trimmed.split(/<[^>]+>|\{[^}]+\}|\$\{[^}]+\}/);
      for (const part of parts) {
        const partTrimmed = part.trim();
        if (partTrimmed && /[\u4e00-\u9fa5]/.test(partTrimmed)) {
          this.extractedTexts.add(partTrimmed);
        }
      }
    } else {
      this.extractedTexts.add(trimmed);
    }
  }

  /**
   * 处理 template 部分
   */
  processTemplate(template) {
    let result = template;

    // 第零步：保护 HTML 注释，避免处理注释中的中文
    const comments = [];
    let commentIdx = 0;
    result = result.replace(/<!--[\s\S]*?-->/g, (match) => {
      comments.push(match);
      return `__HTML_COMMENT_${commentIdx++}__`;
    });

    // 第一步：处理插值 {{ ... }} 内部的字符串
    // 使用更健壮的方式处理插值
    result = result.replace(/\{\{([\s\S]*?)\}\}/g, (match, code) => {
      // 已经被 i18n 包裹，跳过
      if (ALREADY_I18N.test(code)) return match;
      if (!HAS_CHINESE.test(code)) return match;

      // 如果是纯字符串字面量，如 {{ '中文' }}
      const trimmed = code.trim();
      if (/^(['"`])[\u4e00-\u9fa5]+(\1)$/.test(trimmed)) {
        const text = trimmed.slice(1, -1);
        this.recordText(text);
        return `{{ $t('${this.escapeQuote(text)}') }}`;
      }

      // 如果是复杂的 JS 表达式（带三元、模板字符串等）
      // 处理表达式内部的字符串字面量
      // 使用 [\s\S] 替代 . 以支持跨行匹配
      let hasChange = false;
      const newCode = code.replace(/(['"`])((?:(?!\1)[\s\S])*[\u4e00-\u9fa5]+(?:(?!\1)[\s\S])*?)(\1)/g, (strMatch, quote, text) => {
        if (ALREADY_I18N.test(text)) return strMatch;

        // 跳过比较运算符后的字符串（条件判断值）
        // 注意：只跳过比较运算符（==, ===, !=, !==, <, >, <=, >=），不跳过赋值运算符（=）
        const strIndex = code.indexOf(strMatch);
        const beforeStr = code.substring(0, strIndex);
        if (/(===?|!==?|<=?|>=?)\s*$/.test(beforeStr)) {
          return strMatch;
        }

        // 如果是模板字符串且包含变量，使用 processTemplateString（template 中不需要 window.）
        if (quote === '`' && /\$\{/.test(text)) {
          hasChange = true;
          return this.processTemplateString(strMatch, text, false);
        }

        // 规范化空白：将换行和多余空格替换为单个空格
        const normalizedText = text.replace(/\s+/g, ' ').trim();
        this.recordText(normalizedText);
        hasChange = true;
        return `$t('${this.escapeQuote(normalizedText)}')`;
      });

      return hasChange ? `{{${newCode}}}` : match;
    });

    // 第二步：处理动态属性 :attr="expression" 中的中文字符串
    result = result.replace(DYNAMIC_ATTR_REGEX, (match, attr, expression) => {
      // 跳过特定属性
      if (SKIP_ATTRS.includes(attr)) return match;
      // 已经被 i18n 包裹
      if (ALREADY_I18N.test(expression)) return match;

      let hasChange = false;
      // 处理表达式内的字符串字面量 ('xxx' 或 "xxx")
      const newExpr = expression.replace(/(['"])(.*?)\1/g, (literalMatch, quote, literalText) => {
        // 如果字符串内没有中文，不处理
        if (!HAS_CHINESE.test(literalText)) return literalMatch;
        // 防止重复处理
        if (ALREADY_I18N.test(literalText)) return literalMatch;

        // 跳过比较运算符后的字符串（条件判断值）
        // 注意：只跳过比较运算符（==, ===, !=, !==, <, >, <=, >=），不跳过赋值运算符（=）
        const strIndex = expression.indexOf(literalMatch);
        const beforeStr = expression.substring(0, strIndex);
        if (/(===?|!==?|<=?|>=?)\s*$/.test(beforeStr)) {
          return literalMatch;
        }

        this.recordText(literalText);
        hasChange = true;
        // 包裹：'你好' -> $t('你好') (template 中不能用 window)
        return `$t(${quote}${this.escapeQuote(literalText)}${quote})`;
      });

      if (hasChange) {
        return `:${attr}="${newExpr}"`;
      }
      return match;
    });

    // 第三步：处理静态属性中的中文 attr="中文"
    result = result.replace(STATIC_ATTR_CHINESE_REGEX, (match, attr, value) => {
      // 跳过特定属性
      if (SKIP_ATTRS.includes(attr) || attr.startsWith('v-') || attr.startsWith('@')) {
        return match;
      }

      if (this.shouldSkip(value, match)) {
        return match;
      }

      this.recordText(value);

      // 静态转动态：添加冒号，整体包裹 (template 中不能用 window)
      return `:${attr}="$t('${this.escapeQuote(value)}')"`;
    });

    // 第四步：处理标签内的静态文本 >文字<
    result = result.replace(TEMPLATE_TEXT_REGEX, (match, text) => {
      // 检查是否已经是 $t 调用，防止重复替换
      if (ALREADY_I18N.test(text)) return match;
      // 没有中文，跳过
      if (!HAS_CHINESE.test(text)) return match;

      let trimmed = text.trim();
      if (!trimmed) return match;

      // 检查是否错误匹配了属性值中的 > 符号
      // 例如：v-if="x > 0" class="foo"> 退款： 会匹配到 ' 0" class="foo"> 退款：'
      // 这种情况下，我们需要跳过整个匹配，因为 TEMPLATE_TEXT_REGEX 错误地把
      // 属性值中的 > 当作了标签闭合符号

      // 检测是否存在属性模式：如果文本中包含 "> 或 '> 模式，说明可能误匹配了属性值
      // 正确的标签文本不应该包含 "> 或 '> 这种属性闭合模式
      if (/["'][\s]*>/.test(trimmed)) {
        // 这表示匹配的内容包含属性闭合模式，应该跳过
        return match;
      }

      // 包含插值 {{ }}，需要分段处理中文和插值
      if (/\{\{[\s\S]*?\}\}/.test(text)) {
        const processed = this.processMixedText(text);
        return `>${processed}<`;
      }

      // 包含引号，疑似代码且不在插值内，跳过
      if (text.includes('"') || text.includes("'")) return match;

      if (this.shouldSkip(trimmed, match)) {
        return match;
      }

      this.recordText(trimmed);

      // 保留前后空白
      const leadingSpace = text.match(/^\s*/)[0];
      const trailingSpace = text.match(/\s*$/)[0];

      return `>${leadingSpace}{{ $t('${this.escapeQuote(trimmed)}') }}${trailingSpace}<`;
    });

    // 还原 HTML 注释
    result = result.replace(/__HTML_COMMENT_(\d+)__/g, (_, i) => comments[parseInt(i)]);

    return result;
  }

  /**
   * 处理混合了中文和插值的文本
   * 例如：服务员：{{ item.name }} -> {{ $t('服务员：') }}{{ item.name }}
   */
  processMixedText(text) {
    // 分割：把 {{ xxx }} 和普通文本分开
    const parts = [];
    let lastIndex = 0;
    const interpolationRegex = /\{\{[\s\S]*?\}\}/g;
    let m;

    while ((m = interpolationRegex.exec(text)) !== null) {
      // 前面的普通文本
      if (m.index > lastIndex) {
        parts.push({ type: 'text', value: text.slice(lastIndex, m.index) });
      }
      // 插值部分
      parts.push({ type: 'interpolation', value: m[0] });
      lastIndex = m.index + m[0].length;
    }

    // 最后剩余的文本
    if (lastIndex < text.length) {
      parts.push({ type: 'text', value: text.slice(lastIndex) });
    }

    // 处理每个部分
    const processedParts = parts.map(part => {
      if (part.type === 'interpolation') {
        // 插值部分直接交给 processTemplate 的核心逻辑（已经处理过内部字符串）
        // 但这里我们简单返回，因为第一步已经处理了插值内部
        return part.value;
      } else {
        // 普通文本部分
        const trimmedPart = part.value.trim();
        if (!trimmedPart || !HAS_CHINESE.test(trimmedPart)) {
          return part.value;
        }

        if (ALREADY_I18N.test(part.value)) return part.value;

        this.recordText(trimmedPart);
        const partLeading = part.value.match(/^\s*/)[0];
        const partTrailing = part.value.match(/\s*$/)[0];
        return `${partLeading}{{ $t('${this.escapeQuote(trimmedPart)}') }}${partTrailing}`;
      }
    });

    return processedParts.join('');
  }

  /**
   * 转义引号和反斜杠
   */
  escapeQuote(text) {
    return text
      .replace(/\\/g, '\\\\')  // 先转义反斜杠
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"');
  }

  /**
   * 处理 script 部分
   */
  processScript(script) {
    let result = script;

    // 按行处理，避免跨行匹配问题
    const lines = result.split('\n');
    const processedLines = lines.map(line => {
      // 跳过 import/require 语句
      if (/^\s*(import\s+|.*require\s*\()/.test(line)) {
        return line;
      }

      // 跳过注释行
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) {
        return line;
      }

      // 跳过 console.log/warn/error/info/debug 行
      if (/^\s*console\s*\.\s*(log|warn|error|info|debug)\s*\(/.test(line)) {
        return line;
      }

      // 处理字符串中的中文
      return line.replace(CHINESE_STRING_REGEX, (match, quote, text, _endQuote) => {
        if (this.shouldSkip(text, match)) {
          return match;
        }

        // 跳过比较运算符后的字符串（通常是与后端值比较的逻辑值）
        // 例如：status === '已完成' 中的 '已完成' 不应替换
        // 注意：只跳过比较运算符（==, ===, !=, !==, <, >, <=, >=），不跳过赋值运算符（=）
        const matchIndex = line.indexOf(match);
        const beforeMatch = line.substring(0, matchIndex);
        if (/(===?|!==?|<=?|>=?)\s*$/.test(beforeMatch)) {
          return match;
        }

        // 检查是否在模板字符串中有变量
        // script 中：有 this. 时用 $t()，否则用 window.$t()
        const useWindow = !line.includes('this.');
        const prefix = useWindow ? 'window.' : '';

        // 处理包含 HTML 标签的字符串，如 '<b class="c_type">台桌</b>'
        // 只替换标签之间的中文文本，保留 HTML 结构
        if (/<[^>]+>/.test(text)) {
          let hasHtmlChange = false;
          const processedHtml = text.replace(/>([^<]*[\u4e00-\u9fa5]+[^<]*)</g, (htmlMatch, innerText) => {
            if (!HAS_CHINESE.test(innerText)) return htmlMatch;
            const trimmedInner = innerText.trim();
            if (trimmedInner) {
              this.recordText(trimmedInner);
              hasHtmlChange = true;
              // 保留前后空白
              const leadingSpace = innerText.match(/^\s*/)[0];
              const trailingSpace = innerText.match(/\s*$/)[0];
              return `>${leadingSpace}\${${prefix}$t('${this.escapeQuote(trimmedInner)}')}${trailingSpace}<`;
            }
            return htmlMatch;
          });
          if (hasHtmlChange) {
            return `\`${processedHtml}\``;
          }
        }

        // 检查是否在模板字符串中有变量（模板字符串由 processTemplateString 负责 recordText）
        if (quote === '`' && /\$\{/.test(text)) {
          return this.processTemplateString(match, text, useWindow);
        }

        this.recordText(text);

        // 使用中文作为 key（根据环境决定是否使用 window.）
        const replacement = `$t('${this.escapeQuote(text)}')`;
        return useWindow ? `window.${replacement}` : replacement;
      });
    });

    return processedLines.join('\n');
  }

  /**
   * 处理模板字符串
   * @param {boolean} useWindow - 是否使用 window.$t（在 script 中使用）
   */
  processTemplateString(match, text, useWindow = false) {
    // 提取变量并生成合法的变量名
    const varMappings = []; // { expr: 'item.uid', key: 'item_uid' }
    const cleanText = text.replace(/\$\{([^}]+)\}/g, (_, expr) => {
      const trimmedExpr = expr.trim();
      // 生成合法变量名：替换非单词字符为下划线，移除首尾下划线
      let safeKey = trimmedExpr.replace(/[^\w\u4e00-\u9fa5]/g, '_').replace(/_+/g, '_').replace(/(^_+|_+$)/g, '');
      // 如果变量名为空（比如全是特殊符号），给个保底
      if (!safeKey) safeKey = 'var_' + Math.random().toString(36).slice(2, 5);

      varMappings.push({ expr: trimmedExpr, key: safeKey });
      return `{${safeKey}}`;
    });

    // 规范化空白：将换行和多余空格替换为单个空格
    const normalizedText = cleanText.replace(/\s+/g, ' ').trim();

    // 直接添加完整 key（不走 recordText，因为 recordText 会按 {xxx} 拆分成碎片）
    if (/[\u4e00-\u9fa5]/.test(normalizedText)) {
      this.extractedTexts.add(normalizedText);
    }

    const prefix = useWindow ? 'window.' : '';

    if (varMappings.length === 0) {
      const normalizedOriginal = text.replace(/\s+/g, ' ').trim();
      return `${prefix}$t('${this.escapeQuote(normalizedOriginal)}')`;
    }

    // 生成参数对象
    const params = varMappings.map(m => `'${m.key}': ${m.expr}`).join(', ');
    return `${prefix}$t('${this.escapeQuote(normalizedText)}', { ${params} })`;
  }

  /**
   * 压缩 HTML/Vue 代码
   * 只压缩标签之间的空白，不压缩属性值和内容中的空白
   */
  compressCode(code) {
    // 只压缩 > 和 < 之间的多个空白（标签之间）
    // 这样不会影响属性值和文本内容
    let result = code.replace(/>\s*\n\s*/g, '> ');
    result = result.replace(/\s*\n\s*</g, ' <');
    return result;
  }

  /**
   * 处理 Vue 文件
   */
  processVueFile(content) {
    let result = content;

    // 第一步：提取并保存 style 标签
    const styles = [];
    let styleIdx = 0;
    result = result.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (match) => {
      styles.push(match);
      return `__STYLE_PLACEHOLDER_${styleIdx++}__`;
    });

    // 第二步：压缩 template 和 script（合并多余空白）
    // 处理 template 部分
    result = result.replace(/(<template[^>]*>)([\s\S]*)(<\/template>)/i, (match, openTag, templateBody, closeTag) => {
      // 压缩 template
      const compressed = this.compressCode(templateBody);
      const processedTemplate = this.processTemplate(compressed);
      return openTag + processedTemplate + closeTag;
    });

    // 处理 script 部分（script 不需要压缩，按行处理即可）
    result = result.replace(/(<script[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, openTag, scriptBody, closeTag) => {
      const processedScript = this.processScript(scriptBody);
      return openTag + processedScript + closeTag;
    });

    // 第三步：还原 style 标签
    result = result.replace(/__STYLE_PLACEHOLDER_(\d+)__/g, (_, i) => styles[parseInt(i)]);

    return result;
  }

  /**
   * 处理文件或目录
   */
  process(targetPath) {
    const stats = fs.statSync(targetPath);

    if (stats.isDirectory()) {
      this.processDirectory(targetPath);
    } else if (stats.isFile() && targetPath.endsWith('.vue')) {
      this.processFile(targetPath);
    }
  }

  /**
   * 处理目录
   */
  processDirectory(dirPath) {
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
        stats = fs.lstatSync(fullPath); // 使用 lstatSync 检测符号链接
      } catch (e) {
        console.warn(`[跳过] 无法访问: ${fullPath} (${e.code || e.message})`);
        continue;
      }

      // 跳过符号链接，避免无限循环
      if (stats.isSymbolicLink()) {
        continue;
      }

      if (stats.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        this.processDirectory(fullPath);
      } else if (file.endsWith('.vue')) {
        this.processFile(fullPath);
      }
    }
  }

  /**
   * 向上查找可执行的 prettier 二进制
   */
  findPrettierBin(startDir) {
    let current = path.resolve(startDir);
    const prettierBinName = process.platform === 'win32' ? 'prettier.cmd' : 'prettier';

    while (true) {
      const candidate = path.join(current, 'node_modules', '.bin', prettierBinName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }

      const parent = path.dirname(current);
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  }

  /**
   * 格式化文件（调用 prettier）
   */
  formatFile(filePath) {
    const absFilePath = path.resolve(filePath);
    const prettierBin = this.findPrettierBin(path.dirname(absFilePath));

    try {
      // 优先使用项目本地安装的 prettier，避免命令环境不一致
      if (prettierBin) {
        execFileSync(prettierBin, ['--write', absFilePath], {
          stdio: 'pipe',
          cwd: path.dirname(absFilePath)
        });
      } else {
        // 兜底：尝试系统 PATH 中的 prettier
        execFileSync('prettier', ['--write', absFilePath], {
          stdio: 'pipe',
          cwd: process.cwd()
        });
      }
      console.log(`[已格式化] ${filePath}`);
    } catch (e) {
      const reason = (e.stderr && e.stderr.toString().trim())
        || (e.stdout && e.stdout.toString().trim())
        || e.message;
      console.log(`[跳过格式化] ${filePath} (${reason})`);
    }
  }

  /**
   * 处理单个文件
   */
  processFile(filePath) {
    console.log(`处理文件: ${filePath}`);
    this.currentFile = filePath;

    const content = fs.readFileSync(filePath, 'utf-8');
    const processed = this.processVueFile(content);

    if (content !== processed) {
      if (this.dryRun) {
        console.log(`[预览] 将修改: ${filePath}`);
        // 显示部分差异
        const lines = processed.split('\n').slice(0, 30);
        console.log('---');
        console.log(lines.join('\n'));
        console.log('...\n');
      } else {
        fs.writeFileSync(filePath, processed, 'utf-8');
        console.log(`[已修改] ${filePath}`);
        // 替换完成后格式化文件
        this.formatFile(filePath);
      }
    }
  }

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

    // 确保目录存在
    if (!fs.existsSync(this.i18nDir)) {
      fs.mkdirSync(this.i18nDir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[已写入] ${filePath} (${Object.keys(data).length} 条翻译)`);
  }

  /**
   * 将提取的中文文本写入语言文件（翻译值留空，由 AI agent 翻译）
   */
  saveExtractedTexts() {
    const texts = Array.from(this.extractedTexts);

    if (texts.length === 0) {
      console.log('\n没有需要处理的中文文本');
      return;
    }

    console.log(`\n=== 翻译文件处理 ===`);
    console.log(`共 ${texts.length} 条中文文本`);

    // 读取现有翻译
    const existingTranslations = this.readLangFile(this.lang);

    // 找出需要添加的新文本
    const newTexts = texts.filter(text => !(text in existingTranslations));

    if (newTexts.length === 0) {
      console.log('所有文本已存在于翻译文件中');
      return;
    }

    if (this.dryRun) {
      console.log(`[预览模式] 将添加 ${newTexts.length} 条新文本（翻译值留空）:`);
      newTexts.slice(0, 10).forEach(t => console.log(`  "${t}": ""`));
      if (newTexts.length > 10) {
        console.log(`  ... 还有 ${newTexts.length - 10} 条`);
      }
      return;
    }

    // 添加空翻译占位
    for (const text of newTexts) {
      existingTranslations[text] = '';
    }

    this.writeLangFile(this.lang, existingTranslations);
    console.log(`已添加 ${newTexts.length} 条新文本（翻译值留空，请使用 i18n-text agent 进行翻译）`);
  }

  /**
   * 输出提取的中文文本摘要
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
  }
}

// CLI 入口
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Vue i18n 中文替换工具 (中文为键)

用法：
  node vue-i18n-replace.js <file|directory> [options]

选项：
  --dry-run       只预览，不修改文件
  --i18n-dir      i18n 目录路径 (默认: ./src/i18n)
  --lang          目标语言 (默认: en)

示例：
  node vue-i18n-replace.js ./src --dry-run
  node vue-i18n-replace.js ./src --i18n-dir ./src/i18n --lang en

工作流程：
  1. 扫描 Vue 文件，用 $t('中文') 包裹中文文本
  2. 将中文 key 写入 <i18n-dir>/<lang>.json（翻译值留空）
  3. 由 AI i18n-text agent 子代理完成翻译
`);
    process.exit(0);
  }

  const targetPath = args[0];

  // 解析参数
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

  const options = {
    dryRun: args.includes('--dry-run'),
    i18nDir: getArgValue('--i18n-dir', DEFAULT_CONFIG.i18nDir),
    lang: getArgValue('--lang', DEFAULT_CONFIG.lang)
  };

  if (!fs.existsSync(targetPath)) {
    console.error(`错误: 路径不存在 - ${targetPath}`);
    process.exit(1);
  }

  console.log('=== Vue i18n 替换工具 ===');
  console.log(`目标路径: ${targetPath}`);
  console.log(`i18n 目录: ${options.i18nDir}`);
  console.log(`目标语言: ${options.lang}`);
  if (options.dryRun) console.log('[预览模式]');
  console.log('');

  const replacer = new VueI18nReplacer(options);
  replacer.process(targetPath);
  replacer.outputSummary();
  replacer.saveExtractedTexts();

  console.log('\n替换完成！请使用 i18n-text agent 子代理进行翻译。');
}

main();
