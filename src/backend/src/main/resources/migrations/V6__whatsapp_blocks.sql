--
-- Name: whatsapp_blocks; Type: TABLE; Schema: public; Owner: -
--
-- Somebody who has told us to stop sending them the shop's documents on WhatsApp. Meta
-- requires every app-initiated template to carry a way out, and the document_share template's
-- URL button is it: it opens /block/<store_id>:<target_id>, and confirming there writes a row
-- here. The pair in that link is the whole address — it is unguessable, so the page needs no
-- login, which is the point: the person opting out is a customer, not a user of the app.
--
-- The key is (store, recipient, number), not (store, recipient). A block is a promise made
-- about the number that was actually being messaged, so changing a party's number lifts it —
-- that is a different phone belonging, as far as we can tell, to a different person — and
-- changing it back finds this row still standing. Recording the number is also what lets
-- support see whose phone a block belongs to when they are asked to undo one.
--
-- target_id is a party id or a user id: the same template goes to the shop's own people, so
-- they can opt out of it too. Deliberately no foreign key — it points at one of two tables,
-- and a party deleted afterwards must not take the block with it. A block outlives its row.
--
-- Nothing in the app removes a block. It is undone by hand from the back office
-- (/api/admin/whatsapp-blocks), so "this cannot be undone" is true of every path the person
-- opting out can reach.
--

CREATE TABLE public.whatsapp_blocks (
    id character varying(255) NOT NULL,
    store_id character varying(255) NOT NULL,
    target_id character varying(255) NOT NULL,
    contact character varying(255) NOT NULL,
    blocked_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.whatsapp_blocks
    ADD CONSTRAINT whatsapp_blocks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.whatsapp_blocks
    ADD CONSTRAINT whatsapp_blocks_store_target_contact_key UNIQUE (store_id, target_id, contact);

ALTER TABLE ONLY public.whatsapp_blocks
    ADD CONSTRAINT whatsapp_blocks_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id);
