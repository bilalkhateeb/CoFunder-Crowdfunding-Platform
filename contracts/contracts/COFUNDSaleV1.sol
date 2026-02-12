// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface ICOFUNDToken {
    function mint(address to, uint256 amount) external;
}

contract COFUNDSaleV1 is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    ICOFUNDToken public token;
    address public treasury;
    uint256 public rate; // tokens per 1 ETH (e.g., 200)
    uint256 public softCapWei;
    uint256 public endTime;
    uint256 public totalRaised;
    bool public finalized;
    bool public successful;

    mapping(address => uint256) public contributionWei;
    mapping(address => uint256) public entitlementTokens;
    mapping(address => bool) public claimedOrRefunded;

    uint256 internal constant PUBLIC_FINALIZE_DELAY = 1 days;

    event Bought(address indexed buyer, uint256 weiAmount, uint256 tokenAmount);
    event Finalized(bool successful);
    event Claimed(address indexed claimer, uint256 tokenAmount);
    event Refunded(address indexed claimer, uint256 weiAmount);
    event Withdrawn(address indexed treasury, uint256 weiAmount);

    function initialize(address token_, address treasury_, uint256 rate_, uint256 softCapWei_, uint256 endTime_) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        require(token_ != address(0), "token_ zero");
        require(treasury_ != address(0), "treasury_ zero");
        require(rate_ > 0, "rate_ zero");
        require(endTime_ > block.timestamp, "endTime must be future");

        token = ICOFUNDToken(token_);
        treasury = treasury_;
        rate = rate_;
        softCapWei = softCapWei_;
        endTime = endTime_;
    }

    receive() external payable {
        buyTokens();
    }

    function buyTokens() public payable virtual {
        require(block.timestamp < endTime, "sale ended");
        require(msg.value > 0, "zero value");

        uint256 tokens = msg.value * rate;

        contributionWei[msg.sender] += msg.value;
        entitlementTokens[msg.sender] += tokens;
        totalRaised += msg.value;

        emit Bought(msg.sender, msg.value, tokens);
    }

    function finalize() external virtual {
        require(!finalized, "already finalized");
        require(block.timestamp >= endTime, "not ended");

        // owner may finalize immediately after endTime
        if (msg.sender != owner()) {
            // public may finalize only after a delay
            require(block.timestamp >= endTime + PUBLIC_FINALIZE_DELAY, "public finalize locked");
        }

        finalized = true;
        successful = (totalRaised >= softCapWei);

        emit Finalized(successful);
    }

    function claim() external virtual nonReentrant {
        require(finalized, "not finalized");
        require(successful, "sale not successful");
        require(!claimedOrRefunded[msg.sender], "already claimed/refunded");

        uint256 amount = entitlementTokens[msg.sender];
        require(amount > 0, "no tokens to claim");

        claimedOrRefunded[msg.sender] = true;
        // mint tokens to buyer
        token.mint(msg.sender, amount);

        emit Claimed(msg.sender, amount);
    }

    function refund() external virtual nonReentrant {
        require(finalized, "not finalized");
        require(!successful, "sale was successful");
        require(!claimedOrRefunded[msg.sender], "already claimed/refunded");

        uint256 amount = contributionWei[msg.sender];
        require(amount > 0, "no contribution");

        claimedOrRefunded[msg.sender] = true;
        // effects done, now interaction
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "refund failed");

        emit Refunded(msg.sender, amount);
    }

    function withdraw() external virtual nonReentrant {
        require(finalized, "not finalized");
        require(successful, "sale not successful");
        require(msg.sender == owner() || msg.sender == treasury, "not authorized");

        uint256 balance = address(this).balance;
        require(balance > 0, "no funds");

        (bool ok, ) = treasury.call{value: balance}("");
        require(ok, "withdraw failed");

        emit Withdrawn(treasury, balance);
    }

    // UUPS authorization
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
