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

  describe('A3 - WXML 嵌套 $t[...$t[...]]', () => {
    const rule = findRule('A3');
    it('rule exists', () => {
      assert.ok(rule);
      assert.equal(rule.severity, '🔴');
    });
    it('matches nested $t[] in wxml', () => {
      const positive = "{{$t['单价' + $t['元']]}}";
      assert.match(positive, rule.regex);
    });
    it('does not match single $t[]', () => {
      const negative = "{{$t['单价']}}{{item.price}}";
      assert.doesNotMatch(negative, rule.regex);
    });
  });

  describe('A10 - wx 双逗号', () => {
    const rule = findRule('A10');
    it('rule exists', () => {
      assert.ok(rule);
    });
    it('matches double comma after $t', () => {
      const positive = "const { obtain,, $t } = this.data;";
      assert.match(positive, rule.regex);
    });
    it('does not match normal comma', () => {
      const negative = "const { obtain, $t } = this.data;";
      assert.doesNotMatch(negative, rule.regex);
    });
  });

  describe('A11 - wx 多余括号', () => {
    const rule = findRule('A11');
    it('rule exists', () => {
      assert.ok(rule);
    });
    it('matches 3 consecutive closing parens after $t', () => {
      const positive = "Toast(global.$t('成功')))";
      assert.match(positive, rule.regex);
    });
    it('does not match normal nested call (2 closing parens)', () => {
      const negative = "Toast(global.$t('成功'))";
      assert.doesNotMatch(negative, rule.regex);
    });
  });
});
