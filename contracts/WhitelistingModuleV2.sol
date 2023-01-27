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

contract WhitelistingModuleV2 {
    ///@dev address that this module will pass transactions to
    address public target;

    struct Allowance{
        uint16 offset;
        uint16 dataLength;
        bytes[] args;
    }

    address[] public whitelistedAddresses; 
    address[] public whitelistedOperators;
    mapping (address => bool) isWhite;
    mapping (address => bool) isOperator;
    mapping (address => mapping(bytes => Allowance[])) allowances;

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

    function addNewAllowance(address delegate, bytes memory functionIdentifier, Allowance memory args) external onlyOwner {
        if(!isWhite[delegate]){
            isWhite[delegate] = true;
            whitelistedAddresses.push(delegate);
        }
        allowances[delegate][functionIdentifier].push(args);
    }

    /// @dev be careful, doesn't remove allowances! 
    function removeAllowance(address removable) external onlyOwner {
        require(isWhite[removable], "address not found");
        isWhite[removable] = false;
        for (uint i = 0; i < whitelistedAddresses.length - 1; i++){
            if(whitelistedAddresses[i] == removable){
                whitelistedAddresses[i] = whitelistedAddresses[whitelistedAddresses.length - 1];
                break;
            }  
        } 
        whitelistedAddresses.pop();     
    }

    function addNewOperator(address delegate) external onlyOwner {
        require(!isOperator[delegate], "operator already added");
        isOperator[delegate] = true;
        whitelistedOperators.push(delegate);
    }

    function removeOperator(address removable) external onlyOwner {
        require(isOperator[removable], "operator not found");
        isOperator[removable] = false;
        for (uint i = 0; i < whitelistedOperators.length - 1; i++){
            if(whitelistedOperators[i] == removable){
                whitelistedOperators[i] = whitelistedOperators[whitelistedOperators.length - 1];
                break;
            }  
        } 
        whitelistedOperators.pop();        
    }

    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data
    ) public returns (bool success) {

        require(isWhite[to], "address not found");
        require(isOperator[msg.sender], "operator not found");

        bytes memory functionIdentifier = data[0:4];
        require(allowances[to][functionIdentifier].length > 0, "function not found");

        bool dataLengthFound = false;
        for (uint256 i = 0; i < allowances[to][functionIdentifier].length; i++) {
            if (data.length == allowances[to][functionIdentifier][i].dataLength){
                dataLengthFound = true;
                uint argLength = allowances[to][functionIdentifier][i].args[0].length;
                uint offset = allowances[to][functionIdentifier][i].offset;
                bytes memory argument = data[offset : offset + argLength];

                bool found = false;
                for (uint256 j = 0; j < allowances[to][functionIdentifier][i].args.length; j++) {
                    if (keccak256(allowances[to][functionIdentifier][i].args[j]) == keccak256(argument)){
                        found = true;
                        break;
                    }
                }
                require(found, "invalid argument");
            }
        }
        require(dataLengthFound, "data length missmatch");

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