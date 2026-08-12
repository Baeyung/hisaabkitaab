package io.github.baeyung.hisaabkitaab.dto.whatsapp;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Send the page the user is looking at to one or more people on WhatsApp.
 *
 * @param html       the printable page as it stands — self-contained, since the renderer
 *                   resolves nothing relative to the app. It is rendered to PDF server-side
 *                   rather than sent as one, so a client cannot post arbitrary bytes to
 *                   somebody's phone.
 * @param filename   the name the recipients see on the attachment.
 * @param action     what is being shared, worded in {@code locale}: "Bill", "Cashbook".
 *                   Fills the template's action placeholder, so it reads inside a sentence.
 * @param locale     which language's approved template to send, {@code en} or {@code ur}.
 * @param recipients who it goes to, each costing one message off the shop owner's monthly
 *                   quota. Capped well above the size of any real shop's user list, since a
 *                   longer list is a client bug and there is no reason to render a PDF for it.
 */
public record ShareRequest(
        @NotBlank String html,
        @NotBlank String filename,
        @NotBlank String action,
        @NotBlank @Pattern(regexp = "en|ur") String locale,
        @NotEmpty @Size(max = 20) List<@Valid @NotNull Recipient> recipients
)
{
    /**
     * Who to send to, named rather than addressed: the number is looked up here from the id,
     * so the request never carries one.
     */
    public record Recipient(@NotNull Kind kind, @NotBlank String id)
    {
    }

    /** Which of the shop's two kinds of people an id belongs to. */
    public enum Kind
    {
        /** A khata holder — the customer or supplier the document is about. */
        PARTY,

        /** The shop's owner, or someone they have given access to. */
        USER
    }
}
