package com.codespar.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.codespar.model.dto.WrongQuestionDTO.Row;
import com.codespar.model.dto.WrongQuestionDTO.TagNameRow;
import com.codespar.model.entity.WrongQuestion;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface WrongQuestionMapper extends BaseMapper<WrongQuestion> {

    @Select("SELECT * FROM wrong_question WHERE question_id = #{questionId}")
    WrongQuestion selectByQuestionId(@Param("questionId") Long questionId);

    @Delete("DELETE FROM wrong_question WHERE question_id = #{questionId}")
    int deleteByQuestionId(@Param("questionId") Long questionId);

    @Select("""
            <script>
            SELECT
              w.id, w.question_id, w.wrong_count, w.pass_streak, w.last_score_rate,
              w.last_wrong_at, w.status, w.manual_added, w.created_at,
              q.stem, q.type, q.difficulty, q.full_score, q.reference_answer,
              q.correct_answer, q.explanation,
              qg.score AS last_score, qg.comment AS last_comment,
              a.content AS last_answer
            FROM wrong_question w
            JOIN question q ON q.id = w.question_id
            LEFT JOIN question_grading qg ON qg.id = (
              SELECT MAX(qg2.id) FROM question_grading qg2 WHERE qg2.question_id = w.question_id
            )
            LEFT JOIN answer a ON a.id = (
              SELECT a2.id FROM answer a2
              WHERE a2.question_id = w.question_id
              ORDER BY a2.updated_at DESC, a2.id DESC
              LIMIT 1
            )
            WHERE (#{status} IS NULL OR w.status = #{status})
              AND (#{tag} IS NULL OR EXISTS (
                SELECT 1 FROM question_tag qt
                JOIN tag t ON t.id = qt.tag_id
                WHERE qt.question_id = w.question_id AND t.name = #{tag}
              ))
              AND (#{questionId} IS NULL OR w.question_id = #{questionId})
            ORDER BY CASE w.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,
                     w.last_wrong_at DESC, w.id DESC
            </script>
            """)
    List<Row> selectRows(@Param("status") String status,
                         @Param("tag") String tag,
                         @Param("questionId") Long questionId);

    @Select("""
            <script>
            SELECT DISTINCT t.name
            FROM wrong_question w
            JOIN question_tag qt ON qt.question_id = w.question_id
            JOIN tag t ON t.id = qt.tag_id
            WHERE (#{status} IS NULL OR w.status = #{status})
            ORDER BY t.name
            </script>
            """)
    List<String> selectTagNames(@Param("status") String status);

    @Select("""
            <script>
            SELECT qt.question_id AS question_id, t.name AS name
            FROM question_tag qt
            JOIN tag t ON t.id = qt.tag_id
            WHERE qt.question_id IN
              <foreach collection='ids' item='id' open='(' separator=',' close=')'>#{id}</foreach>
            </script>
            """)
    List<TagNameRow> selectTagsByQuestionIds(@Param("ids") List<Long> ids);
}
