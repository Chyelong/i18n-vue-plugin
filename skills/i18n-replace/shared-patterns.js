/**
 * i18n 替换脚本共享的高危跳过规则
 * 被 vue-i18n-replace.js 和 html-i18n-replace.js 共同引用
 */

// switch/case 语句的 case 值（通常与后端数据比较）
const SWITCH_CASE_REGEX = /\bcase\s+$/;

// 方括号属性访问（如 item.data['类型']、obj['键名']）
const BRACKET_ACCESS_REGEX = /\[\s*$/;

// indexOf/includes 匹配后端数据
const INDEX_MATCH_REGEX = /\.(?:indexOf|includes)\s*\(\s*$/;

// 等值比较运算符后的中文字符串
const COMPARISON_REGEX = /[=!]==?\s*$/;

// 本地存储 key — 基础版（仅 localStorage，HTML 脚本用）
// Vue 脚本需扩展为含 habit 的版本
const STORAGE_KEY_REGEX_BASE = /(?:localStorage\s*\.\s*(?:get|set)Item)\s*\(\s*$/;

module.exports = {
  SWITCH_CASE_REGEX,
  BRACKET_ACCESS_REGEX,
  INDEX_MATCH_REGEX,
  COMPARISON_REGEX,
  STORAGE_KEY_REGEX_BASE,
};
