// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC20 is ERC20, Ownable {
    uint8 private immutable _decimals;

    error MintCapExceeded();

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    // 10,000 units in this token's own decimals
    function mintCap() public view returns (uint256) {
        return 10_000 * (10 ** uint256(_decimals));
    }

    // Anyone can call — capped at 10,000 tokens per call
    function mint(address to, uint256 amount) external {
        if (amount > mintCap()) revert MintCapExceeded();
        _mint(to, amount);
    }

    // Owner only — for seeding the pool with initial liquidity
    function ownerMint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
