package io.github.baeyung.hisaabkitaab.repository;

import java.time.Instant;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.WhatsAppSend;
import io.github.baeyung.hisaabkitaab.enums.WhatsAppSendSource;

@Repository
public interface WhatsAppSendRepository extends JpaRepository<WhatsAppSend, String>
{
    /** One shop's WhatsApp history, newest first — the order any screen showing it would want. */
    List<WhatsAppSend> findByStoreIdOrderBySentAtDesc(String storeId);

    /**
     * Whether one of the scheduled jobs has already run for this shop inside {@code from..to}.
     *
     * <p>This is what keeps a job from firing twice. The scheduler ticks every minute and acts
     * on the minute a shop asks for, so a restart, a slow run overlapping the next tick, or a
     * clock stepping backwards could all land on the same minute again — and a customer chased
     * twice in one month is a worse bug than one chased late. Asked of what actually went out
     * rather than of a counter, so it cannot drift from the truth it is standing in for.
     *
     * <p>Counts rows of every status, not only {@code SENT}: a report the renderer failed on
     * has already been attempted, and retrying it on the next tick would mean sixty attempts an
     * hour at whatever was broken. Missing an evening is the cheaper failure.
     */
    boolean existsByStoreIdAndSourceAndSentAtBetween(
            String storeId, WhatsAppSendSource source, Instant from, Instant to);

    void deleteByStoreId(String storeId);
}
