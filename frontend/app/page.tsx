"use client";

import { useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, formatEther, formatUnits, parseEther } from "ethers";
import { CONFIG } from "./config";
import { SALE_ABI, ERC20_ABI } from "./abi";

// --- Types ---
type RoundInfo = {
  id: number;
  rate: bigint;
  softCapWei: bigint;
  endTime: bigint;
  totalRaised: bigint;
  finalized: boolean;
  successful: boolean;
  fundsWithdrawn: boolean;
  userContribution: bigint;
  userEntitlement: bigint;
  userClaimed: boolean;
};

type SaleState = {
  owner: string; treasury: string; rate: bigint; softCapWei: bigint;
  endTime: bigint; totalRaised: bigint; finalized: boolean; successful: boolean;
  currentRound: bigint;
};

type UserState = {
  contributionWei: bigint; entitlementTokens: bigint;
  tokenBalance: bigint; tokenSymbol: string; tokenDecimals: number;
};

type LeaderRow = { buyer: string; weiAmount: bigint; tokenAmount: bigint; };

// --- Helpers ---
function shortAddr(a: string) { return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ""; }

export default function Home() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<"invest" | "history" | "leaderboard" | "admin">("invest");
  
  const [account, setAccount] = useState<string>("");
  const [chainOk, setChainOk] = useState<boolean>(false);
  const [sale, setSale] = useState<SaleState | null>(null);
  const [user, setUser] = useState<UserState | null>(null);
  const [roundsData, setRoundsData] = useState<RoundInfo[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [txStatus, setTxStatus] = useState("");

  // Inputs
  const [ethToBuy, setEthToBuy] = useState("0.05");
  const [roundMins, setRoundMins] = useState("20");
  const [roundRate, setRoundRate] = useState("200");
  const [roundCap, setRoundCap] = useState("1");

  // Providers
  const anyWindow = typeof window !== "undefined" ? (window as any) : null;
  const provider = useMemo(() => anyWindow?.ethereum ? new BrowserProvider(anyWindow.ethereum) : null, [anyWindow]);
  const saleRO = useMemo(() => provider ? new Contract(CONFIG.saleProxyAddress, SALE_ABI, provider) : null, [provider]);
  const tokenRO = useMemo(() => provider ? new Contract(CONFIG.tokenAddress, ERC20_ABI, provider) : null, [provider]);

  // --- Actions ---
  async function connect() {
    if (!anyWindow?.ethereum) return alert("Install MetaMask");
    const accs = await anyWindow.ethereum.request({ method: "eth_requestAccounts" });
    setAccount(accs[0]);
    const net = await provider!.getNetwork();
    setChainOk(Number(net.chainId) === CONFIG.chainId);
  }

  async function refreshAll() {
    if (!saleRO || !tokenRO) return;
    try {
      const [owner, treasury, cRound] = await Promise.all([
        saleRO.owner(), saleRO.treasury(), saleRO.currentRound().catch(() => 0n)
      ]);

      // 1. Fetch Global State (V1 vs V3)
      let sState: SaleState;
      if (cRound > 0n) {
        // V3 Active
        const [r, sc, et, tr, f, s] = await Promise.all([
          saleRO.currentRate(), saleRO.currentSoftCapWei(), saleRO.currentEndTime(),
          saleRO.currentTotalRaised(), saleRO.currentFinalized(), saleRO.currentSuccessful()
        ]);
        sState = { owner, treasury, currentRound: cRound, rate: r, softCapWei: sc, endTime: et, totalRaised: tr, finalized: f, successful: s };
      } else {
        // V1 Legacy Active
        const [r, sc, et, tr, f, s] = await Promise.all([
          saleRO.rate(), saleRO.softCapWei(), saleRO.endTime(), saleRO.totalRaised(), saleRO.finalized(), saleRO.successful()
        ]);
        sState = { owner, treasury, currentRound: 0n, rate: r, softCapWei: sc, endTime: et, totalRaised: tr, finalized: f, successful: s };
      }
      setSale(sState);

      // 2. Fetch User State
      const [symbol, decimals, walletBal] = await Promise.all([
        tokenRO.symbol(), tokenRO.decimals(), account ? tokenRO.balanceOf(account) : 0n
      ]);
      let uC = 0n, uE = 0n;
      if (account) {
        if (cRound > 0n) {
          [uC, uE] = await Promise.all([saleRO.currentContributionWei(account), saleRO.currentEntitlementTokens(account)]);
        } else {
          [uC, uE] = await Promise.all([saleRO.contributionWei(account), saleRO.entitlementTokens(account)]);
        }
      }
      setUser({ contributionWei: uC, entitlementTokens: uE, tokenBalance: walletBal, tokenSymbol: symbol, tokenDecimals: Number(decimals) });

      // 3. Fetch Escape Hatch Data (History)
      const historical: RoundInfo[] = [];
      for (let i = 1; i <= Number(cRound); i++) {
        const [r, uCont, uEnt, uClm] = await Promise.all([
          saleRO.rounds(i), 
          account ? saleRO.contributionByRound(i, account) : 0n,
          account ? saleRO.entitlementByRound(i, account) : 0n,
          account ? saleRO.claimedOrRefundedByRound(i, account) : false
        ]);
        historical.push({
          id: i, rate: r.rate, softCapWei: r.softCapWei, endTime: r.endTime, totalRaised: r.totalRaised,
          finalized: r.finalized, successful: r.successful, fundsWithdrawn: r.fundsWithdrawn,
          userContribution: uCont, userEntitlement: uEnt, userClaimed: uClm
        });
      }
      setRoundsData(historical.reverse()); // Show newest first
    } catch (e) { console.error("Refresh Error:", e); }
  }

  async function getSignerContracts() {
    const s = await provider!.getSigner();
    return { saleW: new Contract(CONFIG.saleProxyAddress, SALE_ABI, s) };
  }

  // Wrapper for transactions
  async function runTx(name: string, fn: (contract: Contract) => Promise<any>) {
    try {
      setTxStatus(`Confirming ${name}...`);
      const { saleW } = await getSignerContracts();
      const tx = await fn(saleW);
      setTxStatus(`Waiting for ${name} confirmation...`);
      await tx.wait();
      setTxStatus(`✅ ${name} Success!`);
      await refreshAll();
    } catch (e: any) { setTxStatus(`❌ Error: ${e.shortMessage || e.message}`); }
  }

  // Leaderboard Logic
  async function refreshLeaderboard() {
    if (!saleRO) return;
    setLoadingBoard(true);
    try {
      const filter = saleRO.filters.Bought(null, null, null);
      const logs = await saleRO.queryFilter(filter, CONFIG.deployedFromBlock, "latest");
      const totals = new Map<string, { wei: bigint; tok: bigint }>();
      for (const log of logs) {
        const b = (log.args as any).buyer.toLowerCase();
        const prev = totals.get(b) ?? { wei: 0n, tok: 0n };
        totals.set(b, { wei: prev.wei + (log.args as any).weiAmount, tok: prev.tok + (log.args as any).tokenAmount });
      }
      const sorted = Array.from(totals.entries()).map(([buyer, v]) => ({ buyer, weiAmount: v.wei, tokenAmount: v.tok }))
        .sort((a, b) => a.weiAmount > b.weiAmount ? -1 : 1);
      setLeaderboard(sorted.slice(0, 20));
    } finally { setLoadingBoard(false); }
  }

  useEffect(() => { refreshAll(); refreshLeaderboard(); }, [account, saleRO]);

  // Derived state
  const isAdmin = sale && account && (account.toLowerCase() === sale.owner.toLowerCase());
  const now = Math.floor(Date.now() / 1000);
  const secondsLeft = sale ? Math.max(0, Number(sale.endTime) - now) : 0;

  // -- Navigation Component --
  const NavButton = ({ id, label }: { id: typeof activeTab, label: string }) => (
    <button 
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2 font-bold rounded-lg transition-all ${
        activeTab === id ? "bg-white text-black" : "text-slate-400 hover:text-white hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="min-h-screen bg-black text-white font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Navigation Bar */}
      <nav className="border-b border-slate-800 bg-black/50 backdrop-blur-md sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-black italic tracking-tighter mr-4">COFUND<span className="text-blue-600">.v3</span></h1>
            <NavButton id="invest" label="Funding" />
            <NavButton id="history" label="My Claims" />
            <NavButton id="leaderboard" label="Top Funders" />
            {isAdmin && <NavButton id="admin" label="Admin" />}
          </div>
          
          {!account ? (
             <button onClick={connect} className="bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded-full font-bold text-sm transition-colors">Connect Wallet</button>
          ) : (
            <div className="text-right text-xs">
               <div className="font-mono text-slate-300">{shortAddr(account)}</div>
               <div className={chainOk ? "text-green-500" : "text-red-500"}>{chainOk ? "Sepolia" : "Wrong Net"}</div>
            </div>
          )}
        </div>
      </nav>

      <div className="mx-auto max-w-6xl p-6">
        
        {/* --- PAGE: INVEST (Funding) --- */}
        {activeTab === "invest" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="grid md:grid-cols-2 gap-8 items-start">
                
                {/* Left: Global Info */}
                <div className="space-y-6">
                  <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-8 rounded-[32px]">
                    <h2 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Total Raised</h2>
                    <p className="text-5xl font-mono tracking-tight mb-8">{sale ? formatEther(sale.totalRaised) : "0"}<span className="text-lg text-slate-600 ml-2">ETH</span></p>
                    
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                         <p className="text-slate-500 text-xs font-bold uppercase">Soft Cap</p>
                         <p className="text-xl font-mono">{sale ? formatEther(sale.softCapWei) : "0"} ETH</p>
                       </div>
                       <div>
                         <p className="text-slate-500 text-xs font-bold uppercase">Time Remaining</p>
                         <p className="text-xl font-mono text-blue-500">{secondsLeft > 0 ? `${Math.floor(secondsLeft/60)}m ${secondsLeft%60}s` : "Ended"}</p>
                       </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-[24px]">
                    <h3 className="text-lg font-bold mb-4">Your Position (Current Round)</h3>
                    <div className="space-y-3 text-sm font-mono text-slate-300">
                      <div className="flex justify-between"><span>Contributed</span><span className="text-white">{user ? formatEther(user.contributionWei) : "0"} ETH</span></div>
                      <div className="flex justify-between"><span>Tokens Due</span><span className="text-white">{user ? formatUnits(user.entitlementTokens, user.tokenDecimals) : "0"} {user?.tokenSymbol}</span></div>
                      <div className="flex justify-between pt-3 border-t border-slate-800"><span>Wallet Balance</span><span className="text-white">{user ? formatUnits(user.tokenBalance, user.tokenDecimals) : "0"} {user?.tokenSymbol}</span></div>
                    </div>
                  </div>
                </div>

                {/* Right: Buy Interface */}
                <div className="bg-white text-black p-8 rounded-[32px] shadow-2xl">
                   <h2 className="text-3xl font-black mb-2 uppercase italic tracking-tight">Buy Tokens</h2>
                   <p className="text-slate-500 mb-8 font-medium">Current Rate: {sale?.rate.toString()} Tokens per ETH</p>
                   
                   <label className="text-xs font-bold uppercase text-slate-400">Amount (ETH)</label>
                   <input 
                      type="number" 
                      value={ethToBuy} 
                      onChange={e => setEthToBuy(e.target.value)} 
                      className="w-full bg-slate-100 p-4 rounded-xl text-2xl font-bold mb-4 outline-none focus:ring-4 ring-blue-500/20" 
                      placeholder="0.05"
                   />

                   <button 
                      onClick={() => runTx("Buy", (c) => c.buyTokens({ value: parseEther(ethToBuy) }))}
                      disabled={secondsLeft === 0 || sale?.finalized}
                      className="w-full py-4 bg-black text-white rounded-xl font-bold text-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                   >
                      {secondsLeft === 0 ? "Round Ended" : "Confirm Purchase"}
                   </button>

                   {txStatus && (
                      <div className="mt-6 p-4 bg-slate-100 rounded-xl text-sm font-medium text-center">
                         {txStatus}
                      </div>
                   )}
                </div>

             </div>
          </div>
        )}

        {/* --- PAGE: HISTORY (Claims) --- */}
        {activeTab === "history" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto">
             <h2 className="text-3xl font-bold mb-6">Claim History <span className="text-slate-500 text-lg font-normal ml-2">(Escape Hatch)</span></h2>
             <div className="space-y-4">
                
                {/* Legacy V1 Card */}
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center justify-between group hover:border-slate-600 transition-colors">
                   <div>
                      <h3 className="font-bold text-lg">Legacy Phase (V1)</h3>
                      <p className="text-slate-500 text-sm">Original Crowdsale</p>
                   </div>
                   <div className="flex gap-3">
                      <button onClick={() => runTx("V1 Claim", c => c.claim())} className="px-4 py-2 bg-white text-black rounded-lg font-bold text-sm hover:bg-slate-200">Claim</button>
                      <button onClick={() => runTx("V1 Refund", c => c.refund())} className="px-4 py-2 border border-slate-700 rounded-lg font-bold text-sm hover:bg-slate-800">Refund</button>
                   </div>
                </div>

                {/* V3 Rounds List */}
                {roundsData.map(r => (
                   <div key={r.id} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center justify-between group hover:border-slate-600 transition-colors">
                      <div>
                         <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-bold text-lg">Round {r.id}</h3>
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${r.finalized ? (r.successful ? "bg-green-900 text-green-400" : "bg-red-900 text-red-400") : "bg-blue-900 text-blue-400"}`}>
                               {r.finalized ? (r.successful ? "Success" : "Failed") : "Active"}
                            </span>
                         </div>
                         <p className="text-slate-500 text-sm">
                            Raised: {formatEther(r.totalRaised)} ETH 
                            {r.userContribution > 0n && <span className="text-blue-400 ml-2">(You: {formatEther(r.userContribution)} ETH)</span>}
                         </p>
                      </div>
                      <div className="flex gap-3">
                         <button 
                            onClick={() => runTx(`Claim R${r.id}`, c => c.claimRound(r.id))} 
                            disabled={!r.finalized || !r.successful || r.userClaimed || r.userEntitlement === 0n} 
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-500 disabled:opacity-20 disabled:bg-blue-600"
                         >
                            Claim
                         </button>
                         <button 
                            onClick={() => runTx(`Refund R${r.id}`, c => c.refundRound(r.id))} 
                            disabled={!r.finalized || r.successful || r.userClaimed || r.userContribution === 0n} 
                            className="px-4 py-2 border border-slate-700 rounded-lg font-bold text-sm hover:bg-slate-800 disabled:opacity-20"
                         >
                            Refund
                         </button>
                      </div>
                   </div>
                ))}
                {roundsData.length === 0 && <div className="text-center text-slate-500 py-12">No V3 rounds found.</div>}
             </div>
          </div>
        )}

        {/* --- PAGE: LEADERBOARD --- */}
        {activeTab === "leaderboard" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Top Funders</h2>
                <button onClick={refreshLeaderboard} className="text-xs font-bold uppercase border border-slate-700 px-4 py-2 rounded-full hover:bg-slate-800">Refresh</button>
             </div>
             <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                   <thead className="bg-slate-950 text-slate-500 text-xs uppercase font-bold">
                      <tr>
                         <th className="p-4">Rank</th>
                         <th className="p-4">Address</th>
                         <th className="p-4">ETH</th>
                         <th className="p-4 text-right">Tokens</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-800">
                      {leaderboard.map((r, i) => (
                         <tr key={r.buyer} className="hover:bg-white/5 transition-colors font-mono text-sm">
                            <td className="p-4 text-slate-500">#{i+1}</td>
                            <td className="p-4 text-blue-400">{shortAddr(r.buyer)}</td>
                            <td className="p-4">{formatEther(r.weiAmount)}</td>
                            <td className="p-4 text-right text-slate-400">{formatUnits(r.tokenAmount, 18)}</td>
                         </tr>
                      ))}
                      {leaderboard.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-500">No data available.</td></tr>}
                   </tbody>
                </table>
             </div>
          </div>
        )}

        {/* --- PAGE: ADMIN --- */}
        {activeTab === "admin" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="grid md:grid-cols-2 gap-8">
                
                {/* Actions Panel */}
                <div className="space-y-6">
                   <div className="bg-slate-900 border border-slate-800 p-8 rounded-[32px]">
                      <h3 className="text-xl font-bold mb-6 text-white/50 uppercase tracking-widest">Current Round</h3>
                      <div className="space-y-4">
                         <button onClick={() => runTx("Finalize", c => c.finalize())} className="w-full py-4 border-2 border-white rounded-xl font-black uppercase hover:bg-white hover:text-black transition-colors">
                            Finalize Round
                         </button>
                      </div>
                   </div>

                   {/* Withdrawal Panel (The Fix!) */}
                   <div className="bg-slate-900 border border-slate-800 p-8 rounded-[32px]">
                      <h3 className="text-xl font-bold mb-6 text-white/50 uppercase tracking-widest">Pending Withdrawals</h3>
                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                         {/* Check if any round needs withdrawal */}
                         {roundsData.filter(r => r.successful && r.finalized && !r.fundsWithdrawn).length === 0 && (
                            <div className="text-slate-500 text-sm">No funds available to withdraw.</div>
                         )}
                         {/* Map through ALL rounds to find withdrawable ones */}
                         {roundsData.filter(r => r.successful && r.finalized && !r.fundsWithdrawn).map(r => (
                            <div key={r.id} className="bg-black/30 p-4 rounded-xl flex justify-between items-center border border-slate-800">
                               <div>
                                  <p className="font-bold text-sm">Round {r.id}</p>
                                  <p className="text-xs text-slate-400">{formatEther(r.totalRaised)} ETH</p>
                               </div>
                               <button 
                                  onClick={() => runTx(`Withdraw R${r.id}`, c => c.withdrawRound(r.id))}
                                  className="px-3 py-1.5 bg-green-900 text-green-400 text-xs font-bold uppercase rounded hover:bg-green-800 border border-green-800"
                               >
                                  Withdraw
                               </button>
                            </div>
                         ))}
                      </div>
                   </div>
                </div>

                {/* Launch New Round */}
                <div className="bg-slate-100 text-black p-8 rounded-[32px]">
                   <h3 className="text-xl font-bold mb-6 text-black/50 uppercase tracking-widest">Launch Config</h3>
                   <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Duration (Min)</label>
                            <input value={roundMins} onChange={e => setRoundMins(e.target.value)} className="w-full p-3 bg-white rounded-xl font-bold outline-none" />
                         </div>
                         <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Rate (Tok/ETH)</label>
                            <input value={roundRate} onChange={e => setRoundRate(e.target.value)} className="w-full p-3 bg-white rounded-xl font-bold outline-none" />
                         </div>
                      </div>
                      <div>
                         <label className="text-[10px] font-bold text-slate-400 uppercase">Soft Cap (ETH)</label>
                         <input value={roundCap} onChange={e => setRoundCap(e.target.value)} className="w-full p-3 bg-white rounded-xl font-bold outline-none" />
                      </div>
                      
                      <button 
                         onClick={() => runTx("Start Round", c => c.startNewRound(BigInt(roundRate), parseEther(roundCap), BigInt(Math.floor(Date.now()/1000) + Number(roundMins)*60)))} 
                         className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase shadow-xl shadow-blue-500/20 hover:scale-[1.02] transition-transform"
                      >
                         Start Next Round
                      </button>
                   </div>
                </div>
             </div>
          </div>
        )}

      </div>
    </main>
  );
}