package io.github.baeyung.hisaabkitaab.service.query;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;
import io.github.baeyung.hisaabkitaab.dto.ledger.PartyBalanceResponse;
import io.github.baeyung.hisaabkitaab.dto.ledger.PartyStatementResponse;
import io.github.baeyung.hisaabkitaab.dto.ledger.PartyStatementRowResponse;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.repository.PartyRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository.PartyBalanceRow;
import io.github.baeyung.hisaabkitaab.service.PartyService;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import io.github.baeyung.hisaabkitaab.service.query.support.RunningBalanceFolder;
import lombok.RequiredArgsConstructor;

/**
 * The khata: every party with its net balance and direction, and the per-party
 * running-balance statement. Balance = Σ(IN) − Σ(OUT) over PARTY lines;
 * positive means they owe the store (see PartyProcessor for the write side).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class LedgerQueryService
{
    private final StoreService storeService;
    private final PartyService partyService;
    private final PartyRepository partyRepository;
    private final TransactionLineRepository transactionLineRepository;

    public List<PartyBalanceResponse> listBalances(String ownerId)
    {
        Store store = storeService.getPrimaryStoreForOwner(ownerId);

        Map<String, Double> balances = transactionLineRepository.sumPartyBalancesByStore(store.getId())
                .stream()
                .collect(Collectors.toMap(
                        PartyBalanceRow::getPartyId,
                        row -> row.getBalance() != null ? row.getBalance() : 0.0
                ));

        return partyRepository.findByStoreId(store.getId())
                .stream()
                .sorted(Comparator.comparing(Party::getName, String.CASE_INSENSITIVE_ORDER))
                .map(party -> new PartyBalanceResponse(
                        party.getId(),
                        party.getName(),
                        party.getContact(),
                        PartyBalance.of(balances.getOrDefault(party.getId(), 0.0))
                ))
                .toList();
    }

    public PartyStatementResponse getStatement(String ownerId, String partyId)
    {
        // findByIdForOwner 404s on another owner's party, so the lines query below is safe to scope by party alone.
        Party party = partyService.findByIdForOwner(partyId, ownerId);

        List<TransactionLine> lines = transactionLineRepository.findPartyLedgerLines(partyId);

        List<PartyStatementRowResponse> rows = RunningBalanceFolder.fold(
                lines,
                0,
                this::signedValue,
                (line, running) -> {
                    Transaction transaction = line.getTransaction();
                    return new PartyStatementRowResponse(
                            transaction.getId(),
                            transaction.getEventDate() != null ? transaction.getEventDate() : transaction.getEntryDate(),
                            transaction.getCreatedAt(),
                            transaction.getEvent(),
                            transaction.getDescription(),
                            line.getInOut(),
                            value(line),
                            PartyBalance.of(running)
                    );
                }
        );

        PartyBalance current = rows.isEmpty() ? PartyBalance.of(0) : rows.getLast().runningBalance();

        return new PartyStatementResponse(party.getId(), party.getName(), party.getContact(), rows, current);
    }

    private double signedValue(TransactionLine line)
    {
        return switch (line.getInOut())
        {
            case IN -> value(line);
            case OUT -> -value(line);
            default -> 0;
        };
    }

    private double value(TransactionLine line)
    {
        return line.getValue() != null ? line.getValue() : 0;
    }
}
