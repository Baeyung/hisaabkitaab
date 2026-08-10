package io.github.baeyung.hisaabkitaab.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.UserPlan;

@Repository
public interface UserPlanRepository extends JpaRepository<UserPlan, String>
{
    /**
     * Charges one WhatsApp message to this account, if its quota has room for it.
     *
     * <p>Deliberately one statement rather than the read-check-write every other limit uses.
     * The database decides, under its own row lock, whether there was room — so two sends
     * arriving together cannot both read "49 of 50" and both go through. {@code maxStores}
     * can afford to be sloppy about that (see {@code PlanService.requireCapacity}); a quota
     * spent per click cannot, because overshooting it is something a user can *arrange* by
     * firing requests in parallel rather than something they stumble into.
     *
     * <p>The {@code case} is the month reset: a send in a month other than the stored one
     * starts the count at 1 instead of adding to a total that is no longer this month's.
     *
     * @param limit the account's effective {@code whatsappQuota} — resolved by the caller,
     *              since a tier default and an override combine in exactly one place
     *              ({@code PlanLimits.effectiveFor}) and it is not here
     * @return 1 when the message was charged, 0 when the quota is spent (or the account has
     *         no plan row, which the caller has already ruled out)
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update UserPlan p
               set p.whatsappUsed = case when p.whatsappPeriod = :period then p.whatsappUsed + 1 else 1 end,
                   p.whatsappPeriod = :period
             where p.userId = :userId
               and (p.whatsappPeriod is null or p.whatsappPeriod <> :period or p.whatsappUsed < :limit)
            """)
    int spendWhatsapp(@Param("userId") String userId, @Param("period") String period, @Param("limit") int limit);

    /**
     * Gives back a message that was charged but never reached the recipient — Meta rejected
     * it, or sending was switched off entirely. Quota is what the account pays for, so it is
     * spent on messages that were actually delivered to Meta and nothing else.
     *
     * <p>Scoped to {@code period} because a refund is only ever for the send that was just
     * charged: if the month rolled over in between, the charge belongs to a count that has
     * already been discarded and there is nothing left to give back. The {@code whatsappUsed
     * > 0} guard says the same thing for a count that was reset concurrently.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update UserPlan p
               set p.whatsappUsed = p.whatsappUsed - 1
             where p.userId = :userId and p.whatsappPeriod = :period and p.whatsappUsed > 0
            """)
    void refundWhatsapp(@Param("userId") String userId, @Param("period") String period);
}
