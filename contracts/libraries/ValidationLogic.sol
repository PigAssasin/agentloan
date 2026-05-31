// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library ValidationLogic {
    uint256 internal constant WAD = 1e18;

    error HealthFactorBelowOne(uint256 healthFactor);
    error AmountZero();
    error InsufficientBalance(uint256 available, uint256 requested);
    error InsufficientLiquidity(uint256 available, uint256 requested);
    error BorrowingNotEnabled(address token);
    error SupplyCapExceeded(uint256 cap, uint256 newTotal);

    function calculateHealthFactor(
        uint256 totalCollateralUSD,
        uint256 totalDebtUSD
    ) internal pure returns (uint256) {
        if (totalDebtUSD == 0) return type(uint256).max;
        return (totalCollateralUSD * WAD) / totalDebtUSD;
    }

    function validateHealthFactor(
        uint256 totalCollateralUSD,
        uint256 totalDebtUSD
    ) internal pure {
        if (totalDebtUSD == 0) return;
        uint256 hf = calculateHealthFactor(totalCollateralUSD, totalDebtUSD);
        if (hf < WAD) revert HealthFactorBelowOne(hf);
    }
}
