package io.github.baeyung.hisaabkitaab.entity;

import java.time.Instant;
import java.time.LocalDate;

import io.github.baeyung.hisaabkitaab.enums.PlanTier;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The plan an account is on. Keyed by the user's own id — one plan per account, no history
 * table: what an account is entitled to <em>today</em> is the only question anything asks.
 *
 * <p>The plan hangs off the account that <em>owns</em> stores, and is read through the store
 * rather than through the person: an invited member works inside someone else's shop under
 * that owner's plan, and needs no plan of their own. Someone who is invited to one shop and
 * owns another is governed by their own plan only in the shop they own.
 *
 * <p>The three limit columns are nullable overrides. A null means "whatever {@link #tier}
 * says", so a plan change moves an account onto the new tier's numbers without anything
 * having to rewrite the row's limits — while a non-null pins that one limit for this account
 * regardless of tier. Resolution lives in {@code PlanService}.
 */
@Entity
@Table(name = "user_plans")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserPlan
{
    /** The user's id. Not generated — this table borrows the primary key of {@code users}. */
    @Id
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PlanTier tier;

    /** When this plan was put on the account. Audit only; nothing branches on it. */
    @Column(nullable = false)
    private Instant assignedAt;

    /**
     * Last day the plan is good for, inclusive, or null while the clock has not started. A
     * calendar date rather than an instant on purpose: a plan expires at the end of a day in
     * the shop's own reckoning, and a date has no timezone for an admin or a date picker to
     * get wrong.
     *
     * <p>Null is what a trial looks like before anything enforces it — see
     * {@code PlanService.startTrial}. An admin assignment always states a date.
     */
    private LocalDate expiresAt;

    private Integer maxStores;

    private Integer maxUsers;

    private Integer whatsappQuota;

    /**
     * Messages spent against {@link #whatsappQuota} during {@link #whatsappPeriod}. Meaningless
     * on its own — read it only together with the period, which is what says whether the count
     * is this month's or a forgotten one.
     *
     * <p>The one limit that has to be recorded rather than counted: shops and users can be
     * tallied from their own rows at any time, but a sent message leaves nothing behind to
     * count. Written by {@code UserPlanRepository.spendWhatsapp}, never by an entity write, so
     * that two simultaneous sends cannot both squeeze past the ceiling.
     */
    @Builder.Default
    @Column(nullable = false)
    private int whatsappUsed = 0;

    /**
     * The calendar month {@link #whatsappUsed} was spent in, as {@code "2026-08"}. Null until
     * the account's first ever send.
     *
     * <p>This is how the quota resets without anything sweeping it: a send in a month that
     * differs from what is stored here overwrites both columns rather than adding to them, so
     * last month's total is simply dropped on the first send of the new one.
     */
    @Column(length = 7)
    private String whatsappPeriod;
}
