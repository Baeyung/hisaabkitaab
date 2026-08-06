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
     * Everyone this owner has shared any of their shops with, counted once however many shops
     * they are in. The owner themselves is not here (they hold no {@code StoreAccess} row), so
     * a caller comparing against {@code maxUsers} has to add them back — that limit counts the
     * owner too.
     */
    @Query("select count(distinct access.user.id) from StoreAccess access where access.store.owner.id = :ownerId")
    long countDistinctMembersOfStoresOwnedBy(@Param("ownerId") String ownerId);

    /**
     * Whether this user already works somewhere in this owner's account. Someone who does costs
     * no new seat when they are added to a second shop — they are one of the distinct people
     * {@code maxUsers} counts, and they were counted already.
     */
    boolean existsByStoreOwnerIdAndUserId(String ownerId, String userId);

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
