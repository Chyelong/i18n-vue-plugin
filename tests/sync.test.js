const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { I18nSyncer } = require('../skills/i18n-sync/sync-i18n');

// ==================== 1. 提取测试 ====================

describe('I18nSyncer extraction', () => {
  it('extracts $t() calls', () => {
    const syncer = new I18nSyncer();
    syncer.extractFromContent("const msg = $t('提交订单')");
    assert.ok(syncer.extractedTexts.has('提交订单'));
  });

  it('extracts global.$t() calls (wx)', () => {
    const syncer = new I18nSyncer();
    syncer.extractFromContent("wx.showToast({ title: global.$t('加载成功') })");
    assert.ok(syncer.extractedTexts.has('加载成功'));
  });

  it('extracts window.$t() calls (browser)', () => {
    const syncer = new I18nSyncer();
    syncer.extractFromContent("el.textContent = window.$t('操作成功')");
    assert.ok(syncer.extractedTexts.has('操作成功'));
  });

  it('extracts $t["key"] bracket syntax (wxml)', () => {
    const syncer = new I18nSyncer();
    syncer.extractFromContent("<text>{{$t['你好世界']}}</text>");
    assert.ok(syncer.extractedTexts.has('你好世界'));
  });

  it('extracts data-i18n attributes', () => {
    const syncer = new I18nSyncer();
    syncer.extractFromContent('<button data-i18n="确认删除">确认删除</button>');
    assert.ok(syncer.extractedTexts.has('确认删除'));
  });

  it('extracts data-i18n-{attr} attributes', () => {
    const syncer = new I18nSyncer();
    syncer.extractFromContent('<input data-i18n-placeholder="请输入">');
    assert.ok(syncer.extractedTexts.has('请输入'));
  });

  it('deduplicates across patterns', () => {
    const syncer = new I18nSyncer();
    syncer.extractFromContent("$t('测试'); window.$t('测试'); global.$t('测试')");
    assert.equal(syncer.extractedTexts.size, 1);
  });
});

// ==================== 2. 语言文件读写测试 ====================

describe('I18nSyncer lang file read/write', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads .json format', () => {
    fs.writeFileSync(path.join(tmpDir, 'tw.json'), '{"你好": "你好"}', 'utf-8');
    const syncer = new I18nSyncer({ i18nDir: tmpDir });
    const data = syncer.readLangFile('tw');
    assert.equal(data['你好'], '你好');
  });

  it('reads .js format (wx)', () => {
    fs.writeFileSync(path.join(tmpDir, 'tw.js'), 'module.exports = {"你好": "你好"}\n', 'utf-8');
    const syncer = new I18nSyncer({ i18nDir: tmpDir });
    const data = syncer.readLangFile('tw');
    assert.equal(data['你好'], '你好');
  });

  it('prefers .js over .json when both exist', () => {
    fs.writeFileSync(path.join(tmpDir, 'tw.js'), 'module.exports = {"来源": "js"}\n', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'tw.json'), '{"来源": "json"}', 'utf-8');
    const syncer = new I18nSyncer({ i18nDir: tmpDir });
    const data = syncer.readLangFile('tw');
    assert.equal(data['来源'], 'js');
  });

  it('throws on parse failure instead of returning empty', () => {
    fs.writeFileSync(path.join(tmpDir, 'tw.json'), '{invalid json!!!', 'utf-8');
    const syncer = new I18nSyncer({ i18nDir: tmpDir });
    assert.throws(() => syncer.readLangFile('tw'), /解析失败/);
  });

  it('returns empty object when no file exists', () => {
    const syncer = new I18nSyncer({ i18nDir: tmpDir });
    const data = syncer.readLangFile('tw');
    assert.deepEqual(data, {});
  });

  it('writes .json for vue type', () => {
    const syncer = new I18nSyncer({ i18nDir: tmpDir, type: 'vue' });
    syncer.writeLangFile('tw', { '你好': '你好' }, null);
    assert.ok(fs.existsSync(path.join(tmpDir, 'tw.json')));
  });

  it('writes .js for wx type', () => {
    // Create i18n.js and i18n-behavior.js so detectType returns 'wx'
    fs.writeFileSync(path.join(tmpDir, 'i18n.js'), '', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'i18n-behavior.js'), '', 'utf-8');
    const syncer = new I18nSyncer({ i18nDir: tmpDir, type: 'wx' });
    syncer.writeLangFile('tw', { '你好': '你好' }, null);
    const jsPath = path.join(tmpDir, 'tw.js');
    assert.ok(fs.existsSync(jsPath));
    const content = fs.readFileSync(jsPath, 'utf-8');
    assert.ok(content.startsWith('module.exports = '));
  });
});

