package com.codespar.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.codespar.model.entity.Question;
import com.codespar.model.enums.QuestionType;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface QuestionMapper extends BaseMapper<Question> {

    @Select("SELECT * FROM question WHERE job_id = #{jobId} ORDER BY id")
    List<Question> selectByJobId(@Param("jobId") Long jobId);

    @Select("SELECT COUNT(*) FROM question WHERE job_id = #{jobId}")
    int countByJobId(@Param("jobId") Long jobId);

    @Select("SELECT COUNT(*) FROM question WHERE job_id = #{jobId} AND type = #{type}")
    int countByJobAndType(@Param("jobId") Long jobId, @Param("type") QuestionType type);

    /** 确认组卷：把该任务下所有 DRAFT 题目转 ACTIVE。 */
    @Update("UPDATE question SET status = 'ACTIVE' WHERE job_id = #{jobId} AND status = 'DRAFT'")
    int bulkActivate(@Param("jobId") Long jobId);
}
