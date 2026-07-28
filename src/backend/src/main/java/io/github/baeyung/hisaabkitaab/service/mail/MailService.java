package io.github.baeyung.hisaabkitaab.service.mail;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

@Service
@RequiredArgsConstructor
// do not autowire this directly in other non mail services, create a specific action related mail service
// autowire there and then send email
public class MailService
{
    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;
    private static final Logger log = LoggerFactory.getLogger(MailService.class);
    public static final String SUPPORT_EMAIL = "support@hisaabkitaab.shop";
    public static final String NO_REPLY_EMAIL = "no-reply@hisaabkitaab.shop";

    /** Master switch for outgoing mail: off in dev, so nothing reaches the SMTP relay. */
    @Value("${app.email.enabled:false}")
    private boolean emailEnabled;

    public void sendSimpleMail(String to, String from, String subject, String content)
    {
        if (suppressed(to, subject))
        {
            return;
        }
        try
        {
            SimpleMailMessage msg = new SimpleMailMessage();

            msg.setTo(to);
            msg.setSubject(subject);
            msg.setText(content);
            msg.setFrom(from);

            mailSender.send(msg);
        }
        catch (Exception e)
        {
            log.error(e.getMessage(), e);
        }
    }

    public void sendHtmlEmail(String to, String from, String subject, String html)
    {
        if (suppressed(to, subject))
        {
            return;
        }
        try
        {
            MimeMessage mimeMessage = mailSender.createMimeMessage();

            MimeMessageHelper helper = new MimeMessageHelper(
                    mimeMessage,
                    true,
                    "UTF-8"
            );

            helper.setTo(to);
            helper.setFrom(from);
            helper.setSubject(subject);
            helper.setText(html, true);

            mailSender.send(mimeMessage);
        }
        catch (MessagingException e)
        {
            log.error(e.getMessage(), e);
        }
    }

    public void sendTemplatedEmail(
            String to,
            String from,
            String templateName,
            Context context,
            String subject
    )
    {
        if (suppressed(to, subject))
        {
            return;
        }
        try
        {
            String html = templateEngine.process(templateName, context);

            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setTo(to);
            helper.setFrom(from);
            helper.setSubject(subject);
            helper.setText(html, true);

            mailSender.send(message);
        }
        catch (Exception e)
        {
            log.error(e.getMessage(), e);
        }
    }

    /**
     * True when mail is switched off, in which case the caller must return without sending.
     * Callers treat a suppressed send as success — nothing downstream branches on delivery.
     */
    private boolean suppressed(String to, String subject)
    {
        if (emailEnabled)
        {
            return false;
        }
        log.info("app.email.enabled=false, not sending \"{}\" to {}", subject, to);
        return true;
    }
}
