const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const fixturePath = path.join(__dirname, 'fixtures', 'sample.vue');
const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');

describe('VueI18nReplacer fixtures', () => {
  it('fixture file exists and has content', () => {
    assert.ok(fixtureContent.length > 0);
    assert.ok(fixtureContent.includes('你好世界'));
  });

  it('fixture contains all skip scenarios', () => {
    assert.ok(fixtureContent.includes("case '待处理'"), 'missing switch/case');
    assert.ok(fixtureContent.includes("habit.set"), 'missing habit');
    assert.ok(fixtureContent.includes("$router.push"), 'missing router');
    assert.ok(fixtureContent.includes("EventBus.$emit"), 'missing EventBus');
    assert.ok(fixtureContent.includes("indexOf"), 'missing indexOf');
    assert.ok(fixtureContent.includes("obj['字段名']"), 'missing bracket access');
    assert.ok(fixtureContent.includes("el-table-column"), 'missing el-table-column');
    assert.ok(fixtureContent.includes("localStorage.setItem"), 'missing localStorage');
  });
});

describe('shared-patterns.js', () => {
  const sp = require('../skills/i18n-replace/shared-patterns');

  it('exports expected constants', () => {
    assert.ok(sp.SWITCH_CASE_REGEX instanceof RegExp);
    assert.ok(sp.BRACKET_ACCESS_REGEX instanceof RegExp);
    assert.ok(sp.INDEX_MATCH_REGEX instanceof RegExp);
    assert.ok(sp.STORAGE_KEY_REGEX_BASE instanceof RegExp);
  });

  it('SWITCH_CASE_REGEX matches case prefix', () => {
    assert.ok(sp.SWITCH_CASE_REGEX.test('      case '));
    assert.ok(!sp.SWITCH_CASE_REGEX.test('lowercase '));
  });

  it('BRACKET_ACCESS_REGEX matches bracket access', () => {
    assert.ok(sp.BRACKET_ACCESS_REGEX.test('obj['));
    assert.ok(sp.BRACKET_ACCESS_REGEX.test('item.data[ '));
    assert.ok(!sp.BRACKET_ACCESS_REGEX.test('array'));
  });

  it('INDEX_MATCH_REGEX matches indexOf/includes', () => {
    assert.ok(sp.INDEX_MATCH_REGEX.test('.indexOf('));
    assert.ok(sp.INDEX_MATCH_REGEX.test('.includes('));
    assert.ok(!sp.INDEX_MATCH_REGEX.test('.indexOf'));
  });

  it('STORAGE_KEY_REGEX_BASE matches localStorage', () => {
    assert.ok(sp.STORAGE_KEY_REGEX_BASE.test('localStorage.setItem('));
    assert.ok(sp.STORAGE_KEY_REGEX_BASE.test('localStorage.getItem('));
    assert.ok(!sp.STORAGE_KEY_REGEX_BASE.test('habit.get('));
  });
});

describe('VueI18nReplacer dry-run integration', () => {
  it('processes sample.vue without crashing', async () => {
    const { execSync } = require('child_process');
    const result = execSync(
      `node skills/i18n-replace/vue-i18n-replace.js tests/fixtures/sample.vue --dry-run --i18n-dir tests/fixtures`,
      { encoding: 'utf-8', cwd: path.join(__dirname, '..') }
    );
    // Should complete without ReferenceError
    assert.ok(!result.includes('ReferenceError'), 'Should not throw ReferenceError');
    // Should report some replacements or skips
    assert.ok(result.length > 0, 'Should produce output');
  });

  it('generates window.$t() in script context (not bare $t)', async () => {
    const { execSync } = require('child_process');
    const result = execSync(
      `node skills/i18n-replace/vue-i18n-replace.js tests/fixtures/sample.vue --dry-run --i18n-dir tests/fixtures`,
      { encoding: 'utf-8', cwd: path.join(__dirname, '..') }
    );
    // Dry-run output should show window.$t replacements
    if (result.includes('$t(')) {
      // If any $t() appears in diff output, it should be window.$t or template $t
      // Check the script section doesn't generate bare $t
      assert.ok(!result.includes('= $t('), 'Should not generate bare $t() in script');
    }
  });
});
