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

describe('B1 wx: body field should be skipped', () => {
  it('body: "中文" should not be wrapped', () => {
    const replacer = new WxI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('wx/B1-body-field.js');
    const output = replacer.processScript(input);
    assert.match(output, /body:\s*['"]包时套餐充值['"]/);
    assert.doesNotMatch(output, /body:\s*global\.\$t/);
  });
});

describe('B2 wx: $mode field should be skipped', () => {
  it('$mode: "中文" should not be wrapped', () => {
    const replacer = new WxI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('wx/B2-dollar-mode.js');
    const output = replacer.processScript(input);
    assert.match(output, /\$mode:\s*['"]买赠['"]/);
    assert.doesNotMatch(output, /\$mode:\s*global\.\$t/);
  });
});

describe('B3 wx: checkOperate name should be skipped', () => {
  it('checkOperate({ name: "中文" }) should not be wrapped', () => {
    const replacer = new WxI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('wx/B3-check-operate.js');
    const output = replacer.processScript(input);
    assert.match(output, /name:\s*['"]订座['"]/);
    assert.doesNotMatch(output, /name:\s*global\.\$t\(['"]订座/);
  });
});

describe('B4 wx: dual-use field should be skipped', () => {
  it('tag_name/tag_box_name/recharge_tag_name = "中文" should not be wrapped', () => {
    const replacer = new WxI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('wx/B4-dual-use-field.js');
    const output = replacer.processScript(input);
    assert.match(output, /tag_name\s*=\s*['"]组合套餐['"]/);
    assert.doesNotMatch(output, /tag_name\s*=\s*global\.\$t/);
  });
});

describe('B6 wx: EventBus event name should be skipped', () => {
  it('EventBus.on/$bus.emit("中文") should not be wrapped', () => {
    const replacer = new WxI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('wx/B6-eventbus.js');
    const output = replacer.processScript(input);
    assert.match(output, /EventBus\.on\(['"]订单支付成功['"]/);
    assert.match(output, /\$bus\.emit\(['"]用户登录['"]/);
    assert.doesNotMatch(output, /EventBus\.on\(\s*global\.\$t/);
  });
});

describe('B7 wx: showRouter name should be skipped', () => {
  it('showRouter("中文") should not be wrapped', () => {
    const replacer = new WxI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('wx/B7-router-name.js');
    const output = replacer.processScript(input);
    assert.match(output, /showRouter\(['"]充值页面['"]/);
    assert.doesNotMatch(output, /showRouter\(\s*global\.\$t/);
  });
});

describe('B1 Vue: body field should be skipped', () => {
  it('body: "中文" should not be wrapped', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('vue/B1-body-field.js');
    const output = replacer.processScript(input);
    assert.match(output, /body:\s*['"]包时套餐充值['"]/,
      'body value must remain original');
    assert.doesNotMatch(output, /body:\s*window\.\$t/,
      'body field must not be wrapped');
  });
});

describe('B2 Vue: $mode field should be skipped', () => {
  it('$mode: "中文" should not be wrapped', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('vue/B2-dollar-mode.js');
    const output = replacer.processScript(input);
    assert.match(output, /\$mode:\s*['"]买赠['"]/);
    assert.doesNotMatch(output, /\$mode:\s*window\.\$t/);
  });
});

describe('B3 Vue: checkOperate name should be skipped', () => {
  it('checkOperate({ name: "中文" }) should not be wrapped', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('vue/B3-check-operate.js');
    const output = replacer.processScript(input);
    assert.match(output, /name:\s*['"]订座['"]/);
    assert.doesNotMatch(output, /name:\s*window\.\$t\(['"]订座/);
  });
});

describe('B4 Vue: dual-use field assignment should be skipped', () => {
  it('tag_name/tag_box_name/recharge_tag_name = "中文" should not be wrapped', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('vue/B4-dual-use-field.js');
    const output = replacer.processScript(input);
    assert.match(output, /tag_name\s*=\s*['"]组合套餐['"]/);
    assert.match(output, /tag_box_name\s*=\s*['"]套餐盒['"]/);
    assert.match(output, /recharge_tag_name\s*=\s*['"]充值标签['"]/);
    assert.doesNotMatch(output, /tag_name\s*=\s*window\.\$t/);
  });
});

describe('B5 Vue: object literal key should be skipped', () => {
  it('{"中文": value} should not become {window.$t("中文"): value}', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.js';
    const input = readFixture('vue/B5-object-key.js');
    const output = replacer.processScript(input);
    assert.match(output, /['"]绑定用户['"]:\s*['"]bind['"]/);
    assert.match(output, /['"]解绑用户['"]:\s*['"]unbind['"]/);
    assert.doesNotMatch(output, /window\.\$t\(['"]绑定用户['"]\)\s*:/);
  });
});

describe('A3 Vue: smart quote wrapping avoids \\" escape', () => {
  it('strings with only " are wrapped in single quotes without escaping', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.vue';
    const input = readFixture('vue/A3-curly-quotes.vue');
    const output = replacer.processVueFile(input);

    // 反例：不应出现 \" 转义（Vue 2 buble 不支持）
    assert.doesNotMatch(output, /\\"/,
      'Escaped double quote \\" is forbidden (Vue 2 buble incompatible)');

    // 正例：script 区 tip 的 $t 应该用单引号包裹，ASCII " 不需转义
    assert.match(output, /window\.\$t\('请输入"昵称"'\)/,
      'Single-quoted $t() should contain unescaped ASCII "');
  });

  it('strings with both \' and " convert " to curly quotes', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.vue';
    // 手工测试 smartQuoteAndWrap 的 both-quotes 分支
    const result = replacer.smartQuoteAndWrap(`I'm "happy" today`, 'window.');
    // 有 ' 和 " 同时出现 → 把 " 转为中文弯引号
    assert.match(result, /window\.\$t\('I\\'m \u201Chappy\u201D today'\)/,
      'both quotes present should convert " to curly');
  });
});

describe('A2 Vue: multiline text must be collapsed to single line', () => {
  it('$t() content should not contain newlines', () => {
    const replacer = new VueI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.vue';
    const input = readFixture('vue/A2-multiline-text.vue');
    const output = replacer.processVueFile(input);

    // 反例：$t('...') 内部不应有换行（Vue 2 buble 会报 Unterminated string）
    const tCalls = output.match(/\$t\(['"][^'"]*['"]\)/g) || [];
    for (const call of tCalls) {
      assert.doesNotMatch(call, /\n/,
        `$t() call should not contain newline: ${JSON.stringify(call)}`);
    }

    // 正例：应有合并后的单行 $t()（换行 → 空格）
    assert.match(output, /\$t\(['"]包时段或时长，不可用于计局台桌，从计时台桌更换到 ?计局台桌包时套餐将会失效。['"]\)/,
      'Multiline text should be collapsed to single line');
  });
});

describe('A1 HTML: HTML comment must not enter data-i18n', () => {
  it('data-i18n should contain only chinese text, not comment', () => {
    const replacer = new HtmlI18nReplacer({ dryRun: true });
    replacer.currentFile = 'test.html';
    const input = readFixture('html/A1-html-comment.html');
    const output = replacer.processHtmlFile(input);

    // 反例：data-i18n 属性里不应含 <!--
    assert.doesNotMatch(output, /data-i18n="[^"]*<!--/,
      'data-i18n must not contain HTML comments');
    assert.doesNotMatch(output, /data-i18n="[^"]*\n/,
      'data-i18n must be single-line');
    assert.doesNotMatch(output, /__HTML_COMMENT_\d+__/,
      'No placeholder should leak');

    // 正例：注释应保留
    assert.match(output, /<!-- 这是注释 -->/,
      'Comment should be preserved');

    // 正例：纯文本部分应在 data-i18n 里
    assert.match(output, /data-i18n="感谢您的支持"/,
      'data-i18n should contain only the chinese text');
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
