const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { WxI18nReplacer } = require('../skills/i18n-replace/wx-i18n-replace');

const wxmlFixturePath = path.join(__dirname, 'fixtures', 'sample.wxml');
const jsFixturePath = path.join(__dirname, 'fixtures', 'sample-wx.js');
const wxmlContent = fs.readFileSync(wxmlFixturePath, 'utf-8');
const jsContent = fs.readFileSync(jsFixturePath, 'utf-8');

// ==================== 1. Fixture validation tests ====================

describe('WxI18nReplacer fixture validation', () => {
  it('wxml fixture exists and has Chinese content', () => {
    assert.ok(wxmlContent.length > 0, 'wxml fixture should not be empty');
    assert.ok(wxmlContent.includes('你好世界'), 'wxml fixture should contain Chinese text');
  });

  it('js fixture exists and has Chinese content', () => {
    assert.ok(jsContent.length > 0, 'js fixture should not be empty');
    assert.ok(jsContent.includes('加载成功'), 'js fixture should contain Chinese text');
  });

  it('wxml fixture contains skip scenarios (wx:if, data binding, already-replaced)', () => {
    assert.ok(wxmlContent.includes('wx:if'), 'missing wx:if scenario');
    assert.ok(wxmlContent.includes('{{loading}}'), 'missing data binding scenario');
    assert.ok(wxmlContent.includes("{{$t['已替换']}}"), 'missing already-replaced scenario');
  });

  it('js fixture contains skip scenarios (wx.setStorageSync, console.log, require, comparison)', () => {
    assert.ok(jsContent.includes('wx.setStorageSync'), 'missing wx.setStorageSync scenario');
    assert.ok(jsContent.includes('console.log'), 'missing console.log scenario');
    assert.ok(jsContent.includes('require('), 'missing require scenario');
    assert.ok(jsContent.includes("=== '已完成'"), 'missing comparison scenario');
  });
});

// ==================== 2. WXML processing unit tests ====================

describe('WxI18nReplacer WXML processing', () => {
  it('replaces plain text content', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processWxml('<text>你好世界</text>');
    assert.ok(result.includes("{{$t['你好世界']}}"), `Expected $t wrap, got: ${result}`);
  });

  it('replaces attribute values', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processWxml('<input placeholder="请输入手机号" />');
    assert.ok(
      result.includes("placeholder=\"{{$t['请输入手机号']}}\""),
      `Expected attribute replacement, got: ${result}`
    );
  });

  it('skips wx:if expressions but replaces text content', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processWxml('<view wx:if="{{status === \'已完成\'}}">完成</view>');
    // wx:if attribute value should NOT be replaced with $t wrap
    assert.ok(!result.includes("wx:if=\"{{$t"), 'wx:if value should not be $t-wrapped');
    // But text content SHOULD be replaced
    assert.ok(result.includes("{{$t['完成']}}"), `Text content should be replaced, got: ${result}`);
  });

  it('skips already wrapped content (no double-wrap)', () => {
    const replacer = new WxI18nReplacer();
    const input = "<view>{{$t['已替换']}}</view>";
    const result = replacer.processWxml(input);
    // Should stay unchanged, no double wrapping
    assert.ok(!result.includes("$t[$t"), 'Should not double-wrap');
    assert.ok(result.includes("{{$t['已替换']}}"), 'Already wrapped content should be preserved');
  });

  it('skips comments and preserves them', () => {
    const replacer = new WxI18nReplacer();
    const input = '<!-- 这是注释 --><text>测试文本</text>';
    const result = replacer.processWxml(input);
    assert.ok(result.includes('<!-- 这是注释 -->'), 'Comment should be preserved');
    assert.ok(result.includes("{{$t['测试文本']}}"), 'Text outside comment should be replaced');
  });

  it('handles mixed text with interpolation', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processWxml('<view>共{{num}}件商品</view>');
    // Chinese parts around the interpolation should be split and wrapped
    assert.ok(result.includes("{{$t['共']}}"), `Expected '共' to be wrapped, got: ${result}`);
    assert.ok(result.includes("{{$t['件商品']}}"), `Expected '件商品' to be wrapped, got: ${result}`);
    assert.ok(result.includes('{{num}}'), 'Interpolation should be preserved');
  });
});

// ==================== 3. JS processing unit tests ====================

