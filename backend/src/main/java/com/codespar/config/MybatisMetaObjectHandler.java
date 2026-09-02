package com.codespar.config;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * created_at / updated_at 的自动填充。
 * <p>SQLite 没有 {@code ON UPDATE CURRENT_TIMESTAMP}，而 ChatModelFactory 以
 * {@code id + updated_at} 作缓存 key，更新模型配置必须让 updated_at 变化才能失效。
 * 因此 update 时<b>无条件</b>刷新 updated_at —— strictUpdateFill 只在字段为 null 时填，
 * 而实体从库里 load 出来时 updatedAt 非 null，会漏刷。
 */
@Component
public class MybatisMetaObjectHandler implements MetaObjectHandler {

    @Override
    public void insertFill(MetaObject metaObject) {
        LocalDateTime now = LocalDateTime.now();
        strictInsertFill(metaObject, "createdAt", LocalDateTime.class, now);
        strictInsertFill(metaObject, "updatedAt", LocalDateTime.class, now);
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        if (metaObject.hasSetter("updatedAt")) {
            metaObject.setValue("updatedAt", LocalDateTime.now());
        }
    }
}
