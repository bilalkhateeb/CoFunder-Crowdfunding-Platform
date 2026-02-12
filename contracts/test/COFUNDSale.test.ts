import { expect } from "chai";
import { network } from "hardhat";
import hre from "hardhat";
const { upgrades } = hre;
const { ethers } = await network.connect();

describe("COFUND ICO flow", function () {
  it("success path: buy, finalize, claim, withdraw", async function () {
    const [deployer, buyer1, buyer2, treasury] = await ethers.getSigners();

    // Deploy token
    const Token = await ethers.getContractFactory("COFUNDToken");
    const token = await Token.connect(deployer).deploy("COFUND", "COFUND");
    await token.waitForDeployment();

    // Deploy sale implementation and initialize it (no proxy in unit test)
    const Sale = await ethers.getContractFactory("COFUNDSaleV1");
    const blockNow = await ethers.provider.getBlock('latest');
    const now = blockNow.timestamp;
    const endTime = now + 60; // 1 minute
    const softCap = ethers.parseEther("0.1"); // 0.1 ETH soft cap for test
    const rate = 200;

    const sale = await ethers.deployContract("COFUNDSaleV1");
    await sale.waitForDeployment();
    await sale.initialize(token.getAddress(), treasury.getAddress(), rate, softCap, endTime);

    // grant MINTER_ROLE to sale contract
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    await token.connect(deployer).grantRole(MINTER_ROLE, await sale.getAddress());

    // buyer1 buys 0.05 ETH -> should entitle 10 tokens
    const buyVal = ethers.parseEther("0.05");
    await sale.connect(buyer1).buyTokens({ value: buyVal });

    const ent1 = await sale.entitlementTokens(buyer1.getAddress());
    expect(ent1).to.equal(buyVal * 200n);

    // buyer2 buys 0.05 ETH
    await sale.connect(buyer2).buyTokens({ value: buyVal });

    // fast-forward time past endTime
    await ethers.provider.send("evm_increaseTime", [120]);
    await ethers.provider.send("evm_mine", []);

    // finalize (owner)
    await sale.connect(deployer).finalize();

    // claim by buyer1
    await sale.connect(buyer1).claim();
    const bal1 = await token.balanceOf(buyer1.getAddress());
    expect(bal1).to.equal(ent1);

    // withdraw to treasury by owner
    const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.getAddress());
    await sale.connect(deployer).withdraw();
    const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.getAddress());
    expect(treasuryBalanceAfter).to.be.greaterThan(treasuryBalanceBefore);
  });

  it("failure path: refund when soft cap not met", async function () {
    const [deployer, buyer, treasury] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("COFUNDToken");
    const token = await Token.connect(deployer).deploy("COFUND", "COFUND");
    await token.waitForDeployment();

    const Sale = await ethers.getContractFactory("COFUNDSaleV1");
    const blockNow2 = await ethers.provider.getBlock('latest');
    const now = blockNow2.timestamp;
    const endTime = now + 60; // 1 minute
    const softCap = ethers.parseEther("1.0"); // high soft cap
    const rate = 200;

    const sale = await ethers.deployContract("COFUNDSaleV1");
    await sale.waitForDeployment();
    await sale.initialize(token.getAddress(), treasury.getAddress(), rate, softCap, endTime);

    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    await token.connect(deployer).grantRole(MINTER_ROLE, await sale.getAddress());

    // buyer buys small amount
    const buyVal = ethers.parseEther("0.01");
    await sale.connect(buyer).buyTokens({ value: buyVal });

    // fast-forward
    await ethers.provider.send("evm_increaseTime", [120]);
    await ethers.provider.send("evm_mine", []);

    await sale.connect(deployer).finalize();

    // refund
    const balBefore = await ethers.provider.getBalance(buyer.getAddress());
    const tx = await sale.connect(buyer).refund();
    const receipt = await tx.wait();
    const balAfter = await ethers.provider.getBalance(buyer.getAddress());
    expect(balAfter).to.be.greaterThan(balBefore - 1n); // some gas costs, but should increase
  });
});
