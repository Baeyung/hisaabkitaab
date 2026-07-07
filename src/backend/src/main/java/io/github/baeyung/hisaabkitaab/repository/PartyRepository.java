package io.github.baeyung.hisaabkitaab.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.Party;

@Repository
public interface PartyRepository extends JpaRepository<Party, String>
{
    List<Party> findByStoreId(String storeId);
}
