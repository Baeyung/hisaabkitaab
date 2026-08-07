--
-- Name: stores.suspended_at; Type: COLUMN; Schema: public; Owner: -
--
-- When this shop was put to sleep because the account's plan no longer covers it, or null
-- while it is one of the shops the plan does cover. A downgrade never destroys a shop: the
-- owner picks which ones stay open, the rest are stamped here, and they go read-only —
-- still listed, still readable, still printable, just closed to new entries.
--
-- Nullable with no default on purpose: "not suspended" is the absence of a date rather than
-- a flag set to false, so the column also records *when* it happened without a second one.
--
-- Only shops with a null here count against the plan's maxStores, and only the people who
-- can reach those shops count against its maxUsers. That is what lets an owner resolve both
-- ceilings by closing one shop, and what makes raising a plan's limits give the shops back
-- (see PlanService.assign) rather than merely permitting new ones.
--

ALTER TABLE public.stores ADD COLUMN suspended_at timestamp(6) with time zone;
