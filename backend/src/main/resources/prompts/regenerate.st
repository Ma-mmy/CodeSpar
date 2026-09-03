{{slot_role}}

请重新生成一道{{type_label}}。

===== 原题题干 =====
{{original_stem}}

===== 修改意见 =====
{{feedback}}

===== 要求 =====
- 保持题型 {{type_label}}、难度 {{difficulty_label}}、满分 {{full_score}}。
{{slot_rules}}
- 只输出一个题目对象的合法 JSON（不要 {"questions":[...]} 包装）。{{output_intro}}
{{output_fields}}
- 任何字符串值内部禁止出现半角双引号 "，如需引用请使用「」或“”。
- 除 JSON 外不要输出任何文字。
