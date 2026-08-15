package io.github.baeyung.hisaabkitaab.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** /api/stores: owner-scoped CRUD, opening cash, and cross-owner isolation. */
class StoreApiTest extends ApiTest
{
    @Test
    void listRequiresAuthentication() throws Exception
    {
        mvc.perform(get("/api/stores")).andExpect(status().isUnauthorized());
    }

    @Test
    void createThenListGetUpdateDelete() throws Exception
    {
        signup("3101000001");
        String id = createStore("3101000001", "Rana Cloth");

        mvc.perform(get("/api/stores").with(as("3101000001")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Rana Cloth"));

        mvc.perform(get("/api/stores/" + id).with(as("3101000001")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Rana Cloth"));

        mvc.perform(put("/api/stores/" + id).with(as("3101000001"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Rana Fabrics\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Rana Fabrics"));

        mvc.perform(delete("/api/stores/" + id).with(as("3101000001")))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/stores/" + id).with(as("3101000001")))
                .andExpect(status().isNotFound());
    }

    @Test
    void createRejectsBlankName() throws Exception
    {
        signup("3101000002");
        mvc.perform(post("/api/stores").with(as("3101000002"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void oneUserCannotSeeAnothersStore() throws Exception
    {
        signup("3101000003");
        signup("3101000004");
        String ranaStore = createStore("3101000003", "Rana Cloth");

        // The other user must not be able to read it — reported as 404, never leaked.
        mvc.perform(get("/api/stores/" + ranaStore).with(as("3101000004")))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/stores").with(as("3101000004")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void openingCashDefaultsToZeroThenRoundTrips() throws Exception
    {
        signup("3101000005");
        String store = createStore("3101000005", "Rana Cloth");

        mvc.perform(get(api(store, "/opening-cash")).with(as("3101000005")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(0.0));

        mvc.perform(put(api(store, "/opening-cash")).with(as("3101000005"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":1500.0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(1500.0));

        mvc.perform(get(api(store, "/opening-cash")).with(as("3101000005")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(1500.0));
    }

    @Test
    void openingCashRejectsNegative() throws Exception
    {
        signup("3101000006");
        String store = createStore("3101000006", "Rana Cloth");
        mvc.perform(put(api(store, "/opening-cash")).with(as("3101000006"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":-1.0}"))
                .andExpect(status().isBadRequest());
    }

    /** Many shops under one login: each is created, listed and read on its own id. */
    @Test
    void oneOwnerCanHoldSeveralStores() throws Exception
    {
        signup("3101000007");
        String cloth = createStore("3101000007", "Rana Cloth");
        String hardware = createStore("3101000007", "Rana Hardware");

        mvc.perform(get("/api/stores").with(as("3101000007")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        mvc.perform(get("/api/stores/" + cloth).with(as("3101000007")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Rana Cloth"));

        mvc.perform(get("/api/stores/" + hardware).with(as("3101000007")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Rana Hardware"));
    }

    /** Each store carries its own drawer: setting one leaves the other at zero. */
    @Test
    void openingCashIsPerStore() throws Exception
    {
        signup("3101000008");
        String cloth = createStore("3101000008", "Rana Cloth");
        String hardware = createStore("3101000008", "Rana Hardware");

        mvc.perform(put(api(cloth, "/opening-cash")).with(as("3101000008"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":1500.0}"))
                .andExpect(status().isOk());

        mvc.perform(get(api(hardware, "/opening-cash")).with(as("3101000008")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(0.0));
    }

    /**
     * A shop nobody has arranged answers with the empty arrangement, not null — the client
     * has one shape to read whether or not the owner has ever opened the menu screen.
     */
    @Test
    void settingsDefaultToEmpty() throws Exception
    {
        signup("3101000009");
        String store = createStore("3101000009", "Rana Cloth");

        mvc.perform(get("/api/stores/" + store).with(as("3101000009")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settings.menu.length()").value(0))
                .andExpect(jsonPath("$.settings.hideChrome.length()").value(0))
                .andExpect(jsonPath("$.settings.easyMode").value(false));
    }

    /**
     * An arrangement written before the board existed has no {@code easyMode} in it, and a
     * shop that was working yesterday must not change how it navigates because the app
     * shipped. Absent reads as off — the sidebar, which is what those shops already had.
     */
    @Test
    void settingsWithoutEasyModeReadAsSidebar() throws Exception
    {
        signup("3101000014");
        String store = createStore("3101000014", "Rana Cloth");

        mvc.perform(put(api(store, "/settings")).with(as("3101000014"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"menu\":[{\"key\":\"nav.ledger\"}],\"hideChrome\":[]}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/stores/" + store).with(as("3101000014")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settings.easyMode").value(false));
    }

    /**
     * How a shop navigates is the shop's, like the rest of the arrangement: everyone working
     * in it gets the board, not just the owner who switched it on.
     */
    @Test
    void easyModeRoundTripsAndReachesSharedUsers() throws Exception
    {
        signup("3101000015");
        signup("3101000016");
        String store = createStore("3101000015", "Rana Cloth");

        mvc.perform(post(api(store, "/members")).with(as("3101000015"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"u3101000016@x.com\",\"role\":\"EDITOR\"}"))
                .andExpect(status().isOk());

        mvc.perform(put(api(store, "/settings")).with(as("3101000015"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"menu\":[],\"hideChrome\":[],\"easyMode\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settings.easyMode").value(true));

        mvc.perform(get("/api/stores/" + store).with(as("3101000016")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settings.easyMode").value(true));
    }

    /**
     * The whole point of the text column: whatever the client sends comes back as it was
     * sent, through the converter and out of the database, nesting and all.
     */
    @Test
    void settingsRoundTripThroughTheConverter() throws Exception
    {
        signup("3101000010");
        String store = createStore("3101000010", "Rana Cloth");

        mvc.perform(put(api(store, "/settings")).with(as("3101000010"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"menu":[
                                   {"key":"nav.ledger","hidden":false,"label":"Khata"},
                                   {"key":"nav.inventory","hidden":true},
                                   {"key":"nav.newEntry","children":[{"key":"nav.sale","label":"Bikri"}]}],
                                 "hideChrome":["THEME","PLAN"]}"""))
                .andExpect(status().isOk());

        // Read back on a fresh request, so the assertion is on what the column holds rather
        // than on the object that was just handed in.
        mvc.perform(get("/api/stores/" + store).with(as("3101000010")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settings.menu[0].key").value("nav.ledger"))
                .andExpect(jsonPath("$.settings.menu[0].label").value("Khata"))
                .andExpect(jsonPath("$.settings.menu[1].hidden").value(true))
                .andExpect(jsonPath("$.settings.menu[2].children[0].label").value("Bikri"))
                .andExpect(jsonPath("$.settings.hideChrome.length()").value(2));
    }

    /** A label long enough to break a sidebar row is refused rather than stored. */
    @Test
    void settingsRejectAnOverlongLabel() throws Exception
    {
        signup("3101000011");
        String store = createStore("3101000011", "Rana Cloth");

        mvc.perform(put(api(store, "/settings")).with(as("3101000011"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"menu\":[{\"key\":\"nav.ledger\",\"label\":\"%s\"}]}"
                                .formatted("x".repeat(25))))
                .andExpect(status().isBadRequest());
    }

    /**
     * The arrangement is the shop's, so only its owner sets it. A shared user reads the menu
     * the owner built and cannot rearrange somebody else's shop.
     */
    @Test
    void onlyTheOwnerMayArrangeTheMenu() throws Exception
    {
        signup("3101000012");
        signup("3101000013");
        String store = createStore("3101000012", "Rana Cloth");

        mvc.perform(post(api(store, "/members")).with(as("3101000012"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"u3101000013@x.com\",\"role\":\"EDITOR\"}"))
                .andExpect(status().isOk());

        mvc.perform(put(api(store, "/settings")).with(as("3101000013"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"menu\":[{\"key\":\"nav.ledger\"}],\"hideChrome\":[]}"))
                .andExpect(status().isForbidden());

        // …but they do receive it, since it is the menu they are meant to be working in.
        mvc.perform(get("/api/stores/" + store).with(as("3101000013")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settings").exists());
    }
}
