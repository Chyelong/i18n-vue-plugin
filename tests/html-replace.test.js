const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const fixturePath = path.join(__dirname, 'fixtures', 'sample.html');
const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');

describe('HtmlI18nReplacer fixtures', () => {
  it('fixture file exists', () => {
    assert.ok(fixtureContent.includes('你好世界'));
  });

  it('fixture contains skip scenarios', () => {
    assert.ok(fixtureContent.includes('value="已完成"'), 'missing option value');
    assert.ok(fixtureContent.includes('type="hidden"'), 'missing hidden input');
    assert.ok(fixtureContent.includes('data-status'), 'missing data-* attr');
    assert.ok(fixtureContent.includes('{{动态内容}}'), 'missing Vue interpolation');
  });

  it('fixture contains JS skip scenarios', () => {
    assert.ok(fixtureContent.includes("case '类型'"), 'missing switch/case');
    assert.ok(fixtureContent.includes("localStorage.setItem"), 'missing localStorage');
  });
});
