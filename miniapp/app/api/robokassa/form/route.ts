import { NextResponse } from 'next/server';
import { buildForm } from '../../../../lib/robokassa';

export const dynamic = 'force-dynamic';

/**
 * GET /api/robokassa/form?plan=month&userId=...
 * 
 * Returns form data for Robokassa payment
 * No secrets exposed
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const plan = url.searchParams.get('plan');
    const userIdParam = url.searchParams.get('userId');

    if (!plan || plan !== 'month') {
      return NextResponse.json(
        { error: 'plan parameter must be "month"' },
        { status: 400 }
      );
    }

    if (!userIdParam) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    const userId = Number(userIdParam);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json(
        { error: 'userId must be a positive number' },
        { status: 400 }
      );
    }

    // Build form
    const formData = buildForm(plan, userId);

    // Return safe debug info (no passwords)
    return NextResponse.json({
      actionUrl: formData.actionUrl,
      fields: formData.fieldsObject,
      fieldsOrder: formData.fieldsOrder,
      signatureStringMasked: formData.signatureStringMasked,
      debug: formData.debug,
    });
  } catch (error: any) {
    console.error('[robokassa/form] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
