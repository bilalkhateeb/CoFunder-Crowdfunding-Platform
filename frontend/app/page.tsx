"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BrowserProvider,
  Contract,
  formatEther,
  formatUnits,
  parseEther,
} from "ethers";

import { CONFIG } from "./config";
import { SALE_ABI, ERC20_ABI } from "./abi";

type SaleState = {
  owner: string;
  treasury: string;
  rate: bigint;
  softCapWei: bigint;
  endTime: bigint;
  totalRaised: bigint;
  finalized: boolean;
  successful: boolean;
  // V3 only (optional)
  currentRound?: bigint;
};

type UserState = {
  contributionWei: bigint;
  entitlementTokens: bigint;
  tokenBalance: bigint;
  tokenSymbol: string;
  tokenDecimals: number;
};

type LeaderRow = {
  buyer: string;
  weiAmount: bigint;
  tokenAmount: bigint;
};

function shortAddr(a: string) {
  if (!a) return "";
  return a.slice(0, 6) + "..." + a.slice(-4);
}

export default function Home() {
  const [account, setAccount] = useState<string>("");
  const [chainOk, setChainOk] = useState<boolean>(false);

  const [sale, setSale] = useState<SaleState | null>(null);
  const [user, setUser] = useState<UserState | null>(null);

  const [ethToBuy, setEthToBuy] = useState<string>("0.05");
  const [txStatus, setTxStatus] = useState<string>("");

  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [loadingBoard, setLoadingBoard] = useState<boolean>(false);

  // Admin: start new round inputs
  const [roundMinutes, setRoundMinutes] = useState<string>("20");
  const [roundRate, setRoundRate] = useState<string>("200");
  const [roundSoftCap, setRoundSoftCap] = useState<string>("1"); // ETH

  const anyWindow = typeof window !== "undefined" ? (window as any) : null;

  const provider = useMemo(() => {
    if (!anyWindow?.ethereum) return null;
    return new BrowserProvider(anyWindow.ethereum);
  }, [anyWindow?.ethereum]);

  const saleContractRO = useMemo(() => {
    if (!provider) return null;
    return new Contract(CONFIG.saleProxyAddress, SALE_ABI, provider);
  }, [provider]);

  const tokenContractRO = useMemo(() => {
    if (!provider) return null;
    return new Contract(CONFIG.tokenAddress, ERC20_ABI, provider);
  }, [provider]);

  async function connect() {
    if (!anyWindow?.ethereum) {
      alert("MetaMask not found. Please install MetaMask.");
      return;
    }
    await anyWindow.ethereum.request({ method: "eth_requestAccounts" });

    const p = new BrowserProvider(anyWindow.ethereum);
    const net = await p.getNetwork();
    setChainOk(Number(net.chainId) === CONFIG.chainId);

    const signer = await p.getSigner();
    const addr = await signer.getAddress();
    setAccount(addr);
  }

  // Helpers: V3-aware reads (fallback to V1 if V3 functions missing)
  async function readSaleState() {
    if (!saleContractRO) throw new Error("No sale contract");
    const [owner, treasury] = await Promise.all([
      saleContractRO.owner(),
      saleContractRO.treasury(),
    ]);

    // Try V3 getters first
    try {
      const [
        currentRound,
        rate,
        softCapWei,
        endTime,
        totalRaised,
        finalized,
        successful,
      ] = await Promise.all([
        (saleContractRO as any).currentRound(),
        (saleContractRO as any).currentRate(),
        (saleContractRO as any).currentSoftCapWei(),
        (saleContractRO as any).currentEndTime(),
        (saleContractRO as any).currentTotalRaised(),
        (saleContractRO as any).currentFinalized(),
        (saleContractRO as any).currentSuccessful(),
      ]);

      return {
        owner,
        treasury,
        rate,
        softCapWei,
        endTime,
        totalRaised,
        finalized,
        successful,
        currentRound,
      } as SaleState;
    } catch {
      // Fallback V1
      const [
        rate,
        softCapWei,
        endTime,
        totalRaised,
        finalized,
        successful,
      ] = await Promise.all([
        saleContractRO.rate(),
        saleContractRO.softCapWei(),
        saleContractRO.endTime(),
        saleContractRO.totalRaised(),
        saleContractRO.finalized(),
        saleContractRO.successful(),
      ]);

      return {
        owner,
        treasury,
        rate,
        softCapWei,
        endTime,
        totalRaised,
        finalized,
        successful,
      } as SaleState;
    }
  }

  async function readUserState(symbol: string, decimals: number) {
    if (!saleContractRO || !tokenContractRO) throw new Error("No contracts");

    if (!account) {
      return {
        contributionWei: 0n,
        entitlementTokens: 0n,
        tokenBalance: 0n,
        tokenSymbol: symbol,
        tokenDecimals: decimals,
      } as UserState;
    }

    // Try V3 per-round user getters first
    try {
      const [contributionWei, entitlementTokens, tokenBalance] =
        await Promise.all([
          (saleContractRO as any).currentContributionWei(account),
          (saleContractRO as any).currentEntitlementTokens(account),
          tokenContractRO.balanceOf(account),
        ]);

      return {
        contributionWei,
        entitlementTokens,
        tokenBalance,
        tokenSymbol: symbol,
        tokenDecimals: decimals,
      } as UserState;
    } catch {
      // Fallback V1 user mappings
      const [contributionWei, entitlementTokens, tokenBalance] =
        await Promise.all([
          saleContractRO.contributionWei(account),
          saleContractRO.entitlementTokens(account),
          tokenContractRO.balanceOf(account),
        ]);

      return {
        contributionWei,
        entitlementTokens,
        tokenBalance,
        tokenSymbol: symbol,
        tokenDecimals: decimals,
      } as UserState;
    }
  }

  async function refreshAll() {
    if (!saleContractRO || !tokenContractRO || !provider) return;

    // Guard: only call contracts if we are on Sepolia
    const net = await provider.getNetwork();
    const ok = Number(net.chainId) === CONFIG.chainId;
    setChainOk(ok);

    if (!ok) {
      setSale(null);
      setUser(null);
      return;
    }

    const s = await readSaleState();
    setSale(s);

    const [symbol, decimals] = await Promise.all([
      tokenContractRO.symbol(),
      tokenContractRO.decimals(),
    ]);

    const u = await readUserState(symbol, Number(decimals));
    setUser(u);
  }

  async function refreshLeaderboard() {
    if (!saleContractRO) return;
    setLoadingBoard(true);
    try {
      const filter = saleContractRO.filters.Bought(null, null, null);
      const fromBlock =
        CONFIG.deployedFromBlock === 0n ? 0 : CONFIG.deployedFromBlock;

      const logs = await saleContractRO.queryFilter(filter, fromBlock, "latest");

      const totals = new Map<string, { wei: bigint; tok: bigint }>();
      for (const log of logs) {
        const buyer = (log.args?.buyer as string).toLowerCase();
        const weiAmount = log.args?.weiAmount as bigint;
        const tokenAmount = log.args?.tokenAmount as bigint;

        const prev = totals.get(buyer) ?? { wei: 0n, tok: 0n };
        totals.set(buyer, {
          wei: prev.wei + weiAmount,
          tok: prev.tok + tokenAmount,
        });
      }

      const rows: LeaderRow[] = Array.from(totals.entries()).map(
        ([buyer, v]) => ({
          buyer,
          weiAmount: v.wei,
          tokenAmount: v.tok,
        })
      );

      rows.sort((a, b) =>
        a.weiAmount > b.weiAmount ? -1 : a.weiAmount < b.weiAmount ? 1 : 0
      );
      setLeaderboard(rows.slice(0, 20));
    } finally {
      setLoadingBoard(false);
    }
  }

  async function getSignerContracts() {
    if (!provider) throw new Error("No provider");
    const signer = await provider.getSigner();
    const saleW = new Contract(CONFIG.saleProxyAddress, SALE_ABI, signer);
    const tokenW = new Contract(CONFIG.tokenAddress, ERC20_ABI, signer);
    return { signer, saleW, tokenW };
  }

  async function buy() {
    try {
      setTxStatus("Submitting buy transaction...");
      const { saleW } = await getSignerContracts();

      const value = parseEther(ethToBuy || "0");
      const tx = await saleW.buyTokens({ value });
      setTxStatus("Waiting for confirmation...");
      await tx.wait();
      setTxStatus("Buy confirmed.");
      await refreshAll();
      await refreshLeaderboard();
    } catch (e: any) {
      setTxStatus(e?.shortMessage || e?.message || "Buy failed");
    }
  }

  async function claim() {
    try {
      setTxStatus("Submitting claim transaction...");
      const { saleW } = await getSignerContracts();
      const tx = await saleW.claim();
      setTxStatus("Waiting for confirmation...");
      await tx.wait();
      setTxStatus("Claim confirmed.");
      await refreshAll();
    } catch (e: any) {
      setTxStatus(e?.shortMessage || e?.message || "Claim failed");
    }
  }

  async function refund() {
    try {
      setTxStatus("Submitting refund transaction...");
      const { saleW } = await getSignerContracts();
      const tx = await saleW.refund();
      setTxStatus("Waiting for confirmation...");
      await tx.wait();
      setTxStatus("Refund confirmed.");
      await refreshAll();
    } catch (e: any) {
      setTxStatus(e?.shortMessage || e?.message || "Refund failed");
    }
  }

  async function finalize() {
    try {
      setTxStatus("Submitting finalize transaction...");
      const { saleW } = await getSignerContracts();
      const tx = await saleW.finalize();
      setTxStatus("Waiting for confirmation...");
      await tx.wait();
      setTxStatus("Finalize confirmed.");
      await refreshAll();
    } catch (e: any) {
      setTxStatus(e?.shortMessage || e?.message || "Finalize failed");
    }
  }

  async function withdraw() {
    try {
      setTxStatus("Submitting withdraw transaction...");
      const { saleW } = await getSignerContracts();
      const tx = await saleW.withdraw();
      setTxStatus("Waiting for confirmation...");
      await tx.wait();
      setTxStatus("Withdraw confirmed.");
      await refreshAll();
    } catch (e: any) {
      setTxStatus(e?.shortMessage || e?.message || "Withdraw failed");
    }
  }

  // Admin: start new round (V3)
  async function startNewRound() {
    try {
      setTxStatus("Starting new round...");

      const mins = Math.max(1, Number(roundMinutes || "20"));
      const rate = BigInt(roundRate || "200");
      const softCapWei = parseEther(roundSoftCap || "1");
      const endTime = BigInt(Math.floor(Date.now() / 1000) + mins * 60);

      const { saleW } = await getSignerContracts();

      // startNewRound exists only in V3+
      const tx = await (saleW as any).startNewRound(rate, softCapWei, endTime);
      setTxStatus("Waiting for confirmation...");
      await tx.wait();

      setTxStatus("New round started.");
      await refreshAll();
      await refreshLeaderboard();
    } catch (e: any) {
      setTxStatus(e?.shortMessage || e?.message || "Start round failed");
    }
  }

  const isAdmin = useMemo(() => {
    if (!account || !sale) return false;
    const a = account.toLowerCase();
    return a === sale.owner.toLowerCase() || a === sale.treasury.toLowerCase();
  }, [account, sale]);

  const nowSec = Math.floor(Date.now() / 1000);
  const endSec = sale ? Number(sale.endTime) : 0;
  const secondsLeft = Math.max(0, endSec - nowSec);

  const buyDisabled =
    !account ||
    !chainOk ||
    !sale ||
    secondsLeft === 0 ||
    sale.finalized === true;

  useEffect(() => {
    refreshAll();
    refreshLeaderboard();

    const t = setInterval(() => {
      refreshAll();
    }, 10_000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleContractRO, tokenContractRO]);

  useEffect(() => {
    if (!anyWindow?.ethereum) return;
    const handler = async () => {
      if (!provider) return;
      const net = await provider.getNetwork();
      setChainOk(Number(net.chainId) === CONFIG.chainId);
      await refreshAll();
      await refreshLeaderboard();
    };
    anyWindow.ethereum.on?.("chainChanged", handler);
    anyWindow.ethereum.on?.("accountsChanged", handler);

    return () => {
      anyWindow.ethereum.removeListener?.("chainChanged", handler);
      anyWindow.ethereum.removeListener?.("accountsChanged", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, account]);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">COFUND ICO</h1>
            <p className="mt-1 text-slate-400">
              Buy COFUND with Sepolia ETH. Rate:{" "}
              {sale ? sale.rate.toString() : "?"} COFUND per 1 ETH.
            </p>
            {sale?.currentRound !== undefined && (
              <p className="mt-1 text-slate-500 text-sm">
                Current round: {sale.currentRound.toString()}
              </p>
            )}
          </div>

          <div className="text-right">
            {!account ? (
              <button
                onClick={connect}
                className="rounded bg-white px-4 py-2 text-black hover:opacity-90"
              >
                Connect MetaMask
              </button>
            ) : (
              <div className="space-y-1">
                <div className="text-slate-400">Connected</div>
                <div className="font-mono">{shortAddr(account)}</div>
                <div className={chainOk ? "text-green-400" : "text-red-400"}>
                  {chainOk ? "Sepolia" : "Wrong network"}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded border border-slate-700 p-4">
            <div className="text-slate-400">Total Raised</div>
            <div className="mt-1 text-2xl font-semibold">
              {sale ? formatEther(sale.totalRaised) : "0"} ETH
            </div>
          </div>

          <div className="rounded border border-slate-700 p-4">
            <div className="text-slate-400">Soft Cap</div>
            <div className="mt-1 text-2xl font-semibold">
              {sale ? formatEther(sale.softCapWei) : "0"} ETH
            </div>
          </div>

          <div className="rounded border border-slate-700 p-4">
            <div className="text-slate-400">Time Left</div>
            <div className="mt-1 text-2xl font-semibold">
              {sale ? `${Math.floor(secondsLeft / 60)}m ${secondsLeft % 60}s` : "?"}
            </div>
            {sale && (
              <div className="mt-2 text-slate-400">
                Status:{" "}
                {sale.finalized
                  ? sale.successful
                    ? "Finalized (Successful)"
                    : "Finalized (Failed)"
                  : secondsLeft === 0
                  ? "Ended (Not Finalized)"
                  : "Active"}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded border border-slate-700 p-5">
            <h2 className="text-xl font-semibold">Buy Tokens</h2>
            <p className="mt-1 text-slate-400">Example: 0.05 ETH buys 10 COFUND.</p>

            <div className="mt-4 flex gap-2">
              <input
                value={ethToBuy}
                onChange={(e) => setEthToBuy(e.target.value)}
                className="w-full rounded border border-slate-700 bg-black p-2"
                placeholder="0.05"
              />
              <button
                onClick={buy}
                disabled={buyDisabled}
                className="rounded bg-white px-4 py-2 text-black disabled:opacity-40"
                title={
                  !sale
                    ? "Loading..."
                    : !account
                    ? "Connect MetaMask"
                    : !chainOk
                    ? "Switch to Sepolia"
                    : sale.finalized
                    ? "Sale finalized"
                    : secondsLeft === 0
                    ? "Sale ended"
                    : ""
                }
              >
                Buy
              </button>
            </div>

            <div className="mt-4 text-sm text-slate-400">
              Sale proxy:{" "}
              <span className="font-mono">{shortAddr(CONFIG.saleProxyAddress)}</span>
              <br />
              Token: <span className="font-mono">{shortAddr(CONFIG.tokenAddress)}</span>
            </div>

            {txStatus && (
              <div className="mt-4 rounded border border-slate-700 p-3 text-sm">
                {txStatus}
              </div>
            )}
          </div>

          <div className="rounded border border-slate-700 p-5">
            <h2 className="text-xl font-semibold">Your Account</h2>

            <div className="mt-4 grid gap-3">
              <div className="rounded border border-slate-700 p-3">
                <div className="text-slate-400">Your Contribution</div>
                <div className="mt-1 text-lg font-semibold">
                  {user ? formatEther(user.contributionWei) : "0"} ETH
                </div>
              </div>

              <div className="rounded border border-slate-700 p-3">
                <div className="text-slate-400">Your Entitlement</div>
                <div className="mt-1 text-lg font-semibold">
                  {user ? formatUnits(user.entitlementTokens, user.tokenDecimals) : "0"}{" "}
                  {user ? user.tokenSymbol : ""}
                </div>
              </div>

              <div className="rounded border border-slate-700 p-3">
                <div className="text-slate-400">Token Balance</div>
                <div className="mt-1 text-lg font-semibold">
                  {user ? formatUnits(user.tokenBalance, user.tokenDecimals) : "0"}{" "}
                  {user ? user.tokenSymbol : ""}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={claim}
                disabled={!account || !chainOk}
                className="rounded bg-white px-4 py-2 text-black disabled:opacity-40"
              >
                Claim
              </button>
              <button
                onClick={refund}
                disabled={!account || !chainOk}
                className="rounded border border-slate-700 px-4 py-2 disabled:opacity-40"
              >
                Refund
              </button>
              <button
                onClick={refreshAll}
                className="rounded border border-slate-700 px-4 py-2"
              >
                Refresh
              </button>
            </div>

            {isAdmin && (
              <div className="mt-6 rounded border border-slate-700 p-4">
                <div className="text-slate-300 font-semibold">Admin Panel</div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={finalize}
                    className="rounded bg-white px-4 py-2 text-black"
                  >
                    Finalize
                  </button>
                  <button
                    onClick={withdraw}
                    className="rounded border border-slate-700 px-4 py-2"
                  >
                    Withdraw to Treasury
                  </button>
                </div>

                {/* Start New Round (V3+) */}
                <div className="mt-4 rounded border border-slate-800 p-4">
                  <div className="font-semibold text-slate-300">Start New Round</div>
                  <div className="mt-3 grid gap-3">
                    <label className="text-sm text-slate-400">
                      Duration (minutes)
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-black p-2"
                        value={roundMinutes}
                        onChange={(e) => setRoundMinutes(e.target.value)}
                      />
                    </label>

                    <label className="text-sm text-slate-400">
                      Rate (tokens per 1 ETH)
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-black p-2"
                        value={roundRate}
                        onChange={(e) => setRoundRate(e.target.value)}
                      />
                    </label>

                    <label className="text-sm text-slate-400">
                      Soft Cap (ETH)
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-black p-2"
                        value={roundSoftCap}
                        onChange={(e) => setRoundSoftCap(e.target.value)}
                      />
                    </label>

                    <button
                      onClick={startNewRound}
                      className="rounded bg-white px-4 py-2 text-black"
                      title="Requires Sale V3. Also requires previous round finalized and contract balance = 0."
                    >
                      Start Round
                    </button>

                    <div className="text-xs text-slate-500">
                      V3 rule: previous round must be finalized and contract balance must be 0
                      (withdraw successful round, or refunds must clear balance).
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-sm text-slate-400">
                  Owner: <span className="font-mono">{shortAddr(sale?.owner || "")}</span>
                  <br />
                  Treasury: <span className="font-mono">{shortAddr(sale?.treasury || "")}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-10 rounded border border-slate-700 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Top Funders</h2>
            <button
              onClick={refreshLeaderboard}
              className="rounded border border-slate-700 px-4 py-2"
              disabled={loadingBoard}
            >
              {loadingBoard ? "Loading..." : "Refresh"}
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-2">Rank</th>
                  <th className="py-2">Address</th>
                  <th className="py-2">ETH</th>
                  <th className="py-2">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-400" colSpan={4}>
                      No purchases yet.
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((row, idx) => (
                    <tr key={row.buyer} className="border-t border-slate-800">
                      <td className="py-2">{idx + 1}</td>
                      <td className="py-2 font-mono">{shortAddr(row.buyer)}</td>
                      <td className="py-2">{formatEther(row.weiAmount)}</td>
                      <td className="py-2">{formatUnits(row.tokenAmount, 18)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="mt-3 text-xs text-slate-500">
              Leaderboard is built from Bought events. For faster queries later, set
              CONFIG.deployedFromBlock to your deploy block.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
