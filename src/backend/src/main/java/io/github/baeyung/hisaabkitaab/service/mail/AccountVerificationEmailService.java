package io.github.baeyung.hisaabkitaab.service.mail;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.thymeleaf.context.Context;

@Service
@RequiredArgsConstructor
public class AccountVerificationEmailService
{
    private final MailService mailService;
    private static final String EMAIL_SUBJECT = "Account Verification @ HisaabKitaab";
    private static final String EMAIL_TEMPLATE_NAME = "AccountVerification";

    public void sendEmail(String to, String username, String verificationCode)
    {
        Context context = new Context();

        context.setVariable("username", username);
        context.setVariable("verificationCode", verificationCode);

        mailService.sendTemplatedEmail(
                to,
                EMAIL_TEMPLATE_NAME,
                context,
                EMAIL_SUBJECT
        );
    }
}
