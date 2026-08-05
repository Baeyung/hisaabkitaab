-- Baseline: the schema exactly as Hibernate ddl-auto=update left it on 2026-08-05, the last
-- day the schema was managed by hand. Taken with pg_dump --schema-only, minus three dead tables
-- (plan_events, user_plan_details, account_access_events) that no code references any more.
--
-- Databases that already exist are stamped at this version by flyway.baseline-on-migrate and
-- never run it; only a fresh database executes this file. Every change from here on is a new
-- V<n>__<name>.sql beside it.

--
-- Name: expense_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_categories (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    store_id character varying(255) NOT NULL
);

--
-- Name: parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parties (
    id character varying(255) NOT NULL,
    address character varying(255),
    contact character varying(255),
    name character varying(255) NOT NULL,
    store_id character varying(255) NOT NULL
);

--
-- Name: store_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_items (
    id character varying(255) NOT NULL,
    cost_price numeric(38,2),
    name character varying(255) NOT NULL,
    sale_price numeric(38,2),
    unit character varying(255),
    store_id character varying(255) NOT NULL,
    service boolean DEFAULT false NOT NULL
);

--
-- Name: stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stores (
    id character varying(255) NOT NULL,
    address character varying(255),
    contact character varying(255),
    logo_uri text,
    name character varying(255) NOT NULL,
    watermark_uri text,
    owner_user_id character varying(255) NOT NULL
);

--
-- Name: transaction_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transaction_lines (
    id character varying(255) NOT NULL,
    in_out character varying(255) NOT NULL,
    item_sold_at double precision,
    quantity numeric(38,2),
    target_kind character varying(255) NOT NULL,
    unit character varying(255),
    value double precision,
    item_id character varying(255),
    party_id character varying(255),
    transaction_id character varying(255) NOT NULL,
    expense_category_id character varying(255),
    CONSTRAINT transaction_lines_in_out_check CHECK (((in_out)::text = ANY (ARRAY[('IN'::character varying)::text, ('OUT'::character varying)::text, ('NONE'::character varying)::text, ('UNKNOWN'::character varying)::text]))),
    CONSTRAINT transaction_lines_target_kind_check CHECK (((target_kind)::text = ANY (ARRAY[('CASH'::character varying)::text, ('BANK'::character varying)::text, ('PARTY'::character varying)::text, ('STOCK'::character varying)::text])))
);

--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id character varying(255) NOT NULL,
    bill character varying(255),
    created_at timestamp(6) with time zone NOT NULL,
    description character varying(255),
    entry_date date,
    event character varying(255) NOT NULL,
    event_date date,
    party_id character varying(255),
    store_id character varying(255) NOT NULL,
    CONSTRAINT transactions_event_check CHECK (((event)::text = ANY (ARRAY['SALE'::text, 'PURCHASE'::text, 'RECEIPT'::text, 'PAYMENT'::text, 'EXPENSE'::text, 'ADJUSTMENT'::text, 'OPENING_BALANCE'::text, 'OPENING_STOCK'::text, 'OPENING_CASH'::text])))
);

--
-- Name: user_access_store; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_access_store (
    id character varying(255) NOT NULL,
    role character varying(255) NOT NULL,
    store_id character varying(255) NOT NULL,
    user_id character varying(255) NOT NULL,
    CONSTRAINT user_access_store_role_check CHECK (((role)::text = ANY ((ARRAY['VIEWER'::character varying, 'EDITOR'::character varying, 'OWNER'::character varying])::text[])))
);

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying(255) NOT NULL,
    contact_number character varying(255) NOT NULL,
    email character varying(255),
    name character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    verification_token character varying(255),
    verified boolean DEFAULT false NOT NULL,
    reset_token character varying(255),
    reset_token_expiry timestamp(6) with time zone,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    verification_attempts integer DEFAULT 0 NOT NULL,
    verification_token_expiry timestamp(6) with time zone,
    reset_attempts integer DEFAULT 0 NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    last_failed_credential_hash character varying(255),
    status character varying(255) DEFAULT 'ACTIVE'::character varying NOT NULL,
    CONSTRAINT users_status_check CHECK (((status)::text = ANY ((ARRAY['INVITED'::character varying, 'ACTIVE'::character varying])::text[])))
);

