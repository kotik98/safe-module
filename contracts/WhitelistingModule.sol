// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "./Enum.sol";

interface GnosisSafe {
    /// @dev Allows a Module to execute a Safe transaction without any further confirmations.
    /// @param to Destination address of module transaction.
    /// @param value Ether value of module transaction.
    /// @param data Data payload of module transaction.
    /// @param operation Operation type of module transaction.
    function execTransactionFromModule(address to, uint256 value, bytes calldata data, Enum.Operation operation)
        external
        returns (bool success);
}

contract WhitelistingModule {
    ///@dev address that this modle will pass transactions to
    address public target;

    address[] public whitelistedAddresses; 
    address[] public whitelistedOperators;

    mapping (address => bool) isWhite;
    mapping (address => bool) isOperator;
    // mapping (address => ContractAllowance) funcs;
    // mapping (string => string) args;

    event TargetSet(address indexed previousTarget, address indexed newTarget);

    constructor(address _target) {
      target = _target;   
    }

    modifier onlyOwner {
      require(msg.sender == target);
      _;
    }

    function setTarget(address _target) external onlyOwner {
        address previousTarget = target;
        target = _target;
        emit TargetSet(previousTarget, _target);
    }

    function addNewAddress(address delegate) external onlyOwner {
        isWhite[delegate] = true;
        whitelistedAddresses.push(delegate);
    }

    function removeAddress(address removable) external onlyOwner {
        isWhite[removable] = false;
        for (uint i = 0; i < whitelistedAddresses.length - 1; i++){
            if(whitelistedAddresses[i] == removable){
                whitelistedAddresses[i] = whitelistedAddresses[whitelistedAddresses.length - 1];
                whitelistedAddresses.pop();
                break;
            }  
        }         
    }

    function addNewOperator(address delegate) external onlyOwner {
        isOperator[delegate] = true;
        whitelistedOperators.push(delegate);
    }

    function removeOperator(address removable) external onlyOwner {
        isOperator[removable] = false;
        for (uint i = 0; i < whitelistedOperators.length - 1; i++){
            if(whitelistedOperators[i] == removable){
                whitelistedOperators[i] = whitelistedOperators[whitelistedOperators.length - 1];
                whitelistedOperators.pop();
                break;
            }  
        }         
    }

    function execTransaction(
        address to,
        uint256 value,
        bytes memory data
    ) public returns (bool success) {
        require(isWhite[to], "The address not found");
        require(isOperator[msg.sender], "Sender not found");
        success = GnosisSafe(target).execTransactionFromModule(
            to,
            value,
            data,
            Enum.Operation.Call
        );
        return success;
    }

    function getWhitelistedContracts() public view returns (address[] memory)
    {
        return whitelistedAddresses;
    }

    function getWhitelistedOperators() public view returns (address[] memory)
    {
        return whitelistedOperators;
    }
}