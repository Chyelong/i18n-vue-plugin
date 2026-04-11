const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { findRule } = require('../skills/i18n-replace/validate-rules');

describe('Phase 1 rules', () => {
  describe('A1 - 对象字面量 key 用 $t', () => {
    const rule = findRule('A1');
    it('rule exists', () => {
      assert.ok(rule, 'A1 rule must exist');
      assert.equal(rule.severity, '🔴');
    });
    it('matches object key using $t', () => {
      const positive = "  window.$t('绑定用户'): 'bind',";
      assert.match(positive, rule.regex);
    });
    it('does not match $t used as value', () => {
      const negative = "  type: window.$t('绑定用户'),";
      assert.doesNotMatch(negative, rule.regex);
    });
  });

  describe('A2 - 嵌套 $t($t(...))', () => {
    const rule = findRule('A2');
    it('rule exists', () => {
      assert.ok(rule, 'A2 rule must exist');
      assert.equal(rule.severity, '🔴');
    });
    it('matches nested window.$t(window.$t(...))', () => {
      const positive = "const x = window.$t(window.$t('xxx'));";
      assert.match(positive, rule.regex);
    });
    it('matches nested $t($t(...))', () => {
      const positive = "const x = $t($t('xxx'));";
      assert.match(positive, rule.regex);
    });
    it('does not match sibling $t calls', () => {
      const negative = "const x = $t('a') + $t('b');";
      assert.doesNotMatch(negative, rule.regex);
    });
  });
});
