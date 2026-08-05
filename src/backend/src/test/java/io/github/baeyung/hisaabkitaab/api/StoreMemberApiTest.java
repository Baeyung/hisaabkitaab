package io.github.baeyung.hisaabkitaab.api;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * /api/stores/&#123;storeId&#125;/members — sharing a shop with another user, and the wall
 * that keeps a shared user from doing the owner's job.
 *
 * <p>The distinction being proved throughout: a shared user works <em>inside</em> a shop
 * (entries, items, khatas) but never <em>on</em> it (its settings, its user list, its
 * existence) — and cannot erase settled history either way.
 */
class StoreMemberApiTest extends ApiTest
{
    @Autowired
    private JdbcTemplate jdbc;

    /** signup() derives the email from the contact number; invites are addressed by email. */
    private static String emailOf(String contactNumber)
    {
        return "u" + contactNumber + "@x.com";
    }

    private void invite(String owner, String store, String email, String role) throws Exception
    {
        mvc.perform(post(api(store, "/members")).with(as(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"role\":\"%s\"}".formatted(email, role)))
                .andExpect(status().isOk());
    }

    @Test
    void invitedUserSeesTheStoreAsShared() throws Exception
    {
        signup("3300000001");
        signup("3300000002");
        String store = createStore("3300000001", "Rana Cloth");

        invite("3300000001", store, emailOf("3300000002"), "EDITOR");

        mvc.perform(get("/api/stores").with(as("3300000002")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Rana Cloth"))
                .andExpect(jsonPath("$[0].role").value("EDITOR"))
                .andExpect(jsonPath("$[0].ownerName").value("User 3300000001"));

        // The owner's own listing still calls it theirs.
        mvc.perform(get("/api/stores").with(as("3300000001")))
                .andExpect(jsonPath("$[0].role").value("OWNER"));
    }

    @Test
    void viewerReadsButCannotWrite() throws Exception
    {
        signup("3300000003");
        signup("3300000004");
        String store = createStore("3300000003", "Rana Cloth");
        invite("3300000003", store, emailOf("3300000004"), "VIEWER");

        mvc.perform(get(api(store, "/parties")).with(as("3300000004")))
                .andExpect(status().isOk());
        mvc.perform(get(api(store, "/dashboard")).with(as("3300000004")))
                .andExpect(status().isOk());

        mvc.perform(post(api(store, "/parties")).with(as("3300000004"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ahmad\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void editorWorksInTheShopButNotOnIt() throws Exception
    {
        signup("3300000005");
        signup("3300000006");
        String store = createStore("3300000005", "Rana Cloth");
        invite("3300000005", store, emailOf("3300000006"), "EDITOR");

        // Inside the shop: entries, items, khatas, opening balances.
        MvcResult party = mvc.perform(post(api(store, "/parties")).with(as("3300000006"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ahmad\"}"))
                .andExpect(status().isOk())
                .andReturn();
        String partyId = tree(party).get("id").asText();

        mvc.perform(put(api(store, "/parties/" + partyId + "/opening-balance")).with(as("3300000006"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":500.0,\"direction\":\"THEY_OWE_YOU\"}"))
                .andExpect(status().isOk());

        // On the shop: settings, the user list, and deleting records outright.
        mvc.perform(delete(api(store, "/parties/" + partyId)).with(as("3300000006")))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/stores/" + store).with(as("3300000006"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Renamed\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/stores/" + store).with(as("3300000006")))
                .andExpect(status().isForbidden());
        mvc.perform(get(api(store, "/members")).with(as("3300000006")))
                .andExpect(status().isForbidden());
        mvc.perform(post(api(store, "/members")).with(as("3300000006"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"someone@x.com\",\"role\":\"VIEWER\"}"))
                .andExpect(status().isForbidden());
    }

    /** An editor may take back what they just booked, but not erase settled history. */
    @Test
    void editorDeletesRecentEntriesOnly() throws Exception
    {
        signup("3300000007");
        signup("3300000008");
        String store = createStore("3300000007", "Rana Cloth");
        invite("3300000007", store, emailOf("3300000008"), "EDITOR");

        String receipt = """
                {"transactionEvent":"RECEIPT","cashAmount":100,"billDate":"%s","party":{"name":"Ahmad"}}
                """.formatted(LocalDate.now());
        mvc.perform(post(api(store, "/event")).with(as("3300000008"))
                        .contentType(MediaType.APPLICATION_JSON).content(receipt))
                .andExpect(status().isOk());

        String entryId = tree(mvc.perform(get(api(store, "/cashbook")).with(as("3300000008")))
                .andExpect(status().isOk()).andReturn())
                .get("rows").get(0).get("transactionId").asText();

        // Age it past the 24-hour window — the only thing that changes the answer.
        jdbc.update("update transactions set created_at = ? where id = ?",
                java.sql.Timestamp.from(java.time.Instant.now().minusSeconds(25 * 3600)), entryId);

        mvc.perform(delete(api(store, "/event/" + entryId)).with(as("3300000008")))
                .andExpect(status().isForbidden());

        // The owner is not bound by the window.
        mvc.perform(delete(api(store, "/event/" + entryId)).with(as("3300000007")))
                .andExpect(status().isNoContent());
    }

    /** Editing an old entry is fine; only the irreversible half is time-boxed. */
    @Test
    void editorMayStillCorrectAnOldEntry() throws Exception
    {
        signup("3300000009");
        signup("3300000010");
        String store = createStore("3300000009", "Rana Cloth");
        invite("3300000009", store, emailOf("3300000010"), "EDITOR");

        String receipt = """
                {"transactionEvent":"RECEIPT","cashAmount":100,"billDate":"%s","party":{"name":"Ahmad"}}
                """.formatted(LocalDate.now());
        mvc.perform(post(api(store, "/event")).with(as("3300000010"))
                        .contentType(MediaType.APPLICATION_JSON).content(receipt))
                .andExpect(status().isOk());

        String entryId = tree(mvc.perform(get(api(store, "/cashbook")).with(as("3300000010")))
                .andExpect(status().isOk()).andReturn())
                .get("rows").get(0).get("transactionId").asText();

        jdbc.update("update transactions set created_at = ? where id = ?",
                java.sql.Timestamp.from(java.time.Instant.now().minusSeconds(25 * 3600)), entryId);

        String corrected = """
                {"transactionEvent":"RECEIPT","cashAmount":250,"billDate":"%s","party":{"name":"Ahmad"}}
                """.formatted(LocalDate.now());
        mvc.perform(put(api(store, "/event/" + entryId)).with(as("3300000010"))
                        .contentType(MediaType.APPLICATION_JSON).content(corrected))
                .andExpect(status().isNoContent());
        mvc.perform(get(api(store, "/cashbook")).with(as("3300000010")))
                .andExpect(jsonPath("$.totalIn").value(250.0));
    }

    /** Access granted before the invitee exists survives their signup, on the same account. */
    @Test
    void invitingAnUnknownEmailIsClaimedAtSignup() throws Exception
    {
        signup("3300000011");
        String store = createStore("3300000011", "Rana Cloth");

        invite("3300000011", store, "newcomer@x.com", "EDITOR");

        mvc.perform(get(api(store, "/members")).with(as("3300000011")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].email").value("newcomer@x.com"))
                .andExpect(jsonPath("$[0].status").value("INVITED"))
                .andExpect(jsonPath("$[0].name").doesNotExist());

        // The placeholder must not be a way in — no password was ever set on it.
        mvc.perform(get("/api/stores").with(as("3300000012")))
                .andExpect(status().isUnauthorized());

        mvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Newcomer","contactNumber":"3300000012",
                                 "email":"newcomer@x.com","password":"%s"}
                                """.formatted(PASSWORD)))
                .andExpect(status().isOk());

        mvc.perform(get("/api/stores").with(as("3300000012")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].role").value("EDITOR"));

        mvc.perform(get(api(store, "/members")).with(as("3300000011")))
                .andExpect(jsonPath("$[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$[0].name").value("Newcomer"));
    }

    @Test
    void ownerChangesRoleAndRevokes() throws Exception
    {
        signup("3300000013");
        String memberId = signup("3300000014");
        String store = createStore("3300000013", "Rana Cloth");
        invite("3300000013", store, emailOf("3300000014"), "EDITOR");

        mvc.perform(put(api(store, "/members/" + memberId)).with(as("3300000013"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"VIEWER\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("VIEWER"));

        // Demoted mid-session: the write they could make a moment ago is now refused.
        mvc.perform(post(api(store, "/parties")).with(as("3300000014"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ahmad\"}"))
                .andExpect(status().isForbidden());

        mvc.perform(delete(api(store, "/members/" + memberId)).with(as("3300000013")))
                .andExpect(status().isNoContent());

        // Revoked: back to not knowing the shop exists at all.
        mvc.perform(get("/api/stores").with(as("3300000014")))
                .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get(api(store, "/parties")).with(as("3300000014")))
                .andExpect(status().isNotFound());
    }

    @Test
    void inviteRejectsSelfDuplicateAndOwnerRole() throws Exception
    {
        signup("3300000015");
        signup("3300000016");
        String store = createStore("3300000015", "Rana Cloth");

        mvc.perform(post(api(store, "/members")).with(as("3300000015"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"role\":\"EDITOR\"}".formatted(emailOf("3300000015"))))
                .andExpect(status().isBadRequest());

        mvc.perform(post(api(store, "/members")).with(as("3300000015"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"role\":\"OWNER\"}".formatted(emailOf("3300000016"))))
                .andExpect(status().isBadRequest());

        invite("3300000015", store, emailOf("3300000016"), "EDITOR");
        mvc.perform(post(api(store, "/members")).with(as("3300000015"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"role\":\"VIEWER\"}".formatted(emailOf("3300000016"))))
                .andExpect(status().isConflict());
    }

    /** Deleting a shop takes its sharing with it — no rows left pointing at a gone store. */
    @Test
    void deletingTheStoreRemovesSharedAccess() throws Exception
    {
        signup("3300000017");
        signup("3300000018");
        String store = createStore("3300000017", "Rana Cloth");
        invite("3300000017", store, emailOf("3300000018"), "EDITOR");

        mvc.perform(delete("/api/stores/" + store).with(as("3300000017")))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/stores").with(as("3300000018")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
