"use client";

import { useState, useEffect } from "react";
import { formatEther, formatUnits } from "ethers";
import { useCoFund } from "./useCoFund"; 

function NavButton({ id, active, label, onClick }: { id: string, active: string, label: string, onClick: (id: any) => void }) {
  return (
    <button onClick={() => onClick(id)} className={`px-3 py-1.5 text-xs font-medium tracking-wide transition-all rounded-md ${active === id ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"}`}>
      {label}
    </button>
  );
}

function shortAddr(a: string) { return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ""; }

export default function Home() {
  const { account, chainOk, sale, user, rounds, leaderboard, txStatus, connect, disconnect, refreshLeaderboard, actions } = useCoFund();
  const [activeTab, setActiveTab] = useState<"invest" | "history" | "leaderboard" | "admin">("invest");
  
  const [adminForm, setAdminForm] = useState({ title: "", desc: "", mins: "5", rate: "200", cap: "1" });
  const [ethToBuy, setEthToBuy] = useState("0.05");
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => { setNow(Math.floor(Date.now() / 1000)); }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isAdmin = sale && account && (account.toLowerCase() === sale.owner.toLowerCase());
  const secondsLeft = sale ? Math.max(0, Number(sale.endTime) - now) : 0;
  const isRoundActive = secondsLeft > 0;
  const isRoundFinalized = sale?.finalized === true;

  return (
    <main className="min-h-screen bg-black text-white font-sans selection:bg-blue-600 selection:text-white">
      <nav className="border-b border-white/5 bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1"><span className="w-2 h-2 bg-blue-600 rounded-full"></span>COFUND<span className="text-zinc-600">.v4</span></h1>
            <div className="h-4 w-px bg-white/10"></div>
            <div className="flex gap-1">
              <NavButton id="invest" active={activeTab} label="Fund" onClick={setActiveTab} />
              <NavButton id="history" active={activeTab} label="Claims" onClick={setActiveTab} />
              <NavButton id="leaderboard" active={activeTab} label="Leaderboard" onClick={setActiveTab} />
              {isAdmin && <NavButton id="admin" active={activeTab} label="Admin" onClick={setActiveTab} />}
            </div>
          </div>
          {!account ? (
            <button onClick={connect} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-full font-medium text-xs transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)]">Connect Wallet</button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-full border border-white/5">
                <div className={`w-1.5 h-1.5 rounded-full ${chainOk ? "bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]" : "bg-red-500"}`}></div>
                <span className="font-mono text-[10px] text-zinc-400">{shortAddr(account)}</span>
              </div>
              <button onClick={disconnect} className="text-[10px] bg-red-900/30 hover:bg-red-900/50 text-red-400 px-3 py-1.5 rounded-full border border-red-900/20 transition-colors">Exit</button>
            </div>
          )}
        </div>
      </nav>

      <div className="mx-auto max-w-5xl p-4">
        {activeTab === "invest" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
             <div className="w-full h-56 rounded-xl overflow-hidden border border-white/5 bg-zinc-900 relative group mb-4">
                 <img src="/funding-help.png" alt="Round Banner" className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-700" />
                 <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-6 flex flex-col justify-start">
                     <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${isRoundActive ? "bg-green-500/10 text-green-400 border-green-500/20" : isRoundFinalized ? "bg-zinc-800 text-zinc-400 border-zinc-700" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>{isRoundActive ? "Live" : (isRoundFinalized ? "Finalized" : "Ended")}</span>
                        <span className="text-zinc-400 text-[10px] font-mono uppercase">Round {sale?.currentRound?.toString() || "V1"}</span>
                     </div>
                     <h2 className="text-2xl font-bold text-white tracking-tight drop-shadow-xl">{sale?.title || "Current Round"}</h2>
                     <p className="text-zinc-300 text-xs max-w-lg font-medium drop-shadow-md leading-relaxed mt-1">{sale?.description || "Join the funding round to secure your token allocation."}</p>
                 </div>
             </div>
             <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-zinc-900/50 border border-white/5 p-4 rounded-xl backdrop-blur-sm"><p className="text-zinc-500 text-[9px] font-bold uppercase tracking-wider mb-1">Total Raised</p><p className="text-xl font-mono text-white font-medium">{sale ? formatEther(sale.totalRaised) : "0"}<span className="text-[10px] text-zinc-600 ml-1">ETH</span></p></div>
                <div className="bg-zinc-900/50 border border-white/5 p-4 rounded-xl backdrop-blur-sm"><p className="text-zinc-500 text-[9px] font-bold uppercase tracking-wider mb-1">Soft Cap</p><p className="text-xl font-mono text-white font-medium">{sale ? formatEther(sale.softCapWei) : "0"}<span className="text-[10px] text-zinc-600 ml-1">ETH</span></p></div>
                <div className="bg-zinc-900/50 border border-white/5 p-4 rounded-xl backdrop-blur-sm"><p className="text-zinc-500 text-[9px] font-bold uppercase tracking-wider mb-1">Remaining</p><p className={`text-xl font-mono font-medium ${secondsLeft > 0 && secondsLeft < 300 ? "text-red-400" : "text-blue-400"}`}>{secondsLeft > 0 ? `${Math.floor(secondsLeft/60)}m ${secondsLeft%60}s` : "Ended"}</p></div>
             </div>
             <div className="grid md:grid-cols-2 gap-4">
                 <div className="bg-zinc-900 border border-white/10 p-5 rounded-xl shadow-lg relative overflow-hidden">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
                        <div className="flex justify-between items-center mb-4 relative z-10"><h2 className="text-sm font-bold uppercase tracking-wide text-white">Buy Tokens</h2><div className="text-right"><p className="font-mono text-[10px] text-zinc-400">{sale?.rate.toString()} TKN/ETH</p></div></div>
                        <div className="relative mb-3 z-10">
                          <input type="number" step="0.01" value={ethToBuy} onChange={e => setEthToBuy(e.target.value)} className="w-full bg-black/50 border border-white/10 p-3 pr-10 rounded-lg text-xl font-mono text-white outline-none focus:border-blue-500/50 transition-all placeholder-zinc-700" placeholder="0.05" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-zinc-500">ETH</span>
                        </div>
                        <button onClick={() => actions.buy(ethToBuy)} disabled={!isRoundActive || isRoundFinalized} className="w-full py-2.5 bg-white text-black rounded-lg font-bold text-xs hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-30 disabled:hover:bg-white z-10 relative">{!isRoundActive ? "Round Unavailable" : "Confirm Purchase"}</button>
                        {txStatus && <div className="mt-2 text-[9px] font-mono text-center text-zinc-500 animate-pulse">{txStatus}</div>}
                 </div>
                 <div className="bg-zinc-900/50 border border-white/5 p-5 rounded-xl flex flex-col justify-center h-full">
                        <h3 className="text-[9px] font-bold uppercase text-zinc-500 mb-3 tracking-widest">Your Position</h3>
                        <div className="space-y-2">
                           <div className="flex justify-between items-center"><span className="text-zinc-400 text-xs">Contributed</span><span className="font-mono text-xs text-white">{user ? formatEther(user.contributionWei) : "0"} ETH</span></div>
                           <div className="flex justify-between items-center"><span className="text-zinc-400 text-xs">Entitlement</span><span className="font-mono text-xs text-blue-400">{user ? formatUnits(user.entitlementTokens, user.tokenDecimals) : "0"} {user?.tokenSymbol}</span></div>
                           <div className="h-px bg-white/5 my-2"></div>
                           <div className="flex justify-between items-center"><span className="text-zinc-500 text-[10px]">Wallet Balance</span><span className="font-mono text-xs text-green-500">{user ? formatUnits(user.tokenBalance, user.tokenDecimals) : "0"} {user?.tokenSymbol}</span></div>
                        </div>
                 </div>
             </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-2xl mx-auto space-y-2">
             <h2 className="text-lg font-bold mb-3 text-white">Campaign History</h2>
             {rounds.map(r => (
                <div key={r.id} className="bg-zinc-900/50 border border-white/5 p-4 rounded-lg hover:border-white/10 transition-colors">
                   <div className="flex justify-between items-start">
                      <div>
                         <div className="flex items-center gap-2 mb-1"><h3 className="font-bold text-sm text-white">Round {r.id}: {r.title || "Untitled"}</h3><span className={`text-[8px] font-bold uppercase px-1.5 py-px rounded ${r.finalized ? (r.successful ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400") : "bg-blue-500/10 text-blue-400"}`}>{r.finalized ? (r.successful ? "Success" : "Failed") : "Active"}</span></div>
                         <p className="text-zinc-500 text-[10px]">{r.description || "No description provided."}</p>
                      </div>
                      <div className="flex gap-2">
                         <button onClick={() => actions.claim(r.id)} disabled={!r.finalized || !r.successful || r.userClaimed || r.userEntitlement === 0n} className="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold disabled:opacity-20 hover:bg-blue-500 transition-colors">Claim</button>
                         <button onClick={() => actions.refund(r.id)} disabled={!r.finalized || r.successful || r.userClaimed || r.userContribution === 0n} className="px-3 py-1 border border-zinc-700 rounded text-[10px] font-bold disabled:opacity-20 hover:bg-zinc-800 transition-colors">Refund</button>
                      </div>
                   </div>
                </div>
             ))}
          </div>
        )}

        {activeTab === "leaderboard" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-3xl mx-auto">
             <div className="flex justify-between items-center mb-4"><h2 className="text-lg font-bold text-white">Top Funders</h2><button onClick={refreshLeaderboard} className="text-[9px] font-bold uppercase border border-zinc-700 px-3 py-1 rounded text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors">Refresh</button></div>
             <div className="border border-white/5 rounded-xl overflow-hidden"><table className="w-full text-left"><thead className="bg-zinc-900/80 text-zinc-500 text-[9px] uppercase font-bold"><tr><th className="p-3">Rank</th><th className="p-3">Address</th><th className="p-3">ETH</th><th className="p-3 text-right">Tokens</th></tr></thead><tbody className="divide-y divide-white/5 bg-zinc-900/30">{leaderboard.map((r, i) => (<tr key={r.buyer} className="hover:bg-white/5 transition-colors font-mono text-[10px] text-zinc-300"><td className="p-3 text-zinc-600">#{i+1}</td><td className="p-3 text-blue-400">{shortAddr(r.buyer)}</td><td className="p-3 font-medium text-white">{formatEther(r.weiAmount)}</td><td className="p-3 text-right text-zinc-500">{formatUnits(r.tokenAmount, user?.tokenDecimals || 18)}</td></tr>))}</tbody></table></div>
          </div>
        )}

        {activeTab === "admin" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 grid md:grid-cols-2 gap-4 items-stretch">
             <div className="flex flex-col gap-4">
               <div className="bg-zinc-900 border border-white/5 p-5 rounded-xl flex-none">
                   <h3 className="text-xs font-bold mb-3 text-zinc-500 uppercase tracking-widest">Management</h3>
                   <div className="p-2 bg-black/40 rounded-lg mb-3 border border-white/5 text-[10px] text-zinc-400"><p className="flex justify-between mb-1"><span>Status</span> <span className={isRoundActive ? "text-green-400" : "text-zinc-500"}>{isRoundActive ? "Active" : "Ended"}</span></p><p className="flex justify-between"><span>Finalized</span> <span className={isRoundFinalized ? "text-green-400" : "text-zinc-500"}>{isRoundFinalized ? "Yes" : "No"}</span></p></div>
                   <button onClick={() => actions.finalize()} disabled={isRoundActive || isRoundFinalized} className="w-full py-2 bg-white text-black rounded-lg font-bold text-xs hover:bg-zinc-200 transition-all disabled:opacity-20">Finalize Current</button>
               </div>
               <div className="bg-zinc-900 border border-white/5 p-5 rounded-xl flex-1 flex flex-col min-h-0">
                   <h3 className="text-xs font-bold mb-3 text-zinc-500 uppercase tracking-widest flex-none">Withdraw</h3>
                   <div className="space-y-1.5 overflow-y-auto pr-1 flex-1 custom-scrollbar">
                      {rounds.filter(r => r.successful && r.finalized && !r.fundsWithdrawn).length === 0 ? (<div className="text-[10px] text-zinc-600 text-center py-4">No funds to withdraw</div>) : (rounds.filter(r => r.successful && r.finalized && !r.fundsWithdrawn).map(r => (<div key={r.id} className="bg-black/20 p-2 rounded-lg flex justify-between items-center border border-white/5 shrink-0"><div><p className="font-bold text-[10px] text-zinc-300">ROUND {r.id}</p><p className="text-[9px] text-zinc-600">{formatEther(r.totalRaised)} ETH</p></div><button onClick={() => actions.withdraw(r.id)} className="px-2 py-0.5 bg-green-900/20 text-green-400 border border-green-900/50 text-[9px] font-bold uppercase rounded hover:bg-green-900/40">Withdraw</button></div>)))}
                   </div>
               </div>
             </div>
             <div className="bg-zinc-900 border border-white/5 p-5 rounded-xl h-full flex flex-col">
               <h3 className="text-xs font-bold mb-3 text-zinc-500 uppercase tracking-widest flex-none">Launch Next</h3>
               <div className={`space-y-3 flex-1 flex flex-col ${(!isRoundFinalized && sale?.currentRound !== 0n) ? "opacity-30 pointer-events-none" : ""}`}>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[9px] uppercase font-bold text-zinc-500 mb-1 block">Title</label><input value={adminForm.title} onChange={e => setAdminForm({...adminForm, title: e.target.value})} className="w-full p-2 bg-black border border-zinc-800 rounded text-zinc-300 text-[10px] outline-none focus:border-zinc-600" placeholder="e.g. Seed Round" /></div>
                    <div><label className="text-[9px] uppercase font-bold text-zinc-500 mb-1 block">Description</label><input value={adminForm.desc} onChange={e => setAdminForm({...adminForm, desc: e.target.value})} className="w-full p-2 bg-black border border-zinc-800 rounded text-zinc-300 text-[10px] outline-none focus:border-zinc-600" placeholder="Short Desc" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[9px] uppercase font-bold text-zinc-500 mb-1 block">Duration (Mins)</label><input type="number" step="1" value={adminForm.mins} onChange={e => setAdminForm({...adminForm, mins: e.target.value})} className="w-full p-2 bg-black border border-zinc-800 rounded text-zinc-300 text-[10px] outline-none focus:border-zinc-600" /></div>
                    <div><label className="text-[9px] uppercase font-bold text-zinc-500 mb-1 block">Rate (Tkn/ETH)</label><input type="number" step="1" value={adminForm.rate} onChange={e => setAdminForm({...adminForm, rate: e.target.value})} className="w-full p-2 bg-black border border-zinc-800 rounded text-zinc-300 text-[10px] outline-none focus:border-zinc-600" /></div>
                  </div>
                  <div><label className="text-[9px] uppercase font-bold text-zinc-500 mb-1 block">Soft Cap (ETH)</label><input type="number" step="0.1" value={adminForm.cap} onChange={e => setAdminForm({...adminForm, cap: e.target.value})} className="w-full p-2 bg-black border border-zinc-800 rounded text-zinc-300 text-[10px] outline-none focus:border-zinc-600" /></div>
                  <div className="flex-1 content-end">
                    <button onClick={() => actions.startRound(adminForm.rate, adminForm.cap, adminForm.mins, adminForm.title, adminForm.desc)} className="w-full py-2 bg-blue-600 text-white rounded-lg font-black text-xs uppercase shadow-lg shadow-blue-900/20 hover:bg-blue-500 transition-all">Start Next</button>
                    {/* NOTIFICATION: Only one, right here */}
                    {txStatus && <div className="mt-2 text-[9px] font-mono text-center text-zinc-500 animate-pulse">{txStatus}</div>}
                  </div>
               </div>
             </div>
          </div>
        )}
      </div>
    </main>
  );
}