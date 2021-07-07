import { Injectable } from '@nestjs/common'
import { Indexer, RawBlock } from '@src/module.indexer/model/_abstract'
import BigNumber from 'bignumber.js'
import { ConflictsIndexerError, NotFoundIndexerError } from '@src/module.indexer/error'
import { PoolPair, PoolPairMapper } from '@src/module.model/poolpair'
import { SmartBuffer } from 'smart-buffer'
import { OP_DEFI_TX, PoolCreatePair, PoolUpdatePair } from '@defichain/jellyfish-transaction/dist/script/defi'
import { toOPCodes } from '@defichain/jellyfish-transaction/dist/script/_buffer'
import { TokenMapper } from '@src/module.model/token'
import { TokenIndexer } from './token'

@Injectable()
export class PoolPairIndexer extends Indexer {
  constructor (
    private readonly mapper: PoolPairMapper,
    private readonly tokenMapper: TokenMapper
  ) {
    super()
  }

  async index (block: RawBlock): Promise<void> {
    for (const txn of block.tx) {
      for (const vout of txn.vout) {
        if (vout.scriptPubKey.asm.startsWith('OP_RETURN 4466547870')) { // 44665478 -> DFTX, 70 -> p -> create poolpair
          const stack: any = toOPCodes(
            SmartBuffer.fromBuffer(Buffer.from(vout.scriptPubKey.hex, 'hex'))
          )

          const data: PoolCreatePair = (stack[1] as OP_DEFI_TX).tx.data

          const pairSymbol = data.pairSymbol !== ''
            ? data.pairSymbol
            : await this.constructPairSymbol(data.tokenA.toString(), data.tokenB.toString())

          const poolId = await this.newPoolId()

          const poolpair = await this.newPoolPair(data, block, pairSymbol, poolId)

          const newToken = TokenIndexer.newToken(block, {
            symbol: pairSymbol,
            name: pairSymbol,
            decimal: 8,
            limit: new BigNumber('0'),
            mintable: false,
            tradeable: true,
            isDAT: true
          }, poolId, `${data.tokenA}-${data.tokenB}`)
          await this.tokenMapper.put(newToken)

          await this.mapper.put(poolpair)
        }

        if (vout.scriptPubKey.asm.startsWith('OP_RETURN 4466547875')) { // 44665478 -> DFTX, 75 -> u -> update poolpair
          const stack: any = toOPCodes(
            SmartBuffer.fromBuffer(Buffer.from(vout.scriptPubKey.hex, 'hex'))
          )

          const data: PoolUpdatePair = (stack[1] as OP_DEFI_TX).tx.data

          // find poolpair by token with data.poolId
          const token = await this.tokenMapper.get(data.poolId.toString())
          if (token === undefined || token.symbolId === undefined) {
            throw new NotFoundIndexerError('index', 'UpdatePoolPair->Token', `${data.poolId}`)
          }

          const poolpair = await this.mapper.get(token.symbolId)
          if (poolpair === undefined) {
            throw new NotFoundIndexerError('index', 'UpdatePoolPair', `${data.poolId}`)
          }
          // TODO(canonbrother): update ownerAddress, customRewards
          poolpair.status = data.status
          poolpair.commission = data.commission

          await this.mapper.put(poolpair)
        }
      }
    }
  }

  async invalidate (block: RawBlock): Promise<void> {
    for (const txn of block.tx) {
      for (const vout of txn.vout) {
        if (vout.scriptPubKey.asm.startsWith('OP_RETURN 4466547870') && // 44665478 -> DFTX, 70 -> p -> create poolpair
          vout.scriptPubKey.asm.startsWith('OP_RETURN 4466547875') // 44665478 -> DFTX, 75 -> u -> update poolpair
        ) {
          const stack: any = toOPCodes(
            SmartBuffer.fromBuffer(Buffer.from(vout.scriptPubKey.hex, 'hex'))
          )

          const data = (stack[1] as OP_DEFI_TX).tx.data

          const poolpair = await this.mapper.getLatest()
          if (poolpair !== undefined && poolpair.symbol === data.symbol) {
            await this.mapper.delete(poolpair.id)
          }
        }
      }
    }
  }

  private async newPoolPair (
    data: PoolCreatePair, block: RawBlock, pairSymbol: string, poolId: string
  ): Promise<PoolPair> {
    // Note(canonbrother): Here can skip tokenB-tokenA checking
    // as createpoolpair block should be definitely confirmed tokenA-tokenB order creation
    // else block won't be generated
    const poolpair = await this.mapper.get(`${data.tokenA}-${data.tokenB}`)
    if (poolpair !== undefined) {
      throw new ConflictsIndexerError('index', 'CreatePoolPair', `${data.tokenA}-${data.tokenB}`)
    }

    return PoolPairIndexer.newPoolPair(block, data, poolId, pairSymbol)
  }

  private async newPoolId (): Promise<string> {
    // Note(canonbrother):
    // 1. poolpair.get is by tokenA-tokenB, poolpair.query is by poolId
    // 2. poolId is kind of tokenId as token includes poolpair
    // 3. compare latestTokenId with latestPoolId
    // 4. if latestTokenId > latestPoolId, poolId = latestTokenId + 1, vice versa
    // 5. check if poolId exists, poolId++ else 0
    const latestToken = await this.tokenMapper.getLatest()
    if (latestToken === undefined) {
      throw new NotFoundIndexerError('index', 'CreatePoolPair->Token', 'getLatest')
    }

    const latestTokenId = Number(latestToken.id)

    const latestPoolPair = await this.mapper.getLatest()
    const latestPoolId = latestPoolPair === undefined ? 0 : Number(latestPoolPair.poolId)

    return latestTokenId > latestPoolId ? (latestTokenId + 1).toString() : (latestPoolId + 1).toString()
  }

  private async constructPairSymbol (tokenAId: string, tokenBId: string): Promise<string> {
    const tokenA = await this.tokenMapper.get(tokenAId)
    if (tokenA === undefined) {
      throw new NotFoundIndexerError('index', 'CreatePoolPair-Token', tokenAId)
    }

    const tokenB = await this.tokenMapper.get(tokenBId)
    if (tokenB === undefined) {
      throw new NotFoundIndexerError('index', 'CreatePoolPair-Token', tokenBId)
    }

    return `${tokenA.symbol}-${tokenB.symbol}`
  }

  static newPoolPair (
    block: RawBlock, data: PoolCreatePair, id: string, pairSymbol: string
  ): PoolPair {
    return {
      // Note(canonbrother): the id design intentionally made, easier for poolswap block get poolpair
      id: `${data.tokenA}-${data.tokenB}`,
      poolId: id,
      block: {
        hash: block.hash,
        height: block.height
      },
      symbol: pairSymbol,
      status: data.status,
      commission: data.commission,
      tokenA: data.tokenA.toString(),
      tokenB: data.tokenB.toString()
    }
  }
}
