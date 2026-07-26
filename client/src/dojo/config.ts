import { getProfileConfig, type ProfileConfig, type ProfileName } from '@/dojo/profiles';

//
// The active profile. Everything chain-dependent reads `PROFILE` — never an env var directly.
//
// Mainnet is the default; `NEXT_PUBLIC_PROFILE=sepolia` switches networks. RPC and Torii URLs
// can be overridden one at a time, which is how a profile gets pointed at a local Torii.
// `process.env.NEXT_PUBLIC_*` is inlined at build time, so these must stay literal reads.
//
export const PROFILE_NAME: ProfileName =
  (process.env.NEXT_PUBLIC_PROFILE as ProfileName) || 'mainnet';

export const PROFILE: ProfileConfig = getProfileConfig(PROFILE_NAME);

PROFILE.rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || PROFILE.rpcUrl;
PROFILE.toriiUrl = process.env.NEXT_PUBLIC_TORII_URL || PROFILE.toriiUrl;
