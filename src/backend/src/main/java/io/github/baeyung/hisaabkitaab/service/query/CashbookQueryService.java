package io.github.baeyung.hisaabkitaab.service.query;

import io.github.baeyung.hisaabkitaab.dto.cashbook.CashbookDayResponse;
import io.github.baeyung.hisaabkitaab.dto.cashbook.CashbookRowResponse;
import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.service.query.support.ItemSummary;
import io.github.baeyung.hisaabkitaab.service.query.support.RunningBalanceFolder;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The cashbook (روزنامچہ) day view: opening balance carried from all prior CASH
 * lines, the day's movements with a running balance, and the closing balance.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CashbookQueryService
{
    private final TransactionLineRepository transactionLineRepository;
    private final TransactionRepository transactionRepository;

    public CashbookDayResponse getRange(String storeId, LocalDate from, LocalDate to)
    {
        double opening = transactionLineRepository.sumCashBefore(storeId, from);
        List<TransactionLine> lines = transactionLineRepository.findCashLinesInRange(storeId, from, to);

        // The opening drawer balance is a baseline, not a movement. It's dated at the
        // store's opening, so viewing a window that starts on or before that date drops
        // it from sumCashBefore (and would otherwise surface it as a row in the range).
        // Fold it into the opening figure and drop it from the rows so it isn't lost or
        // double-counted — the cashbook opening always reflects the drawer balance.
        Transaction openingCash = transactionRepository
                .findFirstByStoreIdAndEvent(storeId, TransactionEvent.OPENING_CASH)
                .orElse(null);
        if (openingCash != null && !openingCashDate(openingCash).isBefore(from))
        {
            opening += value(openingCash.getLines().getFirst());
            lines = lines.stream()
                    .filter(line -> line.getTransaction().getEvent() != TransactionEvent.OPENING_CASH)
                    .toList();
        }

        // The other half of each entry: what it did to the party's khata. Every event posts
        // at most one CASH line, so a row maps to a transaction one-for-one and can carry its
        // khata movement whole without any of it being counted twice.
        Map<String, Double> khataNets = partyNetsByTransaction(storeId, from, to);

        List<CashbookRowResponse> rows = RunningBalanceFolder.fold(
                lines,
                opening,
                this::signedValue,
                (line, running) -> {
                    Transaction transaction = line.getTransaction();
                    return new CashbookRowResponse(
                            transaction.getId(),
                            transaction.getCreatedAt(),
                            transaction.getEvent(),
                            transaction.getDescription(),
                            ItemSummary.of(transaction),
                            transaction.getParty() != null ? transaction.getParty().getName() : null,
                            line.getInOut(),
                            value(line),
                            PartyBalance.of(khataNet(khataNets, transaction)),
                            running
                    );
                }
        );

        double totalIn = sumWhere(lines, InOut.IN);
        double totalOut = sumWhere(lines, InOut.OUT);
        // Netted over the rows on screen, not over every party line in the range — an entry
        // that moved no cash has no row here, and its khata belongs to the ledger, not this total.
        double totalKhata = lines.stream()
                .map(TransactionLine::getTransaction)
                .mapToDouble(transaction -> khataNet(khataNets, transaction))
                .sum();
        double closing = rows.isEmpty() ? opening : rows.getLast().runningBalance();

        return new CashbookDayResponse(
                from, to, opening, rows, totalIn, totalOut, PartyBalance.of(totalKhata), closing);
    }

    private Map<String, Double> partyNetsByTransaction(String storeId, LocalDate from, LocalDate to)
    {
        Map<String, Double> nets = new HashMap<>();
        for (TransactionLineRepository.TransactionPartyNetRow row
                : transactionLineRepository.sumPartyNetByTransactionInRange(storeId, from, to))
        {
            nets.put(row.getTransactionId(), row.getNet() != null ? row.getNet() : 0);
        }
        return nets;
    }

    private double khataNet(Map<String, Double> nets, Transaction transaction)
    {
        return nets.getOrDefault(transaction.getId(), 0.0);
    }

    private double sumWhere(List<TransactionLine> lines, InOut inOut)
    {
        return lines.stream().filter(line -> line.getInOut() == inOut).mapToDouble(this::value).sum();
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

    private LocalDate openingCashDate(Transaction transaction)
    {
        return transaction.getEventDate() != null ? transaction.getEventDate() : transaction.getEntryDate();
    }
}
