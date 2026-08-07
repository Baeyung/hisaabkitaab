package io.github.baeyung.hisaabkitaab.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.UserPlan;

@Repository
public interface UserPlanRepository extends JpaRepository<UserPlan, String>
{
}
