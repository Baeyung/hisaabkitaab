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

    /**
     * The counterparty an entry names: an existing party by id, or a new one created from the
     * typed name. The id arrives from the client, so it is checked against {@code store} —
     * without that, an entry could name another shop's party, and since the khata statement is
     * queried by party alone the line would surface in <em>their</em> books. Reported as
     * not-found so we never leak whether the id exists.
     */
    Party resolveOrCreate(String partyId, String name, Store store);

    Party update(String id, Party changes, String storeId);

    /** Cascade-deletes transactions that reference this party, then the party itself. */
    void delete(String id, String storeId);
}
