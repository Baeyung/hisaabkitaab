package io.github.baeyung.hisaabkitaab.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.StoreItem;

@Repository
public interface StoreItemRepository extends JpaRepository<StoreItem, String>
{
    List<StoreItem> findByStoreId(String storeId);
}
