package io.github.baeyung.hisaabkitaab.service.whatsapp;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.dto.whatsapp.AdminBlockResponse;
import io.github.baeyung.hisaabkitaab.dto.whatsapp.BlockStatus;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.StoreRepository;
import lombok.RequiredArgsConstructor;

/**
 * The opt-out link's two operations, each whole in one transaction: read who a token names,
 * and record that they want no more messages.
 *
 * <p>It exists as its own service rather than as methods on the controller because both walk
 * from a store to a party or member and back — lazy associations all the way — and a controller
 * has no transaction of its own to walk them in.
 */
@Service
@RequiredArgsConstructor
public class WhatsAppOptOutService
{
    private final StoreRepository storeRepository;

    private final ShareRecipientService shareRecipientService;

    private final WhatsAppBlockService blockService;

    /** What the page shows before it asks anything. */
    @Transactional(readOnly = true)
    public BlockStatus status(String token)
    {
        Target target = resolve(token);
        return status(target,
                blockService.isBlocked(target.store.getId(), target.id, target.to.contact()));
    }

    /**
     * Confirmed. Idempotent, so a link opened twice — or a page refreshed on the way back —
     * reads as the block it already made rather than as a failure.
     */
    @Transactional
    public BlockStatus block(String token)
    {
        Target target = resolve(token);
        blockService.block(target.store, target.id, target.to.contact());
        return status(target, true);
    }

    /**
     * Every opt-out there is, named, for the back office. Each row costs a lookup of whoever it
     * was made for — support needs a name to go with the number, and this list is the size of
     * how often somebody rings up asking to be put back on.
     */
    @Transactional(readOnly = true)
    public List<AdminBlockResponse> all()
    {
        return blockService.all().stream()
                .map(block -> new AdminBlockResponse(
                        block.getId(),
                        block.getStore().getName(),
                        shareRecipientService.find(block.getStore(), block.getTargetId())
                                .map(Addressee::name)
                                .orElse(null),
                        block.getContact(),
                        block.getBlockedAt()))
                .toList();
    }

    /** The only way a block is ever lifted, and it is support's to press. */
    @Transactional
    public void unblock(String blockId)
    {
        blockService.unblock(blockId);
    }

    /**
     * Everything the token names, or {@link ResourceNotFoundException} — which the page shows as
     * one "this link is not valid" whatever went wrong with it. A malformed token, an id from
     * another shop and a recipient whose number has since been cleared are all the same answer
     * on purpose: this is reachable without signing in, and must not become a way to ask
     * whether an id is real.
     */
    private Target resolve(String token)
    {
        String[] parts = token.split(":", 2);
        if (parts.length != 2)
        {
            throw invalid();
        }

        Store store = storeRepository.findById(parts[0]).orElseThrow(WhatsAppOptOutService::invalid);

        Addressee to = shareRecipientService.find(store, parts[1])
                .filter(recipient -> DocumentShareService.isSendable(recipient.contact()))
                .orElseThrow(WhatsAppOptOutService::invalid);

        return new Target(store, parts[1], to);
    }

    private static BlockStatus status(Target target, boolean blocked)
    {
        String contact = target.to.contact();
        return new BlockStatus(
                target.store.getName(),
                target.to.name(),
                contact.substring(contact.length() - 4),
                blocked);
    }

    private static ResourceNotFoundException invalid()
    {
        return new ResourceNotFoundException("Opt-out link is not valid");
    }

    private record Target(Store store, String id, Addressee to)
    {
    }
}
