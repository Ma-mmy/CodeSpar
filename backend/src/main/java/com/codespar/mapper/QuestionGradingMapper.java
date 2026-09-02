package com.codespar.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.codespar.model.entity.QuestionGrading;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface QuestionGradingMapper extends BaseMapper<QuestionGrading> {

    @Select("SELECT * FROM question_grading WHERE grading_id = #{gradingId}")
    List<QuestionGrading> selectByGradingId(@Param("gradingId") Long gradingId);

    @Select("SELECT * FROM question_grading WHERE grading_id = #{gradingId} AND question_id = #{questionId}")
    QuestionGrading selectByGradingAndQuestion(@Param("gradingId") Long gradingId,
                                               @Param("questionId") Long questionId);

    @Delete("DELETE FROM question_grading WHERE grading_id = #{gradingId}")
    int deleteByGradingId(@Param("gradingId") Long gradingId);
}
