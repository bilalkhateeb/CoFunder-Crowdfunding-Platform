# COFUND ICO dApp

A complete, production-ready ICO (Initial Coin Offering) crowdfunding platform built with Solidity smart contracts and a modern Next.js + ethers.js frontend.

## 🚀 Project Structure

```
CoFunder-Crowdfunding-Platform/
├── contracts/                    # Solidity smart contracts & tests
│   ├── contracts/
│   │   ├── COFUNDToken.sol      # ERC-20 token contract
│   │   ├── COFUNDSaleV1.sol     # Upgradeable sale contract (V1)
│   │   └── COFUNDSaleV2.sol     # Sale contract V2 (upgrade demonstration)
│   └── test/
│       └── COFUNDSale.test.ts   # Mocha tests (happy & failure paths)
│
└── frontend/                     # Next.js web UI
    ├── app/
    │   ├── page.tsx             # Main ICO page
    │   ├── layout.tsx           # Root layout
    │   └── globals.css          # Tailwind styles
    ├── components/
    │   ├── Header.tsx           # Navigation & wallet
    │   ├── SaleInfo.tsx         # Stats & progress
    │   └── ActionButtons.tsx    # Buy/claim/refund controls
    └── lib/
        └── useWallet.ts         # ethers.js integration hook
```

## ✨ Features

### Smart Contracts
- **Token Sale** - Upgradeable ICO with proxy pattern (UUPS)
- **Soft Cap Logic** - Minimum funding requirement; refunds if not met
- **Claim/Refund** - Successful sale: claim tokens; failed sale: refund ETH
- **Access Control** - Role-based minting and owner-only upgrades
- **Reentrancy Protection** - Safe from reentrancy attacks

### Frontend
- **MetaMask Integration** - Connect wallet, send transactions
- **Real-time Updates** - Poll contract every 5 seconds
- **Responsive Design** - Beautiful dark theme with gradient accents
- **Smart UX** - Buttons enable/disable based on sale state
- **Transaction Feedback** - Status indicators for pending/success/error

## 🏗️ Tech Stack

### Smart Contracts
- **Solidity 0.8.28**
- **OpenZeppelin Contracts** (ERC-20, AccessControl, Upgradeable patterns)
- **Hardhat 3** (compilation, testing, deployment)
- **ethers.js v6** (contract interactions)

### Frontend
- **Next.js 14** (React framework)
- **React 18** (UI library)
- **ethers.js v6** (web3 integration)
- **Tailwind CSS v3** (styling)
- **TypeScript** (type safety)

## 🔧 Quick Start

### Prerequisites
- Node.js 18+
- MetaMask browser extension
- Testnet ETH on Sepolia (from faucet)

### 1️⃣ Setup Smart Contracts

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test
```

Expected: ✓ 2 tests passing

### 2️⃣ Deploy to Sepolia

```bash
# Set environment variables
export SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
export SEPOLIA_PRIVATE_KEY=0x...

# Deploy (note: see contracts/README.md for deployment script)
npx hardhat run scripts/deploy.ts --network sepolia
```

Save the **proxy address** from deployment output.

### 3️⃣ Setup Frontend

```bash
cd ../frontend
npm install

# Create .env.local with deployed proxy address
echo "NEXT_PUBLIC_SALE_PROXY=0x..." > .env.local

# Run locally
npm run dev
```

Open http://localhost:3000 in browser with MetaMask connected to Sepolia.

## 📖 Usage Guide

### For Users

1. **Connect MetaMask** - Click "Connect" button in header
2. **Buy Tokens** - Enter ETH amount, click "Buy Tokens"
3. **Wait for Sale** - Sale runs for configurable duration (default 2 weeks)
4. **After Sale Ends:**
   - **If Successful** (soft cap met): Click "Claim Tokens" → COFUND minted
   - **If Failed** (soft cap not met): Click "Request Refund" → ETH refunded

### For Developers

**Testing the Buy → Claim Flow:**
```bash
# In contracts directory
npx hardhat test

