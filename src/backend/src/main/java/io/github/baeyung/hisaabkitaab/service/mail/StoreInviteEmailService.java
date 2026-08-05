package io.github.baeyung.hisaabkitaab.service.mail;

import static io.github.baeyung.hisaabkitaab.service.mail.MailService.NO_REPLY_EMAIL;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.thymeleaf.context.Context;

import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import lombok.RequiredArgsConstructor;

/**
 * Tells someone a shop has been shared with them. The mail says two different things
 * depending on {@code newAccount}: an existing user just opens the app and finds the shop
 * waiting, while an invited address has to sign up first — with that same address, since
 * that is what the access was granted against.
 */
@Service
@RequiredArgsConstructor
public class StoreInviteEmailService
{
    private final MailService mailService;
    private static final String EMAIL_TEMPLATE_NAME = "StoreInvite";

    @Value("${app.frontend-base-url}")
    private String frontendBaseUrl;

    public void sendEmail(String to, String inviterName, String storeName, StoreRole role, boolean newAccount)
    {
        Context context = new Context();

        context.setVariable("inviterName", inviterName);
        context.setVariable("storeName", storeName);
        context.setVariable("canEdit", role == StoreRole.EDITOR);
        context.setVariable("newAccount", newAccount);
        context.setVariable("email", to);
        context.setVariable("appUrl", frontendBaseUrl);

        mailService.sendTemplatedEmail(
                to,
                NO_REPLY_EMAIL,
                EMAIL_TEMPLATE_NAME,
                context,
                inviterName + " shared a shop with you on HisaabKitaab"
        );
    }
}
