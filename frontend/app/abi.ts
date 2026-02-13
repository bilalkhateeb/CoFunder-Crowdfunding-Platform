export const SALE_ABI = [
  // --- Global / V1 Views ---
  "function owner() view returns (address)",
  "function treasury() view returns (address)",
  "function rate() view returns (uint256)",
  "function softCapWei() view returns (uint256)",
  "function endTime() view returns (uint256)",
  "function totalRaised() view returns (uint256)",
  "function finalized() view returns (bool)",
  "function successful() view returns (bool)",
  
  // --- User Views ---
  "function contributionWei(address) view returns (uint256)",
  "function entitlementTokens(address) view returns (uint256)",
  
  // --- Write Functions ---
  "function buyTokens() payable",
  "function finalize()",
  "function claim()",
  "function refund()",
  "function withdraw()",
  
  // --- EVENTS ---
  "event Bought(address indexed buyer, uint256 weiAmount, uint256 tokenAmount)",
  "event Refunded(address indexed user, uint256 amount)", 
  "event RoundStarted(uint256 indexed roundId, uint256 rate, uint256 softCapWei, uint256 endTime, string title, string description)",

  // --- V4 Round Management ---
  "function startNewRound(uint256 rate_, uint256 softCapWei_, uint256 endTime_, string title_, string description_)",
  "function currentRound() view returns (uint256)",
  
  // --- V4 Round Data & Escape Hatch ---
  // FIXED: Removed title/description from rounds() as they are stored separately in V4
  "function rounds(uint256) view returns (uint256 rate, uint256 softCapWei, uint256 endTime, uint256 totalRaised, bool finalized, bool successful, bool fundsWithdrawn)",
  
  // ADDED: The V4 helper to get full data including title/description
  "function getRoundInfo(uint256 id) view returns (uint256 rate, uint256 softCap, uint256 endTime, uint256 totalRaised, bool finalized, bool successful, string title, string description)",

  "function claimRound(uint256 id)",
  "function refundRound(uint256 id)",
  "function withdrawRound(uint256 id)",
  
  "function contributionByRound(uint256, address) view returns (uint256)",
  "function entitlementByRound(uint256, address) view returns (uint256)",
  "function claimedOrRefundedByRound(uint256, address) view returns (bool)",

  // --- V4 Live Round Helpers ---
  "function currentRate() view returns (uint256)",
  "function currentSoftCapWei() view returns (uint256)",
  "function currentEndTime() view returns (uint256)",
  "function currentTotalRaised() view returns (uint256)",
  "function currentFinalized() view returns (bool)",
  "function currentSuccessful() view returns (bool)",
  "function currentTitle() view returns (string)",       
  "function currentDescription() view returns (string)", 
  "function currentContributionWei(address) view returns (uint256)",
  "function currentEntitlementTokens(address) view returns (uint256)",
  "function currentClaimedOrRefunded(address) view returns (bool)"
];

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];