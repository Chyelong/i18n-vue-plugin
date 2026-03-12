#!/usr/bin/env node
/**
 * i18n 初始化脚本
 * 创建翻译目录，生成 i18n.js 和语言 JSON 文件
 *
 * 用法：
 *   node i18n-init.js <directory> [options]
 *
 * 选项：
 *   --langs      需要翻译的目标语言，逗号分隔 (默认: en)
 *   --type       输出类型: esm, browser, vue (默认: vue)
 */

const fs = require('fs');
const path = require('path');

// 默认配置
const DEFAULT_CONFIG = {
  langs: ['en']
};

// i18n.js 模板 - 简化版，只负责切换语言和翻译查找，不请求 API
const I18N_VUE_TEMPLATE = `/**
 * i18n 国际化模块
 * 基准语言：中文简体
 * 直接在 window 上注册 $t 全局函数
 */

// 翻译数据
const messages = {
  zh: {},
  {{langKeys}}
};

// 支持的语言列表
const SUPPORTED_LANGS = ['zh', {{langList}}];

// 语言切换事件监听器
const langChangeListeners = [];

// localStorage key
const LANG_STORAGE_KEY = 'i18n_lang';

let currentLang = 'zh';

// 支持的语言代码（防止路径遍历攻击）
const VALID_LANG_REGEX = /^[a-z]{2}(-[A-Z]{2})?$/;

/**
 * 插值处理
 */
function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\\{(\\w+)\\}/g, (match, key) => {
    return params.hasOwnProperty(key) ? params[key] : match;
  });
}

/**
 * 加载语言包
 */
async function loadLang(lang) {
  if (lang === 'zh') return;
  // 验证语言代码格式
  if (!VALID_LANG_REGEX.test(lang)) {
    console.warn(\`[i18n] Invalid language code: \${lang}\`);
    return;
  }
  try {
    const module = await import(\`./\${lang}.json\`);
    messages[lang] = module.default || module;
    console.log(\`[i18n] Loaded \${lang} language pack\`);
  } catch (e) {
    console.warn(\`[i18n] Failed to load \${lang}:\`, e.message);
  }
}

/**
 * 翻译函数
 */
function $t(text, params) {
  if (currentLang === 'zh') {
    return interpolate(text, params);
  }

  const langData = messages[currentLang] || {};
  const translated = langData[text];

  if (translated) {
    return interpolate(translated, params);
  }

  // 没有翻译，返回原文
  return interpolate(text, params);
}

/**
 * 初始化 i18n
 * @param {string} lang - 目标语言，默认自动检测
 */
async function initI18n(lang) {
  // 优先级：参数 > localStorage > 浏览器语言 > 默认 zh
  if (!lang && typeof localStorage !== 'undefined') {
    lang = localStorage.getItem(LANG_STORAGE_KEY);
  }
  if (!lang && typeof navigator !== 'undefined') {
    const browserLang = navigator.language.split('-')[0];
    if (SUPPORTED_LANGS.includes(browserLang)) {
      lang = browserLang;
    }
  }
  lang = lang || 'zh';

  currentLang = lang;
  if (lang !== 'zh') await loadLang(lang);

  // 保存到 localStorage
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  }

  // 设置 HTML lang 属性
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }

  console.log(\`[i18n] Initialized with language: \${lang}\`);
}

/**
 * 切换语言
 * @param {string} lang - 目标语言
 * @param {object} options - 选项 { reload: false, save: true }
 * @returns {Promise<string>} 切换后的语言
 */
async function setLang(lang, options = {}) {
  const { reload = false, save = true } = options;
  const oldLang = currentLang;

  if (!SUPPORTED_LANGS.includes(lang)) {
    console.warn(\`[i18n] Unsupported language: \${lang}, supported: \${SUPPORTED_LANGS.join(', ')}\`);
    return currentLang;
  }

  if (lang !== 'zh' && Object.keys(messages[lang] || {}).length === 0) {
    await loadLang(lang);
  }
  currentLang = lang;

  // 设置 HTML lang 属性
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }

  // 保存到 localStorage
  if (save && typeof localStorage !== 'undefined') {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  }

  // 触发语言切换事件
  langChangeListeners.forEach(fn => {
    try { fn(lang, oldLang); } catch (e) { console.error(e); }
  });

  // 刷新页面
  if (reload && typeof location !== 'undefined') {
    location.reload();
  }

  console.log(\`[i18n] Language changed: \${oldLang} -> \${lang}\`);
  return lang;
}

/**
 * 获取当前语言
 */
function getLang() {
  return currentLang;
}

/**
 * 获取支持的语言列表
 */
function getSupportedLangs() {
  return [...SUPPORTED_LANGS];
}

/**
 * 监听语言切换事件
 * @param {function} callback - 回调函数 (newLang, oldLang) => void
 * @returns {function} 取消监听的函数
 */
function onLangChange(callback) {
  langChangeListeners.push(callback);
  return () => {
    const index = langChangeListeners.indexOf(callback);
    if (index > -1) langChangeListeners.splice(index, 1);
  };
}

// 注册到 window 全局
if (typeof window !== 'undefined') {
  window.$t = $t;
  window.$setLang = setLang;
  window.$getLang = getLang;
  window.$getSupportedLangs = getSupportedLangs;
  window.$onLangChange = onLangChange;
  window.initI18n = initI18n;
}

export { $t, initI18n, setLang, getLang, getSupportedLangs, onLangChange, messages, SUPPORTED_LANGS };
export default { $t, initI18n, setLang, getLang, getSupportedLangs, onLangChange };
`;

