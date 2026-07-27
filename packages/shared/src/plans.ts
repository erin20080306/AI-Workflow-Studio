export const PLAN_CODES = ['free', 'pro', 'team', 'business'] as const;

export type PlanCode = (typeof PLAN_CODES)[number];

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
    monthlyAiCostBudgetMicrounits: 10_000_000,
    monthlyPriceTwd: 0,
    monthlyRunLimit: 100,
    monthlySourceBytes: 20 * 1_048_576,
    monthlyToolCallLimit: 100,
    name: { en: 'Free', zhHant: '免費版' },
    workflowLimit: 3,
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
