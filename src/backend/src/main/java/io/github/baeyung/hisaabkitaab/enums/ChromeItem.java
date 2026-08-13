package io.github.baeyung.hisaabkitaab.enums;

/**
 * A control in the sidebar foot that a shop's owner may switch off for everyone working in
 * the shop. Only the ones that can be taken away without stranding anybody are here.
 *
 * <p>The language switcher is deliberately absent and must stay that way. Theme, install and
 * the plan strip are conveniences; the language switcher is the way out of a language you
 * cannot read, and a shop that hides it can leave an Urdu-only member facing an English app
 * with no control to change it back.
 */
public enum ChromeItem
{
    /** The Appearance segmented control (system / light / dark). */
    THEME,
    /** The "Install app" button, which only appears where the browser offers the prompt. */
    INSTALL,
    /** The plan tier and usage gauges. Only ever rendered for an owner's own enforced plan. */
    PLAN
}
