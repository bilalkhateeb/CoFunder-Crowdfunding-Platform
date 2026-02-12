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

  // Your stable proxy address (frontend NEVER changes this)
  const PROXY = "0xCc4d8af26ee276B0657f7e034C40D42caA166F04";

  // Change this when you want to upgrade
  const IMPL_NAME = "COFUNDSaleV3"; // e.g. "COFUNDSaleV3"

  // Reset sale window to now + 20 minutes
  const NEW_DURATION_SECONDS = 5 * 60;

  console.log("Upgrading with:", await signer.getAddress());
  console.log("Proxy:", PROXY);
  console.log("New impl contract:", IMPL_NAME);

  // 1) Deploy new implementation
  const art = await hre.artifacts.readArtifact(IMPL_NAME);
  const ImplFactory = new ethers.ContractFactory(art.abi, art.bytecode, signer);

  const impl = await ImplFactory.deploy();
  await impl.waitForDeployment();
  const implAddr = await impl.getAddress();
  console.log("New implementation deployed to:", implAddr);

  // 2) Upgrade proxy to new implementation (UUPS)
  const proxy = new ethers.Contract(PROXY, art.abi, signer);

  let tx;
  if (typeof (proxy as any).upgradeTo === "function") {
    tx = await (proxy as any).upgradeTo(implAddr);
  } else if (typeof (proxy as any).upgradeToAndCall === "function") {
    tx = await (proxy as any).upgradeToAndCall(implAddr, "0x");
  } else {
    throw new Error("Proxy ABI has neither upgradeTo nor upgradeToAndCall. Check UUPS setup/ABI.");
  }
  await tx.wait();
  console.log(`Proxy upgraded to ${IMPL_NAME}.`);

  // 3) Reset end time to now + 20 minutes (requires setEndTime in IMPL_NAME)
  const newEndTime = Math.floor(Date.now() / 1000) + NEW_DURATION_SECONDS;

  if (typeof (proxy as any).setEndTime !== "function") {
    throw new Error(
      `${IMPL_NAME} ABI does not include setEndTime(uint256). Add setEndTime to ${IMPL_NAME} (V2+) and recompile.`
    );
  }

  const tx2 = await (proxy as any).setEndTime(newEndTime);
  await tx2.wait();
  console.log("Set endTime to:", newEndTime);

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
