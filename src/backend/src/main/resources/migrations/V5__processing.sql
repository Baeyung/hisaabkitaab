--
-- Name: PROCESSING event; transaction_lines.name; Type: CONSTRAINT, COLUMN; Schema: public; Owner: -
--
-- Processed goods: raw cloth plus dyes and fuel are consumed to make a different item. The
-- entry is a transaction like any other, so the enum's CHECK has to admit its event — the
-- constraint was written out as a value list in the baseline, so widening it means replacing
-- it rather than adding to it.
--
-- A PROCESSING transaction carries STOCK lines in both directions at once (OUT for what was
-- consumed, IN for what came out), which no other event does. It touches neither cash nor a
-- party, so it never surfaces in the cashbook or a khata — only in each item's movement
-- history, and on the processed-goods list.
--
-- transaction_lines.name exists for the raw rows. A raw material (the greige cloth) is
-- deliberately not a catalogue item: it holds no stock, has no price list, and would only
-- clutter inventory with a line that never moves. But it is still what the batch was made
-- from, so the row is kept on the transaction — item_id null, in_out NONE, so every stock
-- fold passes over it — and this column is the only place its name can live. Null on every
-- other line, where the item's own name serves.
--

ALTER TABLE public.transactions DROP CONSTRAINT transactions_event_check;

ALTER TABLE public.transactions ADD CONSTRAINT transactions_event_check
    CHECK (((event)::text = ANY (ARRAY['SALE'::text, 'PURCHASE'::text, 'RECEIPT'::text,
        'PAYMENT'::text, 'EXPENSE'::text, 'ADJUSTMENT'::text, 'OPENING_BALANCE'::text,
        'OPENING_STOCK'::text, 'OPENING_CASH'::text, 'PROCESSING'::text])));

ALTER TABLE public.transaction_lines ADD COLUMN name character varying(255);
