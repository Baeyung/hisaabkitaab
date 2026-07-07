package io.github.baeyung.hisaabkitaab.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.TransactionLine;

@Repository
public interface TransactionLineRepository extends JpaRepository<TransactionLine, String>
{
    List<TransactionLine> findByTransactionId(String transactionId);

    List<TransactionLine> findByPartyId(String partyId);

    List<TransactionLine> findByItemId(String itemId);
}
