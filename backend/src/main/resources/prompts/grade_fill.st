{{slot_role}}

===== 题干 =====
{{stem}}

===== 标准答案 / 可接受表述 =====
{{accepted_block}}

===== 考生作答 =====
{{user_answer}}

===== 判定约束 =====
{{slot_rules}}

===== 输出要求 =====
只输出一个合法 JSON 对象，不要输出任何 JSON 以外的文字：
{"equivalent": true或false, "reason": "一句简短理由"}

注意：
1. 仅当考生作答在语义上正确表达了标准答案时 equivalent 才为 true。
2. 拼写错误但意思明确可判 true；完全跑题或空答判 false。
3. 任何字符串值内部禁止出现半角双引号 "。
