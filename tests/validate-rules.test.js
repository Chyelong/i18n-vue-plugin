const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
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

  describe('A4 - body 字段协议', () => {
    const rule = findRule('A4');
    it('rule exists', () => {
      assert.ok(rule);
      assert.equal(rule.severity, '🔴');
    });
    it('matches body: $t(...)', () => {
      const positive = "  body: window.$t('包时套餐'),";
      assert.match(positive, rule.regex);
    });
    it('does not match body-like key', () => {
      const negative = "  bodyLabel: window.$t('描述'),";
      assert.doesNotMatch(negative, rule.regex);
    });
  });

  describe('A5 - $mode 业务标识', () => {
    const rule = findRule('A5');
    it('rule exists', () => {
      assert.ok(rule);
    });
    it('matches $mode: $t(...)', () => {
      const positive = "  $mode: window.$t('买赠'),";
      assert.match(positive, rule.regex);
    });
  });

  describe('A6 - checkOperate name 参数', () => {
    const rule = findRule('A6');
    it('rule exists', () => {
      assert.ok(rule);
    });
    it('matches checkOperate name with $t', () => {
      const positive = "checkOperate({ name: window.$t('订座'), foo: 1 })";
      assert.match(positive, rule.regex);
    });
  });

  describe('A7 - res.msg.indexOf($t)', () => {
    const rule = findRule('A7');
    it('rule exists', () => {
      assert.ok(rule);
    });
    it('matches res.msg.indexOf', () => {
      const positive = "if (res.msg.indexOf($t('成功')) > -1) {}";
      assert.match(positive, rule.regex);
    });
    it('matches res.message.indexOf', () => {
      const positive = "if (res.message.indexOf(window.$t('成功')) > -1) {}";
      assert.match(positive, rule.regex);
    });
  });

  describe('A8 - sort_label 截取字段比较', () => {
    const rule = findRule('A8');
    it('rule exists', () => {
      assert.ok(rule);
    });
    it('matches sort_label == $t', () => {
      const positive = "if (item.sort_label == window.$t('时')) { }";
      assert.match(positive, rule.regex);
    });
    it('matches sort_label !== $t', () => {
      const positive = "if (sort_label !== $t('天')) { }";
      assert.match(positive, rule.regex);
    });
  });

  describe('A9 - 双用途字段赋值 $t', () => {
    const rule = findRule('A9');
    it('rule exists', () => {
      assert.ok(rule);
    });
    it('matches tag_name = $t', () => {
      const positive = "item.tag_name = window.$t('组合套餐');";
      assert.match(positive, rule.regex);
    });
    it('matches tag_box_name = $t', () => {
      const positive = "this.tag_box_name = $t('套餐');";
      assert.match(positive, rule.regex);
    });
    it('matches recharge_tag_name = $t', () => {
      const positive = "recharge_tag_name = window.$t('充值');";
      assert.match(positive, rule.regex);
    });
  });

  describe('A12 - HTML 注释占位符残留', () => {
    const rule = findRule('A12');
    it('rule exists', () => {
      assert.ok(rule);
      assert.equal(rule.severity, '🔴');
    });
    it('matches HTML_COMMENT placeholder in code', () => {
      const positive = "{{ $t('__HTML_COMMENT_0__ 感谢！') }}";
      assert.match(positive, rule.regex);
    });
    it('matches placeholder in JSON key', () => {
      const positive = '"支付支持 __HTML_COMMENT_2__": "..."';
      assert.match(positive, rule.regex);
    });
    it('does not match unrelated text', () => {
      const negative = "// HTML_COMMENT is a concept";
      assert.doesNotMatch(negative, rule.regex);
    });
  });
});

describe('A13 - JSON 弯引号未转义', () => {
  const fixturePath = path.join(__dirname, 'fixtures/validate-phase1/translations');
  const { detectCurlyQuotes } = require('../skills/i18n-replace/i18n-validate');

  it('detects curly quotes in JSON file', () => {
    const issues = detectCurlyQuotes(path.join(fixturePath, 'with-curly-quotes.json'));
    assert.ok(issues.length > 0, 'should detect at least one curly quote');
    assert.equal(issues[0].severity, '🟠');
    assert.equal(issues[0].name, 'JSON 弯引号未转义');
  });
});

describe('A14 - ￥/¥ 双字符映射', () => {
  const fixturePath = path.join(__dirname, 'fixtures/validate-phase1/translations');
  const { detectYenCoverage } = require('../skills/i18n-replace/i18n-validate');

  it('detects missing yen when both chars used in code', () => {
    const codeUsage = { fullwidth: true, halfwidth: true };
    const issues = detectYenCoverage(path.join(fixturePath, 'incomplete-yen.json'), codeUsage);
    assert.ok(issues.length > 0, 'should flag missing yen coverage');
    assert.equal(issues[0].severity, '🟡');
  });

  it('no issue when only fullwidth used in code', () => {
    const codeUsage = { fullwidth: true, halfwidth: false };
    const issues = detectYenCoverage(path.join(fixturePath, 'incomplete-yen.json'), codeUsage);
    assert.equal(issues.length, 0);
  });
});

describe('C1 - 插值变量名被翻译', () => {
  const fixturePath = path.join(__dirname, 'fixtures/validate-phase1/translations');
  const { detectVarNameTranslated } = require('../skills/i18n-replace/i18n-validate');

  it('detects translated variable name', () => {
    const issues = detectVarNameTranslated(path.join(fixturePath, 'var-name-translated.json'));
    assert.ok(issues.length >= 1, 'should flag at least one translated variable name');
    assert.ok(issues.some(i => i.name === '插值变量名被翻译'));
  });
});

describe('C2 - JSON key 简繁漂移', () => {
  const fixturePath = path.join(__dirname, 'fixtures/validate-phase1/translations');
  const { detectKeyDrift } = require('../skills/i18n-replace/i18n-validate');

  it('detects near-duplicate keys (simp/trad drift)', () => {
    const issues = detectKeyDrift(path.join(fixturePath, 'key-drift.json'));
    assert.ok(issues.length >= 1, 'should detect simp/trad key drift');
    assert.ok(issues.some(i => i.name === 'JSON key 简繁漂移'));
  });
});
