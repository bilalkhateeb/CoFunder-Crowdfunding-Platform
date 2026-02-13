import { useState, useEffect, useMemo, useCallback } from "react";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";
import { CONFIG } from "./config";
import { SALE_ABI, ERC20_ABI } from "./abi";
import { RoundInfo, SaleState, UserState, LeaderRow } from "../types";

export function useCoFund() {
  const [account, setAccount] = useState<string>("");
  const [chainOk, setChainOk] = useState<boolean>(false);
  const [sale, setSale] = useState<SaleState | null>(null);
  const [user, setUser] = useState<UserState | null>(null);
  const [rounds, setRounds] = useState<RoundInfo[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [txStatus, setTxStatus] = useState("");

  const anyWindow = typeof window !== "undefined" ? (window as any) : null;
  const provider = useMemo(() => anyWindow?.ethereum ? new BrowserProvider(anyWindow.ethereum) : null, [anyWindow]);
  const saleRO = useMemo(() => provider ? new Contract(CONFIG.saleProxyAddress, SALE_ABI, provider) : null, [provider]);
  const tokenRO = useMemo(() => provider ? new Contract(CONFIG.tokenAddress, ERC20_ABI, provider) : null, [provider]);

  // --- ACTIONS ---

  const connect = async () => {
    if (!anyWindow?.ethereum) return alert("Install MetaMask");
    try {
      const accs = await anyWindow.ethereum.request({ method: "eth_requestAccounts" });
      const newAccount = accs[0];
      setAccount(newAccount);
      localStorage.setItem("connectedAccount", newAccount); // Save to storage
      checkChain();
    } catch (e) { console.error(e); }
  };

  const disconnect = () => { 
    setAccount(""); 
    setUser(null); 
    setSale(null);
    localStorage.removeItem("connectedAccount"); // Clear storage
  };

  const checkChain = async () => {
    if(!provider) return;
    const net = await provider.getNetwork();
    setChainOk(Number(net.chainId) === CONFIG.chainId);
  };

  // --- PERSISTENCE (Strict Mode) ---
  useEffect(() => {
    if (!anyWindow?.ethereum) return;

    // 1. Load from Storage (Ignore what MetaMask currently says)
    const savedAccount = localStorage.getItem("connectedAccount");
    if (savedAccount) {
        setAccount(savedAccount);
        checkChain();
    }

    // 2. Chain Changed -> Reload (Standard safety)
    const handleChainChanged = () => window.location.reload();
    anyWindow.ethereum.on('chainChanged', handleChainChanged);

    // 3. Accounts Changed -> DO NOTHING (User wants manual control)
    // We only disconnect if the wallet is completely locked/empty
    const handleAccountsChanged = (accs: string[]) => {
      if (accs.length === 0) disconnect();
    };
    anyWindow.ethereum.on('accountsChanged', handleAccountsChanged);

    return () => {
      if (anyWindow.ethereum.removeListener) {
        anyWindow.ethereum.removeListener('chainChanged', handleChainChanged);
        anyWindow.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    };
  }, [anyWindow]);

  // --- TRANSACTION HANDLER (With Safety Check) ---
  const getSignerContract = async () => {
    if (!provider) throw new Error("No provider");
    const signer = await provider.getSigner();
    
    // SAFETY CHECK: Ensure MetaMask active account matches our dApp state
    const signerAddress = await signer.getAddress();
    if (signerAddress.toLowerCase() !== account.toLowerCase()) {
      alert(`⚠️ Wallet Mismatch!\n\nYou are connected to this app as:\n${shortAddr(account)}\n\nBut your MetaMask is set to:\n${shortAddr(signerAddress)}\n\nPlease switch MetaMask back to the connected account.`);
      throw new Error("Wallet mismatch");
    }
    
    return new Contract(CONFIG.saleProxyAddress, SALE_ABI, signer);
  };

  const runTx = async (name: string, fn: (c: Contract) => Promise<any>) => {
    try {
      setTxStatus(`Confirming ${name}...`);
      const contract = await getSignerContract();
      const tx = await fn(contract);
      setTxStatus(`Waiting for ${name}...`);
      await tx.wait();
      setTxStatus(`✅ ${name} Success!`);
      setTimeout(() => setTxStatus(""), 5000);
      await refreshAll();
    } catch (e: any) {
      console.error(e);
      if (e.message !== "Wallet mismatch") {
        setTxStatus(`❌ Error: ${e.shortMessage || e.message || "Failed"}`);
      } else {
        setTxStatus(""); 
      }
    }
  };

  function shortAddr(a: string) { return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ""; }

  // --- DATA SYNC ---
  const refreshAll = useCallback(async () => {
    if (!saleRO || !tokenRO) return;
    try {
      const [owner, treasury, cRound] = await Promise.all([
        saleRO.owner(), saleRO.treasury(), saleRO.currentRound().catch(() => 0n)
      ]);

      let sState: SaleState;
      if (cRound > 0n) {
        const [r, sc, et, tr, f, s, ttl, desc] = await Promise.all([
          saleRO.currentRate(), saleRO.currentSoftCapWei(), saleRO.currentEndTime(),
          saleRO.currentTotalRaised(), saleRO.currentFinalized(), saleRO.currentSuccessful(),
          saleRO.currentTitle(), saleRO.currentDescription()
        ]);
        sState = { owner, treasury, currentRound: cRound, rate: r, softCapWei: sc, endTime: et, totalRaised: tr, finalized: f, successful: s, title: ttl, description: desc };
      } else {
        const [r, sc, et, tr, f, s] = await Promise.all([
          saleRO.rate(), saleRO.softCapWei(), saleRO.endTime(), saleRO.totalRaised(), saleRO.finalized(), saleRO.successful()
        ]);
        sState = { owner, treasury, currentRound: 0n, rate: r, softCapWei: sc, endTime: et, totalRaised: tr, finalized: f, successful: s, title: "Legacy Phase", description: "Initial Coin Offering (V1)" };
      }
      setSale(sState);

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

      const hist: RoundInfo[] = [];
      for (let i = 1; i <= Number(cRound); i++) {
        const [r, uCont, uEnt, uClm] = await Promise.all([
          saleRO.rounds(i), 
          account ? saleRO.contributionByRound(i, account) : 0n,
          account ? saleRO.entitlementByRound(i, account) : 0n,
          account ? saleRO.claimedOrRefundedByRound(i, account) : false
        ]);
        hist.push({
          id: i, rate: r.rate, softCapWei: r.softCapWei, endTime: r.endTime, totalRaised: r.totalRaised,
          finalized: r.finalized, successful: r.successful, fundsWithdrawn: r.fundsWithdrawn,
          title: r.title, description: r.description,
          userContribution: uCont, userEntitlement: uEnt, userClaimed: uClm
        });
      }
      setRounds(hist.reverse());

    } catch (e) { console.error("Data Sync Error", e); }
  }, [saleRO, tokenRO, account]);

  const refreshLeaderboard = useCallback(async () => {
    if (!saleRO) return;
    try {
      const filter = saleRO.filters.Bought(null, null, null);
      const logs = await saleRO.queryFilter(filter, CONFIG.deployedFromBlock, "latest");
      const uniqueBuyers = new Set<string>();
      logs.forEach(l => uniqueBuyers.add((l as any).args[0].toLowerCase()));

      const currentRoundId = await saleRO.currentRound().catch(() => 0n);
      const validRounds: number[] = [];
      const [v1Final, v1Success] = await Promise.all([saleRO.finalized(), saleRO.successful()]);
      const isV1Valid = !v1Final || v1Success;

      for (let i = 1; i <= Number(currentRoundId); i++) {
        const r = await saleRO.getRoundInfo(i);
        if (!r.finalized || r.successful) validRounds.push(i);
      }

      const rows: LeaderRow[] = [];
      await Promise.all(Array.from(uniqueBuyers).map(async (buyer) => {
        let w = 0n, t = 0n;
        if (isV1Valid) {
            const [cw, ct] = await Promise.all([saleRO.contributionWei(buyer), saleRO.entitlementTokens(buyer)]);
            w += cw; t += ct;
        }
        if (validRounds.length > 0) {
            const res = await Promise.all(validRounds.map(id => Promise.all([saleRO.contributionByRound(id, buyer), saleRO.entitlementByRound(id, buyer)])));
            res.forEach(([cw, ct]) => { w += cw; t += ct; });
        }
        if (w > 0n) rows.push({ buyer, weiAmount: w, tokenAmount: t });
      }));
      setLeaderboard(rows.sort((a, b) => (a.weiAmount > b.weiAmount ? -1 : 1)).slice(0, 20));
    } catch (e) { console.error("Leaderboard Error", e); }
  }, [saleRO]);

  useEffect(() => { refreshAll(); refreshLeaderboard(); }, [refreshAll, refreshLeaderboard]);

  return {
    account, chainOk, sale, user, rounds, leaderboard, txStatus,
    connect, disconnect, refreshLeaderboard,
    actions: {
      buy: (amt: string) => runTx("Buy", c => c.buyTokens({ value: parseEther(amt) })),
      claim: (id: number) => runTx(`Claim R${id}`, c => c.claimRound(id)),
      refund: (id: number) => runTx(`Refund R${id}`, c => c.refundRound(id)),
      withdraw: (id: number) => runTx(`Withdraw R${id}`, c => c.withdrawRound(id)),
      finalize: () => runTx("Finalize", c => c.finalize()),
      startRound: (rate: string, cap: string, mins: string, title: string, desc: string) => 
        runTx("Start Round", c => c.startNewRound(BigInt(rate), parseEther(cap), BigInt(Math.floor(Date.now()/1000) + Number(mins)*60), title, desc))
    }
  };
}