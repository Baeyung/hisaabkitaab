--
-- Name: whatsapp_sends; Type: TABLE; Schema: public; Owner: -
--
-- One row per person a document was addressed to, written whichever way it went: the message
-- Meta accepted, the one it refused, and the one that never left because the recipient had
-- opted out or the shop's monthly quota was gone. A send to three people writes three rows.
--
-- This is the answer to "did you send me my bill?", which the shop is asked and cannot
-- otherwise settle: the quota columns count messages and nothing has ever recorded who they
-- went to. Kept as its own table rather than hung off transactions because a send is not
-- about one — any printable screen can be shared.
--
-- The recipient is written down rather than pointed at: name and number as they stood when
-- the message went, alongside target_id. An audit row has to stay readable after the party is
-- renamed, given a new phone, or deleted, and target_id is a party id or a user id — the same
-- two-tables reason whatsapp_blocks carries no foreign key for it. sender_id is likewise a
-- snapshot pair: it is always a user, but the row must outlive the account all the same.
--
-- Nothing writes to a row after it is inserted and nothing updates one. Rows go only when the
-- shop does (see StoreServiceImpl.delete) — there is no audit left to keep once the shop that
-- was audited is gone.
--

CREATE TABLE public.whatsapp_sends (
    id character varying(255) NOT NULL,
    store_id character varying(255) NOT NULL,
    sender_id character varying(255) NOT NULL,
    sender_name character varying(255) NOT NULL,
    target_id character varying(255) NOT NULL,
    recipient_name character varying(255) NOT NULL,
    contact character varying(255) NOT NULL,
    filename character varying(255) NOT NULL,
    status character varying(16) NOT NULL,
    sent_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.whatsapp_sends
    ADD CONSTRAINT whatsapp_sends_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.whatsapp_sends
    ADD CONSTRAINT whatsapp_sends_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id);

--
-- The only way this table is ever read: one shop's history, newest first.
--

CREATE INDEX whatsapp_sends_store_id_sent_at_idx ON public.whatsapp_sends (store_id, sent_at DESC);