// ESM 版本
const I18N_ESM_TEMPLATE = `/**
 * i18n 国际化模块
 * 基准语言：中文简体
 * 使用方式：t("中文文本") 返回对应语言的翻译
 */

// 当前语言
let currentLang = 'zh';

// 翻译数据缓存
const messages = {
  zh: {},
  {{langKeys}}
};

// 支持的语言代码（防止路径遍历攻击）
const VALID_LANG_REGEX = /^[a-z]{2}(-[A-Z]{2})?$/;

/**
 * 加载语言包
 */
async function loadLang(lang) {
  if (lang === 'zh') return;

  if (!VALID_LANG_REGEX.test(lang)) {
    console.warn(\`[i18n] Invalid language code: \${lang}\`);
    return;
  }

  try {
    const module = await import(\`./\${lang}.json\`);
    messages[lang] = module.default || module;
    console.log(\`[i18n] Loaded \${lang} language pack\`);
  } catch (e) {
    console.warn(\`[i18n] Failed to load \${lang} language pack:\`, e.message);
    messages[lang] = {};
  }
}

/**
 * 初始化 i18n
 * @param {string} lang - 目标语言 (zh, en, ja, ...)
 */
async function initI18n(lang = 'zh') {
  currentLang = lang;
  if (lang !== 'zh') {
    await loadLang(lang);
  }
  // 设置 HTML lang 属性
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
  console.log(\`[i18n] Initialized with language: \${lang}\`);
}

/**
 * 插值处理
 */
function interpolate(text, params) {
  if (!params || Object.keys(params).length === 0) {
    return text;
  }

  return text.replace(/\\{(\\w+)\\}/g, (match, key) => {
    return params.hasOwnProperty(key) ? params[key] : match;
  });
}

/**
 * 翻译函数
 * @param {string} text - 中文原文
 * @param {object} params - 插值参数 { name: '张三' }
 * @returns {string} 翻译后的文本
 */
function t(text, params = {}) {
  if (currentLang === 'zh') {
    return interpolate(text, params);
  }

  const langData = messages[currentLang] || {};
  const translated = langData[text];

  if (translated) {
    return interpolate(translated, params);
  }

  // 没有翻译，返回原文
  return interpolate(text, params);
}

/**
 * 切换语言
 */
async function setLang(lang) {
  if (lang !== 'zh' && Object.keys(messages[lang] || {}).length === 0) {
    await loadLang(lang);
  }
  currentLang = lang;
  // 设置 HTML lang 属性
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}

/**
 * 获取当前语言
 */
function getLang() {
  return currentLang;
}

// 导出
export { t, initI18n, setLang, getLang, messages };
export default { t, initI18n, setLang, getLang };
`;

