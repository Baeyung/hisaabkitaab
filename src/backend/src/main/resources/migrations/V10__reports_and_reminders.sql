--
-- Name: user_plans.daily_reports, user_plans.reminder_contacts; Type: COLUMN; Schema: public; Owner: -
--
-- The two entitlements the scheduled reports are sold as, alongside max_stores and max_users
-- and read the same way: null means "whatever the tier gives", a value is this account's own
-- override. See PlanLimits.effectiveFor, which is the single place the two are combined, and
-- PlanTier for the defaults — both start at PREMIUM, so TRIAL and BASIC default to false
-- and 0.
--
-- reminder_contacts is a ceiling on how many khata holders one shop may chase in a month, not
-- a count of messages: a shop with 200 parties over the threshold chases the 40 who owe most
-- and leaves the rest. That is what the plans page sells ("20 contacts", "40 contacts"), and
-- it is per store, because a shop's list of debtors is its own.
--
-- Deliberately no reminder_used/reminder_period pair to match V4's whatsapp counter. A quota
-- of messages needs one because a message is gone once sent and cannot be counted back; this
-- is not that. The monthly job runs once per shop per month and takes the top N debtors in
-- that one pass, so the ceiling is enforced by the selection itself, with nothing to carry
-- between runs and no month to reset. What the counter would really have been guarding — the
-- same run firing twice over a restart — is answered exactly by whatsapp_sends instead: see
-- WhatsAppSendRepository.existsBy…, which asks whether this shop has already been reported on
-- today or chased this month. That is a fact about what actually went out rather than a tally
-- that can drift from it.
--
-- daily_reports is a boolean rather than a number because there is nothing to count: the daily
-- report goes to one person, the shop's owner, once a day, and the number of shops is already
-- capped by max_stores.
--

ALTER TABLE public.user_plans ADD COLUMN daily_reports boolean;
ALTER TABLE public.user_plans ADD COLUMN reminder_contacts integer;

--
-- Name: whatsapp_sends.source; Type: COLUMN; Schema: public; Owner: -
--
-- What put this message on someone's phone: a shopkeeper pressing share, the nightly report,
-- or the monthly reminder. Every column beside it already answers "who, what, and did it
-- arrive" — this one answers "why", which is the question a delivery-history screen has to
-- filter on, and which the scheduler asks to know whether it has already run. The filename
-- comes closest and is not good enough: it is a display string, so reading intent out of it
-- would make every future rename a silent behaviour change.
--
-- Existing rows are all SHARE by definition — nothing else could have written one before this
-- migration — so the default backfills them correctly rather than leaving a null to interpret.
-- The default stays on the column as a safety net, but every insert names its source.
--

ALTER TABLE public.whatsapp_sends ADD COLUMN source character varying(16) DEFAULT 'SHARE' NOT NULL;

--
-- The scheduler's own read of this table: "has this shop already been reported on today?" and
-- "has this party already been chased this month?", both asked once per fire. The existing
-- (store_id, sent_at DESC) index cannot serve them — it would scan every send the shop has
-- ever made back to the cutoff, most of them shares — so source leads here, and sent_at
-- carries the date range.
--

CREATE INDEX whatsapp_sends_store_id_source_sent_at_idx
    ON public.whatsapp_sends (store_id, source, sent_at DESC);
