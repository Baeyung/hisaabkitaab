--
-- Name: transactions.discount; Type: COLUMN; Schema: public; Owner: -
--
-- A discount is now something the shopkeeper types on the entry screen, on a SALE or a
-- PURCHASE, whoever the party is — it used to be inferred after the fact, as whatever gap was
-- left on a walk-in bill that named nobody to put it on a khata. That inference tied a discount
-- to a cash sale specifically; a party on a khata could never be given one without it silently
-- becoming baqaya instead. This column is the explicit figure, read straight back on edit and
-- folded into PartyProcessor's due (bill − discount) before cash is weighed against it, so a
-- khata party, a walk-in, or a bit of both settle correctly in the same arithmetic.
--
ALTER TABLE public.transactions
    ADD COLUMN discount double precision NOT NULL DEFAULT 0;
