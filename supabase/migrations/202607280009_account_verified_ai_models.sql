-- Let the server persist exact provider-account model IDs while preserving
-- provider family and cost-tier boundaries. The server action additionally
-- verifies that the selected ID is present in the provider's authenticated
-- model-list response before invoking this service-role-only function.

create or replace function public.platform_admin_update_ai_model_mapping(
  actor_id uuid,
  target_provider text,
  target_tier text,
  target_model text,
  target_enabled boolean
)
returns public.ai_model_tier_mappings
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.ai_model_tier_mappings;
  model_matches_tier boolean;
begin
  if not exists (
    select 1
    from public.platform_admins
    where user_id = actor_id
      and role = 'super_admin'
      and active
  ) then
    raise exception using errcode = '42501', message = 'ADMIN_SUPER_ADMIN_REQUIRED';
  end if;

  model_matches_tier :=
    target_model ~ '^[A-Za-z0-9._:-]{2,120}$'
    and target_model !~* '(audio|computer-use|deep-research|embedding|imagen|image|live|moderation|realtime|robotics|search|transcribe|translation|tts)'
    and (
      (
        target_provider = 'openai'
        and target_model ~ '^gpt-[A-Za-z0-9.-]+$'
        and (
          (target_tier = 'economy' and target_model ~ '-(luna|mini|nano)(-|$)')
          or (target_tier = 'standard' and target_model ~ '-(terra|mini)(-|$)')
          or (
            target_tier = 'advanced'
            and (
              target_model ~ '-sol(-|$)'
              or (
                target_model ~ '^gpt-(4[.]1|5([.-][0-9]+)?)(-|$)'
                and target_model !~ '-(luna|mini|nano|terra)(-|$)'
              )
            )
          )
          or (target_tier = 'flagship' and target_model ~ '-sol(-|$)')
        )
      )
      or (
        target_provider = 'anthropic'
        and target_model ~ '^claude-(fable|haiku|opus|sonnet)-[A-Za-z0-9-]+$'
        and (
          (target_tier = 'economy' and target_model ~ '^claude-haiku-')
          or (target_tier = 'standard' and target_model ~ '^claude-sonnet-')
          or (target_tier = 'advanced' and target_model ~ '^claude-opus-')
          or (
            target_tier = 'flagship'
            and target_model ~ '^claude-(fable|opus)-'
          )
        )
      )
      or (
        target_provider = 'gemini'
        and target_model ~ '^gemini-[A-Za-z0-9.-]+$'
        and (
          (target_tier = 'economy' and target_model ~ 'flash-lite')
          or (
            target_tier = 'standard'
            and target_model ~ 'flash'
            and target_model !~ 'flash-lite'
          )
          or (
            target_tier = 'advanced'
            and (target_model ~ 'pro' or target_model ~ 'flash')
            and target_model !~ 'flash-lite'
          )
          or (target_tier = 'flagship' and target_model ~ 'pro')
        )
      )
    );

  if target_provider not in ('anthropic', 'gemini', 'openai')
    or target_tier not in ('economy', 'standard', 'advanced', 'flagship')
    or not model_matches_tier
  then
    raise exception using errcode = '22023', message = 'AI_MODEL_MAPPING_INVALID';
  end if;

  update public.ai_model_tier_mappings
  set
    model = target_model,
    enabled = target_enabled,
    updated_by = actor_id,
    updated_at = now()
  where provider = target_provider
    and tier = target_tier
  returning * into result;

  if result.provider is null then
    raise exception using errcode = 'P0002', message = 'AI_MODEL_MAPPING_NOT_FOUND';
  end if;

  insert into public.platform_admin_audit_logs (
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    actor_id,
    'ai_model_mapping.updated',
    'ai_model_tier_mapping',
    target_provider || ':' || target_tier,
    jsonb_build_object(
      'provider', target_provider,
      'tier', target_tier,
      'model', target_model,
      'enabled', target_enabled
    )
  );

  return result;
end;
$$;
