package com.codespar.mapper;

import com.codespar.model.dto.DashboardDTO.AggRow;
import com.codespar.model.dto.DashboardDTO.DayRow;
import com.codespar.model.dto.DashboardDTO.TotalsRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 仪表盘聚合。只统计每张试卷「最新一次」SUCCESS/PARTIAL 阅卷，避免重跑阅卷重复计入。
 */
@Mapper
public interface DashboardMapper {

    @Select("""
            SELECT
              (SELECT COUNT(*)
               FROM exam e
               JOIN grading g ON g.id = (SELECT MAX(g2.id) FROM grading g2 WHERE g2.exam_id = e.id)
               WHERE e.status = 'GRADED' AND g.status IN ('SUCCESS', 'PARTIAL')
              ) AS graded_exam_count,
              (SELECT COUNT(*) FROM exam WHERE status IN ('NOT_STARTED', 'IN_PROGRESS')) AS open_exam_count,
              (SELECT COUNT(*) FROM exam WHERE status = 'SUBMITTED') AS submitted_exam_count,
              (SELECT COALESCE(SUM(prompt_tokens), 0) + COALESCE(SUM(completion_tokens), 0)
               FROM generation_job) AS generation_tokens,
              (SELECT COALESCE(SUM(prompt_tokens), 0) + COALESCE(SUM(completion_tokens), 0)
               FROM grading) AS grading_tokens,
              (SELECT COUNT(*) FROM wrong_question WHERE status = 'ACTIVE') AS wrong_question_count,
              (SELECT COALESCE(SUM(e.total_score), 0)
               FROM exam e
               JOIN grading g ON g.id = (SELECT MAX(g2.id) FROM grading g2 WHERE g2.exam_id = e.id)
               WHERE e.status = 'GRADED' AND g.status IN ('SUCCESS', 'PARTIAL')
              ) AS earned,
              (SELECT COALESCE(SUM(e.full_score), 0)
               FROM exam e
               JOIN grading g ON g.id = (SELECT MAX(g2.id) FROM grading g2 WHERE g2.exam_id = e.id)
               WHERE e.status = 'GRADED' AND g.status IN ('SUCCESS', 'PARTIAL')
              ) AS full
            """)
    TotalsRow selectTotals();

    @Select("""
            SELECT COUNT(*)
            FROM question_grading qg
            JOIN grading g ON g.id = qg.grading_id
            JOIN exam e ON e.id = g.exam_id
            JOIN (SELECT exam_id, MAX(id) AS max_id FROM grading GROUP BY exam_id) latest
              ON latest.max_id = g.id
            WHERE e.status = 'GRADED'
              AND g.status IN ('SUCCESS', 'PARTIAL')
              AND (qg.error_msg IS NULL OR qg.error_msg = '')
            """)
    int countGradedQuestions();

    @Select("""
            SELECT
              t.name AS tag,
              SUM(qg.score) AS earned,
              SUM(qg.full_score) AS full,
              COUNT(*) AS question_count
            FROM question_grading qg
            JOIN grading g ON g.id = qg.grading_id
            JOIN exam e ON e.id = g.exam_id
            JOIN (SELECT exam_id, MAX(id) AS max_id FROM grading GROUP BY exam_id) latest
              ON latest.max_id = g.id
            JOIN question_tag qt ON qt.question_id = qg.question_id
            JOIN tag t ON t.id = qt.tag_id
            WHERE e.status = 'GRADED'
              AND g.status IN ('SUCCESS', 'PARTIAL')
              AND (qg.error_msg IS NULL OR qg.error_msg = '')
            GROUP BY t.id, t.name
            """)
    List<AggRow> selectTagAgg();

    @Select("""
            SELECT
              q.type AS type,
              SUM(qg.score) AS earned,
              SUM(qg.full_score) AS full,
              COUNT(*) AS question_count
            FROM question_grading qg
            JOIN grading g ON g.id = qg.grading_id
            JOIN exam e ON e.id = g.exam_id
            JOIN (SELECT exam_id, MAX(id) AS max_id FROM grading GROUP BY exam_id) latest
              ON latest.max_id = g.id
            JOIN question q ON q.id = qg.question_id
            WHERE e.status = 'GRADED'
              AND g.status IN ('SUCCESS', 'PARTIAL')
              AND (qg.error_msg IS NULL OR qg.error_msg = '')
            GROUP BY q.type
            """)
    List<AggRow> selectTypeAgg();

    @Select("""
            SELECT
              substr(COALESCE(e.submitted_at, e.updated_at), 1, 10) AS day,
              COUNT(*) AS exam_count,
              SUM(e.total_score) AS earned,
              SUM(e.full_score) AS full
            FROM exam e
            JOIN grading g ON g.id = (SELECT MAX(g2.id) FROM grading g2 WHERE g2.exam_id = e.id)
            WHERE e.status = 'GRADED'
              AND g.status IN ('SUCCESS', 'PARTIAL')
            GROUP BY day
            ORDER BY day
            """)
    List<DayRow> selectOverallTrend();

    @Select("""
            SELECT
              t.name AS tag,
              substr(COALESCE(e.submitted_at, e.updated_at), 1, 10) AS day,
              SUM(qg.score) AS earned,
              SUM(qg.full_score) AS full,
              COUNT(*) AS question_count
            FROM question_grading qg
            JOIN grading g ON g.id = qg.grading_id
            JOIN exam e ON e.id = g.exam_id
            JOIN (SELECT exam_id, MAX(id) AS max_id FROM grading GROUP BY exam_id) latest
              ON latest.max_id = g.id
            JOIN question_tag qt ON qt.question_id = qg.question_id
            JOIN tag t ON t.id = qt.tag_id
            WHERE e.status = 'GRADED'
              AND g.status IN ('SUCCESS', 'PARTIAL')
              AND (qg.error_msg IS NULL OR qg.error_msg = '')
            GROUP BY t.name, day
            ORDER BY t.name, day
            """)
    List<DayRow> selectTagTrend();
}
