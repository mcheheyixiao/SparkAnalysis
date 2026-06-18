你必须严格按照下面的 JSON 结构输出。

不要输出 Markdown 代码块。
不要在 JSON 外输出任何文字。
不要输出解释前缀，例如“以下是诊断结果”。
不要省略字段。
所有字段必须存在。
如果某个字段没有足够数据，请使用空数组、空字符串、null 或 "unknown"。
所有文本必须使用中文。
最终结果必须能被 `JSON.parse()` 直接解析。

---

## 严格输出结构

{
"one_sentence_summary": "一句话总结本次性能状态，给小白服主看，不超过 80 个中文字符",
"severity": "normal | low | medium | high | critical",
"confidence_overall": "low | medium | high",
"report_type": "sampler | health | heap | unknown",

"beginner_explanation": {
"plain_summary": "用小白能听懂的话解释服务器目前大概是什么状态",
"analogy": "用生活比喻解释核心问题，例如 TPS 像服务器心跳，MSPT 像每次心跳花费的时间",
"what_players_may_feel": [
"玩家可能感受到的现象，例如方块延迟、回弹、怪物卡住、聊天延迟"
],
"what_owner_should_do_first": [
"服主第一步应该做什么，必须安全、简单、可执行"
],
"do_not_do": [
"不要一上来删除所有插件",
"不要无备份批量修改配置",
"不要只凭一次报告就认定某个插件一定有问题"
]
},

"professional_analysis": {
"technical_summary": "专业技术总结，说明核心判断、性能瓶颈倾向和数据可信度",
"tps_mspt_assessment": {
"status": "normal | warning | bad | unknown",
"explanation": "TPS/MSPT 状态说明。如果缺少数据，必须说明无法判断",
"evidence": [
"来自输入数据的证据，不能编造"
]
},
"main_thread_assessment": {
"status": "normal | suspicious | bottleneck | unknown",
"explanation": "主线程是否可能是瓶颈，以及判断依据",
"evidence": [
"来自输入数据的证据，不能编造"
]
},
"memory_gc_assessment": {
"status": "normal | warning | bad | unknown",
"explanation": "内存和 GC 状态说明。如果缺少 GC 数据，不要断言 GC 问题",
"evidence": [
"来自输入数据的证据，不能编造"
]
},
"thread_assessment": {
"status": "normal | suspicious | bottleneck | unknown",
"explanation": "线程热点、异步线程、wait/sleep/park 的判断",
"evidence": [
"来自输入数据的证据，不能编造"
]
},
"source_assessment": {
"status": "normal | suspicious | bottleneck | unknown",
"explanation": "热点来源属于原版、插件、模组、JVM、数据库、网络还是未知来源",
"evidence": [
"来自输入数据的证据，不能编造"
]
},
"data_limitations": [
"本次报告的限制，例如缺少主线程堆栈、缺少 TPS/MSPT、缺少 GC 数据、缺少在线人数"
]
},

"key_evidence": [
{
"title": "证据标题",
"source": "health | sampler | heap | thread | source | rule | unknown",
"explanation": "这条证据说明了什么",
"raw_observation": "输入数据中能支持该证据的原始观察或摘要，不要编造",
"confidence": "high | medium | low"
}
],

"suspected_causes": [
{
"rank": 1,
"name": "疑似原因名称",
"category": "main_thread | tps_mspt | memory_gc | chunk | entity_ai | redstone | hopper | database_io | plugin | mod | network | jvm | unknown",
"beginner_reason": "给小白看的原因解释",
"technical_reason": "给技术人员看的专业原因",
"evidence": [
"必须来自输入数据，不能编造"
],
"confidence": "high | medium | low",
"impact": "这个问题可能造成的影响",
"how_to_verify": [
"如何验证这个原因是否成立"
],
"not_enough_data_warning": "如果证据不足，在这里说明；如果证据充分，填空字符串"
}
],

"fix_plan": [
{
"priority": 1,
"action": "修复建议标题",
"difficulty": "easy | medium | hard",
"risk": "low | medium | high",
"expected_effect": "预期改善，例如降低 MSPT、减少卡顿尖刺、降低内存压力",
"beginner_steps": [
"给小白服主看的具体步骤 1",
"给小白服主看的具体步骤 2"
],
"professional_notes": [
"给技术人员看的专业说明，解释为什么这样做"
],
"backup_before_doing": true,
"rollback_plan": [
"如果改坏了，如何恢复"
],
"how_to_retest": [
"改完后如何复测，例如重新采样 spark、对比 TPS/MSPT、观察玩家反馈"
],
"related_evidence": [
"这条建议对应哪些证据"
]
}
],

"retest_commands": [
{
"title": "复测步骤标题",
"command": "具体命令；如果无法确定命令，填空字符串",
"when_to_run": "什么时候执行",
"what_to_compare": "要对比什么指标",
"beginner_explanation": "给小白解释这个命令是做什么的"
}
],

"safe_next_steps": [
"安全下一步 1",
"安全下一步 2"
],

"missing_information": [
{
"item": "缺失的信息名称",
"why_it_matters": "为什么这个信息重要",
"how_to_collect": "如何收集，例如重新跑 spark profiler 或 spark health"
}
],

"warnings": [
"需要提醒用户的事项，例如先备份、不要一次改多个变量、不要盲目删除插件"
],

"markdown_report": "一份给用户阅读的完整中文 Markdown 报告。必须包含：# 总结、## 小白解释、## 关键证据、## 疑似原因、## 修复建议、## 复测方法、## 缺失信息。内容必须和上面的 JSON 字段一致，不能新增 JSON 字段里没有依据的结论。"
}

