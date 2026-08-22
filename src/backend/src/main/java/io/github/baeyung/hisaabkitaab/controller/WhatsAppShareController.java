package io.github.baeyung.hisaabkitaab.controller;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.github.baeyung.hisaabkitaab.dto.whatsapp.ShareRecipients;
import io.github.baeyung.hisaabkitaab.dto.whatsapp.ShareRequest;
import io.github.baeyung.hisaabkitaab.dto.whatsapp.ShareResult;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.enums.WhatsAppSendSource;
import io.github.baeyung.hisaabkitaab.enums.WhatsAppSendStatus;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.PlanService;
import io.github.baeyung.hisaabkitaab.service.pdf.PdfRenderService;
import io.github.baeyung.hisaabkitaab.service.whatsapp.Addressee;
import io.github.baeyung.hisaabkitaab.service.whatsapp.DocumentShareService;
import io.github.baeyung.hisaabkitaab.service.whatsapp.ShareRecipientService;
import io.github.baeyung.hisaabkitaab.service.whatsapp.WhatsAppBlockService;
import io.github.baeyung.hisaabkitaab.service.whatsapp.WhatsAppSendLogService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Sending the shop's printouts on WhatsApp — any printable screen, to anyone the shop can
 * reach: the customer a bill is about, the owner, or the people they work with.
 *
 * <p>The browser posts the page, not a file: the PDF is rendered here, so a client cannot put
 * arbitrary bytes on someone's phone. Recipients are likewise named by id and never by number
 * — {@code ShareRecipientService} resolves each one inside this store, so the request cannot
 * address a stranger.
 *
 * <p>Every message is metered against the shop <em>owner's</em> plan, whoever pressed the
 * button, and this is the only route to one — the frontend greys the button out when the quota
 * is gone, but that is a courtesy and this is the rule. Each message is charged before it goes
 * and given back if it does not, so the count cannot be walked past by racing requests and
 * cannot be spent by a message nobody got.
 *
 * <p>Readable by anyone in the shop, including a viewer: sending a printout is the WhatsApp
 * twin of printing one, which a viewer may already do. A shop the plan has closed still
 * refuses, since this is a POST and {@code CurrentStoreArgumentResolver} asks
 * {@code requireWritable} of every write.
 */
@RestController
@RequestMapping("/api/stores/{storeId}/whatsapp")
@RequiredArgsConstructor
public class WhatsAppShareController
{
    private static final Logger log = LoggerFactory.getLogger(WhatsAppShareController.class);

    private final ShareRecipientService shareRecipientService;

    private final DocumentShareService documentShareService;

    private final PdfRenderService pdfRenderService;

    private final PlanService planService;

    private final WhatsAppBlockService blockService;

    private final WhatsAppSendLogService sendLog;

    /**
     * Who this shop can send to, for the picker the send button opens.
     *
     * @param partyId the party the screen is about, when it is about one. Only its opt-out is
     *                asked after — the party itself is already on the screen.
     */
    @GetMapping("/recipients")
    public ResponseEntity<ShareRecipients> recipients(@CurrentStore(StoreRole.VIEWER) Store store,
            @RequestParam(required = false) String partyId)
    {
        return ResponseEntity.ok(new ShareRecipients(
                shareRecipientService.list(store),
                partyId != null && shareRecipientService.isBlocked(store, partyId)));
    }

