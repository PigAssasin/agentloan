// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract InterestRateStrategy {
    uint256 private constant RAY = 1e27;

    uint256 public immutable baseRate; // ray/year
    uint256 public immutable slope1;   // ray/year — below kink
    uint256 public immutable kink;     // ray  (e.g. 0.8e27 = 80%)
    uint256 public immutable slope2;   // ray/year — above kink

    constructor(
        uint256 baseRate_,
        uint256 slope1_,
        uint256 kink_,
        uint256 slope2_
    ) {
        baseRate = baseRate_;
        slope1   = slope1_;
        kink     = kink_;
        slope2   = slope2_;
    }

    // Returns (borrowRate, supplyRate) both in RAY per year
    function calculateRates(
        uint256 totalBorrows,
        uint256 totalSupply
    ) external view returns (uint256 borrowRate, uint256 supplyRate) {
        if (totalSupply == 0) {
            return (baseRate, 0);
        }

        uint256 util = (totalBorrows * RAY) / totalSupply;

        if (util <= kink) {
            borrowRate = baseRate + (slope1 * util) / kink;
        } else {
            uint256 excessUtil  = util - kink;
            uint256 excessRange = RAY - kink;
            borrowRate = baseRate + slope1 + (slope2 * excessUtil) / excessRange;
        }

        // Supply rate = borrow rate × utilization (borrowers fund suppliers)
        supplyRate = (borrowRate * util) / RAY;
    }

    function utilizationRate(
        uint256 totalBorrows,
        uint256 totalSupply
    ) external pure returns (uint256) {
        if (totalSupply == 0) return 0;
        return (totalBorrows * RAY) / totalSupply;
    }
}
