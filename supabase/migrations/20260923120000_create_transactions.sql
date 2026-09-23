-- One row per payment attempt. The row is written before the signed request
-- leaves our server; tran_id links it to PayWay's records.
create table public.transactions (
  tran_id              text primary key check (tran_id ~ '^[A-Z0-9]{1,20}$'),
  sender_name          text not null check (char_length(sender_name) between 2 and 100),
  account_number       text not null check (account_number ~ '^[0-9]{6,20}$'),
  amount               bigint not null check (amount between 1 and 100000), -- whole riel
  currency             text not null default 'KHR' check (currency = 'KHR'),
  status               text not null default 'pending'
                       check (status in ('pending', 'approved', 'declined', 'cancelled', 'refunded', 'failed', 'review')),

  -- What PayWay told us, and how we know it
  payway_status        text,  -- Check transaction payment_status, e.g. APPROVED / PENDING / DECLINED
  payway_code          text,  -- payment_status_code, callback "status", or API status code
  payway_message       text,
  apv                  text,  -- approval code
  payment_type         text,  -- e.g. ABA Pay, KHQR, VISA
  bank_ref             text,
  verified_by          text check (verified_by in ('check_transaction', 'callback_signature')),

  -- First callback received, stored verbatim (it never contains our API key)
  callback_payload     jsonb,
  callback_signature   text check (callback_signature in ('valid', 'missing')),
  callback_received_at timestamptz,

  last_checked_at      timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger transactions_touch_updated_at
  before update on public.transactions
  for each row execute function public.touch_updated_at();

-- Only the server, using the service role key, may read or write payments.
-- RLS with no policies denies the public (anon/authenticated) API roles.
alter table public.transactions enable row level security;
revoke all on public.transactions from anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
