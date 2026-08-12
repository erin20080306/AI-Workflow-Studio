export const PLAN_CODES = ['free', 'personal', 'pro', 'team', 'business'] as const;

export type PlanCode = (typeof PLAN_CODES)[number];
export const AI_MODEL_TIERS = ['economy', 'standard', 'advanced', 'flagship'] as const;
export type AiModelTier = (typeof AI_MODEL_TIERS)[number];

export interface ProductPlan {
  readonly aiRequestsPerMinute: number;
  readonly annualPriceTwd: number;
  readonly auditRetentionDays: number;
  readonly code: PlanCode;
  readonly description: {
    readonly en: string;
    readonly zhHant: string;
  };
  readonly deviceLimit: number;
  readonly featured: boolean;
  readonly memberLimit: number;
  readonly maximumAiModelTier: AiModelTier;
  readonly maximumAiRequestCostMicrounits: number;
  readonly monthlyAiCostBudgetMicrounits: number;
  readonly monthlyPriceTwd: number;
  readonly monthlyRunLimit: number;
  readonly monthlySourceBytes: number;
  readonly monthlyToolCallLimit: number;
  readonly name: {
    readonly en: string;
    readonly zhHant: string;
  };
  readonly workflowLimit: number;
}

export const PRODUCT_PLANS: readonly ProductPlan[] = [
  {
    aiRequestsPerMinute: 3,
    annualPriceTwd: 0,
    auditRetentionDays: 7,
    code: 'free',
    description: {
      en: 'Explore safe local automation with essential limits.',
      zhHant: '以基本額度探索安全的本機自動化。',
    },
    deviceLimit: 1,
    featured: false,
    memberLimit: 1,
    maximumAiModelTier: 'economy',
    maximumAiRequestCostMicrounits: 3_000_000,
    monthlyAiCostBudgetMicrounits: 5_000_000,
    monthlyPriceTwd: 0,
    monthlyRunLimit: 50,
    monthlySourceBytes: 10 * 1_048_576,
    monthlyToolCallLimit: 50,
    name: { en: 'Free', zhHant: '免費版' },
    workflowLimit: 2,
  },
  {
    aiRequestsPerMinute: 5,
    annualPriceTwd: 990,
    auditRetentionDays: 14,
    code: 'personal',
    description: {
      en: 'For one person automating everyday spreadsheet work on a single device.',
      zhHant: '適合單人、單一裝置處理日常試算表自動化。',
    },
    deviceLimit: 1,
    featured: false,
    memberLimit: 1,
    maximumAiModelTier: 'standard',
    maximumAiRequestCostMicrounits: 5_000_000,
    monthlyAiCostBudgetMicrounits: 50_000_000,
    monthlyPriceTwd: 99,
    monthlyRunLimit: 800,
    monthlySourceBytes: 200 * 1_048_576,
    monthlyToolCallLimit: 800,
    name: { en: 'Personal', zhHant: '個人版' },
    workflowLimit: 10,
  },
  {
    aiRequestsPerMinute: 10,
    annualPriceTwd: 5_900,
    auditRetentionDays: 30,
    code: 'pro',
    description: {
      en: 'For professionals automating recurring spreadsheet work.',
      zhHant: '適合持續自動化試算表工作的專業使用者。',
    },
    deviceLimit: 2,
    featured: true,
    memberLimit: 3,
    maximumAiModelTier: 'standard',
    maximumAiRequestCostMicrounits: 15_000_000,
    monthlyAiCostBudgetMicrounits: 150_000_000,
    monthlyPriceTwd: 590,
    monthlyRunLimit: 2_500,
    monthlySourceBytes: 1_024 * 1_048_576,
    monthlyToolCallLimit: 2_500,
    name: { en: 'Pro', zhHant: '專業版' },
    workflowLimit: 25,
  },
  {
    aiRequestsPerMinute: 30,
    annualPriceTwd: 19_900,
    auditRetentionDays: 90,
    code: 'team',
    description: {
      en: 'Shared operations, approvals, and longer audit history.',
      zhHant: '提供團隊協作、核准流程與較長稽核紀錄。',
    },
    deviceLimit: 10,
    featured: false,
    memberLimit: 10,
    maximumAiModelTier: 'advanced',
    maximumAiRequestCostMicrounits: 40_000_000,
    monthlyAiCostBudgetMicrounits: 550_000_000,
    monthlyPriceTwd: 1_990,
    monthlyRunLimit: 10_000,
    monthlySourceBytes: 10 * 1_024 * 1_048_576,
    monthlyToolCallLimit: 10_000,
    name: { en: 'Team', zhHant: '團隊版' },
    workflowLimit: 100,
  },
  {
    aiRequestsPerMinute: 60,
    annualPriceTwd: 59_900,
    auditRetentionDays: 365,
    code: 'business',
    description: {
      en: 'Higher limits and operational support for growing organizations.',
      zhHant: '為成長型組織提供更高額度與營運支援。',
    },
    deviceLimit: 50,
    featured: false,
    memberLimit: 50,
    maximumAiModelTier: 'flagship',
    maximumAiRequestCostMicrounits: 60_000_000,
    monthlyAiCostBudgetMicrounits: 1_700_000_000,
    monthlyPriceTwd: 5_990,
    monthlyRunLimit: 50_000,
    monthlySourceBytes: 50 * 1_024 * 1_048_576,
    monthlyToolCallLimit: 50_000,
    name: { en: 'Business', zhHant: '商務版' },
    workflowLimit: 1_000,
  },
] as const;

export function isPlanCode(value: string): value is PlanCode {
  return PLAN_CODES.some((planCode) => planCode === value);
}
