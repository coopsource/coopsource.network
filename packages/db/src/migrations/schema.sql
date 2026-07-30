--
-- PostgreSQL database dump
--


-- Dumped from database version 16.14 (Homebrew)
-- Dumped by pg_dump version 16.14 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: prevent_fact_log_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_fact_log_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'fact_log is immutable — UPDATE and DELETE are not allowed';
      RETURN NULL;
    END;
    $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_officer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_officer (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uri text,
    cid text,
    cooperative_did text NOT NULL,
    officer_did text NOT NULL,
    title text NOT NULL,
    appointed_at timestamp with time zone NOT NULL,
    term_ends_at timestamp with time zone,
    appointment_type text NOT NULL,
    responsibilities text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    invalidated_at timestamp with time zone
);


--
-- Name: agent_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    name text NOT NULL,
    description text,
    agent_type text DEFAULT 'custom'::text NOT NULL,
    model_config jsonb NOT NULL,
    system_prompt text NOT NULL,
    allowed_tools jsonb DEFAULT '[]'::jsonb NOT NULL,
    context_sources jsonb DEFAULT '[]'::jsonb NOT NULL,
    temperature real DEFAULT 0.7 NOT NULL,
    max_tokens_per_request integer DEFAULT 4096 NOT NULL,
    max_tokens_per_session integer DEFAULT 100000 NOT NULL,
    monthly_budget_cents integer,
    enabled boolean DEFAULT true NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_message (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    tool_calls jsonb,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cost_microdollars integer DEFAULT 0 NOT NULL,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_config_id uuid NOT NULL,
    user_did text NOT NULL,
    title text,
    status text DEFAULT 'active'::text NOT NULL,
    total_input_tokens integer DEFAULT 0 NOT NULL,
    total_output_tokens integer DEFAULT 0 NOT NULL,
    total_cost_microdollars integer DEFAULT 0 NOT NULL,
    memory jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);


--
-- Name: agent_trigger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_trigger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_config_id uuid NOT NULL,
    cooperative_did text NOT NULL,
    event_type text NOT NULL,
    conditions jsonb DEFAULT '[]'::jsonb NOT NULL,
    prompt_template text,
    cooldown_seconds integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    last_triggered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    actions jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: agent_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    agent_config_id uuid,
    period text NOT NULL,
    total_requests integer DEFAULT 0 NOT NULL,
    total_input_tokens integer DEFAULT 0 NOT NULL,
    total_output_tokens integer DEFAULT 0 NOT NULL,
    total_cost_microdollars integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agreement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agreement (
    uri text NOT NULL,
    did text NOT NULL,
    rkey text NOT NULL,
    project_uri text NOT NULL,
    title text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    purpose text,
    scope text,
    agreement_type text DEFAULT 'custom'::text NOT NULL,
    governance_framework jsonb,
    dispute_resolution jsonb,
    amendment_process jsonb,
    termination_conditions jsonb,
    status text DEFAULT 'draft'::text NOT NULL,
    effective_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    body text,
    body_format text DEFAULT 'markdown'::text NOT NULL,
    created_by text DEFAULT ''::text NOT NULL
);


--
-- Name: agreement_revision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agreement_revision (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agreement_uri text NOT NULL,
    revision_number integer NOT NULL,
    changed_by text NOT NULL,
    change_type text NOT NULL,
    field_changes jsonb,
    snapshot jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agreement_signature; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agreement_signature (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uri text,
    cid text,
    agreement_id uuid,
    agreement_uri text NOT NULL,
    agreement_cid text NOT NULL,
    signer_did text NOT NULL,
    statement text,
    signed_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    retracted_at timestamp with time zone,
    retracted_by text,
    retraction_reason text,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agreement_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agreement_template (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    created_by text NOT NULL,
    name text NOT NULL,
    description text,
    agreement_type text DEFAULT 'custom'::text NOT NULL,
    template_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: api_token; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_token (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    user_did text NOT NULL,
    name text NOT NULL,
    token_hash text NOT NULL,
    scopes jsonb DEFAULT '["read"]'::jsonb NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_credential; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_credential (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_did text NOT NULL,
    credential_type text DEFAULT 'password'::text NOT NULL,
    identifier text NOT NULL,
    secret_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    invalidated_at timestamp with time zone
);


--
-- Name: calendar_event_ref; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_event_ref (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_uri text NOT NULL,
    proposal_uri text,
    cooperative_did text NOT NULL,
    title text,
    starts_at timestamp with time zone,
    rsvp_count integer DEFAULT 0 NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: capital_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capital_account (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    member_did text NOT NULL,
    initial_contribution numeric(18,2) DEFAULT 0 NOT NULL,
    total_patronage_allocated numeric(18,2) DEFAULT 0 NOT NULL,
    total_redeemed numeric(18,2) DEFAULT 0 NOT NULL,
    balance numeric(18,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: capital_account_transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capital_account_transaction (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    capital_account_id text NOT NULL,
    cooperative_did text NOT NULL,
    member_did text NOT NULL,
    transaction_type text NOT NULL,
    amount numeric(18,2) NOT NULL,
    fiscal_period_id text,
    patronage_record_id text,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text NOT NULL
);


--
-- Name: collaborative_contribution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collaborative_contribution (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id text NOT NULL,
    cooperative_did text NOT NULL,
    hours_contributed numeric(10,2) DEFAULT 0,
    revenue_earned numeric(18,2) DEFAULT 0,
    expense_incurred numeric(18,2) DEFAULT 0,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: collaborative_project; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collaborative_project (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_cooperative_did text NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'planning'::text NOT NULL,
    participant_dids text[] DEFAULT '{}'::text[] NOT NULL,
    uri text,
    cid text,
    revenue_split jsonb,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT collaborative_project_status_check CHECK ((status = ANY (ARRAY['planning'::text, 'active'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: commerce_listing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commerce_listing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL,
    availability text DEFAULT 'available'::text NOT NULL,
    location text,
    cooperative_type text,
    tags text[] DEFAULT '{}'::text[],
    uri text,
    cid text,
    status text DEFAULT 'active'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT commerce_listing_availability_check CHECK ((availability = ANY (ARRAY['available'::text, 'limited'::text, 'unavailable'::text]))),
    CONSTRAINT commerce_listing_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'archived'::text])))
);


--
-- Name: commerce_need; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commerce_need (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL,
    urgency text DEFAULT 'normal'::text NOT NULL,
    location text,
    tags text[] DEFAULT '{}'::text[],
    uri text,
    cid text,
    status text DEFAULT 'open'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT commerce_need_status_check CHECK ((status = ANY (ARRAY['open'::text, 'matched'::text, 'fulfilled'::text, 'cancelled'::text]))),
    CONSTRAINT commerce_need_urgency_check CHECK ((urgency = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])))
);


--
-- Name: compliance_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uri text,
    cid text,
    cooperative_did text NOT NULL,
    title text NOT NULL,
    description text,
    due_date timestamp with time zone NOT NULL,
    filing_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    completed_at timestamp with time zone,
    completed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    invalidated_at timestamp with time zone
);


--
-- Name: connection_binding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connection_binding (
    uri text NOT NULL,
    did text NOT NULL,
    rkey text NOT NULL,
    connection_uri text NOT NULL,
    project_uri text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: connector_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connector_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    connector_type text NOT NULL,
    display_name text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: connector_field_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connector_field_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connector_config_id text NOT NULL,
    local_field text NOT NULL,
    remote_field text NOT NULL,
    transform text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: connector_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connector_sync_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connector_config_id text NOT NULL,
    direction text NOT NULL,
    records_synced integer DEFAULT 0,
    records_failed integer DEFAULT 0,
    error_details text,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    CONSTRAINT connector_sync_log_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text, 'bidirectional'::text]))),
    CONSTRAINT connector_sync_log_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: cooperative_link; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cooperative_link (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    initiator_did text NOT NULL,
    target_did text NOT NULL,
    link_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    description text,
    metadata jsonb,
    initiated_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    dissolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cooperative_link_no_self_link CHECK ((initiator_did <> target_did)),
    CONSTRAINT cooperative_link_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'declined'::text, 'dissolved'::text]))),
    CONSTRAINT cooperative_link_type_check CHECK ((link_type = ANY (ARRAY['partnership'::text, 'supply_chain'::text, 'shared_infrastructure'::text, 'federation'::text, 'other'::text])))
);


--
-- Name: cooperative_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cooperative_profile (
    entity_did text NOT NULL,
    uri text,
    cid text,
    cooperative_type text DEFAULT 'other'::text NOT NULL,
    is_network boolean DEFAULT false NOT NULL,
    membership_policy text DEFAULT 'invite_only'::text NOT NULL,
    max_members integer,
    location text,
    website text,
    founded_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    public_description boolean DEFAULT true NOT NULL,
    public_members boolean DEFAULT false NOT NULL,
    public_activity boolean DEFAULT false NOT NULL,
    public_agreements boolean DEFAULT false NOT NULL,
    public_campaigns boolean DEFAULT false NOT NULL,
    public_governance_anchors boolean DEFAULT false NOT NULL,
    public_governance_anchor_outcomes boolean DEFAULT false NOT NULL,
    governance_visibility text DEFAULT 'open'::text NOT NULL,
    anon_discoverable boolean DEFAULT false NOT NULL,
    cross_coop_visible boolean DEFAULT true NOT NULL
);


--
-- Name: cooperative_script; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cooperative_script (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    name text NOT NULL,
    description text,
    source_code text NOT NULL,
    compiled_js text,
    phase text NOT NULL,
    collections text[],
    event_types text[],
    priority integer DEFAULT 200 NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    config jsonb,
    timeout_ms integer DEFAULT 5000 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_script_phase CHECK ((phase = ANY (ARRAY['pre-storage'::text, 'post-storage'::text, 'domain-event'::text])))
);


--
-- Name: data_deletion_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_deletion_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_did text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    requested_by text NOT NULL,
    reason text
);


