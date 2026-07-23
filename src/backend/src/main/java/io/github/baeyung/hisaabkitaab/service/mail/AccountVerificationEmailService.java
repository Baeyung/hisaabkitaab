package io.github.baeyung.hisaabkitaab.service.mail;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.thymeleaf.context.Context;

import static io.github.baeyung.hisaabkitaab.service.mail.MailService.NO_REPLY_EMAIL;

@Service
@RequiredArgsConstructor
public class AccountVerificationEmailService
{
    private final MailService mailService;
    private static final String EMAIL_SUBJECT = "Account Verification @ HisaabKitaab";
    private static final String EMAIL_TEMPLATE_NAME = "AccountVerification";

    public void sendEmail(String to, String username, String verificationUrl)
    {
        Context context = new Context();

        context.setVariable("username", username);
        context.setVariable("verificationUrl", verificationUrl);

        mailService.sendTemplatedEmail(
                to,
                NO_REPLY_EMAIL,
                EMAIL_TEMPLATE_NAME,
                context,
                EMAIL_SUBJECT
        );
    }
}
