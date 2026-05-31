// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MockAggregator is Ownable {
    uint8   private immutable _decimals;
    int256  private _answer;

    constructor(uint8 decimals_, int256 initialAnswer) Ownable(msg.sender) {
        _decimals = decimals_;
        _answer   = initialAnswer;
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
        // Always return block.timestamp — testnet prices never go stale
        return (1, _answer, block.timestamp, block.timestamp, 1);
    }

    // C-3 fix: only owner can update prices
    function setAnswer(int256 answer) external onlyOwner {
        _answer = answer;
    }
}
