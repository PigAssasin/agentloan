// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPriceOracle.sol";

/// Simple price oracle for tests — owner sets prices directly
contract MockPriceOracle is IPriceOracle {
    mapping(address => uint256) public prices;

    function setPrice(address token, uint256 priceWAD) external {
        prices[token] = priceWAD;
    }

    function getPrice(address token) external view override returns (uint256) {
        uint256 p = prices[token];
        require(p > 0, "price not set");
        return p;
    }
}
