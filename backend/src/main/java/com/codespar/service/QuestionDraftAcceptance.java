package com.codespar.service;

import com.codespar.ai.QuestionBatchDTO.QuestionDTO;
import com.codespar.model.dto.GenerationDTO.GenerateParams;
import com.codespar.model.entity.Question;
import com.codespar.model.enums.QuestionType;
import com.codespar.service.QuestionSaver.QuestionDraft;

import java.util.ArrayList;
import java.util.List;

/**
 * 从模型返回的题目列表里收下能过校验的，不合格的记下原因，供差额补生成。
 */
final class QuestionDraftAcceptance {

    record Result(List<QuestionDraft> drafts, String error) {
        boolean isEmpty() {
            return drafts.isEmpty();
        }
    }

    private QuestionDraftAcceptance() {}

    static Result accept(List<QuestionDTO> questions, QuestionConverter converter,
                         Long jobId, QuestionType type, GenerateParams params,
                         String fallbackLabel, int limit) {
        if (questions == null || questions.isEmpty()) {
            return new Result(List.of(), "模型没有返回任何题目");
        }
        int cap = Math.max(0, limit);
        List<QuestionDraft> ok = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        int index = 0;
        for (QuestionDTO dto : questions) {
            index++;
            if (ok.size() >= cap) {
                break;
            }
            if (dto == null) {
                errors.add("第" + index + "题：空对象");
                continue;
            }
            try {
                Question q = converter.toEntity(type, dto);
                q.setJobId(jobId);
                List<String> tags = converter.mergeTags(
                        dto.getTags(), params == null ? null : params.getTags(), fallbackLabel);
                ok.add(new QuestionDraft(q, tags));
            } catch (Exception ex) {
                String msg = ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage();
                errors.add("第" + index + "题：" + msg);
            }
        }
        String error = null;
        if (!errors.isEmpty()) {
            error = String.join("；", errors);
        }
        if (ok.size() < cap) {
            String shortfall = "只收下 " + ok.size() + " 道，还缺 " + (cap - ok.size()) + " 道";
            error = error == null ? shortfall : shortfall + "。" + error;
        }
        return new Result(List.copyOf(ok), error);
    }
}
