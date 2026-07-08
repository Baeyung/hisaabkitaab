package io.github.baeyung.hisaabkitaab.dto.transaction;

import java.time.Instant;
import java.time.LocalDate;

import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class TransactionResponse
{
    private String id;

    private String storeId;

    private TransactionEvent event;

    private String partyId;

    private String bill;

    private LocalDate eventDate;

    private LocalDate entryDate;

    private String description;

    private Instant createdAt;
}
