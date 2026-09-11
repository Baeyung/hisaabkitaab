package io.github.baeyung.hisaabkitaab.controller;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.profit.ProfitResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.service.query.ProfitQueryService;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/stores/{storeId}/profit")
@RequiredArgsConstructor
public class ProfitController
{
    private final ProfitQueryService profitQueryService;

    @GetMapping
    public ResponseEntity<ProfitResponse> getProfit(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        // Default window: the last 30 days, four times the dashboard's. That screen is a daily
        // check on the drawer; this one is a trend, and a margin read over a week swings on one
        // big bill landing inside or outside it.
        LocalDate end = to != null ? to : LocalDate.now();
        LocalDate start = from != null ? from : end.minusDays(29);
        return ResponseEntity.ok(profitQueryService.getProfit(store.getId(), start, end));
    }
}
