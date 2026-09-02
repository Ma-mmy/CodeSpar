package com.codespar.web;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.codespar.mapper.TagMapper;
import com.codespar.model.entity.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 标签列表（出题表单的已有标签建议）。 */
@RestController
@RequestMapping("/api/tags")
@RequiredArgsConstructor
public class TagController {

    private final TagMapper tagMapper;

    @GetMapping
    public List<String> list() {
        return tagMapper.selectList(Wrappers.<Tag>lambdaQuery().orderByAsc(Tag::getName))
                .stream().map(Tag::getName).toList();
    }
}
