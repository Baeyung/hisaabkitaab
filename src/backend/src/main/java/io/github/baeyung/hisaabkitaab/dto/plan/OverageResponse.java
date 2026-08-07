package io.github.baeyung.hisaabkitaab.dto.plan;

import java.util.List;

/**
 * Everything the "your plan no longer covers all this" screen needs, in one call: the plan
 * and what has been spent against it, then the two things that can be given up to get back
 * under it.
 *
 * <p>The lists are assembled here rather than left to the client because who costs a seat is
 * a rule, not a count — the same person in three shops is one seat, and a suspended shop's
 * people are nobody's. A client stitching this together from per-shop member lists would be
 * re-deriving that rule, and the moment it drifted the screen would tell an owner to remove
 * someone the server was not counting.
 *
 * @param plan the same {@link PlanStatusResponse} {@code /api/plan/me} returns, so the screen
 *             needs no second request and reads the ceilings the enforcement uses
 */
public record OverageResponse(
        PlanStatusResponse plan,
        List<OverageStore> stores,
        List<OveragePerson> people)
{
    /**
     * One of the owner's shops, as something to keep or close. Carries the logo so the cards
     * on the screen are the ones the owner already recognises from the shop picker — being
     * asked which shop to close is no time to be reading names off a list of strangers.
     */
    public record OverageStore(String id, String name, String logoUri, boolean suspended)
    {
    }

    /**
     * One person with access to any of the owner's shops, listed once however many they are
     * in — a seat is spent per person, not per grant, so showing them twice would misstate
     * the cost of removing them.
     *
     * @param name      null while their invite is outstanding, as {@code MemberResponse} has it
     * @param storeIds  the shops this person can reach, so the screen can say what removing
     *                  them actually takes away, and grey out someone whose only shops are
     *                  being closed anyway
     */
    public record OveragePerson(String userId, String name, String email, List<String> storeIds)
    {
    }
}
