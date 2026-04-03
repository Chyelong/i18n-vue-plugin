#!/usr/bin/env node
/**
 * i18n 翻译同步脚本
 * 扫描代码中所有 $t() 调用、$t['key'] 引用和 data-i18n 标记，
 * 提取中文文本并写入语言文件（空值占位），再由 i18n-text agent 翻译
 *
 * 用法：
 *   node sync-i18n.js <file|directory> [options]
 *
 * 选项：
 *   --i18n-dir    i18n 目录路径 (默认: ./src/i18n)
 *   --lang        目标语言 (默认: tw)
 *   --type        项目类型: vue, browser, wx (默认: 自动检测)
 *   --dry-run     只预览，不修改文件
 */

const fs = require('fs');
const path = require('path');

// 默认配置
const DEFAULT_CONFIG = {
  i18nDir: './src/i18n',
  lang: 'tw'
};

// 匹配 $t('...中文...') — 同时覆盖 window.$t() 和 global.$t()
const I18N_CALL_REGEX = /\$t\s*\(\s*(['"`])((?:(?!\1).)*[\u4e00-\u9fa5]+(?:(?!\1).)*?)\1/g;

// 匹配 WXML 中的 $t['中文'] 方括号语法
const I18N_BRACKET_REGEX = /\$t\[\s*'([^']*[\u4e00-\u9fa5]+[^']*)'\s*\]/g;

// 匹配 data-i18n="中文" 和 data-i18n-{attr}="中文"
const DATA_I18N_REGEX = /data-i18n(?:-[\w-]+)?\s*=\s*"([^"]*[\u4e00-\u9fa5]+[^"]*)"/g;

// 支持的文件扩展名
const FILE_EXTS = ['.vue', '.js', '.ts', '.jsx', '.tsx', '.html', '.htm', '.wxml'];

// 跳过的目录
const SKIP_DIRS = ['node_modules', 'miniprogram_npm', 'dist', 'build'];

class I18nSyncer {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.i18nDir = options.i18nDir || DEFAULT_CONFIG.i18nDir;
    this.lang = options.lang || DEFAULT_CONFIG.lang;
    this.type = options.type || null; // vue, browser, wx — null 为自动检测
    this.extractedTexts = new Set();
  }

  /**
   * 从文件内容中提取所有 i18n 标记的中文文本
   */
  extractFromContent(content) {
    let match;

    // $t('中文') / window.$t('中文') / global.$t('中文')
    while ((match = I18N_CALL_REGEX.exec(content)) !== null) {
      const text = match[2].trim();
      if (text) this.extractedTexts.add(text);
    }
    I18N_CALL_REGEX.lastIndex = 0;

    // $t['中文'] (WXML 语法)
    while ((match = I18N_BRACKET_REGEX.exec(content)) !== null) {
      const text = match[1].trim();
      if (text) this.extractedTexts.add(text);
    }
    I18N_BRACKET_REGEX.lastIndex = 0;

    // data-i18n="中文" / data-i18n-{attr}="中文" (HTML 语法)
    while ((match = DATA_I18N_REGEX.exec(content)) !== null) {
      const text = match[1].trim();
      if (text) this.extractedTexts.add(text);
    }
    DATA_I18N_REGEX.lastIndex = 0;
  }

  /**
   * 处理单个文件
   */
  processFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!FILE_EXTS.includes(ext)) return;

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

      if (stats.isSymbolicLink()) continue;

      if (stats.isDirectory()) {
        if (file.startsWith('.')) continue;
        if (SKIP_DIRS.includes(file)) continue;
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
   * 检测项目类型
   */
  detectType() {
    if (this.type) return this.type;
    const jsPath = path.join(this.i18nDir, 'i18n.js');
    const behaviorPath = path.join(this.i18nDir, 'i18n-behavior.js');
    if (fs.existsSync(jsPath) && fs.existsSync(behaviorPath)) return 'wx';
    return 'vue';
  }

  /**
   * 读取现有语言文件（支持 .js 和 .json 格式）
   * 解析失败时抛出错误而非返回空对象，防止覆盖已有翻译
   */
  readLangFile(lang) {
    const jsPath = path.join(this.i18nDir, `${lang}.js`);
    const jsonPath = path.join(this.i18nDir, `${lang}.json`);

    // wx 项目优先读 .js
    if (fs.existsSync(jsPath)) {
      const content = fs.readFileSync(jsPath, 'utf-8');
      try {
        const jsonStr = content.replace(/^module\.exports\s*=\s*/, '').replace(/\s*;?\s*$/, '');
        return JSON.parse(jsonStr);
      } catch (e) {
        throw new Error(`语言文件解析失败: ${jsPath}\n  原因: ${e.message}\n  请先手动修复文件后再运行 sync`);
      }
    }

    if (fs.existsSync(jsonPath)) {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      try {
        return JSON.parse(content);
      } catch (e) {
        throw new Error(`语言文件解析失败: ${jsonPath}\n  原因: ${e.message}\n  请先手动修复文件后再运行 sync`);
      }
    }

    return {};
  }

  /**
   * 写入语言文件（根据项目类型选择 .js 或 .json）
   * 写入前检查：不允许已有翻译被覆盖为空值
   */
  writeLangFile(lang, data, existingData) {
    if (!fs.existsSync(this.i18nDir)) {
      fs.mkdirSync(this.i18nDir, { recursive: true });
    }

    // 安全检查：已翻译的条目不能变成空值
    if (existingData) {
      let lostCount = 0;
      for (const key of Object.keys(existingData)) {
        if (existingData[key] && (!data[key] || data[key] === '')) {
          lostCount++;
          if (lostCount <= 5) {
            console.error(`  [危险] 已翻译条目将被清空: "${key}": "${existingData[key]}" -> ""`);
          }
        }
      }
      if (lostCount > 0) {
        console.error(`\n[中止] 检测到 ${lostCount} 条已有翻译将被清空，sync 已中止！`);
        console.error('  这通常是因为语言文件被错误覆盖。请检查文件内容。');
        process.exit(1);
      }
    }

    // 按键排序
    const sorted = {};
    Object.keys(data).sort().forEach(key => {
      sorted[key] = data[key];
    });

    const type = this.detectType();
    if (type === 'wx') {
      const filePath = path.join(this.i18nDir, `${lang}.js`);
      fs.writeFileSync(filePath, `module.exports = ${JSON.stringify(sorted, null, 2)}\n`, 'utf-8');
      console.log(`[已写入] ${filePath} (${Object.keys(sorted).length} 条)`);
    } else {
      const filePath = path.join(this.i18nDir, `${lang}.json`);
      fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2), 'utf-8');
      console.log(`[已写入] ${filePath} (${Object.keys(sorted).length} 条)`);
    }
  }

  /**
   * 写入待翻译文件（只含空值条目，供 i18n-text agent 翻译后合并回来）
   */
  writePendingFile(lang, pendingData) {
    if (Object.keys(pendingData).length === 0) return null;

    const filePath = path.join(this.i18nDir, `${lang}.pending.json`);
    fs.writeFileSync(filePath, JSON.stringify(pendingData, null, 2), 'utf-8');
    console.log(`[已写入] ${filePath} (${Object.keys(pendingData).length} 条待翻译)`);
    return filePath;
  }

  /**
   * 合并翻译结果回主语言文件（保护已有翻译不被覆盖）
   */
  mergePendingFile(lang) {
    const pendingPath = path.join(this.i18nDir, `${lang}.pending.json`);
    if (!fs.existsSync(pendingPath)) {
      console.log('没有 pending 文件需要合并');
      return;
    }

    let pendingData;
    try {
      pendingData = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
    } catch (e) {
      console.error(`[错误] 无法解析 pending 文件: ${e.message}`);
      return;
    }

    const existingData = this.readLangFile(lang);
    let mergedCount = 0;

    for (const [key, value] of Object.entries(pendingData)) {
      // 只填入之前为空的条目，绝不覆盖已有翻译
      if (value && (!existingData[key] || existingData[key] === '')) {
        existingData[key] = value;
        mergedCount++;
      }
    }

    this.writeLangFile(lang, existingData, null);
    console.log(`[合并完成] 新增 ${mergedCount} 条翻译`);

    // 删除 pending 文件
    fs.unlinkSync(pendingPath);
    console.log(`[已删除] ${pendingPath}`);
  }

  /**
   * 同步：扫描并将未翻译的 key 写入语言文件（空值占位）
   */
  sync() {
    const texts = Array.from(this.extractedTexts);

    console.log('\n=== 扫描结果 ===');
    console.log(`共找到 ${texts.length} 条 i18n 标记`);

    if (texts.length === 0) {
      console.log('没有找到需要翻译的文本');
      return;
    }

    // 读取现有翻译（解析失败会抛错中止，不会返回空对象）
    const existingTranslations = this.readLangFile(this.lang);
    const existingCount = Object.keys(existingTranslations).length;
    const translatedCount = Object.values(existingTranslations).filter(v => v && v !== '').length;
    console.log(`现有条目: ${existingCount} 条（已翻译 ${translatedCount} 条）`);

    // 区分：待翻译 = 不存在或值为空
    const pendingTexts = texts.filter(text => !existingTranslations[text] || existingTranslations[text] === '');
    const alreadyTranslated = texts.filter(text => existingTranslations[text] && existingTranslations[text] !== '');

    console.log(`已翻译: ${alreadyTranslated.length} 条`);
    console.log(`待翻译: ${pendingTexts.length} 条`);

    if (pendingTexts.length === 0) {
      console.log('\n所有文本已有翻译，无需更新');
      return;
    }

    if (this.dryRun) {
      console.log('\n[预览模式] 将添加以下空值 key:');
      pendingTexts.slice(0, 20).forEach(t => console.log(`  "${t}"`));
      if (pendingTexts.length > 20) {
        console.log(`  ... 还有 ${pendingTexts.length - 20} 条`);
      }
      return;
    }

    // 保存修改前的快照（用于 writeLangFile 安全检查）
    const snapshot = { ...existingTranslations };

    // 构建待翻译数据（只含新条目，值为空）
    const pendingData = {};
    for (const text of pendingTexts) {
      existingTranslations[text] = existingTranslations[text] || '';
      pendingData[text] = '';
    }

    // 写入完整语言文件（带安全检查，用修改前快照对比）
    this.writeLangFile(this.lang, existingTranslations, snapshot);

    // 写入 pending 文件（只含待翻译条目，供 i18n-text agent 使用）
    const pendingPath = this.writePendingFile(this.lang, pendingData);

    console.log(`\n已添加 ${pendingTexts.length} 条空值 key`);
    if (pendingPath) {
      console.log(`\n待翻译文件: ${pendingPath}`);
      console.log('请让 i18n-text agent 翻译此文件，翻译完成后运行 --merge 合并回主文件');
    }
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
  node sync-i18n.js --merge [options]

选项：
  --i18n-dir    i18n 目录路径 (默认: ./src/i18n)
  --lang        目标语言 (默认: tw)
  --type        项目类型: vue, browser, wx (默认: 自动检测)
  --dry-run     只预览，不修改文件
  --merge       合并 pending 翻译回主语言文件（翻译完成后执行）

示例：
  node sync-i18n.js ./src
  node sync-i18n.js ./src --dry-run
  node sync-i18n.js ./pages --type wx --i18n-dir ./i18n
  node sync-i18n.js --merge --i18n-dir ./i18n --lang tw

工作流：
  1. 扫描代码中的 $t() / $t['key'] / data-i18n 标记
  2. 提取中文文本，写入语言文件（空值占位）
  3. 同时生成 <lang>.pending.json（只含待翻译条目）
  4. i18n-text agent 翻译 pending.json
  5. 运行 --merge 安全合并回主文件（不会覆盖已有翻译）

支持文件类型：.vue .js .ts .jsx .tsx .html .htm .wxml
`);
    process.exit(0);
  }

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
    lang: getArgValue('--lang', DEFAULT_CONFIG.lang),
    type: getArgValue('--type', null)
  };

  // --merge 模式：合并 pending 翻译
  if (args.includes('--merge')) {
    console.log('=== i18n 翻译合并 ===');
    console.log(`i18n 目录: ${options.i18nDir}`);
    console.log(`目标语言: ${options.lang}`);
    const syncer = new I18nSyncer(options);
    syncer.mergePendingFile(options.lang);
    console.log('\n完成！');
    return;
  }

  // 找第一个位置参数（跳过 flag 及其值）
  const flagsWithValues = ['--i18n-dir', '--lang', '--type'];
  const targetPath = (() => {
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        if (flagsWithValues.includes(args[i])) i++;
        continue;
      }
      return args[i];
    }
    return null;
  })();

  if (!targetPath || targetPath.startsWith('--')) {
    console.error('错误: 请提供目标路径');
    process.exit(1);
  }

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

// 支持 require 导入（测试用）和 CLI 直接运行
module.exports = { I18nSyncer };

if (require.main === module) {
  main();
}
