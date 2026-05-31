// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC20 is ERC20, Ownable {
    uint8   private immutable _decimals;
    uint256 public  constant  COOLDOWN = 24 hours;

    mapping(address => uint256) public lastMintTime;

    error MintCapExceeded();
    error CooldownNotExpired(uint256 remainingSeconds);

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

    // Anyone can call — capped at 10,000 tokens, 24h cooldown per wallet
    function mint(address to, uint256 amount) external {
        if (amount > mintCap()) revert MintCapExceeded();
        uint256 last = lastMintTime[msg.sender];
        if (last > 0 && block.timestamp - last < COOLDOWN) {
            revert CooldownNotExpired(COOLDOWN - (block.timestamp - last));
        }
        lastMintTime[msg.sender] = block.timestamp;
        _mint(to, amount);
    }

    // Owner only — for seeding the pool (no cooldown)
    function ownerMint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    // Read remaining cooldown in seconds (0 = can mint now)
    function cooldownRemaining(address user) external view returns (uint256) {
        uint256 last = lastMintTime[user];
        if (last == 0) return 0;
        uint256 elapsed = block.timestamp - last;
        return elapsed >= COOLDOWN ? 0 : COOLDOWN - elapsed;
    }
}
