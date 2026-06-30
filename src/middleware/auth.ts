// ============================================================================
// Q-Dispatch — session-cookie authentication
// In-memory session store, 8 hour expiry, timing-safe credential comparison.
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const COOKIE_NAME = 'qdx_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

interface Session {
  expires: number;
}

const sessions = new Map<string, Session>();

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (session.expires < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual requires equal-length buffers; hash to fixed length so a
  // length mismatch does not leak via an early return or throw.
  const hashA = crypto.createHash('sha256').update(bufA).digest();
  const hashB = crypto.createHash('sha256').update(bufB).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expires < now) sessions.delete(token);
  }
}

// ----------------------------------------------------------------------------
// Middleware
// ----------------------------------------------------------------------------

export function requireLogin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Public paths exempt from auth.
  if (
    (req.method === 'GET' && (req.path === '/login' || req.path === '/welcome')) ||
    (req.method === 'POST' && req.path === '/api/auth/login')
  ) {
    return next();
  }

  const token = req.cookies?.[COOKIE_NAME];
  if (isValidSession(token)) {
    return next();
  }

  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Unauthorised' });
    return;
  }

  // Logged-out visitors land on the public marketing page, which funnels to
  // the login / live demo.
  res.redirect('/welcome');
}

// ----------------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------------

export function loginPage(_req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(LOGIN_HTML);
}

export function loginPost(req: Request, res: Response): void {
  const { username, password } = (req.body ?? {}) as {
    username?: string;
    password?: string;
  };

  const expectedUser = process.env.LOGIN_USER || '';
  const expectedPass = process.env.LOGIN_PASS || '';

  const userOk = timingSafeEqualStr(String(username ?? ''), expectedUser);
  const passOk = timingSafeEqualStr(String(password ?? ''), expectedPass);

  if (!userOk || !passOk) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  issueSession(res);
  res.json({ ok: true });
}

function issueSession(res: Response): void {
  pruneExpired();
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expires: Date.now() + SESSION_TTL_MS });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
  });
}

/**
 * One-click public demo entry — creates a session without credentials and
 * lands the visitor in the app. Disable for a real deployment with
 * PUBLIC_DEMO=false (then visitors must log in normally).
 */
export function demoLogin(_req: Request, res: Response): void {
  if (process.env.PUBLIC_DEMO === 'false') {
    res.redirect('/login');
    return;
  }
  issueSession(res);
  res.redirect('/');
}

export function logout(req: Request, res: Response): void {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) sessions.delete(token);
  res.clearCookie(COOKIE_NAME);
  res.redirect('/login');
}

// ----------------------------------------------------------------------------
// Login page markup
// ----------------------------------------------------------------------------

const LOGIN_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Q-Dispatch — Sign in</title>
  <style>
    :root {
      --navy: #1A2233;
      --amber: #BA7517;
      --amber-light: #FAEEDA;
      --danger: #A32D2D;
      --danger-bg: #FCEBEB;
      --bg: #F5F5F5;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg);
      font-family: Arial, system-ui, sans-serif;
      color: var(--navy);
    }
    .card {
      background: #fff;
      width: 360px;
      max-width: 92vw;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(26,34,51,0.12);
      padding: 32px 30px 26px;
    }
    .badge {
      display: inline-block;
      background: var(--amber);
      color: #fff;
      font-weight: bold;
      font-size: 13px;
      letter-spacing: 0.6px;
      padding: 5px 12px;
      border-radius: 999px;
    }
    h1 { font-size: 20px; margin: 20px 0 4px; }
    p.sub { margin: 0 0 22px; color: #6b7280; font-size: 13px; }
    label { display: block; font-size: 12px; color: #6b7280; margin: 14px 0 5px; }
    input {
      width: 100%;
      padding: 11px 12px;
      border: 1px solid #d8dbe0;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
    }
    input:focus { outline: 2px solid var(--amber); border-color: var(--amber); }
    button {
      width: 100%;
      margin-top: 22px;
      padding: 12px;
      background: var(--navy);
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: bold;
      cursor: pointer;
    }
    button:hover { background: #12192a; }
    button:disabled { opacity: 0.6; cursor: default; }
    .error {
      display: none;
      margin-top: 16px;
      padding: 10px 12px;
      background: var(--danger-bg);
      color: var(--danger);
      border: 1px solid #f1c4c4;
      border-radius: 8px;
      font-size: 13px;
    }
    .error.show { display: block; }
    footer { text-align: center; margin-top: 22px; color: #9aa1ad; font-size: 12px; }
  </style>
</head>
<body>
  <form class="card" id="loginForm" autocomplete="on">
    <span class="badge">Q-DISPATCH</span>
    <h1>Sign in</h1>
    <p class="sub">Quantum AI Ltd. — claim dispatch console</p>

    <label for="username">Username</label>
    <input id="username" name="username" type="text" autocomplete="username" required />

    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required />

    <div class="error" id="error"></div>

    <button type="submit" id="submitBtn">Sign in</button>

    <footer>© 2025 Quantum AI Ltd.</footer>
  </form>

  <script>
    const form = document.getElementById('loginForm');
    const errorEl = document.getElementById('error');
    const btn = document.getElementById('submitBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.classList.remove('show');
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            username: document.getElementById('username').value,
            password: document.getElementById('password').value
          })
        });
        if (res.ok) {
          window.location.href = '/';
          return;
        }
        const data = await res.json().catch(() => ({}));
        errorEl.textContent = data.error || 'Sign in failed.';
        errorEl.classList.add('show');
      } catch (err) {
        errorEl.textContent = 'Network error — please try again.';
        errorEl.classList.add('show');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    });
  </script>
</body>
</html>`;
