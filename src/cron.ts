// ============================================================================
// Q-Dispatch — scheduler (node-cron)
// Polls the reply inbox every 90 seconds.
// ============================================================================

import cron from 'node-cron';
import { checkInboxForReplies } from './inbox';

const POLL_EXPRESSION = '*/90 * * * * *'; // spec: every 90 seconds
const POLL_INTERVAL_MS = 90 * 1000;

let polling = false;

async function runPoll(): Promise<void> {
  if (polling) {
    // Never let a slow poll overlap the next tick.
    console.log(`[cron] ${new Date().toISOString()} poll skipped (busy)`);
    return;
  }
  polling = true;
  const startedAt = new Date().toISOString();
  console.log(`[cron] ${startedAt} inbox poll started`);
  try {
    await checkInboxForReplies();
    console.log(`[cron] ${new Date().toISOString()} inbox poll complete`);
  } catch (err) {
    console.error(
      `[cron] ${new Date().toISOString()} inbox poll failed:`,
      err instanceof Error ? err.message : err
    );
  } finally {
    polling = false;
  }
}

export function startCron(): void {
  // Primary path: schedule with node-cron using the spec's 6-field expression.
  // Some node-cron releases accept "*/90 * * * * *" (firing at the top of each
  // minute); others reject a seconds step > 59. If validation fails we fall
  // back to a true 90-second interval so inbox surveillance always runs.
  if (cron.validate(POLL_EXPRESSION)) {
    cron.schedule(POLL_EXPRESSION, () => {
      void runPoll();
    });
    console.log(`[cron] scheduled inbox poll: ${POLL_EXPRESSION}`);
  } else {
    setInterval(() => {
      void runPoll();
    }, POLL_INTERVAL_MS);
    console.log(
      `[cron] scheduled inbox poll: every ${POLL_INTERVAL_MS / 1000}s (node-cron cannot express a 90s step)`
    );
  }

  // Kick an initial poll shortly after boot so we don't wait a full cycle.
  setTimeout(() => {
    void runPoll();
  }, 5000);
}
