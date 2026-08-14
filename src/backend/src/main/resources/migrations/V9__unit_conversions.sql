--
-- Name: unit_conversions; Type: TABLE; Schema: public; Owner: -
--
-- What one unit is worth in another, for this shop. Stock is kept in the unit named on the
-- catalogue item — that is the base every quantity has to arrive in — but a shop does not
-- always buy, make and sell in it. Greige cloth comes in by the metre and goes onto the shelf
-- by the gaz; a dye is bought by the kilo and spent by the gram. The entry screens convert
-- before they post, and this table is where they look the rate up.
--
-- Only the rates the shop had to teach us live here. Metre→gaz, kilo→gram, dozen→piece and the
-- rest of the fixed ones are a table in the frontend (core/units/units.ts): they are the same
-- in every shop in the world, so a row per shop would be a row per shop of the same number.
-- What is genuinely per-shop is the trade unit — a than is however many metres that mill winds
-- onto a bolt, a bori is however many kilos that supplier fills — and there is no answer to
-- those but the one the shopkeeper gives. A row here overrides the built-in table, so a shop
-- that measures its gaz slightly differently can say so and be believed.
--
-- One row per unordered pair, not per direction. A rate is symmetric — teaching "1 than = 22
-- metre" has already said "1 metre = 1/22 than" — so storing the two directions separately
-- would only create somewhere for them to disagree. The service sorts the pair before writing
-- (from_unit is always the alphabetically first of the two) and inverts on the way out when
-- the caller asked the other way round. See UnitConversionServiceImpl#canonical.
--
-- Units are stored folded — trimmed and lower-cased — because that is what makes the unique
-- constraint mean anything: "Meter", "meter" and " METER " are one unit, and a shopkeeper who
-- capitalises differently on a Tuesday must not get a second rate. Display case comes from the
-- catalogue item, never from here.
--

CREATE TABLE public.unit_conversions (
    id character varying(255) NOT NULL,
    store_id character varying(255) NOT NULL,
    from_unit character varying(64) NOT NULL,
    to_unit character varying(64) NOT NULL,
    factor numeric(19,8) NOT NULL
);

ALTER TABLE ONLY public.unit_conversions
    ADD CONSTRAINT unit_conversions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.unit_conversions
    ADD CONSTRAINT uk_unit_conversions_store_pair UNIQUE (store_id, from_unit, to_unit);

ALTER TABLE ONLY public.unit_conversions
    ADD CONSTRAINT fk_unit_conversions_store FOREIGN KEY (store_id) REFERENCES public.stores(id);

-- A rate of zero would convert every quantity to nothing, and a negative one would take stock
-- off the shelf by adding to it. Neither is a typo worth keeping, so the column refuses both.
ALTER TABLE ONLY public.unit_conversions
    ADD CONSTRAINT unit_conversions_factor_check CHECK (factor > 0);

-- Every read is "the rates for this shop", loaded once when an entry screen opens.
CREATE INDEX idx_unit_conversions_store ON public.unit_conversions (store_id);
