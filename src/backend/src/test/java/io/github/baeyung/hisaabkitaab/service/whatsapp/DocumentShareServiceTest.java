package io.github.baeyung.hisaabkitaab.service.whatsapp;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.User;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * The template's body variables are named and Meta rejects the send if a name is missing or
 * unknown — so which value carries which name, and what the positional button URL gets, is
 * worth pinning down. Plus the two cases the caller cannot see: a shop with no number of its
 * own, and a party with no number to send to.
 */
class DocumentShareServiceTest
{
    private static final byte[] PDF = "%PDF-1.4".getBytes();

    private final WhatsAppService whatsapp = mock(WhatsAppService.class);
    private final DocumentShareService service = new DocumentShareService(whatsapp);

    DocumentShareServiceTest()
    {
        ReflectionTestUtils.setField(service, "templateName", "document_share");
    }

    private Party party(String contact)
    {
        Party party = new Party();
        party.setId("party-7");
        party.setName("Rehman Cloth House");
        party.setContact(contact);
        return party;
    }

    private Store store(String contact)
    {
        User owner = new User();
        owner.setContactNumber("923009998877");

        Store shop = new Store();
        shop.setId("store-3");
        shop.setName("Kiryana Store");
        shop.setContact(contact);
        shop.setOwner(owner);
        return shop;
    }

    @Test
    void fillsTheTemplateBodyByNameAndTheButtonInOrder()
    {
        service.share(store("923001112233"), party("923001234567"), "Bill", PDF, "bill-1042.pdf", "en");

        verify(whatsapp).sendTemplateWithDocument(
                "923001234567", "document_share", "en_US", PDF, "bill-1042.pdf",
                Map.of("recipient_name", "Rehman Cloth House", "action", "Bill",
                        "provider_name", "Kiryana Store", "contact_number", "923001112233"),
                List.of("store-3", "party-7"));
    }

    /** A separate template is approved per language, keyed by Meta's own locale codes. */
    @Test
    void sendsTheUrduTemplateForAnUrduReader()
    {
        service.share(store("923001112233"), party("923001234567"), "بل", PDF, "bill-1042.pdf", "ur");

        verify(whatsapp).sendTemplateWithDocument(
                "923001234567", "document_share", "ur", PDF, "bill-1042.pdf",
                Map.of("recipient_name", "Rehman Cloth House", "action", "بل",
                        "provider_name", "Kiryana Store", "contact_number", "923001112233"),
                List.of("store-3", "party-7"));
    }

    /** Meta rejects a blank parameter outright, so an optional shop number cannot go empty. */
    @Test
    void fallsBackToTheOwnersNumberWhenTheShopHasNone()
    {
        service.share(store("  "), party("923001234567"), "Khata statement", PDF, "khata.pdf", "en");

        verify(whatsapp).sendTemplateWithDocument(
                "923001234567", "document_share", "en_US", PDF, "khata.pdf",
                Map.of("recipient_name", "Rehman Cloth House", "action", "Khata statement",
                        "provider_name", "Kiryana Store", "contact_number", "923009998877"),
                List.of("store-3", "party-7"));
    }

    @Test
    void refusesAPartyWithNoPhoneNumber()
    {
        assertThatThrownBy(() -> service.share(store("923001112233"), party(null), "Bill", PDF, "bill.pdf", "en"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.share(store("923001112233"), party("  "), "Bill", PDF, "bill.pdf", "en"))
                .isInstanceOf(IllegalArgumentException.class);
        // The number a party created in passing carries: real-looking, and nobody's.
        assertThatThrownBy(() -> service.share(
                store("923001112233"), party(Party.PLACEHOLDER_CONTACT), "Bill", PDF, "bill.pdf", "en"))
                .isInstanceOf(IllegalArgumentException.class);

        verifyNoInteractions(whatsapp);
    }
}
