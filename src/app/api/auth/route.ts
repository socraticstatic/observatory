import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD ?? 'observatory';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const res = NextResponse.json({ ok: true });

  if (body.action === 'logout') {
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    session.destroy();
    return res;
  }

  if (body.password !== DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  session.isLoggedIn = true;
  await session.save();
  return res;
}
