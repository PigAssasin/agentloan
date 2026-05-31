// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (
        uint80  roundId,
        int256  answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80  answeredInRound
    );
}

contract PriceOracle is Ownable {
    uint256 public constant MAX_STALENESS = 3600; // 1 hour

    mapping(address => address) private feeds; // token → Chainlink-compatible feed

    error FeedNotFound(address token);
    error StalePrice(address token, uint256 age);
    error NegativePrice(address token);

    event FeedSet(address indexed token, address indexed feed);

    constructor() Ownable(msg.sender) {}

    function setFeed(address token, address feed) external onlyOwner {
        feeds[token] = feed;
        emit FeedSet(token, feed);
    }

    // Returns price normalized to WAD (1e18) regardless of feed decimals
    function getPrice(address token) external view returns (uint256) {
        address feed = feeds[token];
        if (feed == address(0)) revert FeedNotFound(token);

        (, int256 answer,, uint256 updatedAt,) = IAggregatorV3(feed).latestRoundData();

        uint256 age = block.timestamp - updatedAt;
        if (age > MAX_STALENESS) revert StalePrice(token, age);
        if (answer <= 0) revert NegativePrice(token);

        uint8 feedDecimals = IAggregatorV3(feed).decimals();
        // Normalize to WAD (1e18)
        if (feedDecimals >= 18) {
            return uint256(answer) / (10 ** (feedDecimals - 18));
        } else {
            return uint256(answer) * (10 ** (18 - feedDecimals));
        }
    }

    function getFeed(address token) external view returns (address) {
        return feeds[token];
    }
}