describe('WxI18nReplacer JS processing', () => {
  it('replaces string literals with global.$t', () => {
    const replacer = new WxI18nReplacer();
    const result = replacer.processScript("wx.showToast({ title: '加载成功' })");
    assert.ok(result.includes("global.$t('加载成功')"), `Expected global.$t wrap, got: ${result}`);
  });

  it('skips console.log', () => {
    const replacer = new WxI18nReplacer();
    const input = "    console.log('调试信息')";
    const result = replacer.processScript(input);
    assert.equal(result, input, 'console.log line should be unchanged');
  });

  it('skips require paths', () => {
    const replacer = new WxI18nReplacer();
    const input = "const utils = require('../../utils/工具.js')";
    const result = replacer.processScript(input);
    assert.ok(!result.includes("global.$t"), `require path should not be wrapped, got: ${result}`);
  });

  it('skips comparison operators', () => {
    const replacer = new WxI18nReplacer();
    const input = "if (status === '已完成') {}";
    const result = replacer.processScript(input);
    assert.ok(!result.includes("global.$t('已完成')"), `Comparison value should not be wrapped, got: ${result}`);
  });

  it('skips wx storage keys', () => {
    const replacer = new WxI18nReplacer();
    const input = "wx.setStorageSync('缓存键', data)";
    const result = replacer.processScript(input);
    assert.ok(!result.includes("global.$t('缓存键')"), `Storage key should not be wrapped, got: ${result}`);
  });

  it('skips comments', () => {
    const replacer = new WxI18nReplacer();
    const input = '// 这是注释';
    const result = replacer.processScript(input);
    assert.equal(result, input, 'Comment line should be unchanged');
  });

  it('handles template strings with Chinese', () => {
    const replacer = new WxI18nReplacer();
    const input = 'const msg = `共${count}件`';
    const result = replacer.processScript(input);
    assert.ok(result.includes("global.$t("), `Template string should be wrapped with global.$t, got: ${result}`);
  });
});

// ==================== 4. Object key skip tests ====================

describe('WxI18nReplacer JS object key skip', () => {
  it('skips Chinese string used as object key', () => {
    const replacer = new WxI18nReplacer();
    const input = "const map = { '管理功能': 'main01.png' }";
    const result = replacer.processScript(input);
    assert.ok(!result.includes("global.$t('管理功能')"), `Object key should not be wrapped, got: ${result}`);
    assert.ok(result.includes("'管理功能':"), 'Object key should remain unchanged');
  });

  it('still replaces Chinese string used as object value', () => {
    const replacer = new WxI18nReplacer();
    const input = "const obj = { key: '操作成功' }";
    const result = replacer.processScript(input);
    assert.ok(result.includes("global.$t('操作成功')"), `Object value should be wrapped, got: ${result}`);
  });
});

// ==================== 5. Language file .js format tests ====================

describe('WxI18nReplacer lang file .js format', () => {
  const os = require('os');
  let tmpDir;

  it('writeLangFile writes .js format with module.exports', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wx-lang-test-'));
    const replacer = new WxI18nReplacer({ i18nDir: tmpDir, lang: 'tw' });
    const data = { '你好': '你好', '世界': '世界' };
    replacer.writeLangFile('tw', data);

    const jsPath = path.join(tmpDir, 'tw.js');
    assert.ok(fs.existsSync(jsPath), 'tw.js should exist');

    const content = fs.readFileSync(jsPath, 'utf-8');
    assert.ok(content.startsWith('module.exports = '), 'Should start with module.exports');

    // Verify it can be required
    const loaded = require(jsPath);
    assert.equal(loaded['你好'], '你好');
    assert.equal(loaded['世界'], '世界');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('readLangFile reads .js format', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wx-lang-test-'));
    const jsPath = path.join(tmpDir, 'tw.js');
    fs.writeFileSync(jsPath, 'module.exports = {"测试": "測試"}\n', 'utf-8');

    const replacer = new WxI18nReplacer({ i18nDir: tmpDir, lang: 'tw' });
    const data = replacer.readLangFile('tw');
    assert.equal(data['测试'], '測試');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ==================== 6. Third-party library skip tests ====================

describe('WxI18nReplacer third-party library skip', () => {
  it('skips echarts files by name', () => {
    const replacer = new WxI18nReplacer();
    // echarts file should be detected by the filename pattern
    assert.ok(/^(echarts|chart|ec-canvas|wxParse|WxParse|weui|vant|iview)\b/i.test('echarts.js'));
    assert.ok(/^(echarts|chart|ec-canvas|wxParse|WxParse|weui|vant|iview)\b/i.test('ec-canvas.js'));
    assert.ok(!/^(echarts|chart|ec-canvas|wxParse|WxParse|weui|vant|iview)\b/i.test('mypage.js'));
  });
});

// ==================== 7. Integration tests (dry-run) ====================

describe('WxI18nReplacer dry-run integration', () => {
  it('processes sample.wxml without crashing', () => {
    const { execSync } = require('child_process');
    const result = execSync(
      'node skills/i18n-replace/wx-i18n-replace.js tests/fixtures/sample.wxml --dry-run --i18n-dir tests/fixtures',
      { encoding: 'utf-8', cwd: path.join(__dirname, '..') }
    );
    assert.ok(!result.includes('ReferenceError'), 'Should not throw ReferenceError');
    assert.ok(result.length > 0, 'Should produce output');
  });

  it('processes sample-wx.js without crashing', () => {
    const { execSync } = require('child_process');
    const result = execSync(
      'node skills/i18n-replace/wx-i18n-replace.js tests/fixtures/sample-wx.js --dry-run --i18n-dir tests/fixtures',
      { encoding: 'utf-8', cwd: path.join(__dirname, '..') }
    );
    assert.ok(!result.includes('ReferenceError'), 'Should not throw ReferenceError');
    assert.ok(result.length > 0, 'Should produce output');
  });
});
