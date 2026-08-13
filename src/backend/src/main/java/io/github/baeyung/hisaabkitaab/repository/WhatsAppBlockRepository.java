package io.github.baeyung.hisaabkitaab.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.WhatsAppBlock;

@Repository
public interface WhatsAppBlockRepository extends JpaRepository<WhatsAppBlock, String>
{
    Optional<WhatsAppBlock> findByStoreIdAndTargetIdAndContact(String storeId, String targetId, String contact);

    /**
     * Every block this shop has. Read whole rather than asked one recipient at a time: whether
     * a person is blocked depends on their own number as well as their id, so a list of people
     * cannot be answered by a single {@code where} — and a shop's blocks are a handful.
     */
    List<WhatsAppBlock> findByStoreId(String storeId);

    /** Newest first, so the back office opens on the blocks support is most likely asked about. */
    List<WhatsAppBlock> findAllByOrderByBlockedAtDesc();

    void deleteByStoreId(String storeId);
}
