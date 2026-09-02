package com.codespar.service;

import com.codespar.mapper.QuestionMapper;
import com.codespar.model.entity.Question;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 题目的落库。单独一个 Bean 是为了让 {@code @Transactional} 生效 ——
 * 出题编排在同一实例内自调用事务方法是无效的。
 */
@Service
@RequiredArgsConstructor
public class QuestionSaver {

    private final QuestionMapper questionMapper;
    private final QuestionTaggingService tagging;

    /** 待落库的一道题及其合并后的标签。 */
    public record QuestionDraft(Question question, List<String> tags) {}

    /** 一批题落库为 DRAFT，并重建各自的标签。 */
    @Transactional
    public void saveDraft(List<QuestionDraft> drafts) {
        for (QuestionDraft d : drafts) {
            questionMapper.insert(d.question());
            tagging.save(d.question().getId(), d.tags());
        }
    }
}
