#!/usr/bin/env node
/**
 * i18n 初始化脚本
 * 创建翻译目录，生成 i18n.js 和语言 JSON 文件
 *
 * 用法：
 *   node i18n-init.js <directory> [options]
 *
 * 选项：
 *   --langs      需要翻译的目标语言，逗号分隔 (默认: tw)
 *   --type       输出类型: esm, browser, vue (默认: vue)
 */

const fs = require('fs');
const path = require('path');

// 默认配置
const DEFAULT_CONFIG = {
  langs: ['tw']
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

// 模块加载时立即检测语言（同步，确保 $img 等在其他模块顶层代码中可用）
// 优先级：window.__I18N_LANG__ > URL参数lang > cookie i18n_lang > localStorage > html[lang] > 默认 zh
let currentLang = (function() {
  try {
    // 1. 全局变量预配置
    if (typeof window !== 'undefined' && window.__I18N_LANG__) return window.__I18N_LANG__;
    // 2. URL 参数 ?lang=tw
    if (typeof location !== 'undefined') {
      var m = location.search.match(/[?&]lang=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    // 3. Cookie
    if (typeof document !== 'undefined' && document.cookie) {
      var c = document.cookie.match(/(?:^|;\\s*)i18n_lang=([^;]+)/);
      if (c) return decodeURIComponent(c[1]);
    }
    // 4. localStorage
    if (typeof localStorage !== 'undefined') {
      var saved = localStorage.getItem('i18n_lang');
      if (saved) return saved;
    }
    // 5. HTML lang 属性（后台可通过模板设置 <html lang="tw">）
    if (typeof document !== 'undefined' && document.documentElement.lang && document.documentElement.lang !== 'zh') {
      return document.documentElement.lang;
    }
    return 'zh';
  } catch(e) { return 'zh'; }
})();
const _initialLang = currentLang; // 记录模块加载时的语言，用于 initI18n 判断是否需要刷新

// 支持的语言代码（防止路径遍历攻击）
const VALID_LANG_REGEX = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

// 图片 CSS 变量注册表 { varName: { path, raw } }
const imgVarRegistry = {};

/**
 * 图片路径转换
 * @param {string} path - 原始图片路径
 * @param {boolean} raw - 为 true 时返回原始路径，不做语言转换
 * @returns {string} 当前语言对应的图片路径
 * @example $img('/images/banner.png') // tw → '/images/banner_tw.png'
 * @example $img('/images/banner.png', true) // 始终返回原始路径
 */
function $img(path, raw) {
  if (raw || currentLang === 'zh' || !path) return path;
  const cleanPath = path.split('?')[0].split('#')[0];
  const suffix = path.substring(cleanPath.length);
  const dotIndex = cleanPath.lastIndexOf('.');
  if (dotIndex === -1) return path;
  return cleanPath.substring(0, dotIndex) + '_' + currentLang + cleanPath.substring(dotIndex) + suffix;
}

/**
 * 设置图片 CSS 变量
 * @param {string} varName - CSS 变量名，如 '--banner-bg'
 * @param {string} path - 原始图片路径
 * @param {boolean} raw - 为 true 时使用原始路径，不做语言转换
 * @example $imgVar('--banner-bg', '/images/banner.png')
 *          // CSS 中使用: background-image: var(--banner-bg);
 * @example $imgVar('--banner-bg', '/images/banner.png', true) // 始终使用原图
 */
function $imgVar(varName, path, raw) {
  imgVarRegistry[varName] = { path: path, raw: !!raw };
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty(varName, "url('" + $img(path, raw) + "')");
  }
}

/**
 * 更新所有已注册的图片 CSS 变量（语言切换时自动调用）
 */
function _updateImgVars() {
  if (typeof document === 'undefined') return;
  for (const varName in imgVarRegistry) {
    const item = imgVarRegistry[varName];
    document.documentElement.style.setProperty(varName, "url('" + $img(item.path, item.raw) + "')");
  }
}

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

  // 语言回退链：en-US → en → zh（原始 key）
  const baseLang = currentLang.split('-')[0];
  if (baseLang !== currentLang && messages[baseLang] && messages[baseLang][text]) {
    return interpolate(messages[baseLang][text], params);
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
  // 未传参且无其他来源时，使用模块加载时自动检测的语言（避免与 _initialLang 不匹配导致死循环刷新）
  lang = lang || currentLang;

  // 如果目标语言和模块加载时检测到的语言不同，说明模块加载阶段用了错误的语言
  // 其他模块顶层的 $img() 调用结果已经是错的，需要保存后刷新页面
  // 刷新后 localStorage 已有正确值，模块加载时就能拿到正确语言，不会再刷
  if (lang !== _initialLang) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    }
    if (typeof location !== 'undefined') {
      console.log(\`[i18n] Language mismatch (module loaded: \${_initialLang}, target: \${lang}), reloading...\`);
      location.reload();
      return;
    }
  }

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

  // 更新图片 CSS 变量
  _updateImgVars();

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

  // 更新图片 CSS 变量
  _updateImgVars();

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
  window.$img = $img;
  window.$imgVar = $imgVar;
  window.$setLang = setLang;
  window.$getLang = getLang;
  window.$getSupportedLangs = getSupportedLangs;
  window.$onLangChange = onLangChange;
  window.initI18n = initI18n;
}

// Vue 2 自动挂载（import Vue 后 Vue 即在作用域内）
import Vue from 'vue'
Vue.prototype.$t = $t
Vue.prototype.$img = $img

export { $t, $img, $imgVar, initI18n, setLang, getLang, getSupportedLangs, onLangChange, messages, SUPPORTED_LANGS };
export default { $t, $img, $imgVar, initI18n, setLang, getLang, getSupportedLangs, onLangChange };
`;

// ESM 版本
const I18N_ESM_TEMPLATE = `/**
 * i18n 国际化模块
 * 基准语言：中文简体
 * 使用方式：$t("中文文本") 返回对应语言的翻译
 */

// 模块加载时立即检测语言（同步）
// 优先级：window.__I18N_LANG__ > URL参数lang > cookie > localStorage > html[lang] > 默认 zh
let currentLang = (function() {
  try {
    if (typeof window !== 'undefined' && window.__I18N_LANG__) return window.__I18N_LANG__;
    if (typeof location !== 'undefined') {
      var m = location.search.match(/[?&]lang=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    if (typeof document !== 'undefined' && document.cookie) {
      var c = document.cookie.match(/(?:^|;\\s*)i18n_lang=([^;]+)/);
      if (c) return decodeURIComponent(c[1]);
    }
    if (typeof localStorage !== 'undefined') {
      var saved = localStorage.getItem('i18n_lang');
      if (saved) return saved;
    }
    if (typeof document !== 'undefined' && document.documentElement.lang && document.documentElement.lang !== 'zh') {
      return document.documentElement.lang;
    }
    return 'zh';
  } catch(e) { return 'zh'; }
})();
const _initialLang = currentLang;

// 翻译数据缓存
const messages = {
  zh: {},
  {{langKeys}}
};

// 支持的语言代码（防止路径遍历攻击）
const VALID_LANG_REGEX = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

// 图片 CSS 变量注册表 { varName: { path, raw } }
const imgVarRegistry = {};

/**
 * 图片路径转换
 * @param {string} path - 原始图片路径
 * @param {boolean} raw - 为 true 时返回原始路径，不做语言转换
 * @returns {string} 当前语言对应的图片路径
 */
function $img(path, raw) {
  if (raw || currentLang === 'zh' || !path) return path;
  const cleanPath = path.split('?')[0].split('#')[0];
  const suffix = path.substring(cleanPath.length);
  const dotIndex = cleanPath.lastIndexOf('.');
  if (dotIndex === -1) return path;
  return cleanPath.substring(0, dotIndex) + '_' + currentLang + cleanPath.substring(dotIndex) + suffix;
}

/**
 * 设置图片 CSS 变量
 * @param {string} varName - CSS 变量名，如 '--banner-bg'
 * @param {string} path - 原始图片路径
 * @param {boolean} raw - 为 true 时使用原始路径，不做语言转换
 */
function $imgVar(varName, path, raw) {
  imgVarRegistry[varName] = { path: path, raw: !!raw };
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty(varName, "url('" + $img(path, raw) + "')");
  }
}

/**
 * 更新所有已注册的图片 CSS 变量
 */
function _updateImgVars() {
  if (typeof document === 'undefined') return;
  for (const varName in imgVarRegistry) {
    const item = imgVarRegistry[varName];
    document.documentElement.style.setProperty(varName, "url('" + $img(item.path, item.raw) + "')");
  }
}

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
async function initI18n(lang) {
  // 未传参时使用模块加载时自动检测的语言（避免与 _initialLang 不匹配导致死循环刷新）
  lang = lang || currentLang;
  if (lang !== _initialLang) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('i18n_lang', lang);
    }
    if (typeof location !== 'undefined') {
      console.log(\`[i18n] Language mismatch (module loaded: \${_initialLang}, target: \${lang}), reloading...\`);
      location.reload();
      return;
    }
  }

  currentLang = lang;
  if (lang !== 'zh') {
    await loadLang(lang);
  }
  // 设置 HTML lang 属性
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
  // 更新图片 CSS 变量
  _updateImgVars();
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
function $t(text, params = {}) {
  if (currentLang === 'zh') {
    return interpolate(text, params);
  }

  const langData = messages[currentLang] || {};
  const translated = langData[text];

  if (translated) {
    return interpolate(translated, params);
  }

  // 语言回退链：en-US → en → zh（原始 key）
  const baseLang = currentLang.split('-')[0];
  if (baseLang !== currentLang && messages[baseLang] && messages[baseLang][text]) {
    return interpolate(messages[baseLang][text], params);
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
  // 更新图片 CSS 变量
  _updateImgVars();
}

/**
 * 获取当前语言
 */
function getLang() {
  return currentLang;
}

// 导出
export { $t, $img, $imgVar, initI18n, setLang, getLang, messages };
export default { $t, $img, $imgVar, initI18n, setLang, getLang };
`;

// 浏览器版本 (使用 window 全局变量 $t)
const I18N_BROWSER_TEMPLATE = `/**
 * i18n 国际化模块 (浏览器版本)
 * 基准语言：中文简体
 * 使用方式：$t("中文文本") 返回对应语言的翻译
 */

(function(global) {
  // 立即检测语言（同步）
  // 优先级：window.__I18N_LANG__ > URL参数lang > cookie > localStorage > html[lang] > 默认 zh
  var currentLang = (function() {
    try {
      if (typeof window !== 'undefined' && window.__I18N_LANG__) return window.__I18N_LANG__;
      if (typeof location !== 'undefined') {
        var m = location.search.match(/[?&]lang=([^&]+)/);
        if (m) return decodeURIComponent(m[1]);
      }
      if (typeof document !== 'undefined' && document.cookie) {
        var c = document.cookie.match(/(?:^|;\\s*)i18n_lang=([^;]+)/);
        if (c) return decodeURIComponent(c[1]);
      }
      if (typeof localStorage !== 'undefined') {
        var saved = localStorage.getItem('i18n_lang');
        if (saved) return saved;
      }
      if (typeof document !== 'undefined' && document.documentElement.lang && document.documentElement.lang !== 'zh') {
        return document.documentElement.lang;
      }
      return 'zh';
    } catch(e) { return 'zh'; }
  })();
  var _initialLang = currentLang;

  // i18n 资源路径（相对于 HTML 页面，可通过 window.__I18N_PATH__ 自定义）
  var I18N_BASE_PATH = (typeof window.__I18N_PATH__ === 'string') ? window.__I18N_PATH__ : './i18n/';
  if (I18N_BASE_PATH.charAt(I18N_BASE_PATH.length - 1) !== '/') I18N_BASE_PATH += '/';

  // 翻译数据缓存
  var messages = {
    zh: {},
    {{langKeys}}
  };

  // 支持的语言代码（防止路径遍历攻击）
  var VALID_LANG_REGEX = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

  // 模块加载时同步预加载翻译数据（确保后续脚本中 $t() 立即可用）
  // 仅在非中文环境下执行，对小型静态项目可接受
  if (currentLang !== 'zh' && VALID_LANG_REGEX.test(currentLang)) {
    try {
      var syncXhr = new XMLHttpRequest();
      syncXhr.open('GET', I18N_BASE_PATH + currentLang + '.json', false);
      syncXhr.send();
      if (syncXhr.status === 200) {
        messages[currentLang] = JSON.parse(syncXhr.responseText);
      }
    } catch(e) {
      console.warn('[i18n] Sync preload failed for ' + currentLang + ', will retry async');
    }
  }

  // 图片 CSS 变量注册表 { varName: { path, raw } }
  var imgVarRegistry = {};

  /**
   * 图片路径转换
   * @param {string} path - 原始图片路径
   * @param {boolean} raw - 为 true 时返回原始路径，不做语言转换
   * @returns {string} 当前语言对应的图片路径
   */
  function $img(path, raw) {
    if (raw || currentLang === 'zh' || !path) return path;
    var cleanPath = path.split('?')[0].split('#')[0];
    var suffix = path.substring(cleanPath.length);
    var dotIndex = cleanPath.lastIndexOf('.');
    if (dotIndex === -1) return path;
    return cleanPath.substring(0, dotIndex) + '_' + currentLang + cleanPath.substring(dotIndex) + suffix;
  }

  /**
   * 设置图片 CSS 变量
   * @param {string} varName - CSS 变量名，如 '--banner-bg'
   * @param {string} path - 原始图片路径
   * @param {boolean} raw - 为 true 时使用原始路径，不做语言转换
   */
  function $imgVar(varName, path, raw) {
    imgVarRegistry[varName] = { path: path, raw: !!raw };
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty(varName, "url('" + $img(path, raw) + "')");
    }
  }

  /**
   * 更新所有已注册的图片 CSS 变量
   */
  function _updateImgVars() {
    if (typeof document === 'undefined') return;
    for (var varName in imgVarRegistry) {
      var item = imgVarRegistry[varName];
      document.documentElement.style.setProperty(varName, "url('" + $img(item.path, item.raw) + "')");
    }
  }

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

    // 通过 XHR 加载 JSON 语言包
    var xhr = new XMLHttpRequest();
    xhr.open('GET', I18N_BASE_PATH + lang + '.json', true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            messages[lang] = JSON.parse(xhr.responseText);
          } catch(e) {
            console.warn('[i18n] Failed to parse ' + lang + ' language pack');
          }
        } else {
          console.warn('[i18n] Failed to load ' + lang + ' language pack');
        }
        callback && callback();
      }
    };
    xhr.send();
  }

  /**
   * 初始化 i18n
   */
  function initI18n(lang, callback) {
    // 未传参时使用模块加载时自动检测的语言（避免与 _initialLang 不匹配导致死循环刷新）
    lang = lang || currentLang;
    if (lang !== _initialLang) {
      try { localStorage.setItem('i18n_lang', lang); } catch(e) {}
      console.log('[i18n] Language mismatch (module loaded: ' + _initialLang + ', target: ' + lang + '), reloading...');
      location.reload();
      return;
    }
    currentLang = lang;
    // 设置 HTML lang 属性
    if (typeof document !== 'undefined') {
      document.documentElement.lang = currentLang;
    }
    // 更新图片 CSS 变量
    _updateImgVars();
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

    var langData = messages[currentLang] || {};
    var translated = langData[text];

    if (translated) {
      return interpolate(translated, params);
    }

    // 语言回退链：en-US → en → zh（原始 key）
    var baseLang = currentLang.split('-')[0];
    if (baseLang !== currentLang && messages[baseLang] && messages[baseLang][text]) {
      return interpolate(messages[baseLang][text], params);
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
        if (typeof document !== 'undefined') {
          document.documentElement.lang = lang;
        }
        _updateImgVars();
        callback && callback();
      });
    } else {
      currentLang = lang;
      if (typeof document !== 'undefined') {
        document.documentElement.lang = lang;
      }
      _updateImgVars();
      callback && callback();
    }
  }

  /**
   * 获取当前语言
   */
  function getLang() {
    return currentLang;
  }

  /**
   * 应用 data-i18n 属性翻译（配合 html-i18n-replace.js 使用）
   * 遍历 DOM 中所有带 data-i18n 标记的元素，替换文本和属性
   */
  function applyI18n(root) {
    root = root || document;

    // 替换文本内容（仅替换没有子元素的纯文本节点，避免覆盖子元素）
    var elements = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var key = el.getAttribute('data-i18n');
      if (!key) continue;

      // 如果元素没有子元素，直接替换 textContent
      if (el.children.length === 0) {
        el.textContent = $t(key);
      } else {
        // 有子元素时，只替换直接文本节点，保留子元素
        var childNodes = el.childNodes;
        for (var c = 0; c < childNodes.length; c++) {
          if (childNodes[c].nodeType === 3 && childNodes[c].textContent.trim()) {
            childNodes[c].textContent = $t(key);
            break; // 只替换第一个非空文本节点
          }
        }
      }
    }

    // 替换属性（data-i18n-placeholder, data-i18n-title 等）
    var allElements = root.querySelectorAll('*');
    for (var j = 0; j < allElements.length; j++) {
      var node = allElements[j];
      var attrs = node.attributes;
      for (var k = 0; k < attrs.length; k++) {
        var attrName = attrs[k].name;
        if (attrName.indexOf('data-i18n-') === 0) {
          var targetAttr = attrName.replace('data-i18n-', '');
          var attrKey = attrs[k].value;
          if (attrKey && targetAttr) {
            node.setAttribute(targetAttr, $t(attrKey));
          }
        }
      }
    }
  }

  // 导出到全局
  global.i18n = {
    $t: $t,
    $img: $img,
    $imgVar: $imgVar,
    initI18n: initI18n,
    setLang: setLang,
    getLang: getLang,
    applyI18n: applyI18n,
    messages: messages
  };

  // 快捷方式
  global.$t = $t;
  global.$img = $img;
  global.$imgVar = $imgVar;
  global.$setLang = setLang;
  global.$getLang = getLang;
  global.initI18n = initI18n;
  global.applyI18n = applyI18n;

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
  --langs      目标语言，逗号分隔 (默认: tw)
  --type       输出类型: esm, browser, vue (默认: vue)

示例：
  node i18n-init.js ./src/i18n                        # Vue 项目
  node i18n-init.js ./src/i18n --langs en,ja,ko        # 多语言
  node i18n-init.js ./i18n --type browser              # 静态 HTML/JS 项目（根目录下）
  node i18n-init.js ./src/i18n --type vue              # Vue 项目

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
    langs: langsIndex !== -1 ? getArgValue(langsIndex, 'tw').split(',') : ['tw'],
    type: getArgValue(typeIndex, 'vue')
  };

  const initializer = new I18nInitializer(options);
  initializer.init(targetDir);
}

main();
