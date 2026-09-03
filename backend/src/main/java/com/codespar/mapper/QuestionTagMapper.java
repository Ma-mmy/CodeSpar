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
}
