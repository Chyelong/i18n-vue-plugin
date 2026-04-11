#!/usr/bin/env node
/**
 * i18n 替换后自动验证脚本
 * 扫描代码中的高危 $t() 使用模式 + 检查翻译 JSON 质量
 *
 * 用法：
 *   node i18n-validate.js <directory> [options]
 *
 * 选项：
 *   --type <vue|html|wx>    项目类型 (默认: 自动检测)
 *   --i18n-dir <path>       i18n 目录路径 (默认: ./src/i18n)
 *   --lang <lang>           目标语言 (默认: tw)
 *   --check-translation     仅检查翻译 JSON 质量
 *   --check-json            仅检查 JSON 可疑条目
 *   --fix                   自动修复裸 $t() → window.$t()
 */

const fs = require('fs');
const path = require('path');

// ===== Patterns =====

const { getRulesForType } = require('./validate-rules');

// ===== Scan Functions =====

function scanFile(filePath, patterns) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];
  lines.forEach((line, idx) => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    for (const p of patterns) {
      if (p.regex.test(line)) {
        issues.push({
          id: p.id,
          category: p.category || 'pattern',
          file: filePath,
          line: idx + 1,
          content: line.trim().substring(0, 120),
          severity: p.severity,
          name: p.name,
          description: p.description,
          fix: p.fix
        });
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

  // 空值遗漏由 detectEmptyValues 替代（带白名单），此处不再重复检查

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

/**
 * A13: 扫描 JSON 源文本中未转义的中文弯引号（U+201C / U+201D）
 * 期望用 \u201C / \u201D 转义（避免 WXML 等上下文中解析歧义）
 */
function detectCurlyQuotes(jsonFilePath) {
  const issues = [];
  if (!fs.existsSync(jsonFilePath)) return issues;
  const content = fs.readFileSync(jsonFilePath, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (/[\u201C\u201D]/.test(line) && !line.includes('\\u201C') && !line.includes('\\u201D')) {
      issues.push({
        file: jsonFilePath,
        line: idx + 1,
        severity: '🟠',
        name: 'JSON 弯引号未转义',
        content: line.trim().substring(0, 120)
      });
    }
  });
  return issues;
}

/**
 * A14: 检测 ￥ (U+FFE5) / ¥ (U+00A5) 双字符映射完整性
 * 如果代码同时使用两种字符，翻译包必须两个字符都有映射 key
 */
function detectYenCoverage(jsonFilePath, codeUsage) {
  const issues = [];
  if (!codeUsage.fullwidth || !codeUsage.halfwidth) return issues;
  if (!fs.existsSync(jsonFilePath)) return issues;
  let data;
  try {
    const content = fs.readFileSync(jsonFilePath, 'utf-8');
    const parsed = jsonFilePath.endsWith('.js')
      ? JSON.parse(content.replace(/^module\.exports\s*=\s*/, '').replace(/\s*;?\s*$/, ''))
      : JSON.parse(content);
    data = parsed;
  } catch {
    return issues;
  }
  const hasFullwidth = Object.keys(data).some(k => k.includes('\uFFE5'));
  const hasHalfwidth = Object.keys(data).some(k => k.includes('\u00A5'));
  if (!hasFullwidth || !hasHalfwidth) {
    const missing = [];
    if (!hasFullwidth) missing.push('￥(U+FFE5)');
    if (!hasHalfwidth) missing.push('¥(U+00A5)');
    issues.push({
      file: jsonFilePath,
      severity: '🟡',
      name: '￥/¥ 双字符映射不完整',
      content: `代码使用两种字符但翻译包缺少 ${missing.join(', ')}`
    });
  }
  return issues;
}

/**
 * 扫描代码文件检测是否同时使用了 ￥ 和 ¥ 两种字符
 */
function scanYenUsageInCode(files) {
  let fullwidth = false, halfwidth = false;
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf-8');
    if (content.includes('\uFFE5')) fullwidth = true;
    if (content.includes('\u00A5')) halfwidth = true;
    if (fullwidth && halfwidth) break;
  }
  return { fullwidth, halfwidth };
}

/**
 * C1: 检测插值变量名本身被翻译
 * key "等待{item_待上机}分钟" vs val "Wait {item_Awaiting} minutes"
 * 变量名位置逐字符必须相同
 */
function detectVarNameTranslated(jsonFilePath) {
  const issues = [];
  let data;
  try {
    const content = fs.readFileSync(jsonFilePath, 'utf-8');
    data = jsonFilePath.endsWith('.js')
      ? JSON.parse(content.replace(/^module\.exports\s*=\s*/, '').replace(/\s*;?\s*$/, ''))
      : JSON.parse(content);
  } catch {
    return issues;
  }
  const varRe = /\{([^}]+)\}/g;
  for (const [key, val] of Object.entries(data)) {
    if (typeof val !== 'string' || !val) continue;
    const keyVars = [...key.matchAll(varRe)].map(m => m[1]);
    const valVars = [...val.matchAll(varRe)].map(m => m[1]);
    if (keyVars.length !== valVars.length) continue;
    for (let i = 0; i < keyVars.length; i++) {
      if (keyVars[i] !== valVars[i]) {
        issues.push({
          file: jsonFilePath,
          severity: '🔴',
          name: '插值变量名被翻译',
          content: `"${key.substring(0, 40)}" 变量 {${keyVars[i]}} → {${valVars[i]}}`
        });
        break;
      }
    }
  }
  return issues;
}

