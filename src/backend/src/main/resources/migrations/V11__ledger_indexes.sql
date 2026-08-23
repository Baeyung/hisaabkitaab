--
-- Name: transaction_lines, transactions indexes; Type: INDEX; Schema: public; Owner: -
--
-- Every read in this app lands on these two tables, and until now neither had an index on
-- anything but its primary key. V1 was taken as a schema dump of a database that never had
-- any, and Postgres — unlike MySQL — does not index a foreign key just because it constrains
-- one. So every lookup by transaction, party or item was a sequential scan of the whole
-- table, and stayed invisible while the shops were small.
--
-- What made it visible: a party statement is one party's entire history, unpaged, and each of
-- its rows asks its transaction for the rest of its lines (see ItemSummary and DocumentTotals,
-- which need the goods and the cash beside the khata figure). On a shop with 213k lines that
-- was one full scan per row — a party with 11k entries spent minutes in the database. The
-- lazy loads are batched now (Transaction.lines), but batching only divides the count; without
-- an index each of the remaining queries still reads every row in the table.
--

--
-- The one that matters most: resolving a transaction's own lines. Walked by the statement and
-- cashbook row builders, by every delete, and by the join in half the queries below, where the
-- planner picks the transactions side first and then comes here once per transaction found.
--
CREATE INDEX transaction_lines_transaction_id_idx
    ON public.transaction_lines (transaction_id);

--
-- The khata statement and the party balance sweep. target_kind trails party_id rather than
-- leading it because a party's lines are nearly all PARTY lines already — the party is what
-- narrows 213k rows to a few thousand, and the kind only tidies up after it.
--
CREATE INDEX transaction_lines_party_id_target_kind_idx
    ON public.transaction_lines (party_id, target_kind);

--
-- The same shape for the stock side: one item's movement history, and the weighted-average
-- cost a PROCESSING entry reads before it folds its output in.
--
CREATE INDEX transaction_lines_item_id_target_kind_idx
    ON public.transaction_lines (item_id, target_kind);

--
-- The store's entries by business date — the cashbook's range, and the dashboard's. Indexed on
-- coalesce(event_date, entry_date) because that is the expression every one of those queries
-- filters on: event_date is the bill date the shopkeeper typed and may be null, entry_date is
-- always set, and an index on either column alone cannot serve the pair.
--
CREATE INDEX transactions_store_id_event_date_idx
    ON public.transactions (store_id, (coalesce(event_date, entry_date)));

--
-- The store's entries by kind, for the reads that want one kind of paper across all time:
-- expenses grouped into spend heads, and the opening balance/stock rows the settings screen
-- prefills from.
--
CREATE INDEX transactions_store_id_event_idx
    ON public.transactions (store_id, event);
