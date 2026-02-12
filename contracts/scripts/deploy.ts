// scripts/deploy.ts
import "dotenv/config";
import * as hre from "hardhat";
import { ethers } from "ethers";

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const pk = process.env.SEPOLIA_PRIVATE_KEY;

  if (!rpcUrl) throw new Error("Missing SEPOLIA_RPC_URL in contracts/.env");
  if (!pk) throw new Error("Missing SEPOLIA_PRIVATE_KEY in contracts/.env");

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // allow either with or without 0x
  const privateKey = pk.startsWith("0x") ? pk : `0x${pk}`;
  const deployer = new ethers.Wallet(privateKey, provider);

  console.log("Deploying with:", await deployer.getAddress());

  const TREASURY = "0xd518C3Aa83d7A49559345562Ac1f9f5eA7DE01A4";

  // -----------------------
  // 1) Deploy COFUNDToken
  // -----------------------
  const tokenArt = await hre.artifacts.readArtifact("COFUNDToken");
  const TokenFactory = new ethers.ContractFactory(tokenArt.abi, tokenArt.bytecode, deployer);

  const token = await TokenFactory.deploy("COFUND", "COFUND");
  await token.waitForDeployment();

  const tokenAddress = await token.getAddress();
  console.log("COFUND token deployed to:", tokenAddress);

  // -----------------------
  // 2) Deploy COFUNDSaleV1 implementation
  // -----------------------
  const saleArt = await hre.artifacts.readArtifact("COFUNDSaleV1");
  const SaleImplFactory = new ethers.ContractFactory(saleArt.abi, saleArt.bytecode, deployer);

  const saleImpl = await SaleImplFactory.deploy();
  await saleImpl.waitForDeployment();

  const saleImplAddress = await saleImpl.getAddress();
  console.log("COFUNDSaleV1 implementation deployed to:", saleImplAddress);

  // Sale params
  const rate = 200;
  const softCapWei = ethers.parseEther("1.0");
  const endTime = Math.floor(Date.now() / 1000) + 20 * 60;

  // Encode initializer call
  const initData = SaleImplFactory.interface.encodeFunctionData("initialize", [
    tokenAddress,
    TREASURY,
    rate,
    softCapWei,
    endTime,
  ]);

  // -----------------------
  // 3) Deploy ERC1967Proxy(impl, initData)
  // -----------------------
  const proxyArt = await hre.artifacts.readArtifact("COFUNDProxy");
  const ProxyFactory = new ethers.ContractFactory(proxyArt.abi, proxyArt.bytecode, deployer);

  const proxy = await ProxyFactory.deploy(saleImplAddress, initData);
  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();
  console.log("ERC1967Proxy deployed to (USE THIS IN FRONTEND):", proxyAddress);

  // -----------------------
  // 4) Grant MINTER_ROLE to proxy
  // -----------------------
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));

  const grantTx = await token.grantRole(MINTER_ROLE, proxyAddress);
  await grantTx.wait();

  console.log("Granted MINTER_ROLE to sale proxy:", proxyAddress);

  console.log("Done.");
  console.log("Token:", tokenAddress);
  console.log("Sale Proxy:", proxyAddress);
  console.log("Treasury:", TREASURY);
  console.log("Rate:", rate.toString());
  console.log("SoftCap:", ethers.formatEther(softCapWei), "ETH");
  console.log("EndTime:", endTime);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
