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
} from './client.js';

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
    BillingSubscriptionStatus,
    AlterEgoPersonality,
    AlterEgoBriefing,
    AlterEgoNotifications,
    TrustedActionRule,
    AgentRunToolCall,
    AgentMemoryEpisodeMetadata,
    MailroomRuleDsl,
    CompanionNudgeSchedule,
} from './types.js';

export {
    listTenants,
    getTenantSnapshot,
    writeAuditLog,
    verifyAuditChain,
    writeDailyAuditCheckpoint,
} from './admin.js';
