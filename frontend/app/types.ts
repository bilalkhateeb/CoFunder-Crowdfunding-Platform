export type RoundInfo = {
  id: number;
  rate: bigint;
  softCapWei: bigint;
  endTime: bigint;
  totalRaised: bigint;
  finalized: boolean;
  successful: boolean;
  fundsWithdrawn: boolean;
  title: string;
  description: string;
  userContribution: bigint;
  userEntitlement: bigint;
  userClaimed: boolean;
};

export type SaleState = {
  owner: string;
  treasury: string;
  rate: bigint;
  softCapWei: bigint;
  endTime: bigint;
  totalRaised: bigint;
  finalized: boolean;
  successful: boolean;
  currentRound: bigint;
  title: string;
  description: string;
};

export type UserState = {
  contributionWei: bigint;
  entitlementTokens: bigint;
  tokenBalance: bigint;
  tokenSymbol: string;
  tokenDecimals: number;
};

export type LeaderRow = {
  buyer: string;
  weiAmount: bigint;
  tokenAmount: bigint;
};