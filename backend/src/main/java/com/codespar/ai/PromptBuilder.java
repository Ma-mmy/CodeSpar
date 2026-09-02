package com.codespar.ai;

import com.codespar.model.dto.GenerationDTO.GenerateParams;
import com.codespar.model.entity.Question;
import com.codespar.model.enums.QuestionDifficulty;
import com.codespar.model.enums.QuestionType;
import com.codespar.service.CategoryService;
import com.codespar.service.SystemPromptService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Prompt 渲染。模板放在 {@code resources/prompts/*.st}，
 * 出题质量的调优 90% 是在改 prompt —— 放文件里改完重启即可，不用重新编译。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PromptBuilder {

    private final SystemPromptService systemPromptService;
    private final CategoryService categoryService;

    private static final Map<QuestionType, String> TYPE_LABEL = Map.of(
            QuestionType.SINGLE_CHOICE, "单选题",
            QuestionType.MULTI_CHOICE, "多选题",
            QuestionType.TRUE_FALSE, "判断题",
            QuestionType.FILL_BLANK, "填空题",
            QuestionType.SHORT_ANSWER, "概念问答题",
            QuestionType.SYSTEM_DESIGN, "系统设计题");

    private static final Map<QuestionDifficulty, String> DIFFICULTY_LABEL = Map.of(
            QuestionDifficulty.BEGINNER, "初级",
            QuestionDifficulty.INTERMEDIATE, "中级",
            QuestionDifficulty.ADVANCED, "高级",
            QuestionDifficulty.EXPERT, "专家");

    /** 每个题型的专属规则，逐条写清楚最容易出错的字段约束。 */
    private static final Map<QuestionType, String> TYPE_RULES = Map.of(
            QuestionType.SINGLE_CHOICE,
            "单选题：4 个选项，仅一个正确；correctAnswer 填正确选项的 key；需提供 explanation；fullScore 建议 5 分。",
            QuestionType.MULTI_CHOICE,
            "多选题：4~6 个选项，2~4 个正确；correctAnswer 填正确选项 keys，逗号分隔（如 \"A,C\"）；需提供 explanation；fullScore 建议 10 分。",
            QuestionType.TRUE_FALSE,
            "判断题：选项固定为 [{\"key\":\"T\",\"text\":\"正确\"},{\"key\":\"F\",\"text\":\"错误\"}]；correctAnswer 填 T 或 F；需提供 explanation；fullScore 建议 5 分。",
            QuestionType.FILL_BLANK,
            "填空题：题干中用 ____ 表示空；acceptedAnswers 必须包含标准答案与至少 1 个可接受同义表述；需提供 explanation；fullScore 建议 5 分。",
            QuestionType.SHORT_ANSWER,
            "概念问答题：需详细作答；referenceAnswer 为详尽的参考答案；rubric 3~5 个得分点，分值之和等于 fullScore（建议 10 分）。",
            QuestionType.SYSTEM_DESIGN,
            "系统设计题：需给出完整架构方案与取舍；referenceAnswer 为详尽的参考答案；rubric 4~6 个得分点（分层方案/延迟与召回的取舍/可观测性/失败降级等），分值之和等于 fullScore（建议 20 分）。");

    private final Map<String, String> templateCache = new ConcurrentHashMap<>();

    /* ---------------------------------------------------------- 出题 */

    /** 生成某一题型的 prompt。dedupStems 为空时去重块自动省略。 */
    public String buildGenerate(GenerateParams params, String instruction, QuestionType type,
                                int count, List<String> dedupStems) {
        Map<String, String> vars = new HashMap<>();
        vars.put("instruction", instruction.trim());
        vars.put("type", type.name());
        vars.put("type_label", TYPE_LABEL.get(type));
        vars.put("count", String.valueOf(count));
        vars.put("difficulty_label", DIFFICULTY_LABEL.get(params.getDifficulty()));
        vars.put("language_label", "en".equalsIgnoreCase(params.getLanguage()) ? "英文" : "中文");
        vars.put("category_label", categoryLabel(params.getCategory()));
        vars.put("category_whitelist", categoryService.whitelistText());
        vars.put("tags_block", buildTagsBlock(params.getTags(), params.getCategory()));
        vars.put("dedup_block", buildDedupBlock(dedupStems));
        vars.put("type_rules", TYPE_RULES.get(type));
        return render("generate", vars);
    }

    private static String fieldSpec(QuestionType type) {
        return "type(\"" + type.name() + "\") / difficulty(只能是 BEGINNER|INTERMEDIATE|ADVANCED|EXPERT，不要用中文)"
                + " / stem / tags / options / correctAnswer / acceptedAnswers / referenceAnswer"
                + " / rubric（分值之和等于 fullScore）/ fullScore / explanation";
    }

    /** 解析失败后的修正 prompt（批量输出）。 */
    public String buildFix(QuestionType type, int count, String error, String rawOutput) {
        Map<String, String> vars = new HashMap<>();
        vars.put("error", error);
        vars.put("raw_output", rawOutput);
        vars.put("fix_instructions",
                "输出结构必须是 {\"questions\":[ 题目对象 ]}。题目对象字段参考："
                        + fieldSpec(type)
                        + "。共 " + count + " 道，题型为 " + TYPE_LABEL.get(type) + "。");
        return render("fix", vars);
    }

    /** 单题重生成解析失败后的修正 prompt（单个题目对象，不带 questions 包装）。 */
    public String buildFixSingle(QuestionType type, String error, String rawOutput) {
        Map<String, String> vars = new HashMap<>();
        vars.put("error", error);
        vars.put("raw_output", rawOutput);
        vars.put("fix_instructions",
                "输出单个题目对象的合法 JSON（不要 {\"questions\":[...]} 包装）。字段参考："
                        + fieldSpec(type) + "。");
        return render("fix", vars);
    }

    /* ---------------------------------------------------------- 文章考点摘要 */

    /** 从 Markdown 原文提炼结构化考点摘要 + 可读 Markdown。 */
    public String buildArticleRefine(String title, String categoryCode, String bodyMd) {
        Map<String, String> vars = new HashMap<>();
        vars.put("title", title == null ? "未命名" : title.trim());
        vars.put("category_label",
                categoryCode == null || categoryCode.isBlank()
                        ? "（未指定）"
                        : categoryService.labelOf(categoryCode.trim()));
        String body = bodyMd == null ? "" : bodyMd;
        // 防御性截断，避免极端长文撑爆上下文（库内已有 200KB 硬限）
        if (body.length() > 120_000) {
            body = body.substring(0, 120_000) + "\n\n…（原文过长，已截断）";
        }
        vars.put("body_md", body);
        return render("article_refine", vars);
    }

    /* ---------------------------------------------------------- 出题前优化用户提示词 */

    /**
     * 把用户原始意图改写成更可执行的出题指令。
     * countsBlock / tagsBlock 由调用方按 GenerateParams 拼好。
     */
    public String buildOptimize(String userPrompt, GenerateParams params, String countsBlock) {
        Map<String, String> vars = new HashMap<>();
        vars.put("user_prompt", userPrompt == null ? "" : userPrompt.trim());
        vars.put("difficulty_label", DIFFICULTY_LABEL.getOrDefault(
                params.getDifficulty() == null ? QuestionDifficulty.ADVANCED : params.getDifficulty(),
                "高级"));
        vars.put("language_label", "en".equalsIgnoreCase(params.getLanguage()) ? "英文" : "中文");
        vars.put("category_label", categoryLabel(params.getCategory()));
        vars.put("tags_block", buildTagsBlock(params.getTags(), params.getCategory()));
        vars.put("counts_block", countsBlock == null ? "" : countsBlock);
        return render("optimize", vars);
    }

    /** 用户未选主分类时，让模型从已有列表选择或提出新建。 */
    public String buildClassifyCategory(String userPrompt) {
        Map<String, String> vars = new HashMap<>();
        vars.put("user_prompt", userPrompt == null ? "" : userPrompt.trim());
        vars.put("category_whitelist", categoryService.whitelistText());
        return render("classify_category", vars);
    }

    /* ---------------------------------------------------------- 单题重生成 */

    public String buildRegenerate(Question question, String feedback) {
        Map<String, String> vars = new HashMap<>();
        vars.put("type_label", TYPE_LABEL.get(question.getType()));
        vars.put("difficulty_label", DIFFICULTY_LABEL.get(question.getDifficulty()));
        vars.put("original_stem", question.getStem());
        vars.put("feedback", feedback == null || feedback.isBlank() ? "（无，请自由发挥，从新角度命题）" : feedback.trim());
        vars.put("full_score", String.valueOf(question.getFullScore()));
        return render("regenerate", vars);
    }

    /* ---------------------------------------------------------- 阅卷 */

    /**
     * 主观题阅卷 prompt。rubricJson 为 [{point,score}]；userAnswer 空时注入「（未作答）」。
     */
    public String buildGrade(Question question, String rubricBlock, String userAnswer) {
        Map<String, String> vars = new HashMap<>();
        vars.put("type_label", TYPE_LABEL.getOrDefault(question.getType(), question.getType().name()));
        vars.put("stem", question.getStem() == null ? "" : question.getStem());
        vars.put("reference_answer",
                question.getReferenceAnswer() == null || question.getReferenceAnswer().isBlank()
                        ? "（无参考答案）" : question.getReferenceAnswer());
        vars.put("full_score", String.valueOf(question.getFullScore()));
        vars.put("rubric_block", rubricBlock);
        vars.put("user_answer",
                userAnswer == null || userAnswer.isBlank() ? "（未作答）" : userAnswer);
        return render("grade", vars);
    }

    /** 填空题本地未命中时的语义等价判定。 */
    public String buildGradeFill(Question question, List<String> accepted, String userAnswer) {
        Map<String, String> vars = new HashMap<>();
        vars.put("stem", question.getStem() == null ? "" : question.getStem());
        StringBuilder acceptedBlock = new StringBuilder();
        if (accepted != null) {
            for (int i = 0; i < accepted.size(); i++) {
                acceptedBlock.append(i + 1).append(". ").append(accepted.get(i)).append('\n');
            }
        }
        vars.put("accepted_block", acceptedBlock.toString().trim());
        vars.put("user_answer",
                userAnswer == null || userAnswer.isBlank() ? "（未作答）" : userAnswer);
        return render("grade_fill", vars);
    }

    public static String typeLabel(QuestionType type) {
        return TYPE_LABEL.getOrDefault(type, type == null ? "" : type.name());
    }

    /* ---------------------------------------------------------- 内部 */

    private String buildTagsBlock(List<String> tags, String categoryCode) {
        if (tags != null && !tags.isEmpty()) {
            return "- 用户指定标签（优先使用，且须属于分类白名单）：" + String.join("、", tags);
        }
        if (categoryCode != null && !categoryCode.isBlank()) {
            return "- 用户未额外指定标签：每题 tags 至少包含主分类「"
                    + categoryService.labelOf(categoryCode.trim()) + "」";
        }
        return "- 用户未指定主分类与标签：请从白名单中为每题选 1~2 个粗分类 tags";
    }

    private String categoryLabel(String categoryCode) {
        if (categoryCode == null || categoryCode.isBlank()) {
            return "（未指定，请按题意自选粗分类）";
        }
        return categoryService.labelOf(categoryCode.trim());
    }

    private static String buildDedupBlock(List<String> dedupStems) {
        if (dedupStems == null || dedupStems.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder("===== 已出过的题（务必避开，从新角度切入）=====\n");
        for (int i = 0; i < dedupStems.size(); i++) {
            String stem = dedupStems.get(i);
            if (stem.length() > 150) {
                stem = stem.substring(0, 150) + "…";
            }
            sb.append(i + 1).append(". ").append(stem.replace('\n', ' ')).append('\n');
        }
        return sb.toString().trim();
    }

    private String render(String name, Map<String, String> vars) {
        Map<String, String> merged = new HashMap<>(vars);
        // 用户可配置槽位：{{slot_role}} / {{slot_rules}} 等
        for (Map.Entry<String, String> e : systemPromptService.resolveSlots(name).entrySet()) {
            merged.putIfAbsent("slot_" + e.getKey(), e.getValue());
        }
        String template = load(name);
        String out = template;
        for (Map.Entry<String, String> e : merged.entrySet()) {
            out = out.replace("{{" + e.getKey() + "}}", e.getValue() == null ? "" : e.getValue());
        }
        return out;
    }

    private String load(String name) {
        return templateCache.computeIfAbsent(name, n -> {
            ClassPathResource resource = new ClassPathResource("prompts/" + n + ".st");
            try {
                return new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            } catch (IOException e) {
                throw new IllegalStateException("加载 prompt 模板失败：" + n, e);
            }
        });
    }
}
