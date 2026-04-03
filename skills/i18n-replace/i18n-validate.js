#!/usr/bin/env node
/**
 * i18n 替换后自动验证脚本
 * 扫描代码中的高危 $t() 使用模式 + 检查翻译 JSON 质量
 *
 * 用法：
 *   node i18n-validate.js <directory> [options]
 *
 * 选项：
 *   --type <vue|html>       项目类型 (默认: 自动检测)
 *   --i18n-dir <path>       i18n 目录路径 (默认: ./src/i18n)
 *   --lang <lang>           目标语言 (默认: tw)
 *   --check-translation     仅检查翻译 JSON 质量
 *   --check-json            仅检查 JSON 可疑条目
 *   --fix                   自动修复裸 $t() → window.$t()
 */

const fs = require('fs');
const path = require('path');

// ===== CLI =====

function getArgValue(name, defaultVal) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : defaultVal;
}

const targetDir = process.argv[2];
const projectType = getArgValue('--type', 'auto');
const i18nDir = getArgValue('--i18n-dir', './src/i18n');
const lang = getArgValue('--lang', 'tw');
const checkTranslation = process.argv.includes('--check-translation');
const checkJson = process.argv.includes('--check-json');
const fixMode = process.argv.includes('--fix');

if (!targetDir || targetDir.startsWith('-') || process.argv.includes('--help')) {
  console.log(`i18n 验证脚本

用法：
  node i18n-validate.js <directory> [options]

选项：
  --type <vue|html>       项目类型 (默认: 自动检测)
  --i18n-dir <path>       i18n 目录路径 (默认: ./src/i18n)
  --lang <lang>           目标语言 (默认: tw)
  --check-translation     仅检查翻译 JSON 质量
  --check-json            仅检查 JSON 可疑条目
  --fix                   自动修复裸 $t() → window.$t()

退出码：
  0  全部通过
  1  存在 🔴 严重 或 🟠 高危 问题`);
  process.exit(0);
}

// ===== Patterns =====

