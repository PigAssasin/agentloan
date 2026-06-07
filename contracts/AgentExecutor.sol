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
 * AgentExecutor — generic executor contract for all agent types.
 *
 * Authorized agent wallets (VPS) call this contract to:
 *   deployToYield:      pull xUSDC from user → supply into pool → user earns yield
 *   emergencyProtect:   withdraw user's supply + repay user's debt in 1 atomic tx
 *
 * Future agent types (Hunter, Protocol Manager) can add functions here.
 * Owner (deployer) manages which agent wallets are authorized.
 */
contract AgentExecutor is Ownable {
    using SafeERC20 for IERC20;

    ILendingPoolAgent public immutable pool;
    IERC20            public immutable xUSDC;

    mapping(address => bool) public authorizedAgents;

    event AgentSet(address indexed agent, bool allowed);
    event YieldDeployed(address indexed user, uint256 amount);
    event EmergencyProtected(address indexed user, uint256 repayAmount);

    error NotAgent();
    error InsufficientSupply(uint256 available, uint256 requested);

    modifier onlyAgent() {
        if (!authorizedAgents[msg.sender]) revert NotAgent();
        _;
    }

    constructor(address pool_, address xUSDC_) Ownable(msg.sender) {
        pool  = ILendingPoolAgent(pool_);
        xUSDC = IERC20(xUSDC_);
    }

    // Owner adds/removes agent wallets (VPS bot wallets)
    function setAgent(address agent, bool allowed) external onlyOwner {
        require(agent != address(0), "zero agent");
        authorizedAgents[agent] = allowed;
        emit AgentSet(agent, allowed);
    }

    /**
     * Pull xUSDC from user wallet → supply to pool → yield credited to user.
     * Requires: user approved xUSDC to this contract AND authorized this contract in pool.
     */
    function deployToYield(address user, uint256 amount) external onlyAgent {
        // Pull xUSDC from user
        xUSDC.safeTransferFrom(user, address(this), amount);
        // Approve pool to take xUSDC from this contract
        xUSDC.forceApprove(address(pool), amount);
        // Supply — position credited to user
        pool.depositFor(user, address(xUSDC), amount);
        emit YieldDeployed(user, amount);
    }

    /**
     * Atomic: withdraw user's xUSDC supply + repay user's xUSDC debt in 1 tx.
     * Requires: user authorized this contract in pool.
     * No gap between withdraw and repay — prevents liquidation mid-action.
     */
    function emergencyProtect(address user, uint256 repayAmount) external onlyAgent {
        uint256 supplyBal = pool.getUserSupplyBalance(address(xUSDC), user);
        if (repayAmount > supplyBal) revert InsufficientSupply(supplyBal, repayAmount);

        // Step 1: withdraw from user's supply → tokens come to this contract
        pool.withdrawFor(user, address(xUSDC), repayAmount, address(this));

        // Step 2: approve pool + repay user's debt — same tx, no gap
        xUSDC.forceApprove(address(pool), repayAmount);
        pool.repayFor(user, address(xUSDC), repayAmount);

        emit EmergencyProtected(user, repayAmount);
    }
}
