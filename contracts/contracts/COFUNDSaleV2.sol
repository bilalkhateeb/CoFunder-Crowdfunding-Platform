// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./COFUNDSaleV1.sol";

contract COFUNDSaleV2 is COFUNDSaleV1 {
    // Reset endTime to a new timestamp (owner only)
    function setEndTime(uint256 newEndTime) external virtual onlyOwner {
        require(!finalized, "already finalized");
        require(newEndTime > block.timestamp, "must be future");
        endTime = newEndTime;
    }
}