const VUE_PATTERNS = [
  { regex: /case\s+.*\$t\s*\(/,                       severity: '🔴', name: 'switch case 中 $t' },
  { regex: /[=!]==?\s*\$t\s*\(/,                      severity: '🔴', name: '等值比较中 $t' },
  { regex: /\$t\s*\([^)]*\)\s*[=!]==?/,               severity: '🔴', name: '$t 后等值比较' },
  { regex: /\.(?:indexOf|includes)\s*\(\s*\$t\s*\(/,  severity: '🔴', name: 'indexOf/includes 中 $t' },
  { regex: /\$router.*name.*\$t\s*\(/,                severity: '🟠', name: '路由 name 中 $t' },
  { regex: /showRouter\s*\(.*\$t/,                    severity: '🟠', name: 'showRouter 中 $t' },
  { regex: /(?:habit|localStorage).*\$t\s*\(/,        severity: '🟠', name: '存储键中 $t' },
  { regex: /(?:EventBus|\$bus).*\$t\s*\(/,            severity: '🟠', name: 'EventBus 中 $t' },
  { regex: /el-tab-pane[^>]*:name=.*\$t/,             severity: '🟡', name: 'el-tab name 中 $t' },
  { regex: /:prop=.*\$t\s*\(/,                        severity: '🟡', name: 'el-table prop 中 $t' },
];

const HTML_PATTERNS = [
  { regex: /<option[^>]*data-i18n-value/,              severity: '🔴', name: 'option value 标记' },
  { regex: /type=["']hidden["'][^>]*data-i18n/,        severity: '🔴', name: 'hidden input 标记' },
  { regex: /data-i18n-data-/,                          severity: '🟠', name: 'data-* 业务属性' },
  { regex: /data-i18n-value=/,                         severity: '🟠', name: 'value 属性标记' },
  { regex: /querySelector.*\$t\s*\(/,                  severity: '🟡', name: 'querySelector 中 $t' },
];

// ===== Scan Functions =====

function scanFile(filePath, patterns) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];
  lines.forEach((line, idx) => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    for (const p of patterns) {
      if (p.regex.test(line)) {
        issues.push({ file: filePath, line: idx + 1, content: line.trim().substring(0, 120), severity: p.severity, name: p.name });
      }
    }
  });
  return issues;
}

function detectBareT(filePath, content) {
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (!scriptMatch) return [];
  const scriptLines = scriptMatch[1].split('\n');
  const scriptStart = content.substring(0, content.indexOf(scriptMatch[0])).split('\n').length;
  const issues = [];
  scriptLines.forEach((line, idx) => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    if (line.includes('window.$t') || line.includes('this.$t')) return;
    if (/(?<!\w)\$t\s*\(/.test(line)) {
      issues.push({ file: filePath, line: scriptStart + idx, content: line.trim().substring(0, 120), severity: '🟠', name: '裸 $t()（缺少 window.）' });
    }
  });
  return issues;
}

function fixBareT(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const scriptMatch = content.match(/(<script[^>]*>)([\s\S]*?)(<\/script>)/);
  if (!scriptMatch) return 0;
  let count = 0;
  const lines = scriptMatch[2].split('\n');
  const fixedLines = lines.map(line => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return line;
    if (line.includes('window.$t') || line.includes('this.$t')) return line;
    const fixed = line.replace(/(?<!\w)(?<!window\.)(?<!this\.)\$t\s*\(/g, 'window.$t(');
    if (fixed !== line) count++;
    return fixed;
  });
  if (count > 0) {
    const newContent = content.replace(scriptMatch[2], fixedLines.join('\n'));
    fs.writeFileSync(filePath, newContent, 'utf-8');
  }
  return count;
}

/**
 * 读取语言包文件（支持 .js 和 .json 格式）
 * wx 项目用 .js（module.exports = {...}），其他用 .json
 */
function readLangData(i18nDirPath, langCode) {
  const jsPath = path.join(i18nDirPath, `${langCode}.js`);
  const jsonPath = path.join(i18nDirPath, `${langCode}.json`);

  if (fs.existsSync(jsPath)) {
    const content = fs.readFileSync(jsPath, 'utf-8');
    const jsonStr = content.replace(/^module\.exports\s*=\s*/, '').replace(/\s*;?\s*$/, '');
    return { data: JSON.parse(jsonStr), filePath: jsPath };
  }
  if (fs.existsSync(jsonPath)) {
    return { data: JSON.parse(fs.readFileSync(jsonPath, 'utf-8')), filePath: jsonPath };
  }
  return null;
}

function validateTranslationJSON(i18nDirPath, langCode) {
  const issues = [];
  let data;
  try {
    const result = readLangData(i18nDirPath, langCode);
    if (!result) {
      issues.push({ severity: '🟠', name: '翻译文件不存在', content: `${langCode}.json / ${langCode}.js` });
      return issues;
    }
    data = result.data;
  } catch (e) {
    issues.push({ severity: '🔴', name: '语言包解析失败', content: e.message });
    return issues;
  }

  // 空值遗漏
  const emptyKeys = Object.entries(data).filter(([, v]) => typeof v === 'string' && v.trim() === '').map(([k]) => k);
  if (emptyKeys.length > 0) {
    issues.push({ severity: '🟠', name: `未翻译空值 (${emptyKeys.length})`, content: emptyKeys.slice(0, 10).join(', ') });
  }

  // 插值变量一致性
  const varRe = /\{([^}]+)\}/g;
  for (const [key, val] of Object.entries(data)) {
    if (typeof val !== 'string' || !val) continue;
    const kv = [...key.matchAll(varRe)].map(m => m[1]).sort();
    const vv = [...val.matchAll(varRe)].map(m => m[1]).sort();
    if (JSON.stringify(kv) !== JSON.stringify(vv)) {
      issues.push({ severity: '🔴', name: '变量不一致', content: `"${key.substring(0, 40)}" → key vars: [${kv}] vs val vars: [${vv}]` });
    }
  }

  return issues;
}

function detectSuspiciousKeys(i18nDirPath, langCode) {
  let data;
  try {
    const result = readLangData(i18nDirPath, langCode);
    if (!result) return [];
    data = result.data;
  } catch { return []; }
  const suspicious = [];
  const VENDOR_TEXTS = ['首页', '上一页', '下一页', '末页', '加载中', '拖拽对象无效', '确定', '取消', '提示'];
  for (const key of Object.keys(data)) {
    if (key.includes('|') && key.split('|').length > 2) {
      suspicious.push({ key, reason: '疑似数据映射字段（含多个管道符）' });
    }
    if (VENDOR_TEXTS.includes(key)) {
      suspicious.push({ key, reason: '疑似第三方组件文本' });
    }
  }
  return suspicious;
}

// ===== File Collection =====

function collectFiles(dir, exts) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && !['node_modules', 'dist', 'build', 'vendor', 'lib', 'third-party'].includes(entry.name)) {
      results.push(...collectFiles(fp, exts));
    } else if (exts.some(e => entry.name.endsWith(e)) && !entry.name.endsWith('.min.js')) {
      results.push(fp);
    }
  }
  return results;
}

// ===== Main =====

const type = projectType === 'auto'
  ? (fs.existsSync(path.join(targetDir, 'src')) ? 'vue' : 'html')
  : projectType;
const patterns = type === 'vue' ? VUE_PATTERNS : HTML_PATTERNS;
const exts = type === 'vue' ? ['.vue', '.js', '.jsx'] : ['.html', '.htm', '.js', '.ts'];
const files = collectFiles(targetDir, exts);
const allIssues = [];

// Code scan
if (!checkTranslation && !checkJson) {
  for (const f of files) {
    allIssues.push(...scanFile(f, patterns));
    if (type === 'vue' && f.endsWith('.vue')) {
      const content = fs.readFileSync(f, 'utf-8');
      if (fixMode) {
        const count = fixBareT(f);
        if (count > 0) console.log(`  🔧 修复 ${count} 处裸 $t(): ${f}`);
      } else {
        allIssues.push(...detectBareT(f, content));
      }
    }
  }
}

// Translation quality
if (checkTranslation || (!checkJson && !checkTranslation)) {
  allIssues.push(...validateTranslationJSON(i18nDir, lang));
}

// Suspicious JSON entries
if (checkJson) {
  const suspicious = detectSuspiciousKeys(i18nDir, lang);
  if (suspicious.length > 0) {
    console.log(`\n🟡 可疑 JSON 条目 (${suspicious.length}):`);
    suspicious.forEach(s => console.log(`  "${s.key}" — ${s.reason}`));
  }
  if (suspicious.length === 0) {
    console.log('\n✅ 未发现可疑 JSON 条目');
  }
}

// Report
console.log(`\n=== i18n 验证报告 ===`);
console.log(`📁 路径: ${targetDir}  📋 类型: ${type}  🔍 文件: ${files.length}`);

const grouped = { '🔴': [], '🟠': [], '🟡': [] };
for (const i of allIssues) {
  if (grouped[i.severity]) grouped[i.severity].push(i);
}

for (const [sev, items] of Object.entries(grouped)) {
  if (items.length > 0) {
    console.log(`\n${sev} (${items.length}):`);
    items.slice(0, 20).forEach(i => {
      const loc = i.file ? `  ${i.file}${i.line ? ':' + i.line : ''}` : '  ';
      console.log(`${loc}  ${i.name} — ${i.content || ''}`);
    });
    if (items.length > 20) console.log(`  ... 及其他 ${items.length - 20} 处`);
  }
}

const hasProblems = grouped['🔴'].length > 0 || grouped['🟠'].length > 0;
console.log(`\n=== 总结 ===`);
console.log(`🔴 ${grouped['🔴'].length}  🟠 ${grouped['🟠'].length}  🟡 ${grouped['🟡'].length}`);
console.log(hasProblems ? '退出码: 1 (存在严重/高危问题)' : '退出码: 0 (全部通过)');
process.exit(hasProblems ? 1 : 0);
