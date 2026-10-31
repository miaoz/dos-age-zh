import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
  console.error('请在 .env 或环境变量中配置 CLOUDFLARE_ACCOUNT_ID 与 CLOUDFLARE_API_TOKEN。');
  process.exit(1);
}
const check = spawnSync(process.execPath, ['tools/check.mjs'], {stdio:'inherit'});
if (check.status !== 0) process.exit(check.status || 1);
const cli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const result = spawnSync(process.execPath, [cli, 'pages', 'deploy', 'dist', '--project-name=dos-age-zh', '--branch=main', ...process.argv.slice(2)], {
  stdio: 'inherit', env: {...process.env, WRANGLER_SEND_METRICS:'false'}
});
process.exit(result.status || (result.error ? 1 : 0));
