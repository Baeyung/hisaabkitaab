package io.github.baeyung.hisaabkitaab.enums;

/**
 * How a document addressed to one person on WhatsApp ended up; see {@code whatsapp_sends}.
 */
public enum WhatsAppSendStatus
{
    /** Meta accepted the message. */
    SENT,

    /** Meta refused it, the renderer fell over, or the owner's monthly quota was already spent. */
    FAILED,

    /** Never attempted: the recipient had told this shop to stop messaging them. */
    BLOCKED
}
