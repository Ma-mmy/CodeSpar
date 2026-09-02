package com.codespar.service;

import com.codespar.ai.ChatModelFactory;
import com.codespar.ai.LenientJsonParser;
import com.codespar.ai.PromptBuilder;
import com.codespar.ai.QuestionBatchDTO.QuestionDTO;
import com.codespar.mapper.GenerationJobMapper;
import com.codespar.mapper.QuestionMapper;
import com.codespar.model.dto.GenerationDTO.GenerateParams;
import com.codespar.model.dto.GenerationDTO.QuestionView;
import com.codespar.model.entity.GenerationJob;
import com.codespar.model.entity.ModelProfile;
import com.codespar.model.entity.Question;
import com.codespar.web.ApiExceptionHandler.BizException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 预览页的单题操作：删除、按修改意见重生成。 */
@Slf4j
@Service
@RequiredArgsConstructor
public class QuestionService {

    private static final int MAX_RETRIES = 2;

    private final QuestionMapper questionMapper;
    private final GenerationJobMapper jobMapper;
    private final QuestionConverter converter;
    private final QuestionTaggingService tagging;
    private final ChatModelFactory modelFactory;
    private final ModelProfileService modelService;
    private final PromptBuilder promptBuilder;
    private final LenientJsonParser jsonParser;
    private final ObjectMapper objectMapper;

    @Transactional
    public void delete(Long id) {
        Question q = getDraft(id);
        tagging.delete(q.getId());
        questionMapper.deleteById(id);
    }

    public QuestionView regenerate(Long id, String feedback) {
        Question q = getDraft(id);
        GenerationJob job = jobMapper.selectById(q.getJobId());
        if (job == null) {
            throw new BizException("题目来源任务不存在");
        }
        ModelProfile model = modelService.getRequired(job.getModelProfileId());
        ChatModel chatModel = modelFactory.get(model);

        String prompt = promptBuilder.buildRegenerate(q, feedback);
        String raw = null;
        String lastError = null;
        for (int attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            ChatResponse resp = chatModel.call(new Prompt(prompt));
            raw = extractText(resp);
            try {
                QuestionDTO dto = jsonParser.parse(raw, QuestionDTO.class);
                return apply(q, job, dto);
            } catch (Exception e) {
                // 校验/解析失败 → 回灌重试
                lastError = e.getMessage();
                log.warn("单题重生成失败（第 {} 次）：{}", attempt + 1, lastError);
                prompt = promptBuilder.buildFixSingle(q.getType(), truncate(lastError, 800), raw);
            }
        }
        throw new BizException("重生成失败：" + truncate(lastError, 300)
                + "\n请重试或修改意见。原始输出：\n" + truncate(raw, 800));
    }

    @Transactional
    QuestionView apply(Question q, GenerationJob job, QuestionDTO dto) {
        Question fresh = converter.toEntity(q.getType(), dto);

        q.setDifficulty(fresh.getDifficulty());
        q.setStem(fresh.getStem());
        q.setOptionsJson(fresh.getOptionsJson());
        q.setCorrectAnswer(fresh.getCorrectAnswer());
        q.setAcceptedAnswers(fresh.getAcceptedAnswers());
        q.setReferenceAnswer(fresh.getReferenceAnswer());
        q.setRubricJson(fresh.getRubricJson());
        q.setFullScore(fresh.getFullScore());
        q.setExplanation(fresh.getExplanation());
        q.setEditedByUser(true);
        questionMapper.updateById(q);

        List<String> userTags = userTagsFrom(job);
        List<String> tags = converter.mergeTags(dto.getTags(), userTags);
        tagging.save(q.getId(), tags);
        return converter.toView(q, tags);
    }

    private List<String> userTagsFrom(GenerationJob job) {
        try {
            GenerateParams params = objectMapper.readValue(job.getParamsJson(), GenerateParams.class);
            return params.getTags();
        } catch (Exception e) {
            return List.of();
        }
    }

    private Question getDraft(Long id) {
        Question q = questionMapper.selectById(id);
        if (q == null) {
            throw new BizException("题目不存在：" + id);
        }
        if (!"DRAFT".equals(q.getStatus())) {
            throw new BizException("只有未组卷的题目可以删除或重生成");
        }
        return q;
    }

    private static String extractText(ChatResponse response) {
        if (response == null || response.getResult() == null || response.getResult().getOutput() == null) {
            return "";
        }
        String text = response.getResult().getOutput().getText();
        return text == null ? "" : text.trim();
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() > max ? s.substring(0, max) + "…" : s;
    }
}
