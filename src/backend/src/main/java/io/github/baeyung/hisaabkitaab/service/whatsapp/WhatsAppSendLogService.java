package io.github.baeyung.hisaabkitaab.service.whatsapp;

import java.time.Instant;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.entity.WhatsAppSend;
import io.github.baeyung.hisaabkitaab.enums.WhatsAppSendSource;
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
     *               charged for it — that is half the reason this is worth recording. A
     *               scheduled send has nobody pressing anything and names the shop's owner:
     *               they are who turned the job on and whose plan carries it, and {@code
     *               source} is what tells the two apart afterwards.
     * @param source why this went out at all — see {@link WhatsAppSendSource}.
     */
    @Transactional
    public void record(Store store, User sender, Addressee to, String filename,
            WhatsAppSendStatus status, WhatsAppSendSource source)
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
                .source(source)
                .sentAt(Instant.now())
                .build());
    }
}
