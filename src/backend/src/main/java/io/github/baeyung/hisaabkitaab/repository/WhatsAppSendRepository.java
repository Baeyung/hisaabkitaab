package io.github.baeyung.hisaabkitaab.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.WhatsAppSend;

@Repository
public interface WhatsAppSendRepository extends JpaRepository<WhatsAppSend, String>
{
    /** One shop's WhatsApp history, newest first — the order any screen showing it would want. */
    List<WhatsAppSend> findByStoreIdOrderBySentAtDesc(String storeId);

    void deleteByStoreId(String storeId);
}
