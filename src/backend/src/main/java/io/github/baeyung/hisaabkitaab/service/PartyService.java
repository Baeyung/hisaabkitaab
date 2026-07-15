package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import io.github.baeyung.hisaabkitaab.entity.Party;

public interface PartyService
{
    Party findEntity(String id);

    /** Parties belonging to the owner's primary store. */
    List<Party> findByOwner(String ownerId);

    /** Load a party, 404-ing if it does not exist or is not in a store owned by {@code ownerId}. */
    Party findByIdForOwner(String id, String ownerId);

    Party create(Party party, String ownerId);

    Party update(String id, Party changes, String ownerId);

    /** Cascade-deletes transactions that reference this party, then the party itself. */
    void delete(String id, String ownerId);
}
