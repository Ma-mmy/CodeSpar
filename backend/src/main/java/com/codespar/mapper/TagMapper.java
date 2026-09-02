package com.codespar.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.codespar.model.entity.Tag;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TagMapper extends BaseMapper<Tag> {

    /** name 唯一，并发下用 INSERT OR IGNORE 幂等建标签（SQLite 方言）。 */
    @Insert("INSERT OR IGNORE INTO tag(name) VALUES (#{name})")
    int insertIgnore(@Param("name") String name);
}
