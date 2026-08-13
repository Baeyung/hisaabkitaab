package io.github.baeyung.hisaabkitaab.service.whatsapp;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.dto.whatsapp.ShareRecipient;
import io.github.baeyung.hisaabkitaab.dto.whatsapp.ShareRequest;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreAccess;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.enums.UserStatus;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.PartyRepository;
import io.github.baeyung.hisaabkitaab.repository.StoreAccessRepository;
import io.github.baeyung.hisaabkitaab.service.PartyService;
import lombok.RequiredArgsConstructor;

/**
 * Who a shop's documents may be sent to, and how an id off the wire becomes a name and a
 * number.
 *
 * <p>Every method takes an already access-checked {@link Store} — the caller reached it
 * through {@code @CurrentStore} — and scopes on its id, so an id from a request can only ever
 * name someone inside that shop. That is the whole reason the request carries ids rather than
 * phone numbers: a client picks a recipient, it does not address one.
 *
 * <p>{@link #find} is the exception, and is deliberately not access-checked: it serves the
 * opt-out page, which is opened by a customer holding nothing but the link we messaged them.
 * It hands back a name and a number, so it must stay reachable only with a whole
 * {@code storeId:recipientId} pair — two ids nobody can guess.
 */
@Service
@RequiredArgsConstructor
public class ShareRecipientService
{
    private final StoreAccessRepository storeAccessRepository;

    private final PartyRepository partyRepository;

    private final PartyService partyService;

    private final WhatsAppBlockService blockService;

    /**
     * The people who work in this shop — the owner first, then everyone they have shared it
     * with. Parties are not here: a screen that is about one already knows which, and listing
     * every khata holder in the shop would be a mailing list rather than a recipient picker.
     *
     * <p>Anyone unreachable is left out entirely rather than shown greyed out: an outstanding
     * invite has no phone number we know of, and there is nothing the sender can do about that
     * from here — the person has to sign up first. Someone who has opted out <em>is</em> shown,
     * marked: they are reachable in every sense except the one that matters, and a picker that
     * simply dropped them would read as the shop having lost a member.
     */
    @Transactional(readOnly = true)
    public List<ShareRecipient> list(Store store)
    {
        WhatsAppBlockService.Blocks blocks = blockService.in(store.getId());
        List<ShareRecipient> people = new ArrayList<>();

        User owner = store.getOwner();
        if (DocumentShareService.isSendable(owner.getContactNumber()))
        {
            people.add(new ShareRecipient(owner.getId(), owner.getName(), StoreRole.OWNER,
                    blocks.has(owner.getId(), owner.getContactNumber())));
        }

        for (StoreAccess access : storeAccessRepository.findByStoreId(store.getId()))
        {
            User user = access.getUser();
            if (user.getStatus() == UserStatus.ACTIVE && DocumentShareService.isSendable(user.getContactNumber()))
            {
                people.add(new ShareRecipient(user.getId(), user.getName(), access.getRole(),
                        blocks.has(user.getId(), user.getContactNumber())));
            }
        }

        return people;
    }

    /**
     * The name and number behind one id from a send request.
     *
     * @throws ResourceNotFoundException when the id names nobody in this shop — including a
     *                                   real user or party that simply belongs to another one.
     */
    @Transactional(readOnly = true)
    public Addressee resolve(Store store, ShareRequest.Recipient recipient)
    {
        return recipient.kind() == ShareRequest.Kind.PARTY
                ? party(store, recipient.id())
                : user(store, recipient.id());
    }

    /**
     * The same, from an id alone — what the opt-out link carries, since the person clicking it
     * has no idea they are a "party" or a "user". A party is looked for first; only an id that
     * names nobody in this shop comes back empty.
     */
    @Transactional(readOnly = true)
    public Optional<Addressee> find(Store store, String targetId)
    {
        return partyRepository.findById(targetId)
                .filter(party -> party.getStore().getId().equals(store.getId()))
                .map(party -> addressee(store, party.getName(), party.getContact(), party.getId()))
                .or(() -> {
                    try
                    {
                        return Optional.of(user(store, targetId));
                    }
                    catch (ResourceNotFoundException e)
                    {
                        return Optional.empty();
                    }
                });
    }

    /** Whether this recipient has blocked the number the shop would message them on. */
    @Transactional(readOnly = true)
    public boolean isBlocked(Store store, String targetId)
    {
        return find(store, targetId)
                .filter(to -> blockService.isBlocked(store.getId(), targetId, to.contact()))
                .isPresent();
    }

    /** The document's own subject: a khata holder. */
    private Addressee party(Store store, String partyId)
    {
        Party party = partyService.findByIdForStore(partyId, store.getId());
        return addressee(store, party.getName(), party.getContact(), party.getId());
    }

    /**
     * Someone who works here. The owner holds no {@code user_access_store} row — their rights
     * come from the store itself — so they are checked against the store and everyone else
     * against their grant.
     */
    private Addressee user(Store store, String userId)
    {
        User user = store.isOwnedBy(userId)
                ? store.getOwner()
                : storeAccessRepository.findByStoreIdAndUserId(store.getId(), userId)
                        .map(StoreAccess::getUser)
                        .orElseThrow(() -> ResourceNotFoundException.forEntity("Member", userId));

        return addressee(store, user.getName(), user.getContactNumber(), user.getId());
    }

    /**
     * One shape for both kinds of recipient. The block token pairs the shop with whoever this
     * is, which is all the opt-out page needs and all it is ever given.
     */
    private static Addressee addressee(Store store, String name, String contact, String targetId)
    {
        return new Addressee(name, contact, store.getId() + ":" + targetId);
    }
}
