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
}
