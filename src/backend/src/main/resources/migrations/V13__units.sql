--
-- Name: units; Type: TABLE; Schema: public; Owner: -
--
-- The unit names a shop counts stock in, offered on every entry screen's unit box. Per store,
-- the same way expense_categories is: every store starts with a default set (metre, gaz, kilo,
-- than, bori...) and grows as a shopkeeper types a name that isn't on the list yet — see
-- UnitService#resolveOrCreate.
--
-- This table carries no rate. The fixed measures (metre/gaz, kilo/gram, dozen/piece) are a
-- table in the frontend, identical everywhere; a shop's own trade-unit rates live in
-- unit_conversions. A name can sit here with no conversion at all — a shop that both stocks
-- and sells in "carton" never needs one.
--

CREATE TABLE public.units (
    id character varying(255) NOT NULL,
    store_id character varying(255) NOT NULL,
    name character varying(64) NOT NULL
);

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.units
    ADD CONSTRAINT uk_units_store_name UNIQUE (store_id, name);

ALTER TABLE ONLY public.units
    ADD CONSTRAINT fk_units_store FOREIGN KEY (store_id) REFERENCES public.stores(id);

CREATE INDEX idx_units_store ON public.units (store_id);

--
-- Every store that already exists gets the same default set a brand-new one would be seeded
-- with (UnitService#DEFAULT_NAMES), so its entry-screen unit box isn't empty the day this
-- ships. A store that later adds its own is unaffected — this only runs once, here.
--

INSERT INTO public.units (id, store_id, name)
SELECT gen_random_uuid()::text, s.id, u.name
FROM public.stores s
CROSS JOIN (VALUES
    ('Meter'), ('Gaz'), ('Yard'), ('Inch'), ('Foot'), ('Kg'), ('Gram'), ('Maund'), ('Tola'),
    ('Litre'), ('Piece'), ('Dozen'), ('Pair'), ('Than'), ('Roll'), ('Bundle'), ('Bori'),
    ('Carton'), ('Box'), ('Bale'), ('Packet')
) AS u(name);
