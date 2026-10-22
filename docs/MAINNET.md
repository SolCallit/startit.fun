# Going to mainnet

Startit runs on devnet or mainnet from one setting. Nothing in the code changes between them.

## The model

- **Two deployments, two databases.** Keep the current Vercel project + Supabase project as **devnet staging**.
  Mainnet gets its **own Supabase project** (run `db/supabase-setup.sql` once) and its own Vercel project or
  production environment on the real domain. Devnet test coins, settings and wallets never mix with real ones.
- **Two keys to open mainnet launches.** `NEXT_PUBLIC_SOLANA_NETWORK=mainnet` switches the network.
  Launches stay refused until `MAINNET_LAUNCHES_ENABLED=true` is also set. Flip the second one last.

## Environment variables (mainnet deployment)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SOLANA_NETWORK` | `mainnet` |
| `MAINNET_LAUNCHES_ENABLED` | `true` only when ready to accept real launches |
| `SOLANA_RPC_URL` | Paid mainnet RPC (Helius Developer or better). Never the public endpoint. |
| `NEXT_PUBLIC_SITE_URL` | The final domain, e.g. `https://startit.fun`. **Set before the first launch**: every coin's metadata URL is written on-chain with it, permanently. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | The **mainnet** Supabase project |
| `ANTHROPIC_API_KEY`, `SCREENING_MODEL` | Turns on AI screening (otherwise everything goes to manual review) |
| `VIEW_SALT` | Any long random string (coin page view counter) |
| `CRON_SECRET` | Long random string; protects the fee-indexer and screening cron routes |
| `PAYOUT_SIGNING_SECRET` | Long random string for payout approvals (new value, not devnet's) |
| `NEXT_PUBLIC_FEE_ROUTER` | The mainnet Fee Router (Squads vault) address, shown on the public Fees page |

## What switches automatically

- Raydium LaunchLab program and authority (devnet `DRay6f…` → mainnet `LanMV9…`), CPMM program, SDK cluster.
- The network stored on new launches and quote tokens, and the checks that refuse a launch or trade on the wrong network.
- Wallet signing chain (`solana:mainnet`), Solscan / Explorer links, on-screen labels.
- Pair picker: on mainnet only mainnet pairs (plus SOL) are offered.
- Before building a launch, the server checks the saved LaunchLab platform account exists on this network and is owned
  by LaunchLab, so a devnet setting can't be used on mainnet by mistake.

## One-time setup on mainnet (in order)

1. **Admin wallet.** Use a hardware wallet or a Squads multisig, not a browser hot wallet. Add it as admin in the new Supabase project.
2. **Fee Router.** Create a Squads multisig vault; paste its address in Admin → Settings.
3. **Create the LaunchLab platform** (Admin → Settings → Sign and send). Then **redirect CPMM creator fees** to the Fee Router.
4. **Sync mainnet pairs**, list the ones you want, and send the allow transaction for any non-SOL pair.
5. **Community treasuries**: one Squads multisig per coin (the launch form explains it).
6. Set `MAINNET_LAUNCHES_ENABLED=true` and redeploy.

## Before step 6

- Full devnet run of the starter-signed launch (coin + starter's buy in one transaction), trading, and one fee
  collection → split → payout cycle.
- External review of the app's authorization, transaction building and payouts.
- Legal review of Terms of Use and risk disclosures.
- Error alerts (Sentry), Supabase daily backups / PITR, and an incident playbook (pause payouts, suspend a coin).
