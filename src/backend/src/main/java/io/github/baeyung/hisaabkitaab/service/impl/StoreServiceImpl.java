package io.github.baeyung.hisaabkitaab.service.impl;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import io.github.baeyung.hisaabkitaab.dto.store.StoreSummary;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.enums.PlanCapacity;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.models.StoreSettings;
import io.github.baeyung.hisaabkitaab.repository.PartyRepository;
import io.github.baeyung.hisaabkitaab.repository.StoreAccessRepository;
import io.github.baeyung.hisaabkitaab.repository.StoreItemRepository;
import io.github.baeyung.hisaabkitaab.repository.StoreRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import io.github.baeyung.hisaabkitaab.repository.WhatsAppBlockRepository;
import io.github.baeyung.hisaabkitaab.repository.WhatsAppSendRepository;
import io.github.baeyung.hisaabkitaab.security.RequiresPlanCapacity;
import io.github.baeyung.hisaabkitaab.service.ExpenseCategoryService;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class StoreServiceImpl implements StoreService
{
    private static final Logger log = LoggerFactory.getLogger(StoreServiceImpl.class);

    private final StoreRepository storeRepository;
    private final StoreItemRepository storeItemRepository;
    private final PartyRepository partyRepository;
    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;
    private final StoreAccessRepository storeAccessRepository;
    private final ExpenseCategoryService expenseCategoryService;
    private final WhatsAppBlockRepository whatsAppBlockRepository;
    private final WhatsAppSendRepository whatsAppSendRepository;

    @Override
    @Transactional(readOnly = true)
    public List<StoreSummary> listForUser(String userId)
    {
        List<StoreSummary> summaries = new ArrayList<>(
                storeRepository.findByOwnerId(userId).stream()
                        .map(store -> StoreSummary.of(store, StoreRole.OWNER))
                        .toList());

        storeAccessRepository.findByUserId(userId).stream()
                .map(access -> StoreSummary.of(access.getStore(), access.getRole()))
                .forEach(summaries::add);

        return summaries;
    }

    @Override
    @Transactional(readOnly = true)
    public Store findByIdForUser(String id, String userId, StoreRole required)
    {
        Store store = load(id);

        // 404 for no access at all, so we never leak a store's existence. 403 once they *do*
        // have access is a different answer on purpose: "this is yours to see, but the owner
        // has to be the one to do it" is what the UI needs to say.
        StoreRole held = roleOf(store, userId);
        if (!held.atLeast(required))
        {
            // The 403 the caller sees says only "the owner has to do this". This says which
            // role they hold and which one the endpoint wanted, which is the difference
            // between diagnosing a permissions complaint and guessing at it.
            log.warn("refusing store {}: user {} holds {}, needs {}", id, userId, held, required);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the shop owner can do this");
        }

        return store;
    }

    @Override
    @Transactional(readOnly = true)
    public StoreSummary summaryOf(String storeId, String userId)
    {
        Store store = load(storeId);
        return StoreSummary.of(store, roleOf(store, userId));
    }

    @Override
    @RequiresPlanCapacity(PlanCapacity.STORES)
    public StoreSummary create(Store input, String ownerId)
    {
        Store store = Store.builder()
                .owner(userRepository.getReferenceById(ownerId))
                .name(input.getName())
                .address(input.getAddress())
                .contact(input.getContact())
                .logoUri(input.getLogoUri())
                .watermarkUri(input.getWatermarkUri())
                .build();

        Store saved = storeRepository.save(store);
        expenseCategoryService.seedDefaults(saved);
        log.info("created store {} \"{}\" for owner {}", saved.getId(), saved.getName(), ownerId);
        return StoreSummary.of(saved, StoreRole.OWNER);
    }

    @Override
    public StoreSummary update(String storeId, Store changes)
    {
        Store store = load(storeId);
        log.info("updating store {} \"{}\" -> \"{}\"", storeId, store.getName(), changes.getName());

        store.setName(changes.getName());
        store.setAddress(changes.getAddress());
        store.setContact(changes.getContact());
        store.setLogoUri(changes.getLogoUri());
        store.setWatermarkUri(changes.getWatermarkUri());

        // Only ever reached through @CurrentStore(OWNER), so the caller is the owner.
        return StoreSummary.of(storeRepository.save(store), StoreRole.OWNER);
    }

    @Override
    public StoreSummary updateSettings(String storeId, StoreSettings settings)
    {
        Store store = load(storeId);
        log.info("updating settings of store {} \"{}\"", storeId, store.getName());
        store.setSettings(settings);

        // Owner-only for the same reason as above (@CurrentStore(OWNER)).
        return StoreSummary.of(storeRepository.save(store), StoreRole.OWNER);
    }

    @Override
    public void delete(String storeId)
    {
        Store store = load(storeId);
        long startedAt = System.nanoTime();

        // Cascade: transactions first (their lines are removed via orphanRemoval), which clears the
        // references from items, parties and expense categories, then those, the shared access
        // rows, and finally the store itself.
        List<Transaction> transactions = transactionRepository.findByStoreId(storeId);
        List<StoreItem> items = storeItemRepository.findByStoreId(storeId);
        List<Party> parties = partyRepository.findByStoreId(storeId);

        // The largest irreversible thing this application does, and the slowest. The counts go
        // out before a single row is dropped, so that if it dies halfway there is a record of
        // what it was in the middle of — and so a long one can be seen to be progressing.
        log.warn("deleting store {} \"{}\": {} transaction(s), {} item(s), {} party(ies)",
                storeId, store.getName(), transactions.size(), items.size(), parties.size());

        transactionRepository.deleteAll(transactions);
        storeItemRepository.deleteAll(items);
        partyRepository.deleteAll(parties);
        expenseCategoryService.deleteByStore(storeId);
        storeAccessRepository.deleteByStoreId(storeId);
        // A block outlives the party it was made for, but not the shop it was made against:
        // there is nothing left to be blocked from once the shop is gone.
        whatsAppBlockRepository.deleteByStoreId(storeId);
        // Same for the send history: there is nothing left to audit once the shop is gone.
        whatsAppSendRepository.deleteByStoreId(storeId);
        storeRepository.delete(store);

        log.warn("deleted store {} in {}ms", storeId, (System.nanoTime() - startedAt) / 1_000_000);
    }

    private Store load(String id)
    {
        return storeRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Store", id));
    }

    /** Ownership beats the access table and costs no query; anything else has to be granted. */
    private StoreRole roleOf(Store store, String userId)
    {
        if (store.isOwnedBy(userId))
        {
            return StoreRole.OWNER;
        }

        return storeAccessRepository.findByStoreIdAndUserId(store.getId(), userId)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Store", store.getId()))
                .getRole();
    }
}
