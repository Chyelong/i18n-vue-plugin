/**
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
    en: {}
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

    return text.replace(/\{(\w+)\}/g, function(match, key) {
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
    initI18n: initI18n,
    setLang: setLang,
    getLang: getLang,
    applyI18n: applyI18n,
    messages: messages
  };

  // 快捷方式
  global.$t = $t;
  global.$setLang = setLang;
  global.$getLang = getLang;
  global.initI18n = initI18n;
  global.applyI18n = applyI18n;

})(typeof window !== 'undefined' ? window : this);
