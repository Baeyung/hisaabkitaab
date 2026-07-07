package io.github.baeyung.hisaabkitaab.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.Transaction;

@Repository
public interface TransactionRepository extends JpaRepository<Transaction, String>
{
    List<Transaction> findByStoreId(String storeId);

    List<Transaction> findByStoreIdOrderByEventDateDesc(String storeId);

    List<Transaction> findByPartyId(String partyId);
}
