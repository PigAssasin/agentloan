// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ILendingPoolAgent {
    function depositFor(address onBehalfOf, address token, uint256 amount) external;
    function withdrawFor(address onBehalfOf, address token, uint256 amount, address recipient) external;
    function repayFor(address borrower, address token, uint256 amount) external;
    function authorizeAgent(address agent, bool allowed) external;
    function getUserSupplyBalance(address token, address user) external view returns (uint256);
    function getUserBorrowBalance(address token, address user) external view returns (uint256);
}

/**
 * AgentExecutor v2 — multi-asset executor for Personal Agent.
 *
 * v1 functions kept intact (deployToYield, emergencyProtect, repayFromWallet).
 * v2 adds:
 *   deployTokenToYield:      generic supply for any whitelisted token
 *   withdrawTokenFromYield:  withdraw any token from pool back to user wallet
 *   supportedTokens:         owner-managed whitelist (safety gate)
 */
contract AgentExecutor is Ownable {
    using SafeERC20 for IERC20;

    ILendingPoolAgent public immutable pool;
    IERC20            public immutable xUSDC;

    mapping(address => bool) public authorizedAgents;
    mapping(address => bool) public supportedTokens;   // v2: token whitelist

    event AgentSet(address indexed agent, bool allowed);
    event TokenSupported(address indexed token, bool allowed);
    event YieldDeployed(address indexed user, uint256 amount);
    event TokenYieldDeployed(address indexed user, address indexed token, uint256 amount);
    event TokenYieldWithdrawn(address indexed user, address indexed token, uint256 amount);
    event EmergencyProtected(address indexed user, uint256 repayAmount);

    error NotAgent();
    error UnsupportedToken(address token);
    error InsufficientSupply(uint256 available, uint256 requested);

    modifier onlyAgent() {
        if (!authorizedAgents[msg.sender]) revert NotAgent();
        _;
    }

    modifier onlySupported(address token) {
        if (!supportedTokens[token]) revert UnsupportedToken(token);
        _;
    }

    constructor(address pool_, address xUSDC_) Ownable(msg.sender) {
        pool  = ILendingPoolAgent(pool_);
        xUSDC = IERC20(xUSDC_);
        // xUSDC always supported by default
        supportedTokens[xUSDC_] = true;
    }

    // ── Owner admin ────────────────────────────────────────────────────────

    function setAgent(address agent, bool allowed) external onlyOwner {
        require(agent != address(0), "zero agent");
        authorizedAgents[agent] = allowed;
        emit AgentSet(agent, allowed);
    }

    function setSupportedToken(address token, bool allowed) external onlyOwner {
        require(token != address(0), "zero token");
        supportedTokens[token] = allowed;
        emit TokenSupported(token, allowed);
    }

    // ── v1 functions (unchanged) ───────────────────────────────────────────

    /**
     * Pull xUSDC from user wallet → supply to pool.
     * Kept for backward compatibility — prefer deployTokenToYield.
     */
    function deployToYield(address user, uint256 amount) external onlyAgent {
        xUSDC.safeTransferFrom(user, address(this), amount);
        xUSDC.forceApprove(address(pool), amount);
        pool.depositFor(user, address(xUSDC), amount);
        emit YieldDeployed(user, amount);
    }

    /**
     * Atomic: withdraw xUSDC supply + repay xUSDC debt in 1 tx.
     * Use when xUSDC supply != xUSDC debt (different collateral/debt tokens).
     */
    function emergencyProtect(address user, uint256 repayAmount) external onlyAgent {
        uint256 supplyBal = pool.getUserSupplyBalance(address(xUSDC), user);
        if (repayAmount > supplyBal) revert InsufficientSupply(supplyBal, repayAmount);

        pool.withdrawFor(user, address(xUSDC), repayAmount, address(this));
        xUSDC.forceApprove(address(pool), repayAmount);
        pool.repayFor(user, address(xUSDC), repayAmount);
        emit EmergencyProtected(user, repayAmount);
    }

    /**
     * Pull xUSDC from user wallet → repay debt.
     * Use when xUSDC is both collateral and debt (emergencyProtect would fail).
     */
    function repayFromWallet(address user, uint256 repayAmount) external onlyAgent {
        xUSDC.safeTransferFrom(user, address(this), repayAmount);
        xUSDC.forceApprove(address(pool), repayAmount);
        pool.repayFor(user, address(xUSDC), repayAmount);
        emit EmergencyProtected(user, repayAmount);
    }

    // ── v2 functions (multi-asset) ─────────────────────────────────────────

    /**
     * Pull any whitelisted token from user wallet → supply to pool.
     * Requires: user approved `token` to this contract AND authorized this contract in pool.
     */
    function deployTokenToYield(
        address user,
        address token,
        uint256 amount
    ) external onlyAgent onlySupported(token) {
        IERC20(token).safeTransferFrom(user, address(this), amount);
        IERC20(token).forceApprove(address(pool), amount);
        pool.depositFor(user, token, amount);
        emit TokenYieldDeployed(user, token, amount);
    }

    /**
     * Withdraw any whitelisted token from pool back to user's wallet.
     * Used for rebalancing: pull supplied token → user can redeploy elsewhere.
     * Requires: user authorized this contract in pool.
     */
    function withdrawTokenFromYield(
        address user,
        address token,
        uint256 amount
    ) external onlyAgent onlySupported(token) {
        uint256 supplyBal = pool.getUserSupplyBalance(token, user);
        if (amount > supplyBal) revert InsufficientSupply(supplyBal, amount);
        pool.withdrawFor(user, token, amount, user);
        emit TokenYieldWithdrawn(user, token, amount);
    }
}
