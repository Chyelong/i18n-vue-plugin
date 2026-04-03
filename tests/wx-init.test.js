const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('i18n-init --type wx', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-wx-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates wx runtime files', () => {
    const { execSync } = require('child_process');
    const targetDir = path.join(tmpDir, 'i18n');
    execSync(
      `node skills/i18n-init/i18n-init.js "${targetDir}" --type wx --langs tw`,
      { encoding: 'utf-8', cwd: path.join(__dirname, '..') }
    );

    // Check i18n.js exists and contains global.$t
    const i18nJs = fs.readFileSync(path.join(targetDir, 'i18n.js'), 'utf-8');
    assert.ok(i18nJs.includes('global.$t'), 'i18n.js should have global.$t');
    assert.ok(i18nJs.includes('global._i18nLang'), 'i18n.js should have global._i18nLang');
    assert.ok(i18nJs.includes('loadRemoteLocale'), 'i18n.js should have loadRemoteLocale');
    // 小程序不支持 require .json，必须用 .js
    assert.ok(i18nJs.includes("require('./tw.js')"), 'i18n.js should require tw.js (not .json)');
    assert.ok(!i18nJs.includes("require('./tw.json')"), 'i18n.js should NOT require tw.json');

    // Check i18n-behavior.js exists
    const behaviorJs = fs.readFileSync(path.join(targetDir, 'i18n-behavior.js'), 'utf-8');
    assert.ok(behaviorJs.includes('Behavior'), 'should export Behavior');
    assert.ok(behaviorJs.includes('$t'), 'should inject $t');
    assert.ok(behaviorJs.includes('global._i18nLang'), 'should read from global._i18nLang');

    // Check tw.js exists (not .json — 小程序 require 不支持 .json)
    const twJsPath = path.join(targetDir, 'tw.js');
    assert.ok(fs.existsSync(twJsPath), 'tw.js should exist');
    const twContent = fs.readFileSync(twJsPath, 'utf-8');
    assert.ok(twContent.startsWith('module.exports = '), 'tw.js should use module.exports format');
    assert.ok(!fs.existsSync(path.join(targetDir, 'tw.json')), 'tw.json should NOT exist for wx type');
  });
});