--
-- Name: delegation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delegation (
    uri text NOT NULL,
    did text NOT NULL,
    rkey text NOT NULL,
    project_uri text NOT NULL,
    delegator_did text NOT NULL,
    delegatee_did text NOT NULL,
    scope text NOT NULL,
    proposal_uri text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: desired_outcome; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desired_outcome (
    uri text NOT NULL,
    did text NOT NULL,
    rkey text NOT NULL,
    project_uri text NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL,
    success_criteria jsonb DEFAULT '[]'::jsonb NOT NULL,
    stakeholder_support jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'proposed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    outcome_search_tsv tsvector GENERATED ALWAYS AS (((setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(category, ''::text)), 'A'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(description, ''::text)), 'B'::"char"))) STORED
);


--
-- Name: did_rotation_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.did_rotation_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    current_did text NOT NULL,
    prior_did text NOT NULL,
    rotated_at timestamp with time zone NOT NULL,
    evidence_uri text,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity (
    did text NOT NULL,
    type text NOT NULL,
    handle text,
    display_name text DEFAULT ''::text NOT NULL,
    description text,
    avatar_cid text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    invalidated_at timestamp with time zone,
    invalidated_by text,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_search_tsv tsvector GENERATED ALWAYS AS (((setweight(to_tsvector('english'::regconfig, COALESCE(display_name, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(handle, ''::text)), 'A'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(description, ''::text)), 'B'::"char"))) STORED,
    CONSTRAINT entity_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'deleted'::text]))),
    CONSTRAINT entity_type_check CHECK ((type = ANY (ARRAY['person'::text, 'cooperative'::text])))
);


--
-- Name: entity_key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_key (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_did text NOT NULL,
    key_type text DEFAULT 'ES256'::text NOT NULL,
    public_key_jwk text NOT NULL,
    private_key_enc text NOT NULL,
    key_purpose text DEFAULT 'signing'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    rotated_at timestamp with time zone,
    invalidated_at timestamp with time zone
);


--
-- Name: expense; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    member_did text NOT NULL,
    category_id text,
    title text NOT NULL,
    description text,
    amount numeric(18,2) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    receipt_blob_cid text,
    status text DEFAULT 'submitted'::text NOT NULL,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    review_note text,
    reimbursed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expense_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'reimbursed'::text])))
);


--
-- Name: expense_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_category (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    name text NOT NULL,
    description text,
    budget_limit numeric(18,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: external_connection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_connection (
    uri text NOT NULL,
    did text NOT NULL,
    rkey text NOT NULL,
    service text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    oauth_token_encrypted text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fact_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fact_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    field text NOT NULL,
    old_value jsonb,
    new_value jsonb,
    changed_by text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text,
    ip_address inet
);


--
-- Name: fact_log_redaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fact_log_redaction (
    fact_log_id uuid NOT NULL,
    redacted_at timestamp with time zone DEFAULT now() NOT NULL,
    redacted_by text,
    request_id uuid
);


--
-- Name: fiscal_period; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fiscal_period (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uri text,
    cid text,
    cooperative_did text NOT NULL,
    label text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    invalidated_at timestamp with time zone
);


--
-- Name: frontpage_post_ref; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.frontpage_post_ref (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_uri text NOT NULL,
    proposal_uri text,
    cooperative_did text NOT NULL,
    title text,
    comment_count integer DEFAULT 0 NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: funding_campaign; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funding_campaign (
    uri text NOT NULL,
    did text NOT NULL,
    rkey text NOT NULL,
    beneficiary_uri text NOT NULL,
    title text NOT NULL,
    description text,
    tier text NOT NULL,
    campaign_type text NOT NULL,
    goal_amount integer NOT NULL,
    goal_currency text DEFAULT 'USD'::text NOT NULL,
    amount_raised integer DEFAULT 0 NOT NULL,
    backer_count integer DEFAULT 0 NOT NULL,
    funding_model text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: funding_pledge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funding_pledge (
    uri text NOT NULL,
    did text NOT NULL,
    rkey text NOT NULL,
    campaign_uri text NOT NULL,
    backer_did text NOT NULL,
    amount integer NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    payment_session_id text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_provider text
);


--
-- Name: governance_label; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_label (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    src_did text NOT NULL,
    subject_uri text NOT NULL,
    subject_cid text,
    label_value text NOT NULL,
    neg boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    seq bigint NOT NULL
);


--
-- Name: governance_label_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.governance_label_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: governance_label_seq_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.governance_label_seq_seq OWNED BY public.governance_label.seq;


--
-- Name: hook_dead_letter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hook_dead_letter (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_uri text NOT NULL,
    event_did text NOT NULL,
    collection text NOT NULL,
    operation text NOT NULL,
    hook_id text NOT NULL,
    hook_phase text NOT NULL,
    error_message text NOT NULL,
    error_stack text,
    event_data jsonb,
    retry_count integer DEFAULT 0 NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: intercoop_agreement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intercoop_agreement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    initiator_did text NOT NULL,
    responder_did text NOT NULL,
    title text NOT NULL,
    description text,
    agreement_type text DEFAULT 'service'::text NOT NULL,
    initiator_uri text,
    initiator_cid text,
    responder_uri text,
    responder_cid text,
    status text DEFAULT 'proposed'::text NOT NULL,
    terms jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT intercoop_agreement_different_parties_check CHECK ((initiator_did <> responder_did)),
    CONSTRAINT intercoop_agreement_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'negotiating'::text, 'active'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT intercoop_agreement_type_check CHECK ((agreement_type = ANY (ARRAY['service'::text, 'supply'::text, 'joint_venture'::text, 'procurement'::text, 'resource_sharing'::text, 'other'::text])))
);


--
-- Name: interest_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interest_map (
    uri text NOT NULL,
    did text NOT NULL,
    rkey text NOT NULL,
    project_uri text NOT NULL,
    alignment_zones jsonb DEFAULT '[]'::jsonb NOT NULL,
    conflict_zones jsonb DEFAULT '[]'::jsonb NOT NULL,
    ai_analysis jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invitation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    invitee_did text,
    invitee_email text,
    invited_by_did text NOT NULL,
    intended_roles text[] DEFAULT '{member}'::text[] NOT NULL,
    token text NOT NULL,
    message text,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    invalidated_at timestamp with time zone,
    invalidated_by text,
    CONSTRAINT invitation_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text, 'revoked'::text])))
);


--
-- Name: legal_document; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_document (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uri text,
    cid text,
    cooperative_did text NOT NULL,
    author_did text NOT NULL,
    title text NOT NULL,
    body text,
    body_format text DEFAULT 'markdown'::text NOT NULL,
    document_type text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    previous_version_uri text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    invalidated_at timestamp with time zone
);


--
-- Name: match_suggestion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_suggestion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_did text NOT NULL,
    target_did text NOT NULL,
    match_type text DEFAULT 'cooperative'::text NOT NULL,
    score numeric(5,4) NOT NULL,
    reason jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dismissed_at timestamp with time zone,
    acted_on_at timestamp with time zone
);


--
-- Name: meeting_record; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_record (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uri text,
    cid text,
    cooperative_did text NOT NULL,
    author_did text NOT NULL,
    title text NOT NULL,
    meeting_date timestamp with time zone NOT NULL,
    meeting_type text NOT NULL,
    attendee_dids text[] DEFAULT '{}'::text[] NOT NULL,
    quorum_met boolean,
    resolutions text[] DEFAULT '{}'::text[] NOT NULL,
    minutes text,
    certified_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    invalidated_at timestamp with time zone
);


--
-- Name: member_class; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_class (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    name text NOT NULL,
    description text,
    vote_weight integer DEFAULT 1 NOT NULL,
    quorum_weight numeric(5,2) DEFAULT 1 NOT NULL,
    board_seats integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT member_class_vote_weight_check CHECK (((vote_weight >= 1) AND (vote_weight <= 100)))
);


--
-- Name: member_notice; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_notice (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uri text,
    cid text,
    cooperative_did text NOT NULL,
    author_did text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    notice_type text NOT NULL,
    target_audience text NOT NULL,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    invalidated_at timestamp with time zone
);


--
-- Name: membership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membership (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    member_did text NOT NULL,
    cooperative_did text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    member_record_uri text,
    member_record_cid text,
    approval_record_uri text,
    approval_record_cid text,
    invited_by_did text,
    invitation_id uuid,
    joined_at timestamp with time zone,
    departed_at timestamp with time zone,
    status_reason text,
    directory_visible boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    invalidated_at timestamp with time zone,
    invalidated_by text,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    member_class text,
    CONSTRAINT membership_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text, 'departed'::text])))
);


--
-- Name: membership_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membership_role (
    membership_id uuid NOT NULL,
    role text NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mention; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mention (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    source_type text NOT NULL,
    source_id text NOT NULL,
    mentioned_did text NOT NULL,
    mentioned_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    CONSTRAINT mention_source_type_check CHECK ((source_type = ANY (ARRAY['post'::text, 'task'::text, 'proposal'::text, 'expense'::text, 'agreement'::text])))
);


--
-- Name: model_provider_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_provider_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    provider_id text NOT NULL,
    display_name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    credentials_enc text NOT NULL,
    allowed_models jsonb DEFAULT '[]'::jsonb NOT NULL,
    config jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text,
    recipient_did text NOT NULL,
    title text NOT NULL,
    body text,
    category text DEFAULT 'automation'::text NOT NULL,
    source_type text,
    source_id text,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_preference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preference (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    member_did text NOT NULL,
    channel text DEFAULT 'in_app'::text NOT NULL,
    event_types text[] DEFAULT '{}'::text[] NOT NULL,
    digest_frequency text DEFAULT 'immediate'::text,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_pref_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text, 'digest'::text]))),
    CONSTRAINT notification_pref_digest_check CHECK ((digest_frequency = ANY (ARRAY['immediate'::text, 'daily'::text, 'weekly'::text])))
);


