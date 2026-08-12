package io.github.baeyung.hisaabkitaab.service.whatsapp;

import java.util.ArrayList;
import java.util.List;

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
 */
@Service
@RequiredArgsConstructor
public class ShareRecipientService
{
    private final StoreAccessRepository storeAccessRepository;

    private final PartyService partyService;

    /**
     * The people who work in this shop — the owner first, then everyone they have shared it
     * with. Parties are not here: a screen that is about one already knows which, and listing
     * every khata holder in the shop would be a mailing list rather than a recipient picker.
     *
     * <p>Anyone unreachable is left out entirely rather than shown greyed out: an outstanding
     * invite has no phone number we know of, and there is nothing the sender can do about that
     * from here — the person has to sign up first.
     */
    @Transactional(readOnly = true)
    public List<ShareRecipient> list(Store store)
    {
        List<ShareRecipient> people = new ArrayList<>();

        User owner = store.getOwner();
        if (DocumentShareService.isSendable(owner.getContactNumber()))
        {
            people.add(new ShareRecipient(owner.getId(), owner.getName(), StoreRole.OWNER));
        }

        for (StoreAccess access : storeAccessRepository.findByStoreId(store.getId()))
        {
            User user = access.getUser();
            if (user.getStatus() == UserStatus.ACTIVE && DocumentShareService.isSendable(user.getContactNumber()))
            {
                people.add(new ShareRecipient(user.getId(), user.getName(), access.getRole()));
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

    /** The document's own subject: the link takes them straight to the khata it came from. */
    private Addressee party(Store store, String partyId)
    {
        Party party = partyService.findByIdForStore(partyId, store.getId());
        return new Addressee(party.getName(), party.getContact(), store.getId() + "/" + party.getId());
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

        // No party of their own to link to, so the button lands on the shop itself.
        return new Addressee(user.getName(), user.getContactNumber(), store.getId());
    }
}
