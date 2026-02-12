// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./COFUNDSaleV1.sol";

contract COFUNDSaleV3 is COFUNDSaleV1 {
    struct Round {
        uint256 rate;
        uint256 softCapWei;
        uint256 endTime;
        uint256 totalRaised;
        bool finalized;
        bool successful;
    }

    uint256 public currentRound;
    mapping(uint256 => Round) public rounds;

    mapping(uint256 => mapping(address => uint256)) public contributionByRound;
    mapping(uint256 => mapping(address => uint256)) public entitlementByRound;
    mapping(uint256 => mapping(address => bool)) public claimedOrRefundedByRound;

    event RoundStarted(uint256 indexed roundId, uint256 rate, uint256 softCapWei, uint256 endTime);

    // Admin starts a new round only when previous is settled
    function startNewRound(uint256 rate_, uint256 softCapWei_, uint256 endTime_) external onlyOwner {
        require(rate_ > 0, "rate_ zero");
        require(softCapWei_ > 0, "softCapWei_ zero");
        require(endTime_ > block.timestamp, "endTime must be future");

        if (currentRound != 0) {
            require(rounds[currentRound].finalized, "previous round not finalized");
            require(address(this).balance == 0, "previous round not settled");
        }

        currentRound += 1;
        rounds[currentRound] = Round({
            rate: rate_,
            softCapWei: softCapWei_,
            endTime: endTime_,
            totalRaised: 0,
            finalized: false,
            successful: false
        });

        emit RoundStarted(currentRound, rate_, softCapWei_, endTime_);
    }

    // Round-aware buy
    function buyTokens() public payable virtual override {
        require(currentRound != 0, "round not started");
        Round storage r = rounds[currentRound];

        require(block.timestamp < r.endTime, "sale ended");
        require(msg.value > 0, "zero value");

        uint256 tokens = msg.value * r.rate;

        contributionByRound[currentRound][msg.sender] += msg.value;
        entitlementByRound[currentRound][msg.sender] += tokens;
        r.totalRaised += msg.value;

        emit Bought(msg.sender, msg.value, tokens);
    }

    // Round-aware finalize
    function finalize() external virtual override {
        require(currentRound != 0, "round not started");
        Round storage r = rounds[currentRound];

        require(!r.finalized, "already finalized");
        require(block.timestamp >= r.endTime, "not ended");

        if (msg.sender != owner()) {
            require(block.timestamp >= r.endTime + PUBLIC_FINALIZE_DELAY, "public finalize locked");
        }

        r.finalized = true;
        r.successful = (r.totalRaised >= r.softCapWei);

        emit Finalized(r.successful);
    }

    // Round-aware claim
    function claim() external virtual override nonReentrant {
        require(currentRound != 0, "round not started");
        Round storage r = rounds[currentRound];

        require(r.finalized, "not finalized");
        require(r.successful, "sale not successful");
        require(!claimedOrRefundedByRound[currentRound][msg.sender], "already claimed/refunded");

        uint256 amount = entitlementByRound[currentRound][msg.sender];
        require(amount > 0, "no tokens to claim");

        claimedOrRefundedByRound[currentRound][msg.sender] = true;
        token.mint(msg.sender, amount);

        emit Claimed(msg.sender, amount);
    }

    // Round-aware refund
    function refund() external virtual override nonReentrant {
        require(currentRound != 0, "round not started");
        Round storage r = rounds[currentRound];

        require(r.finalized, "not finalized");
        require(!r.successful, "sale was successful");
        require(!claimedOrRefundedByRound[currentRound][msg.sender], "already claimed/refunded");

        uint256 amount = contributionByRound[currentRound][msg.sender];
        require(amount > 0, "no contribution");

        claimedOrRefundedByRound[currentRound][msg.sender] = true;

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "refund failed");

        emit Refunded(msg.sender, amount);
    }

    // Round-aware withdraw
    function withdraw() external virtual override nonReentrant {
        require(currentRound != 0, "round not started");
        Round storage r = rounds[currentRound];

        require(r.finalized, "not finalized");
        require(r.successful, "sale not successful");
        require(msg.sender == owner() || msg.sender == treasury, "not authorized");

        uint256 balance = address(this).balance;
        require(balance > 0, "no funds");

        (bool ok, ) = treasury.call{value: balance}("");
        require(ok, "withdraw failed");

        emit Withdrawn(treasury, balance);
    }

    // Helpful view functions for frontend
    function currentRate() external view returns (uint256) {
        return rounds[currentRound].rate;
    }

    function currentSoftCapWei() external view returns (uint256) {
        return rounds[currentRound].softCapWei;
    }

    function currentEndTime() external view returns (uint256) {
        return rounds[currentRound].endTime;
    }

    function currentTotalRaised() external view returns (uint256) {
        return rounds[currentRound].totalRaised;
    }

    function currentFinalized() external view returns (bool) {
        return rounds[currentRound].finalized;
    }

    function currentSuccessful() external view returns (bool) {
        return rounds[currentRound].successful;
    }

    function currentContributionWei(address user) external view returns (uint256) {
        return contributionByRound[currentRound][user];
    }

    function currentEntitlementTokens(address user) external view returns (uint256) {
        return entitlementByRound[currentRound][user];
    }

    function currentClaimedOrRefunded(address user) external view returns (bool) {
        return claimedOrRefundedByRound[currentRound][user];
    }
}
