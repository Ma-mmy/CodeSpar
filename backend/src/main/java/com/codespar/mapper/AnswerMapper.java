package com.codespar.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.codespar.model.entity.Answer;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface AnswerMapper extends BaseMapper<Answer> {

    @Select("SELECT * FROM answer WHERE exam_id = #{examId}")
    List<Answer> selectByExamId(@Param("examId") Long examId);

    @Select("SELECT * FROM answer WHERE exam_id = #{examId} AND question_id = #{questionId}")
    Answer selectByExamAndQuestion(@Param("examId") Long examId, @Param("questionId") Long questionId);

    @Delete("DELETE FROM answer WHERE exam_id = #{examId}")
    int deleteByExamId(@Param("examId") Long examId);
}
