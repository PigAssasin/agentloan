// SPDX-License-Identifier: MIT
// Test harness only — do not deploy to production
pragma solidity ^0.8.20;

import "../libraries/ValidationLogic.sol";

contract ValidationLogicHarness {
    function calcHealthFactor(
        uint256 collateralUSD,
        uint256 debtUSD
    ) external pure returns (uint256) {
        return ValidationLogic.calculateHealthFactor(collateralUSD, debtUSD);
    }

    function validateHF(
        uint256 collateralUSD,
        uint256 debtUSD
    ) external pure {
        ValidationLogic.validateHealthFactor(collateralUSD, debtUSD);
    }
}
