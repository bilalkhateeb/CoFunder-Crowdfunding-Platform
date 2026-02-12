// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./COFUNDSaleV2.sol";

contract COFUNDSaleV3 is COFUNDSaleV2 {
    struct Round {
        uint256 rate;
        uint256 softCapWei;
        uint256 endTime;
        uint256 totalRaised;
        bool finalized;
        bool successful;
        bool fundsWithdrawn;
    }

    uint256 public currentRound;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => uint256)) public contributionByRound;
    mapping(uint256 => mapping(address => uint256)) public entitlementByRound;
    mapping(uint256 => mapping(address => bool)) public claimedOrRefundedByRound;
    
    bool public v1FundsWithdrawn; 

    event RoundStarted(uint256 indexed roundId, uint256 rate, uint256 softCapWei, uint256 endTime);

    function startNewRound(uint256 rate_, uint256 softCapWei_, uint256 endTime_) external onlyOwner {
        if (currentRound == 0) require(finalized, "V1 not finalized");
        else require(rounds[currentRound].finalized, "prev round not finalized");
        
        currentRound++;
        rounds[currentRound] = Round(rate_, softCapWei_, endTime_, 0, false, false, false);
        emit RoundStarted(currentRound, rate_, softCapWei_, endTime_);
    }

    function buyTokens() public payable virtual override {
        require(currentRound != 0, "no round");
        Round storage r = rounds[currentRound];
        require(block.timestamp < r.endTime && msg.value > 0, "ended or zero");

        uint256 tokens = msg.value * r.rate;
        contributionByRound[currentRound][msg.sender] += msg.value;
        entitlementByRound[currentRound][msg.sender] += tokens;
        r.totalRaised += msg.value;
        emit Bought(msg.sender, msg.value, tokens);
    }

    function finalize() public virtual override {
        if (currentRound == 0) return super.finalize();
        Round storage r = rounds[currentRound];
        require(!r.finalized && block.timestamp >= r.endTime, "not ready");
        if (msg.sender != owner()) require(block.timestamp >= r.endTime + 1 days, "locked");

        r.finalized = true;
        r.successful = (r.totalRaised >= r.softCapWei);
        emit Finalized(r.successful);
    }

    // --- ESCAPE HATCH (Direct Round Access) ---

    function claim() public virtual override nonReentrant {
        // V1 Legacy Claim Only
        require(finalized && successful && !claimedOrRefunded[msg.sender], "nothing to claim");
        uint256 amount = entitlementTokens[msg.sender];
        require(amount > 0, "no tokens");
        claimedOrRefunded[msg.sender] = true;
        token.mint(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function claimRound(uint256 id) external nonReentrant {
        Round storage r = rounds[id];
        require(r.finalized && r.successful, "round not claimable");
        require(!claimedOrRefundedByRound[id][msg.sender], "already claimed");
        uint256 amount = entitlementByRound[id][msg.sender];
        require(amount > 0, "no tokens in round");
        claimedOrRefundedByRound[id][msg.sender] = true;
        token.mint(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function refund() public virtual override nonReentrant {
        // V1 Legacy Refund Only
        require(finalized && !successful && !claimedOrRefunded[msg.sender], "nothing to refund");
        uint256 amount = contributionWei[msg.sender];
        require(amount > 0, "no contribution");
        claimedOrRefunded[msg.sender] = true;
        payable(msg.sender).transfer(amount);
        emit Refunded(msg.sender, amount);
    }

    function refundRound(uint256 id) external nonReentrant {
        Round storage r = rounds[id];
        require(r.finalized && !r.successful, "round not refundable");
        require(!claimedOrRefundedByRound[id][msg.sender], "already refunded");
        uint256 amount = contributionByRound[id][msg.sender];
        require(amount > 0, "no contribution in round");
        claimedOrRefundedByRound[id][msg.sender] = true;
        payable(msg.sender).transfer(amount);
        emit Refunded(msg.sender, amount);
    }

    function withdraw() public virtual override nonReentrant {
        if (currentRound == 0) {
            require(finalized && successful && !v1FundsWithdrawn, "invalid");
            v1FundsWithdrawn = true;
            payable(treasury).transfer(totalRaised);
        } else {
            withdrawRound(currentRound);
        }
    }

    function withdrawRound(uint256 id) public nonReentrant onlyOwner {
        Round storage r = rounds[id];
        require(r.finalized && r.successful && !r.fundsWithdrawn, "invalid");
        r.fundsWithdrawn = true;
        payable(treasury).transfer(r.totalRaised);
    }

    function setEndTime(uint256 t) external override onlyOwner {
        if (currentRound == 0) { require(!finalized, "finalized"); endTime = t; }
        else { require(!rounds[currentRound].finalized, "finalized"); rounds[currentRound].endTime = t; }
    }

    // --- VIEW FUNCTIONS (FIXED: Added missing getters) ---

    function currentRate() external view returns (uint256) { return rounds[currentRound].rate; }
    function currentSoftCapWei() external view returns (uint256) { return rounds[currentRound].softCapWei; } // ADDED
    function currentEndTime() external view returns (uint256) { return rounds[currentRound].endTime; }
    function currentTotalRaised() external view returns (uint256) { return rounds[currentRound].totalRaised; }
    function currentFinalized() external view returns (bool) { return rounds[currentRound].finalized; }
    function currentSuccessful() external view returns (bool) { return rounds[currentRound].successful; }
    
    // User specific getters for current round
    function currentContributionWei(address user) external view returns (uint256) { return contributionByRound[currentRound][user]; } // ADDED
    function currentEntitlementTokens(address user) external view returns (uint256) { return entitlementByRound[currentRound][user]; } // ADDED
    function currentClaimedOrRefunded(address user) external view returns (bool) { return claimedOrRefundedByRound[currentRound][user]; } // ADDED
}