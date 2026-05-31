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
        // Pool state — stored as scaled amounts (divide by index to get real value)
        uint256 totalScaledSupply;    // sum of (depositAmount * RAY / liquidityIndex_at_deposit)
        uint256 totalScaledBorrow;    // sum of (borrowAmount  * RAY / borrowIndex_at_borrow)
        uint256 supplyCap;            // 0 = unlimited (in real token units)
    }

    struct UserAccountData {
        uint256 totalCollateralUSD;    // WAD — weighted by liquidation threshold (used for HF)
        uint256 totalRawCollateralUSD; // WAD — actual collateral value (used for display)
        uint256 totalDebtUSD;          // WAD
        uint256 availableBorrowsUSD;   // WAD — max additional borrow capacity
        uint256 healthFactor;          // WAD — type(uint256).max if no debt
    }
}
