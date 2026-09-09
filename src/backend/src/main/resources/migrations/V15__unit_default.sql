--
-- Name: units.is_default; Type: COLUMN; Schema: public; Owner: -
--
-- The one unit a shop counts in when nothing else says otherwise. A shop that has switched
-- the per-line unit box off (Store Settings › Custom Fields › "Ask for a unit on each line")
-- still stocks in *something* — gaz, metre, kilo — and an item first named on a sale or a
-- purchase used to be created in a hardcoded "gz" regardless. Marking one unit here is how
-- that shop says what its shelf is counted in; see StoreItemService#resolveOrCreate, which
-- falls back to it when an entry names no unit at all.
--
-- At most one per store, kept by UnitService#setDefault clearing the old one in the same
-- transaction rather than by a constraint: a partial unique index would refuse the two-row
-- moment in the middle of a switch, and there is nothing else that writes this column.
--

ALTER TABLE public.units ADD COLUMN is_default boolean NOT NULL DEFAULT false;
