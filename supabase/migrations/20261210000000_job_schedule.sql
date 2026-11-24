-- Background jobs on Supabase's own scheduler (pg_cron), instead of GitHub Actions' `schedule`, which ran them
-- hours late or skipped them (the 3-hourly job was running about every 12 hours).
--   on-deck-daily    every 3 hours: calls the `daily` Edge Function directly.
--   on-deck-keyshop  every 6 hours: starts the "Key-shop prices" GitHub workflow (workflow_dispatch). That job has
--                    to run on GitHub because gg.deals refuses Supabase's servers; a dispatched run starts within
--                    seconds, unlike GitHub's own timer.
--
-- Secrets live in Supabase Vault, added by hand in the SQL editor (never in this file):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as the JOB_SECRET function secret>', 'job_secret');
--   select vault.create_secret('<GitHub fine-grained token: this repo, Actions read and write>', 'github_dispatch_token');
-- Until they're there, each run logs a warning and does nothing.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists jobs;
revoke all on schema jobs from public;

create or replace function jobs.secret(secret_name text) returns text
language sql security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1 $$;

create or replace function jobs.run_daily() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  base text := jobs.secret('project_url');
  key  text := jobs.secret('job_secret');
begin
  if base is null or key is null then
    raise warning 'on-deck-daily: add project_url and job_secret to Vault';
    return;
  end if;
  perform net.http_post(
    url := base || '/functions/v1/daily',
    headers := jsonb_build_object('x-job-secret', key, 'content-type', 'application/json'),
    body := '{}'::jsonb,
    -- The job does what fits in about two minutes.
    timeout_milliseconds := 180000
  );
end $$;

create or replace function jobs.start_keyshop() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  token text := jobs.secret('github_dispatch_token');
begin
  if token is null then
    raise warning 'on-deck-keyshop: add github_dispatch_token to Vault';
    return;
  end if;
  perform net.http_post(
    url := 'https://api.github.com/repos/Tulosi/on-deck/actions/workflows/keyshop-prices.yml/dispatches',
    headers := jsonb_build_object(
      'authorization', 'Bearer ' || token,
      'accept', 'application/vnd.github+json',
      'x-github-api-version', '2022-11-28',
      'user-agent', 'on-deck-scheduler',
      'content-type', 'application/json'
    ),
    body := '{"ref": "main"}'::jsonb
  );
end $$;

revoke all on all functions in schema jobs from public, anon, authenticated;

-- Same minutes past the hour as the old GitHub timers. cron.schedule with a name replaces an existing job.
select cron.schedule('on-deck-daily', '41 */3 * * *', 'select jobs.run_daily()');
select cron.schedule('on-deck-keyshop', '17 */6 * * *', 'select jobs.start_keyshop()');
