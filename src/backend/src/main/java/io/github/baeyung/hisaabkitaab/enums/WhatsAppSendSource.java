package io.github.baeyung.hisaabkitaab.enums;

/**
 * What put a document on someone's phone; see {@code whatsapp_sends}. The other columns say
 * who it went to and whether it arrived — this says why it was sent at all, which is the one
 * thing they cannot be read to mean.
 */
public enum WhatsAppSendSource
{
    /** Someone in the shop pressed the send button on a screen. */
    SHARE,

    /** The nightly job, to the shop's owner. */
    DAILY_REPORT,

    /** The monthly job, to a khata holder who owes past the shop's threshold. */
    REMINDER
}
