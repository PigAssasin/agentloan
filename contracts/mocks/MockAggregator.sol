// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockAggregator {
    uint8   private immutable _decimals;
    int256  private _answer;
    uint256 private _updatedAt;

    constructor(uint8 decimals_, int256 initialAnswer) {
        _decimals  = decimals_;
        _answer    = initialAnswer;
        _updatedAt = block.timestamp;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function latestRoundData() external view returns (
        uint80  roundId,
        int256  answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80  answeredInRound
    ) {
        // Always return current block.timestamp so testnet prices never go stale
        return (1, _answer, block.timestamp, block.timestamp, 1);
    }

    function setAnswer(int256 answer) external {
        _answer    = answer;
        _updatedAt = block.timestamp;
    }
}
