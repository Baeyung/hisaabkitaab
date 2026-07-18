package io.github.baeyung.hisaabkitaab.controller;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.cashbook.CashbookDayResponse;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.query.CashbookQueryService;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/cashbook")
@RequiredArgsConstructor
public class CashbookController
{
    private final CashbookQueryService cashbookQueryService;

    @GetMapping
    public ResponseEntity<CashbookDayResponse> getRange(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal UserPrincipal principal
    )
    {
        LocalDate start = from != null ? from : LocalDate.now();
        LocalDate end = to != null ? to : start;
        return ResponseEntity.ok(cashbookQueryService.getRange(principal.getId(), start, end));
    }
}
