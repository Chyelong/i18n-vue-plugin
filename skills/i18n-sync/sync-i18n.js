#!/usr/bin/env node
/**
 * i18n 翻译同步脚本
 * 扫描代码中所有 $t('中文') 调用，提取中文文本并写入语言文件（空值占位）
 * 翻译由 agent i18n-text 子代理完成
 *
 * 用法：
 *   node sync-i18n.js <file|directory> [options]
 *
 * 选项：
 *   --i18n-dir    i18n 目录路径 (默认: ./src/i18n)
 *   --lang        目标语言 (默认: en)
 *   --dry-run     只预览，不修改文件
 */

const fs = require('fs');
const path = require('path');

// 默认配置
const DEFAULT_CONFIG = {
  i18nDir: './src/i18n',
  lang: 'en'
};

// 匹配 $t('中文') 或 $t("中文") 中的中文文本
const I18N_CALL_REGEX = /\$t\s*\(\s*(['"])([\u4e00-\u9fa5][^'"]*)\1/g;

// 匹配 window.$t('中文')
const WINDOW_I18N_CALL_REGEX = /window\.\$t\s*\(\s*(['"])([\u4e00-\u9fa5][^'"]*)\1/g;

class I18nSyncer {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.i18nDir = options.i18nDir || DEFAULT_CONFIG.i18nDir;
    this.lang = options.lang || DEFAULT_CONFIG.lang;
    this.extractedTexts = new Set();
  }

  /**
   * 从文件内容中提取所有 $t() 调用的中文文本
   */
  extractFromContent(content) {
    let match;
    while ((match = I18N_CALL_REGEX.exec(content)) !== null) {
      const text = match[2].trim();
      if (text) {
        this.extractedTexts.add(text);
      }
    }
    I18N_CALL_REGEX.lastIndex = 0;

    while ((match = WINDOW_I18N_CALL_REGEX.exec(content)) !== null) {
      const text = match[2].trim();
      if (text) {
        this.extractedTexts.add(text);
      }
    }
    WINDOW_I18N_CALL_REGEX.lastIndex = 0;
  }

  /**
   * 处理单个文件
   */
  processFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.vue', '.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      return;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const beforeCount = this.extractedTexts.size;
      this.extractFromContent(content);
      const afterCount = this.extractedTexts.size;

      if (afterCount > beforeCount) {
        console.log(`[扫描] ${filePath} (+${afterCount - beforeCount})`);
      }
    } catch (e) {
      console.warn(`[跳过] 无法读取: ${filePath} (${e.message})`);
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
        stats = fs.lstatSync(fullPath);
      } catch (e) {
        continue;
      }

      if (stats.isSymbolicLink()) {
        continue;
      }

      if (stats.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist') {
        this.processDirectory(fullPath);
      } else if (stats.isFile()) {
        this.processFile(fullPath);
      }
    }
  }

  /**
   * 处理文件或目录
   */
  process(targetPath) {
    const stats = fs.statSync(targetPath);
    if (stats.isDirectory()) {
      this.processDirectory(targetPath);
    } else if (stats.isFile()) {
      this.processFile(targetPath);
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

    if (!fs.existsSync(this.i18nDir)) {
      fs.mkdirSync(this.i18nDir, { recursive: true });
    }

    // 按键排序
    const sorted = {};
    Object.keys(data).sort().forEach(key => {
      sorted[key] = data[key];
    });

    fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2), 'utf-8');
    console.log(`[已写入] ${filePath} (${Object.keys(sorted).length} 条)`);
  }

  /**
   * 同步：扫描并将未翻译的 key 写入语言文件（空值占位）
   */
  sync() {
    const texts = Array.from(this.extractedTexts);

    console.log(`\n=== 扫描结果 ===`);
    console.log(`共找到 ${texts.length} 条 $t() 调用`);

    if (texts.length === 0) {
      console.log('没有找到需要翻译的文本');
      return;
    }

    // 读取现有翻译
    const existingTranslations = this.readLangFile(this.lang);
    const existingCount = Object.keys(existingTranslations).length;
    console.log(`现有翻译: ${existingCount} 条`);

    // 找出需要翻译的新文本（不存在或为空的）
    const newTexts = texts.filter(text => !existingTranslations[text] || existingTranslations[text] === '');

    // 找出已有翻译的文本
    const existingTexts = texts.filter(text => existingTranslations[text] && existingTranslations[text] !== '');

    console.log(`已翻译: ${existingTexts.length} 条`);
    console.log(`待翻译: ${newTexts.length} 条`);

    if (newTexts.length === 0) {
      console.log('\n所有文本已有翻译，无需更新');
      return;
    }

    if (this.dryRun) {
      console.log('\n[预览模式] 将添加以下空值 key:');
      newTexts.slice(0, 20).forEach(t => console.log(`  "${t}"`));
      if (newTexts.length > 20) {
        console.log(`  ... 还有 ${newTexts.length - 20} 条`);
      }
      return;
    }

    // 将新文本写入语言文件，值为空字符串
    for (const text of newTexts) {
      existingTranslations[text] = '';
    }

    this.writeLangFile(this.lang, existingTranslations);
    console.log(`\n已添加 ${newTexts.length} 条空值 key，等待 agent i18n-text 翻译`);
  }
}

// CLI 入口
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
i18n 翻译同步工具

用法：
  node sync-i18n.js <file|directory> [options]

选项：
  --i18n-dir    i18n 目录路径 (默认: ./src/i18n)
  --lang        目标语言 (默认: en)
  --dry-run     只预览，不修改文件

示例：
  node sync-i18n.js ./src
  node sync-i18n.js ./src --dry-run
  node sync-i18n.js ./src --lang zh-TW
  node sync-i18n.js ./src/views/Home.vue

功能：
  1. 扫描代码中所有 $t('中文') 和 window.$t('中文') 调用
  2. 提取中文文本
  3. 与现有翻译文件对比，找出未翻译的文本
  4. 将未翻译的 key 写入语言文件（空值占位）
  5. 由 agent i18n-text 子代理完成翻译
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

  const options = {
    dryRun: args.includes('--dry-run'),
    i18nDir: getArgValue('--i18n-dir', DEFAULT_CONFIG.i18nDir),
    lang: getArgValue('--lang', DEFAULT_CONFIG.lang)
  };

  if (!fs.existsSync(targetPath)) {
    console.error(`错误: 路径不存在 - ${targetPath}`);
    process.exit(1);
  }

  console.log('=== i18n 翻译同步工具 ===');
  console.log(`目标路径: ${targetPath}`);
  console.log(`i18n 目录: ${options.i18nDir}`);
  console.log(`目标语言: ${options.lang}`);
  if (options.dryRun) console.log('[预览模式]');
  console.log('');

  const syncer = new I18nSyncer(options);
  syncer.process(targetPath);
  syncer.sync();

  console.log('\n完成！');
}

main();
