package com.codespar.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.codespar.model.entity.GenerationJob;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface GenerationJobMapper extends BaseMapper<GenerationJob> {

    @Update("UPDATE generation_job SET status = #{status} WHERE id = #{id}")
    int updateStatus(@Param("id") Long id, @Param("status") String status);


    /**
     * 运行时进度更新。写的是累计值（非增量），各批并发写同一行也不会丢：
     * 每批完成后用「已累计的总数」覆盖，最后落盘的总是最新累计值。
     */
    @Update("""
            UPDATE generation_job
            SET generated_count = #{generatedCount},
                prompt_tokens = #{promptTokens},
                completion_tokens = #{completionTokens},
                cost_ms = #{costMs}
            WHERE id = #{id}
            """)
    int updateProgress(@Param("id") Long id,
                       @Param("generatedCount") int generatedCount,
                       @Param("promptTokens") int promptTokens,
                       @Param("completionTokens") int completionTokens,
                       @Param("costMs") long costMs);
}