--
-- Name: oauth_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_session (
    did text NOT NULL,
    token_set jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: oauth_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_state (
    key text NOT NULL,
    state jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: onboarding_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    probation_duration_days integer DEFAULT 90 NOT NULL,
    require_training boolean DEFAULT false,
    require_buy_in boolean DEFAULT false,
    buy_in_amount numeric(18,2) DEFAULT 0,
    buddy_system_enabled boolean DEFAULT false,
    milestones jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: onboarding_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    member_did text NOT NULL,
    status text DEFAULT 'in_progress'::text NOT NULL,
    probation_starts_at timestamp with time zone NOT NULL,
    probation_ends_at timestamp with time zone NOT NULL,
    buddy_did text,
    training_completed boolean DEFAULT false,
    training_completed_at timestamp with time zone,
    buy_in_completed boolean DEFAULT false,
    buy_in_completed_at timestamp with time zone,
    milestones_completed jsonb DEFAULT '[]'::jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: onboarding_review; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_review (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    member_did text NOT NULL,
    reviewer_did text NOT NULL,
    review_type text NOT NULL,
    outcome text NOT NULL,
    comments text,
    milestone_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: operator_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    operator_did text NOT NULL,
    operation text NOT NULL,
    collection text NOT NULL,
    rkey text,
    record_uri text,
    record_cid text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: patronage_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patronage_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    stakeholder_class text,
    metric_type text NOT NULL,
    metric_weights jsonb,
    cash_payout_pct integer DEFAULT 20 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: patronage_record; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patronage_record (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    fiscal_period_id text NOT NULL,
    member_did text NOT NULL,
    stakeholder_class text,
    metric_value numeric(18,4) NOT NULL,
    patronage_ratio numeric(10,8) NOT NULL,
    total_allocation numeric(18,2) NOT NULL,
    cash_amount numeric(18,2) NOT NULL,
    retained_amount numeric(18,2) NOT NULL,
    status text DEFAULT 'calculated'::text NOT NULL,
    approved_at timestamp with time zone,
    distributed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_provider_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_provider_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    provider_id text NOT NULL,
    display_name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    credentials_enc text NOT NULL,
    webhook_secret_enc text,
    config jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pds_firehose_cursor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pds_firehose_cursor (
    subscriber_id text NOT NULL,
    last_global_seq bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pds_record; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pds_record (
    uri text NOT NULL,
    did text NOT NULL,
    collection text NOT NULL,
    rkey text NOT NULL,
    cid text NOT NULL,
    content jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: post; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    author_did text NOT NULL,
    body text NOT NULL,
    body_format text DEFAULT 'markdown'::text NOT NULL,
    parent_post_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    edited_at timestamp with time zone,
    invalidated_at timestamp with time zone,
    invalidated_by text,
    post_search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, COALESCE(body, ''::text))) STORED,
    CONSTRAINT post_body_format_check CHECK ((body_format = ANY (ARRAY['plain'::text, 'markdown'::text]))),
    CONSTRAINT post_status_check CHECK ((status = ANY (ARRAY['active'::text, 'edited'::text, 'deleted'::text])))
);


--
-- Name: private_record; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.private_record (
    did text NOT NULL,
    collection text NOT NULL,
    rkey text NOT NULL,
    record jsonb NOT NULL,
    created_by text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: permissioned_notification_registration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissioned_notification_registration (
    space_ref_key text NOT NULL,
    arbiter_did text NOT NULL,
    space_key text NOT NULL,
    expected_space_type text,
    endpoint text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: permissioned_repo_account_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissioned_repo_account_state (
    repo_did text NOT NULL,
    source_host text NOT NULL,
    active boolean NOT NULL,
    status text,
    event_sequence double precision NOT NULL,
    event_time timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: permissioned_repo_cursor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissioned_repo_cursor (
    space_ref_key text NOT NULL,
    arbiter_did text NOT NULL,
    space_key text NOT NULL,
    expected_space_type text,
    repo_did text NOT NULL,
    repo_host text,
    revision text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: permissioned_repo_record; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissioned_repo_record (
    space_ref_key text NOT NULL,
    repo_did text NOT NULL,
    collection text NOT NULL,
    rkey text NOT NULL,
    cid text NOT NULL,
    record jsonb NOT NULL,
    source_revision text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: procurement_demand; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procurement_demand (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id text NOT NULL,
    cooperative_did text NOT NULL,
    quantity integer NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: procurement_group; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procurement_group (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    network_did text NOT NULL,
    title text NOT NULL,
    description text,
    category text,
    target_quantity integer,
    deadline timestamp with time zone,
    status text DEFAULT 'open'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT procurement_group_status_check CHECK ((status = ANY (ARRAY['open'::text, 'collecting'::text, 'negotiating'::text, 'ordered'::text, 'delivered'::text, 'cancelled'::text])))
);


--
-- Name: profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_did text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    display_name text NOT NULL,
    avatar_cid text,
    bio text,
    verified boolean DEFAULT false NOT NULL,
    last_renamed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    invalidated_at timestamp with time zone,
    discoverable boolean DEFAULT false NOT NULL,
    profile_bio_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, COALESCE(bio, ''::text))) STORED,
    dismissed_get_started boolean DEFAULT false NOT NULL
);


--
-- Name: proposal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uri text,
    cid text,
    cooperative_did text NOT NULL,
    author_did text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    body_format text DEFAULT 'markdown'::text NOT NULL,
    voting_type text DEFAULT 'binary'::text NOT NULL,
    options jsonb,
    quorum_type text DEFAULT 'simpleMajority'::text NOT NULL,
    quorum_basis text DEFAULT 'votesCast'::text NOT NULL,
    quorum_threshold numeric(4,3),
    status text DEFAULT 'draft'::text NOT NULL,
    outcome text,
    opens_at timestamp with time zone,
    closes_at timestamp with time zone,
    resolved_at timestamp with time zone,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    meeting_event text,
    full_document text,
    discussion_thread text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text NOT NULL,
    invalidated_at timestamp with time zone,
    invalidated_by text,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    class_quorum_rules jsonb,
    CONSTRAINT proposal_outcome_check CHECK (((outcome IS NULL) OR (outcome = ANY (ARRAY['passed'::text, 'failed'::text, 'no_quorum'::text, 'class_quorum_not_met'::text])))),
    CONSTRAINT proposal_quorum_basis_check CHECK ((quorum_basis = ANY (ARRAY['votesCast'::text, 'totalMembers'::text]))),
    CONSTRAINT proposal_quorum_type_check CHECK ((quorum_type = ANY (ARRAY['simpleMajority'::text, 'superMajority'::text, 'unanimous'::text, 'custom'::text]))),
    CONSTRAINT proposal_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text, 'resolved'::text, 'withdrawn'::text]))),
    CONSTRAINT proposal_voting_type_check CHECK ((voting_type = ANY (ARRAY['binary'::text, 'approval'::text, 'ranked'::text])))
);


--
-- Name: public_governance_anchor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_governance_anchor (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    proposal_id uuid NOT NULL,
    anchor_uri text NOT NULL,
    anchor_cid text NOT NULL,
    status text NOT NULL,
    outcome text,
    opened_at timestamp with time zone,
    closed_at timestamp with time zone,
    resolved_at timestamp with time zone,
    anchor_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT public_governance_anchor_outcome_check CHECK (((outcome IS NULL) OR (outcome = ANY (ARRAY['passed'::text, 'failed'::text, 'no_quorum'::text, 'class_quorum_not_met'::text, 'archived'::text])))),
    CONSTRAINT public_governance_anchor_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'resolved'::text, 'withdrawn'::text, 'archived'::text]))),
    CONSTRAINT public_governance_anchor_version_check CHECK ((anchor_version = 1))
);


--
-- Name: registered_lexicon; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registered_lexicon (
    nsid text NOT NULL,
    lexicon_doc jsonb NOT NULL,
    field_mappings jsonb,
    registered_by text NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: report_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    template_id text,
    report_type text NOT NULL,
    title text NOT NULL,
    data jsonb NOT NULL,
    generated_by text NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    period_start timestamp with time zone,
    period_end timestamp with time zone
);


--
-- Name: report_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_template (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    name text NOT NULL,
    report_type text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_template_type_check CHECK ((report_type = ANY (ARRAY['annual'::text, 'board_packet'::text, 'equity_statement'::text, 'patronage'::text, 'commerce'::text, 'custom'::text])))
);


--
-- Name: resource_booking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_booking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resource_id text NOT NULL,
    requesting_did text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    purpose text,
    status text DEFAULT 'pending'::text NOT NULL,
    cost_total numeric(18,2),
    approved_by text,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT resource_booking_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: revenue_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revenue_entry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    project_id text,
    title text NOT NULL,
    description text,
    amount numeric(18,2) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    source text,
    source_reference text,
    recorded_by text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: role_definition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_definition (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    name text NOT NULL,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    inherits text[] DEFAULT '{}'::text[] NOT NULL,
    is_builtin boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schedule_shift; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_shift (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    title text NOT NULL,
    description text,
    assigned_did text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    recurrence text,
    location text,
    status text DEFAULT 'open'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT schedule_shift_status_check CHECK ((status = ANY (ARRAY['open'::text, 'assigned'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: script_execution_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.script_execution_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    script_id uuid NOT NULL,
    cooperative_did text NOT NULL,
    trigger_type text NOT NULL,
    trigger_detail text,
    duration_ms integer NOT NULL,
    status text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_script_exec_status CHECK ((status = ANY (ARRAY['success'::text, 'error'::text, 'timeout'::text])))
);


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid text NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp with time zone NOT NULL
);


--
-- Name: shared_resource; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_resource (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    title text NOT NULL,
    description text,
    resource_type text NOT NULL,
    availability_schedule jsonb,
    location text,
    cost_per_unit numeric(18,2),
    cost_unit text,
    uri text,
    cid text,
    status text DEFAULT 'available'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shared_resource_status_check CHECK ((status = ANY (ARRAY['available'::text, 'reserved'::text, 'unavailable'::text]))),
    CONSTRAINT shared_resource_type_check CHECK ((resource_type = ANY (ARRAY['equipment'::text, 'space'::text, 'expertise'::text, 'vehicle'::text, 'other'::text])))
);


--
-- Name: signature_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signature_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agreement_uri text NOT NULL,
    agreement_title text,
    signer_did text NOT NULL,
    cooperative_did text NOT NULL,
    requester_did text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    response_message text,
    signature_uri text,
    signature_cid text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT signature_request_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'signed'::text, 'rejected'::text, 'cancelled'::text, 'expired'::text, 'retracted'::text])))
);