// ==================== 3. 覆盖保护测试（核心安全逻辑）====================

describe('I18nSyncer overwrite protection', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-protect-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('preserves existing translations when adding new keys', () => {
    fs.writeFileSync(path.join(tmpDir, 'tw.json'), '{"已翻译": "已翻譯"}', 'utf-8');
    const syncer = new I18nSyncer({ i18nDir: tmpDir, lang: 'tw', type: 'vue' });

    syncer.extractFromContent("$t('已翻译'); $t('新文本')");
    syncer.sync();

    const result = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tw.json'), 'utf-8'));
    assert.equal(result['已翻译'], '已翻譯', 'Existing translation must be preserved');
    assert.equal(result['新文本'], '', 'New text should have empty value');
  });

  it('generates pending.json with only untranslated entries', () => {
    fs.writeFileSync(path.join(tmpDir, 'tw.json'), '{"已翻译": "已翻譯"}', 'utf-8');
    const syncer = new I18nSyncer({ i18nDir: tmpDir, lang: 'tw', type: 'vue' });

    syncer.extractFromContent("$t('已翻译'); $t('新文本')");
    syncer.sync();

    const pendingPath = path.join(tmpDir, 'tw.pending.json');
    assert.ok(fs.existsSync(pendingPath), 'pending.json should exist');
    const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
    assert.ok(!('已翻译' in pending), 'Already translated should NOT be in pending');
    assert.ok('新文本' in pending, 'New text should be in pending');
  });

  it('merge only fills empty values, never overwrites existing', () => {
    // Setup: main file has translated + empty entries
    fs.writeFileSync(path.join(tmpDir, 'tw.json'), '{"已翻译": "已翻譯", "新文本": ""}', 'utf-8');
    // pending file has translation for new text
    fs.writeFileSync(path.join(tmpDir, 'tw.pending.json'), '{"新文本": "新文本翻譯", "已翻译": "错误覆盖"}', 'utf-8');

    const syncer = new I18nSyncer({ i18nDir: tmpDir, lang: 'tw', type: 'vue' });
    syncer.mergePendingFile('tw');

    const result = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tw.json'), 'utf-8'));
    assert.equal(result['已翻译'], '已翻譯', 'Must NOT overwrite existing translation');
    assert.equal(result['新文本'], '新文本翻譯', 'Should fill previously empty entry');
    assert.ok(!fs.existsSync(path.join(tmpDir, 'tw.pending.json')), 'pending file should be deleted');
  });
});

// ==================== 4. 文件类型支持测试 ====================

describe('I18nSyncer file type support', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-ext-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scans .wxml files', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.wxml'), "<text>{{$t['你好']}}</text>", 'utf-8');
    const syncer = new I18nSyncer();
    syncer.processFile(path.join(tmpDir, 'test.wxml'));
    assert.ok(syncer.extractedTexts.has('你好'));
  });

  it('scans .vue files', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.vue'), "<template>{{ $t('测试') }}</template>", 'utf-8');
    const syncer = new I18nSyncer();
    syncer.processFile(path.join(tmpDir, 'test.vue'));
    assert.ok(syncer.extractedTexts.has('测试'));
  });

  it('skips unsupported extensions', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.css'), ".title { content: '中文' }", 'utf-8');
    const syncer = new I18nSyncer();
    syncer.processFile(path.join(tmpDir, 'test.css'));
    assert.equal(syncer.extractedTexts.size, 0);
  });
});
