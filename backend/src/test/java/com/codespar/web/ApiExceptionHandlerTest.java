package com.codespar.web;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ApiExceptionHandlerTest {

    @Test
    void missingStaticResourceIs404Not500() {
        var handler = new ApiExceptionHandler();
        var ex = new NoResourceFoundException(HttpMethod.GET, "access/foo.png");
        var res = handler.handleNoResource(ex);
        assertEquals(HttpStatus.NOT_FOUND, res.getStatusCode());
        assertNull(res.getBody());
    }

    @Test
    void adviceMapsNoResourceFoundTo404WithoutJsonBody() throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new StubMissingResourceController())
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
        mvc.perform(get("/access/foo.png").accept(MediaType.IMAGE_PNG))
                .andExpect(status().isNotFound())
                .andExpect(content().string(""));
    }

    @RestController
    static class StubMissingResourceController {
        @GetMapping("/access/foo.png")
        void missing() throws NoResourceFoundException {
            throw new NoResourceFoundException(HttpMethod.GET, "access/foo.png");
        }
    }
}
