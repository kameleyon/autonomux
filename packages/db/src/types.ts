/**
 * autonomux/packages/db/src/types.ts
 *
 * Database types matching `migrations/0001_init.sql` (+ 0002 RLS / 0003 audit /
 * 0004 pgvector). Hand-written to stay readable; can be regenerated with
 * `supabase gen types typescript` once the schema is applied to a real project.
 *
 * Owner: [Atlas]
 */

// ---------------------------------------------------------------------------
// Generic JSON type (matches @supabase/supabase-js convention).
// ---------------------------------------------------------------------------
export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

// ---------------------------------------------------------------------------
// Enum-like string literal unions (kept in sync with SQL CHECK constraints).
// ---------------------------------------------------------------------------

export type TenantPlan = 'free' | 'personal' | 'pro' | 'founder';

export type TenantStatus =
    | 'active'
    | 'suspended'
    | 'past_due'
    | 'cancelled'
    | 'pending_deletion';

export type TenantMemberRole = 'owner' | 'member' | 'viewer';

export type AgentRunTriggerKind =
    | 'briefing_cron'
    | 'user_chat'
    | 'sub_agent_surface'
    | 'webhook'
    | 'manual'
    | 'system';

export type AgentRunStatus =
    | 'pending'
    | 'running'
    | 'success'
    | 'partial'
    | 'failed'
    | 'cancelled';

export type SubAgentName =
    | 'mailroom'
    | 'scheduler'
    | 'scribe'
    | 'oracle'
    | 'treasurer'
    | 'voice'
    | 'companion';

export type SubAgentRunStatus =
    | 'pending'
    | 'running'
    | 'success'
    | 'failed'
    | 'skipped';

export type IntegrationKind =
    | 'gmail'
    | 'outlook'
    | 'google_calendar'
    | 'substack'
    | 'x'
    | 'linkedin'
    | 'youtube'
    | 'plaid'
    | 'astrology';

export type OAuthStatus = 'pending' | 'active' | 'expired' | 'revoked' | 'error';

export type ConnectedAccountEventKind =
    | 'oauth_granted'
    | 'oauth_refreshed'
    | 'oauth_expired'
    | 'oauth_revoked'
    | 'scope_changed'
    | 'error';

export type BillSource = 'plaid_detected' | 'user_added' | 'rule_inferred';

export type CompanionNudgeKind =
    | 'stretch'
    | 'reading'
    | 'breath'
    | 'journal'
    | 'gratitude'
    | 'custom';

export type AuditActorKind = 'user' | 'service' | 'admin' | 'system' | 'webhook';

export type GdprRequestKind = 'export' | 'deletion';

export type GdprRequestStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'cancelled';

export type TwoFactorKind = 'totp' | 'webauthn';

export type TwoFactorVerifyKind = 'totp' | 'backup_code' | 'webauthn';

export type WebAuthnDeviceType = 'singleDevice' | 'multiDevice';

export type BillingSubscriptionStatus =
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'incomplete'
    | 'incomplete_expired'
    | 'paused';

// ---------------------------------------------------------------------------
// JSONB column shapes (typed interfaces — match comments in 0001_init.sql).
// ---------------------------------------------------------------------------

export interface AlterEgoPersonality {
    tone?: 'calm' | 'warm' | 'precise';
    verbosity?: 'concise' | 'rich';
    formality?: 'casual' | 'neutral' | 'formal';
    /** Free-form personality dials added by Settings → AlterEgo. */
    custom?: Record<string, string | number | boolean>;
}

export interface AlterEgoBriefing {
    /** Local time in HH:MM 24h format, e.g. "06:00". */
    time_local?: string;
    /** IANA timezone, e.g. "America/Los_Angeles". */
    timezone?: string;
    email_enabled?: boolean;
    inapp_enabled?: boolean;
}

export interface AlterEgoNotifications {
    push?: boolean;
    email?: boolean;
    quiet_hours?: { start: string; end: string };
}

export interface TrustedActionRule {
    action_kind: string;
    /** Free-form conditions evaluated server-side by the rule engine. */
    conditions: Record<string, Json>;
    /** ISO-8601; rule expires after this time if set. */
    expires_at?: string;
}

