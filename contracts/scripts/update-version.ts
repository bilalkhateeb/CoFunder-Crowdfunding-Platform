import "dotenv/config";
import * as hre from "hardhat";
import { ethers } from "ethers";

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL!;
  const pkRaw = process.env.SEPOLIA_PRIVATE_KEY!;
  if (!rpcUrl || !pkRaw) {
    throw new Error("Missing SEPOLIA_RPC_URL or SEPOLIA_PRIVATE_KEY in .env");
  }

  const pk = pkRaw.startsWith("0x") ? pkRaw : `0x${pkRaw}`;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(pk, provider);

  const PROXY = "0xCc4d8af26ee276B0657f7e034C40D42caA166F04"; // Your Proxy
  const IMPL_NAME = "COFUNDSaleV4";
  const NEW_DURATION_SECONDS = 5 * 60;

  console.log("Upgrading with:", await signer.getAddress());

  // 1) Deploy new implementation
  const art = await hre.artifacts.readArtifact(IMPL_NAME);
  const ImplFactory = new ethers.ContractFactory(art.abi, art.bytecode, signer);
  const impl = await ImplFactory.deploy();
  await impl.waitForDeployment();
  console.log("New implementation deployed to:", await impl.getAddress());

  // 2) Upgrade proxy
  const proxy = new ethers.Contract(PROXY, art.abi, signer);
  console.log("Upgrading proxy...");
  
  // Handle upgradeTo vs upgradeToAndCall
  let tx;
  if (typeof (proxy as any).upgradeTo === "function") {
    tx = await (proxy as any).upgradeTo(await impl.getAddress());
  } else {
    tx = await (proxy as any).upgradeToAndCall(await impl.getAddress(), "0x");
  }
  await tx.wait();
  console.log(`Proxy upgraded to ${IMPL_NAME}.`);

  // 3) MINIMAL FIX: Try to set end time, but ignore error if finalized
  const newEndTime = Math.floor(Date.now() / 1000) + NEW_DURATION_SECONDS;
  
  try {
      console.log(`Attempting to set endTime to ${newEndTime}...`);
      const tx2 = await (proxy as any).setEndTime(newEndTime);
      await tx2.wait();
      console.log("✅ Set endTime success.");
  } catch (e: any) {
      // If it reverts because "current round finalized", we just skip it.
      console.log("⚠️ Could not set endTime (Round likely finalized). Skipping.");
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});