package io.github.baeyung.hisaabkitaab.service.query;

import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.dto.cashbook.CashbookDayResponse;
import io.github.baeyung.hisaabkitaab.dto.cashbook.CashbookRowResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import io.github.baeyung.hisaabkitaab.service.query.support.RunningBalanceFolder;
import lombok.RequiredArgsConstructor;

/**
 * The cashbook (روزنامچہ) day view: opening balance carried from all prior CASH
 * lines, the day's movements with a running balance, and the closing balance.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CashbookQueryService
{
    private final StoreService storeService;
    private final TransactionLineRepository transactionLineRepository;

    public CashbookDayResponse getDay(String ownerId, LocalDate day)
    {
        Store store = storeService.getPrimaryStoreForOwner(ownerId);

        double opening = transactionLineRepository.sumCashBefore(store.getId(), day);
        List<TransactionLine> lines = transactionLineRepository.findCashLinesForDay(store.getId(), day);

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
                            transaction.getParty() != null ? transaction.getParty().getName() : null,
                            line.getInOut(),
                            value(line),
                            running
                    );
                }
        );

        double totalIn = sumWhere(lines, InOut.IN);
        double totalOut = sumWhere(lines, InOut.OUT);
        double closing = rows.isEmpty() ? opening : rows.getLast().runningBalance();

        return new CashbookDayResponse(day, opening, rows, totalIn, totalOut, closing);
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
}
