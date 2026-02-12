// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// CHANGED: Import V2 instead of V1
import "./COFUNDSaleV2.sol";

// CHANGED: Inherit from COFUNDSaleV2
contract COFUNDSaleV3 is COFUNDSaleV2 {
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

    function startNewRound(uint256 rate_, uint256 softCapWei_, uint256 endTime_) external onlyOwner {
        require(rate_ > 0, "rate_ zero");
        require(softCapWei_ > 0, "softCapWei_ zero");
        require(endTime_ > block.timestamp, "endTime must be future");

        if (currentRound == 0) {
            require(finalized, "V1 not finalized");
        } else {
            require(rounds[currentRound].finalized, "previous round not finalized");
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

    function finalize() public virtual override {
        if (currentRound == 0) {
             super.finalize();
             return;
        }

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

    function claim() public virtual override nonReentrant {
        bool claimedSomething = false;

        if (currentRound != 0) {
            Round storage r = rounds[currentRound];
            if (r.finalized && r.successful && !claimedOrRefundedByRound[currentRound][msg.sender]) {
                uint256 amount = entitlementByRound[currentRound][msg.sender];
                if (amount > 0) {
                    claimedOrRefundedByRound[currentRound][msg.sender] = true;
                    token.mint(msg.sender, amount);
                    emit Claimed(msg.sender, amount);
                    claimedSomething = true;
                }
            }
        }

        if (finalized && successful && !claimedOrRefunded[msg.sender]) {
            uint256 amount = entitlementTokens[msg.sender];
            if (amount > 0) {
                claimedOrRefunded[msg.sender] = true;
                token.mint(msg.sender, amount);
                emit Claimed(msg.sender, amount);
                claimedSomething = true;
            }
        }

        require(claimedSomething, "no tokens to claim");
    }

    function refund() public virtual override nonReentrant {
        bool refundedSomething = false;

        if (currentRound != 0) {
            Round storage r = rounds[currentRound];
            if (r.finalized && !r.successful && !claimedOrRefundedByRound[currentRound][msg.sender]) {
                uint256 amount = contributionByRound[currentRound][msg.sender];
                if (amount > 0) {
                    claimedOrRefundedByRound[currentRound][msg.sender] = true;
                    (bool ok, ) = msg.sender.call{value: amount}("");
                    require(ok, "refund failed");
                    emit Refunded(msg.sender, amount);
                    refundedSomething = true;
                }
            }
        }

        if (finalized && !successful && !claimedOrRefunded[msg.sender]) {
            uint256 amount = contributionWei[msg.sender];
            if (amount > 0) {
                claimedOrRefunded[msg.sender] = true;
                (bool ok, ) = msg.sender.call{value: amount}("");
                require(ok, "refund failed");
                emit Refunded(msg.sender, amount);
                refundedSomething = true;
            }
        }

        require(refundedSomething, "no contribution to refund");
    }

    function withdraw() public virtual override nonReentrant {
        require(msg.sender == owner() || msg.sender == treasury, "not authorized");
        uint256 balance = address(this).balance;
        require(balance > 0, "no funds");

        bool canWithdraw = false;

        if (currentRound == 0) {
            if (finalized && successful) canWithdraw = true;
        } else {
            if (rounds[currentRound].finalized && rounds[currentRound].successful) canWithdraw = true;
        }

        require(canWithdraw, "sale not successful");

        (bool ok, ) = treasury.call{value: balance}("");
        require(ok, "withdraw failed");

        emit Withdrawn(treasury, balance);
    }

    // CHANGED: Override setEndTime from V2
    // We change visibility to 'public' (valid override for external) or keep 'external'
    // Since we don't need internal calls, 'external' is fine.
    function setEndTime(uint256 newEndTime) external override onlyOwner {
        require(newEndTime > block.timestamp, "must be future");

        if (currentRound == 0) {
            // Logic for V1/Legacy (Updates V1 state variable)
            require(!finalized, "already finalized");
            endTime = newEndTime; 
        } else {
            // Logic for V3 Rounds (Updates current round struct)
            require(!rounds[currentRound].finalized, "current round finalized");
            rounds[currentRound].endTime = newEndTime;
        }
    }

    // View functions
    function currentRate() external view returns (uint256) { return rounds[currentRound].rate; }
    function currentSoftCapWei() external view returns (uint256) { return rounds[currentRound].softCapWei; }
    function currentEndTime() external view returns (uint256) { return rounds[currentRound].endTime; }
    function currentTotalRaised() external view returns (uint256) { return rounds[currentRound].totalRaised; }
    function currentFinalized() external view returns (bool) { return rounds[currentRound].finalized; }
    function currentSuccessful() external view returns (bool) { return rounds[currentRound].successful; }
    function currentContributionWei(address user) external view returns (uint256) { return contributionByRound[currentRound][user]; }
    function currentEntitlementTokens(address user) external view returns (uint256) { return entitlementByRound[currentRound][user]; }
    function currentClaimedOrRefunded(address user) external view returns (bool) { return claimedOrRefundedByRound[currentRound][user]; }
}