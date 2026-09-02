package com.codespar.service;

import com.codespar.mapper.QuestionMapper;
import com.codespar.mapper.WrongQuestionMapper;
import com.codespar.model.dto.ExamDTO.ExamDetail;
import com.codespar.model.dto.WrongQuestionDTO.ComposeRequest;
import com.codespar.model.dto.WrongQuestionDTO.Item;
import com.codespar.model.dto.WrongQuestionDTO.ListView;
import com.codespar.model.dto.WrongQuestionDTO.Row;
import com.codespar.model.dto.WrongQuestionDTO.TagNameRow;
import com.codespar.model.entity.Question;
import com.codespar.model.entity.WrongQuestion;
import com.codespar.model.enums.QuestionDifficulty;
import com.codespar.model.enums.QuestionType;
import com.codespar.web.ApiExceptionHandler.BizException;
import com.fasterxml.jackson.core.type.TypeReference;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 错题本：列表、手动增删、从错题组卷重刷。 */
@Service
@RequiredArgsConstructor
public class WrongQuestionService {

    static final int DEFAULT_LIMIT = 10;

    private final WrongQuestionMapper mapper;
    private final QuestionMapper questionMapper;
    private final ExamService examService;
    private final QuestionConverter converter;

    @Value("${codespar.generation.max-questions-per-exam:20}")
    private int maxQuestions;

    public ListView list(String status, String tag) {
        String st = normalizeStatus(status);
        String tagFilter = tag == null || tag.isBlank() ? null : tag.trim();
        List<Row> rows = mapper.selectRows(st, tagFilter, null);
        List<Long> qids = rows.stream().map(Row::getQuestionId).toList();
        Map<Long, List<String>> tagsByQ = loadTags(qids);

        ListView view = new ListView();
        view.setItems(rows.stream().map(r -> toItem(r, tagsByQ.getOrDefault(r.getQuestionId(), List.of()))).toList());
        view.setTags(mapper.selectTagNames(st));
        return view;
    }

    @Transactional
    public Item add(Long questionId) {
        Question q = questionMapper.selectById(questionId);
        if (q == null) {
            throw new BizException("题目不存在：" + questionId);
        }
        WrongQuestion existing = mapper.selectByQuestionId(questionId);
        if (existing == null) {
            WrongQuestion w = new WrongQuestion();
            w.setQuestionId(questionId);
            w.setWrongCount(1);
            w.setPassStreak(0);
            w.setStatus("ACTIVE");
            w.setManualAdded(true);
            w.setLastWrongAt(LocalDateTime.now());
            mapper.insert(w);
        } else {
            existing.setStatus("ACTIVE");
            existing.setPassStreak(0);
            existing.setManualAdded(true);
            if (existing.getLastWrongAt() == null) {
                existing.setLastWrongAt(LocalDateTime.now());
            }
            mapper.updateById(existing);
        }
        return toItem(questionId);
    }

    @Transactional
    public void remove(Long id) {
        WrongQuestion w = mapper.selectById(id);
        if (w == null) {
            throw new BizException("错题本条目不存在");
        }
        mapper.deleteById(id);
    }

    @Transactional
    public void removeByQuestion(Long questionId) {
        WrongQuestion w = mapper.selectByQuestionId(questionId);
        if (w == null) {
            throw new BizException("该题不在错题本中");
        }
        mapper.deleteByQuestionId(questionId);
    }

    @Transactional
    public ExamDetail compose(ComposeRequest req) {
        ComposeRequest body = req == null ? new ComposeRequest() : req;
        boolean selected = body.getQuestionIds() != null && !body.getQuestionIds().isEmpty();
        boolean includeMastered = Boolean.TRUE.equals(body.getIncludeMastered());
        String status = selected || includeMastered ? null : "ACTIVE";
        String tag = selected || body.getTag() == null || body.getTag().isBlank() ? null : body.getTag().trim();
        List<Item> pool = list(status, tag).getItems();
        int limit = body.getLimit() == null ? DEFAULT_LIMIT : body.getLimit();
        List<Long> ids = pickIds(pool, body.getQuestionIds(), limit, maxQuestions);
        String name = tag != null ? "错题重刷 · " + tag : "错题重刷";
        return examService.composeFromQuestions(name, "WRONG_BOOK", null, ids);
    }

