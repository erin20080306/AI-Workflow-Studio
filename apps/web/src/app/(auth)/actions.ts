'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requireVerifiedIdentity } from '@/lib/auth/context';
import {
  createTenantForUser,
  ensureTenantFromSignupMetadata,
  parseTenantSetup,
} from '@/lib/auth/onboarding';
import { getEnvironment } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const EmailSchema = z.string().trim().toLowerCase().email().max(320);
const PasswordSchema = z
  .string()
  .min(10)
  .max(128)
  .regex(/[a-z]/, 'Password needs a lowercase letter.')
  .regex(/[A-Z]/, 'Password needs an uppercase letter.')
  .regex(/[0-9]/, 'Password needs a number.');

const LoginSchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

const RegisterSchema = z
  .object({
    confirmPassword: z.string(),
    displayName: z.string().trim().min(1).max(120),
    email: EmailSchema,
    password: PasswordSchema,
    terms: z.literal('accepted'),
    workspaceName: z.string().trim().min(1).max(120),
    workspaceSlug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

const RecoverySchema = z.object({ email: EmailSchema }).strict();
const UpdatePasswordSchema = z
  .object({
    confirmPassword: z.string(),
    password: PasswordSchema,
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

function field(formData: FormData, name: string): FormDataEntryValue | undefined {
  const value = formData.get(name);
  return value === null ? undefined : value;
}

function redirectWithStatus(pathname: string, status: string): never {
  const params = new URLSearchParams({ status });
  redirect(`${pathname}?${params.toString()}`);
}

function applicationOrigin(): string {
  const environment = getEnvironment();
  if (environment.appUrl !== undefined) {
    return environment.appUrl.replace(/\/$/u, '');
  }
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }
  throw new Error('The production application origin is not configured.');
}

export async function loginAction(formData: FormData): Promise<never> {
  if (getEnvironment().mockMode) {
    redirect('/dashboard');
  }

  const parsed = LoginSchema.safeParse({
    email: field(formData, 'email'),
    password: field(formData, 'password'),
  });
  if (!parsed.success) {
    redirectWithStatus('/login', 'invalid-input');
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase.auth.signInWithPassword(parsed.data);
  if (result.error !== null || result.data.user === null) {
    redirectWithStatus('/login', 'invalid-credentials');
  }

  const tenantId = await ensureTenantFromSignupMetadata(
    supabase,
    result.data.user.id,
    result.data.user.user_metadata,
  );
  if (tenantId === null) {
    redirect('/onboarding');
  }
  redirect('/dashboard');
}

export async function registerAction(formData: FormData): Promise<never> {
  if (getEnvironment().mockMode) {
    redirect('/dashboard');
  }

  const parsed = RegisterSchema.safeParse({
    confirmPassword: field(formData, 'confirmPassword'),
    displayName: field(formData, 'displayName'),
    email: field(formData, 'email'),
    password: field(formData, 'password'),
    terms: field(formData, 'terms'),
    workspaceName: field(formData, 'workspaceName'),
    workspaceSlug: field(formData, 'workspaceSlug'),
  });
  if (!parsed.success) {
    redirectWithStatus('/register', 'invalid-input');
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase.auth.signUp({
    email: parsed.data.email,
    options: {
      data: {
        display_name: parsed.data.displayName,
        requested_tenant_name: parsed.data.workspaceName,
        requested_tenant_slug: parsed.data.workspaceSlug,
      },
      emailRedirectTo: `${applicationOrigin()}/auth/confirm?next=/dashboard`,
    },
    password: parsed.data.password,
  });
  if (result.error !== null || result.data.user === null) {
    redirectWithStatus('/register', 'registration-unavailable');
  }

  if (result.data.session !== null) {
    await createTenantForUser(supabase, result.data.user.id, {
      name: parsed.data.workspaceName,
      slug: parsed.data.workspaceSlug,
    });
    redirect('/dashboard');
  }

  redirectWithStatus('/login', 'check-email');
}

export async function requestPasswordResetAction(formData: FormData): Promise<never> {
  if (getEnvironment().mockMode) {
    redirectWithStatus('/forgot-password', 'mock-mode');
  }

  const parsed = RecoverySchema.safeParse({
    email: field(formData, 'email'),
  });
  if (!parsed.success) {
    redirectWithStatus('/forgot-password', 'invalid-input');
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${applicationOrigin()}/auth/confirm?next=/update-password`,
  });

  // Use the same response whether the address exists to reduce enumeration.
  redirectWithStatus('/login', 'recovery-sent');
}

export async function updatePasswordAction(formData: FormData): Promise<never> {
  if (getEnvironment().mockMode) {
    redirect('/dashboard');
  }

  const parsed = UpdatePasswordSchema.safeParse({
    confirmPassword: field(formData, 'confirmPassword'),
    password: field(formData, 'password'),
  });
  if (!parsed.success) {
    redirectWithStatus('/update-password', 'invalid-input');
  }

  const supabase = await createSupabaseServerClient();
  await requireVerifiedIdentity(supabase);
  const result = await supabase.auth.updateUser({ password: parsed.data.password });
  if (result.error !== null) {
    redirectWithStatus('/update-password', 'update-failed');
  }
  await supabase.auth.signOut({ scope: 'local' });
  redirectWithStatus('/login', 'password-updated');
}

export async function onboardingAction(formData: FormData): Promise<never> {
  if (getEnvironment().mockMode) {
    redirect('/dashboard');
  }

  const parsed = z
    .object({
      name: z.string().trim().min(1).max(120),
      slug: z.string(),
    })
    .safeParse({
      name: field(formData, 'workspaceName'),
      slug: field(formData, 'workspaceSlug'),
    });
  if (!parsed.success) {
    redirectWithStatus('/onboarding', 'invalid-input');
  }

  const setup = parseTenantSetup(parsed.data);
  const supabase = await createSupabaseServerClient();
  const identity = await requireVerifiedIdentity(supabase);
  await createTenantForUser(supabase, identity.userId, setup);
  redirect('/dashboard');
}

export async function logoutAction(): Promise<never> {
  if (!getEnvironment().mockMode) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect('/');
}
