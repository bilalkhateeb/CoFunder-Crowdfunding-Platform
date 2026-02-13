// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./COFUNDSaleV3.sol";

contract COFUNDSaleV4 is COFUNDSaleV3 { // FIX: Inherit from V3
    // --- NEW STORAGE ---
    struct RoundMetadata {
        string title;
        string description;
    }

    // Parallel mapping for V4-specific visual metadata
    mapping(uint256 => RoundMetadata) public roundMetadata;

    // --- EVENTS ---
    event RoundStarted(
        uint256 indexed roundId, 
        uint256 rate, 
        uint256 softCapWei, 
        uint256 endTime, 
        string title, 
        string description
    );

    
    //Overrides startNewRound to store visual metadata and emit the enhanced event.
    function startNewRound(
        uint256 rate_, 
        uint256 softCapWei_, 
        uint256 endTime_, 
        string memory title_, 
        string memory description_
    ) external onlyOwner {
        // 1. Call parent V3 logic to handle ID increment and financial stats 
        // This will now work because V4 inherits from V3.
        super.startNewRound(rate_, softCapWei_, endTime_);

        // 2. Store V4-specific string data
        roundMetadata[currentRound] = RoundMetadata(title_, description_);

        // 3. Emit the enhanced RoundStarted event
        emit RoundStarted(currentRound, rate_, softCapWei_, endTime_, title_, description_);
    }

    // --- VIEW FUNCTIONS ---
    
    function currentTitle() external view returns (string memory) {
        return roundMetadata[currentRound].title;
    }

    function currentDescription() external view returns (string memory) {
        return roundMetadata[currentRound].description;
    }

     // Helper to retrieve full round info combining V3 data and V4 metadata.     
    function getRoundInfo(uint256 id) external view returns (
        uint256 rate, uint256 softCap, uint256 endTime, 
        uint256 totalRaised, bool finalized, bool successful,
        string memory title, string memory description
    ) {
        Round storage r = rounds[id]; // Inherited from V3 [cite: 32]
        RoundMetadata storage m = roundMetadata[id];
        return (r.rate, r.softCapWei, r.endTime, r.totalRaised, r.finalized, r.successful, m.title, m.description);
    }
}