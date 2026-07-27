# Usage control and Microsoft Store entitlements

## Commerce boundary

Microsoft Store subscription add-ons are the only paid-commerce source for the
first release. The Web application does not collect card details, create a
second checkout, or treat a manually selected plan as proof of purchase.

The Windows application obtains a short-lived Store ID key for its signed-in
customer and sends it to the authenticated server endpoint:

```text
Windows app
  -> POST /api/store/entitlements/sync
  -> server validates the caller's Tenant role and Store ID key
  -> server obtains a Microsoft Entra service token
  -> Microsoft Store subscription recurrence query
  -> exact productId + skuId mapping
  -> Supabase entitlement and plan synchronization
```

The Store ID key, Microsoft access token, and client secret are never written
to PostgreSQL, audit metadata, browser state, or application logs. The database
stores only the external subscription identifier, mapped plan, entitlement
state, timestamps, and a response hash suitable for reconciliation.

Microsoft documents that the subscription recurrence query is available only
to developer accounts that Microsoft has provisioned for the API, and that it
is not available to most developer accounts. Confirm access with Partner Center
or Microsoft before relying on the Production synchronization path. See the
[Microsoft subscription service documentation](https://learn.microsoft.com/en-us/windows/uwp/monetize/get-subscriptions-for-a-user).

## Server-only configuration

Configure these values only in Vercel's protected server environment. None may
use a `NEXT_PUBLIC_` prefix.

| Variable                        | Purpose                                                |
| ------------------------------- | ------------------------------------------------------ |
| `MICROSOFT_STORE_TENANT_ID`     | Microsoft Entra tenant used for service authentication |
| `MICROSOFT_STORE_CLIENT_ID`     | Approved Microsoft Store service application           |
| `MICROSOFT_STORE_CLIENT_SECRET` | Service credential stored only in the secret manager   |
| `MICROSOFT_STORE_PLAN_MAPPINGS` | Exact Store product/SKU to application-plan mapping    |

Example mapping with placeholder identifiers:

```json
[
  { "plan": "pro", "productId": "STORE_PRODUCT_ID", "skuId": "monthly" },
  { "plan": "team", "productId": "STORE_PRODUCT_ID", "skuId": "team-monthly" }
]
```

The ordinary user interface never displays configuration details. Platform
administration displays only whether all required values are configured and
the number of mappings.

## Monthly allowances

The application converts metered activity into bounded monthly allowances. AI
costs use an internal, versioned, conservative rate card for safety decisions;
they are estimates and are not Microsoft or AI-provider invoices.

| Plan     | AI budget | AI requests/minute | Text-source bytes/month | Tool calls/month |
| -------- | --------: | -----------------: | ----------------------: | ---------------: |
| Free     |    NT$ 10 |                  3 |                  20 MiB |              100 |
| Pro      |   NT$ 150 |                 10 |                   1 GiB |            2,500 |
| Team     |   NT$ 550 |                 30 |                  10 GiB |           10,000 |
| Business | NT$ 1,700 |                 60 |                  50 GiB |           50,000 |

Each individual accepted text source remains capped at 1 MiB, with a separate
16,000-character model-context ceiling. Monthly source allowance does not
expand file type, per-file, context, filesystem, or tool authority.

## Enforcement

- Before an AI request, the server reserves the maximum conservative cost for
  that bounded operation.
- A reservation is Tenant-scoped, idempotent, rate-limited, and expires after
  15 minutes if a process cannot finish normally.
- Successful or failed provider usage records the actual metered cost and
  atomically releases the reservation.
- A final cleanup releases an unused reservation without reducing recorded
  usage.
- Source bytes and tool calls use database-side atomic allowance consumption.
- 80% is a warning, 95% is a critical warning, and 100% fails closed.
- Missing or inconsistent Production usage state fails closed instead of
  allowing unaccounted requests.
- A Super Admin internal override is auditable, clears stale external
  entitlement metadata, and is excluded from Store revenue estimates.

The operations dashboard estimates gross catalog revenue, an operational net
amount after an assumed 15% Store fee, AI cost, and margin. Actual fees, taxes,
refunds, foreign exchange, and payout adjustments must be reconciled against
Partner Center statements.

## Production setup

1. Reserve and configure subscription add-ons in Partner Center.
2. Confirm that Microsoft has provisioned the developer account for the
   recurrence-query API.
3. Configure exact product/SKU mappings and the three Microsoft service
   credentials in Vercel Production.
4. Apply all immutable Supabase migrations.
5. Build and install the Store-associated Windows package.
6. Obtain a real short-lived Store ID key inside that package.
7. Test active, grace/dunning, canceled, unknown SKU, expired key, replay, and
   cross-Tenant denial cases in staging.
8. Compare dashboard estimates with Partner Center statements before opening
   paid plans.

The server endpoint and database synchronization boundary are implemented, but
the Store package has not been submitted or certified and the signed Windows
client has not yet been connected to the endpoint. A local build or GitHub push
must not be described as a live Store subscription flow.
