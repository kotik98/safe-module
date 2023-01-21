import { BigNumber, ethers } from 'ethers'

async function check(){
    const web3Provider = new ethers.providers.StaticJsonRpcProvider('https://polygon-mainnet.g.alchemy.com/v2/6aCuWP8Oxcd-4jvmNYLh-WervViwIeJq')
    const tx = web3Provider.getTransaction('0xca250706cd0066b87a5815471f63818ea07c99e89d273d919c4b804b904f3dda');
    console.log(ethers.utils.hexDataSlice((await tx).data, 4 + 32 * 34 + 16, 4 + 32 * 34 + 16 + 20))
}

check()