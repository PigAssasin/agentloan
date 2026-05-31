// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./types/DataTypes.sol";
import "./libraries/ReserveLogic.sol";
import "./libraries/ValidationLogic.sol";
import "./PriceOracle.sol";
import "./InterestRateStrategy.sol";

contract LendingPool is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using ReserveLogic for DataTypes.ReserveData;

    uint256 private constant RAY = 1e27;

    PriceOracle          public immutable oracle;
    InterestRateStrategy public immutable rateStrategy;

    address[]                                          public reserveList;
    mapping(address => DataTypes.ReserveData)          public reserves;
    // Scaled balances: actual balance = scaled * currentIndex / RAY
    mapping(address => mapping(address => uint256))    public userScaledSupply; // token → user → scaled
    mapping(address => mapping(address => uint256))    public userScaledBorrow; // token → user → scaled

    // ── Errors ──────────────────────────────────────────────────────────────
    error ReserveAlreadyInitialized(address token);
    error ReserveNotInitialized(address token);
    error InsufficientBalance(uint256 available, uint256 requested);
    error InsufficientLiquidity(uint256 available, uint256 requested);
    error BorrowingNotEnabled(address token);
    error HealthFactorTooLow(uint256 healthFactor);
    error SupplyCapExceeded(uint256 cap, uint256 newTotal);
    error AmountZero();
    error NotLiquidatable(address borrower, uint256 healthFactor);
    error SelfLiquidation();
    error InvalidLiquidationAmount();

    // ── Events ───────────────────────────────────────────────────────────────
    event Deposit(address indexed token, address indexed user, uint256 amount);
    event Withdraw(address indexed token, address indexed user, uint256 amount);
    event Borrow(address indexed token, address indexed user, uint256 amount);
    event Repay(address indexed token, address indexed user, uint256 amount);
    event Liquidated(
        address indexed borrower,
        address indexed liquidator,
        address collateralToken,
        uint256 debtRepaid,
        uint256 collateralSeized
    );
    event ReserveInitialized(address indexed token);

    constructor(address oracle_, address rateStrategy_) Ownable(msg.sender) {
        oracle       = PriceOracle(oracle_);
        rateStrategy = InterestRateStrategy(rateStrategy_);
    }

    // ── Admin ─────────────────────────────────────────────────────────────
    function initReserve(
        address token,
        uint8   decimals_,
        bool    borrowingEnabled,
        uint16  ltv,
        uint16  liquidationThreshold,
        uint16  liquidationBonus,
        uint256 supplyCap
    ) external onlyOwner {
        if (reserves[token].lastUpdateTimestamp != 0) revert ReserveAlreadyInitialized(token);
        DataTypes.ReserveData storage r = reserves[token];
        r.initReserve();
        r.decimals             = decimals_;
        r.borrowingEnabled     = borrowingEnabled;
        r.ltv                  = ltv;
        r.liquidationThreshold = liquidationThreshold;
        r.liquidationBonus     = liquidationBonus;
        r.supplyCap            = supplyCap;
        reserveList.push(token);
        emit ReserveInitialized(token);
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── Deposit ──────────────────────────────────────────────────────────
    function deposit(address token, uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert AmountZero();
        DataTypes.ReserveData storage r = _getReserve(token);

        // Supply cap check uses real units — compute before updating indexes
        if (r.supplyCap > 0) {
            uint256 realSupplyNow = _realTotal(r.totalScaledSupply, r.liquidityIndex);
            if (realSupplyNow + amount > r.supplyCap)
                revert SupplyCapExceeded(r.supplyCap, realSupplyNow + amount);
        }

        r.updateIndexes();

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        uint256 scaled = (amount * RAY) / r.liquidityIndex;
        userScaledSupply[token][msg.sender] += scaled;
        r.totalScaledSupply += scaled;

        _updateRates(token, r);
        emit Deposit(token, msg.sender, amount);
    }

    // ── Withdraw ─────────────────────────────────────────────────────────
    function withdraw(address token, uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert AmountZero();
        DataTypes.ReserveData storage r = _getReserve(token);

        r.updateIndexes();

        uint256 realBalance = _realUserSupply(token, msg.sender, r);
        if (amount > realBalance) revert InsufficientBalance(realBalance, amount);

        // Check available liquidity: pool must hold enough tokens
        uint256 realBorrow = _realTotal(r.totalScaledBorrow, r.borrowIndex);
        uint256 realSupply = _realTotal(r.totalScaledSupply, r.liquidityIndex);
        uint256 liquidity  = realSupply > realBorrow ? realSupply - realBorrow : 0;
        if (amount > liquidity) revert InsufficientLiquidity(liquidity, amount);

        uint256 scaledToRemove = (amount * RAY) / r.liquidityIndex;
        userScaledSupply[token][msg.sender] -= scaledToRemove;
        r.totalScaledSupply -= scaledToRemove;

        // Validate health factor after withdrawal
        (uint256 collUSD, uint256 debtUSD) = _getAccountCollateralAndDebt(msg.sender);
        ValidationLogic.validateHealthFactor(collUSD, debtUSD);

        _updateRates(token, r);

        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdraw(token, msg.sender, amount);
    }

    // ── Borrow ───────────────────────────────────────────────────────────
    function borrow(address token, uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert AmountZero();
        DataTypes.ReserveData storage r = _getReserve(token);
        if (!r.borrowingEnabled) revert BorrowingNotEnabled(token);

        r.updateIndexes();

        // Check available liquidity
        uint256 realBorrow = _realTotal(r.totalScaledBorrow, r.borrowIndex);
        uint256 realSupply = _realTotal(r.totalScaledSupply, r.liquidityIndex);
        uint256 liquidity  = realSupply > realBorrow ? realSupply - realBorrow : 0;
        if (amount > liquidity) revert InsufficientLiquidity(liquidity, amount);

        uint256 scaled = (amount * RAY) / r.borrowIndex;
        userScaledBorrow[token][msg.sender] += scaled;
        r.totalScaledBorrow += scaled;

        // Validate LTV (borrow capacity) post-borrow
        uint256 maxBorrowUSD = _getMaxBorrowUSD(msg.sender);
        uint256 totalDebtUSD = _getTotalDebtUSD(msg.sender);
        if (totalDebtUSD > maxBorrowUSD) revert HealthFactorTooLow(0);

        _updateRates(token, r);
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Borrow(token, msg.sender, amount);
    }

    // ── Repay ────────────────────────────────────────────────────────────
    function repay(address token, uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert AmountZero();
        DataTypes.ReserveData storage r = _getReserve(token);

        r.updateIndexes();

        uint256 realDebt    = _realUserBorrow(token, msg.sender, r);
        uint256 repayAmount = amount > realDebt ? realDebt : amount; // cap at actual debt

        uint256 currentScaled = userScaledBorrow[token][msg.sender];
        uint256 scaledToRemove;

        if (repayAmount >= realDebt) {
            // Full repay: clear all remaining scaled to avoid dust
            scaledToRemove = currentScaled;
        } else {
            scaledToRemove = (repayAmount * RAY) / r.borrowIndex;
            if (scaledToRemove > currentScaled) scaledToRemove = currentScaled;
        }

        userScaledBorrow[token][msg.sender] -= scaledToRemove;
        r.totalScaledBorrow -= scaledToRemove;

        _updateRates(token, r);
        IERC20(token).safeTransferFrom(msg.sender, address(this), repayAmount);
        emit Repay(token, msg.sender, repayAmount);
    }

    // ── Liquidate ────────────────────────────────────────────────────────
    function liquidate(
        address borrower,
        address debtToken,
        address collateralToken,
        uint256 debtAmountToRepay
    ) external nonReentrant whenNotPaused {
        if (msg.sender == borrower) revert SelfLiquidation();
        if (debtAmountToRepay == 0) revert AmountZero();

        (uint256 collUSD, uint256 debtUSD) = _getAccountCollateralAndDebt(borrower);
        uint256 hf = ValidationLogic.calculateHealthFactor(collUSD, debtUSD);
        if (hf >= 1e18) revert NotLiquidatable(borrower, hf);

        DataTypes.ReserveData storage debtRes  = _getReserve(debtToken);
        DataTypes.ReserveData storage collRes  = _getReserve(collateralToken);

        debtRes.updateIndexes();
        collRes.updateIndexes();

        // Close factor: max 50% of real debt per liquidation
        uint256 realDebt = _realUserBorrow(debtToken, borrower, debtRes);
        uint256 maxRepay = realDebt / 2;
        if (maxRepay == 0) maxRepay = realDebt;
        uint256 repayAmount = debtAmountToRepay > maxRepay ? maxRepay : debtAmountToRepay;

        // Calculate collateral to seize with bonus
        uint256 debtPrice    = oracle.getPrice(debtToken);
        uint256 collPrice    = oracle.getPrice(collateralToken);
        uint256 debtValueUSD = _toUSD(repayAmount, debtPrice, debtRes.decimals);

        // collToSeize = debtValue × liquidationBonus / collateralPrice
        uint256 collToSeize = (debtValueUSD * collRes.liquidationBonus * (10 ** collRes.decimals))
                              / (10_000 * collPrice);

        // Cap at borrower's actual real collateral balance
        uint256 borrowerRealColl = _realUserSupply(collateralToken, borrower, collRes);
        if (collToSeize > borrowerRealColl) collToSeize = borrowerRealColl;

        // Liquidator pays debt — reduce scaled borrow
        IERC20(debtToken).safeTransferFrom(msg.sender, address(this), repayAmount);

        uint256 debtScaledToRemove = (repayAmount * RAY) / debtRes.borrowIndex;
        uint256 borrowerDebtScaled = userScaledBorrow[debtToken][borrower];
        if (debtScaledToRemove > borrowerDebtScaled) debtScaledToRemove = borrowerDebtScaled;
        userScaledBorrow[debtToken][borrower] -= debtScaledToRemove;
        debtRes.totalScaledBorrow             -= debtScaledToRemove;

        // Liquidator receives collateral — reduce scaled supply
        uint256 collScaledToRemove = (collToSeize * RAY) / collRes.liquidityIndex;
        uint256 borrowerCollScaled = userScaledSupply[collateralToken][borrower];
        if (collScaledToRemove > borrowerCollScaled) collScaledToRemove = borrowerCollScaled;
        userScaledSupply[collateralToken][borrower] -= collScaledToRemove;
        collRes.totalScaledSupply                   -= collScaledToRemove;
        IERC20(collateralToken).safeTransfer(msg.sender, collToSeize);

        _updateRates(debtToken, debtRes);
        _updateRates(collateralToken, collRes);

        emit Liquidated(borrower, msg.sender, collateralToken, repayAmount, collToSeize);
    }

    // ── Views ─────────────────────────────────────────────────────────────
    function getUserSupplyBalance(address token, address user) external view returns (uint256) {
        DataTypes.ReserveData storage r = reserves[token];
        return _realTotal(userScaledSupply[token][user], r.liquidityIndex);
    }

    function getUserBorrowBalance(address token, address user) external view returns (uint256) {
        DataTypes.ReserveData storage r = reserves[token];
        return _realTotal(userScaledBorrow[token][user], r.borrowIndex);
    }

    function getReserveData(address token) external view returns (DataTypes.ReserveData memory) {
        return reserves[token];
    }

    function getUserAccountData(address user)
        external view returns (DataTypes.UserAccountData memory data)
    {
        for (uint256 i = 0; i < reserveList.length; i++) {
            address token = reserveList[i];
            DataTypes.ReserveData storage r = reserves[token];
            uint256 price = oracle.getPrice(token);

            uint256 supplied = _realTotal(userScaledSupply[token][user], r.liquidityIndex);
            if (supplied > 0) {
                uint256 valueUSD = _toUSD(supplied, price, r.decimals);
                data.totalRawCollateralUSD += valueUSD;
                data.totalCollateralUSD    += (valueUSD * r.liquidationThreshold) / 10_000;
                data.availableBorrowsUSD   += (valueUSD * r.ltv) / 10_000;
            }

            uint256 borrowed = _realTotal(userScaledBorrow[token][user], r.borrowIndex);
            if (borrowed > 0) {
                data.totalDebtUSD += _toUSD(borrowed, price, r.decimals);
            }
        }

        // Subtract existing debt from available borrows
        if (data.availableBorrowsUSD > data.totalDebtUSD) {
            data.availableBorrowsUSD -= data.totalDebtUSD;
        } else {
            data.availableBorrowsUSD = 0;
        }

        data.healthFactor = ValidationLogic.calculateHealthFactor(
            data.totalCollateralUSD,
            data.totalDebtUSD
        );
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    function _realTotal(uint256 scaled, uint256 index) internal pure returns (uint256) {
        if (scaled == 0 || index == 0) return 0;
        return (scaled * index) / RAY;
    }

    function _realUserSupply(address token, address user, DataTypes.ReserveData storage r)
        internal view returns (uint256)
    {
        return _realTotal(userScaledSupply[token][user], r.liquidityIndex);
    }

    function _realUserBorrow(address token, address user, DataTypes.ReserveData storage r)
        internal view returns (uint256)
    {
        return _realTotal(userScaledBorrow[token][user], r.borrowIndex);
    }

    // ── Internal ──────────────────────────────────────────────────────────
    function _getReserve(address token) internal view returns (DataTypes.ReserveData storage) {
        if (reserves[token].lastUpdateTimestamp == 0) revert ReserveNotInitialized(token);
        return reserves[token];
    }

    function _updateRates(address token, DataTypes.ReserveData storage r) internal {
        uint256 realSupply = _realTotal(r.totalScaledSupply, r.liquidityIndex);
        uint256 realBorrow = _realTotal(r.totalScaledBorrow, r.borrowIndex);
        (uint256 borrowRate, uint256 supplyRate) = rateStrategy.calculateRates(realBorrow, realSupply);
        r.currentBorrowRate    = uint128(borrowRate);
        r.currentLiquidityRate = uint128(supplyRate);
    }

    function _getAccountCollateralAndDebt(address user)
        internal view returns (uint256 totalCollUSD, uint256 totalDebtUSD)
    {
        for (uint256 i = 0; i < reserveList.length; i++) {
            address token = reserveList[i];
            DataTypes.ReserveData storage r = reserves[token];
            uint256 price = oracle.getPrice(token);

            uint256 supplied = _realTotal(userScaledSupply[token][user], r.liquidityIndex);
            if (supplied > 0) {
                uint256 valueUSD = _toUSD(supplied, price, r.decimals);
                totalCollUSD += (valueUSD * r.liquidationThreshold) / 10_000;
            }

            uint256 borrowed = _realTotal(userScaledBorrow[token][user], r.borrowIndex);
            if (borrowed > 0) {
                totalDebtUSD += _toUSD(borrowed, price, r.decimals);
            }
        }
    }

    function _getMaxBorrowUSD(address user) internal view returns (uint256 maxUSD) {
        for (uint256 i = 0; i < reserveList.length; i++) {
            address token = reserveList[i];
            DataTypes.ReserveData storage r = reserves[token];
            uint256 supplied = _realTotal(userScaledSupply[token][user], r.liquidityIndex);
            if (supplied == 0) continue;
            uint256 price    = oracle.getPrice(token);
            uint256 valueUSD = _toUSD(supplied, price, r.decimals);
            maxUSD += (valueUSD * r.ltv) / 10_000;
        }
    }

    function _getTotalDebtUSD(address user) internal view returns (uint256 debtUSD) {
        for (uint256 i = 0; i < reserveList.length; i++) {
            address token = reserveList[i];
            DataTypes.ReserveData storage r = reserves[token];
            uint256 borrowed = _realTotal(userScaledBorrow[token][user], r.borrowIndex);
            if (borrowed == 0) continue;
            uint256 price = oracle.getPrice(token);
            debtUSD += _toUSD(borrowed, price, r.decimals);
        }
    }

    // amount (token decimals) × priceWAD (1e18) → USD value in WAD
    function _toUSD(uint256 amount, uint256 priceWAD, uint8 decimals_) internal pure returns (uint256) {
        return (amount * priceWAD) / (10 ** decimals_);
    }
}
