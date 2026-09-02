package com.codespar.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.codespar.model.entity.GenerationBatch;
import com.codespar.model.enums.QuestionType;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface GenerationBatchMapper extends BaseMapper<GenerationBatch> {

    @Select("SELECT * FROM generation_batch WHERE job_id = #{jobId} ORDER BY id")
    List<GenerationBatch> selectByJobId(@Param("jobId") Long jobId);

    @Select("SELECT * FROM generation_batch WHERE job_id = #{jobId} AND batch_type = #{type}")
    GenerationBatch selectByJobAndType(@Param("jobId") Long jobId, @Param("type") QuestionType type);

    @Delete("DELETE FROM generation_batch WHERE job_id = #{jobId}")
    int deleteByJobId(@Param("jobId") Long jobId);

    /**
     * 显式写全部字段 —— updateById 默认忽略 null，无法把 error/raw 从有值清成 null。
     * PENDING → RUNNING → SUCCESS 的流转需要能清掉上一次失败留下的内容。
     */
    @Update("""
            UPDATE generation_batch
            SET status = #{status},
                requested_count = #{requested},
                generated_count = #{generated},
                error_msg = #{error},
                raw_output = #{raw}
            WHERE id = #{id}
            """)
    int updateResult(@Param("id") Long id,
                     @Param("status") String status,
                     @Param("requested") int requested,
                     @Param("generated") int generated,
                     @Param("error") String error,
                     @Param("raw") String raw);
}
