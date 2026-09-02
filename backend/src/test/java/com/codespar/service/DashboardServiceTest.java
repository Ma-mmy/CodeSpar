package com.codespar.service;

import com.codespar.model.dto.DashboardDTO.TagStat;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DashboardServiceTest {

    @Test
    void pickWeakestPrefersSufficientSample() {
        List<TagStat> all = List.of(
                tag("A", "0.10", 1),
                tag("B", "0.40", 5),
                tag("C", "0.20", 4),
                tag("D", "0.90", 8),
                tag("E", "0.30", 3),
                tag("F", "0.50", 6));
        List<TagStat> weak = DashboardService.pickWeakest(all, 3, 3);
        assertEquals(List.of("C", "E", "B"), weak.stream().map(TagStat::getTag).toList());
    }

    @Test
    void pickWeakestFillsWithInsufficientWhenNeeded() {
        List<TagStat> all = List.of(
                tag("enough", "0.80", 4),
                tag("thin-low", "0.10", 1),
                tag("thin-mid", "0.50", 2));
        List<TagStat> weak = DashboardService.pickWeakest(all, 3, 3);
        assertEquals(List.of("enough", "thin-low", "thin-mid"), weak.stream().map(TagStat::getTag).toList());
        assertTrue(weak.get(1).isSampleInsufficient());
        assertTrue(weak.get(2).isSampleInsufficient());
    }

    @Test
    void pickWeakestEmpty() {
        assertTrue(DashboardService.pickWeakest(List.of(), 5, 3).isEmpty());
    }

    private static TagStat tag(String name, String rate, int count) {
        TagStat s = new TagStat();
        s.setTag(name);
        s.setRate(new BigDecimal(rate));
        s.setQuestionCount(count);
        s.setSampleInsufficient(count < 3);
        s.setFull(count * 10);
        s.setEarned(new BigDecimal(rate).multiply(BigDecimal.valueOf(s.getFull())));
        return s;
    }
}
