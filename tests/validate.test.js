const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');

describe('i18n-validate', () => {
  it('script shows usage with --help', () => {
    const result = execSync('node skills/i18n-replace/i18n-validate.js --help', { encoding: 'utf-8', cwd: process.cwd() });
    assert.ok(result.includes('i18n 验证脚本'));
    assert.ok(result.includes('--fix'));
  });

  describe('translation quality checks', () => {
    it('detects variable inconsistency in fixture', () => {
      const fixture = require('./fixtures/sample-translation.json');
      const varRe = /\{([^}]+)\}/g;
      const key = '共{count}条';
      const val = fixture[key];
      const kv = [...key.matchAll(varRe)].map(m => m[1]);
      const vv = [...val.matchAll(varRe)].map(m => m[1]);
      assert.notDeepStrictEqual(kv, vv, 'Should detect variable mismatch: count vs total');
    });

    it('detects empty values in fixture', () => {
      const fixture = require('./fixtures/sample-translation.json');
      const emptyKeys = Object.entries(fixture).filter(([, v]) => v === '').map(([k]) => k);
      assert.ok(emptyKeys.length >= 1, 'Should have empty values');
      assert.ok(emptyKeys.includes('未翻译'));
    });

    it('detects suspicious pipe-separated keys', () => {
      const fixture = require('./fixtures/sample-translation.json');
      const pipeKeys = Object.keys(fixture).filter(k => k.includes('|') && k.split('|').length > 2);
      assert.ok(pipeKeys.length >= 1, 'Should detect pipe-separated key');
    });

    it('passes for correct translations', () => {
      const fixture = require('./fixtures/sample-translation.json');
      const varRe = /\{([^}]+)\}/g;
      const key = '正常翻译{name}';
      const val = fixture[key];
      const kv = [...key.matchAll(varRe)].map(m => m[1]);
      const vv = [...val.matchAll(varRe)].map(m => m[1]);
      assert.deepStrictEqual(kv, vv, 'Correct translation should have matching vars');
    });
  });
});