// 浏览器版本 (使用 window 全局变量 $t)
const I18N_BROWSER_TEMPLATE = `/**
 * i18n 国际化模块 (浏览器版本)
 * 基准语言：中文简体
 * 使用方式：$t("中文文本") 返回对应语言的翻译
 */

(function(global) {
  // 当前语言
  let currentLang = 'zh';

  // 翻译数据缓存
  const messages = {
    zh: {},
    {{langKeys}}
  };

  // 支持的语言代码（防止路径遍历攻击）
  const VALID_LANG_REGEX = /^[a-z]{2}(-[A-Z]{2})?$/;

  /**
   * 加载语言包
   */
  function loadLang(lang, callback) {
    if (lang === 'zh') {
      callback && callback();
      return;
    }

    if (!VALID_LANG_REGEX.test(lang)) {
      console.warn('[i18n] Invalid language code: ' + lang);
      callback && callback();
      return;
    }

    // 检查是否已通过 script 标签加载
    const globalKey = 'i18n_' + lang;
    if (global[globalKey]) {
      messages[lang] = global[globalKey];
      callback && callback();
      return;
    }

    // 动态加载脚本
    const script = document.createElement('script');
    script.src = './' + lang + '.js';
    script.onload = function() {
      if (global[globalKey]) {
        messages[lang] = global[globalKey];
      }
      callback && callback();
    };
    script.onerror = function() {
      console.warn('[i18n] Failed to load ' + lang + ' language pack');
      callback && callback();
    };
    document.head.appendChild(script);
  }

  /**
   * 初始化 i18n
   */
  function initI18n(lang, callback) {
    currentLang = lang || 'zh';
    // 设置 HTML lang 属性
    if (typeof document !== 'undefined') {
      document.documentElement.lang = currentLang;
    }
    if (currentLang !== 'zh') {
      loadLang(currentLang, callback);
    } else {
      callback && callback();
    }
    console.log('[i18n] Initialized with language: ' + currentLang);
  }

  /**
   * 插值处理
   */
  function interpolate(text, params) {
    if (!params) return text;

    return text.replace(/\\{(\\w+)\\}/g, function(match, key) {
      return params.hasOwnProperty(key) ? params[key] : match;
    });
  }

  /**
   * 翻译函数
   */
  function $t(text, params) {
    if (currentLang === 'zh') {
      return interpolate(text, params);
    }

    const langData = messages[currentLang] || {};
    const translated = langData[text];

    if (translated) {
      return interpolate(translated, params);
    }

    // 没有翻译，返回原文
    return interpolate(text, params);
  }

  /**
   * 切换语言
   */
  function setLang(lang, callback) {
    if (lang !== 'zh' && Object.keys(messages[lang] || {}).length === 0) {
      loadLang(lang, function() {
        currentLang = lang;
        // 设置 HTML lang 属性
        if (typeof document !== 'undefined') {
          document.documentElement.lang = lang;
        }
        callback && callback();
      });
    } else {
      currentLang = lang;
      // 设置 HTML lang 属性
      if (typeof document !== 'undefined') {
        document.documentElement.lang = lang;
      }
      callback && callback();
    }
  }

  /**
   * 获取当前语言
   */
  function getLang() {
    return currentLang;
  }

  // 导出到全局
  global.i18n = {
    $t: $t,
    initI18n: initI18n,
    setLang: setLang,
    getLang: getLang,
    messages: messages
  };

  // 快捷方式
  global.$t = $t;
  global.$setLang = setLang;
  global.$getLang = getLang;
  global.initI18n = initI18n;

})(typeof window !== 'undefined' ? window : this);
`;

