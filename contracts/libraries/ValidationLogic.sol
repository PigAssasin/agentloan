// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library ValidationLogic {
    uint256 internal constant WAD = 1e18;

    // Only errors actually used by this library (I-4: removed duplicates already in LendingPool)
    error HealthFactorBelowOne(uint256 healthFactor);

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
