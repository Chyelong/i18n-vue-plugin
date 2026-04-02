# 微信小程序 i18n 替换设计方案

## 概述

为 i18n-vue 插件新增微信小程序项目的国际化替换支持。新增独立的 `wx-i18n-replace.js` 替换脚本，处理 `.wxml` 和 `.js` 文件中的中文文本，并自动注入运行时翻译机制。

## 背景与约束

- 小程序包大小有限，语言包不能打包到本地，运行时从云端拉取
- 开发阶段生成本地 JSON 供测试，上线后切换为云端加载
- WXS 文件暂不处理（沙箱环境无法访问 global，且中文多为业务常量/注释）
- 翻译函数挂载在 `global` 对象上（项目已有大量 `global` 挂载习惯）
- 默认目标语言为 `tw`（繁体中文）
- 启动时加载语言包一次，不支持运行中切换语言

## 语言包结构

以中文原文为 key，翻译为 value，扁平结构：

```json
// tw.json
{
  "提交订单": "提交訂單",
  "请输入手机号码": "請輸入手機號碼",
  "操作成功": "操作成功"
}
```

```json
// en.json
{
  "提交订单": "Submit Order",
  "请输入手机号码": "Please enter phone number",
  "操作成功": "Operation successful"
}
```

找不到翻译时返回中文原文兜底，不需要 `zh.json`。

## 替换规则

### WXML 替换

| 场景 | 替换前 | 替换后 |
|------|--------|--------|
| 纯文本 | `<text>提交订单</text>` | `<text>{{$t['提交订单']}}</text>` |
| 属性值 | `placeholder="请输入"` | `placeholder="{{$t['请输入']}}"` |
| 混合文本 | `共{{num}}件商品` | `{{$t['共']}}{{num}}{{$t['件商品']}}` |
| 已有绑定 | `{{item.name}}` | 跳过 |

### JS 替换

| 场景 | 替换前 | 替换后 |
|------|--------|--------|
| 字符串字面量 | `'操作成功'` | `global.$t('操作成功')` |
| 模板字符串 | `` `共${n}件` `` | `` `${global.$t('共')}${n}${global.$t('件')}` `` |
| console/注释 | `console.log('调试')` | 跳过 |
| import/require 路径 | `require('../../utils')` | 跳过 |

### 跳过规则

复用 `shared-patterns.js` 并扩展小程序特有规则：

- 注释（`<!-- -->`、`//`、`/* */`）
- `console.log` / `console.warn` / `console.error`
- `wx:if`、`wx:for`、`wx:key` 等指令中的表达式
- `require()` / `import` 路径
- CSS 类名、样式值
- 已被 `{{$t['xxx']}}` 或 `global.$t()` 包裹的内容

## 新增/修改文件清单

### 新增文件

**`skills/i18n-replace/wx-i18n-replace.js`** — 小程序替换脚本（核心）

处理流程：
1. 扫描目标目录下所有 `.wxml` / `.js` 文件
2. 提取中文文本，收集到 Set（去重）
3. 替换代码：WXML 用 `{{$t['中文']}}` 形式，JS 用 `global.$t('中文')` 形式
4. 生成/追加目标语言 JSON（中文 key，值留空待翻译）
5. 对有替换的 `.wxml` 对应的 `.js` 文件，自动注入 Behavior
6. 输出替换报告

注：`app.js` 的修改（引入 i18n.js、插入 loadRemoteLocale）由 init 脚本负责，不在替换脚本中处理。

### 修改文件

| 文件 | 改动 |
|------|------|
| `skills/i18n-replace/shared-patterns.js` | 补充小程序特有跳过规则 |
| `skills/i18n-init/i18n-init.js` | 新增 `--type wx` 模式 |
| `skills/i18n-workflow/SKILL.md` | 工作流支持小程序类型检测 |
| `agents/i18n-files.md` | 扫描支持 `.wxml` / `.js` |
| `skills/i18n-replace/SKILL.md` | 文档补充小程序用法 |

## init 生成的运行时文件

`--type wx` 模式下，`i18n-init.js` 在目标项目的 `i18n/` 目录生成以下文件：

### i18n/i18n.js — 翻译核心

```js
const localLang = require('./tw.json')
global._i18nLang = localLang
global._i18nLocale = 'tw'

global.$t = function(key) {
  return global._i18nLang[key] || key
}

global.loadRemoteLocale = function(url, locale) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: url,
      success(res) {
        global._i18nLang = res.data
        global._i18nLocale = locale || 'tw'
        resolve(res.data)
      },
      fail: reject
    })
  })
}
```

### i18n/i18n-behavior.js — 页面数据注入

```js
module.exports = Behavior({
  attached() {
    this.setData({ $t: global._i18nLang })
  }
})
```

### i18n/tw.json — 本地语言包（开发测试用）

替换脚本自动生成，中文 key + 翻译 value，由 i18n-text agent 填充翻译。

## Behavior 自动注入逻辑

当一个 `.wxml` 文件中有替换发生时，对应的 `.js` 文件自动处理：

1. 文件顶部添加 `const i18nBehavior = require('相对路径/i18n-behavior.js')`
2. 在 `Page({` 或 `Component({` 内添加 `behaviors: [i18nBehavior],`
3. 如果已有 `behaviors` 数组，追加而非覆盖
4. 如果已注入过则跳过

## app.js 自动处理

init 脚本自动修改 `app.js`：

1. 顶部插入 `require('./i18n/i18n.js')`
2. `onLaunch` 中插入注释状态的云端加载调用：

```js
// [i18n] 上线时取消注释并修改为云端地址
// await global.loadRemoteLocale('https://your-api.com/i18n/tw.json', 'tw')
```

用户上线时取消注释、修改 URL 即可。

## 工作流集成

```
/i18n-workflow ./pages --type wx --langs tw

  0. 检测到小程序项目（存在 app.json + 无 package.json 的 vue 依赖）
  1. i18n-files agent 扫描 .wxml/.js 文件
  2. /i18n-init --type wx 生成 i18n.js + i18n-behavior.js + tw.json
  3. wx-i18n-replace.js 替换中文 + 注入 Behavior + 修改 app.js
  4. i18n-text agent 翻译 tw.json
  5. i18n-code agent 审核替换结果
  6. 完成
```

## 命令行用法

```bash
# 替换脚本
node skills/i18n-replace/wx-i18n-replace.js ./pages --i18n-dir ./i18n --lang tw

# init
node skills/i18n-init/i18n-init.js ./i18n --type wx --langs tw

# 完整工作流（Claude CLI）
/i18n-vue:i18n-workflow ./pages --type wx --langs tw
```

## 不在范围内

- WXS 文件中的中文替换（沙箱限制，业务常量为主）
- 运行中切换语言（启动时加载一次即可）
- `zh.json` 生成（中文为 key，兜底返回原文）
