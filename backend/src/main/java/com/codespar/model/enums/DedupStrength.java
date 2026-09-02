package com.codespar.model.enums;

/**
 * 出题去重强度。
 * <ul>
 *   <li>OFF —— 不注入历史题干</li>
 *   <li>STANDARD —— 注入最近相关题干，提示模型避开</li>
 *   <li>STRICT —— 注入更多相关题干，并要求更明确的避开</li>
 * </ul>
 */
public enum DedupStrength {
    OFF,
    STANDARD,
    STRICT,
}
