--
-- Name: user_plans; Type: TABLE; Schema: public; Owner: -
--
-- One plan per account, keyed by the user's own id. The three limit columns are nullable
-- overrides — null means "use the tier's default", which is why they carry no defaults here.
--
-- expires_at is nullable and means "the clock has not started". Plans are recorded long
-- before they are enforced, and a trial that ran down while nothing could be bought is a
-- trial nobody got — so the date is stamped on first use once enforcement is switched on.
--

CREATE TABLE public.user_plans (
    user_id character varying(255) NOT NULL,
    tier character varying(255) NOT NULL,
    assigned_at timestamp(6) with time zone NOT NULL,
    expires_at date,
    max_stores integer,
    max_users integer,
    whatsapp_quota integer,
    CONSTRAINT user_plans_pkey PRIMARY KEY (user_id),
    CONSTRAINT user_plans_tier_check CHECK (((tier)::text = ANY ((ARRAY[
        'TRIAL'::character varying,
        'BASIC'::character varying,
        'PREMIUM'::character varying,
        'PREMIUM_PLUS'::character varying,
        'ENTERPRISE'::character varying])::text[])))
);

ALTER TABLE ONLY public.user_plans
    ADD CONSTRAINT user_plans_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

--
-- Every account that exists today lands on TRIAL with its clock unstarted, exactly as a fresh
-- signup does. INVITED rows are skipped: they are placeholders nobody has signed up as yet,
-- and they get their plan when someone actually does — same rule the signup path follows.
--

INSERT INTO public.user_plans (user_id, tier, assigned_at)
SELECT id, 'TRIAL', now()
FROM public.users
WHERE status = 'ACTIVE';