---

## 字段取值规则

### severity

只能使用以下值之一：

* normal：没有明显性能问题，或数据不足以证明存在问题。
* low：轻微风险，当前不一定造成明显卡顿，但建议观察或微调。
* medium：存在可见性能压力，可能造成偶发卡顿。
* high：存在明显性能瓶颈，可能已经影响玩家体验或服务器稳定性。
* critical：严重 TPS/MSPT 异常、主线程明显阻塞、GC/内存高风险，服务器接近不可用。

如果关键数据不足，不要给 high 或 critical，除非已有证据非常明确。

### confidence_overall

只能使用：

* high：多个指标互相印证，证据明确。
* medium：有明显迹象，但缺少部分上下文。
* low：只有弱证据、单一线索或数据不足。

如果 missing_information 很多，confidence_overall 通常应为 low 或 medium。

### report_type

只能使用：

* sampler
* health
* heap
* unknown

如果输入的 reportType 不明确，使用 unknown。

### suspected_causes.category

只能使用：

* main_thread
* tps_mspt
* memory_gc
* chunk
* entity_ai
* redstone
* hopper
* database_io
* plugin
* mod
* network
* jvm
* unknown

如果不能确定分类，使用 unknown。

---

## 证据规则

1. evidence、raw_observation、related_evidence 必须来自输入数据。
2. 不能编造插件、模组、线程、实体、世界、坐标、配置项、JVM 参数、数据库信息或报错。
3. 如果没有证据，相关数组必须为空，并在 missing_information 中说明缺什么。
4. 如果只看到插件名或模组名，不能直接断言它有 bug。
5. 如果只看到异步线程占比高，不能直接断言它导致 TPS 卡顿。
6. 如果只看到 wait / sleep / park，不能直接判定为性能问题。
7. 如果缺少 TPS/MSPT，不能断言玩家一定卡。
8. 如果缺少主线程堆栈，不能断言具体插件导致主线程卡顿。
9. 如果缺少 GC 数据，不能断言一定是 GC 问题。
10. 如果证据不足，confidence 必须为 low 或 medium，不能为 high。

---

## 修复建议规则

fix_plan 中每条建议必须满足：

1. 必须安全。
2. 必须可执行。
3. 必须可回滚。
4. 必须可复测。
5. 必须有对应证据或明确标注为“进一步验证”。
6. 涉及改配置、插件、模组、JVM 参数或数据库设置时，backup_before_doing 必须为 true。
7. 不允许建议用户无备份删除世界、清空数据库、关闭所有保护插件、批量删除插件或强制 kill 进程。
8. 不允许只写“优化服务器”“检查插件”“调整配置”这种空泛建议。
9. 建议顺序必须按“低风险高收益优先，高风险操作靠后”的原则排列。

---

## markdown_report 要求

markdown_report 必须是完整中文报告，给普通服主直接阅读。

必须包含以下章节：

# 总结

用 2 到 4 句话说明本次报告整体情况。

## 小白解释

用生活比喻解释核心问题。
如果没有明显问题，也要说明“目前没有明显异常，不建议乱改”。

## 关键证据

列出 key_evidence 中的主要证据。
不能添加 JSON 其他字段没有体现的新结论。

## 疑似原因

解释 suspected_causes。
如果没有足够证据，必须说明“当前证据不足，不能确认具体原因”。

## 修复建议

解释 fix_plan。
每条建议都要有操作步骤、风险提醒和回滚说明。

## 复测方法

解释 retest_commands 和 how_to_retest。
告诉用户改完后怎么确认有没有变好。

## 缺失信息

解释 missing_information。
告诉用户下次应该补充什么报告或数据。

---

## 空数据处理规则

如果输入数据为空、不完整或无法判断：

1. severity 使用 normal 或 low。
2. confidence_overall 使用 low。
3. one_sentence_summary 说明“当前数据不足，无法确认明显性能问题”。
4. suspected_causes 可以为空数组。
5. fix_plan 应给出“如何重新采集有效 spark 报告”的安全建议。
6. missing_information 必须列出缺失项。
7. markdown_report 必须解释为什么无法下结论，以及下一步该采集什么。

---

## 最终输出要求

你只能输出 JSON 对象本身。
不要输出 Markdown 代码块。
不要输出解释。
不要输出前后缀。
不要输出注释。
不要省略字段。
不要使用 undefined。
不要使用 NaN。
字符串中如果包含换行，必须是合法 JSON 字符串。
最终输出必须能被 `JSON.parse()` 直接解析。
