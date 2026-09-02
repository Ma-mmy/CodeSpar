package com.codespar.service;

import com.codespar.mapper.DashboardMapper;
import com.codespar.model.dto.DashboardDTO.AggRow;
import com.codespar.model.dto.DashboardDTO.DayRow;
import com.codespar.model.dto.DashboardDTO.TagStat;
import com.codespar.model.dto.DashboardDTO.TagTrend;
import com.codespar.model.dto.DashboardDTO.Totals;
import com.codespar.model.dto.DashboardDTO.TotalsRow;
import com.codespar.model.dto.DashboardDTO.TrendPoint;
import com.codespar.model.dto.DashboardDTO.TypeStat;
import com.codespar.model.dto.DashboardDTO.View;
import com.codespar.model.dto.ExamDTO.ExamListItem;
import com.codespar.model.enums.QuestionType;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 能力仪表盘。按标签 / 题型 / 日期聚合历史阅卷；弱项入口跳到出题页由前端预填。
 */
@Service
@RequiredArgsConstructor
public class DashboardService {

    static final int WEAK_LIMIT = 5;

    private final DashboardMapper mapper;
    private final ExamService examService;

    @Value("${codespar.dashboard.min-tag-sample:3}")
    private int minTagSample;

    public View get() {
        View view = new View();
        view.setMinTagSample(Math.max(1, minTagSample));
        view.setTotals(toTotals(mapper.selectTotals(), mapper.countGradedQuestions()));

        List<TagStat> allTags = mapper.selectTagAgg().stream()
                .map(r -> toTag(r, view.getMinTagSample()))
                .filter(Objects::nonNull)
                .sorted(tagOrder())
                .toList();
        view.setAllTags(allTags);
        view.setWeakTags(pickWeakest(allTags, WEAK_LIMIT, view.getMinTagSample()));

        view.setTypeScores(mapper.selectTypeAgg().stream()
                .map(this::toType)
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(t -> t.getType().ordinal()))
                .toList());

        view.setTrend(mapper.selectOverallTrend().stream()
                .map(r -> toPoint(r, false))
                .filter(Objects::nonNull)
                .toList());
        view.setTagTrends(groupTagTrends(mapper.selectTagTrend()));

        List<ExamListItem> exams = examService.list();
        view.setRecentExams(exams.size() <= 5 ? exams : exams.subList(0, 5));
        return view;
    }

    /**
     * 最弱 N 个标签：先取样本充足的低分项，不足再拿样本不足的补齐（并保留标记）。
     */
    static List<TagStat> pickWeakest(List<TagStat> all, int limit, int minSample) {
        if (all == null || all.isEmpty() || limit <= 0) {
            return List.of();
        }
        Comparator<TagStat> order = tagOrder();
        List<TagStat> enough = all.stream()
                .filter(t -> t.getQuestionCount() >= minSample)
                .sorted(order)
                .toList();
        List<TagStat> picked = new ArrayList<>(enough.stream().limit(limit).toList());
        if (picked.size() < limit) {
            all.stream()
                    .filter(t -> t.getQuestionCount() < minSample)
                    .sorted(order)
                    .limit(limit - picked.size())
                    .forEach(picked::add);
        }
        return List.copyOf(picked);
    }

    private Totals toTotals(TotalsRow row, int gradedQuestions) {
        Totals t = new Totals();
        if (row == null) {
            t.setGradedQuestionCount(gradedQuestions);
            t.setOverallScoreRate(BigDecimal.ZERO);
            t.setEarned(BigDecimal.ZERO);
            return t;
        }
        t.setGradedExamCount(i(row.getGradedExamCount()));
        t.setOpenExamCount(i(row.getOpenExamCount()));
        t.setSubmittedExamCount(i(row.getSubmittedExamCount()));
        t.setGradedQuestionCount(gradedQuestions);
        t.setGenerationTokens(l(row.getGenerationTokens()));
        t.setGradingTokens(l(row.getGradingTokens()));
        t.setTokenTotal(t.getGenerationTokens() + t.getGradingTokens());
        t.setWrongQuestionCount(i(row.getWrongQuestionCount()));
        BigDecimal earned = bd(row.getEarned());
        int full = i(row.getFull());
        t.setEarned(earned);
        t.setFull(full);
        t.setOverallScoreRate(LocalScorer.rate(earned, full));
        return t;
    }

    private TagStat toTag(AggRow row, int minSample) {
        if (row == null || row.getTag() == null || row.getTag().isBlank()) {
            return null;
        }
        int full = i(row.getFull());
        if (full <= 0) {
            return null;
        }
        TagStat s = new TagStat();
        s.setTag(row.getTag());
        s.setEarned(bd(row.getEarned()));
        s.setFull(full);
        s.setRate(LocalScorer.rate(s.getEarned(), full));
        s.setQuestionCount(i(row.getQuestionCount()));
        s.setSampleInsufficient(s.getQuestionCount() < minSample);
        return s;
    }

    private TypeStat toType(AggRow row) {
        QuestionType type = QuestionType.from(row == null ? null : row.getType());
        if (type == null) {
            return null;
        }
        int full = i(row.getFull());
        TypeStat s = new TypeStat();
        s.setType(type);
        s.setEarned(bd(row.getEarned()));
        s.setFull(full);
        s.setRate(LocalScorer.rate(s.getEarned(), full));
        s.setQuestionCount(i(row.getQuestionCount()));
        return s;
    }

    private TrendPoint toPoint(DayRow row, boolean requireTag) {
        if (row == null || row.getDay() == null || row.getDay().isBlank()) {
            return null;
        }
        if (requireTag && (row.getTag() == null || row.getTag().isBlank())) {
            return null;
        }
        int full = i(row.getFull());
        TrendPoint p = new TrendPoint();
        p.setDay(row.getDay());
        p.setExamCount(i(row.getExamCount()));
        p.setQuestionCount(i(row.getQuestionCount()));
        p.setEarned(bd(row.getEarned()));
        p.setFull(full);
        p.setRate(LocalScorer.rate(p.getEarned(), full));
        return p;
    }

    private List<TagTrend> groupTagTrends(List<DayRow> rows) {
        Map<String, TagTrend> byTag = new LinkedHashMap<>();
        if (rows == null) {
            return List.of();
        }
        for (DayRow row : rows) {
            TrendPoint p = toPoint(row, true);
            if (p == null) {
                continue;
            }
            TagTrend trend = byTag.computeIfAbsent(row.getTag(), name -> {
                TagTrend t = new TagTrend();
                t.setTag(name);
                return t;
            });
            trend.getPoints().add(p);
        }
        return List.copyOf(byTag.values());
    }

    private static Comparator<TagStat> tagOrder() {
        return Comparator.comparing(TagStat::getRate, Comparator.nullsLast(BigDecimal::compareTo))
                .thenComparing(TagStat::getQuestionCount, Comparator.reverseOrder())
                .thenComparing(TagStat::getTag, Comparator.nullsLast(String::compareTo));
    }

    private static BigDecimal bd(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static int i(Number v) {
        return v == null ? 0 : v.intValue();
    }

    private static long l(Number v) {
        return v == null ? 0L : v.longValue();
    }
}
