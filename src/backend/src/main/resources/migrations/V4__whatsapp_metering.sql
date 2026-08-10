--
-- Name: user_plans.whatsapp_used, user_plans.whatsapp_period; Type: COLUMN; Schema: public; Owner: -
--
-- What the account has spent of its whatsapp_quota, and the calendar month it spent it in
-- ('2026-08'). Unlike max_stores and max_users, a quota is not a standing total that can be
-- counted from the rows it governs — a message is gone once sent — so the spend has to be
-- recorded as it happens.
--
-- The month resets itself: nothing sweeps these columns. A send whose period differs from
-- today's overwrites both, so the count is 1 for the new month and the old month's total is
-- simply forgotten. That keeps the reset out of a scheduled job, which would otherwise be
-- the only recurring job in the application.
--
-- whatsapp_period is null until the account's first ever send, which reads the same as a
-- stale month: nothing has been spent this month.
--
-- Spending is a single conditional UPDATE (see UserPlanRepository.spendWhatsapp) rather than
-- a read followed by a write, so two simultaneous sends cannot both pass the ceiling. That
-- matters here in a way it does not for shops: sending is a per-click action a script could
-- fire in parallel, not a once-in-a-while act of setup.
--

ALTER TABLE public.user_plans ADD COLUMN whatsapp_used integer DEFAULT 0 NOT NULL;
ALTER TABLE public.user_plans ADD COLUMN whatsapp_period character varying(7);
