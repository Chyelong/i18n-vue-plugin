# i18n 审核系统升级设计

**日期**：2026-04-11
**版本目标**：v2.6.0
**作者**：brainstorming session
**背景**：跨项目 i18n 实践积累了 50+ 条踩坑经验，当前 `i18n-code` 子代理审核存在"偷懒"问题（单文件 diff、Grep 不全量跑、跨文件追踪缺失、高危模式清单不完整）

---

## 1. 问题陈述

### 1.1 现状

- `skills/i18n-replace/i18n-validate.js`（304 行）：10 Vue + 5 HTML + 8 wx 单行 regex 模式 + 裸 `$t()` 检测 + 翻译质量 + 可疑 JSON 条目
- `agents/i18n-code.md`：18 条高危模式、双重翻译判断、协议字段误报过滤，要求 haiku 子代理自己跑 Grep

### 1.2 痛点（按影响大小）

1. **agent 偷懒**：haiku 依靠 prompt 约束做全量 Grep 与跨文件追踪，实际遵从率低，经常只扫 diff 或挑几条显眼的判断
2. **高危清单不全**：memory 中记录的 10+ 条重要踩坑（对象 key 语法错误、模板字符串拆碎、HTML 注释吞噬、双用途变量、WXML template 作用域、$mode/body 协议字段、模块级时序等）未进入 validator 或 agent 清单
3. **跨文件追踪缺失**：EventBus on/emit 配对、switch/case 两侧一致性、路由 name 跨文件引用、`$refs.xxx.show({type})` 调用链——这些跨文件断裂是运行时崩溃级 bug，子代理和现有脚本都没有机制检测
4. **经验散落**：跨项目 memory 中沉淀的经验没有系统化回灌到插件，每次只能靠 CLAUDE 记忆手动应用
5. **规则新增门槛高**：新坑只能塞进 agent prompt，规则越长 agent 遵从率越低，形成恶性循环

### 1.3 设计目标

- **消除 agent 偷懒的结构性根源**：把机械检查下沉到脚本，agent 只做语义判断
- **经验系统化落地**：memory 中每条踩坑都有明确的落脚点（规则、fixture、测试）
- **跨文件追踪机制**：在脚本层提供确定性、可复核的数据流追踪
- **防回归**：新坑→fixture→规则→测试，永久防护

---

## 2. 总体架构

