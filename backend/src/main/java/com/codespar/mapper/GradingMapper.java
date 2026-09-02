package com.codespar.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.codespar.model.entity.Grading;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface GradingMapper extends BaseMapper<Grading> {

    @Select("SELECT * FROM grading WHERE exam_id = #{examId} ORDER BY id DESC LIMIT 1")
    Grading selectLatestByExamId(@Param("examId") Long examId);

    @Select("SELECT * FROM grading WHERE exam_id = #{examId}")
    List<Grading> selectByExamId(@Param("examId") Long examId);

    @Delete("DELETE FROM grading WHERE exam_id = #{examId}")
    int deleteByExamId(@Param("examId") Long examId);

    @Update("""
            UPDATE grading SET status = #{status}, total_score = #{totalScore}, full_score = #{fullScore},
            prompt_tokens = #{promptTokens}, completion_tokens = #{completionTokens}, cost_ms = #{costMs},
            error_msg = #{errorMsg}, updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id}
            """)
    int updateProgress(@Param("id") Long id,
                       @Param("status") String status,
                       @Param("totalScore") java.math.BigDecimal totalScore,
                       @Param("fullScore") Integer fullScore,
                       @Param("promptTokens") Integer promptTokens,
                       @Param("completionTokens") Integer completionTokens,
                       @Param("costMs") Long costMs,
                       @Param("errorMsg") String errorMsg);
}