/**
 * C2: 检测 JSON key 简繁漂移
 * 通过简单的繁→简映射表做归一化对比，若两个 key 归一化后相同，视为漂移
 */
const TRAD_TO_SIMP_MAP = {
  '細': '细', '網': '网', '費': '费', '贈': '赠', '遊': '游',
  '帳': '账', '戶': '户', '訂': '订', '單': '单', '統': '统', '計': '计', '頁': '页',
  '確': '确', '認': '认', '設': '设', '備': '备', '電': '电', '話': '话', '際': '际',
  '個': '个', '處': '处', '產': '产', '關': '关', '開': '开', '發': '发', '現': '现',
  '實': '实', '點': '点', '檢': '检', '測': '测', '載': '载', '應': '应', '該': '该',
  '資': '资', '數': '数', '據': '据', '類': '类', '別': '别', '體': '体', '樣': '样',
};

function normalizeForDrift(s) {
  return [...s].map(c => TRAD_TO_SIMP_MAP[c] || c).join('');
}

function detectKeyDrift(jsonFilePath) {
  const issues = [];
  let data;
  try {
    const content = fs.readFileSync(jsonFilePath, 'utf-8');
    data = jsonFilePath.endsWith('.js')
      ? JSON.parse(content.replace(/^module\.exports\s*=\s*/, '').replace(/\s*;?\s*$/, ''))
      : JSON.parse(content);
  } catch {
    return issues;
  }
  const keys = Object.keys(data);
  const normalized = new Map();
  for (const k of keys) {
    const n = normalizeForDrift(k);
    if (normalized.has(n) && normalized.get(n) !== k) {
      issues.push({
        file: jsonFilePath,
        severity: '🟠',
        name: 'JSON key 简繁漂移',
        content: `"${normalized.get(n)}" 与 "${k}" 归一化后相同`
      });
    } else {
      normalized.set(n, k);
    }
  }
  return issues;
}

/**
 * C3: 检测重复翻译值（不同 key 翻译成相同 value）
 * 用于提醒翻译者区分语境（如"总价/总计/合计"全译为 Total）
 */
function detectDuplicateValues(jsonFilePath) {
  const issues = [];
  let data;
  try {
    const content = fs.readFileSync(jsonFilePath, 'utf-8');
    data = jsonFilePath.endsWith('.js')
      ? JSON.parse(content.replace(/^module\.exports\s*=\s*/, '').replace(/\s*;?\s*$/, ''))
      : JSON.parse(content);
  } catch {
    return issues;
  }
  const valMap = new Map();
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== 'string' || v.trim() === '') continue;
    if (!valMap.has(v)) valMap.set(v, []);
    valMap.get(v).push(k);
  }
  for (const [v, keys] of valMap.entries()) {
    if (keys.length >= 2) {
      issues.push({
        file: jsonFilePath,
        severity: '🟡',
        name: '重复翻译值',
        content: `"${v}" ← [${keys.join(', ')}]`
      });
    }
  }
  return issues;
}

/**
 * C4: 检测未翻译空值，支持白名单（￥/¥ 是允许的）
 */
const EMPTY_VALUE_WHITELIST = new Set(['\uFFE5', '\u00A5']);

function detectEmptyValues(jsonFilePath) {
  const issues = [];
  let data;
  try {
    const content = fs.readFileSync(jsonFilePath, 'utf-8');
    data = jsonFilePath.endsWith('.js')
      ? JSON.parse(content.replace(/^module\.exports\s*=\s*/, '').replace(/\s*;?\s*$/, ''))
      : JSON.parse(content);
  } catch {
    return issues;
  }
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== 'string' || v.trim() !== '') continue;
    if (EMPTY_VALUE_WHITELIST.has(k)) continue;
    issues.push({
      file: jsonFilePath,
      severity: '🟠',
      name: '未翻译空值',
      content: `"${k}" 空值未翻译`
    });
  }
  return issues;
}

// ===== File Collection =====

function collectFiles(dir, exts) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && !['node_modules', 'miniprogram_npm', 'dist', 'build', 'vendor', 'lib', 'libs', 'third-party', 'third_party'].includes(entry.name)) {
      results.push(...collectFiles(fp, exts));
    } else if (exts.some(e => entry.name.endsWith(e)) && !entry.name.endsWith('.min.js')) {
      results.push(fp);
    }
  }
  return results;
}

// ===== 模块导出（供测试使用）=====