三层职责分离：

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: validator 脚本（确定性机械检查）                   │
│ - 单文件高危模式扫描（regex + 多行结构）                    │
│ - 跨文件数据流追踪（标识符反向 grep + 配对分析）            │
│ - 语法健康检查（嵌套 $t、双逗号、HTML 注释吞噬等）          │
│ - 翻译质量检查（变量一致性、空值、繁体化 key 漂移）         │
│ - 输出: 结构化 JSON 报告 (issues.json)                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: i18n-code agent（语义判断）                        │
│ - 输入: validator 的 issues.json                            │
│ - 对每条命中做 verdict: confirmed / falsePositive /         │
│   needsContext                                              │
│ - 输出: 每个 issue 的判断 + 理由 + 修复建议 (verdicts.json) │
│ - 工具收窄: 只保留 Read（按需读上下文）                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: 主线程修复循环                                     │
│ - 按 verdict confirmed 执行修复                             │
│ - 重跑 validator 直到 🔴/🟠 清零                            │
│ - 超过 N 轮未清零 → 报告疑难清单交人工                      │
│ - 新坑积累 → 回写 validator 规则                            │
└─────────────────────────────────────────────────────────────┘
```

**架构要点**：

1. **agent 不再自己 grep**：tools 从 `Read, Glob, Grep` 收窄到 `Read`，输入是确定性的 issues.json
2. **跨文件追踪下沉到脚本**：标识符反向 grep 和配对分析是机械工作，Node 脚本能稳定执行
3. **agent 偷懒空间被消除**：输入是明确的 issue 清单，每条都必须给 verdict，缺一即报警
4. **经验融入 = 增强规则表**：新坑能写成规则的加到 validator；需要语义理解的加到 agent 判断手册

---

## 3. validator 新增检测能力

分五类规则，每类对应一组 fixture 和测试。

### 3.1 A 类：单行 regex 扩展（14 条新规则）

在现有 10 Vue + 5 HTML + 8 wx 基础上新增：

| ID | 类型 | 规则 | 严重 | regex 草案 |
|---|---|---|---|---|
| A1 | 通用 | 对象字面量 key 用 `$t()`（JS 语法错误） | 🔴 | `^\s*(window\.)?\$t\s*\([^)]*\)\s*:` |
| A2 | 通用 | 嵌套 `$t($t(...))` | 🔴 | `\$t\s*\(\s*\$t\s*\(` |
| A3 | wx | WXML 嵌套 `$t['...$t[...']` | 🔴 | `\$t\[[^\]]*\$t\[` |
| A4 | 通用 | 支付协议 body 字段 | 🔴 | `body\s*:\s*(window\.)?\$t\s*\(` |
| A5 | 通用 | `$mode` 业务标识 | 🔴 | `\$mode\s*:\s*(window\.)?\$t\s*\(` |
| A6 | 通用 | checkOperate name 参数（TM_h5 项目惯例，可配置禁用） | 🔴 | `checkOperate[^)]*name[^)]*\$t\s*\(` |
| A7 | 通用 | res.msg.indexOf($t) | 🔴 | `res\.(msg\|message)\.indexOf\s*\(\s*\$t` |
| A8 | 通用 | sort_label 截取字段比较 | 🟠 | `sort_label\s*[=!]==?\s*\$t` |
| A9 | 通用 | 双用途字段 tag_name/tag_box_name | 🟠 | `(tag_name\|tag_box_name\|recharge_tag_name)\s*=\s*(window\.)?\$t` |
| A10 | wx | 双逗号语法错误（排除字符串内） | 🟠 | `,\s*,` 结合 `$t` 或解构上下文 |
| A11 | wx | 多余括号 `$t(...)))` | 🟠 | `\$t\s*\([^)]*\)\)\)` |
| A12 | 通用 | `__HTML_COMMENT_N__` 占位符残留 | 🔴 | `__HTML_COMMENT_\d+__` |
| A13 | 通用 | tw.json 弯引号未转义（JSON 扫描） | 🟠 | 检查 key/value 中未转义的 `"` `"` |
| A14 | 通用 | ￥(U+FFE5) 和 ¥(U+00A5) 两种字符都要有映射 | 🟡 | 扫描代码中两种字符 vs 翻译包 key |

**实施要点**：
- 规则结构：`{ id, type, regex, severity, name, description, fixSuggestion? }`
- 支持规则级 `disable`（特殊项目忽略某规则）
- 误报率高的规则标 `🟡`，让 agent 二次过滤

### 3.2 B 类：多行 / 结构扫描（4 条）

需要跨行匹配或简单 AST 思路：

| ID | 规则 | 检测方法 | 严重 |
|---|---|---|---|
| B1 | `$t()` 内字符串跨行（Vue 2 buble 报错） | 找 `$t\('` 但同行无闭合 `')` | 🔴 |
| B2 | HTML 注释被吞进 `$t()` | `$t\(['"][^'"]*<!--` | 🔴 |
| B3 | 模板字符串 `${var}` 被拆进 `$t('前缀${var}后缀')` | `$t\(['"][^'"]*\$\{` | 🔴 |
| B4 | WXML `<template>` data 未传 `$t` | `<template\s+is=` 且 data 属性内无 `$t` | 🟠 |

### 3.3 C 类：翻译质量检查增强

在现有 `validateTranslationJSON` 基础上补充：

| ID | 检查项 | 说明 |
|---|---|---|
| C1 | 插值变量名被翻译 | `{item_待上机}` 翻译成 `{item_Awaiting}`（变量名中的中文不能翻译） |
| C2 | JSON key 被繁体化漂移 | 对比原始 key 列表，找出被部分繁体化的 key（haiku 子代理偶发 bug） |
| C3 | 弯引号未转义为 `\u201C/\u201D` | 扫描 JSON 源文本 |
| C4 | 空 value 白名单 | 已知允许的空值（如 `￥`）不算未翻译 |
| C5 | 重复翻译值未区分语境 | 相同 value 的不同 key 聚合提醒 |
| C6 | ￥ / ¥ 双字符映射完整性 | 两个字符都需要有翻译 key |

### 3.4 D 类：跨文件数据流追踪（**最大增量，核心价值**）

**思路**：采集所有被 `$t()` 包裹的字面量标识符，全项目反向 grep，检测跨文件一致性。

**实施步骤**：

1. **采集候选标识符**：在所有 `.vue/.js/.wxml` 文件中扫描 `$t('xxx')` / `$t["xxx"]` / `global.$t('xxx')`，提取 `xxx` 字面量
2. **全项目反向扫描**：对每个候选，grep 所有文件找出"裸字符串"出现位置（未被 `$t` 包裹）
3. **模式匹配**：对裸字符串位置判断是否属于以下高危上下文之一：

| ID | 子规则 | 检测模式 | 严重 |
|---|---|---|---|
| D1 | EventBus 配对不一致 | `bus.(on\|emit\|\$on\|\$emit)\s*\(\s*(\$t\(\|'裸字符串')` 两侧不一致 | 🔴 |
| D2 | switch/case 两侧不一致 | `case\s+'xxx'` 与 `= '\$t("xxx")'` 或反之 | 🔴 |
| D3 | 路由 name 跨文件引用 | `{\s*name:\s*'xxx'}` 定义 vs `$router.push({name:'xxx'})` 调用 | 🔴 |
| D4 | `$refs.xxx.show({type:'xxx'})` | emit 端 `$t()` vs handler `if type==='xxx'` | 🔴 |
| D5 | 常量数组 + indexOf 检测 | 数组定义含 `$t()` 且被 `.indexOf/.includes` 调用 | 🔴 |
| D6 | el-tab name ↔ tabVal 不一致 | `<el-tab-pane :name="$t('xx')">` vs `tabVal: 'xx'` | 🔴 |
| D7 | habit/localStorage key 两侧不一致 | `habit.set('xxx')` vs `habit.get($t('xxx'))` | 🔴 |

4. **输出结构**：每条跨文件 issue 包含：
   ```json
   {
     "id": "D1-003",
     "category": "cross-file",
     "rule": "EventBus 配对不一致",
     "severity": "🔴",
     "identifier": "订单支付成功",
     "occurrences": [
       { "file": "a.vue", "line": 120, "wrapped": true, "snippet": "bus.emit($t('订单支付成功'))" },
       { "file": "b.vue", "line": 45, "wrapped": false, "snippet": "bus.on('订单支付成功', ...)" }
     ]
   }
   ```

**性能**：
- 扫描前先过滤 `node_modules/dist/build` 等目录
- 候选标识符去重后再反向 grep
- 支持 `--max-files` 和 `--timeout` 降级开关

### 3.5 E 类：模块级时序 / 初始化检查（启发式，误报率较高）

| ID | 检查项 | 说明 | 严重 |
|---|---|---|---|
| E1 | 模块顶层 `const X = { label: window.$t("...") }` | 导入顺序可能导致 $t 未初始化 | 🟡 |
| E2 | `<html lang="en">` 误导语言检测 | 扫 `index.html` | 🟠 |
| E3 | Vue 项目缺 `Vue.prototype.$t = window.$t` | 扫 main.js | 🟠 |
| E4 | 注入式项目缺 `__I18N_LANG__/__I18N_PATH__` 设置 | 启发式 | 🟡 |
| E5 | wx 项目 workData.js 类静态导出中 `global.$t()` | 模块加载时 `global.$t` 未定义 | 🟠 |

---

## 4. agent 输入输出协议

### 4.1 输入（主线程 → agent）

主线程把 validator 生成的 `issues.json` 作为 agent prompt 的一部分传入：

```json
{
  "projectPath": "F:/xxx",
  "projectType": "vue",
  "stats": {
    "files": 245,
    "patternHits": 87,
    "crossFileHits": 23,
    "translationIssues": 12
  },
  "issues": [
    {
      "id": "A1-001",
      "category": "pattern",
      "rule": "switch case 中 $t",
      "severity": "🔴",
      "file": "src/xxx.vue",
      "line": 42,
      "snippet": "case window.$t('进行中'):",
      "context": [
        "  switch(status) {",
        "    case window.$t('进行中'):",
        "      handleXxx()"
      ]
    },
    {
      "id": "D1-003",
      "category": "cross-file",
      "rule": "EventBus 配对不一致",
      "severity": "🔴",
      "identifier": "订单支付成功",
      "occurrences": [
        { "file": "a.vue", "line": 120, "wrapped": true, "snippet": "bus.emit($t('订单支付成功'))" },
        { "file": "b.vue", "line": 45, "wrapped": false, "snippet": "bus.on('订单支付成功', ...)" }
      ]
    }
  ]
}
```

### 4.2 输出（agent → 主线程）

**强制结构化 JSON**：

```json
{
  "verdicts": [
    {
      "id": "A1-001",
      "verdict": "confirmed",
      "reason": "switch 的 status 来自后端 /api/order 返回，翻译后 case 匹配永远失败",
      "fixSuggestion": "case 值改回原始中文字面量 '进行中'"
    },
    {
      "id": "D1-003",
      "verdict": "confirmed",
      "reason": "emit 端 $t 翻译后，on 端用原始中文注册，繁体环境下 on 收不到事件",
      "fixSuggestion": "emit 端还原为原始字符串"
    },
    {
      "id": "A9-007",
      "verdict": "falsePositive",
      "reason": "tag_name 赋值处在 computed 内，值来自 $t 翻译的 label，模板里没有再次包裹，属于单次翻译"
    }
  ],
  "summary": { "confirmed": 12, "falsePositive": 3, "needsContext": 2 }
}
```

**verdict 枚举**：

- `confirmed` — 真问题，必须修
- `falsePositive` — 误报，说明原因
- `needsContext` — 需要更多上下文，必须指明要读哪个文件/哪一段

### 4.3 防偷懒约束（主线程校验）

1. `verdicts.length === issues.length`（数量必须匹配，缺一警告）
2. 每个 verdict 必填 `reason`（长度 ≥ 20 字）
3. `falsePositive` 必须说明原因（不接受只写"不是问题"）
4. `needsContext` 必须指明具体的 `file` 和 `reason`（主线程可按需补充上下文后重新派发）
5. agent 返回时，主线程对以上四条做断言，不通过则重新派发或报"偷懒警告"

### 4.4 agent 文档改造

`agents/i18n-code.md` 的核心章节改为：

- **核心任务**：对 validator 生成的 issues 逐条做 verdict
- **工具限制**：只 Read（按需读上下文）
- **强制结构化输出**：给出 JSON schema，每次必须按 schema 输出
- **判断手册**：保留现有的协议字段误报过滤、双重翻译判断等语义规则（这些是 agent 真正的职责）

---

## 5. workflow 流程变化

### 5.1 新流程图

```
replace (生成 $t 标记)
  ↓
validate-v2 (脚本)
  ├─→ issues.json (结构化问题清单)
  ↓
  ┌─────────────────┬────────────────┐
  ↓                 ↓                ↓
translate        code-audit      (可选) auto-fix
  (并行)        (读 issues.json    对高置信度
                输出 verdicts.json) A 类规则
                                    自动修复
  ↓                 ↓
  └────→ 主线程按 verdict 修复 ←────┘
                    ↓
              validate-v2 重跑
                    ↓
           🔴/🟠 全部清零？
              ├─ 是 → finalize-i18n
              └─ 否 → 回到修复（最多 N 轮）
                      超过 N 轮 → 报疑难清单交人工
```

### 5.2 CLI 变化

`i18n-validate.js` 扩展：

- `--format json|text` — 输出格式，默认 text（向后兼容），CI 用 json
- `--out <file>` — 写入文件（默认 stdout）
- `--cross-file` / `--no-cross-file` — 启用跨文件追踪（默认开启）
- `--max-files <n>` — 限制扫描文件数（大项目降级）
- `--timeout <ms>` — 跨文件扫描超时
- `--rules <id1,id2,...>` — 只跑指定规则（调试）
- `--disable-rules <id1,id2,...>` — 禁用指定规则

**退出码**：
- `0` — 全绿
- `1` — 存在 🔴 严重
- `2` — 存在 🟠 高危但无 🔴
- `3` — validator 自身错误

### 5.3 skill 文档更新

- `skills/i18n-workflow/SKILL.md`：插入 validate-v2 为强制步骤，描述新流程
- `skills/i18n-replace/SKILL.md`：记录 validator 能力升级
- `agents/i18n-code.md`：整体重写（见 4.4）

---

## 6. 错误处理

| 场景 | 处理策略 |
|---|---|
| validator 解析 JS 出错（语法错误） | 标记该文件 `parseError: true`，其他文件继续扫描 |
| JSON 语言包解析失败 | 🔴 严重错误，跳过质量检查但继续扫描代码 |
| 跨文件扫描超时 | `--timeout` 限额，超过则降级为单文件模式并警告 |
| agent 输出不是合法 JSON | 主线程兜底：尝试 Markdown 解析 + 警告 |
| agent verdict 数量不匹配 | 报"偷懒警告"，列出缺失 id，让用户决定重派或跳过 |
| 修复循环超过 N 轮（N=3）仍未清零 | 输出"疑难问题"清单，终止循环，交人工 |
| 项目过大（>500 文件） | `--max-files` 降级，自动跳过大目录提示 |

---

## 7. 测试策略

### 7.1 单元测试（`tests/validate-v2.test.js`）

**规则级别**：每条 pattern rule（A/B/E 类）至少 3 个 fixture：

1. 正例（应命中）
2. 反例（不应命中，避免误报）
3. 边界（注释内、字符串内、跨行等）

**跨文件级别**（D 类）：准备多文件 fixture，期望输出特定的跨文件 issue。

### 7.2 集成测试（`tests/validate-v2.integration.test.js`）

- 最小 Vue 项目 fixture（几个文件，涵盖常见踩坑）
- 最小 wx 项目 fixture
- 最小 HTML 项目 fixture
- 对比 `issues.json` 快照（snapshot testing）

### 7.3 回归锁定

memory 里每条已知踩坑 → 一个最小 fixture → 一条断言。新坑加规则前必须先写失败测试（TDD）。

### 7.4 agent 行为验证

- 手工 eval：喂一个已知 issues.json，检查 verdict 数量和 reason 长度
- 可选：写个简单的"偷懒检测脚本"验证 agent 输出的合规性

---

## 8. 实施分期

### 8.1 第一期（MVP，最大性价比）

目标：插件能跑新流程，80% 的坑被覆盖。

**本 spec 的首个实施计划只覆盖第一期**。第二、三期是后续迭代，各自单独立计划。

1. validator 加 A 类新规则（14 条）
2. validator 加 C 类翻译质量增强
3. validator 加 `--format json` / `--out` / 退出码分级
4. 新建单元测试 fixture 与断言（A + C）
5. `agents/i18n-code.md` 改输入协议（读 JSON 做 verdict）
6. `skills/i18n-workflow/SKILL.md` 插入 validate 步骤
7. 文档：README、docs/ 更新

### 8.2 第二期（跨文件追踪，核心增量）

目标：实现 memory 中反复强调的"跨文件数据流追踪"。

8. validator D 类：候选标识符采集 + 反向 grep + 配对分析
9. D1-D7 七个子规则实现
10. 跨文件 fixture + 多文件集成测试
11. agent 处理 cross-file issue 的 verdict 能力
12. 性能优化：缓存、并行、降级策略

### 8.3 第三期（多行 / 结构 + 启发式）

目标：补齐 memory 中剩余的边角坑。

13. B 类：`$t()` 跨行、HTML 注释吞噬、模板字符串 `${}` 拆碎、WXML template 作用域
14. E 类：模块级时序、html lang、Vue.prototype 挂载、注入式项目配置、wx workData 类
15. 启发式规则（易误报，靠 agent 二次过滤）

### 8.4 持续维护

- memory 新增踩坑 → fixture → 规则 → 测试
- 每个规模较大的项目 i18n 完成后回溯：有哪些坑当前规则没覆盖？补一条

---

## 9. 非目标（明确 YAGNI）

- **不做完整 AST 解析**：regex + 多行扫描足够，工程量不划算
- **不做 agent 自动重试**：偷懒警告交用户决定，不自动循环
- **不改变 `i18n-replace` 脚本的替换逻辑**：只改 validator 和 agent，替换端保持现状
- **不做 UI/可视化报告**：CLI 文本 + JSON 足够
- **不做增量扫描**：整项目跑一遍就够快，增量引入的复杂度不划算

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| D 类跨文件扫描在大项目上慢 | 审核时间变长 | `--max-files` 降级 + 候选去重 + 缓存 |
| agent 输出 JSON 解析失败 | 流程中断 | 主线程兜底：Markdown 解析 + 警告 |
| 规则误报率高导致噪音 | 用户失去信任 | 🟡 级别规则默认关闭；高误报规则由 agent 二次过滤 |
| memory 经验解读偏差 | 规则写错 | fixture 驱动 + 多项目回归测试 |
| haiku 子代理按新协议输出 JSON 不稳定 | 需要提示词调优 | 提供 `JSON schema + few-shot examples`，多次迭代提示词 |

---

## 11. 成功标准

1. **第一期交付后**：对一个历史 i18n 项目（如 TM_h5、good 等）重跑 validator，发现的 🔴 严重问题数量 ≥ memory 中记录的数量的 80%
2. **第二期交付后**：跨文件追踪能检测出 memory 中记录的至少 5 类历史 bug（EventBus、switch/case、路由 name、el-tab name、habit）
3. **agent 偷懒率下降**：新流程下 agent verdict 数量 100% 匹配 issues 数量；reason 平均长度 ≥ 40 字
4. **回归测试全绿**：每次修改规则后 fixture 测试通过

---

## 附录 A：memory 经验 → 规则映射表

| memory 条目 | 落地位置 |
|---|---|
| wx 语言包用 .js 不用 .json | 已落地（现有） |
| 微信小程序 WXML `$t['key']` 无回退 | A 类 + 文档 |
| template 独立作用域 | B4 |
| body 字段不翻译 | A4 |
| $mode 业务逻辑值 | A5 |
| checkOperate name 参数 | A6 + D 类（跨文件） |
| 嵌套 `$t` | A2 + A3 |
| 模板字符串拆断 | B3 |
| 双逗号 / 多余括号 | A10 + A11 |
| HTML 注释吞进 `$t()` | B2 + A12（占位符残留） |
| `$t()` 跨行字符串 | B1 |
| 对象字面量 key 用 `$t()` | A1 |
| 双用途 tag_name | A9 + 文档 |
| EventBus 事件名 | D1 |
| switch/case 两侧一致 | D2 |
| 路由 name 跨文件 | D3 |
| el-tab name ↔ tabVal | D6 |
| habit/localStorage 键两侧一致 | D7 |
| 常量数组 indexOf | D5 |
| 翻译变量名被翻译 | C1 |
| JSON key 被繁体化 | C2 |
| 弯引号转义 | C3 + A13 |
| 重复翻译值 | C5 |
| ￥ vs ¥ 双字符 | A14 + C6 |
| 模块级时序 | E1 |
| `<html lang="en">` | E2 |
| `Vue.prototype.$t` 挂载 | E3 |
| 注入式项目 `__I18N_LANG__` | E4 |
| wx workData 类静态导出 | E5 |

---

## 附录 B：规则 schema（validator 内部）

```js
{
  id: 'A1',                    // 唯一 id
  category: 'pattern' | 'cross-file' | 'translation' | 'init',
  type: 'vue' | 'wx' | 'html' | 'all',
  regex: RegExp,               // pattern 类规则用
  severity: '🔴' | '🟠' | '🟡',
  name: '对象 key 用 $t()',
  description: 'JS 对象字面量 key 不能是函数调用，会 SyntaxError',
  fixSuggestion: '改为计算属性 [window.$t("...")]',
  disabled: false              // 规则级开关
}
```

---

**设计定稿**。下一步：转入 writing-plans skill 生成详细实施计划。
