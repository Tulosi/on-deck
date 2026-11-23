-- Background job log for Settings → Status: one row per run of each scheduled job ("daily", "keyshop").
-- No personal data: summaries are counts and error codes. Written by the jobs (service role); any signed-in
-- user can read it.
create table job_runs (
  id       bigint generated always as identity primary key,
  job      text not null,
  ran_at   timestamptz not null default now(),
  ok       boolean not null,
  summary  jsonb not null default '{}'
);
create index job_runs_recent on job_runs (job, ran_at desc);

alter table job_runs enable row level security;
create policy "read job runs" on job_runs for select to authenticated using (true);

grant select on job_runs to authenticated;
grant all on job_runs to service_role;
