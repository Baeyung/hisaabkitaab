package io.github.baeyung.hisaabkitaab.service.mail;

import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The {@code app.email.enabled} gate. Every outgoing message in the app routes through
 * {@link MailService}, so this is the only place delivery can be switched off.
 */
class MailServiceTest
{
    private final JavaMailSender sender = mock(JavaMailSender.class);
    private final TemplateEngine templates = mock(TemplateEngine.class);
    private final MailService mailService = new MailService(sender, templates);

    private void emailEnabled(boolean enabled)
    {
        ReflectionTestUtils.setField(mailService, "emailEnabled", enabled);
    }

    @Test
    void sendsNothingWhenDisabled()
    {
        emailEnabled(false);

        mailService.sendSimpleMail("a@b.com", MailService.NO_REPLY_EMAIL, "subject", "body");
        mailService.sendHtmlEmail("a@b.com", MailService.NO_REPLY_EMAIL, "subject", "<p>body</p>");
        mailService.sendTemplatedEmail("a@b.com", MailService.NO_REPLY_EMAIL, "Welcome", new Context(), "subject");

        verify(sender, never()).send(any(MimeMessage.class));
        verify(sender, never()).send(any(org.springframework.mail.SimpleMailMessage.class));
        // Not even the template is rendered — the gate returns before any work happens.
        verify(templates, never()).process(any(String.class), any(Context.class));
    }

    @Test
    void sendsWhenEnabled()
    {
        emailEnabled(true);
        when(sender.createMimeMessage()).thenReturn(mock(MimeMessage.class));
        when(templates.process(any(String.class), any(Context.class))).thenReturn("<p>hi</p>");

        mailService.sendTemplatedEmail("a@b.com", MailService.NO_REPLY_EMAIL, "Welcome", new Context(), "subject");

        verify(sender, times(1)).send(any(MimeMessage.class));
    }
}
