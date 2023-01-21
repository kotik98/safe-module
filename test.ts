import { BigNumber, ethers } from 'ethers'
import EthersAdapter from '@safe-global/safe-ethers-lib'
import SafeServiceClient from '@safe-global/safe-service-client'
import { SafeTransactionDataPartial } from '@safe-global/safe-core-sdk-types'
import Safe, { SafeFactory, SafeAccountConfig, ContractNetworksConfig, SafeTransactionOptionalProps } from '@safe-global/safe-core-sdk'
require('dotenv').config();
import { Token, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core'
import { AlphaRouter, SwapToRatioStatus } from '@uniswap/smart-order-router'
import abi from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json'
import { Fraction } from '@uniswap/sdk-core'
import { Pool, Position } from '@uniswap/v3-sdk'
import JSBI from 'jsbi'
import hre from "hardhat"
import '@nomiclabs/hardhat-ethers'
import { abi as module_abi } from './artifacts/contracts/WhitelistingModule.sol/WhitelistingModule.json'

const V3_SWAP_ROUTER_ADDRESS = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
const V3_NFT_POS_MANAGER_ADDRESS = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";

// polygon
// const web3Provider = new ethers.providers.StaticJsonRpcProvider('https://polygon-mainnet.g.alchemy.com/v2/6aCuWP8Oxcd-4jvmNYLh-WervViwIeJq')
// const chainId = 137
// const Token0 = new Token(
//   chainId,
//   '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
//   18,
//   'WMATIC',
//   'Wrapped Matic'
// );
// const Token1 = new Token(
//     chainId,
//     '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
//     6,
//     'USDT',
//     'Tether USD'
// );
// const tokenForAAVE = new Token(
//     chainId,
//     '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
//     6,
//     'USDC',
//     'USD Coin'
// );
// const poolAddress = '0x9B08288C3Be4F62bbf8d1C20Ac9C5e6f9467d8B7'

const web3Provider = new ethers.providers.StaticJsonRpcProvider('http://127.0.0.1:8545/')
const chainId = 1
const Token0 = new Token(
    chainId,
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    18,
    'WETH',
    'Wrapped Ether'
);
const Token1 = new Token(
    chainId,
    '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    6,
    'USDT',
    'Tether USD'
);
const poolAddress = '0x4e68Ccd3E89f51C3074ca5072bbAC773960dFa36'

const ERC20ABI = require('./abi/ERC20ABI.json')
const token0Contract = new ethers.Contract(Token0.address, ERC20ABI, web3Provider)
const token1Contract = new ethers.Contract(Token1.address, ERC20ABI, web3Provider)
// const tokenForAAVEContract = new ethers.Contract(tokenForAAVE.address, ERC20ABI, web3Provider)

const router = new AlphaRouter({ chainId: chainId, provider: web3Provider})

const poolContract = new ethers.Contract(poolAddress, abi.abi, web3Provider)

async function getPoolImmutables() {
    const [factory, token0, token1, fee, tickSpacing, maxLiquidityPerTick] = await Promise.all([
        poolContract.factory(),
        poolContract.token0(),
        poolContract.token1(),
        poolContract.fee(),
        poolContract.tickSpacing(),
        poolContract.maxLiquidityPerTick(),
    ])

    return {
        factory,
        token0,
        token1,
        fee,
        tickSpacing,
        maxLiquidityPerTick,
    }
}

async function getPoolState() {
    const liquidity = await poolContract.liquidity();
    const slot = await poolContract.slot0();

    return {
        liquidity,
        sqrtPriceX96: slot[0],
        tick: slot[1],
        observationIndex: slot[2],
        observationCardinality: slot[3],
        observationCardinalityNext: slot[4],
        feeProtocol: slot[5],
        unlocked: slot[6],
    };
}

async function swapAndAdd(width: number, token0Amount: string, token1Amount: string, address: string) {
    token0Amount = Number(token0Amount).toFixed(Token0.decimals)
    token1Amount = Number(token1Amount).toFixed(Token1.decimals)
    const token0Balance = CurrencyAmount.fromRawAmount(Token0, JSBI.BigInt(ethers.utils.parseUnits(String(token0Amount), Token0.decimals)))
    const token1Balance = CurrencyAmount.fromRawAmount(Token1, JSBI.BigInt(ethers.utils.parseUnits(String(token1Amount), Token1.decimals)))

    // const wallet = web3Provider.getSigner(n)
    // const connectedWallet = wallet.connect(web3Provider)

    const [immutables, state] = await Promise.all([getPoolImmutables(), getPoolState()])
    // console.log(immutables)
    // console.log(state)

    const poolExample = new Pool(
        Token0,
        Token1,
        immutables.fee,
        state.sqrtPriceX96.toString(),
        state.liquidity.toString(),
        state.tick,
    )
    // console.log(poolExample)

    const position = new Position({
        pool: poolExample,
        tickLower: state.tick - width * immutables.tickSpacing - ((state.tick - width * immutables.tickSpacing) % immutables.tickSpacing),
        tickUpper: state.tick + width * immutables.tickSpacing + (immutables.tickSpacing - (state.tick + width * immutables.tickSpacing) % immutables.tickSpacing),
        liquidity: 1,
    })
    // console.log(position)

    const routeToRatioResponse = await router.routeToRatio(
        token0Balance,
        token1Balance,
        position,
        {
            maxIterations: 10,
            ratioErrorTolerance: new Fraction(5, 100),
        },
        {
            swapOptions: {
                type: 1,
                recipient: address,
                slippageTolerance: new Percent(4, 100),
                deadline: Math.round(Date.now() / 1000) + 300,
            },
            addLiquidityOptions: {
                recipient: address
            }
        }
    );

    if (routeToRatioResponse.status === SwapToRatioStatus.SUCCESS) {
        const route = routeToRatioResponse.result

        // const transaction = {
        //     data: route.methodParameters?.calldata,
        //     to: V3_SWAP_ROUTER_ADDRESS,
        //     value: BigNumber.from(route.methodParameters?.value),
        //     from: await wallet.getAddress(),
        //     gasPrice: await web3Provider.getGasPrice(),
        //     gasLimit: BigNumber.from('3000000')
        // };
        // return await wallet.sendTransaction(transaction).then(function(transaction) {
        //     return transaction.wait();
        // })

        return route
    }

}

async function getBalance(tokenContract: ethers.Contract, addr: String){
    return await tokenContract.balanceOf(addr)
}

async function approveMax(tokenContract: ethers.Contract, to: String, n: number) {
    const wallet = web3Provider.getSigner(n)
    // const connectedWallet = wallet.connect(web3Provider)

    return await tokenContract.connect(wallet).approve(
        to,
        ethers.constants.MaxUint256,
        {
            gasPrice: await web3Provider.getGasPrice(),
            gasLimit: BigNumber.from('10000000')
        }
    ).then(function(transaction: { wait: () => any; }) {
        return transaction.wait();
    })
}

function priceToTick(price: number) {
    let val_to_log = price * 10 ** (Token1.decimals - Token0.decimals)
    let tick_id = Math.log(val_to_log) / Math.log(1.0001)
    return Math.round(tick_id)
}

async function wrappEth(balance: number, n: number){
    const wallet = web3Provider.getSigner(n)
    // const connectedWallet = wallet.connect(web3Provider)

    const transaction = {
        from: await wallet.getAddress(),
        to: token0Contract.address,
        gasLimit: 100000,
        gasPrice: await web3Provider.getGasPrice(),
        value: ethers.utils.parseUnits(balance.toString(), Token0.decimals)
    }

    return await wallet.sendTransaction(transaction).then(function(transaction: { wait: () => any; }) {
        return transaction.wait();
    })
}

async function safeApproveMax(tokenContract: ethers.Contract, to: String, safeSdk: Safe, safeSdk2: Safe) {
    const ercIface = new ethers.utils.Interface(ERC20ABI)
    const data = ercIface.encodeFunctionData('approve', [ to, ethers.constants.MaxUint256 ])
    const safeTransactionData: SafeTransactionDataPartial = {
        to: tokenContract.address,
        value: '0',
        data: data
    }
    const whitelistTransaction = await safeSdk.createTransaction({ safeTransactionData })
    const signedSafeTransaction = await safeSdk.signTransaction(whitelistTransaction)
    const signedSafeTransaction2 = await safeSdk2.signTransaction(signedSafeTransaction)
    const txResponse = await safeSdk.executeTransaction(signedSafeTransaction2)
    await txResponse.transactionResponse?.wait()
}

async function getGasPrice(url: string){
    return await fetch(url)
        .then(response => response.json())
        .then(json => (BigNumber.from(Math.round(json.standard.maxFee * (10 ** 9)))))
}

async function testt(){

    const safeOwner1 = web3Provider.getSigner(0)
    const safeOwner2 = web3Provider.getSigner(1)
    const ethAdapter = new EthersAdapter({
      ethers,
      signerOrProvider: safeOwner1
    })

    const chainId = await ethAdapter.getChainId()
    const contractNetworks: ContractNetworksConfig = {
      [chainId]: {
        safeMasterCopyAddress: '0x6851d6fdfafd08c0295c392436245e5bc78b0185',
        safeProxyFactoryAddress: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
        multiSendAddress: '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761',
        multiSendCallOnlyAddress: '0x40A2aCCbd92BCA938b02010E17A5b8929b49130D',
        fallbackHandlerAddress: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
        signMessageLibAddress: '0xA65387F16B013cf2Af4605Ad8aA5ec25a2cbA3a2',
        createCallAddress: '0x7cbB62EaA69F79e6873cD1ecB2392971036cFAa4'
      }
    }

    const safeFactory = await SafeFactory.create({ ethAdapter, isL1SafeMasterCopy: true, contractNetworks })

    const owners = [await web3Provider.getSigner(0).getAddress(), await web3Provider.getSigner(1).getAddress()]
    const threshold = 2
    const safeAccountConfig: SafeAccountConfig = {
      owners,
      threshold
    }

    const safeSdk: Safe = await safeFactory.deploySafe({ safeAccountConfig })
    const newSafeAddress = safeSdk.getAddress()
    console.log('deployed safe address: ', newSafeAddress)

    const WhitelistingModule = await hre.ethers.getContractFactory("WhitelistingModule");

    // Start deployment, returning a promise that resolves to a contract object
    const module = await WhitelistingModule.deploy(newSafeAddress); 
    await module.deployed();  
    console.log("Module deployed to address: ", module.address);
    // console.log("Transaction hash: ", contract.deployTransaction.hash)

    const safeTransaction = await safeSdk.createEnableModuleTx(module.address)

    // safeOwner1 signing
    let signedSafeTransaction = await safeSdk.signTransaction(safeTransaction)
    // console.log('1 signer: ', signedSafeTransaction.signatures)

    // safeOwner2 signing
    const ethAdapterOwner2 = new EthersAdapter({ ethers, signerOrProvider: safeOwner2 })
    const safeSdk2 = await safeSdk.connect({ ethAdapter: ethAdapterOwner2, safeAddress: newSafeAddress })
    let signedSafeTransaction2 = await safeSdk2.signTransaction(signedSafeTransaction)
    // console.log('2 signers: ', signedSafeTransaction2.signatures)

    let txResponse = await safeSdk.executeTransaction(signedSafeTransaction2)
    await txResponse.transactionResponse?.wait()

    const iface = new ethers.utils.Interface(module_abi)
    let data = iface.encodeFunctionData('addNewAddress', [ V3_SWAP_ROUTER_ADDRESS ])

    let safeTransactionData: SafeTransactionDataPartial = {
        to: module.address,
        value: '0',
        data: data
    }
    let whitelistTransaction = await safeSdk.createTransaction({ safeTransactionData })
    signedSafeTransaction = await safeSdk.signTransaction(whitelistTransaction)
    signedSafeTransaction2 = await safeSdk2.signTransaction(signedSafeTransaction)
    // console.log('2 signers: ', signedSafeTransaction2.signatures)

    txResponse = await safeSdk.executeTransaction(signedSafeTransaction2)
    await txResponse.transactionResponse?.wait()
    
    // const safeSdk = await Safe.create({ ethAdapter, newSafeAddress })
    // const txServiceUrl = 'https://safe-transaction-mainnet.safe.global'
    // const safeService = new SafeServiceClient({ txServiceUrl, ethAdapter })

    // await approveMax(token0Contract, V3_SWAP_ROUTER_ADDRESS, 0)
    // await approveMax(token1Contract, V3_SWAP_ROUTER_ADDRESS, 0)

    await safeApproveMax(token0Contract, V3_SWAP_ROUTER_ADDRESS, safeSdk, safeSdk2)
    await safeApproveMax(token1Contract, V3_SWAP_ROUTER_ADDRESS, safeSdk, safeSdk2)

    let poolState = await getPoolState()
    let poolImmutables = await getPoolImmutables()
    let currPrice = poolState.sqrtPriceX96 * poolState.sqrtPriceX96 * (10 ** Token0.decimals) / (10 ** Token1.decimals) / 2 ** 192
    let lowerTick = priceToTick(currPrice * ((100 - 5) / 100))
    let upperTick = priceToTick(currPrice * ((100 + 5) / 100))
    let width = Math.round(Math.abs((lowerTick - upperTick) / 2) / poolImmutables.tickSpacing)

    let token0Balance = await getBalance(token0Contract, await safeOwner1.getAddress())
    let token1Balance = await getBalance(token1Contract, await safeOwner1.getAddress())
    console.log('safeOwner1 initial balance: ', token0Balance.toString() / 10 ** Token0.decimals, token1Balance.toString() / 10 ** Token0.decimals)

    await wrappEth(10, 0)

    token0Balance = await getBalance(token0Contract, await safeOwner1.getAddress())
    token1Balance = await getBalance(token1Contract, await safeOwner1.getAddress())
    console.log('safeOwner1 balance after wrapping: ', token0Balance.toString() / 10 ** Token0.decimals, token1Balance.toString() / 10 ** Token0.decimals)

    await token0Contract.connect(safeOwner1).transfer(newSafeAddress, ethers.utils.parseEther('10')).then((transferResult: any) => {
        // console.dir(transferResult)
    })

    token0Balance = await getBalance(token0Contract, await safeOwner1.getAddress())
    token1Balance = await getBalance(token1Contract, await safeOwner1.getAddress())
    console.log('safeOwner1 balance after transfer: ', token0Balance.toString() / 10 ** Token0.decimals, token1Balance.toString() / 10 ** Token0.decimals)
    
    token0Balance = await getBalance(token0Contract, newSafeAddress)
    token1Balance = await getBalance(token1Contract, newSafeAddress)
    console.log('safe balance before: ', token0Balance.toString() / 10 ** Token0.decimals, token1Balance.toString() / 10 ** Token0.decimals)

    const moduleContract = new ethers.Contract(module.address, module_abi, web3Provider)
    console.log(await moduleContract.getWhitelistedContracts())
    console.log(V3_SWAP_ROUTER_ADDRESS)
    
    const route = await swapAndAdd(width, (token0Balance / 10 ** Token0.decimals).toString(), (token1Balance / 10 ** Token1.decimals).toString(), newSafeAddress)
    data = iface.encodeFunctionData('execTransaction', [ V3_SWAP_ROUTER_ADDRESS, BigNumber.from(route?.methodParameters?.value), route?.methodParameters?.calldata])
    
    // safeTransactionData = {
    //     to: module.address,
    //     value: '0',
    //     data: route?.methodParameters?.calldata
    // }
    // let swapTransaction = await safeSdk.createTransaction({ safeTransactionData })
    // // signedSafeTransaction = await safeSdk.signTransaction(swapTransaction)
    // // signedSafeTransaction2 = await safeSdk2.signTransaction(signedSafeTransaction)
    // // console.log('2 signers: ', signedSafeTransaction2.signatures)

    // txResponse = await safeSdk.executeTransaction(swapTransaction)
    // await txResponse.transactionResponse?.wait()

    const transaction = {
        data: data,
        to: module.address,
        value: BigNumber.from(route?.methodParameters?.value),
        // from: await safeOwner1.getAddress(),
        // gasPrice: await web3Provider.getGasPrice(),
        gasLimit: BigNumber.from('1000000')
    };
    await safeOwner1.sendTransaction(transaction).then(function(transaction) {
        console.log(transaction)
    })

    // moduleContract.connect(safeOwner1).execTransaction(V3_SWAP_ROUTER_ADDRESS, BigNumber.from(route?.methodParameters?.value), route?.methodParameters?.calldata)


    // const erc20iface = new ethers.utils.Interface(ERC20ABI)
    // data = erc20iface.encodeFunctionData('transfer', [ await safeOwner2.getAddress(), ethers.utils.parseEther('10') ])
    // const transaction = {
    //     data: data,
    //     to: token0Contract.address,
    //     value: '0',
    //     // from: await safeOwner1.getAddress(),
    //     // gasPrice: await web3Provider.getGasPrice(),
    //     // gasLimit: BigNumber.from('3000000')
    // };
    // await safeOwner1.sendTransaction(transaction).then(function(transaction) {
    //     console.log(transaction)
    // })

    token0Balance = (await getBalance(token0Contract, newSafeAddress)).toString()
    token1Balance = (await getBalance(token1Contract, newSafeAddress)).toString()
    console.log('safe balance after: ', token0Balance.toString() / 10 ** Token0.decimals, token1Balance.toString() / 10 ** Token0.decimals)

    token0Balance = await getBalance(token0Contract, await safeOwner2.getAddress())
    token1Balance = await getBalance(token1Contract, await safeOwner2.getAddress())
    console.log('safeOwner2 balance after transfer: ', token0Balance.toString() / 10 ** Token0.decimals, token1Balance.toString() / 10 ** Token0.decimals)
    
}
testt()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

 async function transaction() {
    const SafeAddress = '0xc1407095B6C4b0Ae6DE2A0C860F3367376557D6C'
    const publicKey1 = '0x8Dc4F8d0F8F4F8C576589D3E870f147B54249851'
    const privateKey1 = '36627807128a97fda2ed00d433a2f715ca187046091b2d84adddd061b9fbbe7c'
    const module = '0xCde84C4B66a808b4E5fCeB388ab0BDf416DdBa24'
    const wallet1 = new ethers.Wallet(privateKey1)
    const connectedWallet1 = wallet1.connect(web3Provider)
    const publicKey2 = '0x6caA6e208fF45801d38CAE9d042B1FDaeDB7bfd4'
    const privateKey2 = '1410769c5633ba267715b2e03eb1f0b531517f2863f2921e6ca9960d1a10ceae'
    const wallet2 = new ethers.Wallet(privateKey2)
    const connectedWallet2 = wallet2.connect(web3Provider)

    let poolState = await getPoolState()
    let poolImmutables = await getPoolImmutables()
    let currPrice = poolState.sqrtPriceX96 * poolState.sqrtPriceX96 * (10 ** Token0.decimals) / (10 ** Token1.decimals) / 2 ** 192
    let lowerTick = priceToTick(currPrice * ((100 - 5) / 100))
    let upperTick = priceToTick(currPrice * ((100 + 5) / 100))

    let token0Balance = await getBalance(token0Contract, SafeAddress)
    let token1Balance = await getBalance(token1Contract, SafeAddress)
    console.log('safe balance before minting v3 pos: ', token0Balance.toString() / 10 ** Token0.decimals, token1Balance.toString() / 10 ** Token0.decimals)

    let width = Math.round(Math.abs((lowerTick - upperTick) / 2) / poolImmutables.tickSpacing)
    const route = await swapAndAdd(width, (token0Balance / 10 ** Token0.decimals).toString(), (token1Balance / 10 ** Token1.decimals).toString(), SafeAddress)
    const iface = new ethers.utils.Interface(module_abi)
    let data = iface.encodeFunctionData('execTransaction', [ V3_SWAP_ROUTER_ADDRESS, BigNumber.from(route?.methodParameters?.value), route?.methodParameters?.calldata])

    const ethAdapter = new EthersAdapter({
        ethers,
        signerOrProvider: connectedWallet1
    })
  
    const safeFactory = await SafeFactory.create({ ethAdapter })

    const safeSdk: Safe = await Safe.create({ ethAdapter: ethAdapter, safeAddress: SafeAddress.toString() })

    // const url = 'https://gasstation-mainnet.matic.network/v2';
    // const gasPrice = await getGasPrice(url);

    // let safeTransactionData: SafeTransactionDataPartial = {
    //     data: data,
    //     to: module,
    //     value: '0',
    // };
    // let whitelistTransaction = await safeSdk.createTransaction({ safeTransactionData })
    // let signedSafeTransaction = await safeSdk.signTransaction(whitelistTransaction)
    // let txResponse = await safeSdk.executeTransaction(signedSafeTransaction)
    // await txResponse.transactionResponse?.wait()

    const transaction = {
        data: data,
        to: module,
        value: route?.methodParameters?.value.toString(),
        // gasPrice: await web3Provider.getGasPrice(),
        gasLimit: BigNumber.from('1000000')
    };
    await connectedWallet1.sendTransaction(transaction).then(function(transaction) {
        console.log(transaction)
    })

    token0Balance = await getBalance(token0Contract, SafeAddress)
    token1Balance = await getBalance(token1Contract, SafeAddress)
    console.log('safe balance after minting v3 pos: ', token0Balance.toString() / 10 ** Token0.decimals, token1Balance.toString() / 10 ** Token0.decimals)


 }
//  transaction()
//   .then(() => process.exit(0))
//   .catch(error => {
//     console.error(error);
//     process.exit(1);
//   });