export interface AgentRunToolCall {
    name: string;
    sub_agent: SubAgentName | string;
    duration_ms: number;
    status: SubAgentRunStatus;
    request_id: string;
    error?: string;
}

export interface AgentMemoryEpisodeMetadata {
    source: 'briefing' | 'chat' | 'sub_agent_run' | 'system';
    tags?: string[];
    /** Optional foreign key back to agent_runs / sub_agent_runs. */
    source_run_id?: string;
}

export interface MailroomRuleDsl {
    when: {
        sender?: string;
        subject_contains?: string;
        label?: string;
        has_attachment?: boolean;
    };
    then: {
        action: 'delete' | 'draft' | 'snooze' | 'label' | 'escalate';
        params?: Record<string, Json>;
    };
}

export interface CompanionNudgeSchedule {
    /** RRULE string (RFC 5545). */
    rrule: string;
    timezone: string;
    channels: Array<'push' | 'email' | 'inapp'>;
}

// ---------------------------------------------------------------------------
// Row helpers — Supabase `Database` type pattern.
// ---------------------------------------------------------------------------

type Timestamps = {
    created_at: string;
    updated_at: string;
};

type SoftDelete = {
    deleted_at: string | null;
};

// ---------------------------------------------------------------------------
// The `Database` type — directly compatible with @supabase/supabase-js.
// ---------------------------------------------------------------------------

