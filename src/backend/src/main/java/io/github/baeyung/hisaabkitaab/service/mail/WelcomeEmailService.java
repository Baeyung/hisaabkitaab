package io.github.baeyung.hisaabkitaab.service.mail;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.thymeleaf.context.Context;

@Service
@RequiredArgsConstructor
public class WelcomeEmailService
{
    private final MailService mailService;
    private static final String EMAIL_SUBJECT = "Welcome to HisaabKitaab";
    private static final String EMAIL_TEMPLATE_NAME = "Welcome";

    public void sendEmail(String to, String username, String appUrl)
    {
        Context context = new Context();

        context.setVariable("username", username);
        context.setVariable("appUrl", appUrl);

        mailService.sendTemplatedEmail(
                to,
                MailService.NO_REPLY_EMAIL,
                EMAIL_TEMPLATE_NAME,
                context,
                EMAIL_SUBJECT
        );
    }
}
