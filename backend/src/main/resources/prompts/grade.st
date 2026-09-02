{{slot_role}}

===== 题目 =====
题型：{{type_label}}
题干：
{{stem}}

===== 参考答案 =====
{{reference_answer}}

===== 评分要点（满分 {{full_score}}）=====
{{rubric_block}}

===== 考生作答 =====
{{user_answer}}

===== 阅卷约束 =====
{{slot_rules}}

===== 输出要求 =====
只输出一个合法 JSON 对象，不要输出任何 JSON 以外的文字（不要 Markdown 围栏）：
{
  "points": [
    {
      "point": "与输入评分要点完全一致的原文",
      "status": "HIT 或 PARTIAL 或 MISS",
      "score": 该点得分（数字）,
      "reason": "一句简短理由"
    }
  ],
  "comment": "整体点评：答得好的地方、不足、改进建议（Markdown）"
}

注意：
1. points 必须覆盖上面每一个评分要点，顺序与输入一致，point 字段用原文。
2. status 只能是 HIT（完全命中）/ PARTIAL（部分命中）/ MISS（遗漏）。
3. HIT 时 score 等于该点满分；MISS 时 score 为 0；PARTIAL 时 score 在 (0, 满分) 之间。
4. 不要自己算总分，只需给出每点 score。
5. 任何字符串值内部禁止出现半角双引号 "，如需引用请使用「」或“」。
