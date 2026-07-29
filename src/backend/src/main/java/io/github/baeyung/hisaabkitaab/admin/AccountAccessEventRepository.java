package io.github.baeyung.hisaabkitaab.admin;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AccountAccessEventRepository extends JpaRepository<AccountAccessEvent, String>
{
    List<AccountAccessEvent> findByUserIdOrderByCreatedAtDesc(String userId);
}
