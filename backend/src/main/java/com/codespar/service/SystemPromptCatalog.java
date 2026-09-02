package com.codespar.service;

import com.codespar.model.dto.SystemPromptDTO.SlotMeta;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 系统提示词元数据与默认槽位文案。 */
public final class SystemPromptCatalog {

    private SystemPromptCatalog() {}

    public record PromptDef(String key, String label, String description, List<SlotMeta> slots) {}

    public static List<PromptDef> all() {
        return List.of(
                def("article_refine", "文章考点提炼", "从 Markdown 原文提炼结构化考点摘要",
                        slot("role", "角色与目标",
                                "你是资深 LLM / Agent 应用工程师面试教练，擅长从技术文章中提炼可考的高频考点。"),
                        slot("rules", "提炼规则",
                                "1. 将原文按主题切成若干切片（sections），每段给出简短标题与核心要点。\n"
                                        + "2. 提炼高频 / 经典考点（keypoints），说明为什么常考。\n"
                                        + "3. 给出可直接用于出题的经典问题草稿（classicQuestions），覆盖概念理解、对比取舍、故障排查、系统设计等角度。\n"
                                        + "4. 同时输出一份给人阅读的 Markdown 考点摘要（summaryMarkdown）。\n"
                                        + "5. 紧扣原文，不要编造原文未涉及的技术细节。")),
                def("optimize", "出题前优化", "把用户出题意图改写成更可执行的指令",
                        slot("role", "角色与目标",
                                "你是资深 LLM / Agent 应用工程师面试出题提示词工程师。请把用户的出题意图改写成一份更清晰、更可执行的出题指令。"),
                        slot("rules", "改写目标",
                                "1. 保留用户核心意图，不要跑题；紧扣主分类。\n"
                                        + "2. 补全模糊处：考察重点、场景约束、题干风格（贴近真实工程/故障排查）、忌讳项。\n"
                                        + "3. 明确希望模型产出的题目特征：深度、对比取舍、可评分性。\n"
                                        + "4. 语言与参数一致；表述专业、简洁。\n"
                                        + "5. 提醒出题模型：题目标签只能用粗粒度分类，不要打细碎技术词。\n"
                                        + "6. 不要输出题干本身，也不要输出 JSON；只输出优化后的出题指令正文。")),
                def("generate", "出题生成", "按题型批量生成题目 JSON",
                        slot("role", "角色与目标",
                                "你是资深 LLM / Agent 应用工程师面试官。请根据要求生成题目，每道题必须包含参考答案与评分要点。"),
                        slot("rules", "出题约束",
                                "1. 题目必须贴近真实工程场景，避免空泛背诵定义。\n"
                                        + "2. 严禁与「已出过的题」重复。\n"
                                        + "3. tags 禁止细碎词，只能用白名单粗分类。\n"
                                        + "4. 任何字符串值内部禁止出现半角双引号。")),
                def("regenerate", "单题重生成", "按修改意见重出单题",
                        slot("role", "角色与目标",
                                "请重新生成一道题。根据原题与修改意见，从新角度命题，不要与原题雷同。"),
                        slot("rules", "额外约束",
                                "保持题型与满分不变；输出单个题目对象的合法 JSON。")),
                def("fix", "JSON 修正", "解析失败时回灌模型修正输出",
                        slot("role", "角色与目标",
                                "你上一次的 JSON 输出无法解析或未通过校验。请修正后重新输出完整、合法的 JSON（除 JSON 外不要输出任何文字，不要 Markdown 围栏）。"),
                        slot("rules", "额外约束", "严格遵守字段类型与题型规则，不要省略必填字段。")),
                def("grade", "主观题阅卷", "对照评分要点逐点打分",
                        slot("role", "角色与目标",
                                "你是严谨的面试阅卷官。请对照评分要点，对考生作答逐点打分。"),
                        slot("rules", "阅卷约束",
                                "客观公正；未作答按 0 分；输出合法 JSON，不要多余解释。")),
                def("grade_fill", "填空语义判定", "本地未命中时判断语义等价",
                        slot("role", "角色与目标",
                                "你是严谨的阅卷官。填空题本地匹配未命中，请判断考生作答是否与标准答案语义等价。"),
                        slot("rules", "判定约束",
                                "仅判断语义是否等价；输出合法 JSON。"))
        );
    }

    public static Map<String, PromptDef> byKey() {
        Map<String, PromptDef> map = new LinkedHashMap<>();
        for (PromptDef d : all()) {
            map.put(d.key(), d);
        }
        return map;
    }

    private static PromptDef def(String key, String label, String description, SlotMeta... slots) {
        return new PromptDef(key, label, description, List.of(slots));
    }

    private static SlotMeta slot(String key, String label, String defaultValue) {
        SlotMeta s = new SlotMeta();
        s.setKey(key);
        s.setLabel(label);
        s.setDescription("可自由改写；勿删除平台保留的输出格式约束。");
        s.setDefaultValue(defaultValue);
        return s;
    }
}
