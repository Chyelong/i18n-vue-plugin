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

// 本地存储 key — 基础版（仅 localStorage，HTML 脚本用）
// Vue 脚本需扩展为含 habit 的版本
const STORAGE_KEY_REGEX_BASE = /(?:localStorage\s*\.\s*(?:get|set)Item)\s*\(\s*$/;

// 微信小程序存储 API key
const WX_STORAGE_REGEX = /wx\s*\.\s*(?:set|get|remove)Storage(?:Sync)?\s*\(\s*(?:\{\s*key\s*:\s*)?$/;

// ===== 线路 B 新增：源头跳过补齐 =====

// B1: body 字段协议（支付网关订单描述，翻译后对账/退款失败）
const BODY_FIELD_REGEX = /\bbody\s*:\s*$/;

// B2: $mode 业务标识（用于 storage/逻辑判断）
const MODE_FIELD_REGEX = /\$mode\s*:\s*$/;

// B3: checkOperate({ name: ... }) 的 name 参数
const CHECK_OPERATE_NAME_REGEX = /checkOperate\s*\([^)]*\bname\s*:\s*$/;

// B4: 双用途字段 tag_name/tag_box_name/recharge_tag_name 赋值
const DUAL_USE_FIELD_REGEX = /\b(?:tag_name|tag_box_name|recharge_tag_name)\s*=\s*$/;

// B5: 对象字面量 key（JavaScript 语法：对象 key 不能是函数调用）
// 注意：这个正则用于 afterMatch，不是 beforeMatch
const OBJECT_KEY_AFTER_REGEX = /^\s*:(?!:)/;

// B6: EventBus 事件名（on/emit/off/once 两侧必须一致）
const EVENTBUS_REGEX = /(?:EventBus|eventBus|\$bus|\$event)\s*\.\s*\$?(?:on|emit|off|once)\s*\(\s*$/;

// B7: 路由 name / showRouter 参数（路由技术标识符）
const ROUTER_NAME_REGEX = /(?:\$router\s*\.\s*(?:push|replace)\s*\(\s*\{[^}]*name\s*:\s*|showRouter\s*\(\s*)$/;

module.exports = {
  SWITCH_CASE_REGEX,
  BRACKET_ACCESS_REGEX,
  INDEX_MATCH_REGEX,
  STORAGE_KEY_REGEX_BASE,
  WX_STORAGE_REGEX,
  BODY_FIELD_REGEX,
  MODE_FIELD_REGEX,
  CHECK_OPERATE_NAME_REGEX,
  DUAL_USE_FIELD_REGEX,
  OBJECT_KEY_AFTER_REGEX,
  EVENTBUS_REGEX,
  ROUTER_NAME_REGEX,
};
