# AI Provider setup

AI Workflow Studio supports OpenAI, Claude, and Gemini through server-only
environment variables. Ordinary registered users never enter, read, or manage
provider keys. The platform administrator configures one or more providers in
Vercel, and the user interface displays only the available provider label and
generation level.

## Create the keys

### OpenAI

1. Sign in to the [OpenAI API Platform](https://platform.openai.com/).
2. Select or create a Project.
3. Open **Project settings → API Keys**.
4. Select **Create new secret key**.
5. Prefer a Restricted key when the available permission controls cover the
   application workload.
6. Copy the value once and store it in a password manager or secrets manager.

The server variable name is `OPENAI_API_KEY`.

Official reference:
[Managing projects and API keys](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform).

### Claude / Anthropic

1. Sign in to the [Claude Console](https://platform.claude.com/).
2. Select the intended Workspace.
3. Open **Settings → API keys**.
4. Create a standard Claude API key, choose an appropriate expiration, and copy
   it into a secrets manager.
5. Do not use an Admin API key for model requests.

The server variable name is `ANTHROPIC_API_KEY`.

Official reference:
[Claude authentication](https://platform.claude.com/docs/en/manage-claude/authentication).

### Gemini

1. Sign in to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Accept the Gemini API terms if prompted.
3. Select or import the Google Cloud project that will own billing and quota.
4. Create the API key and restrict the owning project and API usage where
   Google Cloud controls allow it.
5. Copy the key into a secrets manager.

The server variable name is `GEMINI_API_KEY`.

Official reference:
[Using Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key).

## Store the key in Vercel

For each enabled provider:

1. Open the Vercel Project.
2. Go to **Settings → Environment Variables**.
3. Add exactly one of `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or
   `GEMINI_API_KEY`.
4. Mark the variable **Sensitive**.
5. Enable it for **Production**. Enable **Preview** only when Preview
   deployments are intended to make billable provider calls.
6. Save the variable and redeploy. Vercel environment changes apply only to new
   deployments.

Optional model overrides are `OPENAI_MODEL`, `ANTHROPIC_MODEL`, and
`GEMINI_MODEL`. Leave them unset to use the application defaults. None of these
variables may use the `NEXT_PUBLIC_` prefix.

Vercel references:

- [Environment variables](https://vercel.com/docs/environment-variables)
- [Sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)

## Important boundaries

- Never paste an API key into chat, a screenshot, GitHub, source code, a browser
  form, or an issue.
- A Vercel variable's 64 KB project/runtime allowance is unrelated to Website
  Studio or assistant source uploads. Assistant sources currently allow
  `.txt`, `.md`, `.csv`, and `.json` files up to 1 MiB each.
- If no provider is configured in a Production Supabase deployment, Ask, Plan,
  source attachment, and Website Spec generation fail closed. This is expected.
- Ask mode is read-only. Plan mode may produce only validated Workflow JSON.
  Execution additionally requires a versioned draft, risk review, any required
  approval, and an authorized Desktop Agent.
