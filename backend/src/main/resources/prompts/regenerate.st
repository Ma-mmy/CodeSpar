{{slot_role}}

请重新生成一道{{type_label}}。

===== 原题题干 =====
{{original_stem}}

===== 修改意见 =====
{{feedback}}

===== 要求 =====
- 保持题型 {{type_label}}、难度 {{difficulty_label}}、满分 {{full_score}}。
{{slot_rules}}
- 只输出一个题目对象的合法 JSON（不要 {"questions":[...]} 包装），字段与出题规则一致：
  "type" / "difficulty"(只能是 BEGINNER|INTERMEDIATE|ADVANCED|EXPERT，不要用中文) / "stem" / "tags" /
  "options" / "correctAnswer" / "acceptedAnswers" / "referenceAnswer" /
  "rubric": [{"point":"得分点描述","score":分值}]（score 必须是数字，分值之和必须等于 fullScore）/ "fullScore" / "explanation"。
- 任何字符串值内部禁止出现半角双引号 "，如需引用请使用「」或“”。
- 除 JSON 外不要输出任何文字。
