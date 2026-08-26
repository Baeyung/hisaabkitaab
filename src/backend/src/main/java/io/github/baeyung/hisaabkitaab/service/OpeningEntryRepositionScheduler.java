package io.github.baeyung.hisaabkitaab.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.repository.StoreRepository;
import lombok.RequiredArgsConstructor;

/**
 * Nightly safety net for opening balances/stock: a shopkeeper can backdate a sale,
 * purchase, or receipt to before an opening entry that was already set, and nothing
 * on that write path re-dates the opening entry it now sits ahead of. Once a day is
 * enough — this only ever matters while historical data is still being added, and
 * {@link OpeningEntryService#repositionOpeningEntries} is a no-op write-wise once
 * every opening entry already sits at its store/party/item's true earliest date.
 */
@Service
@RequiredArgsConstructor
public class OpeningEntryRepositionScheduler
{
    private static final Logger log = LoggerFactory.getLogger(OpeningEntryRepositionScheduler.class);

    private final StoreRepository storeRepository;

    private final OpeningEntryService openingEntryService;

    @Scheduled(cron = "0 0 3 * * *", zone = "${app.timezone:Asia/Karachi}")
    public void reposition()
    {
        for (Store store : storeRepository.findBySuspendedAtIsNull())
        {
            // One shop's bad data (an orphaned opening line, a missing item) must not cost
            // every shop after it in the list its correction — same isolation as ReportScheduler.
            try
            {
                openingEntryService.repositionOpeningEntries(store);
            }
            catch (RuntimeException e)
            {
                log.error("Opening entry reposition failed for store {}", store.getId(), e);
            }
        }
    }
}