module.exports = {
  scanFile,
  detectBareT,
  fixBareT,
  readLangData,
  validateTranslationJSON,
  detectSuspiciousKeys,
  detectCurlyQuotes,
  detectYenCoverage,
  scanYenUsageInCode,
  detectVarNameTranslated,
  detectKeyDrift,
  detectDuplicateValues,
  detectEmptyValues,
  collectFiles,
};

// ===== Main (CLI mode) =====

if (require.main === module) {
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
  const outputFormat = getArgValue('--format', 'text');
  const outFile = getArgValue('--out', null);

  if (!targetDir || targetDir.startsWith('-') || process.argv.includes('--help')) {
    console.log(`i18n 验证脚本

用法：
  node i18n-validate.js <directory> [options]

选项：
  --type <vue|html|wx>    项目类型 (默认: 自动检测)
  --i18n-dir <path>       i18n 目录路径 (默认: ./src/i18n)
  --lang <lang>           目标语言 (默认: tw)
  --check-translation     仅检查翻译 JSON 质量
  --check-json            仅检查 JSON 可疑条目
  --fix                   自动修复裸 $t() → window.$t()
  --format <text|json>    输出格式 (默认: text)
  --out <file>            写入文件 (默认: stdout)

退出码：
  0  全部通过
  1  存在 🔴 严重问题
  2  存在 🟠 高危问题（无 🔴）
  3  脚本自身错误`);
    process.exit(0);
  }

  const type = projectType === 'auto'
    ? (fs.existsSync(path.join(targetDir, 'app.json')) && !fs.existsSync(path.join(targetDir, 'src'))
        ? 'wx'
        : fs.existsSync(path.join(targetDir, 'src')) ? 'vue' : 'html')
    : projectType;
  const patterns = getRulesForType(type);
  const exts = type === 'wx' ? ['.wxml', '.js'] : type === 'vue' ? ['.vue', '.js', '.jsx'] : ['.html', '.htm', '.js', '.ts'];
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
    const langResult = readLangData(i18nDir, lang);
    if (langResult) {
      allIssues.push(...detectCurlyQuotes(langResult.filePath));
      const codeUsage = scanYenUsageInCode(files);
      allIssues.push(...detectYenCoverage(langResult.filePath, codeUsage));
      allIssues.push(...detectVarNameTranslated(langResult.filePath));
      allIssues.push(...detectKeyDrift(langResult.filePath));
      allIssues.push(...detectDuplicateValues(langResult.filePath));
      allIssues.push(...detectEmptyValues(langResult.filePath));
    }
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
  const grouped = { '🔴': [], '🟠': [], '🟡': [] };
  for (const i of allIssues) {
    if (grouped[i.severity]) grouped[i.severity].push(i);
  }
  const summary = {
    files: files.length,
    critical: grouped['🔴'].length,
    high: grouped['🟠'].length,
    warning: grouped['🟡'].length
  };

  // 退出码分级：0 全绿 / 1 有🔴 / 2 有🟠无🔴 / 3 脚本错误
  let exitCode = 0;
  if (summary.critical > 0) exitCode = 1;
  else if (summary.high > 0) exitCode = 2;

  if (outputFormat === 'json') {
    const report = {
      projectPath: targetDir,
      projectType: type,
      stats: summary,
      issues: allIssues.map(i => ({
        id: i.id || null,
        category: i.category || 'pattern',
        severity: i.severity,
        rule: i.name,
        description: i.description || null,
        file: i.file || null,
        line: i.line || null,
        snippet: i.content || null,
        fix: i.fix || null
      }))
    };
    const jsonStr = JSON.stringify(report, null, 2);
    if (outFile) {
      fs.writeFileSync(outFile, jsonStr, 'utf-8');
      console.log(`报告已写入 ${outFile}`);
    } else {
      console.log(jsonStr);
    }
  } else {
    console.log(`\n=== i18n 验证报告 ===`);
    console.log(`📁 路径: ${targetDir}  📋 类型: ${type}  🔍 文件: ${files.length}`);

    for (const [sev, items] of Object.entries(grouped)) {
      if (items.length > 0) {
        console.log(`\n${sev} (${items.length}):`);
        items.slice(0, 20).forEach(i => {
          const loc = i.file ? `  ${i.file}${i.line ? ':' + i.line : ''}` : '  ';
          const ruleId = i.id ? `[${i.id}] ` : '';
          console.log(`${loc}  ${ruleId}${i.name} — ${i.content || ''}`);
        });
        if (items.length > 20) console.log(`  ... 及其他 ${items.length - 20} 处`);
      }
    }

    console.log(`\n=== 总结 ===`);
    console.log(`🔴 ${summary.critical}  🟠 ${summary.high}  🟡 ${summary.warning}`);
    const codeLabel = { 0: '0 (全部通过)', 1: '1 (存在🔴严重问题)', 2: '2 (存在🟠高危问题)' }[exitCode];
    console.log(`退出码: ${codeLabel}`);
  }

  process.exit(exitCode);
}
