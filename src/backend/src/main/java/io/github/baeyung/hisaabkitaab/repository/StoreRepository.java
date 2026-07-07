package io.github.baeyung.hisaabkitaab.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.Store;

@Repository
public interface StoreRepository extends JpaRepository<Store, String>
{
    List<Store> findByOwnerId(String ownerId);
}
