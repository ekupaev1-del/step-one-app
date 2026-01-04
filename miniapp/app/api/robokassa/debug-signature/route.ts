import { NextResponse } from 'next/server';
import { getRobokassaConfig } from '../../../../lib/robokassaConfig';
import { generateReceipt } from '../../../../lib/robokassa';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * GET /api/robokassa/debug-signature
 * 
 * Returns safe debug JSON for signature verification
 * Never exposes full passwords or secrets
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const outSum = url.searchParams.get('outSum') || '1.00';
    const invId = url.searchParams.get('invId') || '123456';
    const telegramUserId = url.searchParams.get('telegramUserId') || '497201688';
    const recurring = url.searchParams.get('recurring') === 'true';

    // Get config from env vars
    const config = getRobokassaConfig();

    // Generate Receipt (always with sno=npd)
    const receipt = generateReceipt(parseFloat(outSum), 'Step One — trial 3 days');
    const receiptJson = JSON.stringify(receipt, (key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value).sort().reduce((acc, k) => {
          acc[k] = value[k];
          return acc;
        }, {} as any);
      }
      return value;
    });
    const receiptEncoded = encodeURIComponent(receiptJson);

    // Build Shp_* params
    const shpParams: string[] = [];
    shpParams.push(`Shp_userId=${telegramUserId}`);
    shpParams.sort();

    // Build signature parts
    const signatureParts: string[] = [
      config.merchantLogin.trim(),
      outSum,
      invId,
      receiptEncoded, // Always included
      config.pass1.trim(),
      ...shpParams,
    ];

    // Calculate signature
    const signatureBaseString = signatureParts.join(':');
    const signatureMasked = signatureParts.map(p => 
      p === config.pass1.trim() ? '[PASSWORD1_HIDDEN]' : p
    ).join(':');
    
    const hash = createHash('md5').update(signatureBaseString).digest('hex').toLowerCase();
    const signatureValue = hash;

    // Build safe debug info
    const pass1Len = config.pass1.trim().length;
    const pass1Prefix2 = config.pass1.trim().substring(0, 2);
    const pass1Suffix2 = config.pass1.trim().substring(pass1Len - 2);
    const pass2Len = config.pass2.trim().length;
    const pass2Prefix2 = config.pass2.trim().substring(0, 2);
    const pass2Suffix2 = config.pass2.trim().substring(pass2Len - 2);

    return NextResponse.json({
      merchantLogin: config.merchantLogin,
      outSum,
      invId,
      recurring,
      shpSortedList: shpParams,
      receipt: {
        enabled: true,
        sno: receipt.sno,
        encodedLength: receiptEncoded.length,
      },
      signatureMaskedString: signatureMasked,
      signatureValue,
      env: {
        vercelEnv: process.env.VERCEL_ENV || 'not-set',
        nodeEnv: process.env.NODE_ENV || 'not-set',
        pass1Fingerprint: `${pass1Prefix2}...${pass1Suffix2} (len: ${pass1Len})`,
        pass2Fingerprint: `${pass2Prefix2}...${pass2Suffix2} (len: ${pass2Len})`,
        buildId: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'not-set',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
