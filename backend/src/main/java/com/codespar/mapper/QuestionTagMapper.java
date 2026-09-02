package com.codespar.mapper;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** 题目↔标签的关联操作（复合主键，不走 BaseMapper）。 */
@Mapper
public interface QuestionTagMapper {

    @Insert("INSERT OR IGNORE INTO question_tag(question_id, tag_id) VALUES (#{questionId}, #{tagId})")
    int insertIgnore(@Param("questionId") Long questionId, @Param("tagId") Long tagId);

    @Delete("DELETE FROM question_tag WHERE question_id = #{questionId}")
    int deleteByQuestionId(@Param("questionId") Long questionId);

    @Select("SELECT tag_id FROM question_tag WHERE question_id = #{questionId}")
    List<Long> selectTagIdsByQuestionId(@Param("questionId") Long questionId);

    /**
     * 按标签取题目 id（去重上下文用），只算已确认入卷的题（ACTIVE）。
     * tagIds 为已有标签的 id。
     */
    @Select("""
            <script>
            SELECT qt.question_id FROM question_tag qt
            JOIN question q ON q.id = qt.question_id
            WHERE qt.tag_id IN
              <foreach collection='tagIds' item='t' open='(' separator=',' close=')'>#{t}</foreach>
              AND q.status = 'ACTIVE'
            ORDER BY qt.question_id DESC
            LIMIT #{limit}
            </script>
            """)
    List<Long> selectQuestionIdsByTagIds(@Param("tagIds") List<Long> tagIds, @Param("limit") int limit);
}