    /**
     * Send the posted page to everyone named. Answers 200 with what happened rather than a
     * status per outcome: a send to three people that reached two is neither a success nor a
     * failure, and the screen has to be able to say which two. A send that reached nobody
     * comes back the same way, with {@code sent = 0} — the button reads that and says so.
     */
    @PostMapping
    public ResponseEntity<ShareResult> share(@Valid @RequestBody ShareRequest request,
            @CurrentStore(StoreRole.VIEWER) Store store,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        // Every recipient below leaves a row in whatsapp_sends, whichever way their message
        // went — the shop is asked "did you send it?" long after the fact, and the quota
        // counts messages without remembering who got one. Written against whoever pressed
        // the button, which is not always the owner whose quota pays for it.
        User sender = principal.getUser();

        // Resolved and checked before anything is charged or rendered: an unknown recipient or
        // one with no usable number is the caller's mistake, and must cost neither a message
        // nor a trip to the renderer. Deduplicated so a doubled-up list cannot double-charge.
        List<Addressee> addressees = new LinkedHashSet<>(request.recipients()).stream()
                .map(recipient -> shareRecipientService.resolve(store, recipient))
                .toList();
        addressees.forEach(to -> DocumentShareService.requireSendable(to.contact()));

        // The one request that can spend money, take a minute, and half-succeed. It answers
        // 200 either way, so the response cannot be read as the record of what happened —
        // this and the summary at the end are.
        log.info("sharing \"{}\" ({}) from store {} to {} recipient(s), sent by {}",
                request.filename(), request.action(), store.getId(), addressees.size(), sender.getId());

        // One render for the whole list — it is the same page for everyone on it — and not
        // until a message has actually been charged for. A send the quota refuses must not
        // cost a trip to headless Chrome first.
        byte[] pdf = null;
        String ownerId = store.getOwner().getId();

        int sent = 0;
        List<String> failed = new ArrayList<>();

        // Anyone who has opted out is dropped here, ahead of the quota and the renderer, and
        // named back like any other recipient we did not reach. This is the rule, not the
        // picker's greying-out: a screen held open since before someone blocked would still
        // offer them, and a send is the last moment we can honour it. Kept apart from `failed`
        // until the end so that dropping them does not read, below, as a send having started.
        WhatsAppBlockService.Blocks blocks = blockService.in(store.getId());
        List<String> optedOut = new ArrayList<>();
        List<Addressee> reachable = new ArrayList<>();
        for (Addressee to : addressees)
        {
            if (blocks.has(to.recipientId(), to.contact()))
            {
                optedOut.add(to.name());
                sendLog.record(store, sender, to, request.filename(),
                        WhatsAppSendStatus.BLOCKED, WhatsAppSendSource.SHARE);
            }
            else
            {
                reachable.add(to);
            }
        }

        if (!optedOut.isEmpty())
        {
            // Named, because "it says it did not send to them" has exactly two explanations
            // and the shopkeeper cannot see which from the screen: they opted out, or it broke.
            log.info("dropping {} opted-out recipient(s) of \"{}\": {}",
                    optedOut.size(), request.filename(), optedOut);
        }

        for (Addressee to : reachable)
        {
            String charged;
            try
            {
                charged = planService.spendWhatsappMessage(ownerId);
            }
            catch (ResponseStatusException e)
            {
                // Out of quota. On the first recipient that refusal is the whole answer and is
                // worth raising — nothing has happened yet and the message explains itself.
                // Part-way through a list it is not: messages have already gone out, and the
                // honest reply is which ones did.
                log.warn("quota refused a message to \"{}\" from store {}: {}",
                        to.name(), store.getId(), e.getReason());

                sendLog.record(store, sender, to, request.filename(),
                        WhatsAppSendStatus.FAILED, WhatsAppSendSource.SHARE);
                if (sent == 0 && failed.isEmpty())
                {
                    throw e;
                }
                failed.add(to.name());
                continue;
            }

            boolean delivered;
            try
            {
                if (pdf == null)
                {
                    pdf = pdfRenderService.render(request.html());
                }
                delivered = documentShareService.share(
                        store, to, request.action(), pdf, request.filename(), request.locale());
            }
            catch (RuntimeException e)
            {
                // Includes the renderer falling over: the message was charged a moment ago and
                // nothing went out, so it goes back before the failure leaves here.
                log.error("send of \"{}\" to \"{}\" from store {} blew up; the charged message "
                        + "is being given back", request.filename(), to.name(), store.getId(), e);

                planService.releaseWhatsappMessage(ownerId, charged);
                sendLog.record(store, sender, to, request.filename(),
                        WhatsAppSendStatus.FAILED, WhatsAppSendSource.SHARE);
                throw e;
            }

            if (delivered)
            {
                sent++;
            }
            else
            {
                planService.releaseWhatsappMessage(ownerId, charged);
                failed.add(to.name());
            }

            sendLog.record(store, sender, to, request.filename(),
                    delivered ? WhatsAppSendStatus.SENT : WhatsAppSendStatus.FAILED,
                    WhatsAppSendSource.SHARE);
        }

        failed.addAll(optedOut);

        if (failed.isEmpty())
        {
            log.info("shared \"{}\" from store {} to all {} recipient(s)",
                    request.filename(), store.getId(), sent);
        }
        else
        {
            log.warn("shared \"{}\" from store {} to {} of {} recipient(s); did not reach: {}",
                    request.filename(), store.getId(), sent, sent + failed.size(), failed);
        }

        return ResponseEntity.ok(new ShareResult(sent, failed));
    }
}
