import { NextResponse } from 'next/server';
import { buildRobokassaFormUnified, formatOutSum } from '../../../../lib/robokassa';
import { getRobokassaConfig } from '../../../../lib/robokassaConfig';

export const dynamic = 'force-dynamic';

/**
 * GET /api/robokassa/form?plan=trial|month&telegramUserId=...
 * 
 * Returns finalFields + signatureStringMasked for verification
 * Helps debug without Vercel logs
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const plan = url.searchParams.get('plan'); // 'trial' or 'month'
    const telegramUserIdParam = url.searchParams.get('telegramUserId');

    if (!plan || !['trial', 'month'].includes(plan)) {
      return NextResponse.json(
        { error: 'plan parameter must be "trial" or "month"' },
        { status: 400 }
      );
    }

    if (!telegramUserIdParam) {
      return NextResponse.json(
        { error: 'telegramUserId is required' },
        { status: 400 }
      );
    }

    const telegramUserId = Number(telegramUserIdParam);
    if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
      return NextResponse.json(
        { error: 'telegramUserId must be a positive number' },
        { status: 400 }
      );
    }

    // Get config
    const config = getRobokassaConfig();

    // Determine amount and description based on plan
    const outSum = plan === 'trial' ? '1.00' : '199.00';
    const description = plan === 'trial' ? 'Step One — trial 3 days' : 'Step One — monthly subscription';
    const recurringEnabled = plan === 'trial'; // Only trial is mother payment

    // Generate sample InvId (for testing - in production this comes from DB)
    const sampleInvId = String(Math.floor(Math.random() * 9000000 + 1000000));

    // Build form using unified function
    const formResult = buildRobokassaFormUnified({
      merchantLogin: config.merchantLogin,
      password1: config.pass1,
      outSum: outSum,
      invId: sampleInvId,
      description: description,
      telegramUserId: telegramUserId,
      receiptEnabled: true, // Always enabled
      recurringEnabled: recurringEnabled,
      isTest: config.isTest,
    });

    // Return safe debug info (no passwords)
    return NextResponse.json({
      plan,
      actionUrl: formResult.actionUrl,
      method: formResult.method,
      finalFields: formResult.fields, // Exact fields that will be posted
      fieldOrder: formResult.debug.fieldOrder,
      signatureStringMasked: formResult.debug.signatureStringMasked,
      signatureValue: formResult.debug.signatureValue,
      receiptEnabled: formResult.debug.receiptEnabled,
      hasReceiptInFinalFields: formResult.debug.hasReceiptInFinalFields,
      recurringEnabled: formResult.debug.recurringEnabled,
      hasRecurringInFinalFields: formResult.debug.hasRecurringInFinalFields,
      outSumFormatted: formResult.debug.outSumFormatted,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