--
-- Name: space_credential; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.space_credential (
    space_ref_key text NOT NULL,
    arbiter_did text NOT NULL,
    space_key text NOT NULL,
    expected_space_type text,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: spaces_consumer_cursor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spaces_consumer_cursor (
    arbiter_did text NOT NULL,
    space_key text NOT NULL,
    expected_space_type text,
    member_did text NOT NULL,
    cursor text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stakeholder_interest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stakeholder_interest (
    uri text NOT NULL,
    did text NOT NULL,
    rkey text NOT NULL,
    project_uri text NOT NULL,
    interests jsonb DEFAULT '[]'::jsonb NOT NULL,
    contributions jsonb DEFAULT '[]'::jsonb NOT NULL,
    constraints jsonb DEFAULT '[]'::jsonb NOT NULL,
    red_lines jsonb DEFAULT '[]'::jsonb NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stakeholder_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stakeholder_terms (
    uri text NOT NULL,
    did text NOT NULL,
    rkey text NOT NULL,
    agreement_uri text NOT NULL,
    stakeholder_did text NOT NULL,
    stakeholder_type text NOT NULL,
    stakeholder_class text,
    contributions jsonb DEFAULT '[]'::jsonb NOT NULL,
    financial_terms jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_terms jsonb DEFAULT '{}'::jsonb NOT NULL,
    governance_rights jsonb DEFAULT '{}'::jsonb NOT NULL,
    exit_terms jsonb DEFAULT '{}'::jsonb NOT NULL,
    signed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_config (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    project_id text,
    title text NOT NULL,
    description text,
    status text DEFAULT 'backlog'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    assignee_dids text[] DEFAULT '{}'::text[],
    due_date timestamp with time zone,
    labels text[] DEFAULT '{}'::text[],
    linked_proposal_id text,
    uri text,
    cid text,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_priority_check CHECK ((priority = ANY (ARRAY['urgent'::text, 'high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT task_status_check CHECK ((status = ANY (ARRAY['backlog'::text, 'todo'::text, 'in_progress'::text, 'in_review'::text, 'done'::text, 'cancelled'::text])))
);


--
-- Name: task_checklist_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_checklist_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id text NOT NULL,
    title text NOT NULL,
    completed boolean DEFAULT false,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_label; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_label (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6366f1'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tax_form_1099_patr; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_form_1099_patr (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    fiscal_period_id text NOT NULL,
    member_did text NOT NULL,
    tax_year integer NOT NULL,
    patronage_dividends numeric(18,2) NOT NULL,
    per_unit_retain_allocated numeric(18,2) DEFAULT 0 NOT NULL,
    qualified_payments numeric(18,2) DEFAULT 0 NOT NULL,
    cash_paid numeric(18,2) DEFAULT 0 NOT NULL,
    cash_deadline timestamp with time zone NOT NULL,
    cash_paid_at timestamp with time zone,
    generation_status text DEFAULT 'pending'::text NOT NULL,
    generated_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: thread; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thread (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    title text,
    thread_type text DEFAULT 'discussion'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text NOT NULL,
    invalidated_at timestamp with time zone,
    invalidated_by text,
    CONSTRAINT thread_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'archived'::text]))),
    CONSTRAINT thread_type_check CHECK ((thread_type = ANY (ARRAY['discussion'::text, 'direct'::text, 'announcement'::text])))
);


--
-- Name: thread_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thread_member (
    thread_id uuid NOT NULL,
    entity_did text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    last_read_at timestamp with time zone
);


--
-- Name: time_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    member_did text NOT NULL,
    task_id text,
    project_id text,
    description text,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    duration_minutes integer,
    status text DEFAULT 'draft'::text NOT NULL,
    approved_by text,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT time_entry_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: trigger_execution_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trigger_execution_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger_id uuid NOT NULL,
    cooperative_did text NOT NULL,
    event_type text NOT NULL,
    event_data jsonb NOT NULL,
    conditions_matched boolean NOT NULL,
    actions_executed jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer
);


--
-- Name: vote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vote (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uri text,
    cid text,
    proposal_id uuid NOT NULL,
    proposal_uri text NOT NULL,
    proposal_cid text NOT NULL,
    voter_did text NOT NULL,
    choice text NOT NULL,
    rationale text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    retracted_at timestamp with time zone,
    retracted_by text,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    vote_weight integer DEFAULT 1 NOT NULL
);


--
-- Name: webhook_delivery_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_delivery_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_endpoint_id text NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    response_status integer,
    response_body text,
    attempts integer DEFAULT 1 NOT NULL,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: webhook_endpoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_endpoint (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cooperative_did text NOT NULL,
    url text NOT NULL,
    event_types text[] NOT NULL,
    secret text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: governance_label seq; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_label ALTER COLUMN seq SET DEFAULT nextval('public.governance_label_seq_seq'::regclass);


--
-- Name: admin_officer admin_officer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_officer
    ADD CONSTRAINT admin_officer_pkey PRIMARY KEY (id);


--
-- Name: agent_config agent_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_config
    ADD CONSTRAINT agent_config_pkey PRIMARY KEY (id);


--
-- Name: agent_message agent_message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_message
    ADD CONSTRAINT agent_message_pkey PRIMARY KEY (id);


--
-- Name: agent_session agent_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_session
    ADD CONSTRAINT agent_session_pkey PRIMARY KEY (id);


--
-- Name: agent_trigger agent_trigger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_trigger
    ADD CONSTRAINT agent_trigger_pkey PRIMARY KEY (id);


--
-- Name: agent_usage agent_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_usage
    ADD CONSTRAINT agent_usage_pkey PRIMARY KEY (id);


--
-- Name: agreement_revision agreement_revision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_revision
    ADD CONSTRAINT agreement_revision_pkey PRIMARY KEY (id);


--
-- Name: agreement_signature agreement_signature_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_signature
    ADD CONSTRAINT agreement_signature_pkey PRIMARY KEY (id);


--
-- Name: agreement_signature agreement_signature_uri_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_signature
    ADD CONSTRAINT agreement_signature_uri_key UNIQUE (uri);


--
-- Name: agreement_template agreement_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_template
    ADD CONSTRAINT agreement_template_pkey PRIMARY KEY (id);


--
-- Name: api_token api_token_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_token
    ADD CONSTRAINT api_token_pkey PRIMARY KEY (id);


--
-- Name: api_token api_token_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_token
    ADD CONSTRAINT api_token_token_hash_key UNIQUE (token_hash);


--
-- Name: auth_credential auth_credential_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_credential
    ADD CONSTRAINT auth_credential_pkey PRIMARY KEY (id);


--
-- Name: auth_credential auth_credential_type_identifier_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_credential
    ADD CONSTRAINT auth_credential_type_identifier_unique UNIQUE (credential_type, identifier);


--
-- Name: calendar_event_ref calendar_event_ref_event_uri_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_ref
    ADD CONSTRAINT calendar_event_ref_event_uri_key UNIQUE (event_uri);


--
-- Name: calendar_event_ref calendar_event_ref_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_ref
    ADD CONSTRAINT calendar_event_ref_pkey PRIMARY KEY (id);


--
-- Name: capital_account capital_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capital_account
    ADD CONSTRAINT capital_account_pkey PRIMARY KEY (id);


--
-- Name: capital_account_transaction capital_account_transaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capital_account_transaction
    ADD CONSTRAINT capital_account_transaction_pkey PRIMARY KEY (id);


--
-- Name: collaborative_contribution collaborative_contribution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collaborative_contribution
    ADD CONSTRAINT collaborative_contribution_pkey PRIMARY KEY (id);


--
-- Name: collaborative_project collaborative_project_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collaborative_project
    ADD CONSTRAINT collaborative_project_pkey PRIMARY KEY (id);


--
-- Name: commerce_listing commerce_listing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_listing
    ADD CONSTRAINT commerce_listing_pkey PRIMARY KEY (id);


--
-- Name: commerce_need commerce_need_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_need
    ADD CONSTRAINT commerce_need_pkey PRIMARY KEY (id);


--
-- Name: compliance_item compliance_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_item
    ADD CONSTRAINT compliance_item_pkey PRIMARY KEY (id);


--
-- Name: connection_binding connection_binding_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_binding
    ADD CONSTRAINT connection_binding_pkey PRIMARY KEY (uri);


--
-- Name: connector_config connector_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_config
    ADD CONSTRAINT connector_config_pkey PRIMARY KEY (id);


--
-- Name: connector_field_mapping connector_field_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_field_mapping
    ADD CONSTRAINT connector_field_mapping_pkey PRIMARY KEY (id);


--
-- Name: connector_sync_log connector_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_sync_log
    ADD CONSTRAINT connector_sync_log_pkey PRIMARY KEY (id);


--
-- Name: cooperative_link cooperative_link_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_link
    ADD CONSTRAINT cooperative_link_pkey PRIMARY KEY (id);


--
-- Name: cooperative_profile cooperative_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_profile
    ADD CONSTRAINT cooperative_profile_pkey PRIMARY KEY (entity_did);


--
-- Name: cooperative_profile cooperative_profile_uri_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_profile
    ADD CONSTRAINT cooperative_profile_uri_key UNIQUE (uri);


--
-- Name: cooperative_script cooperative_script_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_script
    ADD CONSTRAINT cooperative_script_pkey PRIMARY KEY (id);


--
-- Name: data_deletion_request data_deletion_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_deletion_request
    ADD CONSTRAINT data_deletion_request_pkey PRIMARY KEY (id);


--
-- Name: delegation delegation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegation
    ADD CONSTRAINT delegation_pkey PRIMARY KEY (uri);


--
-- Name: desired_outcome desired_outcome_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desired_outcome
    ADD CONSTRAINT desired_outcome_pkey PRIMARY KEY (uri);


--
-- Name: did_rotation_history did_rotation_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.did_rotation_history
    ADD CONSTRAINT did_rotation_history_pkey PRIMARY KEY (id);


--
-- Name: entity entity_handle_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity
    ADD CONSTRAINT entity_handle_key UNIQUE (handle);


--
-- Name: entity_key entity_key_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_key
    ADD CONSTRAINT entity_key_pkey PRIMARY KEY (id);


--
-- Name: entity entity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity
    ADD CONSTRAINT entity_pkey PRIMARY KEY (did);


--
-- Name: expense_category expense_category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_category
    ADD CONSTRAINT expense_category_pkey PRIMARY KEY (id);


--
-- Name: expense expense_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense
    ADD CONSTRAINT expense_pkey PRIMARY KEY (id);


--
-- Name: external_connection external_connection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_connection
    ADD CONSTRAINT external_connection_pkey PRIMARY KEY (uri);


--
-- Name: fact_log fact_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fact_log
    ADD CONSTRAINT fact_log_pkey PRIMARY KEY (id);


--
-- Name: fact_log_redaction fact_log_redaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fact_log_redaction
    ADD CONSTRAINT fact_log_redaction_pkey PRIMARY KEY (fact_log_id);


--
-- Name: fiscal_period fiscal_period_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_period
    ADD CONSTRAINT fiscal_period_pkey PRIMARY KEY (id);


--
-- Name: frontpage_post_ref frontpage_post_ref_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.frontpage_post_ref
    ADD CONSTRAINT frontpage_post_ref_pkey PRIMARY KEY (id);


--
-- Name: frontpage_post_ref frontpage_post_ref_post_uri_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.frontpage_post_ref
    ADD CONSTRAINT frontpage_post_ref_post_uri_key UNIQUE (post_uri);


--
-- Name: funding_campaign funding_campaign_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_campaign
    ADD CONSTRAINT funding_campaign_pkey PRIMARY KEY (uri);


--
-- Name: funding_pledge funding_pledge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_pledge
    ADD CONSTRAINT funding_pledge_pkey PRIMARY KEY (uri);


--
-- Name: governance_label governance_label_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_label
    ADD CONSTRAINT governance_label_pkey PRIMARY KEY (id);


--
-- Name: hook_dead_letter hook_dead_letter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hook_dead_letter
    ADD CONSTRAINT hook_dead_letter_pkey PRIMARY KEY (id);


--
-- Name: intercoop_agreement intercoop_agreement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intercoop_agreement
    ADD CONSTRAINT intercoop_agreement_pkey PRIMARY KEY (id);


--
-- Name: interest_map interest_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_map
    ADD CONSTRAINT interest_map_pkey PRIMARY KEY (uri);


--
-- Name: invitation invitation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_pkey PRIMARY KEY (id);


--
-- Name: invitation invitation_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_token_key UNIQUE (token);


--
-- Name: legal_document legal_document_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_document
    ADD CONSTRAINT legal_document_pkey PRIMARY KEY (id);


--
-- Name: agreement master_agreement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement
    ADD CONSTRAINT master_agreement_pkey PRIMARY KEY (uri);


--
-- Name: match_suggestion match_suggestion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_suggestion
    ADD CONSTRAINT match_suggestion_pkey PRIMARY KEY (id);


--
-- Name: meeting_record meeting_record_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_record
    ADD CONSTRAINT meeting_record_pkey PRIMARY KEY (id);


--
-- Name: member_class member_class_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_class
    ADD CONSTRAINT member_class_pkey PRIMARY KEY (id);


--
-- Name: member_notice member_notice_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_notice
    ADD CONSTRAINT member_notice_pkey PRIMARY KEY (id);


--
-- Name: membership membership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT membership_pkey PRIMARY KEY (id);


--
-- Name: membership_role membership_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_role
    ADD CONSTRAINT membership_role_pkey PRIMARY KEY (membership_id, role);


--
-- Name: mention mention_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mention
    ADD CONSTRAINT mention_pkey PRIMARY KEY (id);


--
-- Name: model_provider_config model_provider_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_provider_config
    ADD CONSTRAINT model_provider_config_pkey PRIMARY KEY (id);


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (id);


--
-- Name: notification_preference notification_preference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preference
    ADD CONSTRAINT notification_preference_pkey PRIMARY KEY (id);


--
-- Name: oauth_session oauth_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_session
    ADD CONSTRAINT oauth_session_pkey PRIMARY KEY (did);


--
-- Name: oauth_state oauth_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_state
    ADD CONSTRAINT oauth_state_pkey PRIMARY KEY (key);


--
-- Name: onboarding_config onboarding_config_cooperative_did_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_config
    ADD CONSTRAINT onboarding_config_cooperative_did_key UNIQUE (cooperative_did);


--
-- Name: onboarding_config onboarding_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_config
    ADD CONSTRAINT onboarding_config_pkey PRIMARY KEY (id);


--
-- Name: onboarding_progress onboarding_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_progress
    ADD CONSTRAINT onboarding_progress_pkey PRIMARY KEY (id);


--
-- Name: onboarding_review onboarding_review_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_review
    ADD CONSTRAINT onboarding_review_pkey PRIMARY KEY (id);


--
-- Name: operator_audit_log operator_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_audit_log
    ADD CONSTRAINT operator_audit_log_pkey PRIMARY KEY (id);


--
-- Name: patronage_config patronage_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patronage_config
    ADD CONSTRAINT patronage_config_pkey PRIMARY KEY (id);


--
-- Name: patronage_record patronage_record_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patronage_record
    ADD CONSTRAINT patronage_record_pkey PRIMARY KEY (id);


--
-- Name: payment_provider_config payment_provider_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_provider_config
    ADD CONSTRAINT payment_provider_config_pkey PRIMARY KEY (id);


--
-- Name: pds_firehose_cursor pds_firehose_cursor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pds_firehose_cursor
    ADD CONSTRAINT pds_firehose_cursor_pkey PRIMARY KEY (subscriber_id);


--
-- Name: pds_record pds_record_did_collection_rkey_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pds_record
    ADD CONSTRAINT pds_record_did_collection_rkey_unique UNIQUE (did, collection, rkey);


--
-- Name: pds_record pds_record_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pds_record
    ADD CONSTRAINT pds_record_pkey PRIMARY KEY (uri);


--
-- Name: permissioned_notification_registration permissioned_notification_registration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissioned_notification_registration
    ADD CONSTRAINT permissioned_notification_registration_pkey PRIMARY KEY (space_ref_key, endpoint);


--
-- Name: permissioned_repo_account_state permissioned_repo_account_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissioned_repo_account_state
    ADD CONSTRAINT permissioned_repo_account_state_pkey PRIMARY KEY (repo_did, source_host);


--
-- Name: permissioned_repo_cursor permissioned_repo_cursor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissioned_repo_cursor
    ADD CONSTRAINT permissioned_repo_cursor_pkey PRIMARY KEY (space_ref_key, repo_did);


--
-- Name: permissioned_repo_record permissioned_repo_record_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissioned_repo_record
    ADD CONSTRAINT permissioned_repo_record_pkey PRIMARY KEY (space_ref_key, repo_did, collection, rkey);


--
-- Name: post post_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post
    ADD CONSTRAINT post_pkey PRIMARY KEY (id);


--
-- Name: private_record private_record_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_record
    ADD CONSTRAINT private_record_pkey PRIMARY KEY (did, collection, rkey);


--
-- Name: procurement_demand procurement_demand_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_demand
    ADD CONSTRAINT procurement_demand_pkey PRIMARY KEY (id);


--
-- Name: procurement_group procurement_group_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_group
    ADD CONSTRAINT procurement_group_pkey PRIMARY KEY (id);


--
-- Name: profile profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile
    ADD CONSTRAINT profile_pkey PRIMARY KEY (id);


--
-- Name: proposal proposal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal
    ADD CONSTRAINT proposal_pkey PRIMARY KEY (id);


--
-- Name: proposal proposal_uri_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal
    ADD CONSTRAINT proposal_uri_key UNIQUE (uri);


--
-- Name: public_governance_anchor public_governance_anchor_anchor_uri_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_governance_anchor
    ADD CONSTRAINT public_governance_anchor_anchor_uri_key UNIQUE (anchor_uri);


--
-- Name: public_governance_anchor public_governance_anchor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_governance_anchor
    ADD CONSTRAINT public_governance_anchor_pkey PRIMARY KEY (id);


--
-- Name: public_governance_anchor public_governance_anchor_proposal_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_governance_anchor
    ADD CONSTRAINT public_governance_anchor_proposal_id_key UNIQUE (proposal_id);


--
-- Name: registered_lexicon registered_lexicon_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registered_lexicon
    ADD CONSTRAINT registered_lexicon_pkey PRIMARY KEY (nsid);


--
-- Name: report_snapshot report_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_snapshot
    ADD CONSTRAINT report_snapshot_pkey PRIMARY KEY (id);


--
-- Name: report_template report_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_template
    ADD CONSTRAINT report_template_pkey PRIMARY KEY (id);


--
-- Name: resource_booking resource_booking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_booking
    ADD CONSTRAINT resource_booking_pkey PRIMARY KEY (id);


--
-- Name: revenue_entry revenue_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenue_entry
    ADD CONSTRAINT revenue_entry_pkey PRIMARY KEY (id);


--
-- Name: role_definition role_definition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_definition
    ADD CONSTRAINT role_definition_pkey PRIMARY KEY (id);


--
-- Name: schedule_shift schedule_shift_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_shift
    ADD CONSTRAINT schedule_shift_pkey PRIMARY KEY (id);


--
-- Name: script_execution_log script_execution_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.script_execution_log
    ADD CONSTRAINT script_execution_log_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: shared_resource shared_resource_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_resource
    ADD CONSTRAINT shared_resource_pkey PRIMARY KEY (id);


--
-- Name: signature_request signature_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signature_request
    ADD CONSTRAINT signature_request_pkey PRIMARY KEY (id);


--
-- Name: space_credential space_credential_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_credential
    ADD CONSTRAINT space_credential_pkey PRIMARY KEY (space_ref_key);


--
-- Name: spaces_consumer_cursor spaces_consumer_cursor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spaces_consumer_cursor
    ADD CONSTRAINT spaces_consumer_cursor_pkey PRIMARY KEY (arbiter_did, space_key, member_did);


--
-- Name: stakeholder_interest stakeholder_interest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stakeholder_interest
    ADD CONSTRAINT stakeholder_interest_pkey PRIMARY KEY (uri);


--
-- Name: stakeholder_terms stakeholder_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stakeholder_terms
    ADD CONSTRAINT stakeholder_terms_pkey PRIMARY KEY (uri);


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (key);


--
-- Name: task_checklist_item task_checklist_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_checklist_item
    ADD CONSTRAINT task_checklist_item_pkey PRIMARY KEY (id);


--
-- Name: task_label task_label_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_label
    ADD CONSTRAINT task_label_pkey PRIMARY KEY (id);


--
-- Name: task task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task
    ADD CONSTRAINT task_pkey PRIMARY KEY (id);


--
-- Name: tax_form_1099_patr tax_form_1099_patr_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_form_1099_patr
    ADD CONSTRAINT tax_form_1099_patr_pkey PRIMARY KEY (id);


--
-- Name: thread_member thread_member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread_member
    ADD CONSTRAINT thread_member_pkey PRIMARY KEY (thread_id, entity_did);


--
-- Name: thread thread_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread
    ADD CONSTRAINT thread_pkey PRIMARY KEY (id);


--
-- Name: time_entry time_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_pkey PRIMARY KEY (id);


--
-- Name: trigger_execution_log trigger_execution_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trigger_execution_log
    ADD CONSTRAINT trigger_execution_log_pkey PRIMARY KEY (id);


--
-- Name: tax_form_1099_patr uq_1099patr_period_member; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_form_1099_patr
    ADD CONSTRAINT uq_1099patr_period_member UNIQUE (fiscal_period_id, member_did);


--
-- Name: agent_usage uq_agent_usage_coop_agent_period; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_usage
    ADD CONSTRAINT uq_agent_usage_coop_agent_period UNIQUE (cooperative_did, agent_config_id, period);


--
-- Name: capital_account uq_capital_account_coop_member; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capital_account
    ADD CONSTRAINT uq_capital_account_coop_member UNIQUE (cooperative_did, member_did);


--
-- Name: collaborative_contribution uq_collaborative_contribution_project_coop_period; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collaborative_contribution
    ADD CONSTRAINT uq_collaborative_contribution_project_coop_period UNIQUE (project_id, cooperative_did, period_start);


--
-- Name: connector_config uq_connector_config_coop_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_config
    ADD CONSTRAINT uq_connector_config_coop_type UNIQUE (cooperative_did, connector_type);


--
-- Name: connector_field_mapping uq_connector_field_mapping_config_local; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_field_mapping
    ADD CONSTRAINT uq_connector_field_mapping_config_local UNIQUE (connector_config_id, local_field);


--
-- Name: expense_category uq_expense_category_coop_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_category
    ADD CONSTRAINT uq_expense_category_coop_name UNIQUE (cooperative_did, name);


--
-- Name: model_provider_config uq_mpc_coop_provider; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_provider_config
    ADD CONSTRAINT uq_mpc_coop_provider UNIQUE (cooperative_did, provider_id);


--
-- Name: notification_preference uq_notification_pref_coop_member_channel; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preference
    ADD CONSTRAINT uq_notification_pref_coop_member_channel UNIQUE (cooperative_did, member_did, channel);


--
-- Name: patronage_config uq_patronage_config_coop_class; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patronage_config
    ADD CONSTRAINT uq_patronage_config_coop_class UNIQUE (cooperative_did, stakeholder_class);


--
-- Name: patronage_record uq_patronage_record_period_member; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patronage_record
    ADD CONSTRAINT uq_patronage_record_period_member UNIQUE (fiscal_period_id, member_did, stakeholder_class);


--
-- Name: payment_provider_config uq_ppc_coop_provider; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_provider_config
    ADD CONSTRAINT uq_ppc_coop_provider UNIQUE (cooperative_did, provider_id);


--
-- Name: report_template uq_report_template_coop_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_template
    ADD CONSTRAINT uq_report_template_coop_name UNIQUE (cooperative_did, name);


--
-- Name: role_definition uq_role_definition_coop_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_definition
    ADD CONSTRAINT uq_role_definition_coop_name UNIQUE (cooperative_did, name);


--
-- Name: task_label uq_task_label_coop_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_label
    ADD CONSTRAINT uq_task_label_coop_name UNIQUE (cooperative_did, name);


--
-- Name: vote vote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote
    ADD CONSTRAINT vote_pkey PRIMARY KEY (id);


--
-- Name: vote vote_uri_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote
    ADD CONSTRAINT vote_uri_key UNIQUE (uri);


--
-- Name: webhook_delivery_log webhook_delivery_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_delivery_log
    ADD CONSTRAINT webhook_delivery_log_pkey PRIMARY KEY (id);


--
-- Name: webhook_endpoint webhook_endpoint_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoint
    ADD CONSTRAINT webhook_endpoint_pkey PRIMARY KEY (id);


--
-- Name: agreement_sig_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agreement_sig_active ON public.agreement_signature USING btree (agreement_id, signer_did) WHERE (retracted_at IS NULL);


--
-- Name: cooperative_link_initiator_target_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cooperative_link_initiator_target_unique ON public.cooperative_link USING btree (initiator_did, target_did);


--
-- Name: cooperative_link_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cooperative_link_status ON public.cooperative_link USING btree (status);


--
-- Name: delegation_coop_delegatee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX delegation_coop_delegatee ON public.delegation USING btree (did, delegatee_did, status);


--
-- Name: delegation_coop_delegator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX delegation_coop_delegator ON public.delegation USING btree (did, delegator_did, status);


--
-- Name: did_rotation_history_current_did_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX did_rotation_history_current_did_idx ON public.did_rotation_history USING btree (current_did);


--
-- Name: did_rotation_history_prior_did_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX did_rotation_history_prior_did_idx ON public.did_rotation_history USING btree (prior_did);


--
-- Name: space_credential_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX space_credential_expires_at_idx ON public.space_credential USING btree (expires_at);


--
-- Name: idx_1099patr_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_1099patr_coop ON public.tax_form_1099_patr USING btree (cooperative_did);


--
-- Name: idx_1099patr_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_1099patr_deadline ON public.tax_form_1099_patr USING btree (cash_deadline);


--
-- Name: idx_1099patr_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_1099patr_year ON public.tax_form_1099_patr USING btree (tax_year);


--
-- Name: idx_admin_officer_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_officer_coop ON public.admin_officer USING btree (cooperative_did);


--
-- Name: idx_admin_officer_did; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_officer_did ON public.admin_officer USING btree (officer_did);


--
-- Name: idx_agent_config_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_config_coop ON public.agent_config USING btree (cooperative_did);


--
-- Name: idx_agent_message_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_message_session ON public.agent_message USING btree (session_id);


--
-- Name: idx_agent_session_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_session_config ON public.agent_session USING btree (agent_config_id);


--
-- Name: idx_agent_session_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_session_user ON public.agent_session USING btree (user_did);


--
-- Name: idx_agent_trigger_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_trigger_event ON public.agent_trigger USING btree (cooperative_did, event_type);


--
-- Name: idx_agent_usage_coop_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_usage_coop_period ON public.agent_usage USING btree (cooperative_did, period);


--
-- Name: idx_agreement_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agreement_created_at ON public.agreement USING btree (created_at DESC);


--
-- Name: idx_agreement_did_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agreement_did_project ON public.agreement USING btree (did, project_uri);


--
-- Name: idx_agreement_revision_uri; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agreement_revision_uri ON public.agreement_revision USING btree (agreement_uri);


--
-- Name: idx_agreement_revision_uri_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agreement_revision_uri_number ON public.agreement_revision USING btree (agreement_uri, revision_number);


--
-- Name: idx_agreement_signature_uri_signer_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agreement_signature_uri_signer_active ON public.agreement_signature USING btree (agreement_uri, signer_did) WHERE (retracted_at IS NULL);


--
-- Name: idx_agreement_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agreement_status ON public.agreement USING btree (status);


--
-- Name: idx_agreement_template_cooperative_did; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agreement_template_cooperative_did ON public.agreement_template USING btree (cooperative_did);


--
-- Name: idx_api_token_coop_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_token_coop_user ON public.api_token USING btree (cooperative_did, user_did);


--
-- Name: idx_auth_credential_identifier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_credential_identifier ON public.auth_credential USING btree (identifier);


--
-- Name: idx_calendar_event_ref_proposal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_event_ref_proposal ON public.calendar_event_ref USING btree (proposal_uri);


--
-- Name: idx_cap_acct_txn_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cap_acct_txn_account ON public.capital_account_transaction USING btree (capital_account_id);


--
-- Name: idx_cap_acct_txn_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cap_acct_txn_coop ON public.capital_account_transaction USING btree (cooperative_did);


--
-- Name: idx_capital_account_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capital_account_coop ON public.capital_account USING btree (cooperative_did);


--
-- Name: idx_capital_account_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capital_account_member ON public.capital_account USING btree (member_did);


--
-- Name: idx_collaborative_contribution_coop_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collaborative_contribution_coop_created ON public.collaborative_contribution USING btree (cooperative_did, created_at);


--
-- Name: idx_collaborative_contribution_project_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collaborative_contribution_project_coop ON public.collaborative_contribution USING btree (project_id, cooperative_did);


--
-- Name: idx_collaborative_project_host_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collaborative_project_host_status ON public.collaborative_project USING btree (host_cooperative_did, status);


--
-- Name: idx_collaborative_project_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collaborative_project_status_created ON public.collaborative_project USING btree (status, created_at);


--
-- Name: idx_commerce_listing_category_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_listing_category_status ON public.commerce_listing USING btree (category, status);


--
-- Name: idx_commerce_listing_coop_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_listing_coop_category ON public.commerce_listing USING btree (cooperative_did, category);


--
-- Name: idx_commerce_listing_coop_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_listing_coop_status_created ON public.commerce_listing USING btree (cooperative_did, status, created_at);


--
-- Name: idx_commerce_need_category_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_need_category_status ON public.commerce_need USING btree (category, status);


--
-- Name: idx_commerce_need_coop_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_need_coop_status_created ON public.commerce_need USING btree (cooperative_did, status, created_at);


--
-- Name: idx_compliance_item_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_item_coop ON public.compliance_item USING btree (cooperative_did);


--
-- Name: idx_compliance_item_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_item_due ON public.compliance_item USING btree (due_date);


--
-- Name: idx_connection_binding_connection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connection_binding_connection ON public.connection_binding USING btree (connection_uri);


--
-- Name: idx_connection_binding_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connection_binding_project ON public.connection_binding USING btree (project_uri);


--
-- Name: idx_connector_config_coop_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connector_config_coop_enabled ON public.connector_config USING btree (cooperative_did, enabled);


--
-- Name: idx_connector_sync_log_config_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connector_sync_log_config_started ON public.connector_sync_log USING btree (connector_config_id, started_at);


--
-- Name: idx_coop_script_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coop_script_lookup ON public.cooperative_script USING btree (cooperative_did, enabled) WHERE (enabled = true);


--
-- Name: idx_desired_outcome_did_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_desired_outcome_did_project ON public.desired_outcome USING btree (did, project_uri);


--
-- Name: idx_desired_outcome_search_tsv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_desired_outcome_search_tsv ON public.desired_outcome USING gin (outcome_search_tsv);


--
-- Name: idx_entity_search_tsv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_search_tsv ON public.entity USING gin (entity_search_tsv);


--
-- Name: idx_expense_coop_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expense_coop_category ON public.expense USING btree (cooperative_did, category_id);


--
-- Name: idx_expense_coop_member_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expense_coop_member_created ON public.expense USING btree (cooperative_did, member_did, created_at);


--
-- Name: idx_expense_coop_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expense_coop_status_created ON public.expense USING btree (cooperative_did, status, created_at);


--
-- Name: idx_external_connection_did_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_external_connection_did_service ON public.external_connection USING btree (did, service);


--
-- Name: idx_fact_log_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fact_log_changed_at ON public.fact_log USING btree (changed_at);


--
-- Name: idx_fact_log_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fact_log_entity ON public.fact_log USING btree (entity_type, entity_id, changed_at);


--
-- Name: idx_fiscal_period_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fiscal_period_coop ON public.fiscal_period USING btree (cooperative_did);


--
-- Name: idx_frontpage_post_ref_proposal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_frontpage_post_ref_proposal ON public.frontpage_post_ref USING btree (proposal_uri);


--
-- Name: idx_funding_campaign_did_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_funding_campaign_did_status ON public.funding_campaign USING btree (did, status);


--
-- Name: idx_funding_pledge_campaign_uri; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_funding_pledge_campaign_uri ON public.funding_pledge USING btree (campaign_uri);


--
-- Name: idx_funding_pledge_payment_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_funding_pledge_payment_session ON public.funding_pledge USING btree (payment_session_id);


--
-- Name: idx_governance_label_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_label_seq ON public.governance_label USING btree (seq);


--
-- Name: idx_governance_label_src_did; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_label_src_did ON public.governance_label USING btree (src_did);


--
-- Name: idx_governance_label_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_label_subject ON public.governance_label USING btree (subject_uri);


--
-- Name: idx_governance_label_value; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_label_value ON public.governance_label USING btree (label_value);


--
-- Name: idx_hook_dead_letter_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hook_dead_letter_unresolved ON public.hook_dead_letter USING btree (created_at DESC) WHERE (resolved_at IS NULL);


--
-- Name: idx_intercoop_agreement_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_intercoop_agreement_active_unique ON public.intercoop_agreement USING btree (initiator_did, responder_did, title) WHERE (status <> ALL (ARRAY['completed'::text, 'cancelled'::text]));


--
-- Name: idx_intercoop_agreement_initiator_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_intercoop_agreement_initiator_status ON public.intercoop_agreement USING btree (initiator_did, status);


--
-- Name: idx_intercoop_agreement_responder_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_intercoop_agreement_responder_status ON public.intercoop_agreement USING btree (responder_did, status);


--
-- Name: idx_intercoop_agreement_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_intercoop_agreement_status_created ON public.intercoop_agreement USING btree (status, created_at);


--
-- Name: idx_interest_map_did_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interest_map_did_project ON public.interest_map USING btree (did, project_uri);


--
-- Name: idx_invitation_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitation_token ON public.invitation USING btree (token);


--
-- Name: idx_legal_document_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_document_coop ON public.legal_document USING btree (cooperative_did);


--
-- Name: idx_legal_document_prev; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_document_prev ON public.legal_document USING btree (previous_version_uri);


--
-- Name: idx_match_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_match_created_at ON public.match_suggestion USING btree (created_at);


--
-- Name: idx_match_user_active_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_match_user_active_score ON public.match_suggestion USING btree (user_did, score DESC) WHERE ((dismissed_at IS NULL) AND (acted_on_at IS NULL));


--
-- Name: idx_meeting_record_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_record_coop ON public.meeting_record USING btree (cooperative_did);


--
-- Name: idx_member_notice_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_notice_coop ON public.member_notice USING btree (cooperative_did);


--
-- Name: idx_membership_member_did; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_member_did ON public.membership USING btree (member_did) WHERE (invalidated_at IS NULL);


--
-- Name: idx_mention_coop_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mention_coop_source ON public.mention USING btree (cooperative_did, source_type, source_id);


--
-- Name: idx_mention_mentioned_did_read_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mention_mentioned_did_read_created ON public.mention USING btree (mentioned_did, read_at, created_at);


--
-- Name: idx_mpc_cooperative; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mpc_cooperative ON public.model_provider_config USING btree (cooperative_did);


--
-- Name: idx_notification_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_coop ON public.notification USING btree (cooperative_did, created_at);


--
-- Name: idx_notification_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_recipient ON public.notification USING btree (recipient_did, read, created_at);


--
-- Name: idx_oauth_state_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_state_expires_at ON public.oauth_state USING btree (expires_at);


--
-- Name: idx_operator_audit_log_coop_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_audit_log_coop_created ON public.operator_audit_log USING btree (cooperative_did, created_at);


--
-- Name: idx_patronage_config_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patronage_config_coop ON public.patronage_config USING btree (cooperative_did);


--
-- Name: idx_patronage_record_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patronage_record_coop ON public.patronage_record USING btree (cooperative_did);


--
-- Name: idx_patronage_record_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patronage_record_member ON public.patronage_record USING btree (member_did);


--
-- Name: idx_patronage_record_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patronage_record_period ON public.patronage_record USING btree (fiscal_period_id);


--
-- Name: idx_pds_record_collection_did; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pds_record_collection_did ON public.pds_record USING btree (collection, did);


--
-- Name: idx_pds_record_content_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pds_record_content_gin ON public.pds_record USING gin (content);


--
-- Name: idx_pds_record_indexed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pds_record_indexed_at ON public.pds_record USING btree (indexed_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_post_search_tsv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_search_tsv ON public.post USING gin (post_search_tsv);


--
-- Name: idx_ppc_cooperative; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppc_cooperative ON public.payment_provider_config USING btree (cooperative_did);


--
-- Name: idx_private_record_did_collection_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_private_record_did_collection_created ON public.private_record USING btree (did, collection, created_at);


--
-- Name: idx_procurement_demand_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_procurement_demand_coop ON public.procurement_demand USING btree (cooperative_did);


--
-- Name: idx_procurement_demand_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_procurement_demand_group ON public.procurement_demand USING btree (group_id);


--
-- Name: idx_procurement_group_network_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_procurement_group_network_status_created ON public.procurement_group USING btree (network_did, status, created_at);


--
-- Name: idx_profile_bio_tsv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_bio_tsv ON public.profile USING gin (profile_bio_tsv);


--
-- Name: idx_profile_discoverable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_discoverable ON public.profile USING btree (entity_did) WHERE (discoverable = true);


--
-- Name: idx_profile_entity_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_profile_entity_default ON public.profile USING btree (entity_did) WHERE ((is_default = true) AND (invalidated_at IS NULL));


--
-- Name: idx_proposal_coop_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposal_coop_status ON public.proposal USING btree (cooperative_did, status) WHERE (invalidated_at IS NULL);


--
-- Name: idx_proposal_uri; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposal_uri ON public.proposal USING btree (uri) WHERE ((uri IS NOT NULL) AND (invalidated_at IS NULL));


--
-- Name: idx_public_governance_anchor_coop_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_public_governance_anchor_coop_status ON public.public_governance_anchor USING btree (cooperative_did, status, updated_at);


--
-- Name: idx_report_snapshot_coop_type_generated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_snapshot_coop_type_generated ON public.report_snapshot USING btree (cooperative_did, report_type);


--
-- Name: idx_report_template_coop_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_template_coop_type ON public.report_template USING btree (cooperative_did, report_type);


--
-- Name: idx_resource_booking_requesting_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resource_booking_requesting_status ON public.resource_booking USING btree (requesting_did, status);


--
-- Name: idx_resource_booking_resource_starts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resource_booking_resource_starts ON public.resource_booking USING btree (resource_id, starts_at);


--
-- Name: idx_revenue_entry_coop_project_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_revenue_entry_coop_project_created ON public.revenue_entry USING btree (cooperative_did, project_id, created_at);


--
-- Name: idx_revenue_entry_coop_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_revenue_entry_coop_recorded ON public.revenue_entry USING btree (cooperative_did, recorded_at);


--
-- Name: idx_revenue_entry_coop_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_revenue_entry_coop_source ON public.revenue_entry USING btree (cooperative_did, source);


--
-- Name: idx_role_definition_coop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_definition_coop ON public.role_definition USING btree (cooperative_did);


--
-- Name: idx_schedule_shift_coop_assigned_starts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_shift_coop_assigned_starts ON public.schedule_shift USING btree (cooperative_did, assigned_did, starts_at);


--
-- Name: idx_schedule_shift_coop_starts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_shift_coop_starts ON public.schedule_shift USING btree (cooperative_did, starts_at);


--
-- Name: idx_schedule_shift_coop_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_shift_coop_status ON public.schedule_shift USING btree (cooperative_did, status);


--
-- Name: idx_script_exec_log; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_script_exec_log ON public.script_execution_log USING btree (cooperative_did, created_at DESC);


--
-- Name: idx_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_expire ON public.session USING btree (expire);


--
-- Name: idx_shared_resource_coop_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shared_resource_coop_status ON public.shared_resource USING btree (cooperative_did, status);


--
-- Name: idx_shared_resource_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shared_resource_type_status ON public.shared_resource USING btree (resource_type, status);


--
-- Name: idx_signature_request_agreement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signature_request_agreement ON public.signature_request USING btree (agreement_uri);


--
-- Name: idx_signature_request_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signature_request_pending ON public.signature_request USING btree (status, expires_at) WHERE (status = 'pending'::text);


--
-- Name: idx_signature_request_pending_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_signature_request_pending_unique ON public.signature_request USING btree (agreement_uri, signer_did) WHERE (status = 'pending'::text);


--
-- Name: idx_signature_request_signer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signature_request_signer ON public.signature_request USING btree (signer_did, status);


--
-- Name: idx_stakeholder_interest_did_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stakeholder_interest_did_project ON public.stakeholder_interest USING btree (did, project_uri);


--
-- Name: idx_stakeholder_terms_agreement_stakeholder_uri; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stakeholder_terms_agreement_stakeholder_uri ON public.stakeholder_terms USING btree (agreement_uri, stakeholder_did);


--
-- Name: idx_stakeholder_terms_agreement_uri; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stakeholder_terms_agreement_uri ON public.stakeholder_terms USING btree (agreement_uri);


--
-- Name: idx_task_checklist_item_task_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_checklist_item_task_sort ON public.task_checklist_item USING btree (task_id, sort_order);


--
-- Name: idx_task_coop_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_coop_created ON public.task USING btree (cooperative_did, created_at);


--
-- Name: idx_task_coop_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_coop_project ON public.task USING btree (cooperative_did, project_id);


--
-- Name: idx_task_coop_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_coop_status_created ON public.task USING btree (cooperative_did, status, created_at);


--
-- Name: idx_time_entry_coop_member_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entry_coop_member_created ON public.time_entry USING btree (cooperative_did, member_did, created_at);


--
-- Name: idx_time_entry_coop_project_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entry_coop_project_created ON public.time_entry USING btree (cooperative_did, project_id, created_at);


--
-- Name: idx_time_entry_coop_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entry_coop_task ON public.time_entry USING btree (cooperative_did, task_id);


--
-- Name: idx_trigger_execution_log_coop_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trigger_execution_log_coop_started ON public.trigger_execution_log USING btree (cooperative_did, started_at);


--
-- Name: idx_trigger_execution_log_trigger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trigger_execution_log_trigger ON public.trigger_execution_log USING btree (trigger_id);


--
-- Name: idx_webhook_delivery_log_endpoint_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_delivery_log_endpoint_created ON public.webhook_delivery_log USING btree (webhook_endpoint_id, created_at);


--
-- Name: idx_webhook_delivery_log_event_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_delivery_log_event_created ON public.webhook_delivery_log USING btree (event_type, created_at);


--
-- Name: idx_webhook_endpoint_coop_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_endpoint_coop_enabled ON public.webhook_endpoint USING btree (cooperative_did, enabled);


--
-- Name: member_class_coop_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX member_class_coop_name_unique ON public.member_class USING btree (cooperative_did, name);


--
-- Name: membership_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX membership_active_unique ON public.membership USING btree (member_did, cooperative_did) WHERE (invalidated_at IS NULL);


--
-- Name: onboarding_progress_coop_member_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX onboarding_progress_coop_member_unique ON public.onboarding_progress USING btree (cooperative_did, member_did);


--
-- Name: onboarding_progress_coop_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX onboarding_progress_coop_status ON public.onboarding_progress USING btree (cooperative_did, status);


--
-- Name: onboarding_review_coop_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX onboarding_review_coop_member ON public.onboarding_review USING btree (cooperative_did, member_did);


--
-- Name: uq_match_user_target; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_match_user_target ON public.match_suggestion USING btree (user_did, target_did);


--
-- Name: vote_proposal_voter_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vote_proposal_voter_active ON public.vote USING btree (proposal_id, voter_did) WHERE (retracted_at IS NULL);


--
-- Name: fact_log fact_log_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fact_log_immutable BEFORE DELETE OR UPDATE ON public.fact_log FOR EACH ROW EXECUTE FUNCTION public.prevent_fact_log_mutation();


--
-- Name: agent_message agent_message_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_message
    ADD CONSTRAINT agent_message_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.agent_session(id) ON DELETE CASCADE;


--
-- Name: agent_session agent_session_agent_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_session
    ADD CONSTRAINT agent_session_agent_config_id_fkey FOREIGN KEY (agent_config_id) REFERENCES public.agent_config(id) ON DELETE CASCADE;


--
-- Name: agent_trigger agent_trigger_agent_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_trigger
    ADD CONSTRAINT agent_trigger_agent_config_id_fkey FOREIGN KEY (agent_config_id) REFERENCES public.agent_config(id) ON DELETE CASCADE;


--
-- Name: agent_usage agent_usage_agent_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_usage
    ADD CONSTRAINT agent_usage_agent_config_id_fkey FOREIGN KEY (agent_config_id) REFERENCES public.agent_config(id) ON DELETE SET NULL;


--
-- Name: auth_credential auth_credential_entity_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_credential
    ADD CONSTRAINT auth_credential_entity_did_fkey FOREIGN KEY (entity_did) REFERENCES public.entity(did);


--
-- Name: cooperative_profile cooperative_profile_entity_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cooperative_profile
    ADD CONSTRAINT cooperative_profile_entity_did_fkey FOREIGN KEY (entity_did) REFERENCES public.entity(did);


--
-- Name: fact_log_redaction fact_log_redaction_fact_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fact_log_redaction
    ADD CONSTRAINT fact_log_redaction_fact_log_id_fkey FOREIGN KEY (fact_log_id) REFERENCES public.fact_log(id);


--
-- Name: fact_log_redaction fk_fact_log_redaction_request; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fact_log_redaction
    ADD CONSTRAINT fk_fact_log_redaction_request FOREIGN KEY (request_id) REFERENCES public.data_deletion_request(id);


--
-- Name: invitation invitation_cooperative_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_cooperative_did_fkey FOREIGN KEY (cooperative_did) REFERENCES public.entity(did);


--
-- Name: invitation invitation_invalidated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_invalidated_by_fkey FOREIGN KEY (invalidated_by) REFERENCES public.entity(did);


--
-- Name: invitation invitation_invited_by_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_invited_by_did_fkey FOREIGN KEY (invited_by_did) REFERENCES public.entity(did);


--
-- Name: invitation invitation_invitee_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_invitee_did_fkey FOREIGN KEY (invitee_did) REFERENCES public.entity(did);


--
-- Name: match_suggestion match_suggestion_target_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_suggestion
    ADD CONSTRAINT match_suggestion_target_did_fkey FOREIGN KEY (target_did) REFERENCES public.entity(did);


--
-- Name: match_suggestion match_suggestion_user_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_suggestion
    ADD CONSTRAINT match_suggestion_user_did_fkey FOREIGN KEY (user_did) REFERENCES public.entity(did);


--
-- Name: membership membership_cooperative_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT membership_cooperative_did_fkey FOREIGN KEY (cooperative_did) REFERENCES public.entity(did);


--
-- Name: membership membership_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT membership_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.entity(did);


--
-- Name: membership membership_invalidated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT membership_invalidated_by_fkey FOREIGN KEY (invalidated_by) REFERENCES public.entity(did);


--
-- Name: membership membership_invitation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT membership_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES public.invitation(id);


--
-- Name: membership membership_invited_by_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT membership_invited_by_did_fkey FOREIGN KEY (invited_by_did) REFERENCES public.entity(did);


--
-- Name: membership membership_member_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT membership_member_did_fkey FOREIGN KEY (member_did) REFERENCES public.entity(did);


--
-- Name: membership_role membership_role_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_role
    ADD CONSTRAINT membership_role_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.membership(id);


--
-- Name: post post_author_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post
    ADD CONSTRAINT post_author_did_fkey FOREIGN KEY (author_did) REFERENCES public.entity(did);


--
-- Name: post post_invalidated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post
    ADD CONSTRAINT post_invalidated_by_fkey FOREIGN KEY (invalidated_by) REFERENCES public.entity(did);


--
-- Name: post post_parent_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post
    ADD CONSTRAINT post_parent_post_id_fkey FOREIGN KEY (parent_post_id) REFERENCES public.post(id);


--
-- Name: post post_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post
    ADD CONSTRAINT post_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.thread(id);


--
-- Name: profile profile_entity_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile
    ADD CONSTRAINT profile_entity_did_fkey FOREIGN KEY (entity_did) REFERENCES public.entity(did);


--
-- Name: proposal proposal_author_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal
    ADD CONSTRAINT proposal_author_did_fkey FOREIGN KEY (author_did) REFERENCES public.entity(did);


--
-- Name: proposal proposal_cooperative_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal
    ADD CONSTRAINT proposal_cooperative_did_fkey FOREIGN KEY (cooperative_did) REFERENCES public.entity(did);


--
-- Name: proposal proposal_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal
    ADD CONSTRAINT proposal_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.entity(did);


--
-- Name: proposal proposal_invalidated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal
    ADD CONSTRAINT proposal_invalidated_by_fkey FOREIGN KEY (invalidated_by) REFERENCES public.entity(did);


--
-- Name: public_governance_anchor public_governance_anchor_cooperative_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_governance_anchor
    ADD CONSTRAINT public_governance_anchor_cooperative_did_fkey FOREIGN KEY (cooperative_did) REFERENCES public.entity(did);


--
-- Name: public_governance_anchor public_governance_anchor_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_governance_anchor
    ADD CONSTRAINT public_governance_anchor_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposal(id) ON DELETE CASCADE;


--
-- Name: script_execution_log script_execution_log_script_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.script_execution_log
    ADD CONSTRAINT script_execution_log_script_id_fkey FOREIGN KEY (script_id) REFERENCES public.cooperative_script(id) ON DELETE CASCADE;


--
-- Name: thread thread_cooperative_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread
    ADD CONSTRAINT thread_cooperative_did_fkey FOREIGN KEY (cooperative_did) REFERENCES public.entity(did);


--
-- Name: thread thread_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread
    ADD CONSTRAINT thread_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.entity(did);


--
-- Name: thread thread_invalidated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread
    ADD CONSTRAINT thread_invalidated_by_fkey FOREIGN KEY (invalidated_by) REFERENCES public.entity(did);


--
-- Name: thread_member thread_member_entity_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread_member
    ADD CONSTRAINT thread_member_entity_did_fkey FOREIGN KEY (entity_did) REFERENCES public.entity(did);


--
-- Name: thread_member thread_member_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread_member
    ADD CONSTRAINT thread_member_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.thread(id);


--
-- Name: trigger_execution_log trigger_execution_log_trigger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trigger_execution_log
    ADD CONSTRAINT trigger_execution_log_trigger_id_fkey FOREIGN KEY (trigger_id) REFERENCES public.agent_trigger(id) ON DELETE CASCADE;


--
-- Name: vote vote_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote
    ADD CONSTRAINT vote_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposal(id);


--
-- Name: vote vote_retracted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote
    ADD CONSTRAINT vote_retracted_by_fkey FOREIGN KEY (retracted_by) REFERENCES public.entity(did);


--
-- Name: vote vote_voter_did_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote
    ADD CONSTRAINT vote_voter_did_fkey FOREIGN KEY (voter_did) REFERENCES public.entity(did);


--
-- PostgreSQL database dump complete
--
