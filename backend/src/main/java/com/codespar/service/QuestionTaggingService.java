package com.codespar.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.codespar.mapper.QuestionTagMapper;
import com.codespar.mapper.TagMapper;
import com.codespar.model.entity.Tag;
import com.codespar.model.enums.ExamCategory;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** 题目标签的落库与读取。粗粒度分类优先匹配库表分类，其次旧枚举别名。 */
@Service
@RequiredArgsConstructor
public class QuestionTaggingService {

    private final TagMapper tagMapper;
    private final QuestionTagMapper questionTagMapper;
    private final CategoryService categoryService;

    /** 重建某题的标签：先清后插（INSERT OR IGNORE 幂等建标签）。 */
    @Transactional
    public void save(Long questionId, List<String> tags) {
        questionTagMapper.deleteByQuestionId(questionId);
        List<String> unique = canonicalize(tags, null);
        for (String name : unique) {
            tagMapper.insertIgnore(name);
            Tag tag = tagMapper.selectOne(Wrappers.<Tag>lambdaQuery().eq(Tag::getName, name));
            if (tag != null) {
                questionTagMapper.insertIgnore(questionId, tag.getId());
            }
        }
    }

    /** 把模型/用户标签归一到启用主分类；无法识别的细词丢弃。 */
    public List<String> canonicalize(List<String> tags, String fallbackLabel) {
        Set<String> unique = new LinkedHashSet<>();
        List<String> enabled = categoryService.enabledLabels();
        if (tags != null) {
            for (String t : tags) {
                if (t == null || t.isBlank()) {
                    continue;
                }
                String hit = matchLabel(t.trim(), enabled);
                if (hit != null) {
                    unique.add(hit);
                    continue;
                }
                ExamCategory.canonicalizeTag(t).ifPresent(unique::add);
            }
        }
        if (unique.isEmpty() && fallbackLabel != null && !fallbackLabel.isBlank()) {
            unique.add(fallbackLabel.trim());
        }
        return new ArrayList<>(unique);
    }

    private static String matchLabel(String raw, List<String> enabled) {
        for (String label : enabled) {
            if (label.equalsIgnoreCase(raw)) {
                return label;
            }
        }
        String key = raw.toLowerCase(Locale.ROOT).replace(" ", "").replace("-", "").replace("_", "");
        for (String label : enabled) {
            String lk = label.toLowerCase(Locale.ROOT).replace(" ", "").replace("-", "").replace("_", "");
            if (lk.equals(key)) {
                return label;
            }
        }
        return null;
    }

    /** 某题的全部标签名。 */
    public List<String> namesOf(Long questionId) {
        List<Long> tagIds = questionTagMapper.selectTagIdsByQuestionId(questionId);
        if (tagIds.isEmpty()) {
            return new ArrayList<>();
        }
        List<Tag> tags = tagMapper.selectBatchIds(tagIds);
        return tags.stream().map(Tag::getName).toList();
    }

    public void delete(Long questionId) {
        questionTagMapper.deleteByQuestionId(questionId);
    }
}
