/**
 * autonomux/packages/db/src/index.ts
 *
 * Barrel export. Consumers should import from '@autonomux/db' or one of
 * '@autonomux/db/client', '@autonomux/db/types', '@autonomux/db/admin'.
 */

export {
    createServerClient,
    createServiceClient,
    createBrowserClient,
    type CookieAdapter,
} from './client';

export type {
    Database,
    Json,
    Tables,
    TablesInsert,
    TablesUpdate,
    TenantPlan,
    TenantStatus,
    TenantMemberRole,
    AgentRunTriggerKind,
    AgentRunStatus,
    SubAgentName,
    SubAgentRunStatus,
    IntegrationKind,
    OAuthStatus,
    ConnectedAccountEventKind,
    BillSource,
    CompanionNudgeKind,
    AuditActorKind,
    GdprRequestKind,
    GdprRequestStatus,
    TwoFactorKind,
    TwoFactorVerifyKind,
    WebAuthnDeviceType,
    BillingSubscriptionStatus,
    AlterEgoPersonality,
    AlterEgoBriefing,
    AlterEgoNotifications,
    TrustedActionRule,
    AgentRunToolCall,
    AgentMemoryEpisodeMetadata,
    MailroomRuleDsl,
    CompanionNudgeSchedule,
} from './types';

export {
    listTenants,
    getTenantSnapshot,
    writeAuditLog,
    verifyAuditChain,
    writeDailyAuditCheckpoint,
} from './admin';

export {
    extractJwtClaims,
    tryExtractJwtClaims,
    JwtMalformedError,
    type JwtClaims,
} from './jwt';

export {
    logAuditEvent,
    type LogAuditEventArgs,
} from './audit';

export {
    bumpUsageMeter,
    recordAgentRun,
    recordSubAgentRun,
    type AgentRunHandle,
    type AgentRunReplaySnapshot,
    type BumpUsageMeterArgs,
    type RecordAgentRunArgs,
    type RecordSubAgentRunArgs,
} from './orchestrator-helpers';