    /**
     * 勾选优先；否则取当前池子前 {@code limit} 道。超出上限截断。
     */
    static List<Long> pickIds(List<Item> pool, List<Long> selected, int limit, int max) {
        int cap = Math.min(Math.max(1, limit), Math.max(1, max));
        List<Long> poolIds = pool.stream().map(Item::getQuestionId).toList();
        List<Long> source;
        if (selected == null || selected.isEmpty()) {
            source = poolIds;
        } else {
            Set<Long> want = new LinkedHashSet<>(selected);
            Set<Long> allowed = new LinkedHashSet<>(poolIds);
            List<Long> missing = want.stream().filter(id -> !allowed.contains(id)).toList();
            if (!missing.isEmpty()) {
                throw new BizException("有题目不在当前错题本中");
            }
            source = poolIds.stream().filter(want::contains).toList();
        }
        if (source.isEmpty()) {
            throw new BizException("没有可组卷的错题");
        }
        if (source.size() > cap) {
            return List.copyOf(source.subList(0, cap));
        }
        return List.copyOf(source);
    }

    private Item toItem(Long questionId) {
        List<Row> rows = mapper.selectRows(null, null, questionId);
        if (rows.isEmpty()) {
            throw new BizException("错题本条目读取失败");
        }
        Row row = rows.getFirst();
        return toItem(row, loadTags(List.of(questionId)).getOrDefault(questionId, List.of()));
    }

    private Item toItem(Row r, List<String> tags) {
        Item item = new Item();
        item.setId(r.getId());
        item.setQuestionId(r.getQuestionId());
        item.setType(QuestionType.from(r.getType()));
        item.setDifficulty(QuestionDifficulty.from(r.getDifficulty()));
        item.setStem(r.getStem());
        item.setOptions(converter.parseList(r.getOptionsJson(), new TypeReference<>() {}));
        item.setReferenceAnswer(r.getReferenceAnswer());
        item.setCorrectAnswer(r.getCorrectAnswer());
        item.setExplanation(r.getExplanation());
        item.setFullScore(r.getFullScore());
        item.setTags(tags);
        item.setWrongCount(r.getWrongCount() == null ? 0 : r.getWrongCount());
        item.setPassStreak(r.getPassStreak() == null ? 0 : r.getPassStreak());
        item.setLastScoreRate(r.getLastScoreRate());
        item.setLastScore(r.getLastScore());
        item.setLastComment(r.getLastComment());
        item.setLastAnswer(r.getLastAnswer());
        item.setLastWrongAt(r.getLastWrongAt());
        item.setStatus(r.getStatus());
        item.setManualAdded(Boolean.TRUE.equals(r.getManualAdded()));
        item.setCreatedAt(r.getCreatedAt());
        return item;
    }

    private Map<Long, List<String>> loadTags(List<Long> qids) {
        Map<Long, List<String>> map = new LinkedHashMap<>();
        if (qids == null || qids.isEmpty()) {
            return map;
        }
        for (TagNameRow row : mapper.selectTagsByQuestionIds(qids)) {
            map.computeIfAbsent(row.getQuestionId(), k -> new ArrayList<>()).add(row.getName());
        }
        return map;
    }

    private static String normalizeStatus(String status) {
        if (status == null || status.isBlank() || "ALL".equalsIgnoreCase(status)) {
            return null;
        }
        String v = status.trim().toUpperCase();
        if (!"ACTIVE".equals(v) && !"MASTERED".equals(v)) {
            throw new BizException("状态只能是 ACTIVE / MASTERED / ALL");
        }
        return v;
    }
}
