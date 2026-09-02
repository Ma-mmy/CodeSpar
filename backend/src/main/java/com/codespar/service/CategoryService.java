package com.codespar.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.codespar.mapper.ExamCategoryMapper;
import com.codespar.model.dto.CategoryDTO.Upsert;
import com.codespar.model.dto.CategoryDTO.View;
import com.codespar.model.entity.ExamCategoryEntity;
import com.codespar.web.ApiExceptionHandler.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class CategoryService {

    private static final Pattern CODE_OK = Pattern.compile("^[A-Z][A-Z0-9_]{0,63}$");

    private final ExamCategoryMapper mapper;

    public List<View> listEnabled() {
        return mapper.selectList(Wrappers.<ExamCategoryEntity>lambdaQuery()
                        .eq(ExamCategoryEntity::getEnabled, true)
                        .orderByAsc(ExamCategoryEntity::getSortOrder)
                        .orderByAsc(ExamCategoryEntity::getId))
                .stream().map(this::toView).toList();
    }

    public List<View> listAll() {
        return mapper.selectList(Wrappers.<ExamCategoryEntity>lambdaQuery()
                        .orderByAsc(ExamCategoryEntity::getSortOrder)
                        .orderByAsc(ExamCategoryEntity::getId))
                .stream().map(this::toView).toList();
    }

    public Optional<ExamCategoryEntity> findByCode(String code) {
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(mapper.selectOne(Wrappers.<ExamCategoryEntity>lambdaQuery()
                .eq(ExamCategoryEntity::getCode, code.trim())
                .last("LIMIT 1")));
    }

    public Optional<ExamCategoryEntity> findByLabelIgnoreCase(String label) {
        if (label == null || label.isBlank()) {
            return Optional.empty();
        }
        for (ExamCategoryEntity e : mapper.selectList(Wrappers.<ExamCategoryEntity>lambdaQuery()
                .eq(ExamCategoryEntity::getEnabled, true))) {
            if (e.getLabel() != null && e.getLabel().equalsIgnoreCase(label.trim())) {
                return Optional.of(e);
            }
        }
        return Optional.empty();
    }

    public String labelOf(String code) {
        return findByCode(code).map(ExamCategoryEntity::getLabel).orElse(code);
    }

    /** 启用分类的展示名列表，供提示词白名单。 */
    public List<String> enabledLabels() {
        return listEnabled().stream().map(View::getLabel).toList();
    }

    public String whitelistText() {
        List<String> labels = enabledLabels();
        return labels.isEmpty() ? "（暂无）" : String.join("、", labels);
    }

    /**
     * 校验用户提交的分类 code；空则返回 null。
     * 未知 code 拒绝（须先在设置里建好，或走模型推断新建）。
     */
    public String requireExistingOrNull(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        ExamCategoryEntity e = findByCode(code)
                .orElseThrow(() -> new BizException("未知主分类：" + code));
        if (!Boolean.TRUE.equals(e.getEnabled())) {
            throw new BizException("主分类已禁用：" + e.getLabel());
        }
        return e.getCode();
    }

    /** 模型推断后落库：已有则返回 code；否则新建。 */
    @Transactional
    public String ensureFromModel(String codeHint, String labelHint) {
        String label = labelHint == null ? "" : labelHint.trim();
        if (label.isEmpty() && codeHint != null) {
            label = codeHint.trim();
        }
        if (label.isEmpty()) {
            label = "未分类";
        }
        Optional<ExamCategoryEntity> byLabel = findByLabelIgnoreCase(label);
        if (byLabel.isPresent()) {
            return byLabel.get().getCode();
        }
        if (codeHint != null && !codeHint.isBlank()) {
            Optional<ExamCategoryEntity> byCode = findByCode(codeHint.trim());
            if (byCode.isPresent()) {
                return byCode.get().getCode();
            }
        }
        Upsert req = new Upsert();
        req.setCode(codeHint);
        req.setLabel(label);
        req.setEnabled(true);
        return create(req).getCode();
    }

    @Transactional
    public View create(Upsert req) {
        String label = req.getLabel().trim();
        if (findByLabelIgnoreCase(label).isPresent()) {
            throw new BizException("分类名称已存在：" + label);
        }
        String code = normalizeCode(req.getCode(), label);
        if (findByCode(code).isPresent()) {
            throw new BizException("分类编码已存在：" + code);
        }
        ExamCategoryEntity e = new ExamCategoryEntity();
        e.setCode(code);
        e.setLabel(label);
        e.setBuiltin(false);
        e.setEnabled(req.getEnabled() == null || Boolean.TRUE.equals(req.getEnabled()));
        e.setSortOrder(req.getSortOrder() == null ? nextSort() : req.getSortOrder());
        mapper.insert(e);
        return toView(e);
    }

    @Transactional
    public View update(Long id, Upsert req) {
        ExamCategoryEntity e = getRequired(id);
        String label = req.getLabel().trim();
        Optional<ExamCategoryEntity> sameLabel = findByLabelIgnoreCase(label);
        if (sameLabel.isPresent() && !sameLabel.get().getId().equals(id)) {
            throw new BizException("分类名称已存在：" + label);
        }
        e.setLabel(label);
        if (req.getEnabled() != null) {
            e.setEnabled(req.getEnabled());
        }
        if (req.getSortOrder() != null) {
            e.setSortOrder(req.getSortOrder());
        }
        // 内置分类不允许改 code
        if (!Boolean.TRUE.equals(e.getBuiltin()) && req.getCode() != null && !req.getCode().isBlank()) {
            String code = normalizeCode(req.getCode(), label);
            Optional<ExamCategoryEntity> sameCode = findByCode(code);
            if (sameCode.isPresent() && !sameCode.get().getId().equals(id)) {
                throw new BizException("分类编码已存在：" + code);
            }
            e.setCode(code);
        }
        mapper.updateById(e);
        return toView(e);
    }

    @Transactional
    public void delete(Long id) {
        ExamCategoryEntity e = getRequired(id);
        if (Boolean.TRUE.equals(e.getBuiltin())) {
            throw new BizException("内置分类不可删除，可改为禁用");
        }
        mapper.deleteById(id);
    }

    private ExamCategoryEntity getRequired(Long id) {
        ExamCategoryEntity e = mapper.selectById(id);
        if (e == null) {
            throw new BizException("分类不存在：" + id);
        }
        return e;
    }

    private int nextSort() {
        ExamCategoryEntity last = mapper.selectOne(Wrappers.<ExamCategoryEntity>lambdaQuery()
                .orderByDesc(ExamCategoryEntity::getSortOrder)
                .last("LIMIT 1"));
        return last == null || last.getSortOrder() == null ? 100 : last.getSortOrder() + 10;
    }

    private String normalizeCode(String raw, String label) {
        String code = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        if (code.isBlank()) {
            String ascii = label.trim().toUpperCase(Locale.ROOT)
                    .replaceAll("[^A-Z0-9]+", "_")
                    .replaceAll("^_+|_+$", "");
            code = ascii.isBlank() ? "C_" + Integer.toHexString(label.hashCode()).toUpperCase(Locale.ROOT)
                    : ascii;
        }
        if (!CODE_OK.matcher(code).matches()) {
            code = "C_" + Integer.toHexString(code.hashCode()).toUpperCase(Locale.ROOT);
        }
        if (code.length() > 64) {
            code = code.substring(0, 64);
        }
        return code;
    }

    private View toView(ExamCategoryEntity e) {
        View v = new View();
        v.setId(e.getId());
        v.setCode(e.getCode());
        v.setLabel(e.getLabel());
        v.setBuiltin(Boolean.TRUE.equals(e.getBuiltin()));
        v.setEnabled(Boolean.TRUE.equals(e.getEnabled()));
        v.setSortOrder(e.getSortOrder());
        v.setUpdatedAt(e.getUpdatedAt());
        return v;
    }
}
