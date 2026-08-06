package io.github.baeyung.hisaabkitaab.api;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import io.github.baeyung.hisaabkitaab.entity.UserPlan;
import io.github.baeyung.hisaabkitaab.enums.PlanTier;
import io.github.baeyung.hisaabkitaab.repository.UserPlanRepository;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The kill switch. {@code app.plans.enabled=false} has to mean the feature is not merely
 * lenient but absent: nothing refused, and — the part that is easy to get wrong — no trial
 * clock quietly started either.
 *
 * <p>That second half is what makes the switch safe to leave off for months. If a dark feature
 * stamped expiry dates, every account would come back from the dark already spent.
 */
@TestPropertySource(properties = "app.plans.enabled=false")
class PlansDisabledApiTest extends ApiTest
{
    @Autowired
    private UserPlanRepository userPlanRepository;

    /** A trial would allow exactly one shop. Switched off, the ceiling is not there at all. */
    @Test
    void storeLimitIsNotEnforced() throws Exception
    {
        signup("3600000001");

        for (String name : new String[] {"First", "Second", "Third"})
        {
            mvc.perform(post("/api/stores").with(as("3600000001"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"%s\"}".formatted(name)))
                    .andExpect(status().isOk());
        }
    }

    /** A trial's single user seat would block every invite. Switched off, none of them. */
    @Test
    void userLimitIsNotEnforced() throws Exception
    {
        signup("3600000002");
        String store = createStore("3600000002", "Shop");

        mvc.perform(post(api(store, "/members")).with(as("3600000002"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"someone@x.com\",\"role\":\"EDITOR\"}"))
                .andExpect(status().isOk());
    }

    /** An expired plan is not a locked account while nothing is being enforced. */
    @Test
    void expiredPlanCanStillSignIn() throws Exception
    {
        String user = signup("3600000003");
        userPlanRepository.save(UserPlan.builder()
                .userId(user)
                .tier(PlanTier.TRIAL)
                .assignedAt(Instant.now())
                .expiresAt(LocalDate.now().minusDays(1))
                .build());

        mvc.perform(get("/api/stores").with(as("3600000003")))
                .andExpect(status().isOk());
    }

    /** And no clock starts, however many requests the account makes. */
    @Test
    void trialClockNeverStarts() throws Exception
    {
        String user = signup("3600000004");

        mvc.perform(get("/api/stores").with(as("3600000004"))).andExpect(status().isOk());
        mvc.perform(get("/api/stores").with(as("3600000004"))).andExpect(status().isOk());

        assertNull(userPlanRepository.findById(user).orElseThrow().getExpiresAt());
    }

    /** The plan endpoint still answers, and says plainly that its numbers are not being applied. */
    @Test
    void planEndpointReportsThatNothingIsEnforced() throws Exception
    {
        signup("3600000005");

        mvc.perform(get("/api/plan/me").with(as("3600000005")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tier").value("TRIAL"))
                .andExpect(jsonPath("$.enforced").value(false))
                .andExpect(jsonPath("$.limits.maxStores").value(1))
                .andExpect(jsonPath("$.usage.stores").value(0))
                // The owner is always one of the users the plan covers.
                .andExpect(jsonPath("$.usage.users").value(1));
    }
}
