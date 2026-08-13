package io.github.baeyung.hisaabkitaab.service.whatsapp;

import java.time.Instant;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.entity.WhatsAppSend;
import io.github.baeyung.hisaabkitaab.enums.WhatsAppSendStatus;
import io.github.baeyung.hisaabkitaab.repository.WhatsAppSendRepository;
import lombok.RequiredArgsConstructor;

/**
 * What a shop has sent on WhatsApp, and to whom. Write-only as far as the app is concerned —
 * {@link #record} is called once per recipient of a send, whichever way that recipient's
 * message went, and nothing ever amends a row afterwards.
 *
 * <p>Like {@code WhatsAppBlockService} this resolves nothing: the caller arrives with the
 * {@link Addressee} it already looked up, so the name and number written down are exactly the
 * ones the send used.
 */
@Service
@RequiredArgsConstructor
public class WhatsAppSendLogService
{
    private final WhatsAppSendRepository repository;

    /**
     * @param sender whoever pressed send, which is not necessarily the owner whose quota is
     *               charged for it — that is half the reason this is worth recording.
     */
    @Transactional
    public void record(Store store, User sender, Addressee to, String filename, WhatsAppSendStatus status)
    {
        repository.save(WhatsAppSend.builder()
                .store(store)
                .senderId(sender.getId())
                .senderName(sender.getName())
                .targetId(to.recipientId())
                .recipientName(to.name())
                .contact(to.contact())
                .filename(filename)
                .status(status)
                .sentAt(Instant.now())
                .build());
    }
}
