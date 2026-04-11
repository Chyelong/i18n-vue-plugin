/**
 * i18n 验证规则数据模块
 *
 * 每条规则结构：
 *   {
 *     id:         'V01',            // 唯一 id（V=vue, H=html, W=wx, A=新增跨类型, C=翻译质量）
 *     category:   'pattern',         // pattern | translation | cross-file | init
 *     scope:      'vue'|'wx'|'html'|'all',
 *     regex:      /.../,             // pattern 类规则用
 *     severity:   '🔴'|'🟠'|'🟡',
 *     name:       '简短名称',
 *     description:'详细说明',
 *     fix:        '修复建议'
 *   }
 */

const VUE_RULES = [
  { id: 'V01', category: 'pattern', scope: 'vue', regex: /case\s+.*\$t\s*\(/,                                            severity: '🔴', name: 'switch case 中 $t',       description: 'case 值来自后端，翻译后匹配失败', fix: 'case 值改回原始中文字面量' },
  { id: 'V02', category: 'pattern', scope: 'vue', regex: /[=!]==?\s*(?:window\.|this\.)?\$t\s*\(/,                        severity: '🔴', name: '等值比较中 $t',          description: '与后端数据比较，翻译后永远不等', fix: '比较值保持原始中文' },
  { id: 'V03', category: 'pattern', scope: 'vue', regex: /(?:window\.|this\.)?\$t\s*\([^)]*\)\s*[=!]==?/,                 severity: '🔴', name: '$t 后等值比较',         description: '与后端数据比较，翻译后永远不等', fix: '比较值保持原始中文' },
  { id: 'V04', category: 'pattern', scope: 'vue', regex: /\.(?:indexOf|includes)\s*\(\s*(?:window\.|this\.)?\$t\s*\(/,    severity: '🔴', name: 'indexOf/includes 中 $t', description: '匹配后端响应内容，翻译后失败', fix: '匹配值保持原始中文' },
  { id: 'V05', category: 'pattern', scope: 'vue', regex: /\$router.*name.*\$t\s*\(/,                severity: '🟠', name: '路由 name 中 $t',       description: '路由 name 是技术标识符', fix: '路由 name 保持原始中文或改 path' },
  { id: 'V06', category: 'pattern', scope: 'vue', regex: /showRouter\s*\(.*\$t/,                    severity: '🟠', name: 'showRouter 中 $t',      description: '权限/路由匹配标识符', fix: '参数保持原始中文' },
  { id: 'V07', category: 'pattern', scope: 'vue', regex: /(?:habit|localStorage).*\$t\s*\(/,        severity: '🟠', name: '存储键中 $t',           description: '持久化键翻译后读不到旧数据', fix: '存储键保持原始中文' },
  { id: 'V08', category: 'pattern', scope: 'vue', regex: /(?:EventBus|\$bus).*\$t\s*\(/,            severity: '🟠', name: 'EventBus 中 $t',        description: 'on/emit 事件名不匹配', fix: '事件名保持原始中文' },
  { id: 'V09', category: 'pattern', scope: 'vue', regex: /el-tab-pane[^>]*:name=.*\$t/,             severity: '🟡', name: 'el-tab name 中 $t',     description: 'tab 标识符不能翻译', fix: 'name 保持原始中文，label 用 $t' },
  { id: 'V10', category: 'pattern', scope: 'vue', regex: /:prop=.*\$t\s*\(/,                        severity: '🟡', name: 'el-table prop 中 $t',   description: '数据路径不能翻译', fix: 'prop 保持原字段名' },
];

const HTML_RULES = [
  { id: 'H01', category: 'pattern', scope: 'html', regex: /<option[^>]*data-i18n-value/,             severity: '🔴', name: 'option value 标记',    description: '表单提交值被翻译', fix: '去掉 data-i18n-value' },
  { id: 'H02', category: 'pattern', scope: 'html', regex: /type=["']hidden["'][^>]*data-i18n/,       severity: '🔴', name: 'hidden input 标记',    description: '纯业务数据', fix: '去掉 data-i18n' },
  { id: 'H03', category: 'pattern', scope: 'html', regex: /data-i18n-data-/,                         severity: '🟠', name: 'data-* 业务属性',      description: 'JS dataset 读取值变了', fix: '去掉 data-i18n-data-*' },
  { id: 'H04', category: 'pattern', scope: 'html', regex: /data-i18n-value=/,                        severity: '🟠', name: 'value 属性标记',       description: '下拉选项提交值', fix: '去掉 data-i18n-value' },
  { id: 'H05', category: 'pattern', scope: 'html', regex: /querySelector.*\$t\s*\(/,                 severity: '🟡', name: 'querySelector 中 $t',  description: '选择器失效', fix: '选择器保持原始字符串' },
];

const WX_RULES = [
  { id: 'W01', category: 'pattern', scope: 'wx', regex: /case\s+.*global\.\$t\s*\(/,                              severity: '🔴', name: 'switch case 中 global.$t',       description: 'case 值来自后端，翻译后匹配失败', fix: 'case 值保持原始中文' },
  { id: 'W02', category: 'pattern', scope: 'wx', regex: /[=!]==?\s*global\.\$t\s*\(/,                             severity: '🔴', name: '等值比较中 global.$t',          description: '与后端数据比较，翻译后永远不等', fix: '比较值保持原始中文' },
  { id: 'W03', category: 'pattern', scope: 'wx', regex: /global\.\$t\s*\([^)]*\)\s*[=!]==?/,                      severity: '🔴', name: 'global.$t 后等值比较',         description: '与后端数据比较，翻译后永远不等', fix: '比较值保持原始中文' },
  { id: 'W04', category: 'pattern', scope: 'wx', regex: /\.(?:indexOf|includes)\s*\(\s*global\.\$t\s*\(/,         severity: '🔴', name: 'indexOf/includes 中 global.$t', description: '匹配后端响应内容', fix: '匹配值保持原始中文' },
  { id: 'W05', category: 'pattern', scope: 'wx', regex: /wx\.(?:set|get|remove)Storage.*global\.\$t\s*\(/,        severity: '🟠', name: 'wx 存储键中 global.$t',        description: '持久化键翻译后读不到旧数据', fix: '存储键保持原始中文' },
  { id: 'W06', category: 'pattern', scope: 'wx', regex: /wx\.(?:navigateTo|redirectTo).*global\.\$t\s*\(/,        severity: '🟠', name: 'wx 路由参数中 global.$t',      description: 'URL/路由参数不能翻译', fix: '参数保持原字符串' },
  { id: 'W07', category: 'pattern', scope: 'wx', regex: /\[.*global\.\$t\s*\(/,                                   severity: '🟡', name: '方括号访问中 global.$t',       description: '后端数据字段访问', fix: '字段名保持原字符串' },
  { id: 'W08', category: 'pattern', scope: 'wx', regex: /global\.\$t\s*\([^)]*\)\s*:/,                            severity: '🔴', name: '对象 key 中 global.$t',        description: '对象 key 不能是函数调用', fix: '改为计算属性 [global.$t("...")]' },
];

// ===== Phase 1 新增：通用高危规则（A 类，跨项目类型）=====

const A_RULES_COMMON = [
  {
    id: 'A1', category: 'pattern', scope: 'all',
    regex: /^\s*(?:window\.|global\.)?\$t\s*\([^)]*\)\s*:/,
    severity: '🔴',
    name: '对象字面量 key 用 $t()',
    description: 'JS 对象字面量 key 不能是函数调用，会导致 SyntaxError',
    fix: '改为计算属性 [window.$t("...")]: value'
  },
  {
    id: 'A2', category: 'pattern', scope: 'all',
    regex: /(?:window\.|global\.)?\$t\s*\(\s*(?:window\.|global\.)?\$t\s*\(/,
    severity: '🔴',
    name: '嵌套 $t($t(...))',
    description: '双重翻译，内层返回值已是翻译后文本，外层找不到 key',
    fix: '只保留一层 $t()'
  },
  {
    id: 'A4', category: 'pattern', scope: 'all',
    regex: /\bbody\s*:\s*(?:window\.|global\.)?\$t\s*\(/,
    severity: '🔴',
    name: 'body 字段被 $t 包裹（支付协议）',
    description: 'body 是支付网关订单描述字段，翻译后对账/退款失败',
    fix: 'body 保持原始中文或模板字符串拼接'
  },
  {
    id: 'A5', category: 'pattern', scope: 'all',
    regex: /\$mode\s*:\s*(?:window\.|global\.)?\$t\s*\(/,
    severity: '🔴',
    name: '$mode 业务标识被 $t 包裹',
    description: '$mode 用于 storage/逻辑判断，翻译后比较失败',
    fix: '$mode 保持原始中文'
  },
  {
    id: 'A6', category: 'pattern', scope: 'all',
    regex: /checkOperate\s*\([^)]*name\s*:\s*(?:window\.|global\.)?\$t/,
    severity: '🔴',
    name: 'checkOperate name 参数被 $t 包裹',
    description: 'checkOperate 内部用 indexOf 匹配原始中文（TM_h5 项目惯例，可配置禁用）',
    fix: 'name 参数保持原始中文',
    projectSpecific: true
  },
  {
    id: 'A7', category: 'pattern', scope: 'all',
    regex: /res\.(?:msg|message)\.indexOf\s*\(\s*(?:window\.|global\.)?\$t/,
    severity: '🔴',
    name: 'res.msg.indexOf 中 $t',
    description: '后端 msg 是中文，翻译后匹配失败',
    fix: '用 res.code 数值判断或保持原始中文'
  },
  {
    id: 'A8', category: 'pattern', scope: 'all',
    regex: /\bsort_label\s*[=!]==?\s*(?:window\.|global\.)?\$t/,
    severity: '🟠',
    name: 'sort_label 截取字段与 $t 比较',
    description: '后端字典截取值是中文，翻译后比较失败',
    fix: '保持原始中文比较'
  },
  {
    id: 'A9', category: 'pattern', scope: 'all',
    regex: /\b(?:tag_name|tag_box_name|recharge_tag_name)\s*=\s*(?:window\.|global\.)?\$t/,
    severity: '🟠',
    name: '双用途字段赋值被 $t 包裹',
    description: '字段同时用于后端数据传递和 UI 展示，赋值处翻译会导致后端数据失真',
    fix: '数据层保持原文，模板 {{ $t(item.tag_name) }} 翻译'
  },
  {
    id: 'A12', category: 'pattern', scope: 'all',
    regex: /__HTML_COMMENT_\d+__/,
    severity: '🔴',
    name: 'HTML 注释占位符残留',
    description: '替换脚本误把 HTML 注释吞进 $t()，或占位符未清理',
    fix: '移除占位符，注释从 $t 中移出'
  },
];

// ===== Phase 1 新增：wx 专有规则 =====

const A_RULES_WX = [
  {
    id: 'A3', category: 'pattern', scope: 'wx',
    regex: /\$t\[[^\]]*\$t\[/,
    severity: '🔴',
    name: 'WXML 嵌套 $t[...$t[...]]',
    description: 'WXML 模板编译会报错',
    fix: '只保留外层 $t[]，内层用变量或字面量'
  },
  {
    id: 'A10', category: 'pattern', scope: 'wx',
    regex: /,\s*,/,
    severity: '🟠',
    name: 'wx 双逗号语法错误',
    description: '替换脚本追加 $t 到解构时产生双逗号',
    fix: '删除多余逗号'
  },
  {
    id: 'A11', category: 'pattern', scope: 'wx',
    regex: /\$t\s*\([^)]*\)\)\)/,
    severity: '🟠',
    name: 'wx 多余闭合括号',
    description: '替换脚本包裹 $t 时多加了一个 )（三个连续 )）',
    fix: '删除多余的 )'
  },
];

// 把 A 类规则同时追加到三种项目类型
VUE_RULES.push(...A_RULES_COMMON);
WX_RULES.push(...A_RULES_COMMON, ...A_RULES_WX);
HTML_RULES.push(...A_RULES_COMMON);

function getRulesForType(type) {
  if (type === 'vue')  return VUE_RULES;
  if (type === 'wx')   return WX_RULES;
  if (type === 'html') return HTML_RULES;
  return [];
}

function findRule(id) {
  return [...VUE_RULES, ...HTML_RULES, ...WX_RULES].find(r => r.id === id);
}

module.exports = { VUE_RULES, HTML_RULES, WX_RULES, A_RULES_COMMON, getRulesForType, findRule };
