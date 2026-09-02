package com.codespar.service;

import com.codespar.mapper.AnswerMapper;
import com.codespar.mapper.ExamMapper;
import com.codespar.mapper.ExamQuestionMapper;
import com.codespar.mapper.GenerationJobMapper;
import com.codespar.mapper.GradingMapper;
import com.codespar.mapper.QuestionGradingMapper;
import com.codespar.mapper.QuestionMapper;
import com.codespar.model.dto.ExamDTO.ExamListItem;
import com.codespar.model.entity.Exam;
import com.codespar.model.entity.GenerationJob;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ExamServiceListByArticleTest {

    ExamMapper examMapper;
    GenerationJobMapper generationJobMapper;
    ExamService service;

    @BeforeEach
    void setup() {
        examMapper = mock(ExamMapper.class);
        generationJobMapper = mock(GenerationJobMapper.class);
        CategoryService categoryService = mock(CategoryService.class);
        when(categoryService.labelOf(any())).thenAnswer(inv -> inv.getArgument(0));
        service = new ExamService(
                examMapper,
                mock(ExamQuestionMapper.class),
                mock(QuestionMapper.class),
                mock(AnswerMapper.class),
                mock(GradingMapper.class),
                mock(QuestionGradingMapper.class),
                generationJobMapper,
                mock(QuestionConverter.class),
                categoryService);
    }

    @Test
    void listByArticleIncludesNotStartedAndInProgress() {
        Exam notStarted = exam(1L, 9L, "NOT_STARTED");
        Exam inProgress = exam(2L, 9L, "IN_PROGRESS");
        Exam graded = exam(3L, 9L, "GRADED");
        when(examMapper.selectList(any())).thenReturn(List.of(graded, inProgress, notStarted));
        when(generationJobMapper.selectList(any())).thenReturn(List.of());

        List<ExamListItem> items = service.listByArticle(9L);
        assertEquals(List.of(3L, 2L, 1L), items.stream().map(ExamListItem::getId).toList());
        assertEquals(List.of("GRADED", "IN_PROGRESS", "NOT_STARTED"),
                items.stream().map(ExamListItem::getStatus).toList());
    }

    @Test
    void listByArticleKeepsOnlyLatestThree() {
        Exam e1 = exam(1L, 9L, "GRADED");
        Exam e2 = exam(2L, 9L, "GRADED");
        Exam e3 = exam(3L, 9L, "IN_PROGRESS");
        Exam e4 = exam(4L, 9L, "NOT_STARTED");
        when(examMapper.selectList(any())).thenReturn(List.of(e4, e3, e2, e1));
        when(generationJobMapper.selectList(any())).thenReturn(List.of());

        List<ExamListItem> items = service.listByArticle(9L);
        assertEquals(List.of(4L, 3L, 2L), items.stream().map(ExamListItem::getId).toList());
    }

    @Test
    void listByArticleIncludesExamLinkedOnlyViaJobAndBackfills() {
        GenerationJob job = new GenerationJob();
        job.setId(10L);
        job.setArticleId(9L);
        Exam viaJob = exam(5L, null, "NOT_STARTED");
        viaJob.setJobId(10L);

        when(examMapper.selectList(any()))
                .thenReturn(List.of())
                .thenReturn(List.of(viaJob));
        when(generationJobMapper.selectList(any())).thenReturn(List.of(job));

        List<ExamListItem> items = service.listByArticle(9L);
        assertEquals(1, items.size());
        assertEquals(5L, items.getFirst().getId());
        assertEquals("NOT_STARTED", items.getFirst().getStatus());
        assertEquals(9L, items.getFirst().getArticleId());
        verify(examMapper).updateById(any(Exam.class));
    }

    private static Exam exam(Long id, Long articleId, String status) {
        Exam e = new Exam();
        e.setId(id);
        e.setName("卷 " + id);
        e.setArticleId(articleId);
        e.setStatus(status);
        e.setSource("GENERATED");
        e.setQuestionCount(1);
        e.setFullScore(10);
        return e;
    }
}
