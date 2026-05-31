// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library DataTypes {
    struct ReserveData {
        uint128 liquidityIndex;       // ray — cumulative supply interest
        uint128 borrowIndex;          // ray — cumulative borrow interest
        uint128 currentLiquidityRate; // ray per year
        uint128 currentBorrowRate;    // ray per year
        uint40  lastUpdateTimestamp;
        uint8   decimals;
        bool    borrowingEnabled;
        // Risk params (basis points)
        uint16  ltv;                  // e.g. 7000 = 70%
        uint16  liquidationThreshold; // e.g. 7500 = 75%
        uint16  liquidationBonus;     // e.g. 10500 = +5% above debt value
        // Pool state (in token's own decimals)
        uint256 totalSupplied;
        uint256 totalBorrowed;
        uint256 supplyCap;            // 0 = unlimited
    }

    struct UserAccountData {
        uint256 totalCollateralUSD;      // WAD — weighted by liquidation threshold (for HF)
        uint256 totalRawCollateralUSD;   // WAD — raw collateral value (for display)
        uint256 totalDebtUSD;            // WAD 1e18
        uint256 availableBorrowsUSD;     // WAD 1e18
        uint256 healthFactor;            // WAD 1e18 — type(uint256).max if no debt
        uint256 weightedLtv;             // WAD
        uint256 weightedLiquidationThreshold; // WAD
    }
}