class I18nInitializer {
  constructor(options = {}) {
    this.langs = options.langs || DEFAULT_CONFIG.langs;
    this.type = options.type || 'vue'; // esm, browser, vue
  }

  init(targetDir) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log(`创建目录: ${targetDir}`);
    }

    // 生成 i18n.js
    this.generateI18nFile(targetDir);

    // 生成语言 JSON 文件
    this.generateLangFiles(targetDir);

    console.log(`\ni18n 初始化完成！`);
    console.log(`目录: ${targetDir}`);
    console.log(`基准语言: 中文简体 (zh)`);
    console.log(`目标语言: ${this.langs.join(', ')}`);
    console.log(`\n文件结构:`);
    console.log(`  ${targetDir}/`);
    console.log(`  ├── index.js       # 核心模块`);
    this.langs.forEach(lang => {
      console.log(`  └── ${lang}.json        # ${lang} 语言包`);
    });
  }

  generateI18nFile(dir) {
    const langKeys = this.langs.map(lang => `${lang}: {}`).join(',\n  ');
    const langList = this.langs.map(lang => `'${lang}'`).join(', ');

    let template;
    let filename = 'index.js';

    switch (this.type) {
      case 'browser':
        template = I18N_BROWSER_TEMPLATE;
        break;
      case 'vue':
        template = I18N_VUE_TEMPLATE;
        break;
      default:
        template = I18N_ESM_TEMPLATE;
    }

    const content = template
      .replace(/\{\{langKeys\}\}/g, langKeys)
      .replace(/\{\{langList\}\}/g, langList);

    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`生成: ${filename}`);
  }

  generateLangFiles(dir) {
    for (const lang of this.langs) {
      const filePath = path.join(dir, `${lang}.json`);

      if (fs.existsSync(filePath)) {
        console.log(`跳过 (已存在): ${lang}.json`);
        continue;
      }

      // 空对象，待 vue-i18n-replace.js 执行时填充
      const example = {};

      fs.writeFileSync(filePath, JSON.stringify(example, null, 2), 'utf-8');
      console.log(`生成: ${lang}.json`);
    }

    // 为浏览器环境生成 JS 格式的语言包
    if (this.type === 'browser') {
      for (const lang of this.langs) {
        const jsonPath = path.join(dir, `${lang}.json`);
        const jsPath = path.join(dir, `${lang}.js`);

        if (fs.existsSync(jsonPath)) {
          const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          const jsContent = `/**\n * ${lang.toUpperCase()} 语言包\n */\nwindow.i18n_${lang} = ${JSON.stringify(data, null, 2)};`;
          fs.writeFileSync(jsPath, jsContent, 'utf-8');
          console.log(`生成: ${lang}.js (浏览器版)`);
        }
      }
    }
  }
}

// CLI
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
i18n 初始化工具 (中文为键)

用法：
  node i18n-init.js <directory> [options]

选项：
  --langs      目标语言，逗号分隔 (默认: en)
  --type       输出类型: esm, browser, vue (默认: vue)

示例：
  node i18n-init.js ./src/i18n
  node i18n-init.js ./src/i18n --langs en,ja,ko
  node i18n-init.js ./public/i18n --type browser
  node i18n-init.js ./src/i18n --type vue

生成文件：
  index.js     核心模块（切换语言、$t 方法）
  en.json      英语翻译（由 vue-i18n-replace.js 填充）
`);
    process.exit(0);
  }

  const targetDir = args[0];

  const langsIndex = args.indexOf('--langs');
  const typeIndex = args.indexOf('--type');

  // 安全获取参数值
  const getArgValue = (index, defaultValue) => {
    if (index === -1) return defaultValue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      console.error(`错误: --${args[index].replace('--', '')} 参数缺少值`);
      process.exit(1);
    }
    return value;
  };

  const options = {
    langs: langsIndex !== -1 ? getArgValue(langsIndex, 'en').split(',') : ['en'],
    type: getArgValue(typeIndex, 'vue')
  };

  const initializer = new I18nInitializer(options);
  initializer.init(targetDir);
}

main();