# Test: two users each buy 0.05 ETH (soft cap = 1 ETH)
# Happy path: sale succeeds, users claim tokens
# Failure path: low soft cap, users refund
```

**Deploying Yourself:**
1. Set `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY`
2. Run deployment script (creates token, implementation, proxy)
3. Update `NEXT_PUBLIC_SALE_PROXY` in frontend/.env.local
4. Deploy frontend to Vercel or similar

## 🔐 Smart Contract Details

### COFUNDToken (ERC-20)
```solidity
- Total Supply: Unlimited (minted by sale contract)
- Decimals: 18
- Roles: MINTER_ROLE (sale contract), DEFAULT_ADMIN_ROLE (deployer)
```

### COFUNDSaleV1 (Main Sale Contract)
```solidity
- Rate: 200 COFUND per 1 ETH (configurable)
- Soft Cap: 1 ETH minimum (configurable)
- Duration: 2 weeks (configurable)
- Pattern: UUPS Upgradeable Proxy
```

**State Variables:**
- `totalRaised` - Total ETH collected
- `contributionWei[user]` - User's ETH contribution
- `entitlementTokens[user]` - User's claimable tokens
- `finalized` - Sale state locked
- `successful` - Soft cap reached

**Key Functions:**
- `buyTokens()` payable - Buy tokens with ETH
- `finalize()` - Lock sale state
- `claim()` - Claim tokens (if successful)
- `refund()` - Get ETH back (if failed)
- `withdraw()` - Transfer ETH to treasury (if successful)

### COFUNDSaleV2 (Upgrade Example)
- Demonstrates upgrade capability without storage loss
- Adds `version()` returning "V2"

## 📊 Testnet Addresses

After deploying to Sepolia, save these addresses:

```
Token Address:          0x...
Sale Implementation:    0x...
Sale Proxy Address:     0x...  <- Use as NEXT_PUBLIC_SALE_PROXY
```

## 🧪 Testing

### Smart Contracts
```bash
cd contracts
npx hardhat test
```

Tests cover:
- ✓ Happy path: buy → finalize → claim → withdraw
- ✓ Failure path: soft cap not met → refund

### Frontend
```bash
cd frontend
npm run dev
npm run build  # Production build
```

## 🚀 Deployment

### On-Chain (Sepolia)
1. Deploy contracts (see setup above)
2. Copy proxy address
3. Deploy frontend to Vercel:
   ```bash
   vercel --prod
   ```

### Local Testing
1. Run `npm run dev` in frontend directory
2. Open http://localhost:3000
3. Connect MetaMask (Sepolia network)
4. Test with testnet ETH

## 🛠️ Configuration

### Frontend Environment (.env.local)
```env
NEXT_PUBLIC_SALE_PROXY=0x...  # Deployed proxy address
```

### Smart Contracts (hardhat.config.ts)
```typescript
networks: {
  sepolia: {
    url: configVariables.SEPOLIA_RPC_URL,
    accounts: [configVariables.SEPOLIA_PRIVATE_KEY]
  }
}
```

## 📝 Documentation

- [Smart Contracts README](./contracts/README.md) - Detailed contract docs & deployment guide
- [Frontend README](./frontend/README.md) - Frontend setup & component guide

## 🔗 Useful Links

- [Ethereum Sepolia Faucet](https://sepoliafaucet.com)
- [Sepolia Etherscan](https://sepolia.etherscan.io)
- [OpenZeppelin Docs](https://docs.openzeppelin.com)
- [ethers.js v6 Docs](https://docs.ethers.org/v6/)
- [Next.js Docs](https://nextjs.org/docs)

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Tests fail | Run `npm install` in contracts/, check Node version |
| Compilation error | Update OpenZeppelin: `npm install @openzeppelin/contracts@latest` |
| MetaMask not found | Install MetaMask extension |
| Wrong network | Switch to Sepolia in MetaMask |
| Contract call fails | Verify proxy address in `.env.local` matches deployment |
| No testnet ETH | Use Sepolia faucet (see links above) |

## 📄 License

MIT License - feel free to use this as a template for your own ICO!

## 🤝 Contributing

Issues and pull requests welcome. Please ensure tests pass before submitting.

---

**Built with ❤️ for the Ethereum community**
