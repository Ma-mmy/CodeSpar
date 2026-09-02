package com.codespar.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.codespar.model.entity.ExamQuestion;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface ExamQuestionMapper extends BaseMapper<ExamQuestion> {

    @Select("SELECT * FROM exam_question WHERE exam_id = #{examId} ORDER BY seq")
    List<ExamQuestion> selectByExamId(@Param("examId") Long examId);

    @Delete("DELETE FROM exam_question WHERE exam_id = #{examId}")
    int deleteByExamId(@Param("examId") Long examId);

    @Select("SELECT COUNT(*) FROM exam_question WHERE question_id = #{questionId}")
    int countByQuestionId(@Param("questionId") Long questionId);
}