--
-- Name: expense_categories expense_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_pkey PRIMARY KEY (id);

--
-- Name: parties parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_pkey PRIMARY KEY (id);

--
-- Name: store_items store_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_items
    ADD CONSTRAINT store_items_pkey PRIMARY KEY (id);

--
-- Name: stores stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_pkey PRIMARY KEY (id);

--
-- Name: transaction_lines transaction_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_lines
    ADD CONSTRAINT transaction_lines_pkey PRIMARY KEY (id);

--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);

--
-- Name: expense_categories uk6esrr86l4mmokyhekjm5h00lu; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT uk6esrr86l4mmokyhekjm5h00lu UNIQUE (store_id, name);

--
-- Name: users ukn14mnjfh0j5psw8omlegp1d68; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT ukn14mnjfh0j5psw8omlegp1d68 UNIQUE (contact_number);

--
-- Name: user_access_store user_access_store_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_access_store
    ADD CONSTRAINT user_access_store_pkey PRIMARY KEY (id);

--
-- Name: user_access_store user_access_store_store_user_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_access_store
    ADD CONSTRAINT user_access_store_store_user_key UNIQUE (store_id, user_id);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: stores fk2vdbdu0u0pqyeh995ykasqgos; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT fk2vdbdu0u0pqyeh995ykasqgos FOREIGN KEY (owner_user_id) REFERENCES public.users(id);

--
-- Name: transactions fk76d23hljajshvpfgctye587jp; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT fk76d23hljajshvpfgctye587jp FOREIGN KEY (store_id) REFERENCES public.stores(id);

--
-- Name: parties fk7945c46h1nsbwcs6vkkx24fx5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT fk7945c46h1nsbwcs6vkkx24fx5 FOREIGN KEY (store_id) REFERENCES public.stores(id);

--
-- Name: expense_categories fkd092lg3ofd80c79n3125kv0wi; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT fkd092lg3ofd80c79n3125kv0wi FOREIGN KEY (store_id) REFERENCES public.stores(id);

--
-- Name: transactions fkgnh179w2t4h5b6ofgxd85l1v2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT fkgnh179w2t4h5b6ofgxd85l1v2 FOREIGN KEY (party_id) REFERENCES public.parties(id);

--
-- Name: transaction_lines fkkt9n4gypaepa7gd8hlstq9vgy; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_lines
    ADD CONSTRAINT fkkt9n4gypaepa7gd8hlstq9vgy FOREIGN KEY (party_id) REFERENCES public.parties(id);

--
-- Name: transaction_lines fkmjgllc1hnljiuxye9rbfp82ll; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_lines
    ADD CONSTRAINT fkmjgllc1hnljiuxye9rbfp82ll FOREIGN KEY (item_id) REFERENCES public.store_items(id);

--
-- Name: transaction_lines fkp8mbl0itujpardrorgurejda4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_lines
    ADD CONSTRAINT fkp8mbl0itujpardrorgurejda4 FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);

--
-- Name: user_access_store fkpmcksci25kbf74r0ybhdmmg25; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_access_store
    ADD CONSTRAINT fkpmcksci25kbf74r0ybhdmmg25 FOREIGN KEY (user_id) REFERENCES public.users(id);

--
-- Name: user_access_store fkpnc4wt4bn4i9vt7f1b3ddufar; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_access_store
    ADD CONSTRAINT fkpnc4wt4bn4i9vt7f1b3ddufar FOREIGN KEY (store_id) REFERENCES public.stores(id);

--
-- Name: store_items fkrropxqocr7718fxgr5mpi6irv; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_items
    ADD CONSTRAINT fkrropxqocr7718fxgr5mpi6irv FOREIGN KEY (store_id) REFERENCES public.stores(id);

--
-- Name: transaction_lines fkt3iu4m8cv8g1wsq8m0lw9cnpv; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_lines
    ADD CONSTRAINT fkt3iu4m8cv8g1wsq8m0lw9cnpv FOREIGN KEY (expense_category_id) REFERENCES public.expense_categories(id);

