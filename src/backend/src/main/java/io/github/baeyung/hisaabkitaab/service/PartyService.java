package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;

public interface PartyService
{
    Party findEntity(String id);

    List<Party> findByStore(String storeId);

    /** Load a party, 404-ing if it does not exist or does not belong to {@code storeId}. */
    Party findByIdForStore(String id, String storeId);

    Party create(Party party, Store store);

    Party update(String id, Party changes, String storeId);

    /** Cascade-deletes transactions that reference this party, then the party itself. */
    void delete(String id, String storeId);
}
