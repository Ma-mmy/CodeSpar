{{slot_role}}

===== 文章标题 =====
{{title}}

===== 主分类（参考） =====
{{category_label}}

===== 文章原文（Markdown） =====
{{body_md}}

===== 任务 =====
{{slot_rules}}

===== 输出要求 =====
只输出一个合法 JSON 对象，不要 Markdown 围栏，不要 JSON 以外的文字：
{
  "sections": [
    {"title": "切片标题", "summary": "该切片核心内容（可含要点列表）"}
  ],
  "keypoints": [
    {"title": "考点名", "detail": "考点说明与常考原因", "importance": "HIGH|MEDIUM|LOW"}
  ],
  "classicQuestions": [
    {"question": "问题表述", "angle": "概念|对比|排查|设计|其他", "hint": "出题提示（可选）"}
  ],
  "summaryMarkdown": "完整可读的 Markdown 考点摘要正文"
}

注意：
1. sections 建议 3~12 个；keypoints 建议 5~20 个；classicQuestions 建议 5~15 个。
2. 语言与原文一致（中文原文则用中文）。
3. 任何字符串值内部禁止出现半角双引号 "，如需引用请使用「」或“」。
4. summaryMarkdown 应结构清晰，可用标题与列表，但整体仍是 JSON 字符串字段的值。
