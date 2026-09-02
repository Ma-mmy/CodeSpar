package com.codespar.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

public final class AuthDTO {

    private AuthDTO() {}

    @Data
    public static class Status {
        private boolean enabled;
        private boolean unlocked;
        /** true：仍在用配置里的默认口令。 */
        private boolean managedByConfig;
    }

    @Data
    public static class LoginRequest {
        private String password;
    }

    @Data
    public static class ChangePasswordRequest {
        @NotBlank(message = "请填写当前口令")
        private String currentPassword;

        @NotBlank(message = "请填写新口令")
        @Size(min = 8, message = "新口令至少 8 位")
        private String newPassword;
    }
}
