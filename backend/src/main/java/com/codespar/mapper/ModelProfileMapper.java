package com.codespar.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.codespar.model.entity.ModelProfile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ModelProfileMapper extends BaseMapper<ModelProfile> {

    /** 设默认出题模型前先清掉其它记录的标记（同一时刻只能有一个默认）。 */
    @Update("UPDATE model_profile SET is_default_generate = 0 WHERE is_default_generate = 1")
    int clearDefaultGenerate();

    @Update("UPDATE model_profile SET is_default_grade = 0 WHERE is_default_grade = 1")
    int clearDefaultGrade();
}
