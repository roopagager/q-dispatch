// ============================================================================
// Q-Dispatch — inbound reply surveillance (node-imap)
// Polls the reply inbox, matches tracking tokens, parses TPA decisions.
// ============================================================================

import Imap from 'node-imap';
import {
  listDispatchedClaims,
  setClaimReplied,
  addAuditLog,
  getClaim,
} from './db';
import { parseTPAReply } from './ai';
import { Claim } from './types';

let lastPolledAt: string | null = null;

export function getLastPolledAt(): string | null {
  return lastPolledAt;
}

// ----------------------------------------------------------------------------
// MIME -> best-effort plain text
// node-imap gives us raw body parts; we have no mailparser dependency, so we
// decode the common transfer encodings and strip HTML to recover readable text.
// ----------------------------------------------------------------------------

function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, '') // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function stripHtml(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/**
 * Turn a raw fetched body (which may be multipart MIME or a single part) into
 * a readable plain-text string suitable for token matching and AI parsing.
 */
export function rawBodyToText(raw: string): string {
  let text = raw;

  // If this looks like a multipart message, prefer a text/plain part, else
  // fall back to a text/html part.
  const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = raw.split(
      new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')
    );
    let plain = '';
    let html = '';
    for (const part of parts) {
      const headerEnd = part.search(/\r?\n\r?\n/);
      if (headerEnd === -1) continue;
      const headers = part.slice(0, headerEnd).toLowerCase();
      let body = part.slice(headerEnd).replace(/^\r?\n\r?\n/, '');
      if (/content-transfer-encoding:\s*quoted-printable/.test(headers)) {
        body = decodeQuotedPrintable(body);
      } else if (/content-transfer-encoding:\s*base64/.test(headers)) {
        try {
          body = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString(
            'utf8'
          );
        } catch {
          /* keep as-is */
        }
      }
      if (/content-type:\s*text\/plain/.test(headers)) {
        plain += body + '\n';
      } else if (/content-type:\s*text\/html/.test(headers)) {
        html += body + '\n';
      }
    }
    if (plain.trim()) {
      text = plain;
    } else if (html.trim()) {
      text = stripHtml(html);
    }
  } else if (/<[a-z][\s\S]*>/i.test(raw) && /<\/(p|div|body|table)>/i.test(raw)) {
    text = stripHtml(raw);
  }

  return text.replace(/\r\n/g, '\n').trim();
}

// ----------------------------------------------------------------------------
// Token matching
// ----------------------------------------------------------------------------

function findMatchingClaim(body: string, claims: Claim[]): Claim | null {
  for (const claim of claims) {
    if (claim.tracking_token && body.includes(claim.tracking_token)) {
      return claim;
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// Apply a parsed reply to a claim (shared with the simulate-reply route)
// ----------------------------------------------------------------------------

export async function applyReplyToClaim(
  claimId: string,
  emailBody: string,
  token: string
) {
  const parsed = await parseTPAReply(emailBody, token);

  setClaimReplied(claimId, {
    tpa_reply_raw: emailBody,
    tpa_decision: parsed.decision,
    approved_amount: parsed.approved_amount,
    deduction_amount: parsed.deduction_amount,
    deduction_reasons: parsed.deduction_reasons,
    documents_requested: parsed.documents_requested,
    approval_ref: parsed.approval_ref,
  });

  addAuditLog(claimId, 'REPLY', {
    token,
    parsed,
    received_at: new Date().toISOString(),
  });

  return parsed;
}

// ----------------------------------------------------------------------------
// Poll
// ----------------------------------------------------------------------------

function imapConfig(): Imap.Config {
  return {
    user: process.env.IMAP_USER || '',
    password: process.env.IMAP_PASS || '',
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 15000,
    connTimeout: 15000,
  };
}

export async function checkInboxForReplies(): Promise<void> {
  lastPolledAt = new Date().toISOString();

  // Nothing to match against — skip the network round-trip entirely.
  const dispatched = listDispatchedClaims();
  if (dispatched.length === 0) {
    return;
  }

  // Credentials not configured — do not attempt to connect.
  if (!process.env.IMAP_USER || !process.env.IMAP_PASS) {
    console.warn('[inbox] IMAP credentials not configured — skipping poll.');
    return;
  }

  await new Promise<void>((resolve) => {
    const imap = new Imap(imapConfig());
    let settled = false;

    const done = () => {
      if (settled) return;
      settled = true;
      try {
        imap.end();
      } catch {
        /* ignore */
      }
      resolve();
    };

    imap.once('error', (err: Error) => {
      console.error('[inbox] IMAP error:', err.message);
      done();
    });

    imap.once('end', () => {
      resolve();
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (boxErr) => {
        if (boxErr) {
          console.error('[inbox] openBox error:', boxErr.message);
          return done();
        }

        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        imap.search(['UNSEEN', ['SINCE', since]], (searchErr, uids) => {
          if (searchErr) {
            console.error('[inbox] search error:', searchErr.message);
            return done();
          }
          if (!uids || uids.length === 0) {
            return done();
          }

          const fetch = imap.fetch(uids, { bodies: '', markSeen: false });
          const pending: Array<{ uid: number; raw: string }> = [];

          fetch.on('message', (msg, seqno) => {
            let raw = '';
            let uid = seqno;
            msg.on('attributes', (attrs) => {
              uid = attrs.uid;
            });
            msg.on('body', (stream) => {
              stream.on('data', (chunk: Buffer) => {
                raw += chunk.toString('utf8');
              });
            });
            msg.once('end', () => {
              pending.push({ uid, raw });
            });
          });

          fetch.once('error', (fErr) => {
            console.error('[inbox] fetch error:', fErr.message);
            done();
          });

          fetch.once('end', () => {
            void (async () => {
              const claims = listDispatchedClaims();
              for (const { uid, raw } of pending) {
                try {
                  const body = rawBodyToText(raw);
                  const claim = findMatchingClaim(body, claims);
                  if (claim) {
                    await applyReplyToClaim(
                      claim.id,
                      body,
                      claim.tracking_token!
                    );
                    console.log(
                      `[inbox] matched reply for ${claim.tracking_token} (claim ${claim.id})`
                    );
                    // Refresh so a second email cannot re-match the same claim.
                    const refreshed = getClaim(claim.id);
                    if (refreshed) {
                      const idx = claims.findIndex((c) => c.id === claim.id);
                      if (idx >= 0) claims.splice(idx, 1);
                    }
                  }
                  // Mark as seen regardless so we don't reprocess endlessly.
                  imap.addFlags(uid, ['\\Seen'], () => {
                    /* best effort */
                  });
                } catch (procErr) {
                  console.error(
                    '[inbox] processing error:',
                    procErr instanceof Error ? procErr.message : procErr
                  );
                }
              }
              done();
            })();
          });
        });
      });
    });

    try {
      imap.connect();
    } catch (connErr) {
      console.error(
        '[inbox] connect error:',
        connErr instanceof Error ? connErr.message : connErr
      );
      done();
    }
  });
}
