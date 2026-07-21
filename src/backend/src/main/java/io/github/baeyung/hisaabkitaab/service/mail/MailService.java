package io.github.baeyung.hisaabkitaab.service.mail;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    public void sendSimpleMail(String to, String subject, String content)
    {
        try
        {
            SimpleMailMessage msg = new SimpleMailMessage();

            msg.setTo(to);
            msg.setSubject(subject);
            msg.setText(content);

            mailSender.send(msg);
        }
        catch (Exception e)
        {
            log.error(e.getMessage(), e);
        }
    }

    public void sendHtmlEmail(String to, String subject, String html)
    {
        try
        {
            MimeMessage mimeMessage = mailSender.createMimeMessage();

            MimeMessageHelper helper = new MimeMessageHelper(
                    mimeMessage,
                    true,
                    "UTF-8"
            );

            helper.setTo(to);
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
            String templateName,
            Context context,
            String subject
    )
    {
        try
        {
            String html = templateEngine.process(templateName, context);

            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(html, true);

            mailSender.send(message);
        }
        catch (Exception e)
        {
            log.error(e.getMessage(), e);
        }
    }
}
