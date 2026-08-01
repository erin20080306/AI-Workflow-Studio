'use client';

import {
  ScheduleSchema,
  type Schedule,
  type ScheduleRule,
  type ScheduleTarget,
} from '@ai-workflow-studio/scheduler';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { CheckIcon, RunsIcon, ScheduleIcon, ShieldIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';

const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
const ScheduleResponseSchema = z.object({ schedule: ScheduleSchema });

const copy = {
  en: {
    active: 'Active',
    approval:
      'A scheduled occurrence creates a traceable run request. Write, external, or destructive actions still require the existing approval policy.',
    cadence: 'Frequency',
    connector: 'Authorized connector',
    connectorActive: 'Authorized and health-checkable',
    connectorDescription:
      'Google Sheets uses bounded OAuth scopes, encrypted server-only tokens, revocation, retries, and idempotent writes.',
    create: 'Create schedule',
    created: 'Schedule created. Its first due run will not bypass approval.',
    daily: 'Every day',
    empty: 'No schedules yet. Create one from an active workflow version.',
    every15: 'Every 15 minutes',
    failed: 'The schedule change could not be completed.',
    heading: 'Schedules and connectors',
    hourly: 'Every hour',
    lastError: 'Last safe error code',
    manageConnector: 'Review connection',
    nextRun: 'Next occurrence',
    noTargets:
      'No active Cloud or Desktop workflow version is available. Run a reviewed plan first.',
    pause: 'Pause',
    paused: 'Paused',
    resume: 'Resume',
    safety: 'Recurring, bounded, and auditable',
    saved: 'Schedule status updated.',
    source: 'Execution target',
    subtitle:
      'Use validated presets instead of arbitrary Cron or code. Every occurrence has a stable idempotency key.',
    time: 'Local time',
    timezone: 'Timezone',
    weekdays: 'Weekdays',
  },
  'zh-Hant': {
    active: '執行中',
    approval: '排程到期時只會建立可追溯的執行要求；寫入、外部或破壞性動作仍沿用既有核准規則。',
    cadence: '執行頻率',
    connector: '已授權連接器',
    connectorActive: '已授權，可進行健康檢查',
    connectorDescription:
      'Google Sheets 使用受限 OAuth 權限、Server-only 加密 Token、撤銷、重試與冪等寫入。',
    create: '建立排程',
    created: '排程已建立；首次到期執行不會略過核准。',
    daily: '每天',
    empty: '尚無排程。請從已啟用的工作流版本建立第一個排程。',
    every15: '每 15 分鐘',
    failed: '排程操作未完成。',
    heading: '排程與連接器',
    hourly: '每小時',
    lastError: '最近安全錯誤代碼',
    manageConnector: '檢查連線',
    nextRun: '下次執行',
    noTargets: '目前沒有可用的已啟用 Cloud 或 Desktop 工作流，請先檢查並自動執行一次計畫。',
    pause: '暫停',
    paused: '已暫停',
    resume: '恢復',
    safety: '週期化、受限且可稽核',
    saved: '排程狀態已更新。',
    source: '執行目標',
    subtitle: '使用經驗證的預設頻率，不接受任意 Cron 或程式碼；每次執行都有固定冪等鍵。',
    time: '當地時間',
    timezone: '時區',
    weekdays: '週一至週五',
  },
} as const;

const timezones = ['Asia/Taipei', 'Asia/Tokyo', 'UTC', 'America/Los_Angeles'] as const;

function targetKey(target: ScheduleTarget): string {
  return `${target.workflowId}:${target.workflowVersionId}:${target.deviceId ?? 'cloud'}`;
}

function targetLabel(target: ScheduleTarget): string {
  return target.executionTarget === 'cloud' ? 'Cloud Work' : (target.deviceName ?? 'Desktop Agent');
}

function cadenceLabel(rule: ScheduleRule, text: (typeof copy)[keyof typeof copy]): string {
  return {
    daily: `${text.daily} ${rule.cadence === 'daily' ? rule.time : ''}`,
    every_15_minutes: text.every15,
    hourly: text.hourly,
    weekdays: `${text.weekdays} ${rule.cadence === 'weekdays' ? rule.time : ''}`,
  }[rule.cadence];
}

export function ScheduleWorkspace({
  connectionCount,
  initialSchedules,
  targets,
}: Readonly<{
  readonly connectionCount: number;
  readonly initialSchedules: readonly Schedule[];
  readonly targets: readonly ScheduleTarget[];
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [schedules, setSchedules] = useState<readonly Schedule[]>(initialSchedules);
  const [selectedTarget, setSelectedTarget] = useState(
    targets[0] === undefined ? '' : targetKey(targets[0]),
  );
  const [cadence, setCadence] = useState<ScheduleRule['cadence']>('daily');
  const [time, setTime] = useState('09:00');
  const [timezone, setTimezone] = useState<(typeof timezones)[number]>('Asia/Taipei');
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-TW', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  async function create(): Promise<void> {
    const target = targets.find((candidate) => targetKey(candidate) === selectedTarget);
    if (target === undefined) {
      setMessage(text.noTargets);
      return;
    }
    const rule: ScheduleRule =
      cadence === 'daily' || cadence === 'weekdays' ? { cadence, time } : { cadence };
    setSaving(true);
    setMessage(undefined);
    try {
      const response = await fetch('/api/schedules', {
        body: JSON.stringify({ rule, target, timezone }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(ApiErrorSchema.parse(payload).error.message);
      }
      const schedule = ScheduleResponseSchema.parse(payload).schedule;
      setSchedules((current) => [...current, schedule]);
      setMessage(text.created);
    } catch {
      setMessage(text.failed);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(schedule: Schedule): Promise<void> {
    setSaving(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/schedules/${schedule.id}`, {
        body: JSON.stringify({
          status: schedule.status === 'active' ? 'paused' : 'active',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(ApiErrorSchema.parse(payload).error.message);
      }
      const updated = ScheduleResponseSchema.parse(payload).schedule;
      setSchedules((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      setMessage(text.saved);
    } catch {
      setMessage(text.failed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1320px]">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">{text.safety}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
        {text.heading}
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{text.subtitle}</p>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-indigo-100 text-indigo-700">
              <ScheduleIcon className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">{text.create}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{text.approval}</p>
            </div>
          </div>

          {targets.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
              {text.noTargets}
            </p>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="text-xs font-semibold text-slate-700">{text.source}</span>
                <select
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500"
                  onChange={(event) => setSelectedTarget(event.target.value)}
                  value={selectedTarget}
                >
                  {targets.map((target) => (
                    <option key={targetKey(target)} value={targetKey(target)}>
                      {target.workflowName} · {targetLabel(target)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-700">{text.cadence}</span>
                <select
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500"
                  onChange={(event) => setCadence(event.target.value as ScheduleRule['cadence'])}
                  value={cadence}
                >
                  <option value="every_15_minutes">{text.every15}</option>
                  <option value="hourly">{text.hourly}</option>
                  <option value="daily">{text.daily}</option>
                  <option value="weekdays">{text.weekdays}</option>
                </select>
              </label>
              {cadence === 'daily' || cadence === 'weekdays' ? (
                <label>
                  <span className="text-xs font-semibold text-slate-700">{text.time}</span>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500"
                    onChange={(event) => setTime(event.target.value)}
                    required
                    type="time"
                    value={time}
                  />
                </label>
              ) : null}
              <label>
                <span className="text-xs font-semibold text-slate-700">{text.timezone}</span>
                <select
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500"
                  onChange={(event) =>
                    setTimezone(event.target.value as (typeof timezones)[number])
                  }
                  value={timezone}
                >
                  {timezones.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={saving}
                  onClick={() => void create()}
                  type="button"
                >
                  <ScheduleIcon className="size-4" />
                  {text.create}
                </button>
              </div>
            </div>
          )}

          {message !== undefined ? (
            <p
              aria-live="polite"
              className="mt-4 rounded-xl bg-indigo-50 px-3 py-2.5 text-xs font-semibold text-indigo-800"
            >
              {message}
            </p>
          ) : null}
        </section>

        <section className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                {text.connector}
              </p>
              <h2 className="mt-2 text-xl font-semibold">Google Sheets</h2>
            </div>
            <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-[11px] font-semibold text-emerald-200">
              {connectionCount} · {text.connectorActive}
            </span>
          </div>
          <p className="mt-4 text-xs leading-6 text-slate-300">{text.connectorDescription}</p>
          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-200">
            <ShieldIcon className="size-5 shrink-0 text-emerald-300" />
            Server-only OAuth · bounded scopes · revoke · health · retry
          </div>
          <Link
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950"
            href="/dashboard/settings/connections"
          >
            <CheckIcon className="size-4" />
            {text.manageConnector}
          </Link>
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="font-semibold text-slate-950">{text.heading}</h2>
        </div>
        {schedules.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">{text.empty}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {schedules.map((schedule) => (
              <article
                className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_220px_130px] lg:items-center"
                key={schedule.id}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-950">{schedule.target.workflowName}</h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        schedule.status === 'active'
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-amber-50 text-amber-900'
                      }`}
                    >
                      {schedule.status === 'active' ? text.active : text.paused}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {cadenceLabel(schedule.rule, text)} · {schedule.timezone} ·{' '}
                    {targetLabel(schedule.target)}
                  </p>
                  {schedule.lastErrorCode !== undefined ? (
                    <p className="mt-2 text-xs font-medium text-red-700">
                      {text.lastError}: {schedule.lastErrorCode}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    {text.nextRun}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-700">
                    {dateFormatter.format(new Date(schedule.nextRunAt))}
                  </p>
                </div>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50"
                  disabled={saving}
                  onClick={() => void updateStatus(schedule)}
                  type="button"
                >
                  <RunsIcon className="size-4" />
                  {schedule.status === 'active' ? text.pause : text.resume}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
