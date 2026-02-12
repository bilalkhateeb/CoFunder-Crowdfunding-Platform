export const SALE_ABI = [
  "function owner() view returns (address)",
  "function treasury() view returns (address)",
  "function rate() view returns (uint256)",
  "function softCapWei() view returns (uint256)",
  "function endTime() view returns (uint256)",
  "function totalRaised() view returns (uint256)",
  "function finalized() view returns (bool)",
  "function successful() view returns (bool)",
  "function contributionWei(address) view returns (uint256)",
  "function entitlementTokens(address) view returns (uint256)",
  "function buyTokens() payable",
  "function finalize()",
  "function claim()",
  "function refund()",
  "function withdraw()",
  "event Bought(address indexed buyer, uint256 weiAmount, uint256 tokenAmount)",

  // V3 round control (admin)
"function startNewRound(uint256 rate_, uint256 softCapWei_, uint256 endTime_)",
"function currentRound() view returns (uint256)",

// V3 “current round” getters (useful for UI)
"function currentRate() view returns (uint256)",
"function currentSoftCapWei() view returns (uint256)",
"function currentEndTime() view returns (uint256)",
"function currentTotalRaised() view returns (uint256)",
"function currentFinalized() view returns (bool)",
"function currentSuccessful() view returns (bool)",

];



export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];
