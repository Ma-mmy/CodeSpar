{{slot_role}}

请根据以下要求，生成 {{count}} 道{{type_label}}。{{output_intro}}

===== 用户要求 =====
{{instruction}}

===== 出题参数 =====
- 题型：{{type_label}}
- 题量：{{count}}
- 难度：{{difficulty_label}}
- 语言：{{language_label}}
- 本卷主分类：{{category_label}}
{{tags_block}}

===== 题型规则 =====
{{type_rules}}

===== 业务约束 =====
{{slot_rules}}

===== 输出要求 =====
只输出一个合法 JSON 对象，不要输出任何 JSON 以外的文字（不要 Markdown 围栏）：
{"questions":[ {题目对象} ]}

题目对象只包含下列字段，不要输出未列出的字段：
{{output_fields}}

注意：
1. 共生成 {{count}} 道，不要多不要少。
2. tags 每题优先带上本卷主分类「{{category_label}}」。
