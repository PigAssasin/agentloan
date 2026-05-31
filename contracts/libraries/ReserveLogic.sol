// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../types/DataTypes.sol";

library ReserveLogic {
    uint256 internal constant RAY              = 1e27;
    uint256 internal constant SECONDS_PER_YEAR = 365 days;

    // Linear interest approximation: adequate for per-block accruals
    function calculateLinearInterest(
        uint256 rate,
        uint256 lastUpdateTimestamp
    ) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - lastUpdateTimestamp;
        if (elapsed == 0) return RAY;
        return RAY + (rate * elapsed) / SECONDS_PER_YEAR;
    }

    // Accrue interest into liquidity and borrow indexes
    function updateIndexes(DataTypes.ReserveData storage reserve) internal {
        uint256 elapsed = block.timestamp - reserve.lastUpdateTimestamp;
        if (elapsed == 0) return;

        if (reserve.totalBorrowed > 0 && reserve.currentBorrowRate > 0) {
            uint256 borrowFactor = calculateLinearInterest(
                reserve.currentBorrowRate,
                reserve.lastUpdateTimestamp
            );
            reserve.borrowIndex = uint128(
                (uint256(reserve.borrowIndex) * borrowFactor) / RAY
            );
        }

        if (reserve.totalSupplied > 0 && reserve.currentLiquidityRate > 0) {
            uint256 liquidityFactor = calculateLinearInterest(
                reserve.currentLiquidityRate,
                reserve.lastUpdateTimestamp
            );
            reserve.liquidityIndex = uint128(
                (uint256(reserve.liquidityIndex) * liquidityFactor) / RAY
            );
        }

        reserve.lastUpdateTimestamp = uint40(block.timestamp);
    }

    function initReserve(DataTypes.ReserveData storage reserve) internal {
        reserve.liquidityIndex      = uint128(RAY);
        reserve.borrowIndex         = uint128(RAY);
        reserve.lastUpdateTimestamp = uint40(block.timestamp);
    }
}
