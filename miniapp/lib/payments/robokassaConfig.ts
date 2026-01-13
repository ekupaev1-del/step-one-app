/**
 * Unified Robokassa Configuration Helper
 * 
 * Reads env vars from ROBOKASSA_* (primary) with ROBO_* fallback (backward compatibility)
 * Never exposes secrets - only booleans and status
 */

export interface RobokassaConfig {
  configured: boolean;
  merchantLogin?: string;
  password1?: string;
  password2?: string;
  isTest: boolean;
  source: "ROBOKASSA_*" | "ROBO_*" | "mixed" | "none";
  envVarStatus: {
    robokassaMerchantLogin: boolean;
    robokassaPassword1: boolean;
    robokassaPassword2: boolean;
    roboMerchantLogin: boolean;
    roboPassword1: boolean;
    roboPassword2: boolean;
  };
  missingEnvVars: string[];
}

/**
 * Get Robokassa configuration from environment variables
 * Primary: ROBOKASSA_* (new naming)
 * Fallback: ROBO_* (backward compatibility)
 */
export function getRobokassaConfig(): RobokassaConfig {
  // Primary: ROBOKASSA_* (new naming)
  const robokassaMerchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
  const robokassaPassword1 = process.env.ROBOKASSA_PASSWORD1;
  const robokassaPassword2 = process.env.ROBOKASSA_PASSWORD2;
  const robokassaIsTest = process.env.ROBOKASSA_IS_TEST === "true";

  // Fallback: ROBO_* (backward compatibility)
  const roboMerchantLogin = process.env.ROBO_MERCHANT_LOGIN;
  const roboPassword1 = process.env.ROBO_PASSWORD1;
  const roboPassword2 = process.env.ROBO_PASSWORD2;
  const roboIsTest = process.env.ROBO_IS_TEST === "true";

  // Determine source
  const hasRobokassa = !!(robokassaMerchantLogin || robokassaPassword1 || robokassaPassword2);
  const hasRobo = !!(roboMerchantLogin || roboPassword1 || roboPassword2);
  let source: "ROBOKASSA_*" | "ROBO_*" | "mixed" | "none" = "none";
  if (hasRobokassa && hasRobo) {
    source = "mixed";
  } else if (hasRobokassa) {
    source = "ROBOKASSA_*";
  } else if (hasRobo) {
    source = "ROBO_*";
  }

  // Use primary (ROBOKASSA_*) with fallback to ROBO_*
  const merchantLogin = robokassaMerchantLogin || roboMerchantLogin;
  const password1 = robokassaPassword1 || roboPassword1;
  const password2 = robokassaPassword2 || roboPassword2;
  const isTest = robokassaIsTest || roboIsTest;

  // Check what's missing
  const missingEnvVars: string[] = [];
  if (!merchantLogin) {
    missingEnvVars.push("ROBOKASSA_MERCHANT_LOGIN (or ROBO_MERCHANT_LOGIN)");
  }
  if (!password1) {
    missingEnvVars.push("ROBOKASSA_PASSWORD1 (or ROBO_PASSWORD1)");
  }
  if (!password2) {
    missingEnvVars.push("ROBOKASSA_PASSWORD2 (or ROBO_PASSWORD2)");
  }

  return {
    configured: !!(merchantLogin && password1 && password2),
    merchantLogin,
    password1,
    password2,
    isTest,
    source,
    envVarStatus: {
      robokassaMerchantLogin: !!robokassaMerchantLogin,
      robokassaPassword1: !!robokassaPassword1,
      robokassaPassword2: !!robokassaPassword2,
      roboMerchantLogin: !!roboMerchantLogin,
      roboPassword1: !!roboPassword1,
      roboPassword2: !!roboPassword2,
    },
    missingEnvVars,
  };
}
