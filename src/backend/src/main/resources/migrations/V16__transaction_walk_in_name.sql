--
-- Name: transactions.walk_in_name; Type: COLUMN; Schema: public; Owner: -
--
-- Who a cash (party-less) sale or purchase was made out to, when the shopkeeper bothered
-- to write it down. A cash customer has no khata — party_id stays null and no ledger is
-- opened — but the printed bill still wants a name on its "Bill to" line, and the sales
-- list is easier to scan with one. Null for every entry that has a party and for the cash
-- entries that were never named; readers fall back to the fixed "Cash customer" label.
--

ALTER TABLE public.transactions ADD COLUMN walk_in_name character varying(255);