export interface Database {
    public: {
        Tables: {
            tenants: {
                Row: {
                    id: string;
                    plan: TenantPlan;
                    status: TenantStatus;
                    master_key_ref: string;
                } & Timestamps &
                    SoftDelete;
                Insert: {
                    id?: string;
                    plan?: TenantPlan;
                    status?: TenantStatus;
                    master_key_ref: string;
                    created_at?: string;
                    updated_at?: string;
                    deleted_at?: string | null;
                };
                Update: Partial<Database['public']['Tables']['tenants']['Insert']>;
                Relationships: [];
            };
            tenant_members: {
                Row: {
                    id: string;
                    tenant_id: string;
                    user_id: string;
                    role: TenantMemberRole;
                } & Timestamps;
                Insert: {
                    id?: string;
                    tenant_id: string;
                    user_id: string;
                    role?: TenantMemberRole;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: Partial<Database['public']['Tables']['tenant_members']['Insert']>;
                Relationships: [
                    {
                        foreignKeyName: 'tenant_members_tenant_id_fkey';
                        columns: ['tenant_id'];
                        referencedRelation: 'tenants';
                        referencedColumns: ['id'];
                    },
                ];
            };
            alterego_settings: {
                Row: {
                    id: string;
                    tenant_id: string;
                    personality: AlterEgoPersonality;
                    briefing: AlterEgoBriefing;
                    notifications: AlterEgoNotifications;
                    trusted_actions: TrustedActionRule[];
                } & Timestamps;
                Insert: {
                    id?: string;
                    tenant_id: string;
                    personality?: AlterEgoPersonality;
                    briefing?: AlterEgoBriefing;
                    notifications?: AlterEgoNotifications;
                    trusted_actions?: TrustedActionRule[];
                    created_at?: string;
                    updated_at?: string;
                };
                Update: Partial<Database['public']['Tables']['alterego_settings']['Insert']>;
                Relationships: [];
            };
            agent_facts: {
                Row: {
                    id: string;
                    tenant_id: string;
                    /** Base64-encoded ciphertext (bytea over the wire). */
                    encrypted_blob: string;
                    nonce: string;
                    key_version: number;
                    schema_version: number;
                } & Timestamps;
                Insert: {
                    id?: string;
                    tenant_id: string;
                    encrypted_blob: string;
                    nonce: string;
                    key_version?: number;
                    schema_version?: number;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: Partial<Database['public']['Tables']['agent_facts']['Insert']>;
                Relationships: [];
            };
            agent_memory_episodes: {
                Row: {
                    id: string;
                    tenant_id: string;
                    content_summary: string;
                    encrypted_payload: string | null;
                    payload_nonce: string | null;
                    key_version: number;
                    /** pgvector(1536) — serialized as number[] over the JSON wire. */
                    embedding: number[] | null;
                    metadata: AgentMemoryEpisodeMetadata;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    tenant_id: string;
                    content_summary: string;
                    encrypted_payload?: string | null;
                    payload_nonce?: string | null;
                    key_version?: number;
                    embedding?: number[] | null;
                    metadata?: AgentMemoryEpisodeMetadata;
                    created_at?: string;
                };
                Update: Partial<Database['public']['Tables']['agent_memory_episodes']['Insert']>;
                Relationships: [];
            };
            agent_runs: {
                Row: {
                    id: string;
                    tenant_id: string;
                    trigger_kind: AgentRunTriggerKind;
                    status: AgentRunStatus;
                    model: string;
                    input_tokens: number;
                    output_tokens: number;
                    cost_usd_cents: number;
                    duration_ms: number | null;
                    tools_called: AgentRunToolCall[];
                    /** Encrypted JSONB — opaque except to cpanel impersonation flow. */
                    chain_of_thought_encrypted: Json;
                    error: string | null;
                    created_at: string;
                    finished_at: string | null;
                };
                Insert: {
                    id?: string;
                    tenant_id: string;
                    trigger_kind: AgentRunTriggerKind;
                    status?: AgentRunStatus;
                    model: string;
                    input_tokens?: number;
                    output_tokens?: number;
                    cost_usd_cents?: number;
                    duration_ms?: number | null;
                    tools_called?: AgentRunToolCall[];
                    chain_of_thought_encrypted?: Json;
                    error?: string | null;
                    created_at?: string;
                    finished_at?: string | null;
                };
                Update: Partial<Database['public']['Tables']['agent_runs']['Insert']>;
                Relationships: [];
            };
            sub_agent_runs: {
                Row: {
                    id: string;
                    agent_run_id: string;
                    tenant_id: string;
                    sub_agent_name: SubAgentName;
                    status: SubAgentRunStatus;
                    input: Json;
                    output: Json;
                    duration_ms: number | null;
                    error: string | null;
                    created_at: string;
                    finished_at: string | null;
                };
                Insert: {
                    id?: string;
                    agent_run_id: string;
                    tenant_id: string;
                    sub_agent_name: SubAgentName;
                    status?: SubAgentRunStatus;
                    input?: Json;
                    output?: Json;
                    duration_ms?: number | null;
                    error?: string | null;
                    created_at?: string;
                    finished_at?: string | null;
                };
                Update: Partial<Database['public']['Tables']['sub_agent_runs']['Insert']>;
                Relationships: [
                    {
                        foreignKeyName: 'sub_agent_runs_agent_run_id_fkey';
                        columns: ['agent_run_id'];
                        referencedRelation: 'agent_runs';
                        referencedColumns: ['id'];
                    },
                ];
            };
            connected_accounts: {
                Row: {
                    id: string;
                    tenant_id: string;
                    integration: IntegrationKind;
                    composio_account_id: string | null;
                    oauth_status: OAuthStatus;
                    scope_grants: string[];
                    last_refresh_at: string | null;
                    last_error: string | null;
                    // Sprint D §4 / migration 0011_oauth_credentials.sql
                    encrypted_credentials: Json | null;
                    token_expires_at: string | null;
                } & Timestamps;
                Insert: {
                    id?: string;
                    tenant_id: string;
                    integration: IntegrationKind;
                    composio_account_id?: string | null;
                    oauth_status?: OAuthStatus;
                    scope_grants?: string[];
                    last_refresh_at?: string | null;
                    last_error?: string | null;
                    encrypted_credentials?: Json | null;
                    token_expires_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: Partial<Database['public']['Tables']['connected_accounts']['Insert']>;
                Relationships: [];
            };
            connected_account_events: {
                Row: {
                    id: string;
                    connected_account_id: string;
                    tenant_id: string;
                    event_kind: ConnectedAccountEventKind;
                    payload: Json;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    connected_account_id: string;
                    tenant_id: string;
                    event_kind: ConnectedAccountEventKind;
                    payload?: Json;
                    created_at?: string;
                };
                Update: Partial<Database['public']['Tables']['connected_account_events']['Insert']>;
                Relationships: [
                    {
                        foreignKeyName: 'connected_account_events_connected_account_id_fkey';
                        columns: ['connected_account_id'];
                        referencedRelation: 'connected_accounts';
                        referencedColumns: ['id'];
                    },
                ];
            };
            mailroom_rules: {
                Row: {
                    id: string;
                    tenant_id: string;
                    name: string;
                    rule_dsl: MailroomRuleDsl;
                    active: boolean;
                    priority: number;
                } & Timestamps;
                Insert: {
                    id?: string;
                    tenant_id: string;
                    name: string;
                    rule_dsl: MailroomRuleDsl;
                    active?: boolean;
                    priority?: number;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: Partial<Database['public']['Tables']['mailroom_rules']['Insert']>;
                Relationships: [];
            };
            treasurer_bills: {
                Row: {
                    id: string;
                    tenant_id: string;
                    name: string;
                    amount_cents: number;
                    currency: string;
                    due_day_of_month: number;
                    source: BillSource;
                    last_seen_at: string | null;
                    confirmed: boolean;
                } & Timestamps;
                Insert: {
                    id?: string;
                    tenant_id: string;
                    name: string;
                    amount_cents: number;
                    currency?: string;
                    due_day_of_month: number;
                    source: BillSource;
                    last_seen_at?: string | null;
                    confirmed?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: Partial<Database['public']['Tables']['treasurer_bills']['Insert']>;
                Relationships: [];
            };
            scribe_voice_samples: {
                Row: {
                    id: string;
                    tenant_id: string;
                    label: string;
                    content: string;
                    word_count: number;
                } & Timestamps;
                Insert: {
                    id?: string;
                    tenant_id: string;
                    label: string;
                    content: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: Partial<Database['public']['Tables']['scribe_voice_samples']['Insert']>;
                Relationships: [];
            };
            oracle_readings: {
                Row: {
                    id: string;
                    tenant_id: string;
                    reading_date: string;
                    payload_encrypted: Json;
                    user_feedback: number | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    tenant_id: string;
                    reading_date: string;
                    payload_encrypted?: Json;
                    user_feedback?: number | null;
                    created_at?: string;
                };
                Update: Partial<Database['public']['Tables']['oracle_readings']['Insert']>;
                Relationships: [];
            };
            companion_nudges: {
                Row: {
                    id: string;
                    tenant_id: string;
                    kind: CompanionNudgeKind;
                    schedule: CompanionNudgeSchedule;
                    dismissed_at: string | null;
                    completed_at: string | null;
                } & Timestamps;
                Insert: {
                    id?: string;
                    tenant_id: string;
                    kind: CompanionNudgeKind;
                    schedule: CompanionNudgeSchedule;
                    dismissed_at?: string | null;
                    completed_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: Partial<Database['public']['Tables']['companion_nudges']['Insert']>;
                Relationships: [];
            };
            activity_log: {
                Row: {
                    id: string;
                    tenant_id: string;
                    agent_run_id: string | null;
                    summary: string;
                    chain_of_thought_summary: string | null;
                    action_kind: string;
                    resource_type: string | null;
                    resource_id: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    tenant_id: string;
                    agent_run_id?: string | null;
                    summary: string;
                    chain_of_thought_summary?: string | null;
                    action_kind: string;
                    resource_type?: string | null;
                    resource_id?: string | null;
                    created_at?: string;
                };
                Update: Partial<Database['public']['Tables']['activity_log']['Insert']>;
                Relationships: [
                    {
                        foreignKeyName: 'activity_log_agent_run_id_fkey';
                        columns: ['agent_run_id'];
                        referencedRelation: 'agent_runs';
                        referencedColumns: ['id'];
                    },
                ];
            };
            audit_log: {
                Row: {
                    id: string;
                    tenant_id: string | null;
                    actor_user_id: string | null;
                    actor_kind: AuditActorKind;
                    action: string;
                    resource_type: string;
                    resource_id: string | null;
                    metadata: Json;
                    /** sha256 hex (bytea over the wire) of the prior row, null only on genesis. */
                    prev_hash: string | null;
                    this_hash: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    tenant_id?: string | null;
                    actor_user_id?: string | null;
                    actor_kind?: AuditActorKind;
                    action: string;
                    resource_type: string;
                    resource_id?: string | null;
                    metadata?: Json;
                    /** prev_hash + this_hash are computed by trigger; do not set. */
                    prev_hash?: never;
                    this_hash?: never;
                    created_at?: string;
                };
                Update: never; // audit_log is append-only
                Relationships: [];
            };
            audit_chain_checkpoints: {
                Row: {
                    id: string;
                    checkpoint_date: string;
                    chain_head_hash: string;
                    row_count: number;
                    signature_pending: boolean;
                    ots_receipt: string | null;
                    created_at: string;
                    signed_at: string | null;
                };
                Insert: {
                    id?: string;
                    checkpoint_date: string;
                    chain_head_hash: string;
                    row_count: number;
                    signature_pending?: boolean;
                    ots_receipt?: string | null;
                    created_at?: string;
                    signed_at?: string | null;
                };
                Update: Partial<Database['public']['Tables']['audit_chain_checkpoints']['Insert']>;
                Relationships: [];
            };
            system_log_meta: {
                Row: {
                    id: string;
                    axiom_stream: string;
                    query_url: string;
                    description: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    axiom_stream: string;
                    query_url: string;
                    description?: string | null;
                    created_at?: string;
                };
                Update: Partial<Database['public']['Tables']['system_log_meta']['Insert']>;
                Relationships: [];
            };
            billing_subscriptions: {
                Row: {
                    id: string;
                    tenant_id: string;
                    stripe_subscription_id: string;
                    stripe_customer_id: string;
                    plan: TenantPlan;
                    status: BillingSubscriptionStatus;
                    mrr_cents: number;
                    current_period_start: string | null;
                    current_period_end: string | null;
                    cancel_at: string | null;
                    canceled_at: string | null;
                } & Timestamps;
                Insert: {
                    id?: string;
                    tenant_id: string;
                    stripe_subscription_id: string;
                    stripe_customer_id: string;
                    plan: TenantPlan;
                    status: BillingSubscriptionStatus;
                    mrr_cents?: number;
                    current_period_start?: string | null;
                    current_period_end?: string | null;
                    cancel_at?: string | null;
                    canceled_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: Partial<Database['public']['Tables']['billing_subscriptions']['Insert']>;
                Relationships: [];
            };
            billing_events: {
                Row: {
                    id: string;
                    tenant_id: string | null;
                    stripe_event_id: string;
                    kind: string;
                    payload: Json;
                    signature: string | null;
                    processed_at: string | null;
                    processing_error: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    tenant_id?: string | null;
                    stripe_event_id: string;
                    kind: string;
                    payload: Json;
                    signature?: string | null;
                    processed_at?: string | null;
                    processing_error?: string | null;
                    created_at?: string;
                };
                Update: Partial<Database['public']['Tables']['billing_events']['Insert']>;
                Relationships: [];
            };
            usage_meters: {
                Row: {
                    id: string;
                    tenant_id: string;
                    period: string;
                    llm_tokens_in: number;
                    llm_tokens_out: number;
                    composio_calls: number;
                    plaid_calls: number;
                    cost_usd_cents: number;
                } & Timestamps;
                Insert: {
                    id?: string;
                    tenant_id: string;
                    period: string;
                    llm_tokens_in?: number;
                    llm_tokens_out?: number;
                    composio_calls?: number;
                    plaid_calls?: number;
                    cost_usd_cents?: number;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: Partial<Database['public']['Tables']['usage_meters']['Insert']>;
                Relationships: [];
            };
            user_2fa_factors: {
                Row: {
                    id: string;
                    user_id: string;
                    tenant_id: string;
                    kind: TwoFactorKind;
                    /** Cipher envelope JSON (null for webauthn rows). */
                    secret_encrypted: Json | null;
                    /** JSONB string[] of sha256 hex hashes (null for webauthn rows). */
                    backup_codes_encrypted: Json | null;
                    backup_codes_displayed_at: string | null;
                    credential_id: string | null;
                    credential_public_key: string | null;
                    credential_counter: number | null;
                    credential_transports: string[] | null;
                    credential_device_type: WebAuthnDeviceType | null;
                    credential_backed_up: boolean | null;
                    credential_nickname: string | null;
                    enrolled_at: string;
                    last_used_at: string | null;
                    revoked_at: string | null;
                } & Timestamps;
                Insert: {
                    id?: string;
                    user_id: string;
                    tenant_id: string;
                    kind: TwoFactorKind;
                    secret_encrypted?: Json | null;
                    backup_codes_encrypted?: Json | null;
                    backup_codes_displayed_at?: string | null;
                    credential_id?: string | null;
                    credential_public_key?: string | null;
                    credential_counter?: number | null;
                    credential_transports?: string[] | null;
                    credential_device_type?: WebAuthnDeviceType | null;
                    credential_backed_up?: boolean | null;
                    credential_nickname?: string | null;
                    enrolled_at?: string;
                    last_used_at?: string | null;
                    revoked_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: Partial<Database['public']['Tables']['user_2fa_factors']['Insert']>;
                Relationships: [];
            };
            user_2fa_verify_attempts: {
                Row: {
                    id: string;
                    user_id: string;
                    kind: TwoFactorVerifyKind;
                    success: boolean;
                    ip_address: string | null;
                    user_agent: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    kind: TwoFactorVerifyKind;
                    success: boolean;
                    ip_address?: string | null;
                    user_agent?: string | null;
                    created_at?: string;
                };
                Update: Partial<Database['public']['Tables']['user_2fa_verify_attempts']['Insert']>;
                Relationships: [];
            };
            feature_flags: {
                Row: {
                    key: string;
                    description: string | null;
                    enabled_globally: boolean;
                    rollout_percentage: number;
                    enabled_for_tenants: string[];
                    disabled_for_tenants: string[];
                } & Timestamps;
                Insert: {
                    key: string;
                    description?: string | null;
                    enabled_globally?: boolean;
                    rollout_percentage?: number;
                    enabled_for_tenants?: string[];
                    disabled_for_tenants?: string[];
                    created_at?: string;
                    updated_at?: string;
                };
                Update: Partial<Database['public']['Tables']['feature_flags']['Insert']>;
                Relationships: [];
            };
            gdpr_requests: {
                Row: {
                    id: string;
                    tenant_id: string | null;
                    user_id: string;
                    kind: GdprRequestKind;
                    status: GdprRequestStatus;
                    admin_actor_user_id: string | null;
                    bullmq_job_id: string | null;
                    download_url: string | null;
                    download_storage_path: string | null;
                    failure_reason: string | null;
                    requested_at: string;
                    started_at: string | null;
                    completed_at: string | null;
                    expires_at: string | null;
                    cancelled_at: string | null;
                } & Timestamps;
                Insert: {
                    id?: string;
                    tenant_id?: string | null;
                    user_id: string;
                    kind: GdprRequestKind;
                    status?: GdprRequestStatus;
                    admin_actor_user_id?: string | null;
                    bullmq_job_id?: string | null;
                    download_url?: string | null;
                    download_storage_path?: string | null;
                    failure_reason?: string | null;
                    requested_at?: string;
                    started_at?: string | null;
                    completed_at?: string | null;
                    expires_at?: string | null;
                    cancelled_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: Partial<Database['public']['Tables']['gdpr_requests']['Insert']>;
                Relationships: [];
            };
        };
        Views: Record<never, never>;
        Functions: {
            current_tenant_id: { Args: Record<string, never>; Returns: string | null };
            is_admin: { Args: Record<string, never>; Returns: boolean };
            verify_audit_chain: {
                Args: { p_tenant_id?: string | null };
                Returns: boolean;
            };
            write_audit_checkpoint: {
                Args: { p_date?: string };
                Returns: string | null;
            };
        };
        Enums: Record<never, never>;
        CompositeTypes: Record<never, never>;
    };
}

// Convenience aliases.
export type Tables<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Update'];
