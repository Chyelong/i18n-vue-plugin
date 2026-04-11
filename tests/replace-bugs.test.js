const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { VueI18nReplacer } = require('../skills/i18n-replace/vue-i18n-replace');
const { WxI18nReplacer } = require('../skills/i18n-replace/wx-i18n-replace');
const { HtmlI18nReplacer } = require('../skills/i18n-replace/html-i18n-replace');

const FIXTURE_DIR = path.join(__dirname, 'fixtures/replace-bugs');

function readFixture(subPath) {
  return fs.readFileSync(path.join(FIXTURE_DIR, subPath), 'utf-8');
}

describe('replace-bugs sanity', () => {
  it('fixture directory exists and has files', () => {
    assert.ok(fs.existsSync(FIXTURE_DIR));
    assert.ok(fs.existsSync(path.join(FIXTURE_DIR, 'vue/A1-html-comment.vue')));
    assert.ok(fs.existsSync(path.join(FIXTURE_DIR, 'html/A1-html-comment.html')));
  });

  it('replacer classes are exported', () => {
    assert.equal(typeof VueI18nReplacer, 'function');
    assert.equal(typeof WxI18nReplacer, 'function');
    assert.equal(typeof HtmlI18nReplacer, 'function');
  });
});

describe('A1 Vue: HTML comment should not be wrapped in $t()', () => {
  it('comment preserved outside $t, chinese wrapped', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.vue';
    const input = readFixture('vue/A1-html-comment.vue');
    const output = replacer.processVueFile(input);

    // 反例：HTML 注释不应出现在 $t() 参数里
    assert.doesNotMatch(output, /\$t\([^)]*<!--/,
      'HTML comments must not be swallowed into $t()');
    assert.doesNotMatch(output, /__HTML_COMMENT_\d+__/,
      'No placeholder should leak into output');

    // 正例：原注释应保留
    assert.match(output, /<!-- 这是注释 -->/,
      'Comment should be preserved as-is');
    assert.match(output, /<!-- <img src="alipay\.png" \/> -->/,
      'Second comment should be preserved');

    // 正例：中文文本应被 $t() 包裹
    assert.match(output, /\$t\(['"]感谢您的支持['"]\)/,
      'Chinese text "感谢您的支持" should be wrapped');
    assert.match(output, /\$t\(['"]支付支持以下方式['"]\)/,
      'Chinese text "支付支持以下方式" should be wrapped');
  });
});
