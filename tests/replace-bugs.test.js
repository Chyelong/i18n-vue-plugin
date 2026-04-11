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
