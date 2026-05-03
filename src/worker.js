/**
 * Polymarket Cron Worker
 *
 * Triggers GitHub Actions workflow_dispatch for both Polymarket watch repos
 * every 5 minutes — bypassing GitHub's unreliable scheduled workflow throttling.
 *
 * Required secret (set via `wrangler secret put GITHUB_TOKEN`):
 *   GITHUB_TOKEN — fine-grained PAT with Actions: Read & Write on both repos
 */

const REPOS = [
  { repo: 'shtanga0x/polymarket_watch',      ref: 'main'   },
  { repo: 'shtanga0x/polymarket_core',        ref: 'master' },
];

async function triggerWorkflow(repo, ref, token) {
  const url = `https://api.github.com/repos/${repo}/actions/workflows/update-data.yml/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'polymarket-cron-worker/1.0',
    },
    body: JSON.stringify({ ref }),
  });

  // 204 No Content = success; anything else = problem
  if (res.status !== 204) {
    const body = await res.text();
    console.error(`[${repo}] trigger failed: ${res.status} ${body}`);
  } else {
    console.log(`[${repo}] triggered OK`);
  }
  return res.status;
}

export default {
  // Cron handler — fires on the schedule defined in wrangler.toml
  async scheduled(_event, env, _ctx) {
    if (!env.GITHUB_TOKEN) {
      console.error('GITHUB_TOKEN secret not set');
      return;
    }
    await Promise.all(
      REPOS.map(({ repo, ref }) => triggerWorkflow(repo, ref, env.GITHUB_TOKEN))
    );
  },

  // HTTP handler — useful for manual test: curl https://<worker>.workers.dev/trigger
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/trigger') {
      return new Response('polymarket-cron-worker is running', { status: 200 });
    }
    if (!env.GITHUB_TOKEN) {
      return new Response('GITHUB_TOKEN not set', { status: 500 });
    }
    const results = await Promise.all(
      REPOS.map(({ repo, ref }) =>
        triggerWorkflow(repo, ref, env.GITHUB_TOKEN).then(status => `${repo}: ${status}`)
      )
    );
    return new Response(results.join('\n'), { status: 200 });
  },
};
