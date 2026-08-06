package io.github.baeyung.hisaabkitaab.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.StoreAccess;

@Repository
public interface StoreAccessRepository extends JpaRepository<StoreAccess, String>
{
    Optional<StoreAccess> findByStoreIdAndUserId(String storeId, String userId);

    /** The store's members, owner excluded — they hold no row here. */
    List<StoreAccess> findByStoreId(String storeId);

    /** Every store shared *with* this user; says nothing about the ones they own. */
    List<StoreAccess> findByUserId(String userId);

    void deleteByStoreId(String storeId);

    /**
     * Everyone this owner has shared an <em>open</em> shop with, counted once however many
     * shops they are in. The owner themselves is not here (they hold no {@code StoreAccess}
     * row), so a caller comparing against {@code maxUsers} has to add them back — that limit
     * counts the owner too.
     *
     * <p>People reachable only through a suspended shop are left out, for the same reason the
     * shop itself is out of {@code maxStores}: a closed shop is read-only and grants nothing
     * to spend a seat on. It also means an owner over both ceilings can close one shop and be
     * under both, rather than being sent to remove people they were about to lose anyway.
     */
    @Query("""
            select count(distinct access.user.id) from StoreAccess access
             where access.store.owner.id = :ownerId
               and access.store.suspendedAt is null
            """)
    long countDistinctMembersOfStoresOwnedBy(@Param("ownerId") String ownerId);

    /** Every grant across every shop this owner has, suspended ones included. */
    List<StoreAccess> findByStoreOwnerId(String ownerId);

    /**
     * Whether this user already works in one of this owner's <em>open</em> shops. Someone who
     * does costs no new seat when they are added to a second shop — they are one of the
     * distinct people {@code maxUsers} counts, and they were counted already.
     *
     * <p>Restricted to open shops to stay in step with {@link
     * #countDistinctMembersOfStoresOwnedBy}, which does not count the rest: someone reachable
     * only through a suspended shop holds no seat, so giving them an open shop has to buy one.
     * Left unfiltered, the two would disagree and an owner could walk past {@code maxUsers} by
     * inviting into a closed shop first.
     */
    boolean existsByStoreOwnerIdAndUserIdAndStoreSuspendedAtIsNull(String ownerId, String userId);

    /**
     * Whether any shop shared with this user belongs to an owner whose plan is still good. That
     * is what keeps an invited member working after their own trial lapses: they are covered by
     * the plan of the shop they were invited into, which is the account that was actually paid
     * for. It grants access only — creating anything of their own is still judged against their
     * own plan.
     *
     * <p>An owner whose {@code expiresAt} is null counts as active: their clock has not started
     * (see {@code UserPlan}), so nothing of theirs has run out yet.
     */
    @Query("""
            select count(access) > 0 from StoreAccess access
              join UserPlan plan on plan.userId = access.store.owner.id
             where access.user.id = :userId
               and (plan.expiresAt is null or plan.expiresAt >= :today)
            """)
    boolean hasSharedStoreOnActivePlan(@Param("userId") String userId, @Param("today") LocalDate today);
}
