{{slot_role}}

请根据以下要求，生成 {{count}} 道{{type_label}}，每道题必须包含出题时同步产出的参考答案与评分要点。

===== 用户要求 =====
{{instruction}}

===== 出题参数 =====
- 题型：{{type_label}}
- 题量：{{count}}
- 难度：{{difficulty_label}}
- 语言：{{language_label}}
- 本卷主分类：{{category_label}}
{{tags_block}}
{{dedup_block}}

===== 题型规则 =====
{{type_rules}}

===== 业务约束 =====
{{slot_rules}}

===== 输出要求 =====
只输出一个合法 JSON 对象，不要输出任何 JSON 以外的文字（不要 Markdown 围栏）：
{"questions":[ {题目对象} ]}

题目对象字段：
- "type": "{{type}}"
- "difficulty": "BEGINNER" 或 "INTERMEDIATE" 或 "ADVANCED" 或 "EXPERT"
- "stem": 题干（Markdown，可含代码块）
- "tags": 1~2 个粗粒度分类标签，必须从白名单选取：{{category_whitelist}}
- "options": [{"key":"A","text":"选项文本"}]，仅选择题需要
- "correctAnswer": 正确选项 key，仅客观题需要（多选题用逗号分隔多个 key，如 "A,C"）
- "acceptedAnswers": ["标准答案","可接受的同义表述"]，仅填空题需要
- "referenceAnswer": 参考答案（Markdown，详尽，是复盘学习材料）
- "rubric": [{"point":"得分点描述","score":分值}]，主观题必填，分值之和必须等于 fullScore
- "fullScore": 本题满分
- "explanation": 答案解析，仅客观题需要

注意：
1. 共生成 {{count}} 道，不要多不要少。
2. tags 每题优先带上本卷主分类「{{category_label}}」。
